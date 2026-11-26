// Version of the legal documents (Terms, Privacy, Data Use, Refunds, Acceptable Use). Bump when any
// changes; users re-accept on next sign-in. OWNER: privacy+legal agent.
// The documents themselves live in docs/legal/*.md (bundled in services/legal/documents.ts).
export const POLICY_VERSION = "2026-11-24";
export const LEGAL_DOC_KEYS = [
  "terms",
  "privacy",
  "data-use",
  "refunds",
  "acceptable-use",
] as const;
export type LegalDocKey = (typeof LEGAL_DOC_KEYS)[number];

export const LEGAL_DOC_TITLES: Record<LegalDocKey, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  "data-use": "Data Use Policy",
  refunds: "Refund Policy",
  "acceptable-use": "Acceptable Use Policy",
};

export const isLegalDocKey = (k: string): k is LegalDocKey =>
  (LEGAL_DOC_KEYS as readonly string[]).includes(k);

/** The operator named in every legal document. */
export const LEGAL_ENTITY = {
  name: "Mary Stella Labs, LLC",
  jurisdiction: "New Mexico",
} as const;

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
