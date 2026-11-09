import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () => integer("id").primaryKey({ autoIncrement: true });
const userId = () => integer("userId").notNull();
const money = (name: string) => real(name);
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const timestamps = {
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
};

export const users = sqliteTable("users", {
  id: id(),
  unionId: text("unionId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  avatar: text("avatar"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export const appSettings = sqliteTable("appSettings", {
  id: id(),
  userId: userId().notNull().unique(),
  startDate: text("startDate").notNull(),
  cashRub: money("cashRub").notNull().default(0),
  cardRub: money("cardRub").notNull().default(0),
  cashUsd: money("cashUsd").notNull().default(0),
  usdRate: money("usdRate").notNull().default(83.25),
  reserveMonths: integer("reserveMonths").notNull().default(3),
  salaryDay: integer("salaryDay").notNull().default(15),
  secondSalaryDay: integer("secondSalaryDay"),
  incomeSchedule: text("incomeSchedule", { enum: ["twice", "monthly", "irregular"] }).notNull().default("twice"),
  mode: text("mode", { enum: ["Обычный", "Экономия"] }).notNull().default("Обычный"),
  savingPercent: integer("savingPercent").notNull().default(30),
  trackingDays: integer("trackingDays").notNull().default(14),
  incomeStrategy: text("incomeStrategy", { enum: ["Худший месяц", "Среднее за период", "Среднее за 3 месяца"] }).notNull().default("Худший месяц"),
  statsMonths: integer("statsMonths").notNull().default(6),
  walletDays: integer("walletDays").notNull().default(3),
  largeExpenseThreshold: money("largeExpenseThreshold").notNull().default(10000),
  currencyRates: text("currencyRates", { mode: "json" }).$type<Record<string, number>>(),
  currencyBalances: text("currencyBalances", { mode: "json" }).$type<Record<string, number>>(),
  ...timestamps,
});

export const transactions = sqliteTable("transactions", {
  id: id(),
  userId: userId().notNull(),
  operationDate: text("operationDate").notNull(),
  type: text("type", { enum: ["Доход", "Расход", "Обмен"] }).notNull(),
  category: text("category").notNull(),
  amountRub: money("amountRub").notNull(),
  amountUsd: money("amountUsd"),
  currency: text("currency").notNull().default("RUB"),
  originalAmount: real("originalAmount"),
  exchangeRate: real("exchangeRate"),
  note: text("note"),
  source: text("source"),
  importBatchId: integer("importBatchId"),
  externalId: text("externalId"),
  clientId: text("clientId"),
  ...timestamps,
}, (t) => ({
  userDateIdx: index("transactions_user_date_idx").on(t.userId, t.operationDate),
  userBatchIdx: index("transactions_user_batch_idx").on(t.userId, t.importBatchId),
  userExternalIdx: index("transactions_user_external_idx").on(t.userId, t.externalId),
  userClientIdx: uniqueIndex("transactions_user_client_unique").on(t.userId, t.clientId),
}));

export const importBatches = sqliteTable("importBatches", {
  id: id(),
  userId: userId().notNull(),
  name: text("name").notNull(),
  format: text("format", { enum: ["csv", "ofx"] }).notNull(),
  rowCount: integer("rowCount").notNull(),
  duplicateCount: integer("duplicateCount").notNull().default(0),
  status: text("status", { enum: ["active", "rolledBack"] }).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  rolledBackAt: timestamp("rolledBackAt"),
}, (t) => ({ userDateIdx: index("import_batches_user_date_idx").on(t.userId, t.createdAt) }));

export const transactionRules = sqliteTable("transactionRules", {
  id: id(),
  userId: userId().notNull(),
  name: text("name").notNull(),
  matchField: text("matchField", { enum: ["source", "note", "category", "any"] }).notNull().default("any"),
  pattern: text("pattern").notNull(),
  operationType: text("operationType", { enum: ["Доход", "Расход", "Обмен", "Любой"] }).notNull().default("Любой"),
  category: text("category").notNull(),
  priority: integer("priority").notNull().default(100),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, (t) => ({ userPriorityIdx: index("transaction_rules_user_priority_idx").on(t.userId, t.enabled, t.priority, t.id) }));

export const payments = sqliteTable("payments", {
  id: id(),
  userId: userId().notNull(),
  name: text("name").notNull(),
  amount: money("amount"),
  minAmount: money("minAmount"),
  maxAmount: money("maxAmount"),
  intervalMonths: integer("intervalMonths").notNull().default(1),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  sourceType: text("sourceType", { enum: ["Данные пользователя", "Диапазон пользователя", "Оценка"] }).notNull().default("Данные пользователя"),
  dayOfMonth: integer("dayOfMonth"),
  nextDate: text("nextDate"),
  paidCycle: integer("paidCycle", { mode: "boolean" }).notNull().default(false),
  note: text("note"),
  ...timestamps,
}, (t) => ({ userIdx: index("payments_user_idx").on(t.userId) }));

export const envelopes = sqliteTable("envelopes", {
  id: id(),
  userId: userId().notNull(),
  name: text("name").notNull(),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  estimatedAmount: money("estimatedAmount"),
  monthlyLimit: money("monthlyLimit"),
  sortOrder: integer("sortOrder").notNull().default(0),
  note: text("note"),
  ...timestamps,
}, (t) => ({ userIdx: index("envelopes_user_idx").on(t.userId) }));

export const goals = sqliteTable("goals", {
  id: id(),
  userId: userId().notNull(),
  name: text("name").notNull(),
  targetAmount: money("targetAmount").notNull(),
  savedAmount: money("savedAmount").notNull().default(0),
  targetDate: text("targetDate"),
  ...timestamps,
}, (t) => ({ userIdx: index("goals_user_idx").on(t.userId) }));

export const moodEntries = sqliteTable("moodEntries", {
  id: id(),
  userId: userId().notNull(),
  entryDate: text("entryDate").notNull(),
  timeOfDay: text("timeOfDay").notNull(),
  mood: integer("mood").notNull(),
  emotion: text("emotion").notNull(),
  intensity: integer("intensity").notNull(),
  topic: text("topic").notNull(),
  situation: text("situation"),
  thoughts: text("thoughts"),
  body: text("body"),
  coping: text("coping"),
  energy: integer("energy"),
  sleepHours: real("sleepHours"),
  therapyNotes: text("therapyNotes"),
  ...timestamps,
}, (t) => ({ userDateIdx: index("mood_user_date_idx").on(t.userId, t.entryDate) }));

export const moodOptions = sqliteTable("moodOptions", {
  id: id(),
  userId: userId().notNull(),
  kind: text("kind", { enum: ["emotion", "topic", "time"] }).notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ uniqueOption: uniqueIndex("mood_option_unique").on(t.userId, t.kind, t.label) }));

export const notes = sqliteTable("notes", {
  id: id(),
  userId: userId().notNull(),
  parentId: integer("parentId"),
  kind: text("kind", { enum: ["folder", "note", "wishlist"] }).notNull().default("note"),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  document: text("document", { mode: "json" }).$type<import("@contracts/notes").NoteDocument>(),
  items: text("items", { mode: "json" }).$type<import("@contracts/notes").WishlistItem[]>().notNull().default([]),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  relatedLinks: text("relatedLinks", { mode: "json" }).$type<import("@contracts/notes").NoteRelatedLink[]>().notNull().default([]),
  sortOrder: integer("sortOrder").notNull().default(0),
  ...timestamps,
}, (t) => ({
  userParentIdx: index("notes_user_parent_idx").on(t.userId, t.parentId),
  userOrderIdx: index("notes_user_order_idx").on(t.userId, t.sortOrder, t.id),
}));

export const noteAssets = sqliteTable("noteAssets", {
  id: id(),
  userId: userId().notNull(),
  noteId: integer("noteId").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  userNoteIdx: index("note_assets_user_note_idx").on(t.userId, t.noteId),
}));

export const reminders = sqliteTable("reminders", {
  id: id(),
  userId: userId().notNull(),
  uid: text("uid").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  startAt: timestamp("startAt").notNull(),
  recurrence: text("recurrence"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, (t) => ({ uniqueReminder: uniqueIndex("reminder_uid_unique").on(t.userId, t.uid) }));

export const reconciliations = sqliteTable("reconciliations", {
  id: id(),
  userId: userId().notNull(),
  countedRub: money("countedRub").notNull(),
  countedUsd: money("countedUsd").notNull(),
  bookRub: money("bookRub").notNull(),
  bookUsd: money("bookUsd").notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ userIdx: index("reconciliations_user_idx").on(t.userId) }));

export const backups = sqliteTable("backups", {
  id: id(),
  userId: userId().notNull(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["manual", "auto", "import"] }).notNull().default("manual"),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ userDateIdx: index("backups_user_date_idx").on(t.userId, t.createdAt) }));

export const activities = sqliteTable("activities", {
  id: id(),
  userId: userId().notNull(),
  action: text("action").notNull(),
  entityType: text("entityType").notNull(),
  entityId: integer("entityId"),
  summary: text("summary").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ userDateIdx: index("activities_user_date_idx").on(t.userId, t.createdAt) }));

export const localAuth = sqliteTable("localAuth", {
  id: id(),
  userId: userId().notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  passwordSalt: text("passwordSalt").notNull(),
  ...timestamps,
});

export const authSessions = sqliteTable("authSessions", {
  id: id(),
  userId: userId().notNull(),
  tokenHash: text("tokenHash").notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("auth_sessions_user_idx").on(t.userId, t.expiresAt),
}));

export const assetEntries = sqliteTable("assetEntries", {
  id: id(),
  userId: userId().notNull(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["asset", "liability"] }).notNull(),
  category: text("category", { enum: ["Наличные и счета", "Вклады", "Инвестиции", "Имущество", "Долг", "Другое"] }).notNull(),
  valueRub: money("valueRub").notNull(),
  note: text("note"),
  ...timestamps,
}, (t) => ({ userKindIdx: index("asset_entries_user_kind_idx").on(t.userId, t.kind, t.id) }));

export const apiTokens = sqliteTable("apiTokens", {
  id: id(),
  userId: userId().notNull(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  tokenHash: text("tokenHash").notNull().unique(),
  scope: text("scope", { enum: ["read", "write"] }).notNull().default("read"),
  lastUsedAt: timestamp("lastUsedAt"),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ userDateIdx: index("api_tokens_user_date_idx").on(t.userId, t.createdAt) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
