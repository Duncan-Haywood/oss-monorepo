// Newsletter list: double opt-in subscribe, confirm, unsubscribe, the cron-driven nurture sequence
// and the pending-row purge. Marketing subscribers are public prospects, not tenant data (no org).
//
// Privacy rules: never log an email address or a token; the signup IP is stored only as a salted
// hash. Subscribe answers the same whatever the address's state (see routes/newsletter.ts).
import { NEWSLETTER_CONSENT_VERSION } from "@shared/newsletter";
import { and, count, eq, inArray, isNotNull, lt, lte } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  type MarketingSubscriberStatus,
  marketingEmailLog,
  marketingSubscribers,
} from "../../db/schema/marketing";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import { newId } from "../../lib/ids";
import { hashIp } from "../privacy/consents";
import { marketingConfig } from "./config";
import {
  confirmPageUrl,
  listUnsubscribeHeaders,
  newsletterOneClickUrl,
  unsubscribePageUrl,
} from "./headers";
import { CONFIRM_LINK_DAYS, renderConfirmEmail, renderSequenceEmail } from "./render";
import { dueSequenceStep, nextSequenceDue } from "./sequence";
import {
  generateConfirmToken,
  hashConfirmToken,
  isConfirmTokenShape,
  newsletterUnsubscribeToken,
  verifyNewsletterUnsubscribeToken,
} from "./tokens";

const MINUTE = 60_000;
const DAY = 86_400_000;

export const CONFIRM_TOKEN_TTL_MS = CONFIRM_LINK_DAYS * DAY;
/** Per address: at most one confirmation email per 10 minutes and 5 per rolling day. */
export const CONFIRM_RESEND_MIN_INTERVAL_MS = 10 * MINUTE;
export const CONFIRM_MAX_SENDS_PER_DAY = 5;
/** Never-confirmed signups are deleted after this long. */
export const PENDING_RETENTION_MS = 30 * DAY;
/** Nurture emails per cron run (every 30 minutes). */
export const SEQUENCE_BATCH_SIZE = 50;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export interface SubscribeInput {
  email: string;
  source: string;
  consentVersion?: string;
  ip?: string | null;
}

export type SubscribeOutcome =
  | "confirmation_sent"
  | "already_confirmed"
  | "throttled"
  | "send_failed";

type SubscriberRow = typeof marketingSubscribers.$inferSelect;

/** Whether another confirmation email may go to this row now. */
export function canResendConfirmation(
  row: Pick<SubscriberRow, "confirmSentAt" | "confirmSendCount">,
  now: Date,
): { allowed: boolean; countInWindow: number } {
  const last = row.confirmSentAt?.getTime();
  if (last === undefined) return { allowed: true, countInWindow: 0 };
  const since = now.getTime() - last;
  // The daily window restarts once a full day has passed since the last send.
  const countInWindow = since >= DAY ? 0 : row.confirmSendCount;
  const allowed =
    since >= CONFIRM_RESEND_MIN_INTERVAL_MS && countInWindow < CONFIRM_MAX_SENDS_PER_DAY;
  return { allowed, countInWindow };
}

async function sendConfirmation(ctx: AppContext, subscriberId: string, token: string) {
  const appUrl = ctx.env.APP_URL ?? "";
  const msg = renderConfirmEmail(appUrl, confirmPageUrl(appUrl, token));
  const tokenHash = await hashConfirmToken(token);
  const row = await ctx.db
    .select({ email: marketingSubscribers.email })
    .from(marketingSubscribers)
    .where(eq(marketingSubscribers.id, subscriberId))
    .get();
  if (!row) return;
  await ctx.email.send({
    to: [row.email],
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    idempotencyKey: `newsletter-confirm:${subscriberId}:${tokenHash.slice(0, 16)}`,
  });
}

/**
 * Start (or restart) double opt-in for an address. A confirmed address is left alone (no email); a
 * pending or unsubscribed one gets a fresh confirmation link within the per-address limits. An
 * unsubscribed address stays unsubscribed until the new link is used.
 */
export async function subscribe(ctx: AppContext, input: SubscribeInput): Promise<SubscribeOutcome> {
  const now = ctx.now();
  const email = normalizeEmail(input.email);
  const consent = {
    consentSource: input.source,
    consentTextVersion: input.consentVersion ?? NEWSLETTER_CONSENT_VERSION,
    consentIpHash: await hashIp(ctx, input.ip),
  };
  const token = generateConfirmToken();
  const tokenFields = {
    confirmTokenHash: await hashConfirmToken(token),
    confirmTokenExpiresAt: new Date(now.getTime() + CONFIRM_TOKEN_TTL_MS),
    confirmSentAt: now,
  };

  const inserted = await ctx.db
    .insert(marketingSubscribers)
    .values({
      id: newId("nls"),
      email,
      status: "pending",
      ...consent,
      ...tokenFields,
      confirmSendCount: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: marketingSubscribers.email })
    .returning({ id: marketingSubscribers.id });

  let subscriberId = inserted[0]?.id;
  if (!subscriberId) {
    const row = await ctx.db
      .select()
      .from(marketingSubscribers)
      .where(eq(marketingSubscribers.email, email))
      .get();
    if (!row) return "throttled"; // deleted between the two statements; the person can retry
    if (row.status === "confirmed") return "already_confirmed";
    const { allowed, countInWindow } = canResendConfirmation(row, now);
    if (!allowed) return "throttled";
    await ctx.db
      .update(marketingSubscribers)
      .set({ ...consent, ...tokenFields, confirmSendCount: countInWindow + 1, updatedAt: now })
      .where(eq(marketingSubscribers.id, row.id));
    subscriberId = row.id;
  }

  try {
    await sendConfirmation(ctx, subscriberId, token);
    return "confirmation_sent";
  } catch (e) {
    ctx.logger.warn("newsletter.confirm_send_failed", { subscriberId, error: String(e) });
    return "send_failed";
  }
}

export type ConfirmOutcome = "confirmed" | "invalid" | "expired";

/** Use a confirmation link. Idempotent for the subscriber; the token is single-use. */
export async function confirmSubscription(ctx: AppContext, token: string): Promise<ConfirmOutcome> {
  if (!isConfirmTokenShape(token)) return "invalid";
  const now = ctx.now();
  const row = await ctx.db
    .select({
      id: marketingSubscribers.id,
      expiresAt: marketingSubscribers.confirmTokenExpiresAt,
    })
    .from(marketingSubscribers)
    .where(eq(marketingSubscribers.confirmTokenHash, await hashConfirmToken(token)))
    .get();
  if (!row) return "invalid";
  if (!row.expiresAt || row.expiresAt.getTime() <= now.getTime()) return "expired";
  const sentKeys = await sentStepKeys(ctx, [row.id]);
  const next = nextSequenceDue({
    confirmedAt: now,
    lastSentAt: null,
    sentKeys: sentKeys.get(row.id) ?? new Set(),
  });
  await ctx.db
    .update(marketingSubscribers)
    .set({
      status: "confirmed",
      confirmedAt: now,
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      confirmSendCount: 0,
      unsubscribedAt: null,
      unsubscribeMethod: null,
      nextSequenceAt: next?.dueAt ?? null,
      updatedAt: now,
    })
    .where(eq(marketingSubscribers.id, row.id));
  return "confirmed";
}

export type UnsubscribeMethod = "link" | "one_click";

/** Apply an unsubscribe token. Idempotent: an already-unsubscribed subscriber stays unsubscribed. */
export async function unsubscribeWithToken(
  ctx: AppContext,
  token: string,
  method: UnsubscribeMethod,
): Promise<"unsubscribed" | "invalid"> {
  const secret = marketingConfig(ctx.env).tokenSecret;
  if (!secret) return "invalid";
  const id = await verifyNewsletterUnsubscribeToken(secret, token);
  if (!id) return "invalid";
  const now = ctx.now();
  const row = await ctx.db
    .select({ status: marketingSubscribers.status })
    .from(marketingSubscribers)
    .where(eq(marketingSubscribers.id, id))
    .get();
  if (!row) return "invalid";
  if (row.status !== "unsubscribed") {
    await ctx.db
      .update(marketingSubscribers)
      .set({
        status: "unsubscribed",
        unsubscribedAt: now,
        unsubscribeMethod: method,
        confirmTokenHash: null,
        confirmTokenExpiresAt: null,
        nextSequenceAt: null,
        updatedAt: now,
      })
      .where(eq(marketingSubscribers.id, id));
  }
  return "unsubscribed";
}

async function sentStepKeys(ctx: AppContext, ids: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const part of chunk(ids, D1_IN_CHUNK)) {
    const rows = await ctx.db
      .select({ subscriberId: marketingEmailLog.subscriberId, stepKey: marketingEmailLog.stepKey })
      .from(marketingEmailLog)
      .where(inArray(marketingEmailLog.subscriberId, part))
      .all();
    for (const r of rows) {
      const set = out.get(r.subscriberId) ?? new Set<string>();
      set.add(r.stepKey);
      out.set(r.subscriberId, set);
    }
  }
  return out;
}

export interface SequenceRunResult {
  skipped: string | null;
  sent: number;
  notDue: number;
  alreadySent: number;
  failed: number;
}

/**
 * Cron (every 30 min): send each due confirmed subscriber their next sequence step. Does nothing
 * unless marketingConfig(env).sendingEnabled (MARKETING_EMAIL_ENABLED=true, a postal address and a
 * token secret). Idempotent per subscriber+step through marketing_email_log.
 */
export async function sendDueSequenceEmails(
  ctx: AppContext,
  opts: { limit?: number } = {},
): Promise<SequenceRunResult> {
  const result: SequenceRunResult = {
    skipped: null,
    sent: 0,
    notDue: 0,
    alreadySent: 0,
    failed: 0,
  };
  const cfg = marketingConfig(ctx.env);
  if (!cfg.sendingEnabled || !cfg.postalAddress || !cfg.tokenSecret) {
    result.skipped = cfg.blockers.join(",");
    return result;
  }
  const now = ctx.now();
  const appUrl = ctx.env.APP_URL ?? "";
  const rows = await ctx.db
    .select({
      id: marketingSubscribers.id,
      email: marketingSubscribers.email,
      confirmedAt: marketingSubscribers.confirmedAt,
      lastSentAt: marketingSubscribers.lastSequenceSentAt,
    })
    .from(marketingSubscribers)
    .where(
      and(
        eq(marketingSubscribers.status, "confirmed"),
        isNotNull(marketingSubscribers.nextSequenceAt),
        lte(marketingSubscribers.nextSequenceAt, now),
      ),
    )
    .orderBy(marketingSubscribers.nextSequenceAt)
    .limit(opts.limit ?? SEQUENCE_BATCH_SIZE)
    .all();
  const sent = await sentStepKeys(
    ctx,
    rows.map((r) => r.id),
  );

  for (const r of rows) {
    const keys = sent.get(r.id) ?? new Set<string>();
    const state = { confirmedAt: r.confirmedAt ?? now, lastSentAt: r.lastSentAt, sentKeys: keys };
    const step = dueSequenceStep(state, now);
    if (!step) {
      result.notDue++;
      await ctx.db
        .update(marketingSubscribers)
        .set({ nextSequenceAt: nextSequenceDue(state)?.dueAt ?? null })
        .where(eq(marketingSubscribers.id, r.id));
      continue;
    }
    const claimed = await ctx.db
      .insert(marketingEmailLog)
      .values({ subscriberId: r.id, stepKey: step.key, sentAt: now })
      .onConflictDoNothing()
      .returning({ key: marketingEmailLog.stepKey });
    if (claimed.length === 0) {
      result.alreadySent++;
      continue;
    }
    try {
      const token = await newsletterUnsubscribeToken(cfg.tokenSecret, r.id);
      const msg = renderSequenceEmail(step.key, appUrl, {
        unsubscribeUrl: unsubscribePageUrl(appUrl, token),
        postalAddress: cfg.postalAddress,
      });
      await ctx.email.send({
        to: [r.email],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        headers: listUnsubscribeHeaders(newsletterOneClickUrl(appUrl, token)) ?? undefined,
        idempotencyKey: `newsletter:${r.id}:${step.key}`,
        category: "marketing",
      });
      keys.add(step.key);
      await ctx.db
        .update(marketingSubscribers)
        .set({
          lastSequenceSentAt: now,
          nextSequenceAt:
            nextSequenceDue({ ...state, lastSentAt: now, sentKeys: keys })?.dueAt ?? null,
          updatedAt: now,
        })
        .where(eq(marketingSubscribers.id, r.id));
      result.sent++;
    } catch (e) {
      result.failed++;
      ctx.logger.warn("newsletter.sequence_send_failed", {
        subscriberId: r.id,
        step: step.key,
        error: String(e),
      });
      await ctx.db
        .delete(marketingEmailLog)
        .where(
          and(eq(marketingEmailLog.subscriberId, r.id), eq(marketingEmailLog.stepKey, step.key)),
        );
    }
  }
  return result;
}

/** Daily: delete signups that were never confirmed (no consent, so no reason to keep the address). */
export async function purgeStalePending(ctx: AppContext): Promise<number> {
  const cutoff = new Date(ctx.now().getTime() - PENDING_RETENTION_MS);
  const rows = await ctx.db
    .delete(marketingSubscribers)
    .where(
      and(eq(marketingSubscribers.status, "pending"), lt(marketingSubscribers.createdAt, cutoff)),
    )
    .returning({ id: marketingSubscribers.id });
  return rows.length;
}

/** Counts by status (platform admin). */
export async function subscriberCounts(
  ctx: AppContext,
): Promise<Record<MarketingSubscriberStatus, number>> {
  const rows = await ctx.db
    .select({ status: marketingSubscribers.status, n: count() })
    .from(marketingSubscribers)
    .groupBy(marketingSubscribers.status)
    .all();
  const out: Record<MarketingSubscriberStatus, number> = {
    pending: 0,
    confirmed: 0,
    unsubscribed: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}
