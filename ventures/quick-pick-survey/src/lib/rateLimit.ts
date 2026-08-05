import { prisma } from "@/lib/prisma";
import { assertRetentionOutlivesWindow, rateLimitKey } from "@/lib/http";

export { getClientIp } from "@/lib/http";

/**
 * Exported so the coupling below is testable from the outside: the window is
 * the period `isWriteRateLimited` counts inside, and retention is the age at
 * which `recordWrite`'s sweep deletes those same rows.
 */
export const WINDOW_MS = 15 * 60 * 1000;
export const RETENTION_MS = 24 * 60 * 60 * 1000;

// Retention must outlive the window or the sweep in `recordWrite` deletes rows
// that `isWriteRateLimited` is still counting, and every anonymous write limit
// silently loosens to a window of RETENTION_MS. Enforced, not documented.
assertRetentionOutlivesWindow("rateLimit", WINDOW_MS, RETENTION_MS);

/**
 * Coarse per-IP throttling for the anonymous write endpoints, which have no
 * account behind them to attribute abuse to.
 *
 * Counted in the database rather than in memory because the app runs
 * serverless: an in-process counter is per-instance, so it resets on every
 * cold start and never sees the other instances at all.
 *
 * Deliberately generous. Two partners on one home network, each restarting
 * a couple of times while they figure the thing out, is normal use — the
 * limit exists to stop a script creating rows without bound, not to police
 * anyone's second attempt.
 */
export async function isWriteRateLimited(ip: string, route: string, max: number): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const count = await prisma.anonRequestLog.count({
    where: { ip: rateLimitKey(ip), route, createdAt: { gte: since } },
  });
  return count >= max;
}

export async function recordWrite(ip: string, route: string): Promise<void> {
  await prisma.$transaction([
    prisma.anonRequestLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } }),
    prisma.anonRequestLog.create({ data: { ip: rateLimitKey(ip), route } }),
  ]);
}
