// Estimates (bids) a company prices before a job exists (src/shared/estimate.ts for the math).
// Company-level, not under a job: a won estimate creates the job and points at it; deleting that job
// leaves the estimate as won with no job. Tenant rows keyed by org_id like every other table.

import { ALTERNATE_KINDS, ESTIMATE_STATUSES } from "@shared/estimate";
import { COST_CATEGORIES } from "@shared/job-cost";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { projects } from "./payapps";

export const estimates = sqliteTable(
  "estimates",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** 1..n per company; a deleted estimate's number is not reused. */
    number: integer("number").notNull(),
    /** The job's name as it is bid ("Riverside Clinic, mechanical"). */
    name: text("name").notNull(),
    gcName: text("gc_name").notNull(),
    gcContactName: text("gc_contact_name"),
    gcContactEmail: text("gc_contact_email"),
    location: text("location"),
    /** ISO dates (YYYY-MM-DD); null: not set. */
    bidDueOn: text("bid_due_on"),
    sentOn: text("sent_on"),
    decidedOn: text("decided_on"),
    status: text("status", { enum: ESTIMATE_STATUSES }).notNull().default("draft"),
    /** Days the proposal is open for acceptance after it is sent (or dated). */
    validDays: integer("valid_days").notNull().default(30),
    laborMarkupBps: integer("labor_markup_bps").notNull().default(0),
    materialMarkupBps: integer("material_markup_bps").notNull().default(0),
    equipmentMarkupBps: integer("equipment_markup_bps").notNull().default(0),
    subcontractMarkupBps: integer("subcontract_markup_bps").notNull().default(0),
    otherMarkupBps: integer("other_markup_bps").notNull().default(0),
    materialTaxBps: integer("material_tax_bps").notNull().default(0),
    /** Printed on the proposal: what the price includes, leaves out, and anything else. */
    inclusions: text("inclusions"),
    exclusions: text("exclusions"),
    notes: text("notes"),
    /** The job a won estimate created. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("estimates_org_idx").on(t.orgId, t.status),
    uniqueIndex("estimates_number_uq").on(t.orgId, t.number),
  ],
);

/** One cost line of an estimate; the set is replaced whole on save (PUT .../lines). */
export const estimateLines = sqliteTable(
  "estimate_lines",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    estimateId: text("estimate_id")
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    bidItem: text("bid_item").notNull(),
    category: text("category", { enum: COST_CATEGORIES }).notNull(),
    description: text("description").notNull(),
    quantityMilli: integer("quantity_milli").notNull(),
    unit: text("unit"),
    unitCostMicros: integer("unit_cost_micros").notNull(),
  },
  (t) => [index("estimate_lines_estimate_idx").on(t.orgId, t.estimateId, t.sortOrder)],
);

/**
 * Bid items marked as add or deduct alternates (src/shared/estimate.ts), keyed by the item's
 * bidItemKey; an item with no row is base bid. Replaced with the lines (PUT .../lines), so a renamed
 * item's row goes. `accepted` is set when the bid is won: the alternates the GC took.
 */
export const estimateAlternates = sqliteTable(
  "estimate_alternates",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    estimateId: text("estimate_id")
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    bidItemKey: text("bid_item_key").notNull(),
    kind: text("kind", { enum: ALTERNATE_KINDS }).notNull(),
    accepted: integer("accepted", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [uniqueIndex("estimate_alternates_item_uq").on(t.orgId, t.estimateId, t.bidItemKey)],
);

/**
 * The company's price list (src/shared/price-list.ts): material prices, labor and equipment rates and
 * sub quotes reused across estimates. Matched to estimate lines by category, description and unit
 * (priceKey, case-blind); lines copy the cost, so changing an item never changes a saved estimate.
 */
export const priceListItems = sqliteTable(
  "price_list_items",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    category: text("category", { enum: COST_CATEGORIES }).notNull(),
    code: text("code"),
    description: text("description").notNull(),
    unit: text("unit"),
    unitCostMicros: integer("unit_cost_micros").notNull(),
    note: text("note"),
    /** priceKey of the item, so the same price is not listed twice. */
    matchKey: text("match_key").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("price_list_items_key_uq").on(t.orgId, t.matchKey)],
);
