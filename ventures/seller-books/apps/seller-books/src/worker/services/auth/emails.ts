// Account emails (verify address, reset password, "you already have an account") and invitations, sent
// via ctx.email.
// Pattern from apps/grants (services/auth/emails.ts). Links point at SPA pages (`/verify-email?token=`,
// `/reset-password?token=`), which call Better Auth's API (GET /api/auth/verify-email?token=,
// POST /api/auth/reset-password), never at /api/auth/* directly. Sends are throttled per user with
// durable rows in the `verification` table, and never throw: a failed or throttled send must not
// reveal (by status or error) whether an address has an account.
import { and, eq, gt, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { verification } from "../../db/schema";

export type AuthEmailDeps = Pick<AppContext, "env" | "db" | "email" | "logger" | "now">;

export interface EmailUser {
  id: string;
  email: string;
  name: string;
}

export type AuthEmailKind = "verify-email" | "reset-password" | "existing-account";

/** Max sends per user per window (the first sign-up email counts toward verify-email). */
export const EMAIL_THROTTLE: Record<AuthEmailKind, { limit: number; windowMs: number }> = {
  "verify-email": { limit: 3, windowMs: 15 * 60 * 1000 },
  "reset-password": { limit: 3, windowMs: 15 * 60 * 1000 },
  "existing-account": { limit: 1, windowMs: 60 * 60 * 1000 },
};

export const THROTTLE_IDENTIFIER_PREFIX = "throttle:";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

const appUrl = (env: { APP_URL: string }) => env.APP_URL.replace(/\/+$/, "");

export const verifyEmailLink = (env: { APP_URL: string }, token: string) =>
  `${appUrl(env)}/verify-email?token=${encodeURIComponent(token)}`;

export const resetPasswordLink = (env: { APP_URL: string }, token: string) =>
  `${appUrl(env)}/reset-password?token=${encodeURIComponent(token)}`;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Plain text + minimal HTML. Every interpolated value is HTML-escaped in the HTML part. */
export function render(opts: {
  subject: string;
  greetingName: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footer: string;
}): RenderedEmail {
  const name = opts.greetingName.trim() || "there";
  const text = [
    `Hi ${name},`,
    "",
    ...opts.paragraphs.flatMap((p) => [p, ""]),
    ...(opts.action ? [`${opts.action.label}: ${opts.action.url}`, ""] : []),
    opts.footer,
    "",
    "Seller Books",
  ].join("\n");
  const p = (s: string) => `<p style="margin:0 0 16px">${escapeHtml(s)}</p>`;
  const html = [
    '<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">',
    p(`Hi ${name},`),
    ...opts.paragraphs.map(p),
    opts.action
      ? `<p style="margin:0 0 16px"><a href="${escapeHtml(opts.action.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(opts.action.label)}</a></p>` +
        `<p style="margin:0 0 16px;font-size:13px;color:#475569">Or paste this link into your browser:<br>${escapeHtml(opts.action.url)}</p>`
      : "",
    `<p style="margin:0 0 16px;font-size:13px;color:#475569">${escapeHtml(opts.footer)}</p>`,
    '<p style="margin:0">Seller Books</p>',
    "</body></html>",
  ].join("");
  return { subject: opts.subject, text, html };
}

export function verificationEmail(user: EmailUser, link: string): RenderedEmail {
  return render({
    subject: "Confirm your email for Seller Books",
    greetingName: user.name,
    paragraphs: [`Please confirm that ${user.email} is your email address.`],
    action: { label: "Confirm email", url: link },
    footer:
      "This link expires in 24 hours. If you didn't create a Seller Books account, you can ignore this email.",
  });
}

export function resetPasswordEmail(user: EmailUser, link: string): RenderedEmail {
  return render({
    subject: "Reset your Seller Books password",
    greetingName: user.name,
    paragraphs: [`Someone asked to reset the password for ${user.email}.`],
    action: { label: "Choose a new password", url: link },
    footer:
      "This link expires in 1 hour and works once. Resetting signs you out everywhere. If you didn't ask for this, ignore this email; your password stays the same.",
  });
}

export function existingAccountEmail(user: EmailUser, env: { APP_URL: string }): RenderedEmail {
  return render({
    subject: "You already have a Seller Books account",
    greetingName: user.name,
    paragraphs: [
      `Someone tried to create a Seller Books account with ${user.email}, but you already have one.`,
      "If that was you, sign in instead. Forgot your password? You can reset it from the sign-in page.",
    ],
    action: { label: "Reset your password", url: `${appUrl(env)}/forgot-password` },
    footer: "If this wasn't you, no action is needed.",
  });
}

const ROLE_WORDS: Record<string, string> = {
  admin: "an admin",
  editor: "an editor",
  viewer: "a viewer",
};

/**
 * "X invited you to Y's books". The shop and inviter names are typed by customers: the HTML part
 * escapes them (render), and the subject carries neither, so a shop name cannot be used to write
 * a convincing subject line to a stranger. The link works only for a signed-in user whose
 * (verified) email is this address, so a forwarded email lets nobody else in.
 */
export function invitationEmail(
  opts: { email: string; orgName: string; inviterName: string | null; role: string; days: number },
  link: string,
): RenderedEmail {
  const who = opts.inviterName?.trim() || "Someone";
  return render({
    subject: "You're invited to a shop's books on Seller Books",
    greetingName: "",
    paragraphs: [
      `${who} invited ${opts.email} to join the books of ${opts.orgName} on Seller Books as ${ROLE_WORDS[opts.role] ?? opts.role}.`,
      `Open the link, then sign in or create an account with ${opts.email}. It works only for that address.`,
    ],
    action: { label: "Accept the invitation", url: link },
    footer: `This invitation expires in ${opts.days} days. If you don't know the sender, you can ignore this email.`,
  });
}

/**
 * Durable fixed-window counter in the `verification` table (identifier `throttle:<key>`, value =
 * count). Works across isolates; the conditional UPDATE keeps concurrent sends from overshooting.
 */
export async function allowSend(
  deps: Pick<AppContext, "db" | "now">,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const identifier = `${THROTTLE_IDENTIFIER_PREFIX}${key}`;
  const now = deps.now();
  const bumped = await deps.db
    .update(verification)
    .set({ value: sql`cast(${verification.value} as integer) + 1`, updatedAt: now })
    .where(
      and(
        eq(verification.identifier, identifier),
        gt(verification.expiresAt, now),
        sql`cast(${verification.value} as integer) < ${limit}`,
      ),
    )
    .returning({ id: verification.id });
  if (bumped.length > 0) return true;
  const live = await deps.db
    .select({ id: verification.id })
    .from(verification)
    .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, now)))
    .get();
  if (live) return false;
  // No window (or only expired ones): start a new one.
  await deps.db.delete(verification).where(eq(verification.identifier, identifier));
  await deps.db.insert(verification).values({
    id: `thr_${crypto.randomUUID().replace(/-/g, "")}`,
    identifier,
    value: "1",
    expiresAt: new Date(now.getTime() + windowMs),
  });
  return true;
}

/** Throttled, never-throwing send. Logs ids only (never addresses, links or tokens). */
export async function sendAuthEmail(
  deps: AuthEmailDeps,
  kind: AuthEmailKind,
  user: EmailUser,
  msg: RenderedEmail,
): Promise<boolean> {
  try {
    const { limit, windowMs } = EMAIL_THROTTLE[kind];
    if (!(await allowSend(deps, `${kind}:${user.id}`, limit, windowMs))) {
      deps.logger.warn("auth.email_throttled", { kind, userId: user.id });
      return false;
    }
    await deps.email.send({
      to: [user.email],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return true;
  } catch (e) {
    deps.logger.warn("auth.email_failed", { kind, userId: user.id, error: String(e) });
    return false;
  }
}
