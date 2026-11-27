// "Email me when an RFQ arrives": each member of a shop chooses it for themselves (off by default),
// and receiveEmail calls notifyRfqArrival once per new emailed RFQ (never for a redelivery).
//
// Rules (docs/EMAIL.md, "RFQ arrival emails"):
// - Only current members who turned it on, at most MAX_RECIPIENTS, one message each (no shared To).
//   Where sign-in needs a confirmed address, only confirmed addresses are mailed.
// - The content is a notice, not the RFQ: subject, the claimed sender, file counts and a link into
//   the app. No body text and no attachments, so the shop's inbound address cannot be used to relay
//   a stranger's message through our domain. Subject and sender come from the stranger, so they are
//   cut to one short line and their host names defanged ("example[.]com") so mail clients do not
//   turn them into links; the only link is ours.
// - A failed send is logged (ids only) and never refuses or undoes the RFQ.
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member, memberNotifications, shopSettings, user } from "../../db/schema";
import { isSafeEmailAddress, sanitizeHeaderValue } from "../../ports/email";
import { requiresEmailVerification } from "../auth/auth";

/** Members mailed per RFQ at most; the inbound daily limit (50) caps the rest. */
export const MAX_RECIPIENTS = 25;
const SUBJECT_CHARS = 120;

/** One line, at most `max` characters, host names defanged so clients do not link them. */
export function defang(s: string, max: number): string {
  const flat = sanitizeHeaderValue(s, 10_000).replace(/\s+/g, " ");
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return cut
    .replace(/\b(https?|ftp)(s?):\/\//gi, "$1$2[:]//")
    .replace(/([a-z0-9-])\.(?=[a-z][a-z0-9-]*)/gi, "$1[.]");
}

export interface ArrivalFacts {
  shopName: string;
  orgId: string;
  rfqId: string;
  subject: string | null;
  fromAddress: string | null;
  filesStored: number;
  notes: number;
}

export function arrivalEmail(appUrl: string, f: ArrivalFacts): { subject: string; text: string } {
  const base = appUrl.replace(/\/+$/, "");
  const subject = f.subject?.trim() ? defang(f.subject, SUBJECT_CHARS) : "(no subject)";
  const shop = defang(f.shopName, 80);
  const files =
    f.filesStored === 0
      ? "none"
      : `${f.filesStored} stored${f.notes > 0 ? ` (${f.notes} intake note${f.notes === 1 ? "" : "s"} on the RFQ)` : ""}`;
  const text = [
    `A new RFQ arrived at ${shop}'s RFQ email address.`,
    "",
    `Subject: ${subject}`,
    `Sent by: ${f.fromAddress ? defang(f.fromAddress, 120) : "unknown"} (as the email says; not verified)`,
    `Files: ${files}`,
    "",
    `Open it: ${base}/app/${encodeURIComponent(f.orgId)}/rfqs/${encodeURIComponent(f.rfqId)}`,
    "",
    'Nothing has been read by AI yet: press "Extract with AI" on the RFQ when you want it read.',
    "",
    `You get this because you turned on "Email me when an RFQ arrives" for ${shop}.`,
    `Turn it off on the RFQs page: ${base}/app/${encodeURIComponent(f.orgId)}/rfqs`,
  ].join("\n");
  return { subject: `New RFQ by email: ${subject}`, text };
}

/** The signed-in member's own setting. */
export async function rfqArrivalNotifyFor(ctx: AppContext, orgId: string, userId: string) {
  const row = await ctx.db
    .select({ on: memberNotifications.rfqArrival })
    .from(memberNotifications)
    .where(and(eq(memberNotifications.orgId, orgId), eq(memberNotifications.userId, userId)))
    .get();
  return row?.on ?? false;
}

export async function saveRfqArrivalNotify(
  ctx: AppContext,
  orgId: string,
  userId: string,
  on: boolean,
) {
  await ctx.db
    .insert(memberNotifications)
    .values({ orgId, userId, rfqArrival: on })
    .onConflictDoUpdate({
      target: [memberNotifications.orgId, memberNotifications.userId],
      set: { rfqArrival: on, updatedAt: ctx.now() },
    });
  ctx.logger.info("inbound.notify_changed", { orgId, userId, on });
}

/** Who is mailed: current members of this shop who turned it on. */
async function recipients(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select({ userId: user.id, email: user.email, verified: user.emailVerified })
    .from(memberNotifications)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, memberNotifications.orgId),
        eq(member.userId, memberNotifications.userId),
      ),
    )
    .innerJoin(user, eq(user.id, memberNotifications.userId))
    .where(and(eq(memberNotifications.orgId, orgId), eq(memberNotifications.rfqArrival, true)))
    .limit(MAX_RECIPIENTS)
    .all();
  const needVerified = requiresEmailVerification(ctx.env);
  return rows.filter((r) => isSafeEmailAddress(r.email) && (!needVerified || r.verified));
}

export async function notifyRfqArrival(
  ctx: AppContext,
  facts: Omit<ArrivalFacts, "shopName">,
): Promise<{ sent: number; failed: number }> {
  const log = ctx.logger.child({ orgId: facts.orgId });
  let sent = 0;
  let failed = 0;
  try {
    const to = await recipients(ctx, facts.orgId);
    if (to.length === 0) return { sent, failed };
    const shop = await ctx.db
      .select({ name: shopSettings.displayName })
      .from(shopSettings)
      .where(eq(shopSettings.orgId, facts.orgId))
      .get();
    const mail = arrivalEmail(ctx.env.APP_URL, { ...facts, shopName: shop?.name ?? "your shop" });
    for (const r of to) {
      try {
        await ctx.email.send({ to: [r.email], subject: mail.subject, text: mail.text });
        sent++;
      } catch (e) {
        failed++;
        log.warn("inbound.notify_failed", {
          rfqId: facts.rfqId,
          userId: r.userId,
          error: String(e)
            .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]")
            .slice(0, 300),
        });
      }
    }
  } catch (e) {
    log.error("inbound.notify_error", { rfqId: facts.rfqId, error: String(e).slice(0, 300) });
  }
  log.info("inbound.notified", { rfqId: facts.rfqId, sent, failed });
  return { sent, failed };
}
