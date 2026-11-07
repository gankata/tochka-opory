import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { env } from "./env";
import { getSqlClient } from "../queries/connection";
import { log } from "./logger";
import { parseFileBackupRetention } from "./backup-policy";

const BACKUP_SUFFIX = ".sqlite";
const RETAIN = parseFileBackupRetention(process.env.FILE_BACKUP_RETAIN);
const PERIOD_MS = 6 * 60 * 60 * 1000;
const tables = [
  "users", "appSettings", "transactions", "payments", "envelopes", "goals",
  "moodEntries", "moodOptions", "noteAssets", "notes", "reminders", "reconciliations", "backups", "activities",
  "importBatches", "transactionRules", "assetEntries", "localAuth", "authSessions", "apiTokens",
] as const;

let queue: Promise<unknown> = Promise.resolve();
let lastBackupFailureAt: Date | null = null;

function backupsDir() {
  return path.join(env.dataDir, "backups");
}

function databasePath() {
  if (!env.databaseUrl.startsWith("file:")) {
    throw new Error("Файловые копии доступны только для локальной базы");
  }
  return env.databaseUrl.slice(5);
}

async function verifyDatabase(filePath: string) {
  const client = createClient({ url: `file:${filePath}` });
  try {
    const result = await client.execute("PRAGMA integrity_check");
    const verdict = result.rows[0]?.[0];
    if (verdict !== "ok") throw new Error(`Повреждение SQLite: ${String(verdict)}`);
  } finally {
    client.close();
  }
}

export async function listFileBackups() {
  if (!env.isLocal) return [];
  try {
    const names = (await fs.readdir(backupsDir()))
      .filter((name) => name.endsWith(BACKUP_SUFFIX) && !name.startsWith("."));
    const items = await Promise.all(names.map(async (name) => {
      const stat = await fs.stat(path.join(backupsDir(), name));
      return { name, size: stat.size, createdAt: stat.mtime };
    }));
    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function pruneBackups() {
  const items = await listFileBackups();
  await Promise.all(items.slice(RETAIN).map((item) =>
    fs.unlink(path.join(backupsDir(), item.name)).catch(() => undefined),
  ));
}

async function performFileBackup(kind: string) {
  if (!env.isLocal) return null;
  await fs.mkdir(backupsDir(), { recursive: true, mode: 0o700 });
  await fs.chmod(backupsDir(), 0o700);
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const safeKind = kind.replace(/[^a-z-]/gi, "").slice(0, 30) || "auto";
  const name = `${stamp}-${safeKind}-${randomUUID().slice(0, 8)}${BACKUP_SUFFIX}`;
  const finalPath = path.join(backupsDir(), name);
  const tempPath = path.join(backupsDir(), `.${name}.tmp`);

  await fs.unlink(tempPath).catch(() => undefined);
  try {
    await getSqlClient().execute("PRAGMA wal_checkpoint(FULL)");
    await getSqlClient().execute({ sql: "VACUUM INTO ?", args: [tempPath] });
    await fs.chmod(tempPath, 0o600);
    await verifyDatabase(tempPath);
    await fs.rename(tempPath, finalPath);
    await pruneBackups();
    lastBackupFailureAt = null;
    log.info("file backup created", { name });
    return name;
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}

export function createFileBackup(kind = "auto") {
  const operation = queue.then(() => performFileBackup(kind));
  queue = operation.catch((error) => {
    lastBackupFailureAt = new Date();
    log.error("file backup failed", { error: error instanceof Error ? error.message : String(error) });
  });
  return operation;
}

export async function ensurePeriodicFileBackup() {
  if (!env.isLocal) return;
  try {
    await fs.mkdir(backupsDir(), { recursive: true, mode: 0o700 });
    await fs.chmod(backupsDir(), 0o700);
    const items = await listFileBackups();
    await Promise.all(items.map((item) => fs.chmod(path.join(backupsDir(), item.name), 0o600)));
    const workspaces = await getSqlClient().execute("SELECT count(*) FROM appSettings");
    if (Number(workspaces.rows[0]?.[0]) === 0) return;
    const [latest] = items;
    if (!latest || Date.now() - latest.createdAt.getTime() > PERIOD_MS) {
      await createFileBackup("startup");
    }
  } catch (error) {
    lastBackupFailureAt = new Date();
    // A read-only backup directory must not prevent the application from opening.
    log.error("periodic file backup failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function restoreFileBackup(name: string) {
  if (!env.isLocal || path.basename(name) !== name || !name.endsWith(BACKUP_SUFFIX)) {
    throw new Error("Некорректное имя резервной копии");
  }
  const sourcePath = path.join(backupsDir(), name);
  await verifyDatabase(sourcePath);
  await createFileBackup("before-restore");

  const client = getSqlClient();
  let attached = false;
  try {
    await client.execute({ sql: "ATTACH DATABASE ? AS restore_source", args: [sourcePath] });
    attached = true;
    const sourceTableRows = await client.execute("SELECT name FROM restore_source.sqlite_master WHERE type = 'table'");
    const sourceTables = new Set(sourceTableRows.rows.map((row) => String(row.name)));
    const sharedColumns = new Map<string, string[]>();
    for (const table of tables) {
      if (!sourceTables.has(table)) continue;
      const mainInfo = await client.execute(`PRAGMA main.table_info("${table}")`);
      const sourceInfo = await client.execute(`PRAGMA restore_source.table_info("${table}")`);
      const sourceNames = new Set(sourceInfo.rows.map((row) => String(row.name)));
      sharedColumns.set(table, mainInfo.rows.map((row) => String(row.name)).filter((column) => sourceNames.has(column)));
    }
    const transaction = await client.transaction("write");
    try {
      for (const table of tables) {
        await transaction.execute(`DELETE FROM main."${table}"`);
        const columns = sharedColumns.get(table) ?? [];
        if (columns.length) {
          const names = columns.map((column) => `"${column}"`).join(", ");
          await transaction.execute(`INSERT INTO main."${table}" (${names}) SELECT ${names} FROM restore_source."${table}"`);
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    } finally {
      transaction.close();
    }
    await client.execute("DETACH DATABASE restore_source");
    attached = false;
    await client.execute("PRAGMA wal_checkpoint(FULL)");
    log.info("file backup restored", { name });
  } finally {
    if (attached) await client.execute("DETACH DATABASE restore_source").catch(() => undefined);
  }
}

export async function fileBackupHealth() {
  const client = getSqlClient();
  const result = await client.execute("PRAGMA quick_check");
  const verdict = result.rows[0]?.[0];
  if (verdict !== "ok") throw new Error(`Проверка базы не пройдена: ${String(verdict)}`);
  const items = await listFileBackups();
  const latestBackupAt = items[0]?.createdAt ?? null;
  return {
    database: "ok",
    backupCount: items.length,
    latestBackupAt,
    databaseBytes: (await fs.stat(databasePath())).size,
    lastBackupFailureAt,
    stale: !latestBackupAt || Date.now() - latestBackupAt.getTime() > 24 * 60 * 60 * 1000,
  };
}
