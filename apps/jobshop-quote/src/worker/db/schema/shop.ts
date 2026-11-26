// The shop's rate card: settings (markups, minimums, quote defaults), machines, materials and
// finishing operations. The ONLY source of prices (src/shared/costing.ts).

import type { MachineKind, MaterialPricing } from "@shared/enums";
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
import { bool, cents, createdAt, json, updatedAt } from "./_columns";
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
   * Who may email RFQs to that address: "buyer@acme.com" or "@acme.com" (and its subdomains),
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
   * The shop's IANA time zone ("America/Chicago"), checked by shared/time-zone.ts; null reads as
   * UTC. Win/loss months and the CSV's dates use its calendar; stored instants stay UTC.
   */
  timeZone: text("time_zone"),
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
    stockPriceCents: cents("stock_price_cents"),
    stockDescription: text("stock_description"),
    scrapBps: integer("scrap_bps").notNull().default(0),
    minChargeCents: cents("min_charge_cents").notNull().default(0),
    active: bool("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("materials_org_idx").on(t.orgId)],
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
