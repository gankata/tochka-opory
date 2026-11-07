import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { env } from "../lib/env";
import { secureLocalDataDirectory, secureLocalDatabaseFiles } from "../lib/local-permissions";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };
secureLocalDataDirectory(env.dataDir);

const client = createClient({ url: env.databaseUrl });
await client.execute("PRAGMA busy_timeout = 5000");
await client.execute("PRAGMA journal_mode = WAL");
await client.execute("PRAGMA foreign_keys = ON");

const instance = drizzle(client, { schema: fullSchema });
await migrate(instance, {
  migrationsFolder: path.resolve(process.cwd(), "db/migrations"),
});
if (env.databaseUrl.startsWith("file:")) secureLocalDatabaseFiles(env.databaseUrl.slice(5));

export function getDb() {
  return instance;
}

export function getSqlClient() {
  return client;
}
