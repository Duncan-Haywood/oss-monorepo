import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "qp_session";
const SESSION_TTL_DAYS = 60;
const BCRYPT_ROUNDS = 12;

/** Failed-login rate limits, applied per email and per IP independently. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 8;
const MAX_FAILURES_PER_IP = 20;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
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
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_FAILURES_PER_EMAIL || byIp >= MAX_FAILURES_PER_IP;
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean): Promise<void> {
  await prisma.loginAttempt.create({ data: { email, ip, success } });
}

/** Issues a session and sets the HTTP-only cookie. Returns the raw token. */
export async function createSession(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.userSession.create({
    data: { tokenHash: hashToken(raw), userId, expiresAt },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return raw;
}

export type SessionUser = { id: string; email: string; firstName: string };

/** Resolves the current user from the session cookie, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { select: { id: true, email: true, firstName: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  // The cookie goes first. Deleting the row can throw — the database is the
  // one thing here that can be down — and if it does after the cookie is
  // already gone, the person who asked to sign out is signed out on their
  // device, which is what they asked for. The other order leaves them signed
  // in behind a 500, which is the failure that actually matters.
  store.delete(SESSION_COOKIE);
  if (raw) {
    await prisma.userSession.deleteMany({ where: { tokenHash: hashToken(raw) } });
  }
}
