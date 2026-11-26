// Weekly "money to chase" email: each member who turned it on gets, once a week, the next steps
// from the company's cash report (past-due and short-paid applications, retainage to bill,
// unconditional waivers owed, change orders waiting). Opt-in per member per company
// (cash_digest_subscriptions); sent by the Worker's cron (index.ts, wrangler.jsonc). Selection
// rules: src/shared/cash-digest.ts. The sample job is left out: its numbers are invented.
import {
  addDays,
  type CashDigest,
  type CashDigestDraft,
  cashDigest,
  DEFAULT_DIGEST_HOUR,
  DEFAULT_DIGEST_TIME_ZONE,
  DEFAULT_DIGEST_WEEKDAY,
  digestCutoff,
  digestDraftText,
  digestDueDay,
  digestFollowUpText,
  digestJobHeading,
  followUpAnchor,
  nextDigestDay,
} from "@shared/cash-digest";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import { cashDigestSubscriptions, member, organization, user } from "../../db/schema";
import { unsubscribeQuery, unsubscribeSecret } from "../../lib/unsubscribe-token";
import { escapeHtml, type RenderedEmail } from "../auth/emails";
import { isoDay, orgCashReport } from "./cash";

export interface DigestSetting {
  enabled: boolean;
  lastSentOn: string | null;
  /** Day of the week it goes out, 0 Sunday ... 6 Saturday, in `timeZone`. */
  weekday: number;
  /** Hour of the day (0-23) in `timeZone` from which it goes out. */
  hour: number;
  /** IANA time zone the weekday and hour are read in. */
  timeZone: string;
  /** The next day (in `timeZone`) the list is checked and, if anything is due, sent; null when off. */
  nextOn: string | null;
  /** True when mail actually leaves the Worker (false until the deploy sets EMAIL_FROM). */
  delivers: boolean;
  emailVerified: boolean;
}

export async function getDigestSetting(
  ctx: AppContext,
  orgId: string,
  userId: string,
): Promise<DigestSetting> {
  const [row] = await ctx.db
    .select({
      lastSentOn: cashDigestSubscriptions.lastSentOn,
      weekday: cashDigestSubscriptions.weekday,
      hour: cashDigestSubscriptions.hour,
      timeZone: cashDigestSubscriptions.timeZone,
    })
    .from(cashDigestSubscriptions)
    .where(
      and(eq(cashDigestSubscriptions.orgId, orgId), eq(cashDigestSubscriptions.userId, userId)),
    );
  const [u] = await ctx.db
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId));
  const weekday = row?.weekday ?? DEFAULT_DIGEST_WEEKDAY;
  const hour = row?.hour ?? DEFAULT_DIGEST_HOUR;
  const timeZone = row?.timeZone ?? DEFAULT_DIGEST_TIME_ZONE;
  const lastSentOn = row?.lastSentOn ?? null;
  return {
    enabled: row !== undefined,
    lastSentOn,
    weekday,
    hour,
    timeZone,
    nextOn: row ? nextDigestDay(weekday, lastSentOn, ctx.now(), { hour, timeZone }) : null,
    delivers: ctx.email.delivers,
    emailVerified: u?.emailVerified ?? false,
  };
}

export async function setDigestSetting(
  ctx: AppContext,
  orgId: string,
  userId: string,
  input: {
    enabled: boolean;
    weekday?: number | undefined;
    hour?: number | undefined;
    timeZone?: string | undefined;
  },
): Promise<DigestSetting> {
  const { enabled, weekday, hour, timeZone } = input;
  if (enabled) {
    const insert = ctx.db.insert(cashDigestSubscriptions).values({
      orgId,
      userId,
      weekday: weekday ?? DEFAULT_DIGEST_WEEKDAY,
      hour: hour ?? DEFAULT_DIGEST_HOUR,
      timeZone: timeZone ?? DEFAULT_DIGEST_TIME_ZONE,
    });
    // Turning it on again keeps the day, hour and zone already chosen unless new ones are sent.
    const set = {
      ...(weekday === undefined ? {} : { weekday }),
      ...(hour === undefined ? {} : { hour }),
      ...(timeZone === undefined ? {} : { timeZone }),
    };
    await (Object.keys(set).length === 0
      ? insert.onConflictDoNothing()
      : insert.onConflictDoUpdate({
          target: [cashDigestSubscriptions.orgId, cashDigestSubscriptions.userId],
          set,
        }));
  } else {
    await ctx.db
      .delete(cashDigestSubscriptions)
      .where(
        and(eq(cashDigestSubscriptions.orgId, orgId), eq(cashDigestSubscriptions.userId, userId)),
      );
  }
  return getDigestSetting(ctx, orgId, userId);
}

/** What the signed unsubscribe link shows (routes/unsubscribe.ts): the company and whether it is on. */
export async function digestUnsubscribeStatus(
  ctx: AppContext,
  orgId: string,
  userId: string,
): Promise<{ orgName: string | null; subscribed: boolean }> {
  const [org] = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId));
  const { enabled } = await getDigestSetting(ctx, orgId, userId);
  return { orgName: org?.name ?? null, subscribed: enabled };
}

/** The one-click unsubscribe: removes that member's row for that company, nothing else. */
export async function unsubscribeDigest(ctx: AppContext, orgId: string, userId: string) {
  await setDigestSetting(ctx, orgId, userId, { enabled: false });
}

/**
 * The two unsubscribe links for one member's email, or null without a signing secret (local dev):
 * `page` is the /unsubscribe page for people, `oneClick` the RFC 8058 POST target for mail apps.
 */
export async function digestUnsubscribeLinks(
  env: { APP_URL: string; AUTH_SECRET?: string | undefined },
  orgId: string,
  userId: string,
): Promise<{ page: string; oneClick: string } | null> {
  const secret = unsubscribeSecret(env);
  if (!secret) return null;
  const q = await unsubscribeQuery(secret, orgId, userId);
  return {
    page: `${appUrl(env)}/unsubscribe?${q}`,
    oneClick: `${appUrl(env)}/api/unsubscribe/digest?${q}`,
  };
}

/** What this week's email would say for the company, or null when there is nothing to chase. */
export async function previewDigest(ctx: AppContext, orgId: string): Promise<CashDigest | null> {
  return cashDigest(await orgCashReport(ctx, orgId, { excludeSample: true }));
}

const appUrl = (env: { APP_URL: string }) => env.APP_URL.replace(/\/+$/, "");

/**
 * Plain text + minimal HTML, every interpolated value escaped. The subject is fixed text: company,
 * job and GC names are typed by customers and never reach a header.
 */
export function digestEmail(
  d: CashDigest,
  opts: {
    orgId: string;
    orgName: string;
    userName: string;
    unsubscribe?: { page: string; oneClick: string } | null;
  },
  env: { APP_URL: string },
): RenderedEmail & { headers?: Record<string, string> } {
  const cashUrl = `${appUrl(env)}/orgs/${encodeURIComponent(opts.orgId)}/cash`;
  const name = opts.userName.trim() || "there";
  const intro = `Here is what to chase this week for ${opts.orgName}, from the Cash and retainage report as of ${d.asOf}.`;
  const more =
    d.moreJobs > 0
      ? `${d.moreJobs} more job${d.moreJobs === 1 ? " has" : "s have"} next steps on the report.`
      : null;
  const followUps = digestFollowUpText(d);
  const followUpUrl = `${cashUrl}#follow-ups`;
  // Each draft by its own anchor, so a click opens that application's email, not the whole list.
  const draftUrl = (dr: CashDigestDraft) => `${cashUrl}#${followUpAnchor(dr.payAppId)}`;
  const unsub = opts.unsubscribe ?? null;
  const footer = unsub
    ? "You get this email because you turned it on for this company on the Cash and retainage page. Every figure comes from what was entered in PayApps: check it against your own records before you call."
    : "You get this email because you turned it on for this company on the Cash and retainage page; turn it off there. Every figure comes from what was entered in PayApps: check it against your own records before you call.";
  const text = [
    `Hi ${name},`,
    "",
    intro,
    "",
    ...d.summary.map((s) => `- ${s}`),
    "",
    ...d.jobs.flatMap((j) => [
      digestJobHeading(j),
      ...j.actions.map((a) => `  - ${a}`),
      ...j.drafts.map((dr) => `  - ${digestDraftText(dr)}: ${draftUrl(dr)}`),
      "",
    ]),
    ...(more ? [more, ""] : []),
    ...(followUps ? [followUps, `Drafts: ${followUpUrl}`, ""] : []),
    `Open the report: ${cashUrl}`,
    "",
    footer,
    ...(unsub ? [`Stop this weekly email (one click, no sign-in): ${unsub.page}`] : []),
    "",
    "PayApps",
  ].join("\n");
  const p = (s: string, style = "margin:0 0 16px") => `<p style="${style}">${escapeHtml(s)}</p>`;
  const list = (items: string[]) =>
    `<ul style="margin:0 0 16px;padding-left:20px">${items.map((i) => `<li style="margin:0 0 6px">${escapeHtml(i)}</li>`).join("")}</ul>`;
  const html = [
    '<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">',
    p(`Hi ${name},`),
    p(intro),
    d.summary.length ? list(d.summary) : "",
    ...d.jobs.map(
      (j) =>
        `${p(digestJobHeading(j), "margin:0 0 6px;font-weight:600")}<ul style="margin:0 0 16px;padding-left:20px">${[
          ...j.actions.map((a) => escapeHtml(a)),
          ...j.drafts.map(
            (dr) => `<a href="${escapeHtml(draftUrl(dr))}">${escapeHtml(digestDraftText(dr))}</a>`,
          ),
        ]
          .map((i) => `<li style="margin:0 0 6px">${i}</li>`)
          .join("")}</ul>`,
    ),
    more ? p(more) : "",
    followUps
      ? `<p style="margin:0 0 16px">${escapeHtml(followUps)} <a href="${escapeHtml(followUpUrl)}">Open the drafts</a>.</p>`
      : "",
    `<p style="margin:0 0 16px"><a href="${escapeHtml(cashUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the cash report</a></p>`,
    p(footer, "margin:0 0 16px;font-size:13px;color:#475569"),
    unsub
      ? `<p style="margin:0 0 16px;font-size:13px;color:#475569"><a href="${escapeHtml(unsub.page)}" style="color:#475569">Stop this weekly email</a> (one click, no sign-in).</p>`
      : "",
    '<p style="margin:0">PayApps</p>',
    "</body></html>",
  ].join("");
  const subject = "Your weekly PayApps list: money to chase";
  if (!unsub) return { subject, text, html };
  // RFC 2369 + RFC 8058: mail apps show their own unsubscribe button and POST to the link.
  const headers = {
    "List-Unsubscribe": `<${unsub.oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  return { subject, text, html, headers };
}

export interface DigestRun {
  companies: number;
  sent: number;
  /** Members due but with nothing to chase this week (no email). */
  nothingToChase: number;
  failed: number;
}

/** At most this many companies per cron run; the rest are picked up on the next run. */
export const DIGEST_COMPANIES_PER_RUN = 200;

/**
 * Send this hour's digests. Due: the member's chosen weekday and hour have come in their own time
 * zone (digestDueDay), still a member, verified address, and no digest in the last 6 days. Each send is claimed first with a conditional update on last_sent_on, so two runs
 * (a retry, two isolates) never mail the same member twice; a failed send puts the old value back.
 * One cash report per company, however many of its members opted in.
 */
export async function sendWeeklyDigests(
  ctx: AppContext,
  opts: { companiesPerRun?: number } = {},
): Promise<DigestRun> {
  const now = ctx.now();
  // No member's local day is later than tomorrow in UTC, so anyone mailed after this cutoff is not
  // due anywhere; the exact weekday, hour and 6-day test per member is digestDueDay below.
  const cutoff = digestCutoff(addDays(isoDay(now), 1));
  const candidates = await ctx.db
    .select({
      orgId: cashDigestSubscriptions.orgId,
      userId: cashDigestSubscriptions.userId,
      lastSentOn: cashDigestSubscriptions.lastSentOn,
      weekday: cashDigestSubscriptions.weekday,
      hour: cashDigestSubscriptions.hour,
      timeZone: cashDigestSubscriptions.timeZone,
      email: user.email,
      userName: user.name,
      orgName: organization.name,
    })
    .from(cashDigestSubscriptions)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, cashDigestSubscriptions.orgId),
        eq(member.userId, cashDigestSubscriptions.userId),
      ),
    )
    .innerJoin(user, eq(user.id, cashDigestSubscriptions.userId))
    .innerJoin(organization, eq(organization.id, cashDigestSubscriptions.orgId))
    .where(
      and(
        eq(user.emailVerified, true),
        or(
          isNull(cashDigestSubscriptions.lastSentOn),
          lte(cashDigestSubscriptions.lastSentOn, cutoff),
        ),
      ),
    )
    .orderBy(asc(cashDigestSubscriptions.orgId));
  const due = candidates.flatMap((r) => {
    const today = digestDueDay(r, now);
    return today ? [{ ...r, today }] : [];
  });

  const byOrg = new Map<string, typeof due>();
  for (const r of due) {
    const list = byOrg.get(r.orgId) ?? [];
    list.push(r);
    byOrg.set(r.orgId, list);
  }
  const run: DigestRun = { companies: 0, sent: 0, nothingToChase: 0, failed: 0 };
  const limit = opts.companiesPerRun ?? DIGEST_COMPANIES_PER_RUN;
  for (const [orgId, members] of byOrg) {
    if (run.companies >= limit) break;
    run.companies++;
    let digest: CashDigest | null;
    try {
      digest = await previewDigest(ctx, orgId);
    } catch (e) {
      ctx.logger.error("digest.report_failed", { orgId, error: String(e) });
      run.failed += members.length;
      continue;
    }
    for (const m of members) {
      const today = m.today;
      const claimed = await claim(ctx, orgId, m.userId, m.lastSentOn, today);
      if (!claimed) continue; // another run took it
      if (digest === null) {
        // Counted as this week's digest: nothing to chase is not a reason to mail tomorrow.
        run.nothingToChase++;
        continue;
      }
      const unsubscribe = await digestUnsubscribeLinks(ctx.env, orgId, m.userId);
      const mail = digestEmail(
        digest,
        { orgId, orgName: m.orgName, userName: m.userName, unsubscribe },
        ctx.env,
      );
      try {
        await ctx.email.send({ to: [m.email], ...mail });
        run.sent++;
      } catch (e) {
        run.failed++;
        ctx.logger.warn("digest.email_failed", { orgId, userId: m.userId, error: String(e) });
        await ctx.db
          .update(cashDigestSubscriptions)
          .set({ lastSentOn: m.lastSentOn })
          .where(
            and(
              eq(cashDigestSubscriptions.orgId, orgId),
              eq(cashDigestSubscriptions.userId, m.userId),
              eq(cashDigestSubscriptions.lastSentOn, today),
            ),
          );
      }
    }
  }
  ctx.logger.info("digest.run", { ...run });
  return run;
}

async function claim(
  ctx: AppContext,
  orgId: string,
  userId: string,
  previous: string | null,
  today: string,
): Promise<boolean> {
  const res = await ctx.db
    .update(cashDigestSubscriptions)
    .set({ lastSentOn: today })
    .where(
      and(
        eq(cashDigestSubscriptions.orgId, orgId),
        eq(cashDigestSubscriptions.userId, userId),
        previous === null
          ? isNull(cashDigestSubscriptions.lastSentOn)
          : eq(cashDigestSubscriptions.lastSentOn, previous),
      ),
    )
    .returning({ orgId: cashDigestSubscriptions.orgId });
  return res.length === 1;
}
