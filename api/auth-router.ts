import * as cookie from "cookie";
import { and, eq, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { LocalSession, Session } from "@contracts/constants";
import { authSessions, localAuth, users, type User } from "@db/schema";
import { getSessionCookieOptions, getLocalSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { env } from "./lib/env";
import type { TrpcContext } from "./context";
import { getDb } from "./queries/connection";
import {
  changeLocalPassword, createLocalSession, destroyLocalSession, localAuthExists,
  normalizeUsername, setupLocalAuth, verifyLocalLogin,
} from "./local-auth";

const usernameInput = z.string().trim().min(3).max(64).regex(/^[\p{L}\p{N}._-]+$/u, "Используйте буквы, цифры, точку, дефис или подчёркивание");
const passwordInput = z.string().min(10).max(128);
const attempts = new Map<string, { count: number; lockedUntil: number }>();
const maxAttemptKeys = 500;

function clearCookie(ctx: TrpcContext, name: string, options: ReturnType<typeof getSessionCookieOptions>) {
  ctx.resHeaders.append("set-cookie", cookie.serialize(name, "", {
    httpOnly: options.httpOnly,
    path: options.path,
    sameSite: options.sameSite?.toLowerCase() as "lax" | "none",
    secure: options.secure,
    maxAge: 0,
  }));
}

async function startLocalSession(ctx: TrpcContext, user: User) {
  const token = await createLocalSession(user.id);
  const options = getLocalSessionCookieOptions(ctx.req.headers);
  ctx.resHeaders.append("set-cookie", cookie.serialize(LocalSession.cookieName, token, {
    httpOnly: options.httpOnly,
    path: options.path,
    sameSite: "lax",
    secure: options.secure,
    maxAge: Math.floor(LocalSession.maxAgeMs / 1000),
  }));
  return user;
}

function assertLoginAllowed(username: string) {
  const key = normalizeUsername(username);
  const entry = attempts.get(key);
  if (entry && entry.lockedUntil > Date.now()) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Слишком много попыток. Повторите через ${Math.ceil((entry.lockedUntil - Date.now()) / 1000)} сек.` });
  }
  if (entry && entry.lockedUntil <= Date.now()) attempts.delete(key);
  return key;
}

function registerFailure(key: string) {
  if (!attempts.has(key) && attempts.size >= maxAttemptKeys) {
    const oldestKey = attempts.keys().next().value;
    if (oldestKey !== undefined) attempts.delete(oldestKey);
  }
  const count = (attempts.get(key)?.count ?? 0) + 1;
  attempts.set(key, { count, lockedUntil: count >= 5 ? Date.now() + Math.min(300, (count - 4) * 60) * 1000 : 0 });
}

export const authRouter = createRouter({
  status: publicQuery.query(async () => ({
    isLocal: env.isLocal,
    initialized: env.isLocal ? await localAuthExists() : true,
  })),
  setup: publicQuery.input(z.object({ username: usernameInput, password: passwordInput })).mutation(async ({ ctx, input }) => {
    if (!env.isLocal) throw new TRPCError({ code: "NOT_FOUND" });
    const user = await setupLocalAuth(input.username, input.password);
    if (!user) throw new TRPCError({ code: "CONFLICT", message: "Локальная учётная запись уже создана" });
    await getDb().update(users).set({ name: input.username.trim(), lastSignInAt: new Date() }).where(eq(users.id, user.id));
    return startLocalSession(ctx, { ...user, name: input.username.trim(), lastSignInAt: new Date() });
  }),
  login: publicQuery.input(z.object({ username: usernameInput, password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
    if (!env.isLocal) throw new TRPCError({ code: "NOT_FOUND" });
    const key = assertLoginAllowed(input.username);
    const user = await verifyLocalLogin(input.username, input.password);
    if (!user) {
      registerFailure(key);
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный логин или пароль" });
    }
    attempts.delete(key);
    await getDb().update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
    return startLocalSession(ctx, { ...user, lastSignInAt: new Date() });
  }),
  me: authedQuery.query((opts) => opts.ctx.user),
  account: authedQuery.query(async ({ ctx }) => {
    if (!env.isLocal) return null;
    const account = await getDb().select({ username: localAuth.username }).from(localAuth).where(eq(localAuth.userId, ctx.user.id)).limit(1);
    const sessions = await getDb().select({ id: authSessions.id }).from(authSessions)
      .where(and(eq(authSessions.userId, ctx.user.id), gt(authSessions.expiresAt, new Date())));
    return { username: account[0]?.username ?? "", sessionCount: sessions.length };
  }),
  changePassword: authedQuery.input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordInput })).mutation(async ({ ctx, input }) => {
    if (!env.isLocal) throw new TRPCError({ code: "NOT_FOUND" });
    const token = cookie.parse(ctx.req.headers.get("cookie") ?? "")[LocalSession.cookieName] ?? "";
    const changed = await changeLocalPassword(ctx.user.id, input.currentPassword, input.newPassword, token);
    if (!changed) throw new TRPCError({ code: "BAD_REQUEST", message: "Текущий пароль неверен" });
    return { ok: true };
  }),
  logout: publicQuery.mutation(async ({ ctx }) => {
    if (env.isLocal) {
      await destroyLocalSession(ctx.req);
      clearCookie(ctx, LocalSession.cookieName, getLocalSessionCookieOptions(ctx.req.headers));
    } else {
      clearCookie(ctx, Session.cookieName, getSessionCookieOptions(ctx.req.headers));
    }
    return { success: true };
  }),
});
