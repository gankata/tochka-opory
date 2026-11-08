import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const RAW_BUDGET = 600_000;
const GZIP_BUDGET = 180_000;
const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "dist/public/index.html"), "utf8");
const entry = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];

if (!entry) {
  throw new Error("Не найден стартовый JavaScript в dist/public/index.html. Сначала выполните npm run build.");
}

const file = resolve(root, "dist/public", entry.replace(/^\//, ""));
const source = readFileSync(file);
const raw = source.length;
const gzip = gzipSync(source).length;
const format = (value) => `${(value / 1024).toFixed(1)} КБ`;

console.log(`Стартовый JavaScript: ${format(raw)}, gzip: ${format(gzip)}`);
console.log(`Бюджет: ${format(RAW_BUDGET)}, gzip: ${format(GZIP_BUDGET)}`);

if (raw > RAW_BUDGET || gzip > GZIP_BUDGET) {
  throw new Error("Стартовый JavaScript превысил бюджет. Проверьте новые статические импорты и разделение кода.");
}

console.log("Бюджет начальной загрузки соблюдён.");
