// Early-access list: double opt-in sign-up, confirm, remove and the purge of never-confirmed rows.
// Same shape as apps/grants' newsletter (services/marketing/subscribers.ts), on plain D1.
//
// Privacy: never log an email address or a token; no IP is stored; tokens are stored hashed.

import type { EmailSender } from "./email";
import { confirmEmail } from "./email-templates";
import { hashToken, isTokenShape, newId, randomToken } from "./tokens";

const MINUTE = 60_000;
const DAY = 86_400_000;

export const CONFIRM_TOKEN_TTL_MS = 7 * DAY;
/** Per address: one confirmation email per 10 minutes, at most 5 per rolling day. */
export const RESEND_MIN_INTERVAL_MS = 10 * MINUTE;
export const MAX_SENDS_PER_DAY = 5;
/** Never-confirmed sign-ups are deleted after this long. */
export const PENDING_RETENTION_MS = 30 * DAY;

export interface SignupAnswers {
  company: string | null;
  role: string | null;
  jobs: string | null;
  tool: string | null;
  message: string | null;
}

export interface SignupInput extends SignupAnswers {
  email: string;
  source: string;
  consentVersion: string;
}

export interface SignupDeps {
  db: D1Database;
  sender: EmailSender;
  /** Origin + base path, for the links in the email. */
  siteUrl: string;
  now: Date;
}

export type SignupOutcome = "confirmation_sent" | "already_confirmed" | "throttled" | "send_failed";

interface SignupRow {
  id: string;
  status: "pending" | "confirmed";
  confirm_sent_at: number | null;
  confirm_send_count: number;
}

/** Whether another confirmation email may go to this row now. */
export function canResend(
  row: Pick<SignupRow, "confirm_sent_at" | "confirm_send_count">,
  now: number,
): { allowed: boolean; countInWindow: number } {
  if (row.confirm_sent_at === null) return { allowed: true, countInWindow: 0 };
  const since = now - row.confirm_sent_at;
  const countInWindow = since >= DAY ? 0 : row.confirm_send_count;
  return {
    allowed: since >= RESEND_MIN_INTERVAL_MS && countInWindow < MAX_SENDS_PER_DAY,
    countInWindow,
  };
}

export function apiUrl(siteUrl: string, path: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}${path}?token=${encodeURIComponent(token)}`;
}

/**
 * Start (or restart) double opt-in. A confirmed address is left alone: no email, and its answers are
 * not overwritten (anyone can type any address). A pending one gets a fresh link within the limits.
 */
export async function signUp(deps: SignupDeps, input: SignupInput): Promise<SignupOutcome> {
  const { db, now } = deps;
  const t = now.getTime();
  const confirmToken = randomToken();
  const removeToken = randomToken();
  const confirmHash = await hashToken("confirm", confirmToken);
  const removeHash = await hashToken("remove", removeToken);
  const expires = t + CONFIRM_TOKEN_TTL_MS;

  const inserted = await db
    .prepare(
      `INSERT INTO early_access_signups
        (id, email, status, company, role, jobs, tool, message, source, consent_version,
         confirm_token_hash, confirm_expires_at, confirm_sent_at, confirm_send_count,
         remove_token_hash, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
    )
    .bind(
      newId("eas"),
      input.email,
      input.company,
      input.role,
      input.jobs,
      input.tool,
      input.message,
      input.source,
      input.consentVersion,
      confirmHash,
      expires,
      t,
      removeHash,
      t,
      t,
    )
    .first<{ id: string }>();

  if (!inserted) {
    const row = await db
      .prepare(
        "SELECT id, status, confirm_sent_at, confirm_send_count FROM early_access_signups WHERE email = ?",
      )
      .bind(input.email)
      .first<SignupRow>();
    if (!row) return "throttled"; // removed between the two statements; the person can retry
    if (row.status === "confirmed") return "already_confirmed";
    const { allowed, countInWindow } = canResend(row, t);
    if (!allowed) return "throttled";
    await db
      .prepare(
        `UPDATE early_access_signups SET company = ?, role = ?, jobs = ?, tool = ?, message = ?,
           source = ?, consent_version = ?, confirm_token_hash = ?, confirm_expires_at = ?,
           confirm_sent_at = ?, confirm_send_count = ?, remove_token_hash = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .bind(
        input.company,
        input.role,
        input.jobs,
        input.tool,
        input.message,
        input.source,
        input.consentVersion,
        confirmHash,
        expires,
        t,
        countInWindow + 1,
        removeHash,
        t,
        row.id,
      )
      .run();
  }

  const msg = confirmEmail({
    confirmUrl: apiUrl(deps.siteUrl, "/api/early-access/confirm", confirmToken),
    removeUrl: apiUrl(deps.siteUrl, "/api/early-access/remove", removeToken),
  });
  try {
    await deps.sender.send({ to: input.email, ...msg });
    return "confirmation_sent";
  } catch {
    return "send_failed";
  }
}

export type ConfirmOutcome = "confirmed" | "invalid" | "expired";

/** Use a confirmation link. The token is single-use; confirming twice is harmless. */
export async function confirmSignup(
  db: D1Database,
  token: string,
  now: Date,
): Promise<ConfirmOutcome> {
  if (!isTokenShape(token)) return "invalid";
  const row = await db
    .prepare("SELECT id, confirm_expires_at FROM early_access_signups WHERE confirm_token_hash = ?")
    .bind(await hashToken("confirm", token))
    .first<{ id: string; confirm_expires_at: number | null }>();
  if (!row) return "invalid";
  const t = now.getTime();
  if (row.confirm_expires_at === null || row.confirm_expires_at <= t) return "expired";
  await db
    .prepare(
      `UPDATE early_access_signups SET status = 'confirmed', confirmed_at = ?,
         confirm_token_hash = NULL, confirm_expires_at = NULL, confirm_send_count = 0, updated_at = ?
       WHERE id = ?`,
    )
    .bind(t, t, row.id)
    .run();
  return "confirmed";
}

export type RemoveOutcome = "removed" | "invalid";

/** Delete a sign-up and its answers. */
export async function removeSignup(db: D1Database, token: string): Promise<RemoveOutcome> {
  if (!isTokenShape(token)) return "invalid";
  const res = await db
    .prepare("DELETE FROM early_access_signups WHERE remove_token_hash = ?")
    .bind(await hashToken("remove", token))
    .run();
  return res.meta.changes > 0 ? "removed" : "invalid";
}

/**
 * Cron: delete never-confirmed sign-ups older than the retention window whose newest confirmation
 * link has also expired (the email promises 7 days, so a link re-sent on day 29 still works on day
 * 35). Returns rows deleted.
 */
export async function purgePending(db: D1Database, now: Date): Promise<number> {
  const t = now.getTime();
  const res = await db
    .prepare(
      `DELETE FROM early_access_signups WHERE status = 'pending' AND created_at < ?
         AND (confirm_expires_at IS NULL OR confirm_expires_at <= ?)`,
    )
    .bind(t - PENDING_RETENTION_MS, t)
    .run();
  return res.meta.changes;
}
