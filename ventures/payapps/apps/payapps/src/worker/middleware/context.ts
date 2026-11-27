import { createMiddleware } from "hono/factory";
import { createAppContext } from "../context";
import type { AppEnv } from "../types";

export const contextMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  const ctx = createAppContext(c.env);
  ctx.logger = ctx.logger.child({ requestId });
  c.set("ctx", ctx);
  await next();
});
