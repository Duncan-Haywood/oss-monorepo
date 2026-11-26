// OWNER: discovery agent — /api/internal/* (bearer INTERNAL_API_TOKEN): trigger discovery, seed demo
// catalog. Mounted before the session/Origin middleware: authentication is the bearer token only.
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { AppError, unauthorized } from "../lib/errors";
import { enqueue } from "../queues/enqueue";
import { listDiscoveryRuns, seedSampleOpportunities } from "../services/discovery";
import type { AppEnv } from "../types";

/** Constant-time comparison of two strings (compares SHA-256 digests so lengths never leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export const requireInternalToken = createMiddleware<AppEnv>(async (c, next) => {
  const expected = c.env.INTERNAL_API_TOKEN;
  // Disabled entirely when no token is configured.
  if (!expected) throw new AppError(404, "not_found", "Not found");
  const header = c.req.header("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1] || !(await safeEqual(match[1].trim(), expected))) throw unauthorized();
  await next();
});

const RunBody = z.object({ source: z.enum(["grants_gov", "simpler_grants"]).optional() });

const routes = new Hono<AppEnv>()
  .use("*", requireInternalToken)
  .post("/discovery/run", async (c) => {
    const ctx = c.var.ctx;
    // Body is optional (cron-style callers often send none).
    const { source } = RunBody.parse(await c.req.json().catch(() => ({})));
    const sources: ("grants_gov" | "simpler_grants")[] = source
      ? [source]
      : c.env.SIMPLER_GRANTS_API_KEY
        ? ["grants_gov", "simpler_grants"]
        : ["grants_gov"];
    for (const s of sources) {
      await enqueue(ctx, { type: "discovery.run", source: s, trigger: "manual" });
    }
    return c.json({ queued: true, sources }, 202);
  })
  .get("/discovery/runs", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
    return c.json({ items: await listDiscoveryRuns(c.var.ctx, limit) });
  })
  .post("/discovery/seed-samples", async (c) => {
    const counts = await seedSampleOpportunities(c.var.ctx);
    return c.json(counts);
  });

export default routes;
