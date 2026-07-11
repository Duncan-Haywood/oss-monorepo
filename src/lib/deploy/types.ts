/**
 * Production deploy handoff — created after paid checkout (Phase 5).
 * See /docs/production-deploy and /docs/process.
 */

export type DeployHandoffStatus =
  | "pending"
  | "awaiting_dns"
  | "provisioned"
  | "live"
  | "failed";

export interface DnsInstruction {
  type: "A" | "CNAME" | "TXT";
  host: string;
  value: string;
  purpose: string;
}

export interface DeployHandoff {
  id: string;
  leadSlug: string;
  businessName: string;
  tier: string;
  commerceAddon: boolean;
  stripeSessionId: string;
  customerEmail: string;
  /** Platform URL that already works (preview path). */
  previewUrl: string;
  /** Suggested production hostname before the customer brings their own domain. */
  suggestedHost: string;
  /** Optional customer-owned domain collected later. */
  customDomain?: string;
  /** Contact form endpoint for this site. */
  contactFormUrl: string;
  dnsInstructions: DnsInstruction[];
  status: DeployHandoffStatus;
  /** Best-effort Vercel domain API result, when configured. */
  vercelDomainStatus?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeployHandoffInput {
  leadSlug: string;
  businessName: string;
  tier: string;
  commerceAddon: boolean;
  stripeSessionId: string;
  customerEmail: string;
  customDomain?: string;
}
