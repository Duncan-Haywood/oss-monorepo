import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimitKey } from "@/lib/http";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-qp_session" : "qp_session";
const LEGACY_SESSION_COOKIE = "qp_session";
const SESSION_TTL_DAYS = 30;
const MAX_ACTIVE_SESSIONS = 10;
const ATTEMPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The cost a stored password is hashed at, and the floor it may never fall
 * below outside the test suite.
 */
export const PRODUCTION_BCRYPT_ROUNDS = 12;
/**
 * A deliberately cheap cost so the suite is not dominated by bcrypt. It is
 * reachable from `NODE_ENV === "test"` and from nothing else.
 *
 * It used to be reachable from `process.env.VITEST` as well, which is the
 * shape this comment exists to keep out. `VITEST` is an ordinary environment
 * variable: a CI image that ran the suite during its build, a shell export, a
 * platform-level env inherited by the running service — any of those carries
 * it into production, where it would have silently dropped every NEW password
 * hash to 4 rounds while every existing hash stayed at 12. Nothing in the app
 * reads back the cost of a stored hash, so there was no surface on which that
 * would ever have shown up.
 */
export const TEST_BCRYPT_ROUNDS = 4;

type EnvLike = { NODE_ENV?: string };

/** The cost factor recorded inside a bcrypt hash, or null if it is not one. */
export function bcryptCost(hash: string): number | null {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  return match ? Number(match[1]) : null;
}

/**
 * Cheap rounds are selected by `NODE_ENV` alone. Any other signal is a
 * variable some other system controls, and a password hash is not something
 * another system gets to weaken.
 */
export function resolveBcryptRounds(env: EnvLike = process.env): number {
  return env.NODE_ENV === "test" ? TEST_BCRYPT_ROUNDS : PRODUCTION_BCRYPT_ROUNDS;
}

/**
 * Refuses to hand back a hash that production must not store. This is the
 * fail-closed half: `resolveBcryptRounds` should already make a weak hash
 * impossible here, so if this ever throws, the selection above has regressed
 * and a signup failing loudly is the outcome we want over an account whose
 * password is protected by 4 rounds.
 */
export function assertHashStrength(hash: string, env: EnvLike = process.env): string {
  const cost = bcryptCost(hash);
  const isProduction = env.NODE_ENV === "production";
  if (isProduction && (cost === null || cost < PRODUCTION_BCRYPT_ROUNDS)) {
    throw new Error(
      `Refusing to store a password hashed at ${cost ?? "an unreadable number of"} rounds in production; ` +
        `the floor is ${PRODUCTION_BCRYPT_ROUNDS}.`
    );
  }
  return hash;
}

const BCRYPT_ROUNDS = resolveBcryptRounds();

/**
 * A bcrypt hash of a value nobody can supply, at exactly the cost real
 * passwords are hashed at, so that a login for an unknown email costs the same
 * as a login for a known one.
 *
 * The cost is derived rather than written down. It was previously a literal
 * `$2b$12$...` in the login route, sitting a file away from the constant that
 * decides what real hashes cost: whenever the two numbers disagreed, the
 * comparison against this hash took measurably longer (or shorter) than a
 * comparison against a real one, and the timing equalisation this value exists
 * to provide silently became the email-enumeration oracle it was closing.
 *
 * Computed once and shared. The promise is created eagerly so the first caller
 * to meet an unknown email does not pay for it.
 */
let unknownAccountHashPromise: Promise<string> | null = null;
export function unknownAccountHash(): Promise<string> {
  unknownAccountHashPromise ??= bcrypt.hash(randomBytes(32).toString("base64url"), BCRYPT_ROUNDS);
  return unknownAccountHashPromise;
}
// Attaching a handler here keeps a failure from surfacing as an unhandled
// rejection; the cached promise still carries it to whoever awaits it.
void unknownAccountHash().catch(() => {});

/** Failed-login rate limits, applied per email and per IP independently. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 8;
const MAX_FAILURES_PER_IP = 20;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function hashPassword(plain: string): Promise<string> {
  return assertHashStrength(await bcrypt.hash(plain, BCRYPT_ROUNDS));
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
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
