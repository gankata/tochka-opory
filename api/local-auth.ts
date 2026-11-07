import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import * as cookie from "cookie";
import { and, eq, gt, ne } from "drizzle-orm";
import { LocalSession } from "@contracts/constants";
import { authSessions, localAuth, users, type User } from "@db/schema";
import { getDb } from "./queries/connection";
import { ensureLocalUser } from "./queries/users";

const scrypt = promisify(scryptCallback);

export function normalizeUsername(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase();
}

async function derivePassword(password: string, salt: string) {
  return (await scrypt(password, salt, 64)) as Buffer;
}

export async function makePasswordRecord(password: string) {
  const passwordSalt = randomBytes(18).toString("base64url");
  const hash = await derivePassword(password, passwordSalt);
  return { passwordSalt, passwordHash: hash.toString("base64url") };
}

async function passwordMatches(password: string, salt: string, expected: string) {
  const actual = await derivePassword(password, salt);
  const expectedBytes = Buffer.from(expected, "base64url");
  return expectedBytes.length === actual.length && timingSafeEqual(actual, expectedBytes);
}

export function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export async function localAuthExists() {
  const rows = await getDb().select({ id: localAuth.id }).from(localAuth).limit(1);
  return Boolean(rows.length);
}

export async function setupLocalAuth(username: string, password: string) {
  if (await localAuthExists()) return null;
  const user = await ensureLocalUser();
  const record = await makePasswordRecord(password);
  try {
    await getDb().insert(localAuth).values({ userId: user.id, username: normalizeUsername(username), ...record });
  } catch {
    return null;
  }
  return user;
}

export async function verifyLocalLogin(username: string, password: string): Promise<User | null> {
  const rows = await getDb().select().from(localAuth).where(eq(localAuth.username, normalizeUsername(username))).limit(1);
  const account = rows[0];
  const salt = account?.passwordSalt ?? "offline-invalid-user-salt";
  const expected = account?.passwordHash ?? Buffer.alloc(64).toString("base64url");
  const matches = await passwordMatches(password, salt, expected);
  if (!account || !matches) return null;
  const found = await getDb().select().from(users).where(eq(users.id, account.userId)).limit(1);
  return found[0] ?? null;
}

export async function createLocalSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  await getDb().insert(authSessions).values({
    userId,
    tokenHash: tokenDigest(token),
    expiresAt: new Date(Date.now() + LocalSession.maxAgeMs),
  });
  return token;
}

function requestToken(req: Request) {
  const parsed = cookie.parse(req.headers.get("cookie") ?? "");
  const token = parsed[LocalSession.cookieName];
  return token && /^[A-Za-z0-9_-]{40,100}$/.test(token) ? token : null;
}

export async function authenticateLocalRequest(req: Request): Promise<User | undefined> {
  const token = requestToken(req);
  if (!token) return undefined;
  const rows = await getDb().select({ user: users, sessionId: authSessions.id, lastSeenAt: authSessions.lastSeenAt })
    .from(authSessions).innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, tokenDigest(token)), gt(authSessions.expiresAt, new Date()))).limit(1);
  const row = rows[0];
  if (!row) return undefined;
  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await getDb().update(authSessions).set({ lastSeenAt: new Date() }).where(eq(authSessions.id, row.sessionId));
  }
  return row.user;
}

export async function destroyLocalSession(req: Request) {
  const token = requestToken(req);
  if (token) await getDb().delete(authSessions).where(eq(authSessions.tokenHash, tokenDigest(token)));
}

export async function changeLocalPassword(userId: number, currentPassword: string, newPassword: string, currentToken: string) {
  const rows = await getDb().select().from(localAuth).where(eq(localAuth.userId, userId)).limit(1);
  const account = rows[0];
  if (!account || !(await passwordMatches(currentPassword, account.passwordSalt, account.passwordHash))) return false;
  const record = await makePasswordRecord(newPassword);
  await getDb().transaction(async (tx) => {
    await tx.update(localAuth).set(record).where(eq(localAuth.userId, userId));
    await tx.delete(authSessions).where(and(eq(authSessions.userId, userId), ne(authSessions.tokenHash, tokenDigest(currentToken))));
  });
  return true;
}
