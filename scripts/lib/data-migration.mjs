import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";

const DATABASE_NAME = "tochka-opory.db";

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function validateDatabase(database) {
  const client = createClient({ url: `file:${database}` });
  try {
    await client.execute("PRAGMA busy_timeout = 5000");
    await client.execute("PRAGMA query_only = ON");
    const integrity = await client.execute("PRAGMA integrity_check");
    if (integrity.rows[0]?.[0] !== "ok") throw new Error("база повреждена");
    const table = await client.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='users'");
    if (Number(table.rows[0]?.[0]) !== 1) throw new Error("это не база «Точки опоры»");
  } finally {
    client.close();
  }
}

async function copyAdditionalFiles(source, target) {
  await fs.mkdir(target, { recursive: true, mode: 0o700 });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name === DATABASE_NAME || entry.name === `${DATABASE_NAME}-wal` || entry.name === `${DATABASE_NAME}-shm`) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyAdditionalFiles(from, to);
    else if (entry.isFile()) {
      await fs.copyFile(from, to);
      await fs.chmod(to, 0o600);
    }
  }
}

async function findCandidates(cwd) {
  const parent = path.dirname(cwd);
  const candidates = [];
  for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(parent, entry.name);
    if (path.resolve(directory) === path.resolve(cwd)) continue;
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
      if (manifest.name !== "tochka-opory") continue;
      const dataDir = path.join(directory, "data");
      const database = path.join(dataDir, DATABASE_NAME);
      if (!(await exists(database))) continue;
      candidates.push({ directory, dataDir, database });
    } catch {
      // A neighbouring folder without a readable application manifest is unrelated.
    }
  }
  return candidates;
}

/**
 * Restore a previous adjacent installation only when there is no ambiguity.
 * VACUUM INTO reads the source consistently without changing its records.
 */
export async function restoreAdjacentData({ cwd = process.cwd(), env = process.env, logger = console } = {}) {
  if (env.APP_MODE === "cloud") return { status: "skipped", reason: "cloud" };
  if (env.DATA_DIR) return { status: "skipped", reason: "explicit-data-dir" };

  const targetDir = path.join(cwd, "data");
  const targetDatabase = path.join(targetDir, DATABASE_NAME);
  if (await exists(targetDatabase)) return { status: "skipped", reason: "database-exists" };

  const targetExists = await exists(targetDir);
  if (targetExists && (await fs.readdir(targetDir)).length > 0) {
    logger.warn("Папка data уже содержит файлы, но не основную базу. Автоматический перенос пропущен; проверьте её перед запуском.");
    return { status: "skipped", reason: "target-not-empty" };
  }

  const candidates = await findCandidates(cwd);
  if (candidates.length === 0) return { status: "skipped", reason: "no-candidates" };
  if (candidates.length > 1) {
    throw new Error(`Найдено несколько прежних установок: ${candidates.map(({ directory }) => path.basename(directory)).join(", ")}. Автоматический выбор небезопасен. Оставьте рядом только нужную прежнюю папку либо восстановите данные через JSON-архив в разделе «Данные».`);
  }

  const [source] = candidates;
  try {
    await validateDatabase(source.database);
  } catch (error) {
    throw new Error(`Прежняя база в папке «${path.basename(source.directory)}» не прошла проверку: ${error instanceof Error ? error.message : "неизвестная ошибка"}. Новая чистая база не будет подставлена вместо неё. Восстановите резервную копию в прежней установке или используйте JSON-архив.`);
  }

  const temporaryDir = path.join(cwd, `.data-migration-${process.pid}-${randomBytes(5).toString("hex")}`);
  const sourceClient = createClient({ url: `file:${source.database}` });
  try {
    await fs.mkdir(temporaryDir, { recursive: false, mode: 0o700 });
    await sourceClient.execute("PRAGMA busy_timeout = 5000");
    await sourceClient.execute({ sql: "VACUUM INTO ?", args: [path.join(temporaryDir, DATABASE_NAME)] });
    await validateDatabase(path.join(temporaryDir, DATABASE_NAME));
    await copyAdditionalFiles(source.dataDir, temporaryDir);
    await fs.chmod(path.join(temporaryDir, DATABASE_NAME), 0o600);
    if (targetExists) await fs.rmdir(targetDir);
    await fs.rename(temporaryDir, targetDir);
    logger.log(`Данные из прежней папки «${path.basename(source.directory)}» перенесены и проверены. Прежняя установка не изменена.`);
    return { status: "restored", sourceDir: source.directory, dataDir: targetDir };
  } catch (error) {
    await fs.rm(temporaryDir, { recursive: true, force: true });
    throw new Error(`Не удалось безопасно перенести данные: ${error instanceof Error ? error.message : "неизвестная ошибка"}. Новая база не активирована, прежняя папка не изменена.`);
  } finally {
    sourceClient.close();
  }
}
