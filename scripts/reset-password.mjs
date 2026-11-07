import path from "node:path";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import readline from "node:readline";
import { createClient } from "@libsql/client";
import "dotenv/config";

const scrypt = promisify(scryptCallback);
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
const client = createClient({ url: `file:${path.join(dataDir, "tochka-opory.db")}` });

let pipedAnswersPromise;
let pipedAnswerIndex = 0;

async function hiddenQuestion(prompt) {
  process.stdout.write(prompt);
  if (!process.stdin.isTTY) {
    pipedAnswersPromise ??= new Promise((resolve) => {
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => resolve(input.split(/\r?\n/)));
    });
    const answers = await pipedAnswersPromise;
    process.stdout.write("\n");
    return answers[pipedAnswerIndex++] ?? "";
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => undefined;
    rl.on("close", () => process.stdout.write("\n"));
    rl.question("", (answer) => { rl.close(); resolve(answer); });
  });
}

try {
  await client.execute("PRAGMA busy_timeout = 5000");
  const accounts = await client.execute("SELECT id, username FROM localAuth ORDER BY id LIMIT 1");
  const account = accounts.rows[0];
  if (!account) throw new Error("Локальная учётная запись ещё не создана. Сначала откройте приложение и завершите первичную настройку.");
  const password = await hiddenQuestion("Новый пароль (минимум 10 символов): ");
  if (password.length < 10 || password.length > 128) throw new Error("Пароль должен содержать от 10 до 128 символов.");
  const confirmation = await hiddenQuestion("Повторите новый пароль: ");
  if (password !== confirmation) throw new Error("Пароли не совпадают. Никакие изменения не внесены.");
  const salt = randomBytes(18).toString("base64url");
  const hash = await scrypt(password, salt, 64);
  const transaction = await client.transaction("write");
  try {
    await transaction.execute({
      sql: "UPDATE localAuth SET passwordHash = ?, passwordSalt = ?, updatedAt = ? WHERE id = ?",
      args: [Buffer.from(hash).toString("base64url"), salt, Date.now(), account.id],
    });
    await transaction.execute({ sql: "DELETE FROM authSessions WHERE userId = (SELECT userId FROM localAuth WHERE id = ?)", args: [account.id] });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  } finally {
    transaction.close();
  }
  console.log(`Пароль для «${String(account.username)}» изменён. Все старые сессии завершены.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  client.close();
}
