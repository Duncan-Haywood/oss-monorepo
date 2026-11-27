// QuickBooks Online connection per company (docs/QUICKBOOKS.md). Tenant tables keyed by org_id
// with ON DELETE CASCADE from organization, like every other table.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cents, createdAt, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { payAppPayments, payApps, projects } from "./payapps";

const orgId = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

/**
 * One connected QuickBooks company per org. `tokens_enc` is the TokenSet as AES-GCM ciphertext
 * under a key derived from the QBO_TOKEN_KEY secret, bound to the org id
 * (lib/token-box.ts); the plaintext tokens never touch D1.
 */
export const qboConnections = sqliteTable("qbo_connections", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  realmId: text("realm_id").notNull(),
  /** "sandbox" | "production" | "fake" (tests and the offline demo). */
  environment: text("environment").notNull(),
  tokensEnc: text("tokens_enc").notNull(),
  /** Epoch ms when the refresh token expires (Intuit: about 100 days, renewed on each refresh). */
  refreshExpiresAt: ts("refresh_expires_at").notNull(),
  connectedBy: text("connected_by").references(() => user.id, { onDelete: "set null" }),
  /**
   * The company's own QuickBooks item that pay-application work is billed with (Service or
   * NonInventory, posting to the income account the company chose). Null: PayApps creates and
   * uses "Contract Billing" under "Contract Income". Ids belong to one realm, so connecting a
   * different company clears it. The name is kept for display only; the id is what is sent.
   */
  invoiceItemId: text("invoice_item_id"),
  invoiceItemName: text("invoice_item_name"),
  /**
   * Send each payment to QuickBooks as soon as it is recorded, when its application's invoice is
   * already there (an admin's opt-in; off by default). Same checks as the manual send; a refusal
   * never blocks recording the payment. Disconnecting deletes the row, so it starts off again.
   */
  autoSendPayments: integer("auto_send_payments", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Pending "Connect QuickBooks" requests: the OAuth `state`, stored as a SHA-256 hash, bound to the
 * org and the admin who started it. Single use; expires after 10 minutes.
 */
export const qboOauthStates = sqliteTable(
  "qbo_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    orgId: orgId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("qbo_oauth_states_org_idx").on(t.orgId)],
);

/** Which pay applications were sent to QuickBooks, as which invoice. One row per pay app. */
export const qboInvoiceSyncs = sqliteTable(
  "qbo_invoice_syncs",
  {
    payAppId: text("pay_app_id")
      .primaryKey()
      .references(() => payApps.id, { onDelete: "cascade" }),
    orgId: orgId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    realmId: text("realm_id").notNull(),
    invoiceId: text("invoice_id").notNull(),
    docNumber: text("doc_number").notNull(),
    totalCents: cents("total_cents").notNull(),
    /** Number of invoice lines written (work lines + the retainage line). */
    lineCount: integer("line_count").notNull(),
    syncedBy: text("synced_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("qbo_invoice_syncs_org_idx").on(t.orgId, t.projectId)],
);

/**
 * Which payments received were sent to QuickBooks, as which QuickBooks payment against the pay
 * application's invoice. One row per payment. `qbo_payment_id` is null when an editor said the
 * payment was already entered in QuickBooks by hand (nothing was sent). Deleting the payment here
 * deletes this row; the QuickBooks payment stays (QuickBooks is the books of record).
 */
export const qboPaymentSyncs = sqliteTable(
  "qbo_payment_syncs",
  {
    paymentId: text("payment_id")
      .primaryKey()
      .references(() => payAppPayments.id, { onDelete: "cascade" }),
    orgId: orgId(),
    payAppId: text("pay_app_id")
      .notNull()
      .references(() => payApps.id, { onDelete: "cascade" }),
    realmId: text("realm_id").notNull(),
    invoiceId: text("invoice_id").notNull(),
    qboPaymentId: text("qbo_payment_id"),
    amountCents: cents("amount_cents").notNull(),
    syncedBy: text("synced_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("qbo_payment_syncs_app_idx").on(t.orgId, t.payAppId)],
);

/**
 * A balance closed short (backcharge, dispute, write-off) sent to QuickBooks as a credit memo
 * against the pay application's invoice, so the invoice stops showing it as open. One row per pay
 * app. `credit_memo_id` is null when an editor said it was already entered in QuickBooks by hand.
 * `applied` is false when QuickBooks applied the credit to another invoice of the customer on its
 * own ("Automatically apply credits"), which the bookkeeper fixes there. Reopening the balance
 * deletes this row after the editor confirms; the credit memo stays (QuickBooks is the books of
 * record).
 */
export const qboCreditMemoSyncs = sqliteTable(
  "qbo_credit_memo_syncs",
  {
    payAppId: text("pay_app_id")
      .primaryKey()
      .references(() => payApps.id, { onDelete: "cascade" }),
    orgId: orgId(),
    realmId: text("realm_id").notNull(),
    invoiceId: text("invoice_id").notNull(),
    creditMemoId: text("credit_memo_id"),
    docNumber: text("doc_number"),
    amountCents: cents("amount_cents").notNull(),
    applied: integer("applied", { mode: "boolean" }).notNull().default(true),
    syncedBy: text("synced_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("qbo_credit_memo_syncs_org_idx").on(t.orgId)],
);
