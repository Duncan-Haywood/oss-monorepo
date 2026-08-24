import type { ClientInquiry, ClientInquiryStatus } from "./types";

/**
 * Pure SQLite <-> ClientInquiry row mapping, split out of src/lib/db.ts
 * (which imports "server-only" and therefore cannot be imported directly by
 * Vitest — see AGENT_PROTOCOL's server-only testability rule). Mirrors
 * src/lib/leads/sqlite-row-mapping.ts's extraction pattern.
 */

// Mirrors the `client_inquiries` SQLite table columns db.ts reads via `SELECT *`.
export interface SqliteClientInquiryRow {
  id: string;
  leadSlug: string;
  businessName: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string;
  status: string;
  source: string | null;
  operatorReply: string | null;
  repliedAt: string | null;
  replySentCount?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Map a SQLite `client_inquiries` row back into the app-wide ClientInquiry shape (fallback-read path). */
export function mapClientInquiryRow(row: SqliteClientInquiryRow): ClientInquiry {
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    businessName: row.businessName,
    name: row.name || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    message: row.message,
    status: row.status as ClientInquiryStatus,
    source: row.source || undefined,
    operatorReply: row.operatorReply || undefined,
    repliedAt: row.repliedAt || undefined,
    replySentCount:
      typeof row.replySentCount === "number" ? row.replySentCount : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
