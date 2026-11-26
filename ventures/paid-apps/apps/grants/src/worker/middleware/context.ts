import { createMiddleware } from "hono/factory";
import { createAppContext } from "../context";
import type { AppEnv } from "../types";

export const contextMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  let executionCtx: Pick<ExecutionContext, "waitUntil"> | undefined;
  try {
    const ec = c.executionCtx;
    executionCtx = { waitUntil: ec.waitUntil.bind(ec) };
  } catch {
    executionCtx = undefined;
  }
  const ctx = createAppContext(c.env, executionCtx ? { executionCtx } : {});
  ctx.logger = ctx.logger.child({ requestId });
  c.set("ctx", ctx);
  await next();
});
