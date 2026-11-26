// Notifications to the org's own team (never to funders). Recipients: settings.notifyEmails,
// falling back to the profile contact email.
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { orgProfiles, orgSettings } from "../../db/schema";
import { isEmail } from "./channel";

export interface OrgContacts {
  notifyEmails: string[];
  contactEmail: string | null;
  contactName: string | null;
  legalName: string;
}

export async function loadOrgContacts(ctx: AppContext, orgId: string): Promise<OrgContacts> {
  const [settings, profile] = await Promise.all([
    ctx.db
      .select({ notifyEmails: orgSettings.notifyEmails })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId))
      .get(),
    ctx.db
      .select({
        contactEmail: orgProfiles.contactEmail,
        contactName: orgProfiles.contactName,
        legalName: orgProfiles.legalName,
      })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, orgId))
      .get(),
  ]);
  return {
    notifyEmails: (settings?.notifyEmails ?? []).filter(isEmail),
    contactEmail: isEmail(profile?.contactEmail) ? profile.contactEmail : null,
    contactName: profile?.contactName ?? null,
    legalName: profile?.legalName ?? "",
  };
}

export function teamRecipients(c: OrgContacts): string[] {
  if (c.notifyEmails.length) return [...new Set(c.notifyEmails)];
  return c.contactEmail ? [c.contactEmail] : [];
}

export function appLink(ctx: AppContext, orgId: string, path: string): string {
  const base = (ctx.env.APP_URL ?? "").replace(/\/$/, "");
  return `${base}/orgs/${orgId}${path}`;
}

export interface TeamMessage {
  subject: string;
  text: string;
  html?: string;
}

/**
 * Best-effort: a failed team notification never fails the operation that triggered it. `msg` may be
 * a function of the loaded contacts (e.g. to name the org in a rendered template's footer).
 */
export async function notifyTeam(
  ctx: AppContext,
  orgId: string,
  msg: TeamMessage | ((contacts: OrgContacts) => TeamMessage),
  contacts?: OrgContacts,
): Promise<boolean> {
  const c = contacts ?? (await loadOrgContacts(ctx, orgId));
  const to = teamRecipients(c);
  if (to.length === 0) return false;
  try {
    const m = typeof msg === "function" ? msg(c) : msg;
    await ctx.email.send({ to, subject: m.subject, text: m.text, html: m.html });
    return true;
  } catch (e) {
    ctx.logger.warn("submission.notify_failed", { orgId, error: String(e) });
    return false;
  }
}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
