import "dotenv/config";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "tochka-opory.db")}`,
  },
});
