import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext, getAuthenticatedUser } from "./context";
import { and, eq } from "drizzle-orm";
import { noteAssets } from "@db/schema";
import { getDb } from "./queries/connection";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { log } from "./lib/logger";
import { handleClientLog } from "./lib/clientlog";
import { REQUEST_ID_HEADER, runWithRequestId } from "./lib/requestcontext";
import { applySecurityHeaders, hasAllowedOrigin } from "./lib/security-headers";

const app = new Hono<{ Bindings: HttpBindings }>();

// One middleware for both halves of request observability, because they need the
// same scope and the same id:
//   - G3 correlation: mint a request id, echo it on the response header (what the
//     browser logger reads), and run the rest of the request inside it so every
//     server log line carries it.
//   - G4 access log: one line per request with method/path/status/duration, so
//     "who called what and how long did it take" is answerable. Until now only
//     failures were logged at all, and success left no trace.
// /api/log is skipped: it is the browser's log sink, and an access line per
// POSTed batch would be self-amplifying noise in the very file it writes.
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  if (c.req.path === "/api/log") {
    await next();
    return;
  }
  const start = Date.now();
  await runWithRequestId(requestId, async () => {
    await next();
    // Set the header AFTER next(): the tRPC route hands Hono a raw Response
    // built by fetchRequestHandler, which carries its own headers, so a
    // c.header() called before dispatch is dropped on that path. Setting it on
    // the resolved c.res covers every route, including the tRPC one.
    c.res.headers.set(REQUEST_ID_HEADER, requestId);
    // Only /api/* is logged. In production serveStaticFiles() registers a
    // catch-all AFTER this middleware, so a page load pulls in every asset as
    // its own request — logging those would bury the API calls the agent reads
    // this file for, and inflate the log for no diagnostic gain.
    if (!c.req.path.startsWith("/api/")) return;
    log.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  });
});

// Apply headers after routing so they also reach raw tRPC Response objects.
app.use("*", async (c, next) => {
  await next();
  applySecurityHeaders(c.res.headers, { production: env.isProduction, path: c.req.path });
});

// Browser mutations are same-origin on every API route, including /api/log.
// Requests without Origin remain available to local CLI and Bearer API clients.
app.use("/api/*", async (c, next) => {
  if (!hasAllowedOrigin(c.req.raw)) return c.json({ error: "Cross-origin request rejected" }, 403);
  await next();
});

// bodyLimit stays scoped to tRPC: a global limit breaks bodyless requests in
// @hono/vite-dev-server. /api/log has its own smaller limit below.
app.use("/api/trpc/*", bodyLimit({ maxSize: 120 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.get("/api/note-assets/:id", async (c) => {
  const user = await getAuthenticatedUser(c.req.raw);
  if (!user) return c.body(null, 401);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.body(null, 400);
  const rows = await getDb().select().from(noteAssets)
    .where(and(eq(noteAssets.id, id), eq(noteAssets.userId, user.id))).limit(1);
  const asset = rows[0];
  if (!asset) return c.body(null, 404);
  return c.body(new Uint8Array(asset.data), 200, {
    "Content-Type": asset.mime,
    "Content-Length": String(asset.data.length),
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
});
// Browser-side log sink (see lib/clientlog.ts). Must be registered before the
// /api/* 404 catch-all below. bodyLimit guards it too: lib/clientlog.ts caps the
// body itself, but only AFTER Hono has read it into memory, and this route sits
// on the public preview URL — the cap has to bite before the read.
app.post(
  "/api/log",
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.body(null, 413) }),
  handleClientLog,
);
app.get("/api/health", async (c) => {
  try {
    const { fileBackupHealth } = await import("./lib/file-backups");
    return c.json({ status: "ok", ...(await fileBackupHealth()) });
  } catch (error) {
    log.error("health check failed", { error: error instanceof Error ? error.message : String(error) });
    return c.json({ status: "unavailable" }, 503);
  }
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// Unhandled request errors must reach /tmp/kimi-logs/app.log, not just stdout:
// that file is what the building agent reads when a preview 500s, and without
// this the log looks clean while the request actually failed. Response stays a
// generic 500 (no stack leaked to the caller); the detail goes to the log only.
app.onError((err, c) => {
  log.error("unhandled request error", {
    method: c.req.method,
    path: c.req.path,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return c.json({ error: "Internal Server Error" }, 500);
});

const { ensurePeriodicFileBackup } = await import("./lib/file-backups");
await ensurePeriodicFileBackup();

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  const { getSqlClient } = await import("./queries/connection");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  const hostname = process.env.HOST ?? "127.0.0.1";
  const server = serve({ fetch: app.fetch, port, hostname }, () => {
    log.info(`Server running on http://${hostname}:${port}/`);
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => {
      getSqlClient().close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
