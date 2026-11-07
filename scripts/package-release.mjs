import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const expectedTag = `v${packageJson.version}`;
const tag = process.argv[2] ?? expectedTag;

if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag !== expectedTag) {
  throw new Error(`Используйте тег ${expectedTag}, совпадающий с версией в package.json.`);
}

execFileSync("git", ["rev-parse", "--verify", `${tag}^{commit}`], { cwd: root, stdio: "ignore" });

const outputDirectory = path.join(root, ".release");
const archiveName = "tochka-opory.zip";
const archivePath = path.join(outputDirectory, archiveName);
await fs.mkdir(outputDirectory, { recursive: true });

execFileSync("git", [
  "archive",
  "--format=zip",
  "--prefix=tochka-opory/",
  `--output=${archivePath}`,
  tag,
], { cwd: root, stdio: "inherit" });

const archive = await fs.readFile(archivePath);
const checksum = createHash("sha256").update(archive).digest("hex");
const checksumPath = `${archivePath}.sha256`;
await fs.writeFile(checksumPath, `${checksum}  ${archiveName}\n`);

console.log(`Архив готов: ${path.relative(root, archivePath)} (${archive.length} байт)`);
console.log(`SHA-256: ${checksum}`);
console.log(`Контрольная сумма: ${path.relative(root, checksumPath)}`);
