// Response DTOs. Timestamps are ISO strings; money integer cents; percentages basis points.
import type {
  CaNoticeMethod,
  CaNoticeRecipient,
  FlNoticeRecipient,
  FlServedBasis,
  FlServiceMethod,
  TxNoticeMethod,
  TxProjectKind,
} from "@lien-waivers";
import type {
  CloseoutKind,
  CloseoutReadiness,
  CloseoutStatus,
  CloseoutSummary,
  RetainagePosition,
} from "../closeout";
import type { CompanyDocumentKind, CompanyDocumentStatus } from "../company-documents";
import type { CostTypeReport, CostTypeSplit } from "../cost-type-budget";
import type { CrewLine, DailyReportSummary } from "../daily-reports";
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
import type { Alternates, BidItemTotal, EstimateStatus, EstimateTotals } from "../estimate";
import type { GaWaiverClock } from "../ga-waiver-clock";
import type { ProcoreSsovPlacement } from "../gc-export/procore-placement";
import type { CertificateHolder, InsuranceKind, InsuranceStatus } from "../insurance";
import type { InsuranceRequirement, RequirementCheck } from "../insurance-requirements";
import type { CommitmentKind, CostCategory, JobCostReport } from "../job-cost";
import type { JobEventAction, JobEventData } from "../job-history";
import type { LegalStatusDto } from "../legal";
import type { LowerTierPartyKind, LowerTierStatus, LowerTierSummary } from "../lower-tier-waivers";
import type { PayAppEventAction, PayAppEventData } from "../pay-app-history";
import type { ComputedApplication, Warning } from "../payapp-math";
import type { PunchListSummary, PunchSource, PunchStatus } from "../punch-list";
import type { ReleasePlan } from "../retainage-release";
import type { RfiImpact, RfiLogSummary, RfiStatus } from "../rfi";
import type {
  ActivityStatus,
  CrewLookaheadGroup,
  LookaheadWindow,
  ScheduleSummary,
} from "../schedule";
import type { DelayLog } from "../schedule-delays";
import type { SubmittalAction, SubmittalType } from "../submittals";
import type {
  TmEquipmentLine,
  TmLaborLine,
  TmMaterialLine,
  TmPricing,
  TmRateSheet,
  TmRates,
  TmTicketStage,
  TmTicketSummary,
} from "../tm-tickets";
import type { TxNoticeClaim } from "../tx-notice-claims";
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
  /** Unit-price lines (src/shared/unit-price.ts): all null on a lump-sum line. */
  unit: string | null;
  unitPriceMicros: number | null;
  /** Original contract quantity, thousandths (base lines). */
  quantityMilli: number | null;
}

/** One unit-price line's quantities on one application (pay-app page, CSV and PDF). */
export interface LineQuantityDto {
  unit: string;
  unitPriceMicros: number;
  /** Original contract quantity, thousandths; null when the line has none (a change-order line). */
  contractQuantityMilli: number | null;
  /** Quantity entered on this application; null when its work (if any) was entered in dollars. */
  thisPeriodMilli: number | null;
  /** Through this application. */
  toDateMilli: number;
  /** False when some work to date was entered in dollars and converted back at the unit price. */
  exact: boolean;
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

export interface RfiDto {
  id: string;
  number: number;
  subject: string;
  question: string;
  suggestion: string | null;
  reference: string | null;
  sentOn: string | null;
  responseDueOn: string | null;
  answeredOn: string | null;
  answer: string | null;
  answeredBy: string | null;
  costImpact: RfiImpact | null;
  timeImpact: RfiImpact | null;
  changeOrderId: string | null;
  /** Number of the linked change order, for display; null when none is linked. */
  changeOrderNumber: string | null;
  /** Computed for today (src/shared/rfi.ts). */
  status: RfiStatus;
  daysOutstanding: number | null;
  daysOverdue: number;
  needsChangeOrder: boolean;
  /** Files kept with the RFI (marked-up sheets, photos, the response). */
  fileCount: number;
}

export interface PunchItemDto {
  id: string;
  number: number;
  description: string;
  location: string | null;
  source: PunchSource | null;
  listedOn: string | null;
  dueOn: string | null;
  completedOn: string | null;
  completedBy: string | null;
  acceptedOn: string | null;
  acceptedBy: string | null;
  disputeNote: string | null;
  /** Computed for today (src/shared/punch-list.ts). */
  status: PunchStatus;
  daysOverdue: number;
}

export interface LowerTierWaiverDto {
  id: string;
  payAppId: string;
  party: string;
  partyKind: LowerTierPartyKind | null;
  /** Where the request goes; null: not entered (the draft then opens unaddressed). */
  partyEmail: string | null;
  kind: WaiverKind;
  throughDate: string | null;
  amountCents: number | null;
  requestedOn: string | null;
  receivedOn: string | null;
  note: string | null;
  status: LowerTierStatus;
  /** Days since the request while it is still out; null when received or never asked. */
  daysWaiting: number | null;
  /**
   * The signed waiver's file(s), filed on this row: pay-application attachments (so they go in the
   * backup packet), downloaded at .../pay-apps/:payAppId/attachments/:id. Oldest first.
   */
  files: { id: string; fileName: string; contentType: string; sizeBytes: number }[];
}

/** GET .../lower-tier-waivers?payAppId=: one application's list, or every application's on the job. */
export interface LowerTierWaiversDto {
  items: LowerTierWaiverDto[];
  /** Per pay app id, for the items returned. */
  summaries: Record<string, LowerTierSummary>;
  /** The parties on the latest earlier application's list, for the suggestions; [] without payAppId. */
  previous: { party: string; partyKind: LowerTierPartyKind | null }[];
  /**
   * The email address last saved for each party on any of the company's lower-tier rows, keyed by
   * lowerTierPartyKey: a supplier's AP address is the same on every job, so a new row and a row
   * without its own address open the request draft addressed to it.
   */
  partyEmails: Record<string, string>;
  /** Whether the org's plan lets members change the list (Crew and up, with lien waivers). */
  canEdit: boolean;
  today: string;
}

export interface PunchListDto {
  items: PunchItemDto[];
  summary: PunchListSummary;
  /** The number the next new item gets. */
  nextNumber: number;
  today: string;
}

export interface ScheduleActivityDto {
  id: string;
  number: number;
  name: string;
  trade: string | null;
  startOn: string;
  finishOn: string;
  percentComplete: number;
  predecessorNumber: number | null;
  lagDays: number;
  notes: string | null;
  /** The P6 activity ID it was imported from (src/shared/schedule-xer.ts); null: typed. */
  sourceCode: string | null;
  /** Computed for today (src/shared/schedule.ts). */
  status: ActivityStatus;
  /** Workdays from start to finish, both counted. */
  workdays: number;
  /** The first day it can start after its predecessor; null without one. */
  earliestStart: string | null;
  /** Starts before its predecessor finishes, or waits for one not on the schedule; null: fine. */
  sequenceProblem: string | null;
  inLookahead: boolean;
}

export interface ScheduleDto {
  activities: ScheduleActivityDto[];
  summary: ScheduleSummary;
  lookahead: LookaheadWindow;
  nextNumber: number;
  today: string;
  /** Every holiday the company lists, in date order: the workday math left them out. */
  holidays: CompanyHolidayDto[];
}

/** One of the company's holidays (GET /api/orgs/:orgId/schedule/holidays). */
export interface CompanyHolidayDto {
  id: string;
  on: string;
  name: string;
}

export interface CompanyHolidaysDto {
  holidays: CompanyHolidayDto[];
  /** MAX_COMPANY_HOLIDAYS. */
  max: number;
}

/** GET /api/orgs/:orgId/schedule/crews: every active job's open work in the window, by crew. */
export interface CrewLookaheadDto {
  groups: CrewLookaheadGroup[];
  lookahead: LookaheadWindow;
  /** Active jobs with at least one activity in the window. */
  jobCount: number;
  /** More open activities than the page lists (MAX_CREW_LOOKAHEAD_ROWS); the earliest are shown. */
  truncated: boolean;
  today: string;
}

/** POST .../schedule/:activityId/shift: the schedule after the move, and what was and was not moved. */
/** POST .../schedule/import: the schedule after the import, and what it added and updated. */
export interface ScheduleImportDto {
  schedule: ScheduleDto;
  added: number;
  updated: number;
}

export interface ScheduleShiftDto {
  schedule: ScheduleDto;
  moved: number[];
  skippedDone: number[];
}

export interface CloseoutItemDto {
  id: string;
  kind: CloseoutKind;
  title: string;
  requiredBy: string | null;
  dueOn: string | null;
  sentOn: string | null;
  acceptedOn: string | null;
  acceptedBy: string | null;
  waivedNote: string | null;
  note: string | null;
  /** Computed for today (src/shared/closeout.ts). */
  status: CloseoutStatus;
  daysOverdue: number;
  /** Files kept with the document (services/payapps/closeout-files.ts). */
  files: number;
}

export interface CloseoutDto {
  items: CloseoutItemDto[];
  summary: CloseoutSummary;
  /** The job's punch list counts, read with the checklist for the retainage check. */
  punch: PunchListSummary;
  retainage: RetainagePosition;
  readiness: CloseoutReadiness;
  today: string;
}

export interface RfiLogDto {
  items: RfiDto[];
  summary: RfiLogSummary;
  /** The number the next new RFI gets. */
  nextNumber: number;
  today: string;
}

export interface EstimateLineDto {
  id: string;
  bidItem: string;
  category: CostCategory;
  description: string;
  quantityMilli: number;
  unit: string | null;
  unitCostMicros: number;
  /** quantity × unit cost, in cents. */
  costCents: number;
}

export interface EstimateSummaryDto {
  id: string;
  number: number;
  label: string;
  name: string;
  gcName: string;
  gcContactName: string | null;
  gcContactEmail: string | null;
  location: string | null;
  bidDueOn: string | null;
  sentOn: string | null;
  decidedOn: string | null;
  status: EstimateStatus;
  validDays: number;
  markupBps: Record<CostCategory, number>;
  materialTaxBps: number;
  inclusions: string | null;
  exclusions: string | null;
  notes: string | null;
  projectId: string | null;
  totals: EstimateTotals;
  bidItemCount: number;
  lineCount: number;
}

export interface EstimateDetailDto extends EstimateSummaryDto {
  lines: EstimateLineDto[];
  bidItems: BidItemTotal[];
  /** Why it cannot be marked won yet ([] when it can). */
  winProblems: string[];
  /** Whether winning also sets the job's cost budgets (job costing is Crew and up). */
  budgetsOnWin: boolean;
  /** Bid item key to add/deduct alternate (shared/estimate.ts `Alternates`). */
  alternates: Alternates;
  /** Won: the keys of the alternates the GC accepted; [] otherwise. */
  acceptedAlternates: string[];
}

export interface EstimateListDto {
  items: EstimateSummaryDto[];
  /** Totals of the open (draft and sent) estimates, and the hit rate of the decided ones. */
  pipeline: { openCount: number; openPriceCents: number; wonCount: number; lostCount: number };
  nextNumber: number;
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
    {
      workThisPeriodCents: number;
      storedMaterialsCents: number;
      retainageReleasedCents: number;
      quantityThisPeriodMilli: number | null;
    }
  >;
  /** Quantities of the unit-price lines, keyed by SOV line id (empty when the job has none). */
  quantities: Record<string, LineQuantityDto>;
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
  /** Florida only (state=FL): the notices recorded as served and the 45/40-day dates. */
  fl: FlNoticeLogDto | null;
  /** Texas only (state=TX): residential or not, and each unpaid application's § 53.056 date. */
  tx: TxNoticeLogDto | null;
}

/** Texas notices of claim on one job (services/payapps/tx-notices.ts). */
export interface TxNoticeLogDto {
  /** Null: not turned on for this job, so no dates and no reminder. */
  kind: TxProjectKind | null;
  kinds: { id: TxProjectKind; label: string }[];
  methods: { id: TxNoticeMethod; label: string }[];
  /** Unpaid submitted or certified applications with their dates, earliest first; empty when off. */
  claims: TxNoticeClaim[];
}

/** A Florida Notice to Owner, or a copy, recorded as served on one person. */
export interface FlNoticeSendDto {
  id: string;
  recipient: FlNoticeRecipient;
  recipientNameAddress: string;
  method: FlServiceMethod;
  sentOn: string;
  deliveredOn: string | null;
  tracking: string | null;
  /** When it counts as served (§ 713.18); null without a first day, or when a delivery date is needed. */
  servedOn: string | null;
  basis: FlServedBasis | null;
  /** Against the 45 days (§ 713.06(2)(a)); null when unknown. */
  onTime: boolean | null;
  /** One line on how it counts, from the package; null without a first day. */
  timing: string | null;
}

export interface FlNoticeLogDto {
  firstFurnishedOn: string | null;
  /** First day plus 45 calendar days (§ 713.06(2)(a)), or null. */
  serveBy: string | null;
  /** First day plus 40 calendar days (§ 713.18(2)(b)), or null. */
  mailBy: string | null;
  sends: FlNoticeSendDto[];
  /** Recipients the reminder waits on (the owner) with no notice recorded yet. */
  missing: FlNoticeRecipient[];
  methods: { id: FlServiceMethod; label: string }[];
  recipients: { id: FlNoticeRecipient; label: string }[];
  /** Name and address the job already holds for each recipient. */
  recipientPrefill: Partial<Record<FlNoticeRecipient, string>>;
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

/** A QuickBooks class or location (department), active in the connected company. */
export interface QuickBooksTrackingCategoryDto {
  id: string;
  name: string;
  /** With its parents, "New work:Tenant improvements". */
  fullName: string;
}

/**
 * Class and location per job (docs/QUICKBOOKS.md, "Class and location per job"), for companies on
 * QuickBooks Plus or Advanced that track them. Read live from the connected company.
 */
export interface QuickBooksTrackingDto {
  /** How the company tracks classes: off, one per transaction, or one per line. */
  classTracking: "off" | "per-transaction" | "per-line";
  locationTracking: boolean;
  /** What the company calls locations ("Location" unless it renamed them, e.g. "Division"). */
  locationLabel: string;
  /** Empty while that kind of tracking is off. */
  classes: QuickBooksTrackingCategoryDto[];
  locations: QuickBooksTrackingCategoryDto[];
  /** Every job (the sample left out, closed jobs last) and its class and location, if any. */
  jobs: QuickBooksJobTrackingDto[];
}

export interface QuickBooksJobTrackingDto {
  projectId: string;
  name: string;
  number: string | null;
  status: "active" | "closed";
  /** As stored for this QuickBooks company (null: none). */
  class: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
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
    /**
     * The job's QuickBooks class and location, as chosen on the QuickBooks page (null: none). Sent
     * only while the company tracks them; a class goes on every line or on the invoice, as the
     * company's setting says.
     */
    className?: string | null;
    locationName?: string | null;
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

export interface InsuranceCertificateDto {
  id: string;
  kind: InsuranceKind;
  label: string | null;
  carrier: string | null;
  policyNumber: string | null;
  effectiveOn: string | null;
  expiresOn: string;
  notes: string | null;
  archived: boolean;
  /** certificateName() of it. */
  name: string;
  /** On the server's today (UTC); archived certificates still get one. */
  status: InsuranceStatus;
  daysLeft: number;
  updatedAt: string;
  /** The files kept with it (the certificate PDF, endorsements), newest first. */
  files: InsuranceFileDto[];
  /** The jobs whose GC holds it (certificate holders), by job name. */
  holders: CertificateHolder[];
  /** Limits in cents as typed from the certificate, null when not typed. */
  eachOccurrenceCents: number | null;
  aggregateCents: number | null;
  /** What the certificate shows (src/shared/insurance-requirements.ts). */
  additionalInsured: boolean;
  waiverOfSubrogation: boolean;
  primaryNoncontributory: boolean;
}

/** A company document: a license, the W-9, a bonding letter... (src/shared/company-documents.ts). */
export interface CompanyDocumentDto {
  id: string;
  kind: CompanyDocumentKind;
  label: string | null;
  issuer: string | null;
  jurisdiction: string | null;
  classification: string | null;
  /** Always null for a W-9 (its number is a taxpayer identification number, never stored). */
  number: string | null;
  effectiveOn: string | null;
  expiresOn: string | null;
  notes: string | null;
  archived: boolean;
  /** documentName() of it. */
  name: string;
  /** On the server's today (UTC); "no_expiry" when no expiry date is typed. */
  status: CompanyDocumentStatus;
  daysLeft: number | null;
  /** The files kept with it (the license card, the bonding letter PDF), newest first. */
  files: InsuranceFileDto[];
  updatedAt: string;
}

export interface CompanyDocumentListDto {
  /** Active first, then archived; each group by expiry date (no date last). */
  items: CompanyDocumentDto[];
  /** The server's today (UTC, YYYY-MM-DD) the statuses were computed on. */
  today: string;
}

/** GET/PUT /api/orgs/:orgId/insurance/requirements/:projectId. */
export interface JobInsuranceRequirementsDto {
  projectId: string;
  requirements: InsuranceRequirement[];
  /** The requirements checked against the certificates on file on `today`. */
  checks: RequirementCheck[];
  /** The server's today (UTC, YYYY-MM-DD). */
  today: string;
}

/** One file kept with an insurance certificate (the shape of every attachment list item). */
export interface InsuranceFileDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  category: "backup" | "photo" | "signed" | "other";
  createdAt: string;
}

export interface InsuranceListDto {
  /** Active first, then archived; each group by expiry date. */
  items: InsuranceCertificateDto[];
  /** The server's today (UTC, YYYY-MM-DD) the statuses were computed on. */
  today: string;
}

/** A cost entered on a job (services/payapps/job-cost.ts). */
export interface JobCostEntryDto {
  id: string;
  sovLineId: string | null;
  incurredOn: string;
  category: CostCategory;
  amountCents: number;
  vendor: string | null;
  description: string | null;
  reference: string | null;
  /** The purchase order or subcontract it is billed against. */
  commitmentId: string | null;
  /** Imported from a QuickBooks bill, check, card charge or vendor credit. */
  fromQuickBooks: boolean;
  createdAt: string;
}

/** A purchase order or lower-tier subcontract on a job, with its figures as of the report date. */
export interface JobCostCommitmentDto {
  id: string;
  sovLineId: string | null;
  kind: CommitmentKind;
  category: CostCategory;
  vendor: string;
  reference: string | null;
  description: string | null;
  committedOn: string;
  amountCents: number;
  /** Costs entered against it, through the report date. */
  invoicedCents: number;
  /** Still to be invoiced (0 when over-invoiced or dated after the report date). */
  openCents: number;
  overInvoicedCents: number;
  afterAsOf: boolean;
  /** Imported from a QuickBooks purchase order. */
  fromQuickBooks: boolean;
  createdAt: string;
}

/** GET /api/orgs/:orgId/projects/:projectId/job-cost */
export interface JobCostDto {
  projectId: string;
  projectName: string;
  /** The sent application billing is read from (latest not in draft); null before the first. */
  billedThrough: { payAppId: string; number: number; periodTo: string } | null;
  report: JobCostReport;
  entries: JobCostEntryDto[];
  /** Purchase orders and subcontracts, by date. */
  commitments: JobCostCommitmentDto[];
  /** Whether the org's plan lets members change budgets and costs (Crew and up). */
  canEdit: boolean;
  /** Each line's budget by cost type against its costs by type (src/shared/cost-type-budget.ts). */
  costTypes: CostTypeReport;
  /** The saved split per line (sovLineId to cents by type), for the edit form. */
  costTypeSplits: Record<string, CostTypeSplit>;
}

/** One job's row on the org's WIP schedule. */
export interface WipRowDto {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  billedThrough: { number: number; periodTo: string } | null;
  totals: JobCostReport["totals"];
  missingBudgets: number;
  overBudgetLines: number;
}

/** GET /api/orgs/:orgId/reports/wip: active jobs (sample job left out). */
export interface WipReportDto {
  asOf: string;
  rows: WipRowDto[];
  /** Sums of the rows whose estimate is complete. */
  totals: {
    contractCents: number;
    billedToDateCents: number;
    costToDateCents: number;
    earnedRevenueCents: number;
    overBilledCents: number;
    underBilledCents: number;
    projectedGrossProfitCents: number;
  };
  /** Jobs left out of the totals because a budget is missing. */
  incompleteJobs: number;
  canEdit: boolean;
}

/** A job's link to QuickBooks for reading its costs (GET .../job-cost/quickbooks). */
export interface JobCostQuickBooksDto {
  /** True when costs can be read: QuickBooks available, on the plan, connected, not the sample job. */
  available: boolean;
  /** Why not, when `available` is false. */
  reason: string | null;
  /**
   * What this job's costs are tagged to in the connected company: a customer or job, or a class
   * (a company that tracks jobs by class). `name` is the full name ("Parent:Child").
   */
  link: JobCostQboLinkDto | null;
}

export interface JobCostQboLinkDto {
  by: "customer" | "class";
  id: string;
  name: string;
}

/** A QuickBooks class a job can be linked to. */
export interface JobCostQboClassDto {
  id: string;
  /** "Parent:Child" for a sub-class. */
  name: string;
}

/** A QuickBooks customer or job (sub-customer) a job can be linked to. */
export interface JobCostQboCustomerDto {
  id: string;
  /** "Customer:Job" for a job under a customer. */
  name: string;
}

/** One QuickBooks expense line tagged to the job's customer or class, as read now. */
export interface JobCostQboLineDto {
  source: string;
  txnType: "Bill" | "Purchase" | "VendorCredit" | "JournalEntry";
  /** "Bill", "Check", "Card", "Card credit", "Cash", "Vendor credit", "Journal entry". */
  label: string;
  txnDate: string;
  docNumber: string | null;
  vendor: string | null;
  account: string | null;
  description: string | null;
  /** Signed: credits are negative. */
  amountCents: number;
  /** Made from a QuickBooks purchase order: counted against it once that order is imported. */
  fromPurchaseOrder: boolean;
  suggestedCategory: CostCategory;
  /** Set when the line is already a cost in PayApps. */
  imported: {
    entryId: string;
    projectId: string;
    /** False when it was imported into another job (both linked to the same customer or class). */
    thisJob: boolean;
    /** The cost's amount in PayApps, which differs from `amountCents` if the bill changed since. */
    amountCents: number;
  } | null;
}

export interface JobCostQboLinesDto {
  from: string;
  to: string;
  /** What was read: the linked customer or job, or the linked class. */
  link: JobCostQboLinkDto;
  lines: JobCostQboLineDto[];
  /** QuickBooks had more transactions in the window than one read takes; narrow the dates. */
  truncated: boolean;
}

/** One QuickBooks purchase-order line tagged to the job's customer or class: a commitment to import. */
export interface JobCostQboPoLineDto {
  source: string;
  txnDate: string;
  /** The PO number. */
  docNumber: string | null;
  vendor: string | null;
  account: string | null;
  description: string | null;
  amountCents: number;
  /** "Open", "Closed" (fully billed, or closed by hand when `manuallyClosed`), or null if unknown. */
  status: "Open" | "Closed" | null;
  manuallyClosed: boolean;
  suggestedCategory: CostCategory;
  /** Set when the line is already a commitment in PayApps. */
  imported: {
    commitmentId: string;
    projectId: string;
    thisJob: boolean;
    /** The commitment's amount in PayApps, which differs if the order changed since. */
    amountCents: number;
  } | null;
}

export interface JobCostQboPoLinesDto {
  from: string;
  to: string;
  link: JobCostQboLinkDto;
  lines: JobCostQboPoLineDto[];
  truncated: boolean;
}

/** One revision on a job's submittal log (src/shared/submittals.ts). */
export interface SubmittalDto {
  id: string;
  number: number;
  revision: number;
  specSection: string | null;
  title: string;
  type: SubmittalType;
  gcReference: string | null;
  submittedOn: string | null;
  requiredBy: string | null;
  returnedOn: string | null;
  action: SubmittalAction | null;
  neededOnSite: string | null;
  leadTimeDays: number | null;
  reviewDays: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET .../submittals: every revision, by number then revision. */
export interface SubmittalLogDto {
  projectName: string;
  gcName: string;
  items: SubmittalDto[];
  nextNumber: number;
  /** Editors and up add and change submittals; viewers read. */
  canEdit: boolean;
}

/** A daily report (field log) on a job (src/shared/daily-reports.ts). */
export interface DailyReportDto {
  id: string;
  reportDate: string;
  weather: string | null;
  tempHighF: number | null;
  tempLowF: number | null;
  delayHours: number | null;
  crew: CrewLine[];
  workPerformed: string | null;
  delays: string | null;
  /** The schedule activity the day's delay held up (src/shared/schedule-delays.ts); null: none. */
  delayActivityId: string | null;
  /** "A-003 Rough-in, level 2"; null when none is named. */
  delayActivityLabel: string | null;
  equipment: string | null;
  deliveries: string | null;
  visitors: string | null;
  safety: string | null;
  notes: string | null;
  /** Workers on site and their hours, from the crew lines. */
  workers: number;
  manHours: number;
  /** Photos and files kept with the report (services/payapps/daily-report-files.ts). */
  fileCount: number;
  /** Who wrote it and who changed it last (display names; null once the user is removed). */
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyReportLogDto {
  projectName: string;
  gcName: string;
  /** Newest first. */
  items: DailyReportDto[];
  summary: DailyReportSummary;
  /** The job's schedule activities, by number, for "the activity the delay held up". */
  activities: { id: string; label: string }[];
  /** The date a new report starts on (today, or the latest weekday without one). */
  suggestedDate: string;
  /** The last date a report may carry (tomorrow in UTC, for contractors west of it). */
  latestDate: string;
  /** Editors and up write reports; viewers read. */
  canEdit: boolean;
}

/** The job's delay log (src/shared/schedule-delays.ts): GET .../schedule/delays. */
export interface DelayLogDto extends DelayLog {
  projectName: string;
  /** The job's activities, by number, to pick one log from. */
  activities: { id: string; label: string }[];
  /** Editors and up attach the log to a change order. */
  canEdit: boolean;
}

/** A T&M ticket on a job (src/shared/tm-tickets.ts). */
export interface TmTicketDto {
  id: string;
  number: number;
  workDate: string;
  description: string;
  location: string | null;
  directedBy: string | null;
  reference: string | null;
  labor: TmLaborLine[];
  material: TmMaterialLine[];
  equipment: TmEquipmentLine[];
  laborMarkupBps: number;
  materialMarkupBps: number;
  equipmentMarkupBps: number;
  notes: string | null;
  pricing: TmPricing;
  signedName: string | null;
  signedTitle: string | null;
  signedOn: string | null;
  /** A drawn signature is kept (GET .../signature.jpg); false when signed on paper or unsigned. */
  hasSignatureImage: boolean;
  changeOrderId: string | null;
  changeOrderNumber: string | null;
  stage: TmTicketStage;
  /** Photos and files kept with the ticket (services/payapps/tm-ticket-files.ts). */
  fileCount: number;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TmRateSheetDto extends TmRateSheet {
  updatedByName: string | null;
  updatedAt: string;
}

export interface TmTicketLogDto {
  projectName: string;
  gcName: string;
  /** Newest work first (then the higher number). */
  items: TmTicketDto[];
  summary: TmTicketSummary;
  nextNumber: number;
  /** The last date a ticket may carry (tomorrow in UTC, for contractors west of it). */
  latestDate: string;
  /** Rates for blank lines: the rate sheet's, then the latest ticket's for names not on it. */
  rates: TmRates;
  /** The job's rate sheet, or null when none is saved. */
  rateSheet: TmRateSheetDto | null;
  /** A first draft of the sheet from the rates on this job's tickets (null with no priced line). */
  rateSheetDraft: TmRateSheet | null;
  /** The job's schedule-of-values lines, for the change order the tickets go on. */
  sovLines: { id: string; itemNumber: string; description: string }[];
  /** A change order number not yet used on the job ("CO-4" after "CO-3"), as a starting point. */
  suggestedChangeOrderNumber: string;
  /** Editors and up write tickets; viewers read. */
  canEdit: boolean;
}

/** A price-list item (src/shared/price-list.ts). */
export interface PriceItemDto {
  id: string;
  category: CostCategory;
  code: string | null;
  description: string;
  unit: string | null;
  unitCostMicros: number;
  note: string | null;
  /** ISO timestamp: when its price was last set. */
  updatedAt: string;
}

export interface PriceListDto {
  items: PriceItemDto[];
  /** Items one company may keep. */
  limit: number;
}

/** What a merge (an estimate's lines or a supplier's sheet saved to the list) did. */
export interface PriceMergeDto {
  added: number;
  updated: number;
  unchanged: number;
  /** Descriptions given more than once at different costs; the last was kept. */
  conflicts: string[];
  list: PriceListDto;
}

// ---- Crew timesheets ----

export interface CrewMemberDto {
  id: string;
  name: string;
  trade: string | null;
  rateCents: number | null;
  active: boolean;
  /** Has hours on a timesheet: deactivate instead of deleting. */
  hasHours: boolean;
}

export interface CrewDto {
  members: CrewMemberDto[];
  weekStartDay: number;
  /** The start day can change only while no hours are entered. */
  weekStartLocked: boolean;
  limit: number;
}

export interface TimesheetJobDto {
  id: string;
  name: string;
  number: string | null;
  status: "active" | "closed";
  lines: { id: string; itemNumber: string; description: string }[];
}

export interface TimesheetRowDto {
  workerId: string;
  projectId: string;
  sovLineId: string | null;
  hours: number[];
  regular: number;
  overtime: number;
  wagesCents: number | null;
}

export interface TimesheetWorkerDto {
  workerId: string;
  name: string;
  trade: string | null;
  rateCents: number | null;
  byDay: number[];
  total: number;
  regular: number;
  overtime: number;
  regularPayCents: number | null;
  overtimePayCents: number | null;
  grossCents: number | null;
  projectIds: string[];
}

/** One job and line's labor for the week, and whether it is on the job's costs already. */
export interface TimesheetLaborDto {
  projectId: string;
  projectName: string;
  sovLineId: string | null;
  itemNumber: string | null;
  hours: number;
  overtime: number;
  workers: number;
  wagesCents: number;
  reference: string;
  /** The job-cost amount posted under this reference; null when not posted. */
  postedCents: number | null;
}

export interface TimesheetWeekDto {
  weekStart: string;
  weekEnding: string;
  days: string[];
  weekStartDay: number;
  crew: CrewMemberDto[];
  jobs: TimesheetJobDto[];
  rows: TimesheetRowDto[];
  workers: TimesheetWorkerDto[];
  totals: { hours: number; regular: number; overtime: number; grossCents: number };
  unrated: string[];
  problems: string[];
  /** Wages per job and line (before burden), with what is posted. */
  labor: TimesheetLaborDto[];
  note: string;
}

export interface TimesheetPostDto {
  added: number;
  skipped: number;
  jobs: { projectId: string; projectName: string; added: number; skipped: number }[];
  week: TimesheetWeekDto;
}
