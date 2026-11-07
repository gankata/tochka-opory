import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { isIncomeOnlyCategory, normalizeOperationCategory } from "@contracts/operationCategories";
import { currencyCodes, isCurrencyCode } from "@contracts/currencies";
import { noteKinds, wishlistPriorities, type NoteExport } from "@contracts/notes";
import { adminQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import {
  appSettings, assetEntries, backups, envelopes, goals, importBatches, moodEntries, moodOptions, noteAssets, notes, payments,
  reconciliations, reminders, transactionRules, transactions,
} from "@db/schema";
import {
  createSnapshot, ensureWorkspace, fetchWorkspace, fetchWorkspaceSnapshot, listSnapshots, recentActivity,
  recordActivity, type WorkspaceSnapshot,
} from "./queries/workspace";
import { createFileBackup, fileBackupHealth, listFileBackups, restoreFileBackup } from "./lib/file-backups";
import { dateString } from "./lib/validation";
const nullableAmount = z.number().finite().nonnegative().max(1_000_000_000_000).nullish();
const currencyCode = z.enum(currencyCodes);
const currencyKey = z.string().refine(isCurrencyCode, "Неподдерживаемая валюта");
const currencyRates = z.record(
  currencyKey,
  z.number().finite().positive().max(1_000_000_000),
);
const currencyBalances = z.record(
  currencyKey,
  z.number().finite().nonnegative().max(1_000_000_000_000),
);
export const transactionInput = z.object({
  operationDate: dateString,
  type: z.enum(["Доход", "Расход", "Обмен"]),
  category: z.string().trim().min(1).max(160),
  amountRub: z.number().finite().max(1_000_000_000_000),
  amountUsd: z.number().finite().max(1_000_000_000_000).nullish(),
  currency: currencyCode.optional(),
  originalAmount: z.number().finite().max(1_000_000_000_000).nullish(),
  exchangeRate: z.number().finite().positive().max(1_000_000_000).nullish(),
  note: z.string().max(5000).nullish(),
  source: z.string().max(120).nullish(),
  clientId: z.string().uuid().nullish(),
});
const paymentInput = z.object({
  name: z.string().trim().min(1).max(160),
  amount: nullableAmount,
  minAmount: nullableAmount,
  maxAmount: nullableAmount,
  intervalMonths: z.number().int().min(1).max(120),
  required: z.boolean(),
  sourceType: z.enum(["Данные пользователя", "Диапазон пользователя", "Оценка"]),
  dayOfMonth: z.number().int().min(1).max(31).nullish(),
  nextDate: dateString.nullish(),
  paidCycle: z.boolean(),
  note: z.string().max(5000).nullish(),
});
const envelopeInput = z.object({
  name: z.string().trim().min(1).max(160),
  required: z.boolean(),
  estimatedAmount: nullableAmount,
  monthlyLimit: nullableAmount,
  sortOrder: z.number().int().min(0).max(10000),
  note: z.string().max(5000).nullish(),
});
const goalInput = z.object({
  name: z.string().trim().min(1).max(160),
  targetAmount: z.number().finite().positive().max(1_000_000_000_000),
  savedAmount: z.number().finite().nonnegative().max(1_000_000_000_000),
  targetDate: dateString.nullish(),
});
const moodInput = z.object({
  entryDate: dateString,
  timeOfDay: z.string().trim().min(1).max(40),
  mood: z.number().int().min(1).max(10),
  emotion: z.string().trim().min(1).max(120),
  intensity: z.number().int().min(1).max(10),
  topic: z.string().trim().min(1).max(120),
  situation: z.string().max(10000).nullish(),
  thoughts: z.string().max(10000).nullish(),
  body: z.string().max(10000).nullish(),
  coping: z.string().max(10000).nullish(),
  energy: z.number().int().min(1).max(10).nullish(),
  sleepHours: z.number().min(0).max(24).nullish(),
  therapyNotes: z.string().max(10000).nullish(),
});
const wishlistItemInput = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(500),
  url: z.string().trim().max(2000).url().nullable().default(null),
  price: z.number().finite().nonnegative().max(1_000_000_000_000).nullable().default(null),
  priority: z.enum(wishlistPriorities),
  done: z.boolean(),
  note: z.string().max(5000).nullable().default(null),
});
const noteDocumentInput = z.record(z.string(), z.unknown()).nullable().optional()
  .refine((value) => value == null || JSON.stringify(value).length <= 2_000_000, "Документ заметки слишком большой");
const noteInput = z.object({
  parentId: z.number().int().positive().nullish(),
  kind: z.enum(noteKinds),
  title: z.string().trim().min(1).max(300),
  content: z.string().max(200_000),
  document: noteDocumentInput,
  items: z.array(wishlistItemInput).max(1000),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  relatedLinks: z.array(z.object({ id: z.string().max(100), section: z.enum(["operations", "analytics", "plan", "calendar", "mood"]), targetId: z.number().int().positive().nullish(), label: z.string().trim().min(1).max(160) })).max(100).default([]),
  sortOrder: z.number().int().min(0).max(1_000_000),
});
const noteAssetInput = z.object({
  noteId: z.number().int().positive(),
  name: z.string().trim().min(1).max(240),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  data: z.string().min(4).max(12_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
const settingsInput = z.object({
  startDate: dateString,
  cashRub: z.number().finite().nonnegative(),
  cardRub: z.number().finite().nonnegative(),
  cashUsd: z.number().finite().nonnegative(),
  usdRate: z.number().finite().positive(),
  reserveMonths: z.number().int().min(0).max(120),
  salaryDay: z.number().int().min(1).max(28),
  mode: z.enum(["Обычный", "Экономия"]),
  savingPercent: z.number().int().min(0).max(90),
  trackingDays: z.number().int().min(1).max(365),
  incomeStrategy: z.enum(["Худший месяц", "Среднее за период", "Среднее за 3 месяца"]),
  statsMonths: z.number().int().min(1).max(60),
  walletDays: z.number().int().min(1).max(31),
  largeExpenseThreshold: z.number().finite().nonnegative(),
  currencyRates: currencyRates.optional(),
  currencyBalances: currencyBalances.optional(),
}).partial();
const reminderInput = z.object({
  uid: z.string().trim().min(1).max(190),
  title: z.string().trim().min(1).max(220),
  description: z.string().max(5000).nullish(),
  startAt: z.string().min(10).max(60),
  recurrence: z.string().max(190).nullish(),
  enabled: z.boolean(),
});
const reconciliationInput = z.object({
  countedRub: z.number().finite().nonnegative(),
  countedUsd: z.number().finite().nonnegative(),
  bookRub: z.number().finite(),
  bookUsd: z.number().finite(),
  note: z.string().max(5000).nullish(),
});

const snapshotSchema = z.object({
  settings: z.object({ startDate: dateString }).passthrough(),
  transactions: z.array(transactionInput.passthrough()).max(50000),
  payments: z.array(paymentInput.passthrough()).max(10000),
  envelopes: z.array(envelopeInput.passthrough()).max(10000),
  goals: z.array(goalInput.passthrough()).max(10000),
  moods: z.array(moodInput.passthrough()).max(50000),
  options: z.array(z.object({ kind: z.enum(["emotion", "topic", "time"]), label: z.string().min(1).max(120), sortOrder: z.number().int().min(0) }).passthrough()).max(5000),
  notes: z.array(noteInput.passthrough()).max(20000).optional().default([]),
  noteAssets: z.array(noteAssetInput.extend({ id: z.number().int().positive().optional() })).max(500).optional().default([]),
  reminders: z.array(reminderInput.passthrough()).max(10000),
  reconciliations: z.array(reconciliationInput.passthrough()).max(10000),
  assets: z.array(z.object({ name: z.string().trim().min(1).max(160), kind: z.enum(["asset", "liability"]), category: z.enum(["Наличные и счета", "Вклады", "Инвестиции", "Имущество", "Долг", "Другое"]), valueRub: z.number().finite().nonnegative(), note: z.string().max(5000).nullish() }).passthrough()).max(10000).optional().default([]),
  importBatches: z.array(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(190), format: z.enum(["csv", "ofx"]), rowCount: z.number().int().nonnegative(), duplicateCount: z.number().int().nonnegative(), status: z.enum(["active", "rolledBack"]), createdAt: z.union([z.string(), z.date()]).optional(), rolledBackAt: z.union([z.string(), z.date()]).nullable().optional() }).passthrough()).max(10000).optional().default([]),
  transactionRules: z.array(z.object({ name: z.string().trim().min(1).max(160), matchField: z.enum(["source", "note", "category", "any"]), pattern: z.string().trim().min(1).max(190), operationType: z.enum(["Доход", "Расход", "Обмен", "Любой"]), category: z.string().trim().min(1).max(160), priority: z.number().int().min(0).max(10000), enabled: z.boolean() }).passthrough()).max(10000).optional().default([]),
}).superRefine((value, context) => {
  const rows = value.notes as NoteExport[];
  const byId = new Map(rows.filter((row) => row.id != null).map((row) => [row.id!, row]));
  rows.forEach((row, index) => {
    if (row.parentId == null) return;
    const parent = byId.get(row.parentId);
    if (!parent) {
      context.addIssue({ code: "custom", path: ["notes", index, "parentId"], message: "Родительская папка не найдена" });
      return;
    }
    if (parent.kind !== "folder") {
      context.addIssue({ code: "custom", path: ["notes", index, "parentId"], message: "Родителем может быть только папка" });
    }
    const visited = new Set<number>(row.id == null ? [] : [row.id]);
    let cursor = parent;
    while (cursor.parentId != null) {
      if (visited.has(cursor.parentId)) {
        context.addIssue({ code: "custom", path: ["notes", index, "parentId"], message: "Обнаружен цикл в дереве заметок" });
        break;
      }
      visited.add(cursor.parentId);
      const next = byId.get(cursor.parentId);
      if (!next) break;
      cursor = next;
    }
  });
  value.noteAssets.forEach((asset, index) => {
    if (!byId.has(asset.noteId)) context.addIssue({ code: "custom", path: ["noteAssets", index, "noteId"], message: "Заметка для изображения не найдена" });
  });
});

type SnapshotInput = z.infer<typeof snapshotSchema>;
type OperationType = z.infer<typeof transactionInput>["type"];
type TransactionValues = z.infer<typeof transactionInput>;

export function normalizeTransaction(input: TransactionValues) {
  let currency = input.currency ??
    (input.type === "Обмен" && input.amountUsd != null ? "USD" : "RUB");

  // Archives written between the schema extension and the legacy-data backfill
  // can contain a USD exchange whose new currency column still says RUB.
  if (
    input.type === "Обмен" &&
    input.originalAmount == null &&
    input.amountUsd != null &&
    currency === "RUB"
  ) {
    currency = "USD";
  }

  const fail = (message: string): never => {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  };
  const roundMoney = (value: number) => Math.round(value * 100) / 100;
  const roundRate = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

  if (input.type !== "Обмен") {
    const originalAmount = input.originalAmount ??
      (currency === "RUB" ? input.amountRub : Number.NaN);

    if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
      fail("Укажите положительную сумму в валюте операции.");
    }

    const exchangeRate = currency === "RUB"
      ? 1
      : input.exchangeRate ??
        (input.amountRub > 0 ? input.amountRub / originalAmount : Number.NaN);

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      fail("Укажите курс: сколько рублей стоит одна единица валюты.");
    }

    return {
      ...input,
      currency,
      originalAmount: roundMoney(originalAmount),
      exchangeRate: roundRate(exchangeRate),
      amountRub: currency === "RUB"
        ? roundMoney(originalAmount)
        : roundMoney(originalAmount * exchangeRate),
      amountUsd: null,
    };
  }

  if (currency === "RUB") {
    fail("Для обмена выберите иностранную валюту относительно рубля.");
  }

  const originalAmount = input.originalAmount ?? input.amountUsd ?? Number.NaN;
  if (!Number.isFinite(originalAmount) || originalAmount === 0) {
    fail("Укажите ненулевую сумму валюты для обмена.");
  }

  const exchangeRate = input.exchangeRate ??
    (input.amountRub !== 0
      ? Math.abs(input.amountRub / originalAmount)
      : Number.NaN);

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    fail("Укажите обе суммы обмена, чтобы рассчитать курс.");
  }

  if (
    input.amountRub !== 0 &&
    Math.sign(input.amountRub) === Math.sign(originalAmount)
  ) {
    fail("При обмене рубли и иностранная валюта должны двигаться в противоположных направлениях.");
  }

  return {
    ...input,
    currency,
    originalAmount: roundMoney(originalAmount),
    exchangeRate: roundRate(exchangeRate),
    amountRub: roundMoney(-Math.sign(originalAmount) * Math.abs(originalAmount) * exchangeRate),
    amountUsd: currency === "USD" ? roundMoney(originalAmount) : null,
  };
}

async function assertExpenseCategory(userId: number, type: OperationType, category: string) {
  if (type !== "Расход") return;
  if (isIncomeOnlyCategory(category)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Это категория дохода. Выберите категорию траты или измените тип операции.",
    });
  }
  const incomeRows = await getDb()
    .select({ category: transactions.category })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.type, "Доход")));
  const normalized = normalizeOperationCategory(category);
  if (incomeRows.some((row) => normalizeOperationCategory(row.category) === normalized)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Эта категория уже используется для дохода. Выберите другую категорию траты.",
    });
  }
}

type NoteTreeRow = { id: number; parentId: number | null; kind: NoteExport["kind"] };

async function assertNoteParent(userId: number, parentId: number | null | undefined, noteId?: number) {
  if (parentId == null) return;
  const rows = await getDb().select({ id: notes.id, parentId: notes.parentId, kind: notes.kind })
    .from(notes).where(eq(notes.userId, userId));
  const byId = new Map<number, NoteTreeRow>(rows.map((row) => [row.id, row]));
  const parent = byId.get(parentId);
  if (!parent || parent.kind !== "folder") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Выберите существующую папку" });
  }
  let cursor: NoteTreeRow | undefined = parent;
  const visited = new Set<number>();
  while (cursor) {
    if (cursor.id === noteId || visited.has(cursor.id)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Нельзя переместить папку внутрь самой себя" });
    }
    visited.add(cursor.id);
    cursor = cursor.parentId == null ? undefined : byId.get(cursor.parentId);
  }
}

function withNoteDescendants(rows: NoteTreeRow[], id: number) {
  const result = new Set<number>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parentId != null && result.has(row.parentId) && !result.has(row.id)) {
        result.add(row.id);
        changed = true;
      }
    }
  }
  return [...result];
}

function decodeNoteAsset(data: string, mime: z.infer<typeof noteAssetInput>["mime"]) {
  const buffer = Buffer.from(data, "base64");
  const normalized = data.replace(/=+$/, "");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024 || buffer.toString("base64").replace(/=+$/, "") !== normalized) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Изображение повреждено или превышает 8 МБ" });
  }
  const signatures: Record<typeof mime, boolean> = {
    "image/png": buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/jpeg": buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    "image/gif": buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii")),
    "image/webp": buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP",
  };
  if (!signatures[mime]) throw new TRPCError({ code: "BAD_REQUEST", message: "Содержимое файла не соответствует формату изображения" });
  return buffer;
}

async function applySnapshot(userId: number, payload: SnapshotInput) {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const table of [noteAssets, transactions, importBatches, transactionRules, assetEntries, payments, envelopes, goals, moodEntries, moodOptions, notes, reminders, reconciliations]) {
      await tx.delete(table).where(eq(table.userId, userId));
    }
    await tx.delete(appSettings).where(eq(appSettings.userId, userId));
    const settings = { ...payload.settings } as Record<string, unknown>;
    for (const key of ["id", "userId", "createdAt", "updatedAt"]) delete settings[key];
    await tx.insert(appSettings).values({ ...settings, userId } as typeof appSettings.$inferInsert);

    const batchIdMap = new Map<number, number>();
    for (const source of payload.importBatches) {
      const [{ id }] = await tx.insert(importBatches).values({
        userId, name: source.name, format: source.format, rowCount: source.rowCount,
        duplicateCount: source.duplicateCount, status: source.status,
        createdAt: source.createdAt ? new Date(source.createdAt) : new Date(),
        rolledBackAt: source.rolledBackAt ? new Date(source.rolledBackAt) : null,
      }).returning({ id: importBatches.id });
      batchIdMap.set(source.id, id);
    }
    const restoredTransactions = payload.transactions.map((source) => {
      const row = { ...source } as Record<string, unknown>;
      for (const key of ["id", "userId", "createdAt", "updatedAt"]) delete row[key];
      const oldBatchId = typeof row.importBatchId === "number" ? row.importBatchId : null;
      return {
        ...normalizeTransaction(row as unknown as TransactionValues),
        importBatchId: oldBatchId == null ? null : batchIdMap.get(oldBatchId) ?? null,
        userId,
      };
    });
    if (restoredTransactions.length) {
      await tx.insert(transactions).values(restoredTransactions);
    }

    const groups = [
      [payments, payload.payments], [assetEntries, payload.assets], [transactionRules, payload.transactionRules],
      [envelopes, payload.envelopes], [goals, payload.goals], [moodEntries, payload.moods],
      [moodOptions, payload.options], [reconciliations, payload.reconciliations],
    ] as const;
    for (const [table, rows] of groups) {
      if (!rows.length) continue;
      const clean = rows.map((source) => {
        const row = { ...source } as Record<string, unknown>;
        for (const key of ["id", "userId", "createdAt", "updatedAt"]) delete row[key];
        return { ...row, userId };
      });
      await tx.insert(table).values(clean as never);
    }
    const noteIdMap = new Map<number, number>();
    for (const source of payload.notes as NoteExport[]) {
      const [{ id }] = await tx.insert(notes).values({
        userId, parentId: null, kind: source.kind, title: source.title,
        content: source.content, document: source.document ?? null, items: source.items,
        tags: source.tags ?? [], relatedLinks: source.relatedLinks ?? [], sortOrder: source.sortOrder,
      }).returning({ id: notes.id });
      if (source.id != null) noteIdMap.set(source.id, id);
    }
    for (const source of payload.notes as NoteExport[]) {
      if (source.id == null || source.parentId == null) continue;
      const id = noteIdMap.get(source.id);
      const parentId = noteIdMap.get(source.parentId);
      if (id != null && parentId != null) {
        await tx.update(notes).set({ parentId }).where(eq(notes.id, id));
      }
    }
    for (const source of payload.noteAssets) {
      const noteId = noteIdMap.get(source.noteId);
      if (noteId == null) continue;
      await tx.insert(noteAssets).values({
        userId, noteId, name: source.name, mime: source.mime,
        data: decodeNoteAsset(source.data, source.mime),
      });
    }
    if (payload.reminders.length) {
      await tx.insert(reminders).values(payload.reminders.map((source) => ({
        userId, uid: source.uid, title: source.title, description: source.description,
        startAt: new Date(source.startAt), recurrence: source.recurrence, enabled: source.enabled,
      })));
    }
  });
  await recordActivity(userId, "restore", "workspace", null, "Данные восстановлены из резервной копии");
}

function parseSnapshot(raw: string): SnapshotInput {
  try {
    return snapshotSchema.parse(JSON.parse(raw));
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Файл копии повреждён или имеет неподдерживаемый формат" });
  }
}

export const workspaceRouter = createRouter({
  get: adminQuery.query(async ({ ctx }) => {
    await ensureWorkspace(ctx.user.id);
    return fetchWorkspace(ctx.user.id);
  }),
  archiveGet: adminQuery.query(async ({ ctx }) => {
    await ensureWorkspace(ctx.user.id);
    return fetchWorkspaceSnapshot(ctx.user.id);
  }),

  settingsUpdate: adminQuery.input(settingsInput).mutation(async ({ ctx, input }) => {
    await getDb().update(appSettings).set(input).where(eq(appSettings.userId, ctx.user.id));
    await recordActivity(ctx.user.id, "update", "settings", null, "Обновлены настройки и стартовые остатки");
    return { ok: true };
  }),

  transactionCreate: adminQuery.input(transactionInput).mutation(async ({ ctx, input }) => {
    if (input.clientId) {
      const [existing] = await getDb().select({ id: transactions.id }).from(transactions)
        .where(and(eq(transactions.userId, ctx.user.id), eq(transactions.clientId, input.clientId))).limit(1);
      if (existing) return existing;
    }
    const values = normalizeTransaction(input);
    await assertExpenseCategory(ctx.user.id, values.type, values.category);
    const [{ id }] = await getDb().insert(transactions).values({ ...values, userId: ctx.user.id }).returning();
    await recordActivity(
      ctx.user.id,
      "create",
      "transaction",
      id,
      `${values.type}: ${values.category}, ${values.originalAmount} ${values.currency} (≈ ${values.amountRub} ₽)`,
    );
    return { id };
  }),
  transactionUpdate: adminQuery.input(transactionInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input;
    const [existing] = await getDb().select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, ctx.user.id))).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Операция не найдена" });
    const merged = { ...existing, ...patch };
    if (patch.amountRub != null && patch.originalAmount == null) {
      if (merged.type !== "Обмен" && merged.currency === "RUB") {
        merged.originalAmount = patch.amountRub;
      } else if (
        merged.type === "Обмен" &&
        patch.exchangeRate == null &&
        merged.originalAmount != null &&
        merged.originalAmount !== 0
      ) {
        merged.exchangeRate = Math.abs(patch.amountRub / merged.originalAmount);
      }
    }
    const values = normalizeTransaction(transactionInput.parse(merged));
    await assertExpenseCategory(ctx.user.id, values.type, values.category);
    await getDb().update(transactions).set(values).where(and(eq(transactions.id, id), eq(transactions.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "update", "transaction", id, "Операция изменена");
    return { ok: true };
  }),
  transactionDelete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(transactions).where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "delete", "transaction", input.id, "Операция удалена");
    return { ok: true };
  }),

  paymentCreate: adminQuery.input(paymentInput).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb().insert(payments).values({ ...input, userId: ctx.user.id }).returning();
    await recordActivity(ctx.user.id, "create", "payment", id, `Добавлен платёж «${input.name}»`);
    return { id };
  }),
  paymentUpdate: adminQuery.input(paymentInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    await getDb().update(payments).set(values).where(and(eq(payments.id, id), eq(payments.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "update", "payment", id, "Регулярный платёж изменён");
    return { ok: true };
  }),
  paymentDelete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(payments).where(and(eq(payments.id, input.id), eq(payments.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "delete", "payment", input.id, "Регулярный платёж удалён");
    return { ok: true };
  }),

  envelopeCreate: adminQuery.input(envelopeInput).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb().insert(envelopes).values({ ...input, userId: ctx.user.id }).returning();
    await recordActivity(ctx.user.id, "create", "envelope", id, `Добавлен конверт «${input.name}»`);
    return { id };
  }),
  envelopeUpdate: adminQuery.input(envelopeInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    await getDb().update(envelopes).set(values).where(and(eq(envelopes.id, id), eq(envelopes.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "update", "envelope", id, "Конверт изменён");
    return { ok: true };
  }),
  envelopeDelete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(envelopes).where(and(eq(envelopes.id, input.id), eq(envelopes.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "delete", "envelope", input.id, "Конверт удалён");
    return { ok: true };
  }),

  goalCreate: adminQuery.input(goalInput).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb().insert(goals).values({ ...input, userId: ctx.user.id }).returning();
    await recordActivity(ctx.user.id, "create", "goal", id, `Добавлена цель «${input.name}»`);
    return { id };
  }),
  goalUpdate: adminQuery.input(goalInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    await getDb().update(goals).set(values).where(and(eq(goals.id, id), eq(goals.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "update", "goal", id, "Цель изменена");
    return { ok: true };
  }),
  goalDelete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(goals).where(and(eq(goals.id, input.id), eq(goals.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "delete", "goal", input.id, "Цель удалена");
    return { ok: true };
  }),

  moodCreate: adminQuery.input(moodInput).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb().insert(moodEntries).values({ ...input, userId: ctx.user.id }).returning();
    await recordActivity(ctx.user.id, "create", "mood", id, `Запись настроения за ${input.entryDate}`);
    return { id };
  }),
  moodUpdate: adminQuery.input(moodInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    await getDb().update(moodEntries).set(values).where(and(eq(moodEntries.id, id), eq(moodEntries.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "update", "mood", id, "Запись настроения изменена");
    return { ok: true };
  }),
  moodDelete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(moodEntries).where(and(eq(moodEntries.id, input.id), eq(moodEntries.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "delete", "mood", input.id, "Запись настроения удалена");
    return { ok: true };
  }),

  optionCreate: adminQuery.input(z.object({ kind: z.enum(["emotion", "topic", "time"]), label: z.string().trim().min(1).max(120) })).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb().insert(moodOptions).values({ ...input, userId: ctx.user.id, sortOrder: 1000 }).returning();
    return { id };
  }),
  optionDelete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(moodOptions).where(and(eq(moodOptions.id, input.id), eq(moodOptions.userId, ctx.user.id)));
    return { ok: true };
  }),

  noteCreate: adminQuery.input(noteInput).mutation(async ({ ctx, input }) => {
    await assertNoteParent(ctx.user.id, input.parentId);
    const [{ id }] = await getDb().insert(notes).values({
      ...input, parentId: input.parentId ?? null, userId: ctx.user.id,
    }).returning({ id: notes.id });
    const label = input.kind === "folder" ? "папка" : input.kind === "wishlist" ? "вишлист" : "заметка";
    await recordActivity(ctx.user.id, "create", "note", id, `Создана ${label} «${input.title}»`);
    return { id };
  }),
  noteUpdate: adminQuery.input(noteInput.omit({ kind: true }).partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    const [existing] = await getDb().select({ id: notes.id }).from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, ctx.user.id))).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Заметка не найдена" });
    if (values.parentId !== undefined) await assertNoteParent(ctx.user.id, values.parentId, id);
    await getDb().update(notes).set(values).where(and(eq(notes.id, id), eq(notes.userId, ctx.user.id)));
    await recordActivity(ctx.user.id, "update", "note", id, "Заметка или вишлист сохранены");
    return { ok: true };
  }),
  noteAssetCreate: adminQuery.input(noteAssetInput).mutation(async ({ ctx, input }) => {
    const [owner] = await getDb().select({ id: notes.id }).from(notes)
      .where(and(eq(notes.id, input.noteId), eq(notes.userId, ctx.user.id))).limit(1);
    if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "Заметка не найдена" });
    const data = decodeNoteAsset(input.data, input.mime);
    const [{ id }] = await getDb().insert(noteAssets).values({
      userId: ctx.user.id, noteId: input.noteId, name: input.name, mime: input.mime, data,
    }).returning({ id: noteAssets.id });
    return { id, url: `/api/note-assets/${id}` };
  }),
  noteDelete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const rows = await getDb().select({ id: notes.id, parentId: notes.parentId, kind: notes.kind })
      .from(notes).where(eq(notes.userId, ctx.user.id));
    if (!rows.some((row) => row.id === input.id)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Заметка не найдена" });
    }
    const ids = withNoteDescendants(rows, input.id);
    await getDb().transaction(async (tx) => {
      await tx.delete(noteAssets).where(and(eq(noteAssets.userId, ctx.user.id), inArray(noteAssets.noteId, ids)));
      await tx.delete(notes).where(and(eq(notes.userId, ctx.user.id), inArray(notes.id, ids)));
    });
    await recordActivity(ctx.user.id, "delete", "note", input.id, ids.length > 1 ? `Удалена папка и ${ids.length - 1} вложенных элементов` : "Заметка удалена");
    return { ok: true };
  }),

  reminderCreate: adminQuery.input(reminderInput).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb().insert(reminders).values({ ...input, startAt: new Date(input.startAt), userId: ctx.user.id }).returning();
    await recordActivity(ctx.user.id, "create", "reminder", id, `Добавлено напоминание «${input.title}»`);
    return { id };
  }),
  reminderUpdate: adminQuery.input(reminderInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    await getDb().update(reminders).set({ ...values, startAt: values.startAt ? new Date(values.startAt) : undefined }).where(and(eq(reminders.id, id), eq(reminders.userId, ctx.user.id)));
    return { ok: true };
  }),
  reminderDelete: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(reminders).where(and(eq(reminders.id, input.id), eq(reminders.userId, ctx.user.id)));
    return { ok: true };
  }),

  reconciliationCreate: adminQuery.input(reconciliationInput).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb().insert(reconciliations).values({ ...input, userId: ctx.user.id }).returning();
    await recordActivity(ctx.user.id, "create", "reconciliation", id, "Сохранена сверка кошелька");
    return { id };
  }),

  backupList: adminQuery.query(async ({ ctx }) => {
    await ensureWorkspace(ctx.user.id);
    const [items, activity, fileItems] = await Promise.all([
      listSnapshots(ctx.user.id), recentActivity(ctx.user.id), listFileBackups(),
    ]);
    return { items, activity, fileItems };
  }),
  backupHealth: adminQuery.query(() => fileBackupHealth()),
  fileBackupCreate: adminQuery.mutation(async () => {
    return { name: await createFileBackup("manual") };
  }),
  fileBackupRestore: adminQuery.input(z.object({ name: z.string().min(1).max(255) })).mutation(async ({ ctx, input }) => {
    await restoreFileBackup(input.name);
    await recordActivity(ctx.user.id, "restore", "workspace", null, `Восстановлена файловая копия ${input.name}`);
    return { ok: true };
  }),
  backupCreate: adminQuery.input(z.object({ name: z.string().trim().min(1).max(220) })).mutation(async ({ ctx, input }) => {
    const result = await createSnapshot(ctx.user.id, input.name, "manual");
    await recordActivity(ctx.user.id, "backup", "workspace", result.id, `Создана копия «${input.name}»`);
    return result;
  }),
  backupGet: adminQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const row = await getDb().select().from(backups).where(and(eq(backups.id, input.id), eq(backups.userId, ctx.user.id))).limit(1);
    if (!row.length) throw new TRPCError({ code: "NOT_FOUND", message: "Копия не найдена" });
    return { name: row[0].name, createdAt: row[0].createdAt, payload: JSON.parse(row[0].payload) as WorkspaceSnapshot };
  }),
  backupRestore: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const row = await getDb().select().from(backups).where(and(eq(backups.id, input.id), eq(backups.userId, ctx.user.id))).limit(1);
    if (!row.length) throw new TRPCError({ code: "NOT_FOUND", message: "Копия не найдена" });
    await createSnapshot(ctx.user.id, "Перед восстановлением копии", "auto");
    await applySnapshot(ctx.user.id, parseSnapshot(row[0].payload));
    return { ok: true };
  }),
  backupImport: adminQuery.input(z.object({ payload: z.string().max(100_000_000) })).mutation(async ({ ctx, input }) => {
    const payload = parseSnapshot(input.payload);
    await createSnapshot(ctx.user.id, "Перед импортом резервной копии", "auto");
    await applySnapshot(ctx.user.id, payload);
    return { ok: true };
  }),
});
