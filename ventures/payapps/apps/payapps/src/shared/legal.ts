// Version of the legal documents (Terms, Privacy, Refunds, Acceptable Use). Bump when any of them
// changes in substance: every user is asked to accept the new version on their next visit.
// The documents live in docs/legal/*.md and are bundled by docs/legal/sync-documents.mjs.
export const POLICY_VERSION = "2026-11-27.5";

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
