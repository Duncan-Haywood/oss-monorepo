// Version of the legal documents (Terms, Privacy, Refunds, Acceptable Use). Bump when any of them
// changes in substance: every user is asked to accept the new version on their next visit.
// The documents live in docs/legal/*.md and are bundled by docs/legal/sync-documents.mjs.
// Same shape as apps/jobshop-quote/src/shared/legal.ts and apps/payapps/src/shared/legal.ts.
// "2026-11-25.2": the Privacy Policy now says the app sends account email (docs/EMAIL.md).
// "2026-11-25.3": the Privacy Policy now says admins get the affirmation reminder email, and how to stop it.
// "2026-11-25.4": the Privacy Policy now says an admin can make a calendar subscription link and who can read it.
// "2026-11-26.4": the Privacy Policy now says admins also get one notice when a date has passed.
// "2026-11-26.5": the Privacy Policy now lists the asset inventory among stored records.
// "2026-11-26.6": the Privacy Policy now lists external service providers among stored records.
// "2026-11-26.7": the Privacy Policy now lists written security policies among stored records.
// "2026-11-26.8": the Privacy Policy now says the calendar link also carries policy review dates (family names only).
// "2026-11-26.9": AI drafts of policy procedures: what the model sees, and the stored drafts.
// "2026-11-26.10": the Privacy Policy now lists personnel and training records among stored records.
// "2026-11-26.11": the Privacy Policy now says the calendar link also carries training refresher dates (a count of people per date, no names).
// "2026-11-26.12": the Privacy Policy now lists subcontractors and suppliers among stored records.
// "2026-11-26.13": the Privacy Policy now says the calendar link also carries suppliers' current-through dates (a count of suppliers per date, no names).
// "2026-11-26.14": the Privacy Policy now lists the controlled-document master list among stored records.
// "2026-11-26.15": the Privacy Policy now lists internal audits and corrective actions among stored records.
// "2026-11-27.1": the Privacy Policy now says the calendar link also carries ISO 9001 dates (document reviews, audits, corrective actions; a count per date, no titles).
export const POLICY_VERSION = "2026-11-27.1";

export const LEGAL_DOC_KEYS = ["terms", "privacy", "refunds", "acceptable-use"] as const;
export type LegalDocKey = (typeof LEGAL_DOC_KEYS)[number];

export const LEGAL_DOC_TITLES: Record<LegalDocKey, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  refunds: "Refund Policy",
  "acceptable-use": "Acceptable Use Policy",
};

export const isLegalDocKey = (k: string): k is LegalDocKey =>
  (LEGAL_DOC_KEYS as readonly string[]).includes(k);

/** GET /api/legal list item. */
export interface LegalDocSummary {
  key: LegalDocKey;
  title: string;
  version: string;
  updatedAt: string;
}

/** GET /api/legal/:key */
export interface LegalDocDto extends LegalDocSummary {
  markdown: string;
}

/** Part of GET /api/me: whether this user has accepted the current policy version. */
export interface LegalStatusDto {
  version: string;
  acceptedAt: string | null;
}
