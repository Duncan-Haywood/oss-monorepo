export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Ordered from least to most privileged; used by requireRole(). */
export const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export const PAY_APP_STATUSES = ["draft", "submitted", "certified", "paid"] as const;
export type PayAppStatus = (typeof PAY_APP_STATUSES)[number];

export const CHANGE_ORDER_STATUSES = ["pending", "approved", "rejected"] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];

/** The four lien waiver kinds (same values as packages/lien-waivers WAIVER_KINDS). */
export const WAIVER_KINDS = [
  "conditional-progress",
  "unconditional-progress",
  "conditional-final",
  "unconditional-final",
] as const;
export type WaiverKind = (typeof WAIVER_KINDS)[number];

/** draft: prepared, not yet given to the customer; sent: delivered to the customer. */
export const WAIVER_STATUSES = ["draft", "sent"] as const;
export type WaiverStatus = (typeof WAIVER_STATUSES)[number];
/** How a Georgia affidavit of nonpayment's copy went to the owner (O.C.G.A. § 44-14-366(g)(2)). */
export const GA_COPY_METHODS = [
  "registered-mail",
  "certified-mail",
  "statutory-overnight",
] as const;
export type GaCopyMethod = (typeof GA_COPY_METHODS)[number];
/**
 * How the copy went to the contractor at the address on the notice of commencement. The affidavit
 * names the three methods above for the owner's copy only; the contractor's sentence names none.
 */
export const GA_CONTRACTOR_COPY_METHODS = [...GA_COPY_METHODS, "other"] as const;
export type GaContractorCopyMethod = (typeof GA_CONTRACTOR_COPY_METHODS)[number];
/**
 * Whether the affidavit's copy to the contractor is owed: "owed" when the filer has no contract with
 * the owner and a notice of commencement was filed for the improvement; "not-owed" otherwise.
 */
export const GA_CONTRACTOR_COPY = ["owed", "not-owed"] as const;
export type GaContractorCopy = (typeof GA_CONTRACTOR_COPY)[number];

/**
 * Why the unpaid balance of an application paid short was closed (src/shared/payments.ts):
 * backcharge: the GC deducted it for its own costs (cleanup, damage, work it did for you);
 * disputed: you still claim it, but it is out of the pay-app process (a claim, a negotiation);
 * written-off: you will not collect it.
 */
/**
 * What a job's pay terms count from: the application date ("net 30" on the invoice), the end of
 * the billing period ("30 days after the end of the month billed"), or the day the GC is paid by the
 * owner for the work (pay-when-paid: "within 7 days after Contractor receives payment from Owner"),
 * as subcontracts word it. Under "owner_paid" an application has no due date until that day is
 * recorded on it (pay_apps.owner_paid_on).
 */
export const PAY_TERMS_BASES = ["application_date", "period_end", "owner_paid"] as const;
export type PayTermsBasis = (typeof PAY_TERMS_BASES)[number];

export const SHORT_CLOSE_REASONS = ["backcharge", "disputed", "written-off"] as const;
export type ShortCloseReason = (typeof SHORT_CLOSE_REASONS)[number];
