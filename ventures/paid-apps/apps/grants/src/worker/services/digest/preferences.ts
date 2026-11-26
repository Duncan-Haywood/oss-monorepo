// Per-member email preferences and the recipient list for digest / deadline emails.
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member, orgSettings, user } from "../../db/schema";
import { emailPreferences, notificationOptOuts } from "../../db/schema/digest";
import { sha256B64Url } from "../../lib/signed-token";
import { isEmail } from "../submission";

export type NotificationKind = "weeklyDigest" | "deadlineReminders";

export interface EmailPreferencesDto {
  weeklyDigest: boolean;
  deadlineReminders: boolean;
}

export const DEFAULT_PREFERENCES: EmailPreferencesDto = {
  weeklyDigest: true,
  deadlineReminders: true,
};

/** The caller's own row for this org; defaults (everything on) when they never changed it. */
export async function getEmailPreferences(
  ctx: AppContext,
  orgId: string,
  userId: string,
): Promise<EmailPreferencesDto> {
  const row = await ctx.db
    .select({
      weeklyDigest: emailPreferences.weeklyDigest,
      deadlineReminders: emailPreferences.deadlineReminders,
    })
    .from(emailPreferences)
    .where(and(eq(emailPreferences.orgId, orgId), eq(emailPreferences.userId, userId)))
    .get();
  return row ?? { ...DEFAULT_PREFERENCES };
}

export async function updateEmailPreferences(
  ctx: AppContext,
  orgId: string,
  userId: string,
  patch: Partial<EmailPreferencesDto>,
): Promise<EmailPreferencesDto> {
  const next = { ...(await getEmailPreferences(ctx, orgId, userId)), ...patch };
  await ctx.db
    .insert(emailPreferences)
    .values({ orgId, userId, ...next })
    .onConflictDoUpdate({
      target: [emailPreferences.userId, emailPreferences.orgId],
      set: { ...next, updatedAt: ctx.now() },
    });
  return next;
}

const norm = (email: string) => email.trim().toLowerCase();

/** Key of an address in notification_opt_outs and unsubscribe tokens (never the address itself). */
export const notificationEmailHash = (email: string) =>
  sha256B64Url(`notification-email:${norm(email)}`);

/**
 * Who gets an org's digest or deadline email: `org_settings.notifyEmails`, or (when none are set)
 * the org's owners and admins with a verified email. A member who opted out of `kind` for this org
 * is dropped, also when their address is listed in notifyEmails. Addresses that belong to no
 * member have no preferences; they stay on unless they used the unsubscribe link in an email
 * (notification_opt_outs, see ./unsubscribe.ts).
 */
export async function notificationRecipients(
  ctx: AppContext,
  orgId: string,
  kind: NotificationKind,
): Promise<string[]> {
  const [settings, members, optOuts] = await Promise.all([
    ctx.db
      .select({ notifyEmails: orgSettings.notifyEmails })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId))
      .get(),
    ctx.db
      .select({
        role: member.role,
        email: user.email,
        emailVerified: user.emailVerified,
        weeklyDigest: emailPreferences.weeklyDigest,
        deadlineReminders: emailPreferences.deadlineReminders,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(
        emailPreferences,
        and(eq(emailPreferences.userId, member.userId), eq(emailPreferences.orgId, orgId)),
      )
      .where(eq(member.organizationId, orgId))
      .all(),
    ctx.db
      .select({ emailHash: notificationOptOuts.emailHash })
      .from(notificationOptOuts)
      .where(and(eq(notificationOptOuts.orgId, orgId), eq(notificationOptOuts.kind, kind)))
      .all(),
  ]);
  const linkOptOuts = new Set(optOuts.map((o) => o.emailHash));

  const optedOut = new Set(members.filter((m) => m[kind] === false).map((m) => norm(m.email)));
  const listed = (settings?.notifyEmails ?? []).filter(isEmail);
  const candidates = listed.length
    ? listed
    : members
        .filter((m) => (m.role === "owner" || m.role === "admin") && m.emailVerified)
        .map((m) => m.email)
        .filter(isEmail);

  const out = new Map<string, string>();
  for (const email of candidates) {
    const key = norm(email);
    if (optedOut.has(key) || out.has(key)) continue;
    if (linkOptOuts.size > 0 && linkOptOuts.has(await notificationEmailHash(key))) continue;
    out.set(key, email.trim());
  }
  return [...out.values()];
}
