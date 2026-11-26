// Newsletter ("new grant guides by email") contract shared by the signup form and the Worker.
// See docs/EMAIL_MARKETING.md. The consent text shown next to the form is versioned: bump
// NEWSLETTER_CONSENT_VERSION whenever NEWSLETTER_CONSENT_TEXT changes, so each subscriber row
// records exactly which wording they agreed to.

export const NEWSLETTER_CONSENT_VERSION = "2026-11-24";

/** Shown next to the signup button (the privacy link is rendered after it). */
export const NEWSLETTER_CONSENT_TEXT =
  "We'll email you a link to confirm. After that you'll get a short welcome series and occasional emails when we publish new grant guides. Every email has a one-click unsubscribe link.";

/** The answer to every well-formed subscribe request, whether or not the address is already on the list. */
export const NEWSLETTER_SUBSCRIBE_MESSAGE =
  "Thanks! If this address can receive our emails, a confirmation link is on its way. Check your inbox (and spam folder) to finish signing up.";

/** SPA pages the email links point to. */
export const NEWSLETTER_CONFIRM_PATH = "/newsletter/confirm";
export const UNSUBSCRIBE_PATH = "/unsubscribe";

/** POST /api/newsletter/subscribe body. `website` is a honeypot: humans never see or fill it. */
export interface NewsletterSubscribeRequest {
  email: string;
  /** Page path the form was on, e.g. "/resources/need-statement". */
  source: string;
  consentVersion: string;
  website?: string;
}

export interface NewsletterSubscribeResponse {
  ok: true;
  message: string;
}

/** POST /api/newsletter/confirm and POST unsubscribe answers. */
export interface NewsletterActionResponse {
  ok: boolean;
  status: "confirmed" | "unsubscribed" | "invalid" | "expired";
}

/** Token prefixes: newsletter unsubscribe tokens vs. team-notification (digest) unsubscribe tokens. */
export const NEWSLETTER_UNSUBSCRIBE_PREFIX = "u1.";
export const NOTIFICATION_UNSUBSCRIBE_PREFIX = "n1.";

/** API endpoint that handles a given unsubscribe token. */
export const unsubscribeApiPath = (token: string) =>
  token.startsWith(NOTIFICATION_UNSUBSCRIBE_PREFIX)
    ? "/api/email/unsubscribe"
    : "/api/newsletter/unsubscribe";
