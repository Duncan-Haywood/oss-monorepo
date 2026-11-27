// Small pure helpers shared by the build and the worker.

export const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const LOCALE = { de: "de-DE", fr: "fr-FR", en: "en-GB" };

/** "1. Januar 2025" / "1er janvier 2025" / "1 January 2025" (UTC, so no off-by-one). */
export function longDate(iso, lang) {
  const d = new Date(`${iso}T00:00:00Z`);
  const s = new Intl.DateTimeFormat(LOCALE[lang], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  return lang === "fr" ? s.replace(/^1 /, "1er ") : s;
}

/** Consent wording version. Bump when the form's consent text changes; the worker stores it. */
export const CONSENT_VERSION = "2026-11-24";

export const ROLES = ["accountant", "vendor", "business", "other"];
export const COUNTRY_KEYS = ["de", "fr"];
