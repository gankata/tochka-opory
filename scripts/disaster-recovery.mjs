import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";

const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
const backupDir = path.join(dataDir, "backups");
const database = path.join(dataDir, "tochka-opory.db");
const requested = process.argv[2];

if (!requested) {
  const files = (await fs.readdir(backupDir)).filter((name) => name.endsWith(".sqlite")).sort().reverse();
  console.log("Доступные копии:\n" + files.map((name) => `  ${name}`).join("\n"));
  console.log("\nОстановите приложение и выполните: npm run db:recover -- <имя-файла>");
  process.exit(0);
}

if (path.basename(requested) !== requested || !requested.endsWith(".sqlite")) {
  throw new Error("Укажите имя SQLite-файла из data/backups, без пути");
}
const source = path.join(backupDir, requested);
const client = createClient({ url: `file:${source}` });
try {
  const integrity = await client.execute("PRAGMA integrity_check");
  if (integrity.rows[0]?.[0] !== "ok") throw new Error("Резервная копия повреждена");
  const table = await client.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='users'");
  if (Number(table.rows[0]?.[0]) !== 1) throw new Error("Это не база приложения");
} finally {
  client.close();
}

const rescueDir = path.join(dataDir, `before-recovery-${new Date().toISOString().replaceAll(":", "-")}`);
await fs.mkdir(rescueDir, { recursive: true, mode: 0o700 });
await fs.chmod(rescueDir, 0o700);
for (const suffix of ["", "-wal", "-shm"]) {
  const rescued = path.join(rescueDir, `tochka-opory.db${suffix}`);
  await fs.copyFile(`${database}${suffix}`, rescued).then(() => fs.chmod(rescued, 0o600)).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
const temp = path.join(dataDir, `.restore-${process.pid}.tmp`);
await fs.copyFile(source, temp);
await fs.chmod(temp, 0o600);
await fs.rename(temp, database);
await fs.rm(path.join(dataDir, "tochka-opory.db-wal"), { force: true });
await fs.rm(path.join(dataDir, "tochka-opory.db-shm"), { force: true });
console.log(`База восстановлена из ${requested}`);
console.log(`Прежние файлы сохранены в ${rescueDir}`);
