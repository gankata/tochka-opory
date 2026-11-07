import "dotenv/config";
import path from "node:path";

const isLocal = process.env.APP_MODE !== "cloud";
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "data"));

function cloudValue(name: string): string {
  const value = process.env[name];
  if (!value && !isLocal) {
    throw new Error(`Missing required environment variable in cloud mode: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: cloudValue("APP_ID"),
  appSecret: isLocal ? "local-only-session-secret" : cloudValue("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  isLocal,
  dataDir,
  databaseUrl: isLocal
    ? `file:${path.join(dataDir, "tochka-opory.db")}`
    : cloudValue("DATABASE_URL"),
  kimiAuthUrl: isLocal ? "http://127.0.0.1" : cloudValue("KIMI_AUTH_URL"),
  kimiOpenUrl: cloudValue("KIMI_OPEN_URL"),
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
};
