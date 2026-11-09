import { spawn } from "node:child_process";
import fs from "node:fs";
import { restoreAdjacentData } from "./lib/data-migration.mjs";

if (!fs.existsSync("dist/boot.js")) {
  console.error("Сначала выполните npm run build");
  process.exit(1);
}

try {
  await restoreAdjacentData();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

let child;
let stopping = false;
let failures = 0;
let stableTimer;

function start() {
  child = spawn(process.execPath, ["dist/boot.js"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  stableTimer = setTimeout(() => { failures = 0; }, 30_000);
  child.once("exit", (code, signal) => {
    clearTimeout(stableTimer);
    if (stopping) return;
    const delay = Math.min(1000 * 2 ** failures++, 10_000);
    console.error(`Сервер остановился (code=${code}, signal=${signal}). Перезапуск через ${delay / 1000} с…`);
    setTimeout(start, delay);
  });
}

function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(stableTimer);
  if (!child || child.exitCode !== null) process.exit(0);
  child.once("exit", () => process.exit(0));
  child.kill("SIGTERM");
  setTimeout(() => {
    child.kill("SIGKILL");
    process.exit(1);
  }, 6000).unref();
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
start();
