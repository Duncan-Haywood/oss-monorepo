// The shop's rate card: settings (markups, minimums, quote defaults), machines, materials and
// finishing operations. The ONLY source of prices (src/shared/costing.ts).

import type { MachineKind, MaterialPriceSource, MaterialPricing } from "@shared/enums";
import type { RefusedSender } from "@shared/sender-allowlist";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { bool, cents, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

const orgId = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const shopSettings = sqliteTable("shop_settings", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** Printed on quotes. */
  displayName: text("display_name").notNull(),
  addressLines: json<string[]>("address_lines")
    .notNull()
    .$defaultFn(() => []),
  phone: text("phone"),
  email: text("email"),
  laborMarkupBps: integer("labor_markup_bps").notNull().default(0),
  materialMarkupBps: integer("material_markup_bps").notNull().default(0),
  outsideServiceMarkupBps: integer("outside_service_markup_bps").notNull().default(0),
  minimumLineCents: cents("minimum_line_cents").notNull().default(0),
  defaultQuantities: json<number[]>("default_quantities")
    .notNull()
    .$defaultFn(() => [1]),
  quoteValidDays: integer("quote_valid_days").notNull().default(30),
  defaultLeadTimeText: text("default_lead_time_text"),
  quoteTerms: text("quote_terms"),
  /** Plain text under the estimator's message on every quote email (shared/quote-email.ts). */
  emailSignature: text("email_signature"),
  nextQuoteNumber: integer("next_quote_number").notNull().default(1001),
  /**
   * The shop's inbound RFQ address is `rfq+{inboundToken}@{INBOUND_EMAIL_DOMAIN}`
   * (services/inbound). Null until an admin turns it on; a new token retires the old address.
   */
  inboundToken: text("inbound_token").unique(),
  /**
   * Who may email RFQs to that address: "buyer@acme.example" or "@acme.example" (and its subdomains),
   * normalised by src/shared/sender-allowlist.ts. Empty accepts everyone.
   */
  inboundAllowedSenders: json<string[]>("inbound_allowed_senders").notNull().default([]),
  /** The last refused senders (newest first, at most 10), so an admin can add a real customer. */
  inboundRefusedSenders: json<RefusedSender[]>("inbound_refused_senders").notNull().default([]),
  /**
   * Repeat parts, part 2: a new quote from an RFQ pre-fills each line from the shop's last won quote
   * of the same part number and revision (services/quotes/history.ts). Off unless the shop turns it on.
   */
  prefillRepeatParts: bool("prefill_repeat_parts").notNull().default(false),
  /**
   * Expected fallout (parts scrapped in process) in basis points, 300 = 3%: every new quote line
   * starts with it (the estimator can change it per line; shared/costing.ts startsFor). Null is no
   * default, so a line starts at 0% as before. A line copied from a won quote keeps its own.
   */
  defaultFalloutBps: integer("default_fallout_bps"),
  /**
   * The shop's IANA time zone ("America/Chicago"), checked by shared/time-zone.ts; null reads as
   * UTC. Win/loss months and the CSV's dates use its calendar; stored instants stay UTC.
   */
  timeZone: text("time_zone"),
  /**
   * The shop's ISO 4217 currency (shared/currency.ts); null reads as USD. Every amount the app,
   * quote PDF and emails print carries it; nothing is converted when it changes.
   */
  currency: text("currency"),
  /**
   * The shop's logo for the quote PDF: an R2 key under `orgs/{orgId}/logo/`, holding a PNG or JPEG
   * already checked by lib/pdf-image.ts readLogo. Null prints the name alone, as before.
   */
  logoKey: text("logo_key"),
  /**
   * Quote follow-up: a sent quote is due for a follow-up this many days after the shop's send day
   * (services/quotes/follow-ups.ts). 0 turns the automatic first follow-up date off.
   */
  followUpDays: integer("follow_up_days").notNull().default(3),
  /**
   * Material price lists: a draft line whose material price is older than this many days shows a
   * warning (shared/material-price.ts). Null turns it off.
   */
  materialPriceMaxAgeDays: integer("material_price_max_age_days").default(90),
  updatedAt: updatedAt(),
});

/**
 * Per-member mail settings for this shop. `rfqArrival`: email me when an RFQ arrives at the shop's
 * inbound address (services/inbound, notifyRfqArrival). Off unless the member turns it on.
 */
export const memberNotifications = sqliteTable(
  "member_notifications",
  {
    orgId: orgId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rfqArrival: bool("rfq_arrival").notNull().default(false),
    /**
     * The day-before email about the member's own sent quotes that are about to expire
     * (services/quotes/expiry-reminders.ts). On unless the member turns it off; no row means on.
     */
    quoteExpiry: bool("quote_expiry").notNull().default(true),
    /**
     * The morning email listing the member's own sent quotes that are due for a follow-up
     * (services/quotes/follow-ups.ts). On unless the member turns it off; no row means on.
     */
    quoteFollowUp: bool("quote_follow_up").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const machines = sqliteTable(
  "machines",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    name: text("name").notNull(),
    kind: text("kind").$type<MachineKind>().notNull(),
    hourlyRateCents: cents("hourly_rate_cents").notNull(),
    setupRateCents: cents("setup_rate_cents"),
    defaultSetupMinutes: integer("default_setup_minutes").notNull().default(0),
    /** Measured roughing rate (in³/min) for cycle-time suggestions; null if unknown. */
    removalRateIn3PerMin: real("removal_rate_in3_per_min"),
    /** Cutting machines (laser, waterjet, plasma): the shop's cut speed, in/min; null if unknown. */
    cutSpeedInPerMin: real("cut_speed_in_per_min"),
    /** Cutting machines: seconds per pierce (each closed contour starts with one); null if unknown. */
    pierceSeconds: real("pierce_seconds"),
    /** Press brakes: handling seconds per bend; null if unknown. */
    secondsPerBend: real("seconds_per_bend"),
    /** Drills and mills: seconds per drilled hole location (position, drill, retract); null if unknown. */
    secondsPerHole: real("seconds_per_hole"),
    /** Drills and mills: drill feed (penetration) in in/min, timing each hole by its depth; null if unknown. */
    drillFeedInPerMin: real("drill_feed_in_per_min"),
    /** Drills, mills and tappers: seconds per tapped hole (tap in, reverse out); null if unknown. */
    secondsPerTappedHole: real("seconds_per_tapped_hole"),
    /** Drills and mills: peck depth in drill diameters (G83 Q as ×D) for deep holes; null if unknown. */
    peckDepthDiameters: real("peck_depth_diameters"),
    /** Drills and mills: seconds per extra peck (retract to clear chips and return); null if unknown. */
    secondsPerPeck: real("seconds_per_peck"),
    active: bool("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("machines_org_idx").on(t.orgId)],
);

export const materials = sqliteTable(
  "materials",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    name: text("name").notNull(),
    pricingBasis: text("pricing_basis").$type<MaterialPricing>().notNull(),
    pricePerLbCents: cents("price_per_lb_cents"),
    densityLbPerIn3: real("density_lb_per_in3"),
    /** Sheet and plate stock: the thickness in inches, so a DXF flat pattern can size the blank. */
    sheetThicknessIn: real("sheet_thickness_in"),
    /**
     * Sheet stock size and the nest gap (between parts and from the edge), inches: with all three
     * set, a DXF part's parts-per-sheet comes from a rectangular nest (src/shared/nest.ts).
     */
    sheetWidthIn: real("sheet_width_in"),
    sheetLengthIn: real("sheet_length_in"),
    nestGapIn: real("nest_gap_in"),
    stockPriceCents: cents("stock_price_cents"),
    stockDescription: text("stock_description"),
    /**
     * per_ft materials (bar, tube, extrusion bought by length): the price of one foot, the cut
     * allowance (kerf + facing) added to each part, inches, and, when the shop buys whole bars, the
     * bar length and its unusable remnant, inches (src/shared/costing.ts barStockUse).
     */
    pricePerFootCents: cents("price_per_foot_cents"),
    /**
     * The supplier's own unit, stored exactly: a per_lb material priced per hundredweight (100 lb)
     * keeps the cwt price here and pricePerLbCents null; a per_ft material priced per metre keeps
     * it in pricePerMetreCents and pricePerFootCents null. Costing derives the exact $/lb or $/ft
     * (shared/material-price.ts lbPriceCents, footPriceCents) without rounding to a whole cent.
     */
    pricePerCwtCents: cents("price_per_cwt_cents"),
    pricePerMetreCents: cents("price_per_metre_cents"),
    cutAllowanceIn: real("cut_allowance_in"),
    barLengthIn: real("bar_length_in"),
    barRemnantIn: real("bar_remnant_in"),
    scrapBps: integer("scrap_bps").notNull().default(0),
    minChargeCents: cents("min_charge_cents").notNull().default(0),
    active: bool("active").notNull().default(true),
    /**
     * When the price it charges by ($/lb or $/stock piece, shared/material-price.ts) last changed:
     * a name, density or scrap edit does not move it. Older than the shop's
     * materialPriceMaxAgeDays, a draft line on it shows a "check with your supplier" warning.
     */
    priceSetAt: ts("price_set_at")
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("materials_org_idx").on(t.orgId)],
);

/**
 * Material price lists, part 1: one row per price a material was given (created, edited or
 * imported), so the rate card can show what the shop paid over time. Written by
 * services/ratecard only when the price it charges by changes.
 */
export const materialPriceChanges = sqliteTable(
  "material_price_changes",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    pricingBasis: text("pricing_basis").$type<MaterialPricing>().notNull(),
    pricePerLbCents: cents("price_per_lb_cents"),
    stockPriceCents: cents("stock_price_cents"),
    pricePerFootCents: cents("price_per_foot_cents"),
    pricePerCwtCents: cents("price_per_cwt_cents"),
    pricePerMetreCents: cents("price_per_metre_cents"),
    /** "create" | "edit" | "import" | "baseline" | "confirm" (shared/enums.ts). */
    source: text("source").$type<MaterialPriceSource>().notNull(),
    /** Imports from a supplier's price sheet: who sent it, as the admin typed it (else null). */
    supplier: text("supplier"),
    /** The day the supplier's sheet is dated, YYYY-MM-DD as typed (else null). */
    priceListDate: text("price_list_date"),
    byUserId: text("by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("material_price_changes_material_idx").on(t.orgId, t.materialId, t.createdAt)],
);

/**
 * Cut speed per material and thickness: a cutting machine's speed (and optionally its pierce time)
 * on one sheet material row of the rate card. Material rows carry their sheet thickness, so a row
 * here is the speed for that alloy at that gauge. Overrides the machine's single default speed when
 * a DXF part is quoted in that material (src/shared/costing.ts suggestCuttingOperation).
 */
export const cutSpeeds = sqliteTable(
  "cut_speeds",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    cutSpeedInPerMin: real("cut_speed_in_per_min").notNull(),
    /** Seconds per pierce on this material; null uses the machine's pierce time. */
    pierceSeconds: real("pierce_seconds"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("cut_speeds_org_idx").on(t.orgId),
    uniqueIndex("cut_speeds_machine_material_uq").on(t.machineId, t.materialId),
  ],
);

/**
 * Removal rate per material: the in³/min a roughing machine (mill, lathe) clears in one material row
 * of the rate card. Aluminum roughs several times faster than steel or titanium, so one rate per
 * machine misprices every part cut in another alloy. Overrides the machine's single default rate
 * when a STEP part is quoted in that material (src/shared/costing.ts suggestRoughingOperation).
 */
export const removalRates = sqliteTable(
  "removal_rates",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    removalRateIn3PerMin: real("removal_rate_in3_per_min").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("removal_rates_org_idx").on(t.orgId),
    uniqueIndex("removal_rates_machine_material_uq").on(t.machineId, t.materialId),
  ],
);

/**
 * Drill feed per material: the in/min a drilling machine's drill advances in one material row of
 * the rate card. Stainless or titanium drills at a fraction of aluminum's feed, so one feed per
 * machine misprices every hole in another alloy. Overrides the machine's single default feed when a
 * STEP part is quoted in that material (src/shared/costing.ts suggestDrillingOperation).
 */
export const drillFeeds = sqliteTable(
  "drill_feeds",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    drillFeedInPerMin: real("drill_feed_in_per_min").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("drill_feeds_org_idx").on(t.orgId),
    uniqueIndex("drill_feeds_machine_material_uq").on(t.machineId, t.materialId),
  ],
);

export const finishingOps = sqliteTable(
  "finishing_ops",
  {
    id: text("id").primaryKey(),
    orgId: orgId(),
    name: text("name").notNull(),
    perPartCents: cents("per_part_cents").notNull().default(0),
    lotChargeCents: cents("lot_charge_cents").notNull().default(0),
    outsideService: bool("outside_service").notNull().default(false),
    leadDays: integer("lead_days"),
    active: bool("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("finishing_ops_org_idx").on(t.orgId)],
);
