// Request bodies (zod). Shared by the Worker (validation) and the SPA (types). Money: integer cents.
import {
  CA_NOTICE_METHODS,
  CA_NOTICE_RECIPIENTS,
  FL_NOTICE_RECIPIENTS,
  FL_SERVICE_METHODS,
} from "@lien-waivers";
import { z } from "zod";
import { isTimeZone } from "../cash-digest";
import { CLOSEOUT_KINDS } from "../closeout";
import { COMPANY_DOCUMENT_KINDS } from "../company-documents";
import { MAX_CREW_LINES, MAX_TEMP_F, MAX_WORKERS_PER_LINE, MIN_TEMP_F } from "../daily-reports";
import {
  GA_CONTRACTOR_COPY,
  GA_CONTRACTOR_COPY_METHODS,
  GA_COPY_METHODS,
  MEMBER_ROLES,
  PAY_TERMS_BASES,
  SHORT_CLOSE_REASONS,
  WAIVER_KINDS,
  WAIVER_STATUSES,
} from "../enums";
import {
  ALTERNATE_KINDS,
  ESTIMATE_STATUSES,
  MAX_BID_ITEM_LENGTH,
  MAX_BID_ITEMS,
  MAX_ESTIMATE_LINES,
  MAX_MARKUP_BPS,
} from "../estimate";
import {
  MAX_PROCORE_DESCRIPTION_LENGTH,
  MAX_PROCORE_POSITION_LENGTH,
  MAX_PROCORE_POSITIONS,
} from "../gc-export/procore-placement";
import { INSURANCE_KINDS } from "../insurance";
import { COMMITMENT_KINDS, COST_CATEGORIES, MAX_COST_ENTRIES_PER_REQUEST } from "../job-cost";
import { MAX_QBO_IMPORT_LINES } from "../job-cost-qbo";
import { LOWER_TIER_PARTY_KINDS, MAX_LOWER_TIER_PER_PAY_APP } from "../lower-tier-waivers";
import { MAX_OWNER_PAID_BATCH } from "../payments";
import {
  MAX_PRICE_CODE_LENGTH,
  MAX_PRICE_DESCRIPTION_LENGTH,
  MAX_PRICE_LIST_BATCH,
  MAX_PRICE_NOTE_LENGTH,
} from "../price-list";
import { PUNCH_SOURCES } from "../punch-list";
import { RFI_IMPACTS } from "../rfi";
import {
  MAX_HOLIDAYS_PER_ADD,
  MAX_LAG_WORKDAYS,
  MAX_SCHEDULE_ACTIVITIES,
  MAX_SHIFT_WORKDAYS,
} from "../schedule";
import {
  MAX_SUBMITTAL_DAYS,
  MAX_SUBMITTALS_PER_JOB,
  SUBMITTAL_ACTIONS,
  SUBMITTAL_TYPES,
  TRANSMITTAL_REQUESTS,
} from "../submittals";
import {
  MAX_BURDEN_BPS as TIMESHEET_MAX_BURDEN_BPS,
  MAX_DAY_HUNDREDTHS as TIMESHEET_MAX_DAY,
  MAX_RATE_CENTS as TIMESHEET_MAX_RATE_CENTS,
  MAX_ROWS_PER_WORKER_WEEK as TIMESHEET_MAX_ROWS,
} from "../timesheets";
import {
  MAX_RATE_SHEET_LINES,
  MAX_SIGNATURE_BASE64,
  MAX_TM_HOURS,
  MAX_TM_LINES,
  MAX_TM_MARKUP_BPS,
  MAX_TM_NUMBER,
  MAX_TM_PER_CHANGE_ORDER,
  MAX_TM_QUANTITY,
  MAX_TM_RATE_CENTS,
  MAX_TM_WORKERS,
} from "../tm-tickets";
import { MAX_QUANTITY_MILLI, MAX_UNIT_LENGTH, MAX_UNIT_PRICE_MICROS } from "../unit-price";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const cents = z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00);
const nonNegCents = cents.min(0);
const bps = z.number().int().min(0).max(10_000);
const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).nullish();
/** An optional email address; a blank field clears it (null). */
const optEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().max(254).email("Enter an email address like ap@builder.example").nullish(),
);

export const createOrgSchema = z.object({ name: text(200) });

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(MEMBER_ROLES).exclude(["owner"]),
});
export const updateMemberSchema = z.object({ role: z.enum(MEMBER_ROLES) });
/** Invite someone (with or without an account) by email. Owners are made, not invited. */
export const inviteMemberSchema = addMemberSchema;

const projectFields = z.object({
  name: text(200),
  number: optText(60),
  location: optText(300),
  gcName: text(200),
  gcAddress: optText(300),
  /** The GC's billing contact (accounts payable): follow-up drafts are addressed to them. */
  gcBillingName: optText(200),
  gcBillingEmail: optEmail,
  /** The GC's project manager on the job: change order requests are addressed to them. */
  gcPmName: optText(200),
  gcPmEmail: optEmail,
  ownerName: optText(200),
  architectName: optText(200),
  contractDate: isoDate.nullish(),
  originalContractSumCents: nonNegCents,
  retainagePctBps: bps,
  storedRetainagePctBps: bps,
  /** Days after the application date the GC has to pay; null when not known. */
  payTermsDays: z.number().int().min(0).max(365).nullish(),
  /** What the days count from: the application date (default) or the end of the period billed. */
  payTermsBasis: z.enum(PAY_TERMS_BASES).optional(),
  /** Pay-when-paid outer limit: due within this many days of the application date in any event. */
  payTermsOuterDays: z.number().int().min(1).max(365).nullish(),
  /** Print a notary block (jurat and seal box) on the application summary PDF. */
  notaryBlock: z.boolean().optional(),
  /** The GC's monthly billing cutoff, day of the month (31: the last day); null clears it. */
  billingDay: z.number().int().min(1).max(31).nullish(),
  /** Georgia: a notice of commencement was filed for the job (null: not known). */
  gaNocFiled: z.boolean().nullish(),
  /** Georgia: the contractor's name and address as the notice of commencement shows them. */
  gaNocContractor: optText(300),
});
/** A new job: retainage defaults to 10% on work and on stored materials. */
export const projectSchema = projectFields.extend({
  retainagePctBps: bps.default(1000),
  storedRetainagePctBps: bps.default(1000),
});
/**
 * Change a job: only the fields sent change. Built from the fields without their defaults: in zod 4
 * a `.default()` still fills in under `.partial()`, so a PATCH of the notary block, pay terms or GC
 * contact used to reset both retainage rates to 10% (fixed 2026-11-25).
 */
export const updateProjectSchema = projectFields
  .partial()
  .extend({ status: z.enum(["active", "closed"]).optional() });

/** Unit-price fields (src/shared/unit-price.ts); omitted or null on a lump-sum line. */
const unitPriceFields = {
  unit: z.string().trim().min(1).max(MAX_UNIT_LENGTH).nullish(),
  unitPriceMicros: z.number().int().min(1).max(MAX_UNIT_PRICE_MICROS).nullish(),
  quantityMilli: z.number().int().min(1).max(MAX_QUANTITY_MILLI).nullish(),
};
export const sovLineSchema = z.object({
  itemNumber: text(20),
  description: text(300),
  originalCents: nonNegCents,
  ...unitPriceFields,
});
export const updateSovLineSchema = sovLineSchema.partial().extend({
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  /** The line's own retainage rate (0 for a bond line, say); null follows the application. */
  retainagePctBps: bps.nullable().optional(),
});
export const bulkSovSchema = z.object({ lines: z.array(sovLineSchema).min(1).max(500) });

/**
 * Mid-job start: the last pay application made before the job moved here, read off its summary
 * and continuation sheet. Lines not listed carry no work.
 */
export const openingSchema = z.object({
  appNumber: z.number().int().min(1).max(999),
  periodTo: isoDate,
  /** Line 6, total earned less retainage. */
  previousCertificatesCents: nonNegCents,
  /** Line 5a, retainage on completed work (optional; checked against the recomputed figure). */
  retainageHeldCents: nonNegCents.nullish(),
  lines: z
    .array(
      z.object({
        sovLineId: z.string().min(1),
        completedCents: nonNegCents,
        /** Retainage on the line already released on or before that application (optional). */
        releasedCents: nonNegCents.optional(),
      }),
    )
    .max(500),
});

/** Contract time a change order asks for, in calendar days (up to five years). */
const scheduleDays = z.number().int().min(0).max(1825);

export const changeOrderSchema = z
  .object({
    number: text(30),
    description: text(500),
    /** Date the change order request went to the GC (ages a pending one in the cash report). */
    submittedOn: isoDate.nullish(),
    /** Calendar days of contract time requested (0 = none); omitted or null = not stated. */
    scheduleDays: scheduleDays.nullish(),
    items: z
      .array(
        z.union([
          z.object({ sovLineId: z.string().min(1), amountCents: cents }),
          z.object({
            newLine: z.object({ itemNumber: text(20), description: text(300) }),
            amountCents: cents,
          }),
        ]),
      )
      .min(1)
      .max(100),
    /** An answered RFI on the same job with no change order yet: linked to the new one. */
    rfiId: z.string().min(1).max(64).nullish(),
  })
  .strict();
export const approveChangeOrderSchema = z.object({ approvedOn: isoDate });
/** Record (or clear) the date a pending change order went to the GC. */
export const changeOrderSentSchema = z.object({ submittedOn: isoDate.nullable() }).strict();
/** POST .../change-orders/:coId/emailed: an email draft was copied or opened ("last chased"). */
export const changeOrderEmailedSchema = z
  .object({ kind: z.enum(["request", "follow-up"]) })
  .strict();
/** Set (or clear) the contract time a pending change order asks for. */
export const changeOrderScheduleSchema = z
  .object({ scheduleDays: scheduleDays.nullable() })
  .strict();

/** An RFI on a job (src/shared/rfi.ts). Text fields left blank clear (null); dates are checked as a whole. */
const rfiFields = {
  subject: text(200),
  question: text(4000),
  suggestion: optText(4000),
  reference: optText(200),
  sentOn: isoDate.nullish(),
  responseDueOn: isoDate.nullish(),
  answeredOn: isoDate.nullish(),
  answer: optText(8000),
  answeredBy: optText(200),
  costImpact: z.enum(RFI_IMPACTS).nullish(),
  timeImpact: z.enum(RFI_IMPACTS).nullish(),
  /** A change order on the same job that prices the answer; null unlinks it. */
  changeOrderId: z.string().min(1).max(64).nullish(),
};
/** POST .../rfis: `number` is the next one on the job when omitted. */
export const rfiSchema = z
  .object({ ...rfiFields, number: z.number().int().min(1).max(99_999).optional() })
  .strict();
/** PATCH .../rfis/:rfiId: any of the fields; omitted ones keep their value. */
export const updateRfiSchema = z.object(rfiFields).partial().strict();
export type RfiInputBody = z.infer<typeof rfiSchema>;
export type RfiUpdateBody = z.infer<typeof updateRfiSchema>;

/** Estimates (src/shared/estimate.ts): the bid's header; markups and tax in basis points. */
const markupBps = z.number().int().min(0).max(MAX_MARKUP_BPS);
const estimateFields = {
  name: text(200),
  gcName: text(200),
  gcContactName: optText(200),
  gcContactEmail: optEmail,
  location: optText(300),
  bidDueOn: isoDate.nullish(),
  sentOn: isoDate.nullish(),
  validDays: z.number().int().min(1).max(365).optional(),
  laborMarkupBps: markupBps.optional(),
  materialMarkupBps: markupBps.optional(),
  equipmentMarkupBps: markupBps.optional(),
  subcontractMarkupBps: markupBps.optional(),
  otherMarkupBps: markupBps.optional(),
  materialTaxBps: bps.optional(),
  inclusions: optText(4000),
  exclusions: optText(4000),
  notes: optText(4000),
};
export const estimateSchema = z.object(estimateFields).strict();
/** PATCH: any header field, and the status (won is set only through POST .../win). */
export const updateEstimateSchema = z
  .object({
    ...estimateFields,
    status: z.enum(ESTIMATE_STATUSES).exclude(["won"]).optional(),
    decidedOn: isoDate.nullish(),
  })
  .partial()
  .strict();
export const estimateLinesSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            bidItem: text(MAX_BID_ITEM_LENGTH),
            category: z.enum(COST_CATEGORIES),
            description: z.string().trim().max(300),
            quantityMilli: z.number().int().min(0).max(MAX_QUANTITY_MILLI),
            unit: z.string().trim().max(MAX_UNIT_LENGTH).nullish(),
            unitCostMicros: z.number().int().min(0).max(MAX_UNIT_PRICE_MICROS),
          })
          .strict(),
      )
      .max(MAX_ESTIMATE_LINES),
    /**
     * The bid items that are add or deduct alternates; the rest are base bid. Left out, the saved
     * ones are kept (those still naming an item). An item named twice takes the last kind.
     */
    alternates: z
      .array(
        z.object({ bidItem: text(MAX_BID_ITEM_LENGTH), kind: z.enum(ALTERNATE_KINDS) }).strict(),
      )
      .max(MAX_BID_ITEMS)
      .optional(),
  })
  .strict();
/** POST .../win: the job it becomes; retainage defaults to 10% like a new job. */
export const winEstimateSchema = z
  .object({
    contractDate: isoDate.nullish(),
    number: optText(60),
    retainagePctBps: bps.optional(),
    storedRetainagePctBps: bps.optional(),
    decidedOn: isoDate.nullish(),
    /** The alternates the GC accepted, by bid item; left out, none (the base bid). */
    acceptedAlternates: z.array(text(MAX_BID_ITEM_LENGTH)).max(MAX_BID_ITEMS).optional(),
  })
  .strict();
export type EstimateInputBody = z.infer<typeof estimateSchema>;
export type EstimateUpdateBody = z.infer<typeof updateEstimateSchema>;
export type EstimateLinesBody = z.infer<typeof estimateLinesSchema>;
/** One price-list item (src/shared/price-list.ts); code, unit and note may be blank. */
export const priceItemSchema = z
  .object({
    category: z.enum(COST_CATEGORIES),
    code: optText(MAX_PRICE_CODE_LENGTH),
    description: text(MAX_PRICE_DESCRIPTION_LENGTH),
    unit: z.string().trim().max(MAX_UNIT_LENGTH).nullish(),
    unitCostMicros: z.number().int().min(0).max(MAX_UNIT_PRICE_MICROS),
    note: optText(MAX_PRICE_NOTE_LENGTH),
  })
  .strict();
export const updatePriceItemSchema = priceItemSchema.partial().strict();
/** POST .../price-list/merge: add new items and update the cost of matching ones. */
export const mergePriceItemsSchema = z
  .object({ items: z.array(priceItemSchema).min(1).max(MAX_PRICE_LIST_BATCH) })
  .strict();
export type PriceItemBody = z.infer<typeof priceItemSchema>;
export type PriceItemUpdateBody = z.infer<typeof updatePriceItemSchema>;
export type MergePriceItemsBody = z.infer<typeof mergePriceItemsSchema>;
export type WinEstimateBody = z.infer<typeof winEstimateSchema>;
/** A punch list item on a job (src/shared/punch-list.ts). Blank text clears (null); dates are checked as a whole. */
const punchFields = {
  description: text(1000),
  location: optText(200),
  source: z.enum(PUNCH_SOURCES).nullish(),
  listedOn: isoDate.nullish(),
  dueOn: isoDate.nullish(),
  completedOn: isoDate.nullish(),
  completedBy: optText(200),
  acceptedOn: isoDate.nullish(),
  acceptedBy: optText(200),
  /** Why the item is not the contractor's; a non-blank note marks it disputed. */
  disputeNote: optText(1000),
};
/** POST .../punch-list: `number` is the next one on the job when omitted. */
export const punchItemSchema = z
  .object({ ...punchFields, number: z.number().int().min(1).max(99_999).optional() })
  .strict();
/** POST .../punch-list/bulk: several items pasted at once (one per line), numbered in order. */
export const punchItemsBulkSchema = z
  .object({
    items: z.array(z.object(punchFields).strict()).min(1).max(500),
  })
  .strict();
/** PATCH .../punch-list/:itemId: any of the fields; omitted ones keep their value. */
export const updatePunchItemSchema = z.object(punchFields).partial().strict();
export type PunchItemInputBody = z.infer<typeof punchItemSchema>;
export type PunchItemUpdateBody = z.infer<typeof updatePunchItemSchema>;
/** An activity on a job's schedule (src/shared/schedule.ts). Blank text clears (null). */
const scheduleFields = {
  name: text(300),
  trade: optText(200),
  startOn: isoDate,
  finishOn: isoDate,
  percentComplete: z.number().int().min(0).max(100).optional(),
  predecessorNumber: z.number().int().min(1).max(99_999).nullish(),
  lagDays: z.number().int().min(0).max(MAX_LAG_WORKDAYS).optional(),
  notes: optText(2000),
};
/** POST .../schedule: `number` is the next one on the job when omitted. */
export const scheduleActivitySchema = z
  .object({ ...scheduleFields, number: z.number().int().min(1).max(99_999).optional() })
  .strict();
/** PATCH .../schedule/:activityId: any of the fields; omitted ones keep their value. */
export const updateScheduleActivitySchema = z.object(scheduleFields).partial().strict();
/** POST .../schedule/:activityId/shift: move it and what waits on it by workdays (negative: earlier). */
export const shiftScheduleSchema = z
  .object({
    workdays: z
      .number()
      .int()
      .min(-MAX_SHIFT_WORKDAYS)
      .max(MAX_SHIFT_WORKDAYS)
      .refine((n) => n !== 0, "Move by at least one workday"),
  })
  .strict();
/**
 * POST .../schedule/import: activities read from the GC's P6 export (src/shared/schedule-xer.ts).
 * An activity whose `sourceCode` is already on the job is updated (name, dates, percent, its
 * predecessor); the rest are added. `predecessorCode` names a P6 activity ID on the job after the
 * import.
 */
export const importScheduleSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            sourceCode: z.string().trim().min(1).max(100),
            name: text(300),
            startOn: isoDate,
            finishOn: isoDate,
            percentComplete: z.number().int().min(0).max(100),
            predecessorCode: z.string().trim().min(1).max(100).nullable(),
            lagDays: z.number().int().min(0).max(MAX_LAG_WORKDAYS),
            notes: optText(2000),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_SCHEDULE_ACTIVITIES),
    /** The trade or crew put on every activity this import adds or updates; blank leaves it. */
    trade: optText(200),
  })
  .strict();
export type ImportScheduleBody = z.infer<typeof importScheduleSchema>;
/** The company's holidays to add (federal list or typed); a date already listed keeps its name. */
export const addHolidaysSchema = z
  .object({
    holidays: z
      .array(
        z
          .object({
            on: isoDate.refine((d) => {
              const t = Date.parse(`${d}T00:00:00Z`);
              return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
            }, "Not a calendar date"),
            name: z.string().trim().min(1, "Name the holiday").max(80),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_HOLIDAYS_PER_ADD),
  })
  .strict();
export type AddHolidaysBody = z.infer<typeof addHolidaysSchema>;
export type ScheduleActivityBody = z.infer<typeof scheduleActivitySchema>;
export type ScheduleActivityUpdateBody = z.infer<typeof updateScheduleActivitySchema>;
/** A close-out document on a job (src/shared/closeout.ts). Blank text clears (null); dates are checked as a whole. */
const closeoutFields = {
  kind: z.enum(CLOSEOUT_KINDS),
  title: text(300),
  requiredBy: optText(200),
  dueOn: isoDate.nullish(),
  sentOn: isoDate.nullish(),
  acceptedOn: isoDate.nullish(),
  acceptedBy: optText(200),
  /** Why the job does not need it; a non-blank note marks it not required. */
  waivedNote: optText(500),
  note: optText(1000),
};
/** POST .../closeout: one item, added at the end of the checklist. */
export const closeoutItemSchema = z.object(closeoutFields).strict();
/** PATCH .../closeout/:itemId: any of the fields; omitted ones keep their value. */
export const updateCloseoutItemSchema = z.object(closeoutFields).partial().strict();
/** POST .../closeout/standard: the standard list, plus consent of surety on a bonded job. */
export const closeoutStandardSchema = z
  .object({ bonded: z.boolean().optional(), dueOn: isoDate.nullish() })
  .strict();
export type CloseoutItemInputBody = z.infer<typeof closeoutItemSchema>;
export type CloseoutItemUpdateBody = z.infer<typeof updateCloseoutItemSchema>;
export type CloseoutStandardBody = z.infer<typeof closeoutStandardSchema>;
/** A lower-tier lien waiver on a pay app (src/shared/lower-tier-waivers.ts). Blank text clears (null). */
const lowerTierFields = {
  party: text(200),
  partyKind: z.enum(LOWER_TIER_PARTY_KINDS).nullish(),
  partyEmail: optEmail,
  kind: z.enum(WAIVER_KINDS),
  throughDate: isoDate.nullish(),
  amountCents: nonNegCents.nullish(),
  requestedOn: isoDate.nullish(),
  receivedOn: isoDate.nullish(),
  note: optText(1000),
};
/** POST .../lower-tier-waivers: one waiver owed to the contractor for that pay app. */
export const lowerTierWaiverSchema = z
  .object({ payAppId: z.string().min(1).max(64), ...lowerTierFields })
  .strict();
/** POST .../lower-tier-waivers/bulk: several parties added at once (the suggestions ticked). */
export const lowerTierWaiversBulkSchema = z
  .object({
    payAppId: z.string().min(1).max(64),
    items: z.array(z.object(lowerTierFields).strict()).min(1).max(MAX_LOWER_TIER_PER_PAY_APP),
  })
  .strict();
/** PATCH .../lower-tier-waivers/:id: any of the fields; omitted ones keep their value. */
export const updateLowerTierWaiverSchema = z.object(lowerTierFields).partial().strict();
export type LowerTierWaiverInputBody = z.infer<typeof lowerTierWaiverSchema>;
export type LowerTierWaiverFieldsBody = z.infer<typeof lowerTierWaiversBulkSchema>["items"][number];
export type LowerTierWaiverUpdateBody = z.infer<typeof updateLowerTierWaiverSchema>;
/** A daily report on a job (src/shared/daily-reports.ts): blank text clears (null); the date,
 * temperatures, hours and crew lines are checked as a whole by `dailyReportProblem`. */
const crewLineSchema = z
  .object({
    company: optText(200),
    trade: text(120),
    workers: z.number().int().min(1).max(MAX_WORKERS_PER_LINE),
    hoursEach: z.number().min(0).max(24),
  })
  .strict();
const temp = z.number().int().min(MIN_TEMP_F).max(MAX_TEMP_F).nullish();
const dailyReportFields = {
  reportDate: isoDate,
  weather: optText(200),
  tempHighF: temp,
  tempLowF: temp,
  delayHours: z.number().min(0).max(24).nullish(),
  crew: z.array(crewLineSchema).max(MAX_CREW_LINES).optional(),
  workPerformed: optText(8000),
  delays: optText(4000),
  /** The schedule activity the delay held up; null: none. Checked against the job's schedule. */
  delayActivityId: z.string().min(1).max(64).nullish(),
  equipment: optText(2000),
  deliveries: optText(2000),
  visitors: optText(2000),
  safety: optText(2000),
  notes: optText(4000),
};
/** POST .../daily-reports */
export const dailyReportSchema = z.object(dailyReportFields).strict();
/** PATCH .../daily-reports/:reportId: any of the fields; omitted ones keep their value. */
export const updateDailyReportSchema = z.object(dailyReportFields).partial().strict();
/** GET .../daily-reports/range.pdf?from=&to= */
export const dailyReportRangeQuerySchema = z.object({ from: isoDate, to: isoDate });
/** GET .../schedule/delays(.pdf)?activityId=&from=&to= : every filter optional. */
export const delayLogQuerySchema = z.object({
  activityId: z.string().min(1).max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
/** POST .../change-orders/:coId/delay-backup: the delay log (one activity's, or all) as a PDF file. */
export const delayBackupSchema = z
  .object({
    activityId: z.string().min(1).max(64).nullish(),
    from: isoDate.nullish(),
    to: isoDate.nullish(),
  })
  .strict();
export type DelayLogQuery = z.infer<typeof delayLogQuerySchema>;
export type DelayBackupBody = z.infer<typeof delayBackupSchema>;
export type DailyReportInputBody = z.infer<typeof dailyReportSchema>;
export type DailyReportUpdateBody = z.infer<typeof updateDailyReportSchema>;

/** A T&M ticket on a job (src/shared/tm-tickets.ts): the lines and markups are checked as a whole
 * by `tmTicketProblem`; a null rate is a line priced later. */
const tmRate = z.number().int().min(0).max(MAX_TM_RATE_CENTS).nullable();
const tmLaborSchema = z
  .object({
    trade: text(120),
    workers: z.number().int().min(1).max(MAX_TM_WORKERS),
    hoursEach: z.number().gt(0).max(MAX_TM_HOURS),
    rateCents: tmRate,
  })
  .strict();
const tmMaterialSchema = z
  .object({
    description: text(300),
    quantity: z.number().gt(0).max(MAX_TM_QUANTITY),
    unit: optText(30),
    unitCostCents: tmRate,
  })
  .strict();
const tmEquipmentSchema = z
  .object({
    description: text(300),
    hours: z.number().gt(0).max(MAX_TM_HOURS),
    rateCents: tmRate,
  })
  .strict();
const tmMarkup = z.number().int().min(0).max(MAX_TM_MARKUP_BPS);
const tmTicketFields = {
  /** Omitted on create: the next free number on the job. */
  number: z.number().int().min(1).max(MAX_TM_NUMBER),
  workDate: isoDate,
  description: text(4000),
  location: optText(300),
  directedBy: optText(200),
  reference: optText(120),
  labor: z.array(tmLaborSchema).max(MAX_TM_LINES),
  material: z.array(tmMaterialSchema).max(MAX_TM_LINES),
  equipment: z.array(tmEquipmentSchema).max(MAX_TM_LINES),
  laborMarkupBps: tmMarkup,
  materialMarkupBps: tmMarkup,
  equipmentMarkupBps: tmMarkup,
  notes: optText(4000),
};
/** POST .../tm-tickets */
export const tmTicketSchema = z
  .object({
    ...tmTicketFields,
    number: tmTicketFields.number.optional(),
    labor: tmTicketFields.labor.default([]),
    material: tmTicketFields.material.default([]),
    equipment: tmTicketFields.equipment.default([]),
    laborMarkupBps: tmMarkup.default(0),
    materialMarkupBps: tmMarkup.default(0),
    equipmentMarkupBps: tmMarkup.default(0),
  })
  .strict();
/** PATCH .../tm-tickets/:ticketId: any of the fields; omitted ones keep their value. */
export const updateTmTicketSchema = z.object(tmTicketFields).partial().strict();
/** PUT .../tm-tickets/:ticketId/signature: who signed, when, and the drawn signature (if any). */
export const tmSignatureSchema = z
  .object({
    signedName: text(120),
    signedTitle: optText(120),
    signedOn: isoDate,
    /** Base64 JPEG from the signature pad; omitted or null when the ticket was signed on paper. */
    signatureJpeg: z.string().max(MAX_SIGNATURE_BASE64).nullish(),
  })
  .strict();
/** POST .../tm-tickets/change-order: signed, priced tickets billed by one new change order. */
export const tmChangeOrderSchema = z
  .object({
    ticketIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_TM_PER_CHANGE_ORDER),
    number: text(30),
    target: z.union([
      z.object({ sovLineId: z.string().min(1).max(64) }).strict(),
      z.object({ newLine: z.object({ itemNumber: text(20) }).strict() }).strict(),
    ]),
    submittedOn: isoDate.nullish(),
  })
  .strict();
/** PUT .../tm-tickets/rate-sheet: the job's whole rate sheet (checked as a whole by
 * `rateSheetProblem`: names, duplicates, rates). Unit is kept for material rates only. */
const tmRateLineSchema = z
  .object({
    name: text(300),
    rateCents: z.number().int().min(0).max(MAX_TM_RATE_CENTS),
    unit: optText(30),
  })
  .strict();
const tmRateList = z.array(tmRateLineSchema).max(MAX_RATE_SHEET_LINES).default([]);
export const tmRateSheetSchema = z
  .object({
    labor: tmRateList,
    material: tmRateList,
    equipment: tmRateList,
    laborMarkupBps: tmMarkup.nullable().default(null),
    materialMarkupBps: tmMarkup.nullable().default(null),
    equipmentMarkupBps: tmMarkup.nullable().default(null),
    source: optText(300),
  })
  .strict();
export type TmRateSheetBody = z.infer<typeof tmRateSheetSchema>;
export type TmTicketInputBody = z.infer<typeof tmTicketSchema>;
export type TmTicketUpdateBody = z.infer<typeof updateTmTicketSchema>;
export type TmSignatureBody = z.infer<typeof tmSignatureSchema>;
export type TmChangeOrderBody = z.infer<typeof tmChangeOrderSchema>;

export const createPayAppSchema = z.object({
  periodFrom: isoDate,
  periodTo: isoDate,
  applicationDate: isoDate,
  retainagePctBps: bps.optional(),
  storedRetainagePctBps: bps.optional(),
});
export const updatePayAppSchema = createPayAppSchema.partial().extend({ notes: optText(2000) });

export const payAppLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        sovLineId: z.string().min(1),
        workThisPeriodCents: cents,
        storedMaterialsCents: nonNegCents,
        retainageReleasedCents: nonNegCents,
        /** Unit-price lines: quantity installed this period (thousandths); cents must match it. */
        quantityThisPeriodMilli: z
          .number()
          .int()
          .min(-MAX_QUANTITY_MILLI)
          .max(MAX_QUANTITY_MILLI)
          .nullish(),
      }),
    )
    .max(500),
});
/** Release retainage on a draft by a percentage of what is held, or a dollar amount split pro rata. */
export const retainageReleaseSchema = z
  .object({
    scope: z.enum(["all", "complete", "selected"]),
    sovLineIds: z.array(z.string().min(1)).max(500).optional(),
    percentBps: bps.min(1).optional(),
    amountCents: nonNegCents.min(1).optional(),
    /** false (default) previews the plan; true writes it to the draft's entries. */
    apply: z.boolean().default(false),
  })
  .refine((v) => (v.percentBps === undefined) !== (v.amountCents === undefined), {
    message: "Give either percentBps or amountCents",
  })
  .refine((v) => v.scope !== "selected" || (v.sovLineIds?.length ?? 0) > 0, {
    message: "Choose at least one line",
  });
export type RetainageReleaseInput = z.infer<typeof retainageReleaseSchema>;
export const certifyPayAppSchema = z.object({ certifiedAmountCents: nonNegCents.optional() });
export const recordPaymentSchema = z.object({
  amountCents: cents.min(1),
  receivedOn: isoDate,
  /** Check number, ACH trace or other reference. */
  reference: z.string().trim().max(120).nullish(),
});

/**
 * Mark paid in full. With a date received (and optionally a check number), the balance still owed
 * is recorded as one payment, so it can go to QuickBooks and dates the unconditional waiver; with
 * no body, the application is only marked paid (older clients).
 */
export const markPaidSchema = z
  .object({
    receivedOn: isoDate.optional(),
    reference: z.string().trim().max(120).nullish(),
  })
  .refine((v) => v.receivedOn !== undefined || !v.reference, {
    message: "A check number needs the date it was received",
    path: ["receivedOn"],
  });

/** Record, as one payment, the money a paid application counts as received without a payment row. */
export const unrecordedPaymentSchema = z.object({
  receivedOn: isoDate,
  reference: z.string().trim().max(120).nullish(),
});

/** Close the unpaid balance of an application paid short (src/shared/payments.ts). */
export const closeShortSchema = z.object({
  reason: z.enum(SHORT_CLOSE_REASONS),
  closedOn: isoDate,
  note: z.string().trim().max(500).nullish(),
});

/** Pay-when-paid: the day the owner paid the GC for an application, or null to clear it. */
export const ownerPaidSchema = z.object({ ownerPaidOn: isoDate.nullable() });

/** Pay-when-paid: one owner's payment date recorded on several applications of a job at once. */
export const ownerPaidManySchema = z.object({
  payAppIds: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(MAX_OWNER_PAID_BATCH)
    .refine((ids) => new Set(ids).size === ids.length, "Each application once"),
  ownerPaidOn: isoDate,
});

export const createWaiverSchema = z.object({
  /** Two-letter state whose waiver law governs the job. */
  state: z.string().trim().length(2),
  kind: z.enum(WAIVER_KINDS),
  /** A form other than the state's usual one of `kind` (an alternative such as Missouri's residential form). */
  formId: z.string().trim().min(1).max(80).nullish(),
  amountCents: nonNegCents,
  throughDate: isoDate.nullish(),
  /** Form field values, checked against the state's form by packages/lien-waivers. */
  fields: z
    .record(z.string().max(64), z.union([z.string().max(2000), z.number().int()]))
    .refine((r) => Object.keys(r).length <= 40, "Too many fields")
    .optional(),
});
/** POST /projects/:id/notices/notice.pdf: print a preliminary notice (nothing is saved). */
export const noticePdfSchema = z.object({
  state: z.string().trim().length(2),
  formId: z.string().trim().min(1).max(80),
  fields: z
    .record(z.string().max(64), z.string().max(2000))
    .refine((r) => Object.keys(r).length <= 40, "Too many fields"),
});
/** POST .../waivers/:id/ga-affidavit.pdf: Georgia's affidavit of nonpayment (nothing is saved). */
export const gaAffidavitPdfSchema = z.object({
  fields: z
    .record(z.string().max(64), z.union([z.string().max(2000), z.number().int()]))
    .refine((r) => Object.keys(r).length <= 40, "Too many fields"),
});
/** PUT /projects/:id/notices/ca/first-furnished: the § 8204(a) start date (null clears it). */
/** PUT /projects/:id/procore-ssov: where the job's lines sit under the GC's Procore SOV positions. */
export const procoreSsovSchema = z.object({
  positions: z
    .array(
      z.object({
        position: z.string().trim().min(1).max(MAX_PROCORE_POSITION_LENGTH),
        description: z.string().trim().max(MAX_PROCORE_DESCRIPTION_LENGTH),
        amountCents: z.number().int().min(-1e13).max(1e13).nullable(),
      }),
    )
    .min(1)
    .max(MAX_PROCORE_POSITIONS),
  placed: z
    .record(z.string().min(1).max(64), z.string().trim().min(1).max(MAX_PROCORE_POSITION_LENGTH))
    .refine((r) => Object.keys(r).length <= 5000, "Too many lines"),
});
export const caFirstFurnishedSchema = z.object({ firstFurnishedOn: isoDate.nullable() });
/** POST /projects/:id/notices/ca/sends: record a California preliminary notice as given. */
export const caNoticeSendSchema = z.object({
  recipient: z.enum(CA_NOTICE_RECIPIENTS),
  recipientNameAddress: z.string().trim().min(1, "Enter who it went to").max(500),
  method: z.enum(CA_NOTICE_METHODS),
  givenOn: isoDate,
  place: z.string().trim().min(1, "Enter where it was delivered or mailed").max(200),
  tracking: z.string().trim().max(100).nullish(),
});
/** PUT /projects/:id/notices/fl/first-furnished: the § 713.06(2)(a) start date (null clears it). */
export const flFirstFurnishedSchema = z.object({ firstFurnishedOn: isoDate.nullable() });
/** POST /projects/:id/notices/fl/sends: record a Florida Notice to Owner (or a copy) as served. */
export const flNoticeSendSchema = z.object({
  recipient: z.enum(FL_NOTICE_RECIPIENTS),
  recipientNameAddress: z.string().trim().min(1, "Enter who it went to").max(500),
  method: z.enum(FL_SERVICE_METHODS),
  sentOn: isoDate,
  deliveredOn: isoDate.nullish(),
  tracking: z.string().trim().max(100).nullish(),
});
/** PATCH /projects/:id/notices/fl/sends/:sendId: the delivery date, once the evidence is back. */
export const flNoticeDeliveredSchema = z.object({ deliveredOn: isoDate.nullable() });
export const updateWaiverSchema = z.object({ status: z.enum(WAIVER_STATUSES) });
/**
 * PUT .../waivers/:id/ga-affidavit/filing: record Georgia's affidavit of nonpayment as filed, and
 * later its copy to the owner (O.C.G.A. § 44-14-366(g)(2)). The copy's day and method go together.
 */
export const gaAffidavitFilingSchema = z
  .object({
    filedOn: isoDate,
    county: z
      .string()
      .trim()
      .min(1, "Enter the county it was filed in")
      .max(60)
      .transform((c) => c.replace(/\s+county$/i, "")),
    recording: z.string().trim().max(100).nullish(),
    copySentOn: isoDate.nullish(),
    copyMethod: z.enum(GA_COPY_METHODS).nullish(),
    copyTracking: z.string().trim().max(100).nullish(),
  })
  .refine((v) => !v.copySentOn === !v.copyMethod, {
    message: "Give both the day the copy was sent and how it was sent",
    path: ["copyMethod"],
  });
/**
 * PUT .../waivers/:id/ga-affidavit/contractor-copy: whether the affidavit's copy to the contractor at
 * the notice of commencement's address is owed, and once sent, the day and how. Day and method go
 * together, and only on an owed copy.
 */
export const gaContractorCopySchema = z
  .object({
    copy: z.enum(GA_CONTRACTOR_COPY),
    sentOn: isoDate.nullish(),
    method: z.enum(GA_CONTRACTOR_COPY_METHODS).nullish(),
    tracking: z.string().trim().max(100).nullish(),
  })
  .refine((v) => !v.sentOn === !v.method, {
    message: "Give both the day the copy was sent and how it was sent",
    path: ["method"],
  })
  .refine((v) => v.copy === "owed" || (!v.sentOn && !v.method && !v.tracking), {
    message: "A copy that is not owed has no day sent",
    path: ["sentOn"],
  });
/**
 * PUT .../waivers/:id/ga-affidavit/paid-affidavit: the (g)(3) affidavit that payment in full was
 * received, as signed and then as recorded in the county (book/page or instrument number).
 */
export const gaPaidAffidavitSchema = z
  .object({
    signedOn: isoDate,
    recordedOn: isoDate.nullish(),
    recording: z.string().trim().max(100).nullish(),
  })
  .refine((v) => !v.recording || v.recordedOn, {
    message: "Give the day it was recorded with the book and page",
    path: ["recordedOn"],
  });

export type ProjectInput = z.infer<typeof projectSchema>;
export type CaNoticeSendBody = z.infer<typeof caNoticeSendSchema>;
export type FlNoticeSendBody = z.infer<typeof flNoticeSendSchema>;
export type OpeningInputBody = z.infer<typeof openingSchema>;
export type CreateWaiverInput = z.infer<typeof createWaiverSchema>;
export type GaAffidavitFilingBody = z.infer<typeof gaAffidavitFilingSchema>;
export type GaContractorCopyBody = z.infer<typeof gaContractorCopySchema>;
export type GaPaidAffidavitBody = z.infer<typeof gaPaidAffidavitSchema>;
export type ChangeOrderInputBody = z.infer<typeof changeOrderSchema>;
export type PayAppLinesInput = z.infer<typeof payAppLinesSchema>;

export const checkoutSchema = z.object({
  plan: z.string().min(1).max(32),
  interval: z.enum(["month", "year"]).default("month"),
  promoCode: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/)
    .optional()
    .transform((v) => v || undefined),
});

/** PUT /quickbooks/invoice-item: a QuickBooks item id, or null to go back to the default item. */
export const quickbooksInvoiceItemSchema = z.object({
  itemId: z
    .string()
    .regex(/^[0-9A-Za-z-]{1,40}$/, "a QuickBooks item id")
    .nullable(),
});

const qboRefId = z.string().regex(/^[0-9A-Za-z-]{1,40}$/, "a QuickBooks id");

/**
 * PUT /quickbooks/tracking/:projectId: the job's QuickBooks class and/or location (null clears
 * one; a key left out keeps it).
 */
export const quickbooksJobTrackingSchema = z
  .object({ classId: qboRefId.nullable().optional(), locationId: qboRefId.nullable().optional() })
  .strict()
  .refine((v) => v.classId !== undefined || v.locationId !== undefined, {
    message: "Send classId, locationId or both.",
  });

/** PUT /api/orgs/:orgId/getting-started/reminders: the member's own reminders on or off. */
export const reminderSettingSchema = z.object({ on: z.boolean() }).strict();

/** PUT /api/orgs/:orgId/quickbooks/auto-payments: send payments as they are recorded, or not. */
export const quickbooksAutoPaymentsSchema = z.object({ enabled: z.boolean() }).strict();

/**
 * PUT /api/orgs/:orgId/digest: turn the weekly "money to chase" email on or off for yourself, and
 * pick its day (0 Sunday ... 6 Saturday), hour (0-23) and IANA time zone; Monday at 13:00 UTC when
 * never chosen. A field left out keeps what is saved.
 */
export const digestSettingSchema = z
  .object({
    enabled: z.boolean(),
    weekday: z.number().int().min(0).max(6).optional(),
    hour: z.number().int().min(0).max(23).optional(),
    timeZone: z.string().max(64).refine(isTimeZone, { message: "Unknown time zone" }).optional(),
  })
  .strict();

/** A policy limit in cents: up to $1 billion, which no subcontract asks a sub to carry. */
const limitCents = z.number().int().min(0).max(100_000_000_000);
/** A certificate's limits and the endorsements it shows (src/shared/insurance-requirements.ts). */
const certificateCoverageFields = {
  eachOccurrenceCents: limitCents.nullish(),
  aggregateCents: limitCents.nullish(),
  additionalInsured: z.boolean().optional(),
  waiverOfSubrogation: z.boolean().optional(),
  primaryNoncontributory: z.boolean().optional(),
};
/** An insurance certificate typed from the certificate (src/shared/insurance.ts). */
export const insuranceCertificateSchema = z
  .object({
    kind: z.enum(INSURANCE_KINDS),
    label: optText(120),
    carrier: optText(200),
    policyNumber: optText(100),
    effectiveOn: isoDate.nullish(),
    expiresOn: isoDate,
    notes: optText(2000),
    ...certificateCoverageFields,
  })
  .strict()
  .refine((v) => !v.effectiveOn || v.effectiveOn < v.expiresOn, {
    message: "The expiry date must be after the effective date",
    path: ["expiresOn"],
  });
export const updateInsuranceCertificateSchema = z
  .object({
    kind: z.enum(INSURANCE_KINDS).optional(),
    label: optText(120),
    carrier: optText(200),
    policyNumber: optText(100),
    effectiveOn: isoDate.nullish(),
    expiresOn: isoDate.optional(),
    notes: optText(2000),
    archived: z.boolean().optional(),
    ...certificateCoverageFields,
  })
  .strict();
/** A company document (license, W-9, bonding letter...; src/shared/company-documents.ts). */
const companyDocumentFields = {
  label: optText(120),
  issuer: optText(200),
  jurisdiction: optText(60),
  classification: optText(200),
  number: optText(100),
  effectiveOn: isoDate.nullish(),
  expiresOn: isoDate.nullish(),
  notes: optText(2000),
};
/** A W-9's number would be the company's EIN or SSN: never stored. */
const W9_NUMBER_MESSAGE =
  "PayApps does not keep a W-9's taxpayer identification number: leave the number blank";
export const companyDocumentSchema = z
  .object({ kind: z.enum(COMPANY_DOCUMENT_KINDS), ...companyDocumentFields })
  .strict()
  .refine((v) => !(v.kind === "w9" && v.number), { message: W9_NUMBER_MESSAGE, path: ["number"] })
  .refine((v) => !v.effectiveOn || !v.expiresOn || v.effectiveOn < v.expiresOn, {
    message: "The expiry date must be after the effective date",
    path: ["expiresOn"],
  });
export const updateCompanyDocumentSchema = z
  .object({
    kind: z.enum(COMPANY_DOCUMENT_KINDS).optional(),
    ...companyDocumentFields,
    archived: z.boolean().optional(),
  })
  .strict();
/** What a job's subcontract asks the company to carry, replacing the list (one row a coverage). */
export const insuranceRequirementsSchema = z
  .object({
    requirements: z
      .array(
        z
          .object({
            kind: z.enum(INSURANCE_KINDS),
            eachOccurrenceCents: limitCents.nullish(),
            aggregateCents: limitCents.nullish(),
            additionalInsured: z.boolean().optional(),
            waiverOfSubrogation: z.boolean().optional(),
            primaryNoncontributory: z.boolean().optional(),
            umbrellaCounts: z.boolean().optional(),
          })
          .strict(),
      )
      .max(INSURANCE_KINDS.length),
  })
  .strict()
  .refine((v) => new Set(v.requirements.map((r) => r.kind)).size === v.requirements.length, {
    message: "A coverage is listed twice",
    path: ["requirements"],
  });
/** The jobs whose GC holds a certificate, replacing the list (services/insurance-holders.ts). */
export const insuranceHoldersSchema = z
  .object({
    holders: z
      .array(z.object({ projectId: z.string().min(1).max(64), sentOn: isoDate.nullish() }).strict())
      .max(500),
  })
  .strict();
/** A file kept with an insurance certificate, to copy onto a pay application as backup. */
export const copyInsuranceFileSchema = z
  .object({
    certificateId: z.string().min(1).max(64),
    fileId: z.string().min(1).max(64),
  })
  .strict();

/** POST .../pay-apps/:payAppId/attachments/from-documents: a company document's file as backup. */
export const copyDocumentFileSchema = z
  .object({
    documentId: z.string().min(1).max(64),
    fileId: z.string().min(1).max(64),
  })
  .strict();

/**
 * PUT .../job-cost/budgets: set or clear (null) the cost budget of each listed line, and optionally
 * its cost to complete (the PM's revised estimate of cost still to come; null clears it, left out
 * keeps it). A cost to complete needs a budget on the line.
 */
export const jobCostBudgetsSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            sovLineId: z.string().min(1).max(64),
            budgetCents: nonNegCents.nullable(),
            costToCompleteCents: nonNegCents.nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

/** A line's budget by cost type (src/shared/cost-type-budget.ts); null clears the split. */
const costTypeSplitSchema = z
  .object({
    labor: nonNegCents.optional(),
    material: nonNegCents.optional(),
    equipment: nonNegCents.optional(),
    subcontract: nonNegCents.optional(),
    other: nonNegCents.optional(),
  })
  .strict();

export const jobCostTypeBudgetsSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            sovLineId: z.string().min(1).max(64),
            split: costTypeSplitSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

const costEntryFields = {
  sovLineId: z.string().min(1).max(64).nullable(),
  incurredOn: isoDate,
  category: z.enum(COST_CATEGORIES),
  amountCents: cents.refine((v) => v !== 0, "Enter an amount other than 0"),
  vendor: optText(200),
  description: optText(300),
  reference: optText(100),
  commitmentId: z.string().min(1).max(64).nullish(),
};

/** POST .../job-cost/entries: one or more costs (a pasted list arrives as several). */
export const jobCostEntriesSchema = z
  .object({
    entries: z.array(z.object(costEntryFields).strict()).min(1).max(MAX_COST_ENTRIES_PER_REQUEST),
    /**
     * Leave out every entry whose reference the job already has (an import such as a payroll report
     * sent again adds nothing). Entries with no reference are always added.
     */
    skipExistingReferences: z.boolean().optional(),
  })
  .strict();

/** PATCH .../job-cost/entries/:entryId */
export const updateJobCostEntrySchema = z
  .object({
    sovLineId: costEntryFields.sovLineId.optional(),
    incurredOn: isoDate.optional(),
    category: z.enum(COST_CATEGORIES).optional(),
    amountCents: costEntryFields.amountCents.optional(),
    vendor: optText(200),
    description: optText(300),
    reference: optText(100),
    commitmentId: costEntryFields.commitmentId,
  })
  .strict();

const commitmentFields = {
  sovLineId: z.string().min(1).max(64).nullable(),
  kind: z.enum(COMMITMENT_KINDS),
  category: z.enum(COST_CATEGORIES),
  vendor: z.string().trim().min(1, "Enter the vendor or subcontractor").max(200),
  reference: optText(100),
  description: optText(300),
  committedOn: isoDate,
  amountCents: nonNegCents.refine((v) => v > 0, "Enter the committed amount"),
};

/** POST .../job-cost/commitments: a purchase order or lower-tier subcontract. */
export const jobCostCommitmentSchema = z.object(commitmentFields).strict();

/** PATCH .../job-cost/commitments/:commitmentId (a change order to it is a new amount). */
export const updateJobCostCommitmentSchema = z
  .object({
    sovLineId: commitmentFields.sovLineId.optional(),
    kind: commitmentFields.kind.optional(),
    category: commitmentFields.category.optional(),
    vendor: commitmentFields.vendor.optional(),
    reference: optText(100),
    description: optText(300),
    committedOn: isoDate.optional(),
    amountCents: commitmentFields.amountCents.optional(),
  })
  .strict();

/**
 * PUT .../job-cost/quickbooks/link: the QuickBooks customer or job (or null to unlink), or, for a
 * company that tracks jobs by class, the class.
 */
export const jobCostQboLinkSchema = z.union([
  z.object({ customerId: z.string().min(1).max(64).nullable() }).strict(),
  z.object({ classId: z.string().min(1).max(64) }).strict(),
]);

/** GET .../job-cost/quickbooks/lines?from=&to= */
export const jobCostQboWindowSchema = z.object({ from: isoDate, to: isoDate }).strict();

/** POST .../job-cost/quickbooks/import: the lines chosen, each with its line and category. */
export const jobCostQboImportSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    lines: z
      .array(
        z
          .object({
            source: z.string().min(1).max(200),
            sovLineId: z.string().min(1).max(64).nullable(),
            category: z.enum(COST_CATEGORIES),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_QBO_IMPORT_LINES),
  })
  .strict();

// Submittal log (src/shared/submittals.ts). Dates YYYY-MM-DD; a blank date or number clears it.
const optDate = isoDate.nullish();
const optDays = z.number().int().min(0).max(MAX_SUBMITTAL_DAYS).nullish();
const submittalFields = {
  number: z.number().int().min(1).max(99_999).optional(),
  specSection: optText(40),
  title: z.string().trim().min(1, "Enter what is being submitted").max(200),
  type: z.enum(SUBMITTAL_TYPES),
  gcReference: optText(60),
  submittedOn: optDate,
  requiredBy: optDate,
  returnedOn: optDate,
  action: z.enum(SUBMITTAL_ACTIONS).nullish(),
  neededOnSite: optDate,
  leadTimeDays: optDays,
  reviewDays: optDays,
  notes: optText(2000),
};

/** POST .../submittals: a new submittal (the next number when none is given). */
export const createSubmittalSchema = z.object(submittalFields).strict();

/**
 * POST .../submittals/import: rows read from the GC's register or the spec sections
 * (src/shared/submittal-import.ts), numbered next on the job in the order given. What is due, not
 * what happened: no sent or returned dates and no action.
 */
export const importSubmittalsSchema = z
  .object({
    items: z
      .array(
        z
          .object(submittalFields)
          .omit({ number: true, submittedOn: true, returnedOn: true, action: true })
          .strict(),
      )
      .min(1)
      .max(MAX_SUBMITTALS_PER_JOB),
  })
  .strict();

/** PATCH .../submittals/:submittalId (number and revision are fixed once made). */
export const updateSubmittalSchema = z
  .object(submittalFields)
  .omit({ number: true })
  .partial()
  .strict();

/** POST .../submittals/:submittalId/resubmit: the next revision, sent on this date or not yet. */
export const resubmitSubmittalSchema = z.object({ submittedOn: optDate }).strict();

/** GET .../submittals/log.csv?today= (the user's local date, for days out and overdue). */
export const submittalLogQuerySchema = z.object({ today: isoDate.optional() });

/**
 * GET .../submittals/:submittalId/transmittal.pdf?today=&requested= (the date printed when it has
 * not been sent, and what the GC is asked to do; the type's default when not given).
 */
export const submittalTransmittalQuerySchema = z.object({
  today: isoDate.optional(),
  requested: z.enum(TRANSMITTAL_REQUESTS).optional(),
});

// ---- Crew timesheets (src/shared/timesheets.ts) ----

const crewFields = {
  name: z.string().trim().min(1, "Name the worker").max(120),
  trade: optText(80),
  rateCents: z.number().int().min(0).max(TIMESHEET_MAX_RATE_CENTS).nullish(),
};

/** POST /timesheets/crew */
export const crewMemberSchema = z.object(crewFields).strict();

/** PATCH /timesheets/crew/:workerId */
export const updateCrewMemberSchema = z
  .object({
    name: crewFields.name.optional(),
    trade: crewFields.trade,
    rateCents: crewFields.rateCents,
    active: z.boolean().optional(),
  })
  .strict();

/** PUT /timesheets/settings */
export const timesheetSettingsSchema = z
  .object({ weekStartDay: z.number().int().min(0).max(6) })
  .strict();

/** PUT /timesheets/weeks/:weekStart/workers/:workerId: the worker's rows for the week, replaced whole. */
export const workerWeekSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            projectId: z.string().min(1).max(64),
            sovLineId: z.string().min(1).max(64).nullish(),
            hours: z.array(z.number().int().min(0).max(TIMESHEET_MAX_DAY)).length(7),
          })
          .strict(),
      )
      .max(TIMESHEET_MAX_ROWS),
  })
  .strict();

/** POST /timesheets/weeks/:weekStart/post: the week's labor onto each job's costs. */
export const postTimesheetWeekSchema = z
  .object({ burdenBps: z.number().int().min(0).max(TIMESHEET_MAX_BURDEN_BPS).default(0) })
  .strict();
