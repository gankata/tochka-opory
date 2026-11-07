import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { workspaceRouter } from "./workspaceRouter";
import { importRouter } from "./importRouter";
import { assetsRouter } from "./assetsRouter";
import { accessRouter } from "./accessRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  workspace: workspaceRouter,
  imports: importRouter,
  assets: assetsRouter,
  access: accessRouter,
});

export type AppRouter = typeof appRouter;
