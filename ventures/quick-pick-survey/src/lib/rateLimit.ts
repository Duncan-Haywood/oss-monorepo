import { prisma } from "@/lib/prisma";
import { rateLimitKey } from "@/lib/http";
import { checkedRetentionMs } from "@/lib/retentionWindow";

export { getClientIp } from "@/lib/http";

/** How far back `isWriteRateLimited` counts. */
export const WINDOW_MS = 15 * 60 * 1000;

/**
 * How long a logged request survives the reaper in `recordWrite`.
 *
 * Routed through `checkedRetentionMs` because the two numbers are one
 * mechanism: retention at or below the window deletes the rows the counter
 * counts, and all seven anonymous write limiters stop limiting without a
 * single visible symptom. See `retentionWindow.ts`.
 */
export const RETENTION_MS = checkedRetentionMs("rateLimit.anonRequestLog", WINDOW_MS, 24 * 60 * 60 * 1000);

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
