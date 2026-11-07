import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./kimi/auth";
import { authenticateLocalRequest } from "./local-auth";
import { env } from "./lib/env";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function getAuthenticatedUser(req: Request): Promise<User | undefined> {
  if (env.isLocal) return authenticateLocalRequest(req);
  try {
    return await authenticateRequest(req.headers);
  } catch {
    return undefined;
  }
}

export async function createContext(opts: FetchCreateContextFnOptions): Promise<TrpcContext> {
  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
    user: await getAuthenticatedUser(opts.req),
  };
}
