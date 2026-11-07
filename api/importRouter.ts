import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { currencyCodes } from "@contracts/currencies";
import { isIncomeOnlyCategory } from "@contracts/operationCategories";
import { importBatches, transactionRules, transactions } from "@db/schema";
import { adminQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import { createSnapshot, recordActivity } from "./queries/workspace";
import { normalizeTransaction } from "./workspaceRouter";
import { applyCategoryRules, transactionFingerprint } from "./lib/transaction-import";

const rowInput = z.object({
  operationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["Доход", "Расход", "Обмен"]),
  category: z.string().trim().min(1).max(160),
  amountRub: z.number().finite(),
  currency: z.enum(currencyCodes),
  originalAmount: z.number().finite(),
  exchangeRate: z.number().positive().finite(),
  note: z.string().max(5000).nullable(),
  source: z.string().max(120).nullable(),
  externalId: z.string().max(190).nullish(),
});

const ruleInput = z.object({
  name: z.string().trim().min(1).max(160),
  matchField: z.enum(["source", "note", "category", "any"]),
  pattern: z.string().trim().min(1).max(190),
  operationType: z.enum(["Доход", "Расход", "Обмен", "Любой"]),
  category: z.string().trim().min(1).max(160),
  priority: z.number().int().min(0).max(10000),
  enabled: z.boolean(),
});

async function userRules(userId: number) {
  return getDb().select().from(transactionRules).where(eq(transactionRules.userId, userId))
    .orderBy(asc(transactionRules.priority), asc(transactionRules.id));
}

export const importRouter = createRouter({
  rules: adminQuery.query(async ({ ctx }) => userRules(ctx.user.id)),
  batches: adminQuery.query(async ({ ctx }) => getDb().select().from(importBatches)
    .where(eq(importBatches.userId, ctx.user.id)).orderBy(desc(importBatches.createdAt)).limit(50)),

  ruleCreate: adminQuery.input(ruleInput).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb().insert(transactionRules).values({ ...input, userId: ctx.user.id }).returning({ id: transactionRules.id });
    await recordActivity(ctx.user.id, "create", "transactionRule", id, `Добавлено правило «${input.name}»`);
    return { id };
  }),
  ruleUpdate: adminQuery.input(ruleInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    await getDb().update(transactionRules).set(values).where(and(eq(transactionRules.id, id), eq(transactionRules.userId, ctx.user.id)));
    return { ok: true };
  }),
  ruleDelete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(transactionRules).where(and(eq(transactionRules.id, input.id), eq(transactionRules.userId, ctx.user.id)));
    return { ok: true };
  }),

  bulkCategorize: adminQuery.input(z.object({
    ids: z.array(z.number().int().positive()).min(1).max(5000),
    category: z.string().trim().min(1).max(160),
  })).mutation(async ({ ctx, input }) => {
    if (isIncomeOnlyCategory(input.category)) throw new TRPCError({ code: "BAD_REQUEST", message: "Эта категория предназначена только для доходов" });
    const selected = await getDb().select().from(transactions).where(eq(transactions.userId, ctx.user.id));
    const ids = new Set(input.ids);
    const targets = selected.filter((row) => ids.has(row.id));
    if (!targets.length) return { updated: 0 };
    if (targets.some((row) => row.type === "Обмен")) throw new TRPCError({ code: "BAD_REQUEST", message: "Для массового изменения исключите операции обмена" });
    await createSnapshot(ctx.user.id, "Перед массовым изменением категорий", "auto");
    const result = await getDb().update(transactions).set({ category: input.category, updatedAt: new Date() })
      .where(and(eq(transactions.userId, ctx.user.id), inArray(transactions.id, targets.map((row) => row.id)))).returning({ id: transactions.id });
    await recordActivity(ctx.user.id, "update", "transactions", null, `Массово изменено категорий: ${result.length}`);
    return { updated: result.length };
  }),

  bulkDelete: adminQuery.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(5000) })).mutation(async ({ ctx, input }) => {
    await createSnapshot(ctx.user.id, "Перед массовым удалением операций", "auto");
    const result = await getDb().delete(transactions)
      .where(and(eq(transactions.userId, ctx.user.id), inArray(transactions.id, input.ids))).returning({ id: transactions.id });
    await recordActivity(ctx.user.id, "delete", "transactions", null, `Массово удалено операций: ${result.length}`);
    return { deleted: result.length };
  }),

  importTransactions: adminQuery.input(z.object({
    name: z.string().trim().min(1).max(190),
    format: z.enum(["csv", "ofx"]),
    rows: z.array(rowInput).min(1).max(5000),
  })).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const [rules, existing] = await Promise.all([
      userRules(userId),
      getDb().select().from(transactions).where(eq(transactions.userId, userId)),
    ]);
    const externalIds = new Set(existing.map((row) => row.externalId).filter(Boolean));
    const fingerprints = new Set(existing.map((row) => transactionFingerprint(row)));
    const accepted: Array<ReturnType<typeof normalizeTransaction> & { externalId?: string | null }> = [];
    let duplicateCount = 0;

    for (const source of input.rows) {
      if (source.externalId && externalIds.has(source.externalId)) { duplicateCount += 1; continue; }
      const ruled = applyCategoryRules(source, rules);
      const values = normalizeTransaction({ ...ruled, amountUsd: null });
      if (values.type === "Расход" && isIncomeOnlyCategory(values.category)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Категория «${values.category}» предназначена для дохода` });
      }
      const fingerprint = transactionFingerprint(values);
      if (fingerprints.has(fingerprint)) { duplicateCount += 1; continue; }
      fingerprints.add(fingerprint);
      if (source.externalId) externalIds.add(source.externalId);
      accepted.push({ ...values, externalId: source.externalId ?? null });
    }
    if (!accepted.length) return { id: null, imported: 0, duplicates: duplicateCount };

    await createSnapshot(userId, `Перед импортом ${input.name}`, "import");
    const batchId = await getDb().transaction(async (tx) => {
      const [{ id }] = await tx.insert(importBatches).values({
        userId, name: input.name, format: input.format, rowCount: accepted.length, duplicateCount,
      }).returning({ id: importBatches.id });
      await tx.insert(transactions).values(accepted.map((row) => ({ ...row, userId, importBatchId: id })));
      return id;
    });
    await recordActivity(userId, "import", "transactions", batchId, `Импортировано ${accepted.length} операций; пропущено дублей: ${duplicateCount}`);
    return { id: batchId, imported: accepted.length, duplicates: duplicateCount };
  }),

  rollback: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const [batch] = await getDb().select().from(importBatches)
      .where(and(eq(importBatches.id, input.id), eq(importBatches.userId, userId))).limit(1);
    if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Пакет импорта не найден" });
    if (batch.status !== "active") return { ok: true };
    await createSnapshot(userId, `Перед откатом импорта ${batch.name}`, "auto");
    await getDb().transaction(async (tx) => {
      await tx.delete(transactions).where(and(eq(transactions.userId, userId), eq(transactions.importBatchId, batch.id)));
      await tx.update(importBatches).set({ status: "rolledBack", rolledBackAt: new Date() })
        .where(and(eq(importBatches.id, batch.id), eq(importBatches.userId, userId)));
    });
    await recordActivity(userId, "rollback", "transactions", batch.id, `Отменён импорт «${batch.name}»`);
    return { ok: true };
  }),
});
