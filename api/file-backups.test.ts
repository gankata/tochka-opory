import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";

const testDataDir = path.resolve(".test-data");
await fs.rm(testDataDir, { recursive: true, force: true });
process.env.DATA_DIR = testDataDir;
process.env.APP_MODE = "local";

const { getDb, getSqlClient } = await import("./queries/connection");
const { ensureLocalUser } = await import("./queries/users");
const { ensureWorkspace, fetchWorkspace } = await import("./queries/workspace");
const { createFileBackup, fileBackupHealth, listFileBackups, restoreFileBackup } = await import("./lib/file-backups");
const { backups, notes, transactions } = await import("../db/schema");

afterAll(async () => {
  getSqlClient().close();
  await fs.rm(testDataDir, { recursive: true, force: true });
});

test("исходные данные и заметки сохраняются, старые копии остаются совместимыми", async () => {
  const user = await ensureLocalUser();
  await ensureWorkspace(user.id);
  const count = async () => (await getDb().select().from(transactions).where(eq(transactions.userId, user.id))).length;
  expect(await count()).toBe(0);

  const name = await createFileBackup("test");
  expect(name).toMatch(/\.sqlite$/);

  await getDb().insert(transactions).values({
    userId: user.id,
    operationDate: "2026-11-03",
    type: "Расход",
    category: "Проверка восстановления",
    amountRub: 100,
    amountUsd: null,
    currency: "RUB",
    originalAmount: 100,
    exchangeRate: 1,
  });
  expect(await count()).toBe(1);

  await restoreFileBackup(name!);
  expect(await count()).toBe(0);

  const [folder] = await getDb().insert(notes).values({ userId: user.id, kind: "folder", title: "Папка", content: "", items: [], sortOrder: 0 }).returning();
  await getDb().insert(notes).values({ userId: user.id, parentId: folder.id, kind: "note", title: "Заметка", content: "Исходный текст", items: [], sortOrder: 1 });
  const notesBackup = await createFileBackup("notes");
  await getDb().update(notes).set({ content: "Изменённый текст" }).where(eq(notes.title, "Заметка"));
  await restoreFileBackup(notesBackup!);
  const restoredNotes = await getDb().select().from(notes).orderBy(notes.id);
  expect(restoredNotes).toHaveLength(2);
  expect(restoredNotes[1]).toMatchObject({ parentId: restoredNotes[0].id, content: "Исходный текст" });

  const legacy = createClient({ url: `file:${path.join(testDataDir, "backups", notesBackup!)}` });
  try { await legacy.execute("DROP TABLE notes"); } finally { legacy.close(); }
  await restoreFileBackup(notesBackup!);
  expect(await getDb().select().from(notes)).toHaveLength(0);
  expect(await count()).toBe(0);
  expect((await listFileBackups()).length).toBeGreaterThanOrEqual(2);
  expect((await fileBackupHealth()).database).toBe("ok");
});

test("JSON-архив сохраняет дерево заметок и не позволяет создать цикл", async () => {
  const user = await ensureLocalUser();
  const { appRouter } = await import("./router");
  const caller = appRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user });
  const folder = await caller.workspace.noteCreate({ parentId: null, kind: "folder", title: "Архивная папка", content: "", items: [], sortOrder: 0 });
  const page = await caller.workspace.noteCreate({ parentId: folder.id, kind: "wishlist", title: "Архивный вишлист", content: "Описание", items: [{ id: "one", title: "Поездка", url: null, price: 5000, priority: "high", done: false, note: null }], sortOrder: 1 });
  await expect(caller.workspace.noteUpdate({ id: folder.id, parentId: folder.id })).rejects.toThrow("Нельзя переместить папку");
  const snapshot = await caller.workspace.get();

  await caller.workspace.noteUpdate({ id: page.id, parentId: null, content: "Потерянное изменение" });
  await caller.workspace.backupImport({ payload: JSON.stringify(snapshot) });
  const restored = await caller.workspace.get();
  const restoredFolder = restored.notes.find((note) => note.title === "Архивная папка");
  const restoredPage = restored.notes.find((note) => note.title === "Архивный вишлист");
  expect(restoredPage?.parentId).toBe(restoredFolder?.id);
  expect(restoredPage?.content).toBe("Описание");
  expect(restoredPage?.items[0]).toMatchObject({ title: "Поездка", price: 5000 });
});

test("архивы сохраняют именованные источники, а старый формат восстанавливает прежние дни", async () => {
  const user = await ensureLocalUser();
  const { appRouter } = await import("./router");
  const caller = appRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user });
  const archive = await caller.workspace.archiveGet();
  archive.incomeSources = [
    { id: 1, userId: user.id, name: "Зарплата", dayOfMonth: 15, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, userId: user.id, name: "Аренда", dayOfMonth: 5, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 3, userId: user.id, name: "Гонорар", dayOfMonth: null, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
  ];

  await caller.workspace.backupImport({ payload: JSON.stringify(archive) });
  expect((await caller.workspace.get()).incomeSources.map(({ name, dayOfMonth, sortOrder }) => ({ name, dayOfMonth, sortOrder }))).toEqual([
    { name: "Зарплата", dayOfMonth: 15, sortOrder: 0 },
    { name: "Аренда", dayOfMonth: 5, sortOrder: 1 },
    { name: "Гонорар", dayOfMonth: null, sortOrder: 2 },
  ]);

  const emptyArchive = { ...archive, incomeSources: [] };
  await caller.workspace.backupImport({ payload: JSON.stringify(emptyArchive) });
  expect((await caller.workspace.get()).incomeSources).toEqual([]);

  const legacyArchive = {
    ...archive,
    settings: { ...archive.settings, incomeSchedule: "twice", salaryDay: 9, secondSalaryDay: null },
  };
  delete (legacyArchive as { incomeSources?: unknown }).incomeSources;
  await caller.workspace.backupImport({ payload: JSON.stringify(legacyArchive) });
  expect((await caller.workspace.get()).incomeSources.map(({ name, dayOfMonth }) => ({ name, dayOfMonth }))).toEqual([
    { name: "Первая зарплата", dayOfMonth: 9 },
    { name: "Вторая зарплата", dayOfMonth: null },
  ]);
});

test("сбой автоматической копии не блокирует доступ к существующим данным", async () => {
  const user = await ensureLocalUser();
  await getDb().update(backups).set({ createdAt: new Date(0) }).where(eq(backups.userId, user.id));
  await expect(ensureWorkspace(user.id, async () => {
    throw new Error("Диск недоступен");
  })).resolves.toBeUndefined();
  expect((await fetchWorkspace(user.id)).settings).not.toBeNull();
});

test("локальная база и каталог копий доступны только владельцу", async () => {
  const name = await createFileBackup("permissions");
  const mode = async (target: string) => (await fs.stat(target)).mode & 0o777;
  expect(await mode(testDataDir)).toBe(0o700);
  expect(await mode(path.join(testDataDir, "tochka-opory.db"))).toBe(0o600);
  expect(await mode(path.join(testDataDir, "backups"))).toBe(0o700);
  expect(await mode(path.join(testDataDir, "backups", name!))).toBe(0o600);
});

test("состояние копий показывает свежесть и успешную проверку базы", async () => {
  await createFileBackup("health");
  expect(await fileBackupHealth()).toMatchObject({ database: "ok", stale: false, lastBackupFailureAt: null });

  const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const items = await listFileBackups();
  await Promise.all(items.map((item) => fs.utimes(path.join(testDataDir, "backups", item.name), oldDate, oldDate)));
  expect((await fileBackupHealth()).stale).toBe(true);

  await createFileBackup("health-fresh");
  expect((await fileBackupHealth()).stale).toBe(false);
});

test("импорт пропускает повторный файл и полностью откатывает пакет", async () => {
  const user = await ensureLocalUser();
  const { appRouter } = await import("./router");
  const caller = appRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user });
  const rows = [{ operationDate: "2026-11-06", type: "Расход" as const, category: "Импорт", amountRub: 250, currency: "RUB" as const, originalAmount: 250, exchangeRate: 1, note: "Проверка", source: "Тест", externalId: "import-test-1" }];
  const first = await caller.imports.importTransactions({ name: "Тестовый файл", format: "csv", rows });
  expect(first).toMatchObject({ imported: 1, duplicates: 0 });
  expect(first.id).not.toBeNull();
  const second = await caller.imports.importTransactions({ name: "Повтор", format: "csv", rows });
  expect(second).toMatchObject({ imported: 0, duplicates: 1 });
  expect(await caller.imports.rollback({ id: first.id! })).toEqual({ ok: true });
  expect((await caller.workspace.get()).transactions.filter((item) => item.externalId === "import-test-1")).toHaveLength(0);
  expect((await caller.imports.batches()).find((item) => item.id === first.id)?.status).toBe("rolledBack");
});

test("импорт 5000 строк вставляется частями и полностью откатывается", async () => {
  const user = await ensureLocalUser();
  const { appRouter } = await import("./router");
  const caller = appRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user });
  const rows = Array.from({ length: 5000 }, (_, index) => ({
    operationDate: "2026-11-06", type: "Расход" as const, category: "Большой импорт", amountRub: 100 + index,
    currency: "RUB" as const, originalAmount: 100 + index, exchangeRate: 1, note: `Строка ${index}`, source: "Тест", externalId: `bulk-5000-${index}`,
  }));
  const imported = await caller.imports.importTransactions({ name: "5000 строк", format: "csv", rows });
  expect(imported).toMatchObject({ imported: 5000, duplicates: 0 });
  expect((await caller.workspace.get()).transactions.filter((item) => item.source === "Тест" && item.externalId?.startsWith("bulk-5000-"))).toHaveLength(5000);
  await caller.imports.rollback({ id: imported.id! });
  expect((await caller.workspace.get()).transactions.filter((item) => item.externalId?.startsWith("bulk-5000-"))).toHaveLength(0);
});

test("параллельные повторы clientId возвращают одну операцию без ошибок", async () => {
  const user = await ensureLocalUser();
  const { appRouter } = await import("./router");
  const caller = appRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user });
  const clientId = crypto.randomUUID();
  const input = { operationDate: "2026-11-10", type: "Расход" as const, category: "Повтор", amountRub: 42, currency: "RUB" as const, originalAmount: 42, exchangeRate: 1, clientId };
  const results = await Promise.all(Array.from({ length: 20 }, () => caller.workspace.transactionCreate(input)));
  expect(new Set(results.map((result) => result.id)).size).toBe(1);
  expect((await caller.workspace.get()).transactions.filter((item) => item.clientId === clientId)).toHaveLength(1);
});

test("полный JSON-архив возвращает активы, правила, пакеты и свойства заметок", async () => {
  const user = await ensureLocalUser();
  const { appRouter } = await import("./router");
  const caller = appRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user });
  await caller.assets.create({ name: "Тестовый вклад", kind: "asset", category: "Вклады", valueRub: 12500, note: null });
  await caller.imports.ruleCreate({ name: "Тестовое правило", matchField: "note", pattern: "кофе", operationType: "Расход", category: "Кафе", priority: 10, enabled: true });
  const note = await caller.workspace.noteCreate({ parentId: null, kind: "note", title: "Свойства архива", content: "Текст", items: [], tags: ["проверка"], relatedLinks: [{ id: "link-1", section: "operations", targetId: null, label: "Операции" }], sortOrder: 20 });
  const archive = await caller.workspace.archiveGet();
  expect(archive.assets.some((item) => item.name === "Тестовый вклад")).toBe(true);
  expect(archive.transactionRules.some((item) => item.name === "Тестовое правило")).toBe(true);
  expect(archive.importBatches.length).toBeGreaterThan(0);

  await caller.workspace.noteUpdate({ id: note.id, tags: [], relatedLinks: [] });
  await caller.assets.delete({ id: archive.assets.find((item) => item.name === "Тестовый вклад")!.id });
  await caller.imports.ruleDelete({ id: archive.transactionRules.find((item) => item.name === "Тестовое правило")!.id });
  await caller.workspace.backupImport({ payload: JSON.stringify(archive) });

  expect((await caller.assets.list()).some((item) => item.name === "Тестовый вклад" && item.valueRub === 12500)).toBe(true);
  expect((await caller.imports.rules()).some((item) => item.name === "Тестовое правило" && item.pattern === "кофе")).toBe(true);
  const restoredNote = (await caller.workspace.get()).notes.find((item) => item.title === "Свойства архива");
  expect(restoredNote?.tags).toEqual(["проверка"]);
  expect(restoredNote?.relatedLinks?.[0]).toMatchObject({ section: "operations", label: "Операции" });
});
