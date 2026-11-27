// Request bodies (zod). Shared by the Worker (validation) and the SPA (types). Money: integer cents.
import { CA_NOTICE_METHODS, CA_NOTICE_RECIPIENTS } from "@lien-waivers";
import { z } from "zod";
import { isTimeZone } from "../cash-digest";
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
  MAX_PROCORE_DESCRIPTION_LENGTH,
  MAX_PROCORE_POSITION_LENGTH,
  MAX_PROCORE_POSITIONS,
} from "../gc-export/procore-placement";
import { MAX_OWNER_PAID_BATCH } from "../payments";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const cents = z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00);
const nonNegCents = cents.min(0);
const bps = z.number().int().min(0).max(10_000);
const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).nullish();
/** An optional email address; a blank field clears it (null). */
const optEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().max(254).email("Enter an email address like ap@builder.com").nullish(),
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

export const sovLineSchema = z.object({
  itemNumber: text(20),
  description: text(300),
  originalCents: nonNegCents,
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
