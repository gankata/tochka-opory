import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const generatedDirectories = new Set([
  "node_modules", "dist", "data", ".git", ".test-data", ".test-recovery",
  ".verification", ".toolchain", ".release", ".gradle", ".android-build", "build",
]);
const forbiddenFiles = new Set(["roadmap.md", "work.md", "product-guide.md", "info.md", "competitive-analysis.md", "wire.jsonl"]);
const privateExtensions = [
  ".sqlite", ".sqlite3", ".db", ".db-shm", ".db-wal", ".env", ".apk",
  ".zip", ".tar", ".gz", ".7z", ".keystore", ".jks", ".log",
];
const binaryExtensions = new Set([
  ".woff", ".woff2", ".ttf", ".otf", ".png", ".jpg", ".jpeg", ".ico", ".webp", ".gif", ".jar",
]);
const secretPatterns = [
  ["закрытый ключ", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["токен GitHub", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
  ["API-ключ", /\bsk-[A-Za-z0-9_-]{20,}\b|\bAIza[0-9A-Za-z_-]{30,}\b|\bAKIA[0-9A-Z]{16}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ["локальный путь или журнал чата", /\/Users\/[^/\s]+|\/mnt\/agents|kimi-desktop|wire\.jsonl|message-queue-assets/],
  ["присвоенные учётные данные", /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*["'][^"'\n]{12,}["']/i],
  ["личная финансовая подсказка", /Исходная\s+сверка\s*:/i],
  ["формулировка из личной миграции", /старых\s+таблиц|исходного\s+бюджета|Исходное\s+расписание\s+из\s+ICS/i],
  ["специфическая личная рекомендация", /перед\s+терапевтической\s+сессией/i],
  ["большое число как начальное значение формы", /useState(?:<[^>]+>)?\(\s*["']\d{4,}(?:\.\d+)?["']\s*\)/],
];
const problems = [];

async function candidateFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
    return output.split("\0").filter(Boolean);
  } catch {
    const files = [];
    async function walk(directory) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && generatedDirectories.has(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(absolute);
        else files.push(path.relative(root, absolute));
      }
    }
    await walk(root);
    return files;
  }
}

for (const relative of await candidateFiles()) {
  const lower = relative.toLowerCase();
  const basename = path.basename(lower);
  const firstDirectory = lower.split(path.sep)[0];
  if (generatedDirectories.has(firstDirectory) || forbiddenFiles.has(basename)) {
    problems.push(`${relative}: внутренний или личный файл нельзя публиковать`);
    continue;
  }
  if (basename.startsWith(".env") || privateExtensions.some((extension) => lower.endsWith(extension))) {
    problems.push(`${relative}: секрет, база, архив или ключ нельзя публиковать`);
    continue;
  }
  if (binaryExtensions.has(path.extname(lower)) || relative === "scripts/check-public.mjs") continue;
  const absolute = path.join(root, relative);
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat || stat.size > 5_000_000) continue;
  const content = await fs.readFile(absolute);
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) problems.push(`${relative}: обнаружен возможный ${label}`);
  }
}

if (problems.length) {
  console.error(`Публичная проверка не пройдена:\n${problems.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("Публичная проверка пройдена: в исходниках не найдено личных документов, баз, архивов, ключей и локальных журналов.");
