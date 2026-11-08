import { readFileSync } from "node:fs";

const batchPath = "Запустить Windows.bat";
const powershellPath = "scripts/Start-Windows.ps1";
const batch = readFileSync(batchPath);
const powershell = readFileSync(powershellPath);

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

const batchText = batch.toString("ascii");
const command = 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\Start-Windows.ps1" %*';
assert(batchText.includes(command), `${batchPath}: команда PowerShell повреждена или изменена`);
assert(batchText.includes("if errorlevel 1 goto failed"), `${batchPath}: ошибка PowerShell должна оставлять окно открытым`);
assert(batchText.includes("exit /b 1"), `${batchPath}: ошибка должна возвращать ненулевой код`);

console.log("Windows launcher: ASCII BAT, CRLF, UTF-8 BOM PowerShell и команда запуска — OK.");
