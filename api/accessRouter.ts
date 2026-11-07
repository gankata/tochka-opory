import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { apiTokens } from "@db/schema";
import { adminQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import { recordActivity } from "./queries/workspace";

export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const accessRouter = createRouter({
  tokens: adminQuery.query(async ({ ctx }) => getDb().select({
    id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, scope: apiTokens.scope,
    lastUsedAt: apiTokens.lastUsedAt, expiresAt: apiTokens.expiresAt, revokedAt: apiTokens.revokedAt, createdAt: apiTokens.createdAt,
  }).from(apiTokens).where(and(eq(apiTokens.userId, ctx.user.id), isNull(apiTokens.revokedAt))).orderBy(desc(apiTokens.createdAt))),
  createToken: adminQuery.input(z.object({
    name: z.string().trim().min(1).max(100), scope: z.enum(["read", "write"]), expiresDays: z.number().int().min(1).max(365).nullable().default(null),
  })).mutation(async ({ ctx, input }) => {
    const secret = `top_${randomBytes(32).toString("base64url")}`;
    const prefix = secret.slice(0, 11);
    const [{ id }] = await getDb().insert(apiTokens).values({
      userId: ctx.user.id, name: input.name, prefix, tokenHash: hashApiToken(secret), scope: input.scope,
      expiresAt: input.expiresDays ? new Date(Date.now() + input.expiresDays * 86400000) : null,
    }).returning({ id: apiTokens.id });
    await recordActivity(ctx.user.id, "create", "apiToken", id, `Создан токен API «${input.name}» с правами ${input.scope}`);
    return { id, token: secret };
  }),
  revokeToken: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const result = await getDb().update(apiTokens).set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, input.id), eq(apiTokens.userId, ctx.user.id), isNull(apiTokens.revokedAt))).returning({ id: apiTokens.id });
    if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Активный токен не найден" });
    await recordActivity(ctx.user.id, "revoke", "apiToken", input.id, "Токен API отозван");
    return { ok: true };
  }),
});
