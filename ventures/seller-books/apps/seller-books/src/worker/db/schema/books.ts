// Seller books: imports, sales (+ their fees), account-level charges, inventory, mileage, expenses.
// Every table is tenant-scoped by org_id (ON DELETE CASCADE from organization). Money in integer cents,
// calendar dates as ISO "YYYY-MM-DD" text (the seller's books are by calendar day, not instant).
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, cents, createdAt, json, updatedAt } from "./_columns";
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
    /** The order that sold this item (status "sold"). One order can sell several items (quantity > 1). */
    soldBySaleId: text("sold_by_sale_id"),
    /**
     * Set on a copy made when a sold item came back on a refund (routes/org/sales.ts, "returned-items"):
     * the refund that brought it back. The copy is in stock from the refund's date at the original's cost,
     * outside any lot, and is not a purchase (Schedule C line 36), so the year the original sold stays as
     * filed. Deleting the refund deletes the copy.
     */
    returnSaleId: text("return_sale_id").references(() => sale.id, { onDelete: "cascade" }),
    /** The sold item the copy stands for; an item comes back at most once. */
    returnedFromItemId: text("returned_from_item_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inventory_item_org_idx").on(t.orgId, t.status),
    index("inventory_item_org_sku_idx").on(t.orgId, t.sku),
    index("inventory_item_lot_idx").on(t.lotId),
    index("inventory_item_org_sold_by_idx").on(t.orgId, t.soldBySaleId),
    index("inventory_item_org_return_sale_idx").on(t.orgId, t.returnSaleId),
    uniqueIndex("inventory_item_org_returned_from_uq").on(t.orgId, t.returnedFromItemId),
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

/**
 * Merchants the seller asked the statement import to leave out (statement-memory.ts): only the merchant
 * key ("NETFLIX COM"), how many lines were left out and the latest one's statement date. Never the
 * description, the amount or the statement. One row per shop and merchant; "Forget" deletes it.
 */
export const leftOutMerchant = sqliteTable(
  "left_out_merchant",
  {
    orgId: orgId(),
    merchant: text("merchant").notNull(),
    count: integer("count").notNull(),
    lastDate: text("last_date").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("left_out_merchant_org_merchant_idx").on(t.orgId, t.merchant)],
);

/**
 * Business use of the home for one tax year, for Schedule C line 30 by the simplified method
 * (services/books/schedule-c.ts, `homeOfficeLine30`). `months_mask` has bit 0 for January through bit 11
 * for December: a month is set when the space was used for business on 15 days or more of it.
 */
export const homeOffice = sqliteTable(
  "home_office",
  {
    orgId: orgId(),
    year: integer("year").notNull(),
    /** Square feet used for the business (line 30 (b)). */
    officeSqft: integer("office_sqft").notNull(),
    /** Square feet of the whole home (line 30 (a)); null when the seller has not entered it. */
    homeSqft: integer("home_sqft"),
    monthsMask: integer("months_mask").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("home_office_org_year_idx").on(t.orgId, t.year)],
);

/**
 * Line 41 (inventory at end of year) as the seller reported it on the filed return for `year`, typed in by
 * the seller. The next year's worksheet uses it as line 35 and compares it with the items on hand in the
 * books on December 31 (services/books/schedule-c.ts).
 */
export const filedInventory = sqliteTable(
  "filed_inventory",
  {
    orgId: orgId(),
    year: integer("year").notNull(),
    closingCents: integer("closing_cents").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("filed_inventory_org_year_idx").on(t.orgId, t.year)],
);

/**
 * The seller's own figures for the quarterly estimated-tax page (routes/org/reports.ts, "estimated-tax"):
 * what the books cannot know (filing status, W-2 wages and withholding, other income, last year's tax)
 * and the estimated payments sent toward each of the year's four due dates. Saved so the page shows the
 * same figures on every device; read and written by the shop's owner and admins only, since wages and
 * last year's tax are the taxpayer's own.
 */
export const estimateSettings = sqliteTable(
  "estimate_settings",
  {
    orgId: orgId(),
    year: integer("year").notNull(),
    filing: text("filing", { enum: ["single", "mfj", "hoh"] }).notNull(),
    wagesCents: cents("wages_cents").notNull(),
    /** May be negative (a loss elsewhere). */
    otherIncomeCents: cents("other_income_cents").notNull(),
    withholdingCents: cents("withholding_cents").notNull(),
    /** Form 1040 line 24 for the year before; null when not entered. */
    priorYearTaxCents: cents("prior_year_tax_cents"),
    priorAgiOver150k: bool("prior_agi_over_150k").notNull(),
    /** Cents per mile for every trip; null for the IRS rate on each trip's date. */
    mileageRate: real("mileage_rate"),
    /** Estimated payments sent toward the April, June, September and January due dates. */
    paidQ1Cents: cents("paid_q1_cents").notNull(),
    paidQ2Cents: cents("paid_q2_cents").notNull(),
    paidQ3Cents: cents("paid_q3_cents").notNull(),
    paidQ4Cents: cents("paid_q4_cents").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("estimate_settings_org_year_idx").on(t.orgId, t.year)],
);
