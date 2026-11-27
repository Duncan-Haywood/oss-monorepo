// Request schemas (validated by the Worker, used as types by the SPA) and response DTO types.
import { z } from "zod";
import type { CostBreak, CostInputs, CostIssue, RateSnapshot } from "./costing";
import {
  MACHINE_KINDS,
  MATERIAL_PRICING,
  MEMBER_ROLES,
  type QuoteStatus,
  type RfqStatus,
} from "./enums";
import type { FieldSource } from "./extraction";
import { CAD_UNITS, type GeometryFeatures } from "./geometry";
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

export const materialFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  pricingBasis: z.enum(MATERIAL_PRICING),
  pricePerLbCents: cents.nullable(),
  densityLbPerIn3: z.number().positive().max(1).nullable(),
  sheetThicknessIn: z.number().positive().max(24).nullable(),
  stockPriceCents: cents.nullable(),
  stockDescription: shortText.nullable(),
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
    stockPriceCents: tf.stockPriceCents.default(null),
    stockDescription: tf.stockDescription.default(null),
    scrapBps: tf.scrapBps.default(0),
    minChargeCents: tf.minChargeCents.default(0),
    active: tf.active.default(true),
  })
  .refine((m) => (m.pricingBasis === "per_lb" ? m.pricePerLbCents !== null : true), {
    message: "A per-lb material needs a $/lb price",
    path: ["pricePerLbCents"],
  })
  .refine((m) => (m.pricingBasis === "per_stock" ? m.stockPriceCents !== null : true), {
    message: "A per-stock material needs a stock price",
    path: ["stockPriceCents"],
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
  z.object({ kind: z.literal("materials"), rows: importRows(materialFieldsSchema) }),
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
/**
 * PATCH a line: only the fields sent change. Not `quoteLineSchema.partial()`: in zod 4 a default
 * inside an optional still fills in, so a PATCH of `inputs` alone cleared revision and description.
 */
export const quoteLinePatchSchema = z.object({
  partNumber: z.string().trim().min(1).max(200).optional(),
  revision: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  inputs: z.unknown().optional(),
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
  pricingBasis: "per_lb" | "per_stock";
  pricePerLbCents: number | null;
  densityLbPerIn3: number | null;
  sheetThicknessIn: number | null;
  stockPriceCents: number | null;
  stockDescription: string | null;
  scrapBps: number;
  minChargeCents: number;
  active: boolean;
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
  /** Who may email RFQs in ("buyer@acme.com", "@acme.com"); empty accepts everyone. */
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
    cycleMinutesPerPart: number;
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
/** The window named by `value` (e.g. a <select>'s DOM text), or null when it is not one of ours. */
export const winLossWindowOf = (value: string): WinLossWindow | null =>
  WIN_LOSS_WINDOWS.find((w) => w === value) ?? null;

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
