import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimitKey } from "@/lib/http";
import { checkedRetentionMs } from "@/lib/retentionWindow";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-qp_session" : "qp_session";
const LEGACY_SESSION_COOKIE = "qp_session";
const SESSION_TTL_DAYS = 30;
const MAX_ACTIVE_SESSIONS = 10;
/**
 * bcrypt cost.
 *
 * `TEST_BCRYPT_ROUNDS` exists so the suites that create accounts finish in
 * seconds, and that is legitimate. What is not legitimate is reaching it on an
 * ambient signal: `VITEST` is exported into every process a test runner spawns
 * and can be inherited or set anywhere, so `VITEST` on its own once dropped
 * every *newly created* hash to four rounds — trivially crackable — with
 * nothing reporting it. The cheap cost is therefore reachable only when both
 * signals a runner sets agree, and a runner signal seen next to
 * `NODE_ENV=production` is treated as a misconfigured deployment and refused
 * rather than obeyed. Refusing costs an outage; obeying costs the passwords.
 */
export const PRODUCTION_BCRYPT_ROUNDS = 12;
export const TEST_BCRYPT_ROUNDS = 4;

/** `VITEST=false`, `VITEST=0` and `VITEST=` are absence, not presence. */
function signalIsSet(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalised = value.trim().toLowerCase();
  return normalised !== "" && normalised !== "0" && normalised !== "false";
}

/**
 * Only the two variables that decide the cost. Deliberately looser than
 * `NodeJS.ProcessEnv`, whose `NODE_ENV` Next narrows to three known values —
 * the environment a deployment actually presents can hold anything, and the
 * cases worth testing are the ones outside that union.
 */
export type BcryptCostSignals = { NODE_ENV?: string; VITEST?: string };

/**
 * The bcrypt cost this environment is allowed to hash at.
 *
 * @throws if a test-runner signal is present alongside `NODE_ENV=production`.
 */
export function resolveBcryptRounds(env: BcryptCostSignals = process.env): number {
  const nodeEnv = env.NODE_ENV;
  const underTestRunner = signalIsSet(env.VITEST);

  if (nodeEnv === "production" && underTestRunner) {
    throw new Error(
      "Refusing to hash: VITEST is set while NODE_ENV=production. A test-runner " +
        "signal in a production environment is a misconfiguration, not permission " +
        `to hash below ${PRODUCTION_BCRYPT_ROUNDS} bcrypt rounds. Unset VITEST.`
    );
  }

  // Both signals, or full cost. Either alone is ambiguous.
  if (nodeEnv === "test" && underTestRunner) return TEST_BCRYPT_ROUNDS;
  return PRODUCTION_BCRYPT_ROUNDS;
}

/**
 * The cost factor recorded inside a bcrypt hash, or null if the string is not
 * one.
 *
 * Nothing in this app reads a stored hash's cost back, which is why a weak
 * cost was able to be a silent condition: a hash at 4 rounds and a hash at 12
 * are the same shape, verify the same way, and are indistinguishable to every
 * caller. This is the only surface on which the difference is observable.
 */
export function bcryptCost(hash: string): number | null {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  return match ? Number(match[1]) : null;
}

/**
 * Refuses to hand back a hash production must not store.
 *
 * `resolveBcryptRounds` should already make a weak hash unreachable here, so
 * this is the second line rather than the first: it checks the hash that was
 * actually produced instead of the number that was requested, which is what
 * catches a future edit that passes a cost of its own, or a hashing library
 * that quietly ignores the one it was given. A signup that fails loudly is the
 * outcome we want over an account whose password is protected by four rounds.
 */
export function assertHashStrength(hash: string, env: BcryptCostSignals = process.env): string {
  const cost = bcryptCost(hash);
  if (env.NODE_ENV === "production" && (cost === null || cost < PRODUCTION_BCRYPT_ROUNDS)) {
    throw new Error(
      `Refusing to store a password hashed at ${cost ?? "an unreadable number of"} rounds in production; ` +
        `the floor is ${PRODUCTION_BCRYPT_ROUNDS}.`,
    );
  }
  return hash;
}

/** Failed-login rate limits, applied per email and per IP independently. */
export const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 8;
const MAX_FAILURES_PER_IP = 20;
/**
 * How long a login attempt survives the reaper in `recordLoginAttempt`. It has
 * to outlast `WINDOW_MS` by a margin or the reaper deletes the failures the
 * lockout counts, and both login limits stop locking anyone out. See
 * `retentionWindow.ts`.
 */
export const ATTEMPT_RETENTION_MS = checkedRetentionMs("auth.loginAttempt", WINDOW_MS, 30 * 24 * 60 * 60 * 1000);

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function hashPassword(plain: string): Promise<string> {
  return assertHashStrength(await bcrypt.hash(plain, resolveBcryptRounds()));
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let absentAccountHashCache: { rounds: number; hash: string } | null = null;

/**
 * A hash of an unguessable secret, at the cost `hashPassword` is currently
 * issuing.
 *
 * The login route compares the submitted password against this when no account
 * matches, so that a missing account and a wrong password take the same time.
 * The equalisation only holds while the two costs agree: a literal pinned at
 * one cost leaves real logins fast and absent-account logins slow the moment
 * the issuing cost moves, which is precisely the email-enumeration oracle the
 * comparison exists to close. Deriving it here means the two cannot drift.
 */
export async function absentAccountHash(): Promise<string> {
  const rounds = resolveBcryptRounds();
  if (absentAccountHashCache?.rounds !== rounds) {
    const secret = randomBytes(32).toString("base64url");
    absentAccountHashCache = { rounds, hash: await bcrypt.hash(secret, rounds) };
  }
  return absentAccountHashCache.hash;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Deliberately permissive but structural: one @, no spaces, a dot in the domain.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

export type PasswordProblem = string | null;

export function passwordProblem(pw: string): PasswordProblem {
  if (typeof pw !== "string" || pw.length < 10) return "Password must be at least 10 characters.";
  if (pw.length > 200) return "Password is too long.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Password needs at least one letter and one number.";
  return null;
}

/** Re-exported so existing call sites keep their single auth import. */
export { getClientIp } from "@/lib/http";

export async function isLoginRateLimited(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const ipKey = rateLimitKey(ip);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip: ipKey, success: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_FAILURES_PER_EMAIL || byIp >= MAX_FAILURES_PER_IP;
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean): Promise<void> {
  await prisma.$transaction([
    prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - ATTEMPT_RETENTION_MS) } },
    }),
    prisma.loginAttempt.create({ data: { email, ip: rateLimitKey(ip), success } }),
  ]);
}

/** Issues a session and sets the HTTP-only cookie. Returns the raw token. */
export async function createSession(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.userSession.deleteMany({ where: { expiresAt: { lt: now } } });
    const excess = await tx.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: MAX_ACTIVE_SESSIONS - 1,
      select: { id: true },
    });
    if (excess.length > 0) {
      await tx.userSession.deleteMany({ where: { id: { in: excess.map(({ id }) => id) } } });
    }
    await tx.userSession.create({ data: { tokenHash: hashToken(raw), userId, expiresAt } });
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
  return raw;
}

export type SessionUser = { id: string; email: string; firstName: string };

/** Resolves the current user from the session cookie, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  // Keep accepting the old cookie for one release so the production cookie
  // hardening does not unexpectedly sign everyone out during deployment.
  const raw = store.get(SESSION_COOKIE)?.value ?? store.get(LEGACY_SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { select: { id: true, email: true, firstName: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.userSession.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session.user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value ?? store.get(LEGACY_SESSION_COOKIE)?.value;
  // The cookie goes first. Deleting the row can throw — the database is the
  // one thing here that can be down — and if it does after the cookie is
  // already gone, the person who asked to sign out is signed out on their
  // device, which is what they asked for. The other order leaves them signed
  // in behind a 500, which is the failure that actually matters.
  store.delete(SESSION_COOKIE);
  if (LEGACY_SESSION_COOKIE !== SESSION_COOKIE) store.delete(LEGACY_SESSION_COOKIE);
  if (raw) {
    await prisma.userSession.deleteMany({ where: { tokenHash: hashToken(raw) } });
  }
}
