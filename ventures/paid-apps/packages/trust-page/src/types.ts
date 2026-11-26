// Data model for a per-product security page. Every statement is a Claim with an honest status and a
// source a reviewer can open: a repository path (optionally with a #fragment) or an https URL.

/**
 * - `in_place`: true of the code/config in this repository today (the source shows it).
 * - `partial`: some of it is in place; the text must say which part is missing.
 * - `not_in_place`: stated so readers know it is missing (e.g. "uploaded files have no backup copy").
 * - `owner_to_confirm`: depends on dashboards, accounts or practice the repository cannot show. Rendered
 *   as "Being confirmed", never as fact. Tracked in docs/trust/OWNER-CONFIRM.md.
 */
export type ClaimStatus = "in_place" | "partial" | "not_in_place" | "owner_to_confirm";

export interface Claim {
  text: string;
  status: ClaimStatus;
  /** Repository path from the monorepo root (e.g. "apps/grants/wrangler.jsonc#d1_databases") or https URL. */
  sources: readonly string[];
}

export type SectionId =
  | "data_location"
  | "encryption"
  | "access"
  | "backups"
  | "deletion"
  | "incident"
  | "development";

export interface Subprocessor {
  id: string;
  name: string;
  purpose: string;
  /** Categories of personal data the provider receives for this product. */
  data: string;
  /** Where processing happens, as far as the repository shows it. */
  location: string;
  /** When the provider is used only under a condition (a secret set, a feature turned on). */
  condition?: string;
  /** Repository paths that show the call. */
  sources: readonly string[];
  /**
   * The provider's own trust/compliance page. Rendered only when `trustUrlCheckedOn` is set, i.e. a
   * person opened the page and checked what it says (and its scope) on that date.
   */
  trustUrl?: string;
  trustUrlCheckedOn?: string;
}

export interface TrustProfile {
  /** Product name as shown to customers. */
  product: string;
  /** Legal entity operating the product. */
  operator: string;
  /** "live": serving customers; "pre_launch": built, not yet serving customers. */
  lifecycle: "live" | "pre_launch";
  /** ISO date (YYYY-MM-DD) the profile was last checked against the code. */
  reviewedOn: string;
  /** mailto:/https: URI for security reports. null until the owner publishes one. */
  securityContact: string | null;
  /** Absolute URL of the vulnerability disclosure policy, if published. */
  disclosurePolicyUrl?: string;
  sections: Readonly<Record<SectionId, readonly Claim[]>>;
  subprocessors: readonly Subprocessor[];
}
