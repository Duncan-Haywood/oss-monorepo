// One-click live demo sessions for the public demo deployment (DEMO_MODE=true AND FAKE_EXTERNALS=true).
//
// startDemoSession: reserves a slot (atomic cap on active sessions), creates a throwaway, already
// verified user through Better Auth (which also signs them in and returns the session cookie), seeds
// the fictional "Example Valley Trades Collective" for them and records both in demo_sessions with a
// 24h expiry. sweepExpiredDemoSessions (hourly job demo.cleanup_expired) deletes expired sessions:
// the org's R2 objects, vectors and rows (privacy deleteOrganizationData), then the user.
//
// Safety: cleanup only ever starts from a demo_sessions row, and even then deletes
//   - a user only if their email is a generated demo address (demo-<random>@demo.invalid), and
//   - an org only if it carries this session's marker, or that demo user is its only member.
// A real user or an org with any other member (and no marker) is never touched.
import { and, asc, count, eq, gt, like, lte, or, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  type DemoSessionRow,
  demoSessions,
  member,
  organization,
  user,
  verification,
} from "../../db/schema";
import type { Env } from "../../env";
import { createAuth } from "../auth";
import { THROTTLE_IDENTIFIER_PREFIX } from "../auth/emails";
import { deleteOrganizationData } from "../privacy/deletion";
import { seedDemoOrg } from "./index";

export const DEMO_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** Active (unexpired) demo sessions at once. Override with the DEMO_MAX_SESSIONS var. */
export const DEMO_MAX_ACTIVE_SESSIONS = 500;
/** POST /api/demo/start per client IP (in-isolate counter; the active-session cap is global). */
export const DEMO_START_RATE_LIMIT = { limit: 5, periodSeconds: 60 * 60 } as const;
/**
 * Sessions deleted per cleanup run. Each org deletion is ~50 D1 queries (one per tenant table), so 15
 * stays well under the 1000-queries-per-invocation limit even with INLINE_JOBS (demo deployment).
 */
export const DEMO_CLEANUP_BATCH = 15;
export const DEMO_USER_NAME = "Demo Visitor";
export const DEMO_EMAIL_DOMAIN = "demo.invalid";
const DEMO_EMAIL_RE = /^demo-[0-9a-z]{16,}@demo\.invalid$/;

/** One-click demo sessions exist only on the demo deployment (both flags, set by grants-deploy). */
export function demoSessionsAllowed(env: Pick<Env, "FAKE_EXTERNALS" | "DEMO_MODE">): boolean {
  return env.DEMO_MODE === "true" && env.FAKE_EXTERNALS === "true";
}

export const isDemoEmail = (email: string) => DEMO_EMAIL_RE.test(email);

export function maxActiveDemoSessions(env: Env): number {
  const raw = (env as { DEMO_MAX_SESSIONS?: string }).DEMO_MAX_SESSIONS;
  const n = raw === undefined || raw === "" ? Number.NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEMO_MAX_ACTIVE_SESSIONS;
}

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // 32 symbols: byte % 32 is unbiased

function randomToken(length: number): string {
  let out = "";
  for (const b of crypto.getRandomValues(new Uint8Array(length))) out += ALPHABET[b % 32];
  return out;
}

/** Random password nobody ever sees (the visitor stays signed in by cookie only). */
function randomPassword(): string {
  let s = "";
  for (const b of crypto.getRandomValues(new Uint8Array(24))) s += String.fromCharCode(b);
  return btoa(s).replace(/[+/=]/g, (c) => (c === "+" ? "-" : c === "/" ? "_" : ""));
}

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------

export interface DemoSlot {
  id: string;
  expiresAt: Date;
}

/**
 * Reserve a demo session row unless `cap` sessions are already active. A single conditional INSERT,
 * so concurrent starts cannot overshoot the cap (D1 serializes writes).
 */
export async function reserveDemoSlot(ctx: AppContext, cap: number): Promise<DemoSlot | null> {
  const id = `dms_${randomToken(20)}`;
  const now = ctx.now().getTime();
  const expiresAt = new Date(now + DEMO_SESSION_TTL_MS);
  const res = await ctx.db.run(sql`
    insert into demo_sessions (id, expires_at, created_at)
    select ${id}, ${expiresAt.getTime()}, ${now}
    where (select count(*) from demo_sessions where expires_at > ${now}) < ${cap}`);
  return (res.meta.changes ?? 0) > 0 ? { id, expiresAt } : null;
}

export async function countActiveDemoSessions(ctx: AppContext): Promise<number> {
  const row = await ctx.db
    .select({ n: count() })
    .from(demoSessions)
    .where(gt(demoSessions.expiresAt, ctx.now()))
    .get();
  return row?.n ?? 0;
}

/** The caller's own unexpired demo session whose org they still belong to (reused on a re-click). */
export async function findActiveDemoSession(
  ctx: AppContext,
  userId: string,
): Promise<{ sessionId: string; orgId: string } | null> {
  const row = await ctx.db
    .select({ id: demoSessions.id, orgId: member.organizationId })
    .from(demoSessions)
    .innerJoin(
      member,
      and(eq(member.organizationId, demoSessions.demoOrgId), eq(member.userId, userId)),
    )
    .where(and(eq(demoSessions.userId, userId), gt(demoSessions.expiresAt, ctx.now())))
    .get();
  return row ? { sessionId: row.id, orgId: row.orgId } : null;
}

/** Whether `userId` is a throwaway demo visitor (for /api/me `isDemo`). No query off the demo host. */
export async function isDemoSessionUser(ctx: AppContext, userId: string): Promise<boolean> {
  if (!demoSessionsAllowed(ctx.env)) return false;
  const row = await ctx.db
    .select({ id: demoSessions.id })
    .from(demoSessions)
    .where(eq(demoSessions.userId, userId))
    .get();
  return !!row;
}

interface SessionMarker {
  id: string;
  expiresAt: string;
}

function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const v = JSON.parse(metadata) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** organization.metadata `{ demo: { seed, version, complete, session: { id, expiresAt } } }`. */
function sessionMarkerOf(metadata: string | null): string | null {
  const demo = parseMetadata(metadata).demo as { session?: Partial<SessionMarker> } | undefined;
  return typeof demo?.session?.id === "string" ? demo.session.id : null;
}

async function markOrgAsDemoSession(ctx: AppContext, orgId: string, slot: DemoSlot) {
  const row = await ctx.db
    .select({ metadata: organization.metadata })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  const meta = parseMetadata(row?.metadata ?? null);
  const demo = (meta.demo && typeof meta.demo === "object" ? meta.demo : {}) as Record<
    string,
    unknown
  >;
  const session: SessionMarker = { id: slot.id, expiresAt: slot.expiresAt.toISOString() };
  await ctx.db
    .update(organization)
    .set({ metadata: JSON.stringify({ ...meta, demo: { ...demo, session } }) })
    .where(eq(organization.id, orgId));
}

export interface StartDemoInput {
  /** The visitor's request headers (IP / user agent for the Better Auth session row). */
  headers: Headers;
  ip: string | null;
  userAgent: string | null;
  requestId?: string;
}

export type StartDemoResult =
  | { ok: true; orgId: string; userId: string; expiresAt: Date; setCookies: string[] }
  | { ok: false; reason: "full" };

export async function startDemoSession(
  ctx: AppContext,
  input: StartDemoInput,
): Promise<StartDemoResult> {
  const slot = await reserveDemoSlot(ctx, maxActiveDemoSessions(ctx.env));
  if (!slot) return { ok: false, reason: "full" };
  try {
    // Better Auth creates the user + credential account and, with verification off for this call,
    // signs them in (session row + signed cookie).
    const auth = createAuth(ctx, { requireEmailVerification: false });
    const { headers, response } = await auth.api.signUpEmail({
      body: {
        email: `demo-${randomToken(20)}@${DEMO_EMAIL_DOMAIN}`,
        password: randomPassword(),
        name: DEMO_USER_NAME,
      },
      headers: input.headers,
      returnHeaders: true,
    });
    const userId = response.user.id;
    await ctx.db.update(demoSessions).set({ userId }).where(eq(demoSessions.id, slot.id));
    await ctx.db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
    const setCookies = headers.getSetCookie();
    if (!response.token || setCookies.length === 0)
      throw new Error("demo sign-in returned no session");

    const { orgId } = await seedDemoOrg(ctx, {
      userId,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });
    await ctx.db.update(demoSessions).set({ demoOrgId: orgId }).where(eq(demoSessions.id, slot.id));
    await markOrgAsDemoSession(ctx, orgId, slot);
    ctx.logger.info("demo.session_started", { sessionId: slot.id, orgId, userId });
    return { ok: true, orgId, userId, expiresAt: slot.expiresAt, setCookies };
  } catch (e) {
    // Expire the half-built session now: the next cleanup removes whatever was created.
    await ctx.db
      .update(demoSessions)
      .set({ expiresAt: ctx.now() })
      .where(eq(demoSessions.id, slot.id))
      .catch(() => undefined);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------------------------

export interface DemoCleanupSummary {
  sessions: number;
  orgs: number;
  users: number;
  /** Rows whose user is not a demo user: row dropped, nothing else touched. */
  refused: number;
  failed: number;
}

/** An org is disposable if it carries this session's marker, or the demo user is its only member. */
async function isDisposableOrg(
  ctx: AppContext,
  orgId: string,
  sessionId: string,
  demoUserId: string | null,
): Promise<boolean> {
  const org = await ctx.db
    .select({ metadata: organization.metadata })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  if (!org) return false;
  if (sessionMarkerOf(org.metadata) === sessionId) return true;
  if (!demoUserId) return false;
  const members = await ctx.db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, orgId))
    .limit(2)
    .all();
  return members.length === 1 && members[0]?.userId === demoUserId;
}

async function deleteDemoUser(ctx: AppContext, userId: string) {
  // Same leftovers as self-service account deletion: reset tokens and email-throttle rows.
  await ctx.db
    .delete(verification)
    .where(
      or(
        and(like(verification.identifier, "reset-password:%"), eq(verification.value, userId)),
        like(verification.identifier, `${THROTTLE_IDENTIFIER_PREFIX}%:${userId}`),
      ),
    );
  // Cascades: sessions, accounts, memberships, invitations sent.
  await ctx.db.delete(user).where(eq(user.id, userId));
}

/** Deletes one expired session's data. Idempotent: a run that stopped half-way is finished later. */
export async function cleanupDemoSession(
  ctx: AppContext,
  row: DemoSessionRow,
): Promise<{ orgs: number; users: number; refused: boolean }> {
  const found = row.userId
    ? await ctx.db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.id, row.userId))
        .get()
    : undefined;
  if (found && !isDemoEmail(found.email)) {
    ctx.logger.warn("demo.cleanup.refused", { sessionId: row.id, reason: "not_a_demo_user" });
    await ctx.db.delete(demoSessions).where(eq(demoSessions.id, row.id));
    return { orgs: 0, users: 0, refused: true };
  }
  const demoUserId = found?.id ?? null;

  const candidates = new Set<string>();
  if (row.demoOrgId) candidates.add(row.demoOrgId);
  if (demoUserId) {
    const memberships = await ctx.db
      .select({ orgId: member.organizationId })
      .from(member)
      .where(eq(member.userId, demoUserId))
      .all();
    for (const m of memberships) candidates.add(m.orgId);
  }
  let orgs = 0;
  for (const orgId of candidates) {
    if (await isDisposableOrg(ctx, orgId, row.id, demoUserId)) {
      if (await deleteOrganizationData(ctx, orgId, null)) orgs++;
    }
  }
  if (demoUserId) await deleteDemoUser(ctx, demoUserId);
  await ctx.db.delete(demoSessions).where(eq(demoSessions.id, row.id));
  return { orgs, users: demoUserId ? 1 : 0, refused: false };
}

/** Deletes up to `limit` expired demo sessions (oldest first). Never throws for one bad session. */
export async function sweepExpiredDemoSessions(
  ctx: AppContext,
  opts: { limit?: number } = {},
): Promise<DemoCleanupSummary> {
  const rows = await ctx.db
    .select()
    .from(demoSessions)
    .where(lte(demoSessions.expiresAt, ctx.now()))
    .orderBy(asc(demoSessions.expiresAt))
    .limit(opts.limit ?? DEMO_CLEANUP_BATCH)
    .all();
  const summary: DemoCleanupSummary = { sessions: 0, orgs: 0, users: 0, refused: 0, failed: 0 };
  for (const row of rows) {
    try {
      const r = await cleanupDemoSession(ctx, row);
      summary.sessions++;
      summary.orgs += r.orgs;
      summary.users += r.users;
      if (r.refused) summary.refused++;
    } catch (e) {
      summary.failed++;
      ctx.logger.error("demo.cleanup.failed", {
        sessionId: row.id,
        error: String(e).slice(0, 300),
      });
    }
  }
  if (rows.length > 0) ctx.logger.info("demo.cleanup.done", { ...summary });
  return summary;
}
