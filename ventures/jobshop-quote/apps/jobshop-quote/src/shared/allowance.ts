// The monthly RFQ allowance thresholds, shared by the worker's allowance emails
// (services/allowance-notice.ts, owners and admins) and the in-app banner on the RFQ page (every
// member, client/routes/rfqs.tsx), so both say "80%" at the same count.
import type { BillingDto } from "./api";

export const NOTICE_THRESHOLDS = [80, 100] as const;
export type NoticeThreshold = (typeof NOTICE_THRESHOLDS)[number];

/** RFQs used at which a threshold is reached: 80% of 40 is 32, of 125 is 100, of 300 is 240. */
export const thresholdCount = (allowance: number, threshold: NoticeThreshold) =>
  Math.ceil((allowance * threshold) / 100);

/** The highest threshold `used` has reached, or null below 80%. */
export function reachedThreshold(used: number, allowance: number): NoticeThreshold | null {
  if (allowance <= 0) return null;
  let hit: NoticeThreshold | null = null;
  for (const t of NOTICE_THRESHOLDS) if (used >= thresholdCount(allowance, t)) hit = t;
  return hit;
}

export interface AllowanceBanner {
  threshold: NoticeThreshold;
  /** One or two sentences of facts: the counts, the reset date and what still works. */
  text: string;
  /** What the reader can do about it, worded for their role. */
  action: string;
  /** Admins get a link to the billing page; members are told who can change the plan. */
  linkToBilling: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The RFQ page's allowance banner, or null below 80% or on a plan with no allowance. Facts come
 * only from the billing summary: no prices, and while checkout is dark nobody is told to upgrade.
 */
export function allowanceBanner(b: BillingDto, admin: boolean): AllowanceBanner | null {
  const allowance = b.limits.rfqsPerMonth;
  if (allowance === null) return null;
  const used = b.usage.rfqsThisMonth;
  const threshold = reachedThreshold(used, allowance);
  if (threshold === null) return null;
  const left = Math.max(0, allowance - used);
  const resets = `The allowance resets on ${b.allowanceResetsOn} (UTC).`;
  const text =
    threshold === 100
      ? `This shop has used all ${allowance} AI-read RFQs on the ${b.plan.name} plan this month. New RFQs can still be entered by hand and quoted. ${resets}`
      : `This shop has used ${used} of ${allowance} AI-read RFQs on the ${b.plan.name} plan this month (${plural(left, "read")} left). ${resets}`;
  return { threshold, text, action: allowanceAction(b, admin), linkToBilling: admin };
}

/** What the reader can do about a full allowance, worded for their role; no upgrade while dark. */
function allowanceAction(b: BillingDto, admin: boolean): string {
  if (admin) {
    return b.checkoutAvailable
      ? "See plans with a larger allowance on the billing page."
      : "Larger plans are not on sale yet; see the billing page for usage.";
  }
  return b.checkoutAvailable
    ? "Ask an owner or admin of this shop if you need a larger plan."
    : "Ask an owner or admin of this shop if you expect to need more.";
}

export interface IntakeNote {
  /** What happens to an RFQ created now: saved, not read by the AI. */
  text: string;
  /** Same wording as the banner's action, so the two never disagree. */
  action: string;
  linkToBilling: boolean;
  /** The submit button's label: "Create and extract" would promise a read that cannot happen. */
  submitLabel: string;
}

/**
 * The note on the New RFQ form itself once the month's allowance is used (ROADMAP item 4), for
 * shops that miss the banner above the page. Null below 100% or on a plan with no allowance: at
 * 80% the banner is enough, and the form stays as it is. The RFQ is still created (the worker's
 * read answers 402 and nothing is counted), so the note says so instead of blocking the form.
 */
export function intakeNote(b: BillingDto, admin: boolean): IntakeNote | null {
  const banner = allowanceBanner(b, admin);
  if (banner?.threshold !== 100) return null;
  return {
    text: `All ${b.limits.rfqsPerMonth} AI-read RFQs on the ${b.plan.name} plan are used this month, so this RFQ will be saved but not read by the AI. Enter its parts by hand on the next page and quote them as usual. The allowance resets on ${b.allowanceResetsOn} (UTC).`,
    action: banner.action,
    linkToBilling: banner.linkToBilling,
    submitLabel: "Create RFQ (enter parts by hand)",
  };
}

export interface PackageNote {
  /**
   * "short": the package needs more RFQs than are left, so the read will answer 402 and count
   * nothing. "counts": it fits, but uses more than one RFQ, which the estimator may not expect.
   */
  kind: "short" | "counts";
  text: string;
  /** Only on "short": the banner's action line, word for word. */
  action: string | null;
  linkToBilling: boolean;
  /** Only on "short": the submit button must not promise a read that cannot happen. */
  submitLabel: string | null;
}

/**
 * The New RFQ form's note about the drawings picked (ROADMAP item 4, "this package needs N reads
 * and M are left"), from the pages counted in the browser (shared/upload-pages.ts) and the billing
 * summary. Null on a plan with no allowance, for a one-RFQ package, and once the month is used up
 * (`intakeNote` already says so). Like `intakeNote` it never blocks the form: the RFQ is saved
 * either way, and the worker's own count decides the read.
 */
export function packageNote(
  b: BillingDto,
  pkg: { pages: number; units: number },
  admin: boolean,
): PackageNote | null {
  const allowance = b.limits.rfqsPerMonth;
  if (allowance === null || pkg.units <= 1) return null;
  const left = Math.max(0, allowance - b.usage.rfqsThisMonth);
  if (left === 0) return null;
  const size = `These drawings come to ${plural(pkg.pages, "page")}, so the AI reading this RFQ uses ${pkg.units} of this month's AI-read RFQs (one per 10 drawing pages)`;
  if (pkg.units <= left) {
    return {
      kind: "counts",
      text: `${size}; ${left} ${left === 1 ? "is" : "are"} left on the ${b.plan.name} plan.`,
      action: null,
      linkToBilling: false,
      submitLabel: null,
    };
  }
  return {
    kind: "short",
    text: `${size}, and only ${left} ${left === 1 ? "is" : "are"} left on the ${b.plan.name} plan. This RFQ will be saved but not read by the AI: enter its parts by hand on the next page and quote them as usual, or attach only the drawings the quote needs. The allowance resets on ${b.allowanceResetsOn} (UTC).`,
    action: allowanceAction(b, admin),
    linkToBilling: admin,
    submitLabel: "Create RFQ (enter parts by hand)",
  };
}
