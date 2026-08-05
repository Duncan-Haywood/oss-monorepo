import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { assertRetentionOutlivesWindow, rateLimitKey } from "@/lib/http";

export const ADMIN_COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-admin_session" : "admin_session";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_FAILURES = 8;
const ATTEMPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// `recordLoginAttempt` sweeps attempts older than ATTEMPT_RETENTION_MS in the
// same transaction that records the new one, so a retention at or below the
// window would delete the failures `isRateLimited` counts and leave the admin
// key guessable without limit while RATE_LIMIT_MAX_FAILURES still reads 8.
assertRetentionOutlivesWindow("admin login limiter", RATE_LIMIT_WINDOW_MS, ATTEMPT_RETENTION_MS);

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not set");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function createSessionToken(): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const expected = sign(payload);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}

export function verifyAdminKey(candidate: string): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false;
  const candidateBuf = Buffer.from(candidate);
  const expectedBuf = Buffer.from(expected);
  if (candidateBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(candidateBuf, expectedBuf);
}

export async function isRateLimited(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const failures = await prisma.adminLoginAttempt.count({
    where: { ip: rateLimitKey(ip), success: false, createdAt: { gte: since } },
  });
  return failures >= RATE_LIMIT_MAX_FAILURES;
}

export async function recordLoginAttempt(ip: string, success: boolean): Promise<void> {
  await prisma.$transaction([
    prisma.adminLoginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - ATTEMPT_RETENTION_MS) } },
    }),
    prisma.adminLoginAttempt.create({ data: { ip: rateLimitKey(ip), success } }),
  ]);
}

/** Re-exported so existing call sites keep their single auth import. */
export { getClientIp } from "@/lib/http";
