import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "./connection";
import {
  activities, appSettings, assetEntries, backups, envelopes, goals, importBatches, moodEntries, moodOptions,
  noteAssets, notes, payments, reconciliations, reminders, transactionRules, transactions,
} from "@db/schema";
import {
  defaultMoodOptions, importedEnvelopes, importedPayments, importedReminders,
  importedSettings, importedTransactions,
} from "../seed-data";
import { createFileBackup } from "../lib/file-backups";

export async function fetchWorkspace(userId: number) {
  const db = getDb();
  const [
    settingsRows, transactionRows, paymentRows, envelopeRows, goalRows,
    moodRows, optionRows, noteRows, reminderRows, reconciliationRows,
  ] = await Promise.all([
    db.select().from(appSettings).where(eq(appSettings.userId, userId)).limit(1),
    db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.operationDate), desc(transactions.id)),
    db.select().from(payments).where(eq(payments.userId, userId)).orderBy(asc(payments.id)),
    db.select().from(envelopes).where(eq(envelopes.userId, userId)).orderBy(asc(envelopes.sortOrder), asc(envelopes.id)),
    db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.id)),
    db.select().from(moodEntries).where(eq(moodEntries.userId, userId)).orderBy(desc(moodEntries.entryDate), desc(moodEntries.id)),
    db.select().from(moodOptions).where(eq(moodOptions.userId, userId)).orderBy(asc(moodOptions.sortOrder), asc(moodOptions.id)),
    db.select().from(notes).where(eq(notes.userId, userId)).orderBy(asc(notes.sortOrder), asc(notes.id)),
    db.select().from(reminders).where(eq(reminders.userId, userId)).orderBy(asc(reminders.startAt)),
    db.select().from(reconciliations).where(eq(reconciliations.userId, userId)).orderBy(desc(reconciliations.createdAt)),
  ]);
  return {
    settings: settingsRows[0] ?? null,
    transactions: transactionRows,
    payments: paymentRows,
    envelopes: envelopeRows,
    goals: goalRows,
    moods: moodRows,
    options: optionRows,
    notes: noteRows,
    reminders: reminderRows,
    reconciliations: reconciliationRows,
  };
}

export async function fetchWorkspaceSnapshot(userId: number) {
  const [workspace, assetRows, capitalRows, batchRows, ruleRows] = await Promise.all([
    fetchWorkspace(userId),
    getDb().select().from(noteAssets).where(eq(noteAssets.userId, userId)),
    getDb().select().from(assetEntries).where(eq(assetEntries.userId, userId)),
    getDb().select().from(importBatches).where(eq(importBatches.userId, userId)),
    getDb().select().from(transactionRules).where(eq(transactionRules.userId, userId)),
  ]);
  return {
    ...workspace,
    assets: capitalRows,
    importBatches: batchRows,
    transactionRules: ruleRows,
    noteAssets: assetRows.map((asset) => ({
      id: asset.id, noteId: asset.noteId, name: asset.name, mime: asset.mime,
      data: Buffer.from(asset.data).toString("base64"), createdAt: asset.createdAt,
    })),
  };
}

export type WorkspaceSnapshot = Awaited<ReturnType<typeof fetchWorkspaceSnapshot>>;

export async function createSnapshot(userId: number, name: string, kind: "manual" | "auto" | "import" = "manual") {
  const payload = await fetchWorkspaceSnapshot(userId);
  const [{ id }] = await getDb().insert(backups).values({
    userId, name, kind, payload: JSON.stringify(payload),
  }).returning();
  await createFileBackup(kind);
  return { id, createdAt: new Date() };
}

export async function ensureWorkspace(userId: number, snapshotCreator = createSnapshot) {
  const db = getDb();
  const existing = await db.select({ id: appSettings.id }).from(appSettings).where(eq(appSettings.userId, userId)).limit(1);
  if (existing.length) {
    const latest = await db.select({ createdAt: backups.createdAt }).from(backups)
      .where(and(eq(backups.userId, userId), eq(backups.kind, "auto")))
      .orderBy(desc(backups.createdAt)).limit(1);
    if (!latest.length || Date.now() - latest[0].createdAt.getTime() > 24 * 60 * 60 * 1000) {
      try {
        await snapshotCreator(userId, "Автоматическая ежедневная копия", "auto");
      } catch (error) {
        const { log } = await import("../lib/logger");
        log.error("automatic workspace backup failed", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return;
  }

  await db.transaction(async (tx) => {
    await tx.insert(appSettings).values({ userId, ...importedSettings });
    if (importedTransactions.length) await tx.insert(transactions).values(importedTransactions.map((row) => ({ ...row, userId })));
    if (importedPayments.length) await tx.insert(payments).values(importedPayments.map((row) => ({ ...row, userId })));
    await tx.insert(envelopes).values(importedEnvelopes.map(([name, required, estimatedAmount, note], sortOrder) => ({
      userId, name, required, estimatedAmount, monthlyLimit: null, note, sortOrder,
    })));
    const options = Object.entries(defaultMoodOptions).flatMap(([kind, labels]) =>
      labels.map((label, sortOrder) => ({ userId, kind: kind as "emotion" | "topic" | "time", label, sortOrder })),
    );
    await tx.insert(moodOptions).values(options);
    if (importedReminders.length) await tx.insert(reminders).values(importedReminders.map((row) => ({ ...row, userId, enabled: true })));
    await tx.insert(activities).values({
      userId, action: "create", entityType: "workspace", entityId: null,
      summary: "Создано чистое личное пространство без демонстрационных финансовых записей",
    });
  });
  await createSnapshot(userId, "Начальное чистое пространство", "import");
}

export async function recordActivity(userId: number, action: string, entityType: string, entityId: number | null, summary: string) {
  await getDb().insert(activities).values({ userId, action, entityType, entityId, summary });
}

export async function recentActivity(userId: number) {
  return getDb().select().from(activities).where(eq(activities.userId, userId)).orderBy(desc(activities.createdAt)).limit(60);
}

export async function listSnapshots(userId: number) {
  return getDb().select({ id: backups.id, name: backups.name, kind: backups.kind, createdAt: backups.createdAt })
    .from(backups).where(eq(backups.userId, userId)).orderBy(desc(backups.createdAt)).limit(100);
}
