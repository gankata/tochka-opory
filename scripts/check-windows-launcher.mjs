import { readFileSync } from "node:fs";

const batchPath = "Запустить Windows.bat";
const powershellPath = "scripts/Start-Windows.ps1";
const macPath = "Запустить офлайн.command";
const batch = readFileSync(batchPath);
const powershell = readFileSync(powershellPath);
const mac = readFileSync(macPath);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCrlf(buffer, label) {
  const text = buffer.toString("utf8");
  assert(!/(?<!\r)\n/.test(text), `${label}: найден Unix LF вместо Windows CRLF`);
  assert(!/\r(?!\n)/.test(text), `${label}: найден одиночный CR`);
}

assertCrlf(batch, batchPath);
assertCrlf(powershell, powershellPath);
assert(batch[0] !== 0xef, `${batchPath}: BAT не должен содержать UTF-8 BOM`);
assert([...batch].every((byte) => byte < 128), `${batchPath}: все команды BAT должны быть ASCII для cmd.exe`);
assert(powershell[0] === 0xef && powershell[1] === 0xbb && powershell[2] === 0xbf, `${powershellPath}: нужен UTF-8 BOM для Windows PowerShell 5.1`);
assert(!mac.includes(0x0d), `${macPath}: launcher macOS должен использовать LF`);

const batchText = batch.toString("ascii");
const command = 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\Start-Windows.ps1" %*';
assert(batchText.includes(command), `${batchPath}: команда PowerShell повреждена или изменена`);
assert(batchText.includes("if errorlevel 1 goto failed"), `${batchPath}: ошибка PowerShell должна оставлять окно открытым`);
assert(batchText.includes("exit /b 1"), `${batchPath}: ошибка должна возвращать ненулевой код`);

const powershellText = powershell.toString("utf8");
const macText = mac.toString("utf8");
const version = "22.23.4";
const hashes = {
  "darwin-arm64": "c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428",
  "darwin-x64": "efcc2b0db6f94bf53eddb038fe2b370277a042bd29e4f19b8f8e23598795b819",
  "win-arm64": "a8b8cd79cbbb3062435f449591d98dd63730bbbf30ce2d7cc3a6376c236cb111",
  "win-x64": "cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20",
};

for (const [label, text] of [[powershellPath, powershellText], [macPath, macText]]) {
  assert(text.includes(`$NodeVersion = "${version}"`) || text.includes(`NODE_VERSION="${version}"`), `${label}: не зафиксирована версия Node.js ${version}`);
  assert(text.includes("https://nodejs.org/dist/v$NodeVersion/") || text.includes("https://nodejs.org/dist/v$NODE_VERSION/"), `${label}: загрузка разрешена только с официального nodejs.org`);
  assert(text.includes("TOCHKA_FORCE_PORTABLE_NODE"), `${label}: отсутствует изолированный тестовый режим переносимого Node.js`);
  assert(text.includes(".toolchain"), `${label}: переносимый Node.js должен храниться в .toolchain`);
  assert(text.includes("package-lock.json"), `${label}: зависимости должны переустанавливаться после смены lock-файла`);
  assert(text.includes('@("ci")') || text.includes('"$NPM_BIN" ci'), `${label}: отсутствует автоматический npm ci`);
  assert(text.includes('@("run", "build")') || text.includes('"$NPM_BIN" run build'), `${label}: отсутствует автоматическая пересборка`);
}

for (const [platform, hash] of Object.entries(hashes)) {
  const text = platform.startsWith("win-") ? powershellText : macText;
  assert(text.includes(hash), `${platform}: контрольная сумма Node.js отсутствует или не совпадает`);
}
assert(powershellText.indexOf("Get-FileHash") < powershellText.indexOf("Expand-Archive"), "Windows: архив нельзя распаковывать до проверки SHA-256");
assert(macText.indexOf("ACTUAL_SHA256=") < macText.indexOf("tar -xzf"), "macOS: архив нельзя распаковывать до проверки SHA-256");
assert(powershellText.includes("[Net.SecurityProtocolType]::Tls12"), "Windows: для загрузки требуется TLS 1.2");
assert(macText.includes("--proto '=https' --tlsv1.2"), "macOS: загрузка должна требовать HTTPS и TLS 1.2");
assert(readFileSync(".gitignore", "utf8").includes(".toolchain/"), ".toolchain должен быть исключён из Git");

console.log("Launchers: BAT/PowerShell/macOS, Node.js SHA-256, npm ci и автоматическая сборка — OK.");
