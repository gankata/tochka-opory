import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { restoreAdjacentData } from "../../scripts/lib/data-migration.mjs";

const silent = { log: () => {}, warn: () => {} };
let root: string;
let current: string;

async function applicationFolder(name: string, withDatabase = true) {
  const directory = path.join(root, name);
  await fs.mkdir(path.join(directory, "data"), { recursive: true });
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "tochka-opory" }));
  if (withDatabase) await createDatabase(path.join(directory, "data", "tochka-opory.db"), name);
  return directory;
}

async function createDatabase(database: string, marker: string) {
  const client = createClient({ url: `file:${database}` });
  try {
    await client.execute("CREATE TABLE users (id TEXT PRIMARY KEY, marker TEXT NOT NULL)");
    await client.execute({ sql: "INSERT INTO users (id, marker) VALUES (?, ?)", args: ["owner", marker] });
  } finally {
    client.close();
  }
}

async function marker(database: string) {
  const client = createClient({ url: `file:${database}` });
  try {
    const result = await client.execute("SELECT marker FROM users WHERE id = 'owner'");
    return result.rows[0]?.[0];
  } finally {
    client.close();
  }
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tochka-migration-test-"));
  current = path.join(root, "new-version");
  await fs.mkdir(current);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("restoreAdjacentData", () => {
  it("restores the only adjacent application database and additional files", async () => {
    const previous = await applicationFolder("previous-version");
    await fs.writeFile(path.join(previous, "data", "backups", "manual.txt"), "backup", { encoding: "utf8", flag: "w" }).catch(async (error) => {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(path.join(previous, "data", "backups"));
      await fs.writeFile(path.join(previous, "data", "backups", "manual.txt"), "backup");
    });

    const result = await restoreAdjacentData({ cwd: current, env: {}, logger: silent });

    expect(result.status).toBe("restored");
    expect(await marker(path.join(current, "data", "tochka-opory.db"))).toBe("previous-version");
    expect(await fs.readFile(path.join(current, "data", "backups", "manual.txt"), "utf8")).toBe("backup");
    expect(await marker(path.join(previous, "data", "tochka-opory.db"))).toBe("previous-version");
  });

  it("refuses to choose between multiple previous installations", async () => {
    await applicationFolder("previous-a");
    await applicationFolder("previous-b");

    await expect(restoreAdjacentData({ cwd: current, env: {}, logger: silent })).rejects.toThrow("несколько прежних установок");
    await expect(fs.access(path.join(current, "data", "tochka-opory.db"))).rejects.toThrow();
  });

  it("never overwrites an existing database", async () => {
    await applicationFolder("previous-version");
    await fs.mkdir(path.join(current, "data"));
    await createDatabase(path.join(current, "data", "tochka-opory.db"), "current-data");

    const result = await restoreAdjacentData({ cwd: current, env: {}, logger: silent });

    expect(result).toEqual({ status: "skipped", reason: "database-exists" });
    expect(await marker(path.join(current, "data", "tochka-opory.db"))).toBe("current-data");
  });

  it("does not inspect neighbours when DATA_DIR is explicit", async () => {
    await applicationFolder("previous-version");
    const result = await restoreAdjacentData({ cwd: current, env: { DATA_DIR: path.join(root, "elsewhere") }, logger: silent });
    expect(result).toEqual({ status: "skipped", reason: "explicit-data-dir" });
    await expect(fs.access(path.join(current, "data"))).rejects.toThrow();
  });

  it("ignores foreign neighbouring folders", async () => {
    const foreign = path.join(root, "another-app");
    await fs.mkdir(path.join(foreign, "data"), { recursive: true });
    await fs.writeFile(path.join(foreign, "package.json"), JSON.stringify({ name: "another-app" }));
    await createDatabase(path.join(foreign, "data", "tochka-opory.db"), "foreign");

    const result = await restoreAdjacentData({ cwd: current, env: {}, logger: silent });
    expect(result).toEqual({ status: "skipped", reason: "no-candidates" });
    await expect(fs.access(path.join(current, "data"))).rejects.toThrow();
  });

  it("rejects a damaged source instead of opening a clean database", async () => {
    const previous = await applicationFolder("previous-version", false);
    await fs.writeFile(path.join(previous, "data", "tochka-opory.db"), "not a sqlite database");

    await expect(restoreAdjacentData({ cwd: current, env: {}, logger: silent })).rejects.toThrow("не прошла проверку");
    await expect(fs.access(path.join(current, "data", "tochka-opory.db"))).rejects.toThrow();
  });

  it("uses the restored database on the second run", async () => {
    await applicationFolder("previous-version");
    await restoreAdjacentData({ cwd: current, env: {}, logger: silent });
    await createDatabase(path.join(root, "unrelated.sqlite"), "unrelated");

    const second = await restoreAdjacentData({ cwd: current, env: {}, logger: silent });
    expect(second).toEqual({ status: "skipped", reason: "database-exists" });
    expect(await marker(path.join(current, "data", "tochka-opory.db"))).toBe("previous-version");
  });
});
