// List-Unsubscribe headers (RFC 2369) with one-click unsubscribe (RFC 8058). Gmail and Yahoo require
// both on bulk mail. The URL must accept a POST with body `List-Unsubscribe=One-Click` and
// unsubscribe without further interaction (routes/newsletter.ts, routes/email-unsubscribe.ts).
import { NEWSLETTER_CONFIRM_PATH, UNSUBSCRIBE_PATH } from "@shared/newsletter";
import { normalizeAppUrl } from "../email-templates/format";

export const ONE_CLICK_BODY = "List-Unsubscribe=One-Click";

/** Headers for EmailMessage.headers; null when the URL is not http(s) (never emit a broken header). */
export function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> | null {
  let url: URL;
  try {
    url = new URL(oneClickUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // `<` / `>` / `,` would break the header syntax; URL serialization percent-encodes them.
  return {
    "List-Unsubscribe": `<${url.toString()}>`,
    "List-Unsubscribe-Post": ONE_CLICK_BODY,
  };
}

const withToken = (base: string, path: string, token: string) =>
  `${normalizeAppUrl(base)}${path}?token=${encodeURIComponent(token)}`;

/** One-click POST target (List-Unsubscribe header); a GET on it redirects to the unsubscribe page. */
export const newsletterOneClickUrl = (appUrl: string, token: string) =>
  withToken(appUrl, "/api/newsletter/unsubscribe", token);
/** The unsubscribe page linked in the email footer (one button, no login). */
export const unsubscribePageUrl = (appUrl: string, token: string) =>
  withToken(appUrl, UNSUBSCRIBE_PATH, token);
/** The confirm page linked in the double-opt-in email. */
export const confirmPageUrl = (appUrl: string, token: string) =>
  withToken(appUrl, NEWSLETTER_CONFIRM_PATH, token);
/** One-click target for team-notification (digest / deadline) unsubscribes. */
export const notificationOneClickUrl = (appUrl: string, token: string) =>
  withToken(appUrl, "/api/email/unsubscribe", token);
