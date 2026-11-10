import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { apiTokens, assetEntries, notes, transactions } from "@db/schema";
import { getDb } from "../queries/connection";
import { hashApiToken } from "../accessRouter";
import { insertTransactionIdempotent, normalizeTransaction, transactionInput } from "../workspaceRouter";
import { isIncomeOnlyCategory } from "@contracts/operationCategories";
import { recordActivity } from "../queries/workspace";

const attempts = new Map<string, { since: number; count: number }>();
const listQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

function limited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now - current.since > 60_000) {
    attempts.set(key, { since: now, count: 1 });
    return false;
  }
  current.count += 1;
  if (attempts.size > 1000) attempts.clear();
  return current.count > 120;
}

async function authenticate(raw: Request) {
  const header = raw.headers.get("authorization");
  if (!header?.startsWith("Bearer top_")) return null;
  const secret = header.slice(7);
  const hash = hashApiToken(secret);
  if (limited(hash)) return "limited" as const;
  const [token] = await getDb().select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).limit(1);
  if (!token || token.revokedAt || (token.expiresAt && token.expiresAt.getTime() <= Date.now())) return null;
  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60_000) {
    await getDb().update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, token.id));
  }
  return token;
}

export function registerPublicApi(app: Hono<{ Bindings: HttpBindings; Variables: { apiToken: typeof apiTokens.$inferSelect } }>) {
  app.use("/api/v1/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    const token = await authenticate(c.req.raw);
    if (token === "limited") return c.json({ error: "Слишком много запросов" }, 429, { "Retry-After": "60" });
    if (!token) return c.json({ error: "Нужен действительный Bearer-токен" }, 401);
    c.set("apiToken", token);
    await next();
  });

  app.get("/api/v1/transactions", async (c) => {
    const token = c.get("apiToken");
    const parsed = listQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "Некорректные параметры: from/to в формате ГГГГ-ММ-ДД, limit от 1 до 500" }, 400);
    const conditions = [eq(transactions.userId, token.userId)];
    if (parsed.data.from) conditions.push(gte(transactions.operationDate, parsed.data.from));
    if (parsed.data.to) conditions.push(lte(transactions.operationDate, parsed.data.to));
    const items = await getDb().select().from(transactions).where(and(...conditions))
      .orderBy(desc(transactions.operationDate), desc(transactions.id)).limit(parsed.data.limit);
    return c.json({ items, count: items.length });
  });

  app.post("/api/v1/transactions", async (c) => {
    const token = c.get("apiToken");
    if (token.scope !== "write") return c.json({ error: "Этот токен доступен только для чтения" }, 403);
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: "Ожидался JSON" }, 400); }
    const parsed = transactionInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "Проверьте поля операции", details: parsed.error.flatten().fieldErrors }, 400);
    const values = normalizeTransaction(parsed.data);
    if (values.type === "Расход" && isIncomeOnlyCategory(values.category)) return c.json({ error: "Категория предназначена только для дохода" }, 400);
    const result = await insertTransactionIdempotent(token.userId, values);
    if (!result.created) return c.json({ item: { id: result.id }, idempotent: true });
    await recordActivity(token.userId, "create", "transaction", result.id, "Операция добавлена через локальный API");
    return c.json({ item: { id: result.id } }, 201);
  });

  app.get("/api/v1/assets", async (c) => {
    const token = c.get("apiToken");
    const items = await getDb().select().from(assetEntries).where(eq(assetEntries.userId, token.userId));
    return c.json({ items, count: items.length });
  });

  app.get("/api/v1/notes", async (c) => {
    const token = c.get("apiToken");
    const items = await getDb().select({ id: notes.id, parentId: notes.parentId, kind: notes.kind, title: notes.title, content: notes.content, tags: notes.tags, relatedLinks: notes.relatedLinks, updatedAt: notes.updatedAt })
      .from(notes).where(eq(notes.userId, token.userId)).limit(500);
    return c.json({ items, count: items.length });
  });
}
