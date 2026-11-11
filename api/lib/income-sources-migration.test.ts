import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

let root: string;
let client: Client;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tochka-income-migration-"));
  client = createClient({ url: `file:${path.join(root, "migration.db")}` });
});

afterEach(async () => {
  client.close();
  await fs.rm(root, { recursive: true, force: true });
});

async function applyMigration(file: string) {
  const sql = await fs.readFile(path.resolve("db/migrations", file), "utf8");
  await client.executeMultiple(sql.replaceAll("--> statement-breakpoint", ""));
}

describe("миграция регулярных источников дохода", () => {
  it("переносит старые режимы без изменения дней и не создаёт источники для нерегулярного дохода", async () => {
    const migrations = (await fs.readdir(path.resolve("db/migrations")))
      .filter((file) => /^000[0-6]_.*\.sql$/.test(file))
      .sort();
    for (const file of migrations) await applyMigration(file);

    await client.batch([
      { sql: "INSERT INTO appSettings (userId, startDate, incomeSchedule, salaryDay, secondSalaryDay) VALUES (?, '2026-01-01', ?, ?, ?)", args: [101, "monthly", 20, null] },
      { sql: "INSERT INTO appSettings (userId, startDate, incomeSchedule, salaryDay, secondSalaryDay) VALUES (?, '2026-01-01', ?, ?, ?)", args: [102, "twice", 10, 25] },
      { sql: "INSERT INTO appSettings (userId, startDate, incomeSchedule, salaryDay, secondSalaryDay) VALUES (?, '2026-01-01', ?, ?, ?)", args: [103, "irregular", 15, null] },
      { sql: "INSERT INTO appSettings (userId, startDate, incomeSchedule, salaryDay, secondSalaryDay) VALUES (?, '2026-01-01', ?, ?, ?)", args: [104, "twice", 12, null] },
    ], "write");

    await applyMigration("0007_concerned_risque.sql");
    const result = await client.execute("SELECT userId, name, dayOfMonth, sortOrder FROM incomeSources ORDER BY userId, sortOrder, id");

    expect(result.rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      dayOfMonth: row.dayOfMonth,
      sortOrder: row.sortOrder,
    }))).toEqual([
      { userId: 101, name: "Зарплата", dayOfMonth: 20, sortOrder: 0 },
      { userId: 102, name: "Первая зарплата", dayOfMonth: 10, sortOrder: 0 },
      { userId: 102, name: "Вторая зарплата", dayOfMonth: 25, sortOrder: 1 },
      { userId: 104, name: "Первая зарплата", dayOfMonth: 12, sortOrder: 0 },
      { userId: 104, name: "Вторая зарплата", dayOfMonth: null, sortOrder: 1 },
    ]);
    expect(result.rows.some((row) => row.userId === 103)).toBe(false);
  });
});
