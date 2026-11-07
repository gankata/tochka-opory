import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { assetEntries } from "@db/schema";
import { adminQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import { createSnapshot, recordActivity } from "./queries/workspace";

export const assetInput = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["asset", "liability"]),
  category: z.enum(["Наличные и счета", "Вклады", "Инвестиции", "Имущество", "Долг", "Другое"]),
  valueRub: z.number().finite().nonnegative().max(1_000_000_000_000),
  note: z.string().max(5000).nullish(),
});

export const assetsRouter = createRouter({
  list: adminQuery.query(async ({ ctx }) => getDb().select().from(assetEntries)
    .where(eq(assetEntries.userId, ctx.user.id)).orderBy(asc(assetEntries.kind), asc(assetEntries.id))),
  create: adminQuery.input(assetInput).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb().insert(assetEntries).values({ ...input, userId: ctx.user.id }).returning({ id: assetEntries.id });
    await recordActivity(ctx.user.id, "create", "asset", id, `Сохранена позиция «${input.name}»`);
    return { id };
  }),
  update: adminQuery.input(assetInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    const result = await getDb().update(assetEntries).set(values)
      .where(and(eq(assetEntries.id, id), eq(assetEntries.userId, ctx.user.id))).returning({ id: assetEntries.id });
    if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Позиция не найдена" });
    await recordActivity(ctx.user.id, "update", "asset", id, "Оценка капитала обновлена");
    return { ok: true };
  }),
  delete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await createSnapshot(ctx.user.id, "Перед удалением позиции капитала", "auto");
    const result = await getDb().delete(assetEntries)
      .where(and(eq(assetEntries.id, input.id), eq(assetEntries.userId, ctx.user.id))).returning({ id: assetEntries.id });
    if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Позиция не найдена" });
    return { ok: true };
  }),
});
