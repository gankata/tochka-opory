import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient as createSqlClient } from "@libsql/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { chromium } from "playwright";
import superjson from "superjson";

const port = Number(process.env.STRESS_PORT ?? 3103);
const origin = `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.STRESS_OUTPUT ?? ".verification/stress");
const dataDir = path.join(output, "data");
const report = { startedAt: new Date().toISOString(), checks: [], failures: [], timings: {}, counts: {} };
const failures = [];
let server;
let serverLogs = "";
let browser;

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

function check(condition, name, details) {
  report.checks.push({ name, ok: Boolean(condition), details });
  if (!condition) {
    failures.push(`${name}${details ? `: ${JSON.stringify(details)}` : ""}`);
    console.error(`FAIL ${name}`, details ?? "");
  } else console.log(`OK ${name}`);
}

async function timed(name, operation) {
  const start = performance.now();
  const result = await operation();
  report.timings[name] = Math.round((performance.now() - start) * 10) / 10;
  console.log(`TIME ${name}: ${report.timings[name]} ms`);
  return result;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Stress server did not start\n${serverLogs}`);
}

async function startServer() {
  server = spawn(process.execPath, ["dist/boot.js"], {
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverLogs = `${serverLogs}${chunk}`.slice(-300_000); });
  server.stderr.on("data", (chunk) => { serverLogs = `${serverLogs}${chunk}`.slice(-300_000); });
  await waitForServer();
}

async function stopServer(signal = "SIGTERM") {
  if (!server || server.exitCode !== null || server.signalCode) return;
  const exited = once(server, "exit");
  server.kill(signal);
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Server did not stop")), 15000))]);
}

let sessionCookie = "";
const client = createTRPCClient({
  links: [httpBatchLink({
    url: `${origin}/api/trpc`,
    transformer: superjson,
    async fetch(input, init) {
      const headers = new Headers(init?.headers);
      headers.set("Origin", origin);
      if (sessionCookie) headers.set("Cookie", sessionCookie);
      const response = await fetch(input, { ...init, headers });
      const cookies = response.headers.getSetCookie();
      const session = cookies.find((value) => value.startsWith("tochka_local_sid="));
      if (session) sessionCookie = session.split(";")[0];
      return response;
    },
  })],
});

function operation(clientId, note, amount = 25) {
  return {
    operationDate: "2026-11-10",
    type: "Расход",
    category: "Еда",
    amountRub: amount,
    originalAmount: amount,
    currency: "RUB",
    exchangeRate: 1,
    note,
    source: "stress-test",
    clientId,
  };
}

async function apiPost(payload) {
  const response = await fetch(`${origin}/api/v1/transactions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

async function databaseVerdict(filePath) {
  const sql = createSqlClient({ url: `file:${filePath}` });
  try {
    const integrity = await sql.execute("PRAGMA integrity_check");
    const count = await sql.execute("SELECT count(*) FROM transactions");
    return { integrity: integrity.rows[0]?.[0], transactions: Number(count.rows[0]?.[0]) };
  } finally {
    sql.close();
  }
}

let apiToken;
let expectedTransactions = 5000;
try {
  await timed("coldStart", startServer);
  await client.auth.setup.mutate({ username: "stress", password: process.env.STRESS_TEST_PASSWORD ?? "stress-test-password" });
  const createdToken = await client.access.createToken.mutate({ name: "Нагрузочная проверка", scope: "write", expiresDays: null });
  apiToken = createdToken.token;
  check(apiToken.startsWith("top_"), "isolated authentication and API token");

  const rows = Array.from({ length: 5000 }, (_, index) => {
    const income = index % 5 === 0;
    const amount = 100 + (index % 500);
    const month = (index % 11) + 1;
    const day = (index % 28) + 1;
    return {
      operationDate: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      type: income ? "Доход" : "Расход",
      category: income ? "Зарплата" : ["Еда", "Кафе", "Транспорт"][index % 3],
      amountRub: amount,
      originalAmount: amount,
      currency: "RUB",
      exchangeRate: 1,
      note: `Нагрузочная операция ${index}`,
      source: "stress-import",
      externalId: `stress-${index}`,
    };
  });
  const imported = await timed("import5000", () => client.imports.importTransactions.mutate({ name: "5000 обобщённых операций", format: "csv", rows }));
  check(imported.imported === 5000 && imported.duplicates === 0, "bulk import of 5000 operations", imported);
  const duplicateImport = await timed("duplicateImport5000", () => client.imports.importTransactions.mutate({ name: "Повторный импорт", format: "csv", rows }));
  check(duplicateImport.imported === 0 && duplicateImport.duplicates === 5000, "duplicate bulk import is fully idempotent", duplicateImport);
  const workspace = await timed("workspace5000", () => client.workspace.get.query());
  check(workspace.transactions.length === 5000, "workspace returns the full large journal", { count: workspace.transactions.length });

  const sameApiId = crypto.randomUUID();
  const sameApiResults = await timed("concurrentSameClientIdApi", () => Promise.all(
    Array.from({ length: 20 }, () => apiPost(operation(sameApiId, "Параллельная повторная отправка API"))),
  ));
  check(sameApiResults.filter((result) => result.status === 201).length === 1
    && sameApiResults.filter((result) => result.status === 200 && result.body.idempotent).length === 19,
  "20 simultaneous identical API writes create exactly one acknowledged operation",
  sameApiResults.map((result) => ({ status: result.status, idempotent: result.body.idempotent, error: result.body.error })));
  expectedTransactions += 1;

  const sameTrpcId = crypto.randomUUID();
  const sameTrpcResults = await timed("concurrentSameClientIdTrpc", () => Promise.allSettled(
    Array.from({ length: 20 }, () => client.workspace.transactionCreate.mutate(operation(sameTrpcId, "Параллельная повторная отправка tRPC"))),
  ));
  const trpcIds = sameTrpcResults.filter((result) => result.status === "fulfilled").map((result) => result.value.id);
  check(sameTrpcResults.every((result) => result.status === "fulfilled") && new Set(trpcIds).size === 1,
    "20 simultaneous identical tRPC writes return one operation id",
    sameTrpcResults.map((result) => result.status === "fulfilled" ? { status: result.status, id: result.value.id } : { status: result.status, error: result.reason?.message }));
  expectedTransactions += 1;

  const distinctResults = await timed("concurrentDistinctWrites", () => Promise.all(
    Array.from({ length: 20 }, (_, index) => apiPost(operation(crypto.randomUUID(), `Параллельная независимая операция ${index}`, 30 + index))),
  ));
  check(distinctResults.every((result) => result.status === 201), "20 independent parallel writes all succeed", distinctResults.map((result) => result.status));
  expectedTransactions += 20;

  const readResults = await timed("concurrentReads40", () => Promise.all(Array.from({ length: 40 }, async () => {
    const start = performance.now();
    const response = await fetch(`${origin}/api/v1/transactions?limit=100`, { headers: { Authorization: `Bearer ${apiToken}` } });
    const body = await response.json();
    return { status: response.status, count: body.count, duration: performance.now() - start };
  })));
  const sortedReadTimes = readResults.map((result) => result.duration).sort((a, b) => a - b);
  report.timings.readP95 = Math.round(sortedReadTimes[Math.floor(sortedReadTimes.length * 0.95) - 1] * 10) / 10;
  check(readResults.every((result) => result.status === 200 && result.count === 100), "40 concurrent large-journal reads succeed", { p95: report.timings.readP95 });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const [cookieName, cookieValue] = sessionCookie.split("=");
  await context.addCookies([{ name: cookieName, value: cookieValue, url: origin, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const browserErrors = [];
  const browserBadResponses = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) browserBadResponses.push(`${response.status()} ${response.url()}`); });

  await page.goto(`${origin}/operations?new=1&date=2026-11-10`, { waitUntil: "networkidle" });
  const offlineDialog = page.getByRole("dialog", { name: "Новая операция", exact: true });
  await offlineDialog.getByRole("combobox", { name: "Категория", exact: true }).click();
  await page.getByRole("option", { name: "Еда", exact: true }).click();
  await offlineDialog.getByLabel("Сумма, ₽", { exact: true }).fill("42");
  await offlineDialog.getByLabel("Комментарий", { exact: true }).fill("Офлайн-очередь под нагрузкой");
  await context.setOffline(true);
  await offlineDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText("Операция сохранена в очереди этого браузера и отправится при восстановлении связи", { exact: true }).waitFor();
  check(await page.evaluate(() => JSON.parse(localStorage.getItem("tochka-offline-operations") ?? "[]").length === 1), "offline operation persists in the browser queue");
  await context.setOffline(false);
  await page.getByText("Отложенные операции синхронизированы: 1", { exact: true }).waitFor();
  await page.getByLabel("Поиск операций", { exact: true }).fill("Офлайн-очередь под нагрузкой");
  await page.locator("article").filter({ hasText: "Офлайн-очередь под нагрузкой" }).waitFor();
  check(await page.evaluate(() => JSON.parse(localStorage.getItem("tochka-offline-operations") ?? "[]").length === 0), "offline queue synchronizes once when connectivity returns");
  expectedTransactions += 1;

  const backup = await timed("largeBackup", () => client.workspace.fileBackupCreate.mutate());
  const backupVerdict = await databaseVerdict(path.join(dataDir, "backups", backup.name));
  check(backupVerdict.integrity === "ok" && backupVerdict.transactions === expectedTransactions, "large SQLite backup is integral and complete", backupVerdict);
  const temporary = await apiPost(operation(crypto.randomUUID(), "Временная операция для проверки восстановления"));
  check(temporary.status === 201, "post-backup canary operation is created");
  await timed("largeRestore", () => client.workspace.fileBackupRestore.mutate({ name: backup.name }));
  const restored = await client.workspace.get.query();
  check(restored.transactions.length === expectedTransactions
    && !restored.transactions.some((item) => item.note === "Временная операция для проверки восстановления"),
  "SQLite restore returns the exact pre-backup journal", { expected: expectedTransactions, actual: restored.transactions.length });

  const durable = await apiPost(operation(crypto.randomUUID(), "Операция перед внезапной остановкой"));
  check(durable.status === 201, "pre-crash operation is acknowledged");
  expectedTransactions += 1;
  await stopServer("SIGKILL");
  await timed("restartAfterCrash", startServer);
  const afterCrash = await client.workspace.get.query();
  check(afterCrash.transactions.length === expectedTransactions
    && afterCrash.transactions.some((item) => item.note === "Операция перед внезапной остановкой"),
  "acknowledged operation survives abrupt server termination", { expected: expectedTransactions, actual: afterCrash.transactions.length });

  for (const [name, route, heading] of [
    ["largeDashboardMobile", "/", "Всё важное — на одном экране"],
    ["largeTransactionsMobile", "/operations", "Журнал операций"],
    ["largeAnalyticsMobile", "/analytics", "Закономерности в ваших деньгах"],
  ]) {
    await timed(name, async () => {
      await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    });
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${name} has no horizontal overflow`);
    await page.screenshot({ path: path.join(output, `${name}.jpg`), type: "jpeg", quality: 85, fullPage: false });
  }
  await page.goto(`${origin}/operations`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Журнал операций", exact: true }).waitFor();
  await timed("largeJournalSearch", async () => {
    await page.getByLabel("Поиск операций", { exact: true }).fill("Нагрузочная операция 4999");
    await page.locator("article").filter({ hasText: "Нагрузочная операция 4999" }).waitFor();
  });
  check(await page.locator("article").count() === 1, "large journal search narrows the mobile list to one operation");
  check(browserErrors.length === 0 && browserBadResponses.length === 0, "large-data mobile browser gate", { browserErrors, browserBadResponses });
  await context.close();
  await browser.close();
  browser = undefined;

  const database = await databaseVerdict(path.join(dataDir, "tochka-opory.db"));
  report.counts = { expectedTransactions, databaseTransactions: database.transactions, readP95: report.timings.readP95 };
  check(database.integrity === "ok" && database.transactions === expectedTransactions, "final SQLite integrity and exact transaction count", database);
  check(report.timings.import5000 < 30_000 && report.timings.duplicateImport5000 < 30_000, "bulk imports stay within the 30-second stress budget", report.timings);
  check(report.timings.readP95 < 2000, "concurrent read p95 stays below two seconds", { p95: report.timings.readP95 });
  check(["largeDashboardMobile", "largeTransactionsMobile", "largeAnalyticsMobile"].every((name) => report.timings[name] < 15000), "large-data mobile routes stay within the 15-second stress budget", report.timings);

  report.finishedAt = new Date().toISOString();
  report.failures = failures;
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  if (failures.length) throw new Error(`Stress gate failed:\n${failures.join("\n")}`);
  console.log("Stress, concurrency, offline, backup, crash recovery and large-data mobile checks: OK");
} catch (error) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
  report.failures = failures.length ? failures : [message];
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.error(serverLogs.slice(-4000));
  throw new Error(`Stress verification failed: ${report.failures.join(" | ").slice(0, 4000)}`);
} finally {
  if (browser) await browser.close();
  if (server) await stopServer().catch(() => undefined);
}
