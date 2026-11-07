import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const skipped = new Set(["node_modules", "dist", "data", ".git", ".test-data", ".verification"]);
const privateExtensions = [".sqlite", ".db", ".db-shm", ".db-wal", ".env"];
const forbiddenText = ["***REMOVED***", "***REMOVED***", "***REMOVED***", "***REMOVED***", "***REMOVED***"];
const allowedBinary = new Set([".woff", ".ttf", ".png", ".jpg", ".jpeg", ".ico", ".webp"]);
const problems = [];

async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (privateExtensions.some((extension) => lower.endsWith(extension)) || lower.startsWith(".env")) {
      problems.push(`${relative}: личный или секретный файл нельзя публиковать`);
      continue;
    }
    if (allowedBinary.has(path.extname(lower)) || entry.name === "package-lock.json" || relative === "scripts/check-public.mjs") continue;
    const stat = await fs.stat(absolute);
    if (stat.size > 2_000_000) continue;
    const text = await fs.readFile(absolute, "utf8").catch(() => "");
    for (const marker of forbiddenText) {
      if (text.includes(marker)) problems.push(`${relative}: обнаружен личный маркер «${marker}»`);
    }
  }
}

await walk(root);
if (problems.length) {
  console.error(`Публичная проверка не пройдена:\n${problems.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("Публичная проверка пройдена: базы, копии и известные личные seed-данные не входят в исходники.");
