// Seller books: imports, sales (+ their fees), account-level charges, inventory, mileage, expenses.
// Every table is tenant-scoped by org_id (ON DELETE CASCADE from organization). Money in integer cents,
// calendar dates as ISO "YYYY-MM-DD" text (the seller's books are by calendar day, not instant).
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cents, createdAt, json, updatedAt } from "./_columns";
import { organization, user } from "./auth";

const orgId = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

/** One uploaded report file. Deleting a batch deletes the sales/charges it created. */
export const importBatch = sqliteTable(
  "import_batch",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    platform: text("platform").notNull(),
    reportKind: text("report_kind").notNull(),
    fileName: text("file_name").notNull(),
    sha256: text("sha256").notNull(),
    rowCount: integer("row_count").notNull(),
    salesCreated: integer("sales_created").notNull(),
    chargesCreated: integer("charges_created").notNull(),
    duplicatesSkipped: integer("duplicates_skipped").notNull(),
    rowsSkipped: integer("rows_skipped").notNull(),
    warnings: json<string[]>("warnings").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("import_batch_org_idx").on(t.orgId, t.createdAt)],
);

export const sale = sqliteTable(
  "sale",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    platform: text("platform").notNull(),
    kind: text("kind").notNull(), // SaleKind
    /** Stable key from the report (order/line/transaction id) used to skip re-imported rows. */
    externalId: text("external_id").notNull(),
    orderId: text("order_id"),
    date: text("date").notNull(),
    title: text("title"),
    sku: text("sku"),
    quantity: integer("quantity").notNull().default(1),
    /** Item price the buyer paid, after seller-funded discounts. */
    itemCents: cents("item_cents").notNull().default(0),
    shippingChargedCents: cents("shipping_charged_cents").notNull().default(0),
    /** Sales tax the marketplace collected and remitted (not the seller's income). */
    salesTaxCents: cents("sales_tax_cents").notNull().default(0),
    /** Refund kind only: money returned to the buyer (positive). */
    refundCents: cents("refund_cents").notNull().default(0),
    /** Postage bought through the platform and deducted from this order (positive). */
    shippingLabelCents: cents("shipping_label_cents").notNull().default(0),
    /** What the report says the seller received for this row, when it says. */
    netCents: cents("net_cents"),
    inventoryItemId: text("inventory_item_id"),
    importBatchId: text("import_batch_id").references(() => importBatch.id, {
      onDelete: "cascade",
    }),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sale_org_platform_ext_uq").on(t.orgId, t.platform, t.externalId),
    index("sale_org_date_idx").on(t.orgId, t.date),
    index("sale_org_item_idx").on(t.orgId, t.inventoryItemId),
  ],
);

/** Fees on one sale, exactly as the report itemised them (positive = charged, negative = credited). */
export const saleFee = sqliteTable(
  "sale_fee",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    saleId: text("sale_id")
      .notNull()
      .references(() => sale.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // FeeKind
    amountCents: cents("amount_cents").notNull(),
    /** The report column this came from, e.g. "Final Value Fee - variable". */
    sourceColumn: text("source_column").notNull(),
  },
  (t) => [index("sale_fee_org_sale_idx").on(t.orgId, t.saleId)],
);

/** Charges not tied to one sale line: postage, ad fees, listing fees, subscriptions (+ credits < 0). */
export const platformCharge = sqliteTable(
  "platform_charge",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    platform: text("platform").notNull(),
    externalId: text("external_id").notNull(),
    date: text("date").notNull(),
    kind: text("kind").notNull(), // ChargeKind
    amountCents: cents("amount_cents").notNull(),
    orderId: text("order_id"),
    description: text("description"),
    importBatchId: text("import_batch_id").references(() => importBatch.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("platform_charge_org_platform_ext_uq").on(t.orgId, t.platform, t.externalId),
    index("platform_charge_org_date_idx").on(t.orgId, t.date),
  ],
);

/** A bulk purchase (bin, pallet, estate-sale haul) whose cost is spread over its items. */
export const inventoryLot = sqliteTable(
  "inventory_lot",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    name: text("name").notNull(),
    acquiredDate: text("acquired_date").notNull(),
    vendor: text("vendor"),
    totalCostCents: cents("total_cost_cents").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("inventory_lot_org_idx").on(t.orgId)],
);

export const inventoryItem = sqliteTable(
  "inventory_item",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    lotId: text("lot_id").references(() => inventoryLot.id, { onDelete: "set null" }),
    sku: text("sku"),
    title: text("title").notNull(),
    acquiredDate: text("acquired_date").notNull(),
    costCents: cents("cost_cents").notNull(),
    /** True when the cost was typed in, false when it is the item's share of its lot. */
    costIsManual: integer("cost_is_manual", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull().default("in_stock"), // InventoryStatus
    /** Day it left inventory (sold, written off, taken for personal use). */
    disposedDate: text("disposed_date"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inventory_item_org_idx").on(t.orgId, t.status),
    index("inventory_item_org_sku_idx").on(t.orgId, t.sku),
    index("inventory_item_lot_idx").on(t.lotId),
  ],
);

export const mileageTrip = sqliteTable(
  "mileage_trip",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    date: text("date").notNull(),
    purpose: text("purpose").notNull(),
    startPlace: text("start_place"),
    endPlace: text("end_place"),
    /** Miles x 10 (one decimal place). */
    milesTenths: integer("miles_tenths").notNull(),
    roundTrip: integer("round_trip", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("mileage_trip_org_date_idx").on(t.orgId, t.date)],
);

export const expense = sqliteTable(
  "expense",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    date: text("date").notNull(),
    category: text("category").notNull(), // ExpenseCategory
    amountCents: cents("amount_cents").notNull(),
    vendor: text("vendor"),
    memo: text("memo"),
    platform: text("platform"),
    createdAt: createdAt(),
  },
  (t) => [index("expense_org_date_idx").on(t.orgId, t.date)],
);
