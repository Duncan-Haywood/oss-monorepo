import type { DeployHandoff, DeployHandoffStatus, DnsInstruction } from "./types";

/**
 * Pure SQLite <-> DeployHandoff row mapping, split out of src/lib/db.ts (which
 * imports "server-only" and therefore cannot be imported directly by Vitest —
 * see AGENT_PROTOCOL's server-only testability rule). Mirrors
 * src/lib/leads/sqlite-row-mapping.ts's extraction pattern.
 */

// Mirrors the `deploy_handoffs` SQLite table columns db.ts reads via `SELECT *`.
export interface SqliteDeployHandoffRow {
  id: string;
  leadSlug: string;
  businessName: string;
  tier: string;
  commerceAddon: number;
  stripeSessionId: string;
  customerEmail: string;
  previewUrl: string;
  suggestedHost: string;
  customDomain: string | null;
  contactFormUrl: string;
  dnsInstructions: string;
  status: string;
  vercelDomainStatus: string | null;
  vercelProjectId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

const DNS_INSTRUCTION_TYPES = ["A", "CNAME", "TXT"] as const;

/**
 * Inverse of `JSON.stringify(handoff.dnsInstructions)`. Unlike the sibling
 * parse* helpers in db.ts (parsePackVariants / parseCommerceItems /
 * parseClientVoiceVariants), the pre-extraction version here trusted
 * `JSON.parse` to have returned an array of well-shaped objects with no
 * runtime check — a malformed/corrupted column value (e.g. hand-edited row,
 * a future writer bug) would silently produce a non-array or
 * wrong-shaped value instead of degrading to `[]` like every other parser in
 * this file. Filters to well-shaped elements, matching the established
 * pattern.
 */
export function parseDeployHandoffDnsInstructions(json: string): DnsInstruction[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DnsInstruction => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return (
        (DNS_INSTRUCTION_TYPES as readonly string[]).includes(row.type as string) &&
        typeof row.host === "string" &&
        typeof row.value === "string" &&
        typeof row.purpose === "string"
      );
    });
  } catch {
    return [];
  }
}

/**
 * Inverse of `JSON.stringify(handoff.notes)`. Same missing-guard gap as
 * parseDeployHandoffDnsInstructions above — fixed here with an Array.isArray
 * check plus a per-element string filter.
 */
export function parseDeployHandoffNotes(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/** Map a SQLite `deploy_handoffs` row back into the app-wide DeployHandoff shape (fallback-read path). */
export function mapDeployHandoffRow(row: SqliteDeployHandoffRow): DeployHandoff {
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    businessName: row.businessName,
    tier: row.tier,
    commerceAddon: row.commerceAddon === 1,
    stripeSessionId: row.stripeSessionId,
    customerEmail: row.customerEmail,
    previewUrl: row.previewUrl,
    suggestedHost: row.suggestedHost,
    customDomain: row.customDomain || undefined,
    contactFormUrl: row.contactFormUrl,
    dnsInstructions: parseDeployHandoffDnsInstructions(row.dnsInstructions),
    status: row.status as DeployHandoffStatus,
    vercelDomainStatus: row.vercelDomainStatus || undefined,
    vercelProjectId: row.vercelProjectId || undefined,
    notes: parseDeployHandoffNotes(row.notes),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
