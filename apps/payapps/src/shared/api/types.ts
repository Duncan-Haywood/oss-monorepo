// Response DTOs. Timestamps are ISO strings; money integer cents; percentages basis points.
import type { CaNoticeMethod, CaNoticeRecipient } from "@lien-waivers";
import type {
  ChangeOrderStatus,
  GaContractorCopy,
  GaContractorCopyMethod,
  GaCopyMethod,
  MemberRole,
  PayAppStatus,
  PayTermsBasis,
  ShortCloseReason,
  WaiverKind,
  WaiverStatus,
} from "../enums";
import type { GaWaiverClock } from "../ga-waiver-clock";
import type { ProcoreSsovPlacement } from "../gc-export/procore-placement";
import type { JobEventAction, JobEventData } from "../job-history";
import type { LegalStatusDto } from "../legal";
import type { PayAppEventAction, PayAppEventData } from "../pay-app-history";
import type { ComputedApplication, Warning } from "../payapp-math";
import type { ReleasePlan } from "../retainage-release";
import type { WaiverToSend } from "../waiver-followup";

export interface MeDto {
  user: { id: string; email: string; name: string };
  memberships: { orgId: string; orgName: string; role: MemberRole }[];
  /** The current policy version and when this user accepted it (null: not yet). */
  legal: LegalStatusDto;
}

export interface MemberDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
}

/** A pending invitation, as the company's admins see it. */
export interface InvitationDto {
  id: string;
  email: string;
  role: MemberRole;
  inviterName: string | null;
  expiresAt: string;
  createdAt: string;
  /** False when the email could not be sent (throttled, no provider): tell the person yourself. */
  emailSent?: boolean;
}

/** An invitation addressed to the signed-in user's verified email. */
export interface MyInvitationDto {
  id: string;
  orgId: string;
  orgName: string;
  role: MemberRole;
  inviterName: string | null;
  expiresAt: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  number: string | null;
  location: string | null;
  gcName: string;
  gcAddress: string | null;
  /** The GC's billing contact (accounts payable), or null when not set. */
  gcBillingName: string | null;
  gcBillingEmail: string | null;
  /** The GC's project manager on the job (change order requests go to them), or null. */
  gcPmName: string | null;
  gcPmEmail: string | null;
  ownerName: string | null;
  architectName: string | null;
  contractDate: string | null;
  originalContractSumCents: number;
  retainagePctBps: number;
  storedRetainagePctBps: number;
  /** Days after the application date the GC has to pay under the subcontract; null when not set. */
  payTermsDays: number | null;
  /** What the days count from: the application date or the end of the period billed. */
  payTermsBasis: PayTermsBasis;
  /** Pay-when-paid outer limit in days from the application date ("in any event within 90 days"); null when none. */
  payTermsOuterDays: number | null;
  /** The application summary PDF carries a notary block (jurat and seal box). */
  notaryBlock: boolean;
  /** The GC's monthly billing cutoff, day of the month (31: the last day); null when not set. */
  billingDay: number | null;
  /** Georgia: a notice of commencement was filed for the job (true), was not (false), or not known. */
  gaNocFiled: boolean | null;
  /** Georgia: the contractor's name and address as the notice of commencement shows them, or null. */
  gaNocContractor: string | null;
  /** Where the job's lines sit under the GC's Procore SOV positions, or null when never saved. */
  procoreSsov: ProcoreSsovPlacement | null;
  status: "active" | "closed";
  /** Mid-job start: the last application made before the job moved here, or null. */
  opening: OpeningDto | null;
  /** The one-click sample job: invented data, not counted toward the plan, PDFs marked SAMPLE. */
  isSample: boolean;
  createdAt: string;
}

export interface OpeningDto {
  appNumber: number;
  periodTo: string;
  previousCertificatesCents: number;
  retainageHeldCents: number | null;
}

export interface SovLineDto {
  id: string;
  itemNumber: string;
  description: string;
  originalCents: number;
  /** Original + all approved change orders. */
  currentCents: number;
  sortOrder: number;
  changeOrderId: string | null;
  /** Mid-job start: work completed to date on the opening application. */
  openingCompletedCents: number;
  /** Mid-job start: retainage on the line released on or before the opening application. */
  openingReleasedCents: number;
  /** The line's own retainage rate; null when it follows each application's rates. */
  retainagePctBps: number | null;
  /** True once a submitted application has computed retainage on the line (rate locked). */
  retainageLocked: boolean;
}

export interface ChangeOrderDto {
  id: string;
  number: string;
  description: string;
  status: ChangeOrderStatus;
  approvedOn: string | null;
  /** Date the request went to the GC; null when not recorded. */
  submittedOn: string | null;
  /** Calendar days of contract time requested; 0 = no change; null = not stated. */
  scheduleDays: number | null;
  /** Date an email draft about it was last copied or opened here ("last chased"); null: never. */
  lastEmailedOn: string | null;
  /** Date it was entered here (YYYY-MM-DD, UTC). */
  createdOn: string;
  totalCents: number;
  items: { id: string; sovLineId: string; amountCents: number }[];
}

export interface PayAppDto {
  id: string;
  projectId: string;
  number: number;
  periodFrom: string;
  periodTo: string;
  applicationDate: string;
  retainagePctBps: number;
  storedRetainagePctBps: number;
  status: PayAppStatus;
  submittedAt: string | null;
  certifiedAmountCents: number | null;
  certifiedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  currentPaymentDueCents: number;
  totalEarnedLessRetainageCents: number;
  /** GC-certified amount, else line 8 (src/shared/payments.ts). */
  expectedCents: number;
  /** Counted as paid: everything once paid, else the payments recorded so far. */
  paidCents: number;
  /** Still owed on a sent application. */
  remainingCents: number;
  /**
   * Counted as paid but with no payment recorded behind it (marked paid in full without a date or
   * check): what "Record it as a payment" would record. 0 otherwise.
   */
  unrecordedCents: number;
  /** The balance closed without payment (paid short), or null (src/shared/payments.ts). */
  shortClose: ShortCloseDto | null;
  /** Pay-when-paid: the day the owner paid the GC for this application, or null. */
  ownerPaidOn: string | null;
}

export interface ShortCloseDto {
  cents: number;
  reason: ShortCloseReason;
  note: string | null;
  closedOn: string;
}

export interface PaymentDto {
  id: string;
  amountCents: number;
  receivedOn: string;
  reference: string | null;
  createdAt: string;
}

export interface PayAppDetailDto extends PayAppDto {
  computed: ComputedApplication;
  /** Warnings that must be fixed before submitting. */
  blockers: Warning[];
  /** Raw entries keyed by SOV line id (what the editor shows). */
  entries: Record<
    string,
    { workThisPeriodCents: number; storedMaterialsCents: number; retainageReleasedCents: number }
  >;
  editable: boolean;
  /** Payments received against this application, oldest first. */
  payments: PaymentDto[];
}

export interface ProjectDetailDto extends ProjectDto {
  sovLines: SovLineDto[];
  changeOrders: ChangeOrderDto[];
  payApps: PayAppDto[];
  /** True once a pay app was submitted: original SOV and contract sum are then locked. */
  billingStarted: boolean;
  sovTotalCents: number;
}

export interface PlanDto {
  key: string;
  name: string;
  description: string;
  priceCents: number;
  annualPriceCents: number | null;
  /** null = unlimited. */
  maxActiveJobs: number | null;
  maxMembers: number | null;
  features: string[];
  purchasable: boolean;
}

export interface BillingDto {
  /** The plan whose limits apply now (Free when there is no usable subscription). */
  plan: { key: string; name: string };
  status: "trialing" | "active" | "past_due" | "paused" | "canceled" | "comp" | "none";
  /** True when a subscription exists but no longer grants its plan (Free limits apply). */
  lapsed: boolean;
  /** past_due only: when access falls back to Free. */
  graceUntil: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: { activeJobs: number | null; members: number | null };
  usage: { activeJobs: number; members: number };
  /** False while paid plans are dark on this deployment. */
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  plans: PlanDto[];
}

/** A form packages/lien-waivers offers for a state, as the waiver editor needs it. */
export interface WaiverFormDto {
  id: string;
  kind: WaiverKind;
  title: string;
  source: "statutory" | "generic";
  citation: string | null;
  officialUrl: string | null;
  /** false: the statutory text is not encoded yet; the waiver can be tracked but not printed. */
  printable: boolean;
  /** Set on a form offered for only some jobs in the state (`alternatives`): when to choose it. */
  appliesTo: string | null;
  fields: {
    key: string;
    label: string;
    type: "text" | "multiline" | "date" | "money";
    required: boolean;
    help?: string;
  }[];
  notes: string[];
}

export interface WaiverDto {
  id: string;
  payAppId: string;
  state: string;
  kind: WaiverKind;
  formId: string | null;
  printable: boolean;
  amountCents: number;
  throughDate: string | null;
  status: WaiverStatus;
  sentAt: string | null;
  createdAt: string;
  /**
   * Georgia and Mississippi only: a sent waiver the money recorded does not cover, with its 90 days
   * (O.C.G.A. § 44-14-366(g)(2)) or 60 days (Miss. Code Ann. § 85-7-419(5)(b));
   * src/shared/ga-waiver-clock.ts. Null otherwise.
   */
  gaClock: GaWaiverClock | null;
  /** Georgia or Mississippi: the affidavit of nonpayment as recorded filed (null until then). */
  gaAffidavitFiling: GaAffidavitFilingDto | null;
}

export interface GaAffidavitFilingDto {
  filedOn: string;
  county: string;
  recording: string | null;
  copySentOn: string | null;
  copyMethod: GaCopyMethod | null;
  copyTracking: string | null;
  /** Whether a copy is owed to the contractor at the notice of commencement's address (null: not answered). */
  contractorCopy: GaContractorCopy | null;
  contractorCopySentOn: string | null;
  contractorCopyMethod: GaContractorCopyMethod | null;
  contractorCopyTracking: string | null;
  /** (g)(3): the affidavit that payment in full was received, signed and then recorded. */
  paidAffidavitSignedOn: string | null;
  paidAffidavitRecordedOn: string | null;
  paidAffidavitRecording: string | null;
}

/** GET .../waivers/:id/ga-affidavit: Georgia's or Mississippi's affidavit of nonpayment, filled from the waiver. */
export interface GaAffidavitDto {
  form: NoticeFormDto;
  prefill: Record<string, string | number>;
  clock: GaWaiverClock | null;
}

/** A statutory preliminary notice of right to lien the job's state prescribes (packages/lien-waivers). */
export interface NoticeFormDto {
  id: string;
  title: string;
  citation: string;
  officialUrl: string | null;
  /** Who the statute says the notice goes to, in its words. */
  sendTo: string;
  fields: WaiverFormDto["fields"];
  notes: string[];
}

/** GET /projects/:id/notices: the notices for a state and the values the job already knows. */
export interface NoticeOverviewDto {
  /** Whether the org's plan includes lien waivers and notices (Crew and up). */
  enabled: boolean;
  state: string | null;
  notices: NoticeFormDto[];
  /** States with an encoded notice (Wyoming today). */
  states: string[];
  prefill: Record<string, string>;
  /** The job's owner as entered on the job, if any: the notice goes to the record owner. */
  ownerName: string | null;
  /** California only (state=CA): the notices recorded as given and the § 8204(a) timing. */
  ca: CaNoticeLogDto | null;
}

/** A California preliminary notice recorded as given to one person. */
export interface CaNoticeSendDto {
  id: string;
  recipient: CaNoticeRecipient;
  recipientNameAddress: string;
  method: CaNoticeMethod;
  givenOn: string;
  /** § 8116: when notice is complete (five days after mailing for Code Civ. Proc. § 415.20). */
  completeOn: string;
  place: string;
  tracking: string | null;
  /** Against the § 8204(a) date; null when no first-furnished date is entered. */
  onTime: boolean | null;
  /** A late notice covers work from this day (§ 8204(a)); null when on time or unknown. */
  coversWorkFrom: string | null;
  /** Receipts and proofs kept with the record (§ 8118(b)); 0 when none. */
  fileCount: number;
}

export interface CaNoticeLogDto {
  firstFurnishedOn: string | null;
  /** First-furnished date plus 20 calendar days, or null. */
  dueOn: string | null;
  sends: CaNoticeSendDto[];
  /** § 8200(a) recipients with no notice recorded yet. */
  missing: CaNoticeRecipient[];
  methods: { id: CaNoticeMethod; label: string }[];
  recipients: { id: CaNoticeRecipient; label: string }[];
  /** Name and address the job already holds for each recipient. */
  recipientPrefill: Partial<Record<CaNoticeRecipient, string>>;
}

export interface WaiverOverviewDto {
  /** Whether the org's plan includes lien waivers (Crew and up). */
  enabled: boolean;
  items: WaiverDto[];
  /** Unconditional waivers this paid application still owes (src/shared/waiver-followup.ts). */
  toSend: WaiverToSend[];
  /** The kind this pay app's status points to (conditional until paid; final once fully billed). */
  suggestedKind: WaiverKind;
  /** Prefill from the job and pay app; the editor shows only the keys the chosen form declares. */
  prefill: Record<string, string | number>;
  /** Forms for `state` (the query's, else the last waiver's on this job), or [] when none is known. */
  state: string | null;
  forms: WaiverFormDto[];
  /**
   * Forms offered beside `forms` for only some jobs in the state, each with `appliesTo`
   * (Missouri: the unconditional final waiver for residential real property).
   */
  alternatives: WaiverFormDto[];
  /**
   * The job's Georgia notice of commencement, as recorded on the job: it preselects the answer on an
   * affidavit of nonpayment's copy to the contractor and says where that copy goes.
   */
  gaNoc: { filed: boolean | null; contractor: string | null };
}

/** QuickBooks Online for one company (docs/QUICKBOOKS.md). */
export interface QuickBooksStatusDto {
  /** The operator has configured the integration (else it is dark and cannot be connected). */
  available: boolean;
  /** "fake" in tests and the offline demo. */
  mode: "sandbox" | "production" | "fake" | null;
  /** The company's plan includes it (Crew and up). */
  planIncludes: boolean;
  connection: {
    realmId: string;
    environment: string;
    connectedAt: string;
    /** After this date QuickBooks must be reconnected (renewed each time tokens refresh). */
    refreshExpiresAt: string;
    /**
     * The company's own item that work lines are billed with; null means PayApps' default
     * ("Contract Billing" under "Contract Income", created on the first send).
     */
    invoiceItem: { id: string; name: string } | null;
    /** Payments go to QuickBooks as they are recorded (admin's opt-in, off by default). */
    autoSendPayments: boolean;
  } | null;
}

/**
 * What happened to a payment just recorded when the company sends payments to QuickBooks
 * automatically. Absent or null: nothing was tried (off, not connected, or the application's
 * invoice is not in QuickBooks). `sent: false` carries the reason; the payment is recorded anyway.
 */
export interface QuickBooksAutoSendDto {
  sent: boolean;
  message: string | null;
}

/** An item in the connected QuickBooks company that a pay application's work can be billed with. */
export interface QuickBooksItemDto {
  id: string;
  name: string;
  type: string;
  /** The income account the item posts to, when QuickBooks names it. */
  incomeAccountName: string | null;
}

export interface QuickBooksItemsDto {
  items: QuickBooksItemDto[];
  /** The item chosen now (null: the default), as stored. */
  current: { id: string; name: string } | null;
  /** The name of the item used when none is chosen. */
  defaultItemName: string;
  defaultAccountName: string;
  /**
   * Every job (the sample left out) and the item its work lines are billed with when it differs
   * from the company's (null: the company's), for this QuickBooks company only.
   */
  jobs: QuickBooksJobItemDto[];
}

/** One job's own QuickBooks item (docs/QUICKBOOKS.md, "An item per job"). */
export interface QuickBooksJobItemDto {
  projectId: string;
  name: string;
  number: string | null;
  status: "active" | "closed";
  item: { id: string; name: string } | null;
  /** How many of its schedule-of-values lines have their own item in this QuickBooks company. */
  linesWithOwnItem: number;
}

/**
 * One job's schedule-of-values lines and the item each one's work is billed with when it differs
 * from the job's and the company's (docs/QUICKBOOKS.md, "An item per line").
 */
export interface QuickBooksLineItemsDto {
  projectId: string;
  name: string;
  number: string | null;
  /** The item a line without its own is billed with: the job's, else the company's, else the default. */
  fallbackItemName: string;
  items: QuickBooksItemDto[];
  lines: QuickBooksLineItemDto[];
}

export interface QuickBooksLineItemDto {
  sovLineId: string;
  itemNumber: string;
  description: string;
  item: { id: string; name: string } | null;
}

export interface QuickBooksInvoiceLineDto {
  kind: "work" | "retainage_held" | "retainage_released";
  /** The schedule-of-values line for a work line; null for the retainage line. */
  sovLineId: string | null;
  description: string;
  amountCents: number;
  /** The QuickBooks item a work line is billed with (its line's own, else the job's or company's); null for retainage. */
  itemName?: string | null;
}

/** One pay application's QuickBooks state: what was sent, or what would be sent. */
export interface PayAppQuickBooksDto {
  status: QuickBooksStatusDto;
  sent: {
    invoiceId: string;
    docNumber: string;
    totalCents: number;
    lineCount: number;
    sentAt: string;
    realmId: string;
  } | null;
  /** The invoice this application would become (null for a draft or when it cannot be billed). */
  preview: {
    docNumber: string;
    customerName: string;
    /** The QuickBooks item the work lines are billed with (the retainage line uses "Retainage"). */
    workItemName: string;
    lines: QuickBooksInvoiceLineDto[];
    totalCents: number;
    /** The invoice's billing email (QuickBooks BillEmail): the job's GC billing contact. */
    billEmail: string | null;
    /** Why there is no billing email (none on the job, or one QuickBooks would refuse). */
    billEmailNote: string | null;
  } | null;
  /** Why there is no preview (draft, nothing to bill, negative line 8). */
  previewProblem: string | null;
  /** Payments received on this application and whether each is in QuickBooks yet. */
  payments: QuickBooksPaymentDto[];
  /** The balance closed short, and whether it is a credit memo in QuickBooks yet; null when none. */
  shortCredit: QuickBooksShortCreditDto | null;
}

/** A balance closed short as a QuickBooks credit memo (docs/QUICKBOOKS.md, "Balance closed short"). */
export interface QuickBooksShortCreditDto {
  cents: number;
  reason: ShortCloseReason;
  closedOn: string;
  /** Null until sent (or marked as already entered in QuickBooks by hand). */
  sent: {
    creditMemoId: string | null;
    docNumber: string | null;
    byHand: boolean;
    /**
     * False when QuickBooks applied the credit to another invoice of the GC on its own (the
     * company's "Automatically apply credits" setting): the bookkeeper moves it there.
     */
    applied: boolean;
    sentAt: string;
  } | null;
  /** Why it cannot be sent yet (a payment on the application not in QuickBooks), or null. */
  waitingFor: string | null;
}

/** One payment received, as QuickBooks sees it (docs/QUICKBOOKS.md, "Payments received"). */
export interface QuickBooksPaymentDto {
  paymentId: string;
  amountCents: number;
  receivedOn: string;
  reference: string | null;
  /** Null until sent (or marked as already entered in QuickBooks by hand). */
  sent: {
    /** The QuickBooks payment id; null when it was entered in QuickBooks by hand. */
    qboPaymentId: string | null;
    byHand: boolean;
    sentAt: string;
  } | null;
}

/** Answer of POST .../pay-apps/:payAppId/retainage-release (preview, or applied with `detail`). */
export interface RetainageReleaseDto {
  plan: ReleasePlan;
  applied: boolean;
  detail?: PayAppDetailDto;
}

/** One entry in a pay application's history (src/shared/pay-app-history.ts). */
/** One change to a job outside its pay applications (src/shared/job-history.ts). */
export interface JobEventDto {
  id: string;
  action: JobEventAction;
  subjectId: string | null;
  data: JobEventData;
  /** The sentence the history shows. */
  text: string;
  /** Who did it; null when that user's account was deleted. */
  actor: { name: string; email: string } | null;
  at: string;
}

export interface PayAppEventDto {
  id: string;
  payAppId: string;
  payAppNumber: number;
  action: PayAppEventAction;
  data: PayAppEventData;
  /** The sentence the history shows. */
  text: string;
  /** Who did it; null when that user's account was deleted. */
  actor: { name: string; email: string } | null;
  at: string;
}

/**
 * A payment recorded on an application whose invoice is in QuickBooks, but not itself sent there
 * (or marked as entered by hand): a refused automatic send, or one never sent. Listed on the cash
 * report so it can be sent from there (docs/QUICKBOOKS.md, "Not yet in QuickBooks").
 */
export interface UnsentQuickBooksPaymentDto {
  paymentId: string;
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  payAppId: string;
  payAppNumber: number;
  docNumber: string;
  amountCents: number;
  receivedOn: string;
  reference: string | null;
  /** The invoice is in another QuickBooks company than the one connected now: enter it by hand. */
  otherCompany: boolean;
}

export interface UnsentQuickBooksPaymentsDto {
  status: QuickBooksStatusDto;
  payments: UnsentQuickBooksPaymentDto[];
}

/** GET/PUT /api/orgs/:orgId/getting-started/reminders: the member's own reminder emails. */
export interface ReminderSettingDto {
  /** The getting-started reminders go to owners only; false means this member gets none anyway. */
  sentToRole: boolean;
  /** Not stopped (by this switch or the email's link). */
  on: boolean;
}
