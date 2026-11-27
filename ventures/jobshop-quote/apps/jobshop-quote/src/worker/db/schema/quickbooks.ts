// QuickBooks Online (docs/QUICKBOOKS.md): one connected company per shop, the pending "Connect"
// requests, and which won quotes went to QuickBooks as which invoice.

import type { QuoteInvoiceLineDto } from "@shared/api";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cents, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { quotes } from "./quotes";

export const qboConnections = sqliteTable("qbo_connections", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  realmId: text("realm_id").notNull(),
  /** "sandbox" | "production" | "fake" (tests and the offline demo). */
  environment: text("environment").notNull(),
  /** Intuit's tokens, AES-GCM sealed under QBO_TOKEN_KEY and bound to the org (lib/token-box.ts). */
  tokensEnc: text("tokens_enc").notNull(),
  /** When the refresh token expires (Intuit: about 100 days, renewed on each refresh). */
  refreshExpiresAt: ts("refresh_expires_at").notNull(),
  connectedBy: text("connected_by").references(() => user.id, { onDelete: "set null" }),
  /**
   * The shop's own QuickBooks item for invoice lines (and so the income account they post to),
   * chosen by an admin; null uses "Machined parts". Tied to the company it was chosen in
   * (`invoiceItemRealmId`), so a reconnect to another company falls back to the default.
   */
  invoiceItemId: text("invoice_item_id"),
  invoiceItemName: text("invoice_item_name"),
  invoiceItemRealmId: text("invoice_item_realm_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Pending "Connect QuickBooks" requests: the OAuth `state`, stored as a SHA-256 hash, bound to the
 * shop and the admin who started it. Single use; expires after 10 minutes.
 */
export const qboOauthStates = sqliteTable(
  "qbo_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("qbo_oauth_states_org_idx").on(t.orgId)],
);

/** Which won quotes were sent to QuickBooks, as which invoice. One row per quote. */
export const qboQuoteInvoices = sqliteTable(
  "qbo_quote_invoices",
  {
    quoteId: text("quote_id")
      .primaryKey()
      .references(() => quotes.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    realmId: text("realm_id").notNull(),
    invoiceId: text("invoice_id").notNull(),
    docNumber: text("doc_number").notNull(),
    totalCents: cents("total_cents").notNull(),
    /** The lines as billed: quote line, part, quantity and the quoted break's prices. */
    lines: json<QuoteInvoiceLineDto[]>("lines").notNull(),
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("qbo_quote_invoices_org_idx").on(t.orgId)],
);
