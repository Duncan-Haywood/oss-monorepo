// One-click unsubscribe for team notification emails (weekly digest, deadline nudges).
//
// Each recipient gets their own token: `n1.{orgId}.{kind}.{emailHash}.{hmac}`, where emailHash is
// the base64url SHA-256 of the normalized address (the address itself never appears in the URL) and
// the HMAC (AUTH_SECRET) covers everything before it. Nothing is stored for the token.
//
// Applying it: a member of the org gets the matching email_preferences flag turned off (so the
// settings page shows the change and they can turn it back on); any other address (e.g. one listed in
// org_settings.notifyEmails) gets a notification_opt_outs row, which notificationRecipients() honours.
import { NOTIFICATION_UNSUBSCRIBE_PREFIX } from "@shared/newsletter";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member, organization, user } from "../../db/schema";
import { notificationOptOuts } from "../../db/schema/digest";
import { hmacB64Url, timingSafeEqual } from "../../lib/signed-token";
import {
  type NotificationKind,
  notificationEmailHash,
  updateEmailPreferences,
} from "./preferences";

const KIND_CODES: Record<NotificationKind, string> = { weeklyDigest: "w", deadlineReminders: "d" };
const KIND_BY_CODE: Record<string, NotificationKind> = {
  w: "weeklyDigest",
  d: "deadlineReminders",
};
const ORG_ID_RE = /^org_[0-9a-z]{20}$/;
const HASH_RE = /^[A-Za-z0-9_-]{43}$/;

const message = (orgId: string, code: string, emailHash: string) =>
  `notification-unsubscribe:v1:${orgId}:${code}:${emailHash}`;

export async function notificationUnsubscribeToken(
  secret: string,
  p: { orgId: string; kind: NotificationKind; email: string },
): Promise<string> {
  const code = KIND_CODES[p.kind];
  const emailHash = await notificationEmailHash(p.email);
  const sig = await hmacB64Url(secret, message(p.orgId, code, emailHash));
  return `${NOTIFICATION_UNSUBSCRIBE_PREFIX}${p.orgId}.${code}.${emailHash}.${sig}`;
}

export interface NotificationUnsubscribeClaim {
  orgId: string;
  kind: NotificationKind;
  emailHash: string;
}

export async function verifyNotificationUnsubscribeToken(
  secret: string,
  token: string,
): Promise<NotificationUnsubscribeClaim | null> {
  if (!token.startsWith(NOTIFICATION_UNSUBSCRIBE_PREFIX)) return null;
  const parts = token.slice(NOTIFICATION_UNSUBSCRIBE_PREFIX.length).split(".");
  if (parts.length !== 4) return null;
  const [orgId = "", code = "", emailHash = "", sig = ""] = parts;
  const kind = KIND_BY_CODE[code];
  if (!kind || !ORG_ID_RE.test(orgId) || !HASH_RE.test(emailHash) || !HASH_RE.test(sig)) {
    return null;
  }
  const expected = await hmacB64Url(secret, message(orgId, code, emailHash));
  return timingSafeEqual(sig, expected) ? { orgId, kind, emailHash } : null;
}

/** Apply a token. "invalid" for bad signatures and unknown orgs; repeat clicks stay "unsubscribed". */
export async function applyNotificationUnsubscribe(
  ctx: AppContext,
  token: string,
): Promise<"unsubscribed" | "invalid"> {
  const secret = ctx.env.AUTH_SECRET;
  if (!secret) return "invalid";
  const claim = await verifyNotificationUnsubscribeToken(secret, token);
  if (!claim) return "invalid";
  const { orgId, kind, emailHash } = claim;
  const org = await ctx.db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  if (!org) return "invalid";

  const members = await ctx.db
    .select({ userId: member.userId, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .all();
  for (const m of members) {
    if ((await notificationEmailHash(m.email)) === emailHash) {
      await updateEmailPreferences(ctx, orgId, m.userId, { [kind]: false });
      return "unsubscribed";
    }
  }
  await ctx.db.insert(notificationOptOuts).values({ orgId, emailHash, kind }).onConflictDoNothing();
  return "unsubscribed";
}
