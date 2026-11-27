// Request schemas (validated by the Worker, used as types by the SPA) and response DTO types.
import { z } from "zod";
import type { CostBreak, CostInputs, CostIssue, RateSnapshot } from "./costing";
import { SHOP_CURRENCIES } from "./currency";
import {
  MACHINE_KINDS,
  MATERIAL_PRICING,
  type MaterialPriceSource,
  MEMBER_ROLES,
  type QuoteStatus,
  type RfqStatus,
} from "./enums";
import type { FieldSource } from "./extraction";
import { MAX_FOLLOW_UP_DAYS, MAX_FOLLOW_UP_NOTE } from "./follow-up";
import { CAD_UNITS, type GeometryFeatures } from "./geometry";
import { MAX_PRICE_AGE_DAYS_LIMIT } from "./material-price";
import type { MaterialImpact } from "./material-price-impact";
import type { QuoteChanges } from "./quote-diff";
import type { PrefillSource } from "./repeat-parts";
import { MAX_ALLOWED_SENDERS, type RefusedSender } from "./sender-allowlist";
import { canonicalTimeZone } from "./time-zone";
import type { WinLossReport } from "./win-loss";

const cents = z.number().int().min(0).max(1_000_000_000);
const bps = z.number().int().min(0).max(100_000);
const shortText = z.string().trim().max(200);

export const createOrgSchema = z.object({ name: z.string().trim().min(2).max(120) });

export const shopSettingsPatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    addressLines: z.array(shortText).max(5),
    phone: shortText.nullable(),
    email: z.email().max(200).nullable(),
    laborMarkupBps: bps,
    materialMarkupBps: bps,
    outsideServiceMarkupBps: bps,
    minimumLineCents: cents,
    defaultQuantities: z.array(z.number().int().min(1).max(1_000_000)).min(1).max(8),
    quoteValidDays: z.number().int().min(1).max(365),
    defaultLeadTimeText: shortText.nullable(),
    quoteTerms: z.string().max(4000).nullable(),
    emailSignature: z.string().max(1000).nullable(),
    prefillRepeatParts: z.boolean(),
    /** IANA zone name, stored in Intl's spelling; null for UTC. */
    timeZone: z
      .string()
      .max(64)
      .transform((v, zctx) => {
        const zone = canonicalTimeZone(v);
        if (!zone) {
          zctx.addIssue({
            code: "custom",
            message: "Unknown time zone (use a name like America/Chicago)",
          });
          return z.NEVER;
        }
        return zone;
      })
      .nullable(),
    /** ISO 4217 code from SHOP_CURRENCIES; null for USD. */
    currency: z.enum(SHOP_CURRENCIES).nullable(),
    /** Warn on draft lines whose material price is older than this; null is off. */
    materialPriceMaxAgeDays: z.number().int().min(1).max(MAX_PRICE_AGE_DAYS_LIMIT).nullable(),
  })
  .partial();

// Each rate kind has its fields without defaults (what an import row may set) and the input schema
// that adds the defaults for a new row. Zod fills defaults even inside .partial(), so a partial of the
// input schema would reset every column an imported sheet does not have.
export const machineFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(MACHINE_KINDS),
  hourlyRateCents: cents,
  setupRateCents: cents.nullable(),
  defaultSetupMinutes: z.number().int().min(0).max(10_000),
  removalRateIn3PerMin: z.number().positive().max(1000).nullable(),
  cutSpeedInPerMin: z.number().positive().max(100_000).nullable(),
  pierceSeconds: z.number().positive().max(600).nullable(),
  secondsPerBend: z.number().positive().max(3600).nullable(),
  secondsPerHole: z.number().positive().max(3600).nullable(),
  drillFeedInPerMin: z.number().positive().max(1000).nullable(),
  secondsPerTappedHole: z.number().positive().max(3600).nullable(),
  peckDepthDiameters: z.number().positive().max(100).nullable(),
  secondsPerPeck: z.number().positive().max(600).nullable(),
  active: z.boolean(),
});
const mf = machineFieldsSchema.shape;
export const machineInputSchema = machineFieldsSchema.extend({
  setupRateCents: mf.setupRateCents.default(null),
  defaultSetupMinutes: mf.defaultSetupMinutes.default(0),
  removalRateIn3PerMin: mf.removalRateIn3PerMin.default(null),
  cutSpeedInPerMin: mf.cutSpeedInPerMin.default(null),
  pierceSeconds: mf.pierceSeconds.default(null),
  secondsPerBend: mf.secondsPerBend.default(null),
  secondsPerHole: mf.secondsPerHole.default(null),
  drillFeedInPerMin: mf.drillFeedInPerMin.default(null),
  secondsPerTappedHole: mf.secondsPerTappedHole.default(null),
  peckDepthDiameters: mf.peckDepthDiameters.default(null),
  secondsPerPeck: mf.secondsPerPeck.default(null),
  active: mf.active.default(true),
});

/** A cutting machine's speed on one sheet material row (rate card "Cut speeds by material"). */
export const cutSpeedInputSchema = z.object({
  machineId: z.string().trim().min(1).max(64),
  materialId: z.string().trim().min(1).max(64),
  cutSpeedInPerMin: z.number().positive().max(100_000),
  pierceSeconds: z.number().positive().max(600).nullable().default(null),
});
export type CutSpeedInput = z.infer<typeof cutSpeedInputSchema>;

/** A roughing machine's removal rate in one material row (rate card "Removal rates by material"). */
export const removalRateInputSchema = z.object({
  machineId: z.string().trim().min(1).max(64),
  materialId: z.string().trim().min(1).max(64),
  removalRateIn3PerMin: z.number().positive().max(1000),
});
export type RemovalRateInput = z.infer<typeof removalRateInputSchema>;

/** A drilling machine's feed in one material row (rate card "Drill feeds by material"). */
export const drillFeedInputSchema = z.object({
  machineId: z.string().trim().min(1).max(64),
  materialId: z.string().trim().min(1).max(64),
  drillFeedInPerMin: z.number().positive().max(1000),
});
export type DrillFeedInput = z.infer<typeof drillFeedInputSchema>;

/**
 * Cut-speed import (src/shared/cut-speed-import.ts): rows read from the shop's cut chart, naming the
 * machine and material; the Worker matches the names to this shop's rows and validates them again.
 */
export const cutSpeedImportSchema = z.object({
  rows: z
    .array(
      z.object({
        row: z.number().int().min(1).max(1_000_000),
        values: z.object({
          machine: z.string().trim().min(1).max(120),
          material: z.string().trim().min(1).max(120),
          cutSpeedInPerMin: z.number().positive().max(100_000).optional(),
          pierceSeconds: z.number().positive().max(600).optional(),
        }),
      }),
    )
    .min(1)
    .max(500), // MAX_RATE_IMPORT_ROWS, declared further down this file
});
export type CutSpeedImportBody = z.infer<typeof cutSpeedImportSchema>;

/**
 * Removal-rate and drill-feed import (src/shared/material-rate-import.ts): rows read from the shop's
 * sheet, naming the machine and material, with the value in in³/min or in/min. The Worker matches the
 * names to this shop's rows and validates them again with removalRateInputSchema/drillFeedInputSchema.
 */
export const materialRateImportSchema = z.object({
  rows: z
    .array(
      z.object({
        row: z.number().int().min(1).max(1_000_000),
        values: z.object({
          machine: z.string().trim().min(1).max(120),
          material: z.string().trim().min(1).max(120),
          value: z.number().positive().max(1000).optional(),
        }),
      }),
    )
    .min(1)
    .max(500), // MAX_RATE_IMPORT_ROWS
});
export type MaterialRateImportBody = z.infer<typeof materialRateImportSchema>;

/** POST /rate-card/materials/confirm-prices (admins): "Still good", dated now, prices unchanged. */
/** ?minPct= on GET /rate-card/materials/price-impact: blank or absent is 0 (every change). */
export const materialPriceImpactQuerySchema = z.object({
  minPct: z.coerce.number().min(0).max(1000).default(0),
});
/** A calendar day typed as YYYY-MM-DD (a supplier's price-list date), refused if it is not a real day. */
export const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
  }, "not a real day");

/**
 * Material price lists, part 2b: where an import's prices came from (the supplier's price sheet and
 * the day it is dated), kept on each history row the import writes. Both optional, typed by the admin.
 */
export const priceListSourceSchema = z
  .object({
    supplier: z.string().trim().max(120).optional(),
    date: calendarDaySchema.optional(),
  })
  .strict();
export type PriceListSource = z.infer<typeof priceListSourceSchema>;

/** POST /rate-card/materials/price-impact/preview: the prices an import would set, before saving. */
export const materialPriceImpactPreviewSchema = z
  .object({
    prices: z
      .array(
        z
          .object({
            materialId: z.string().min(1).max(64),
            pricingBasis: z.enum(MATERIAL_PRICING),
            pricePerLbCents: z.number().int().min(0).nullable(),
            stockPriceCents: z.number().int().min(0).nullable(),
            pricePerFootCents: z.number().int().min(0).nullable(),
            pricePerCwtCents: z.number().int().min(0).nullable().default(null),
            pricePerMetreCents: z.number().int().min(0).nullable().default(null),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export type MaterialPriceImpactPreviewBody = z.infer<typeof materialPriceImpactPreviewSchema>;

export const confirmMaterialPricesSchema = z
  .object({ materialIds: z.array(z.string().min(1).max(64)).min(1).max(500) })
  .strict();

export const materialFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  pricingBasis: z.enum(MATERIAL_PRICING),
  pricePerLbCents: cents.nullable(),
  densityLbPerIn3: z.number().positive().max(1).nullable(),
  sheetThicknessIn: z.number().positive().max(24).nullable(),
  sheetWidthIn: z.number().positive().max(1_000).nullable(),
  sheetLengthIn: z.number().positive().max(1_000).nullable(),
  nestGapIn: z.number().min(0).max(12).nullable(),
  stockPriceCents: cents.nullable(),
  stockDescription: shortText.nullable(),
  /** per_ft (bar, tube, extrusion): price of one foot, and how the shop cuts and buys it. */
  pricePerFootCents: cents.nullable(),
  /**
   * The supplier's unit kept exactly (shared/material-price.ts): per_lb priced per hundredweight
   * (100 lb) in place of $/lb, per_ft priced per metre in place of $/ft. One or the other, not both.
   */
  pricePerCwtCents: cents.nullable(),
  pricePerMetreCents: cents.nullable(),
  cutAllowanceIn: z.number().min(0).max(24).nullable(),
  barLengthIn: z.number().positive().max(10_000).nullable(),
  barRemnantIn: z.number().min(0).max(1_000).nullable(),
  scrapBps: bps,
  minChargeCents: cents,
  active: z.boolean(),
});
const tf = materialFieldsSchema.shape;
export const materialInputSchema = materialFieldsSchema
  .extend({
    pricePerLbCents: tf.pricePerLbCents.default(null),
    densityLbPerIn3: tf.densityLbPerIn3.default(null),
    sheetThicknessIn: tf.sheetThicknessIn.default(null),
    sheetWidthIn: tf.sheetWidthIn.default(null),
    sheetLengthIn: tf.sheetLengthIn.default(null),
    nestGapIn: tf.nestGapIn.default(null),
    stockPriceCents: tf.stockPriceCents.default(null),
    stockDescription: tf.stockDescription.default(null),
    pricePerFootCents: tf.pricePerFootCents.default(null),
    pricePerCwtCents: tf.pricePerCwtCents.default(null),
    pricePerMetreCents: tf.pricePerMetreCents.default(null),
    cutAllowanceIn: tf.cutAllowanceIn.default(null),
    barLengthIn: tf.barLengthIn.default(null),
    barRemnantIn: tf.barRemnantIn.default(null),
    scrapBps: tf.scrapBps.default(0),
    minChargeCents: tf.minChargeCents.default(0),
    active: tf.active.default(true),
  })
  .refine(
    (m) =>
      m.pricingBasis === "per_lb"
        ? m.pricePerLbCents !== null || m.pricePerCwtCents !== null
        : true,
    { message: "A per-lb material needs a $/lb or $/cwt price", path: ["pricePerLbCents"] },
  )
  .refine((m) => m.pricePerLbCents === null || m.pricePerCwtCents === null, {
    message: "Give the price per lb or per cwt, not both",
    path: ["pricePerCwtCents"],
  })
  .refine((m) => m.pricePerFootCents === null || m.pricePerMetreCents === null, {
    message: "Give the price per foot or per metre, not both",
    path: ["pricePerMetreCents"],
  })
  .refine((m) => (m.pricingBasis === "per_stock" ? m.stockPriceCents !== null : true), {
    message: "A per-stock material needs a stock price",
    path: ["stockPriceCents"],
  })
  .refine(
    (m) =>
      m.pricingBasis === "per_ft"
        ? m.pricePerFootCents !== null || m.pricePerMetreCents !== null
        : true,
    {
      message: "A per-foot material needs a price per foot or per metre",
      path: ["pricePerFootCents"],
    },
  )
  .refine((m) => m.barLengthIn === null || (m.barRemnantIn ?? 0) < m.barLengthIn, {
    message: "The bar remnant must be shorter than the bar",
    path: ["barRemnantIn"],
  });

export const finishingOpFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  perPartCents: cents,
  lotChargeCents: cents,
  outsideService: z.boolean(),
  leadDays: z.number().int().min(0).max(365).nullable(),
  active: z.boolean(),
});
const ff = finishingOpFieldsSchema.shape;
export const finishingOpInputSchema = finishingOpFieldsSchema.extend({
  perPartCents: ff.perPartCents.default(0),
  lotChargeCents: ff.lotChargeCents.default(0),
  outsideService: ff.outsideService.default(false),
  leadDays: ff.leadDays.default(null),
  active: ff.active.default(true),
});

/** Most rows one rate-card import may carry (a shop's whole card is tens of rows). */
export const MAX_RATE_IMPORT_ROWS = 500;

// Rate-card import (src/shared/rate-card-import.ts): rows read from the shop's own sheet, each with
// only the columns the sheet had. The Worker matches names, merges and validates every row again.
const importRows = <S extends z.ZodObject>(fields: S) =>
  z
    .array(
      z.object({
        row: z.number().int().min(1).max(1_000_000),
        values: fields.partial().required({ name: true }),
      }),
    )
    .min(1)
    .max(MAX_RATE_IMPORT_ROWS);

export const rateCardImportSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("machines"), rows: importRows(machineFieldsSchema) }),
  z.object({
    kind: z.literal("materials"),
    rows: importRows(materialFieldsSchema),
    priceList: priceListSourceSchema.optional(),
  }),
  z.object({ kind: z.literal("finishing-ops"), rows: importRows(finishingOpFieldsSchema) }),
]);
export type RateCardImportBody = z.infer<typeof rateCardImportSchema>;

export interface RateCardImportResultDto {
  created: number;
  updated: number;
}

export const invitationSchema = z.object({
  email: z.email().max(200),
  role: z.enum(MEMBER_ROLES),
});
export const memberRoleSchema = z.object({ role: z.enum(MEMBER_ROLES) });

export const rfqTextSchema = z.object({
  subject: shortText.optional(),
  bodyText: z.string().max(100_000).default(""),
});

/** The unit an estimator chooses for a CAD file that states none (POST .../files/:fileId/units). */
export const fileUnitsSchema = z.object({ units: z.enum(CAD_UNITS) });

export const rfqPartPatchSchema = z
  .object({
    partNumber: shortText.nullable(),
    revision: z.string().trim().max(40).nullable(),
    description: z.string().trim().max(500).nullable(),
    materialText: z.string().trim().max(200).nullable(),
    materialId: z.string().max(40).nullable(),
    quantities: z.array(z.number().int().min(1).max(1_000_000)).max(8),
    tolerances: z.string().trim().max(500).nullable(),
    finishText: z.string().trim().max(200).nullable(),
    finishingOpIds: z.array(z.string().max(40)).max(20),
    /** Hole diameters (in, from the part's CAD file) the estimator marked as threaded. */
    tappedHoleDiametersIn: z.array(z.number().positive().max(100)).max(50),
    dueDate: z.iso.date().nullable(),
    notes: z.string().trim().max(2000).nullable(),
    confirmed: z.boolean(),
  })
  .partial();

export const rfqCustomerPatchSchema = z
  .object({
    subject: shortText.nullable(),
    customerCompany: shortText.nullable(),
    customerContact: shortText.nullable(),
    customerEmail: z.email().max(200).nullable(),
    status: z.enum(["new", "extracted", "quoted", "archived"]),
  })
  .partial();

export const createQuoteSchema = z.object({
  rfqId: z.string().max(40).nullable().default(null),
  customerCompany: shortText.optional(),
});

export const quotePatchSchema = z
  .object({
    customerCompany: z.string().trim().min(1).max(200),
    customerContact: shortText.nullable(),
    customerEmail: z.email().max(200).nullable(),
    leadTimeText: shortText.nullable(),
    validUntil: z.iso.date().nullable(),
    notes: z.string().max(4000).nullable(),
    coverNote: z.string().max(8000).nullable(),
    showChangesOnPdf: z.boolean(),
  })
  .partial();

export const quoteLineSchema = z.object({
  partNumber: z.string().trim().min(1).max(200),
  revision: z.string().trim().max(40).nullable().default(null),
  description: z.string().trim().max(500).nullable().default(null),
  inputs: z.unknown(),
});
/** At most this many routings recorded per line (append mode can stack several). */
export const MAX_LINE_ROUTINGS = 20;
export const lineRoutingIdsSchema = z.array(z.string().min(1).max(64)).max(MAX_LINE_ROUTINGS);

/**
 * PATCH a line: only the fields sent change. Not `quoteLineSchema.partial()`: in zod 4 a default
 * inside an optional still fills in, so a PATCH of `inputs` alone cleared revision and description.
 */
export const quoteLinePatchSchema = z.object({
  partNumber: z.string().trim().min(1).max(200).optional(),
  revision: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  inputs: z.unknown().optional(),
  /**
   * The saved routings this line is built from (win/loss by routing). The editor sends it when a
   * routing is applied to the line, saved from it or updated from it; ids that are not this shop's
   * routings are dropped on save. Omitted: unchanged.
   */
  routingIds: lineRoutingIdsSchema.optional(),
});

export const outcomeSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("won"),
    poNumber: shortText.nullable().default(null),
    wonAmountCents: cents.nullable().default(null),
  }),
  z.object({
    outcome: z.literal("lost"),
    reason: z.string().trim().max(500).nullable().default(null),
  }),
  z.object({ outcome: z.literal("expired") }),
]);

// ---- DTOs ----

export interface MachineDto {
  id: string;
  name: string;
  kind: string;
  hourlyRateCents: number;
  setupRateCents: number | null;
  defaultSetupMinutes: number;
  removalRateIn3PerMin: number | null;
  cutSpeedInPerMin: number | null;
  pierceSeconds: number | null;
  secondsPerBend: number | null;
  secondsPerHole: number | null;
  drillFeedInPerMin: number | null;
  secondsPerTappedHole: number | null;
  peckDepthDiameters: number | null;
  secondsPerPeck: number | null;
  active: boolean;
}
export interface MaterialDto {
  id: string;
  name: string;
  pricingBasis: "per_lb" | "per_stock" | "per_ft";
  pricePerLbCents: number | null;
  densityLbPerIn3: number | null;
  sheetThicknessIn: number | null;
  sheetWidthIn: number | null;
  sheetLengthIn: number | null;
  nestGapIn: number | null;
  stockPriceCents: number | null;
  stockDescription: string | null;
  pricePerFootCents: number | null;
  pricePerCwtCents: number | null;
  pricePerMetreCents: number | null;
  cutAllowanceIn: number | null;
  barLengthIn: number | null;
  barRemnantIn: number | null;
  scrapBps: number;
  minChargeCents: number;
  active: boolean;
  /** ISO time the price it charges by last changed (shared/material-price.ts). */
  priceSetAt: string;
}
/** GET /rate-card/materials/:id/prices: newest first. */
export interface MaterialPriceHistoryDto {
  materialId: string;
  name: string;
  entries: {
    id: string;
    pricingBasis: "per_lb" | "per_stock" | "per_ft";
    pricePerLbCents: number | null;
    stockPriceCents: number | null;
    pricePerFootCents: number | null;
    pricePerCwtCents: number | null;
    pricePerMetreCents: number | null;
    source: MaterialPriceSource;
    /** Imports from a supplier's sheet: the supplier and the sheet's date, as typed (else null). */
    supplier: string | null;
    priceListDate: string | null;
    /** Who set it; null for the baseline row or a deleted account. */
    byName: string | null;
    createdAt: string;
  }[];
  /** Older rows exist beyond the ones listed. */
  truncated: boolean;
}
/** GET /rate-card/materials/price-impact?minPct=N: open quotes priced at another material price. */
export interface MaterialPriceImpactDto {
  /** The threshold applied: moves smaller than this many percent are left out. */
  minPct: number;
  materials: MaterialImpact[];
  /** Open quotes read (newest first, at most PRICE_IMPACT_MAX_QUOTES). */
  quotesRead: number;
  /** More open quotes exist than were read. */
  truncated: boolean;
}
export interface CutSpeedDto {
  id: string;
  machineId: string;
  materialId: string;
  cutSpeedInPerMin: number;
  pierceSeconds: number | null;
}
export interface RemovalRateDto {
  id: string;
  machineId: string;
  materialId: string;
  removalRateIn3PerMin: number;
}
export interface DrillFeedDto {
  id: string;
  machineId: string;
  materialId: string;
  drillFeedInPerMin: number;
}
export interface FinishingOpDto {
  id: string;
  name: string;
  perPartCents: number;
  lotChargeCents: number;
  outsideService: boolean;
  leadDays: number | null;
  active: boolean;
}
export interface ShopSettingsDto {
  displayName: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  minimumLineCents: number;
  defaultQuantities: number[];
  quoteValidDays: number;
  defaultLeadTimeText: string | null;
  quoteTerms: string | null;
  /** Under the estimator's message on every quote email. */
  emailSignature: string | null;
  /** A new quote from an RFQ pre-fills lines from the last won quote of the same part and revision. */
  prefillRepeatParts: boolean;
  /** IANA zone for calendar edges (quote dates and expiry, win/loss months); null means UTC. */
  timeZone: string | null;
  /** ISO 4217 code every amount is printed in; null means USD (shared/currency.ts). */
  currency: string | null;
  /** The shop uploaded a logo; it prints at the top left of every quote PDF. */
  hasLogo: boolean;
  /** Draft lines warn when their material price is older than this many days; null is off. */
  materialPriceMaxAgeDays: number | null;
}
export interface RateCardDto {
  settings: ShopSettingsDto;
  machines: MachineDto[];
  materials: MaterialDto[];
  finishingOps: FinishingOpDto[];
  /** Cut speed per material and thickness, overriding a cutting machine's default speed. */
  cutSpeeds: CutSpeedDto[];
  /** Removal rate per material, overriding a roughing machine's default rate. */
  removalRates: RemovalRateDto[];
  /** Drill feed per material, overriding a drilling machine's default feed. */
  drillFeeds: DrillFeedDto[];
}

export interface RfqFileDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hasText: boolean;
  /** Pages in a PDF, null when unreadable (counted as one) or not a PDF. */
  pageCount: number | null;
  conversionError: string | null;
  geometry: GeometryFeatures | null;
  /**
   * A STEP or DXF file over 1 MB is stored without measuring it (the upload stays fast and cannot
   * run out of CPU); `POST .../files/:fileId/measure` measures it in a request of its own.
   */
  geometryPending: boolean;
  createdAt: string;
}
export interface RfqPartDto {
  id: string;
  position: number;
  partNumber: string | null;
  revision: string | null;
  description: string | null;
  materialText: string | null;
  materialId: string | null;
  quantities: number[];
  tolerances: string | null;
  finishText: string | null;
  finishingOpIds: string[];
  /** Hole diameters (in, from the CAD file) marked threaded: a "Tap from CAD" operation. */
  tappedHoleDiametersIn: number[];
  dueDate: string | null;
  notes: string | null;
  sources: Partial<Record<string, FieldSource>>;
  origin: string;
  confirmed: boolean;
  geometryFileId: string | null;
}
export interface RfqDto {
  id: string;
  status: RfqStatus;
  subject: string | null;
  customerCompany: string | null;
  customerContact: string | null;
  customerEmail: string | null;
  bodyText: string;
  missingInfo: string[];
  extractionWarnings: string[];
  /** "email" when it came in through the shop's inbound address (services/inbound). */
  source: "manual" | "email";
  fromAddress: string | null;
  /** What email intake skipped or could not read. */
  intakeNotes: string[];
  extractedAt: string | null;
  createdAt: string;
}

export interface InboundEmailDto {
  /** False until the owner sets INBOUND_EMAIL_DOMAIN and routes mail to the worker (docs/EMAIL.md). */
  available: boolean;
  /** The shop's address, or null while it is off. */
  address: string | null;
  /** Emailed RFQs accepted in the last 24 hours, and the daily ceiling. */
  last24h: number;
  dailyLimit: number;
  /** Whether the signed-in member is emailed when an RFQ arrives at the address (their own choice). */
  notifyMe: boolean;
  /** Who may email RFQs in ("buyer@acme.example", "@acme.example"); empty accepts everyone. */
  allowedSenders: string[];
  /**
   * Mail refused by the list, newest first (at most 10): its sender was not on it, or claimed a
   * listed address that failed SPF/DKIM/DMARC (`why: "unverified"`).
   */
  refusedSenders: RefusedSender[];
}

/**
 * PUT /inbound-email/senders (admins): the whole list, replaced. Entries are normalised by
 * src/shared/sender-allowlist.ts; one that is neither an address nor a domain is a 400.
 */
export const inboundSendersSchema = z
  .object({ senders: z.array(z.string().max(320)).max(MAX_ALLOWED_SENDERS) })
  .strict();

/** PUT /inbound-email/notify: the signed-in member's own "email me when an RFQ arrives". */
export const inboundNotifySchema = z.object({ notify: z.boolean() }).strict();

/** GET|PUT /notifications/quote-expiry: the signed-in member's own day-before expiry emails. */
export interface QuoteExpiryEmailsDto {
  quoteExpiry: boolean;
}
export const quoteExpiryEmailsSchema = z.object({ quoteExpiry: z.boolean() }).strict();

/** GET|PUT /notifications/quote-follow-up: the member's own "quotes due for a follow-up" email. */
export interface QuoteFollowUpEmailsDto {
  quoteFollowUp: boolean;
}
export const quoteFollowUpEmailsSchema = z.object({ quoteFollowUp: z.boolean() }).strict();

/** POST /quotes/:id/follow-ups: what happened, and the next follow-up shop day (null: no more). */
export const logFollowUpSchema = z
  .object({
    note: z.string().max(MAX_FOLLOW_UP_NOTE),
    nextOn: z.string().max(10).nullable(),
  })
  .strict();

/** PUT /quotes/follow-ups/settings (admins): first follow-up N days after sending, 0 is off. */
export const followUpSettingsSchema = z
  .object({ followUpDays: z.number().int().min(0).max(MAX_FOLLOW_UP_DAYS) })
  .strict();

export interface FollowUpEntryDto {
  id: string;
  /** Who logged it; null when that account was deleted ("Former member"). */
  byName: string | null;
  note: string | null;
  nextOn: string | null;
  createdAt: string;
  /** createdAt as a day on the shop's calendar. */
  day: string;
}

/** GET /quotes/:id/follow-ups: the quote's next follow-up day and its log, newest first. */
export interface QuoteFollowUpsDto {
  quoteId: string;
  status: QuoteStatus;
  followUpOn: string | null;
  /** The shop's today, for "due today" and the date picker's minimum. */
  today: string;
  entries: FollowUpEntryDto[];
}

/** One sent quote on the follow-up list. */
export interface FollowUpItemDto {
  quoteId: string;
  quoteNumber: number;
  revNumber: number;
  customerCompany: string;
  customerContact: string | null;
  customerEmail: string | null;
  headlineTotalCents: number | null;
  sentAt: string | null;
  validUntil: string | null;
  followUpOn: string;
  /** The quote's author (the estimator the follow-up email goes to). */
  estimatorName: string | null;
  lastNote: string | null;
  lastAt: string | null;
  /** How many follow-ups were logged on it. */
  count: number;
}

/** GET /quotes/follow-ups: sent quotes due today or earlier, and those due in the next 7 days. */
export interface FollowUpQueueDto {
  today: string;
  followUpDays: number;
  due: FollowUpItemDto[];
  upcoming: FollowUpItemDto[];
  /** More than the list's limit were due; the oldest are shown. */
  truncated: boolean;
}
export type RfqDetailDto = RfqDto & {
  files: RfqFileDto[];
  /**
   * What this RFQ uses of the plan's monthly allowance: drawing pages now (PDF pages plus one per
   * image), the RFQs that package counts as (one per 10 pages, at least one), and how many are
   * already counted. `units > counted` means the next AI read counts the difference.
   */
  allowance: { pages: number; units: number; counted: number };
  parts: RfqPartDto[];
  quoteIds: string[];
};

export interface QuoteLineDto {
  id: string;
  position: number;
  rfqPartId: string | null;
  partNumber: string;
  revision: string | null;
  description: string | null;
  inputs: CostInputs;
  breaks: CostBreak[] | null;
  basis: string[];
  issues: CostIssue[];
  snapshot: RateSnapshot | null;
  /** The won quote this line's inputs were pre-filled from (repeat parts, part 2), else null. */
  prefilledFrom: PrefillSource | null;
  /**
   * The saved routings this line was built from (applied, saved from it or updated from it), in the
   * order applied; null when the line has no record (win/loss then matches it by its operations).
   */
  routingIds: string[] | null;
}
export interface QuoteDto {
  id: string;
  rfqId: string | null;
  quoteNumber: number;
  /** Customer-facing revision: 1 is the original, 2 is "Q-1001 Rev 2" (shared/quote-label.ts). */
  revNumber: number;
  /** The quote this one revises, and the revision that replaced this one once it was sent. */
  supersedesQuoteId: string | null;
  supersededByQuoteId: string | null;
  status: QuoteStatus;
  customerCompany: string;
  customerContact: string | null;
  customerEmail: string | null;
  leadTimeText: string | null;
  validUntil: string | null;
  notes: string | null;
  coverNote: string | null;
  coverNoteSource: string | null;
  /** Revisions: print the customer-safe "Changes from ..." section on the PDF. */
  showChangesOnPdf: boolean;
  headlineTotalCents: number | null;
  sentAt: string | null;
  sentPdfSha256: string | null;
  decidedAt: string | null;
  lostReason: string | null;
  poNumber: string | null;
  wonAmountCents: number | null;
  /** Quote follow-up: the shop day this sent quote is next due for a follow-up (null: none). */
  followUpOn: string | null;
  createdAt: string;
}
export type QuoteDetailDto = QuoteDto & { lines: QuoteLineDto[] };

/** POST /quotes/:id/lines/:lineId/copy-from: copy an earlier line's cost inputs onto this one. */
export const copyLineFromSchema = z.object({ sourceLineId: z.string().min(1).max(64) }).strict();

/** One earlier quote of the same part number (GET /quotes/:id/lines/:lineId/history). */
export interface PartHistoryItemDto {
  lineId: string;
  quoteId: string;
  quoteNumber: number;
  revNumber: number;
  status: QuoteStatus;
  customerCompany: string;
  /** When the quote was sent, else created (ISO). */
  quotedAt: string;
  revision: string | null;
  /** True/false when both lines carry a revision; null when either has none. */
  sameRevision: boolean | null;
  description: string | null;
  /** Unit price at each quantity break as it was quoted; empty when that line never priced. */
  breaks: { quantity: number; unitPriceCents: number }[];
  /**
   * Operations as quoted: machine name from the snapshot when it priced, minutes as entered.
   * `retired`: the machine is off the shop's active rate card now (a copy still prices at its
   * current rate, so the estimator should check it).
   */
  operations: {
    machine: string;
    setupMinutes: number;
    cycleMinutesPerPart: number | null;
    retired: boolean;
  }[];
  material: string | null;
  poNumber: string | null;
  lostReason: string | null;
  /** The RFQ the earlier quote was made from, when it was (repeat parts, part 4). */
  rfqId: string | null;
  /** That RFQ's files (drawings, CAD, email text), for comparing against this one's; oldest first. */
  rfqFiles: { id: string; fileName: string }[];
}
export interface PartHistoryDto {
  partNumber: string;
  items: PartHistoryItemDto[];
}
/**
 * GET /rfqs/:id/part-history: the shop's earlier quotes of each of this RFQ's part numbers, on the
 * review screen before a quote exists. Parts with no lookupable part number are left out.
 */
export interface RfqPartHistoryDto {
  parts: (PartHistoryDto & { rfqPartId: string })[];
}

/** One side of a revision comparison. */
export interface QuoteRevisionRefDto {
  id: string;
  quoteNumber: number;
  revNumber: number;
  status: QuoteStatus;
}
/**
 * GET /quotes/:id/changes[?from=<quoteId>]: what changed from an earlier revision of the same quote
 * number (default: the one this revises) to this one (shared/quote-diff.ts).
 */
export type QuoteChangesDto = QuoteChanges & { from: QuoteRevisionRefDto; to: QuoteRevisionRefDto };
/** GET /quotes/:id/revisions: every revision of this quote's number, oldest first. */
export type QuoteRevisionsDto = QuoteRevisionRefDto[];

export interface QuoteStatsDto {
  byStatus: Record<QuoteStatus, number>;
  decided: number;
  winRate: number | null;
  wonCents: number;
  quotedCents: number;
}

// ---- Win/loss analytics (services/quotes/analytics.ts, shared/win-loss.ts) ----------------------

export const WIN_LOSS_WINDOWS = ["90", "365", "all"] as const;
export type WinLossWindow = (typeof WIN_LOSS_WINDOWS)[number];
export const winLossQuerySchema = z.object({ window: z.enum(WIN_LOSS_WINDOWS).default("365") });

export interface WinLossDto extends WinLossReport {
  window: WinLossWindow;
  /** Decided on or after this instant; null for all time. */
  since: string | null;
  /** More decided quotes than one report reads (MAX_ANALYTICS_QUOTES): the oldest are left out. */
  truncated: boolean;
}

// ---- Emailing a sent quote (services/quotes/email.ts, shared/quote-email.ts) ----------------------

export const emailQuoteSchema = z
  .object({
    /** One or more addresses, as typed ("a@x.com, b@x.com") or a list; parseRecipients checks them. */
    to: z.union([z.string().max(2000), z.array(z.string().max(254)).max(20)]),
    message: z.string().max(8000),
    /** Also send the estimator a copy at their own address (a separate message, not a Cc). */
    copyMe: z.boolean().optional(),
    /**
     * Put a customer link under the message, where the customer accepts (PO number, quantities)
     * or declines online (shared/customer-link.ts). Each email gets its own link.
     */
    customerLink: z.boolean().optional(),
  })
  .strict();

export interface QuoteEmailDto {
  id: string;
  to: string[];
  replyTo: string;
  subject: string;
  pdfSha256: string;
  status: "sending" | "sent" | "failed";
  /** False when this server has no mail provider: the message was recorded but never left. */
  delivered: boolean;
  error: string | null;
  sentByName: string | null;
  /** The estimator's own copy: null when not asked for. */
  senderCopy: "sent" | "failed" | null;
  createdAt: string;
}

/** GET /quotes/:id/emails: newest first, plus what the form needs to start. */
export interface QuoteEmailsDto {
  items: QuoteEmailDto[];
  /** Whether this server can deliver mail at all (a provider is configured). */
  canDeliver: boolean;
  /** Prefills: the quote's customer email and the message (cover note or a short default). */
  defaultTo: string;
  defaultMessage: string;
  /** Who replies go to: the signed-in estimator. */
  replyTo: string;
  /** The shop's signature block, shown under the message as it will be sent (null for none). */
  signature: string | null;
  /**
   * The "Changes from ..." lines the sent PDF prints (a revision with the toggle on), repeated in
   * the body under the message; null when the PDF carries none.
   */
  changes: { fromLabel: string; items: string[] } | null;
  /**
   * The quote's RFQ came in by email: sent to `from` (the address that emailed it), the quote goes
   * as a reply in that thread with this subject. Null when there is no such RFQ email.
   */
  rfqThread: { from: string; subject: string } | null;
}

// ---- QuickBooks Online (services/quickbooks.ts, shared/qbo-invoice.ts, docs/QUICKBOOKS.md) ---------

/** POST /quotes/:id/quickbooks: the quoted break per line (0 leaves a line off); omitted lines follow the plan's rule. */
export const sendQuoteInvoiceSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            lineId: z.string().min(1).max(64),
            quantity: z.number().int().min(0).max(1_000_000),
          })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict();

export interface QuickBooksStatusDto {
  /** False until the owner sets the Intuit app's keys on this server (dark). */
  available: boolean;
  mode: "sandbox" | "production" | "fake" | null;
  connection: {
    realmId: string;
    environment: string;
    connectedAt: string;
    /** When Intuit's refresh token runs out unless used (renewed on each send). */
    refreshExpiresAt: string;
    /** The item won quotes are invoiced with: the shop's choice, else "Machined parts". */
    invoiceItem: { id: string | null; name: string; custom: boolean };
  } | null;
}

/** PUT /quickbooks/item: the shop's own item for invoice lines, or null for "Machined parts". */
export const setQuickBooksItemSchema = z
  .object({ itemId: z.string().trim().min(1).max(64).nullable() })
  .strict();

/** GET /quickbooks/items: the items an admin can bill won quotes with, read live from QuickBooks. */
export interface QuickBooksItemsDto {
  items: { id: string; name: string; type: string; incomeAccountName: string | null }[];
  /** The shop's chosen item in the connected company; null: the default below. */
  current: { id: string; name: string } | null;
  defaultItemName: string;
  defaultAccountName: string;
}

export interface QuoteInvoiceLineDto {
  lineId: string;
  partNumber: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

/** GET /quotes/:id/quickbooks: what is or would be invoiced. */
export interface QuoteQuickBooksDto {
  available: boolean;
  connected: boolean;
  /** Set once the quote is in QuickBooks: the invoice number and what it billed. */
  invoice: {
    docNumber: string;
    invoiceId: string;
    totalCents: number;
    lines: QuoteInvoiceLineDto[];
    sentByName: string | null;
    sentAt: string;
  } | null;
  /** The customer's online acceptance, when there was one: the breaks it picked. */
  accepted: { lineId: string; quantity: number }[] | null;
  /** What the invoice number will be. */
  docNumber: string;
  /** The message printed on the invoice (PO and quote). */
  memo: string;
}

// ---- Billing (docs/BILLING.md) --------------------------------------------------------------------

export const checkoutSchema = z.object({
  plan: z.string().min(1).max(32),
  interval: z.enum(["month", "year"]).default("month"),
  promoCode: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export interface PlanDto {
  key: string;
  name: string;
  description: string;
  priceCents: number;
  annualPriceCents: number | null;
  /** RFQs the AI reads per calendar month (UTC); null = unlimited. */
  rfqsPerMonth: number | null;
  maxMembers: number | null;
  features: string[];
  purchasable: boolean;
}

export interface BillingDto {
  /** The plan whose limits apply now (the free plan when there is no usable subscription). */
  plan: { key: string; name: string };
  status: "trialing" | "active" | "past_due" | "paused" | "canceled" | "comp" | "none";
  /** True when a subscription exists but no longer grants its plan (free limits apply). */
  lapsed: boolean;
  /** past_due only: when access falls back to the free plan. */
  graceUntil: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: { rfqsPerMonth: number | null; members: number | null };
  usage: { rfqsThisMonth: number; members: number; pendingInvitations: number };
  /** YYYY-MM-DD (UTC): the first day of next month, when the RFQ allowance starts again. */
  allowanceResetsOn: string;
  /** False while paid plans are dark on this deployment. */
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  plans: PlanDto[];
}
