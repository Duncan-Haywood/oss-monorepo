// Georgia's ninety days (O.C.G.A. § 44-14-366(g)(2)). Either Georgia statutory waiver waives "upon
// the receipt of the sum", and becomes conclusively effective at the earliest of the money arriving,
// a written acknowledgment of payment in full, or ninety days after the date it was signed, unless
// the claimant files an affidavit of nonpayment in the property's county first. So a sub that signs
// the waiver with the pay app and is not paid loses those lien and bond rights on day ninety. PayApps
// knows each waiver's amount, when it was marked sent, and the money recorded on its application, so
// it can say when the ninety days end and how much is still unpaid.
//
// Part 3 (2026-11-26): the user records the affidavit as filed (date and county, and later the copy
// mailed to the owner). Once filed before the ninety days end, the clock stops: (g)(5) suspends the
// waiver "until payment in full has been received", and what is left is the seven days to send the
// owner a copy, which the affidavit's own closing paragraph requires. Once the money covers the
// waiver after a filing, (g)(3) applies: on request, the claimant swears in recordable form that
// payment in full was received, which voids the affidavit once recorded. That affidavit has no
// statutory form, so PayApps only says so.
//
// Part 4 (2026-11-26): the affidavit's closing paragraph also sends a copy "TO THE CONTRACTOR AT THE
// ADDRESS SHOWN ON THE NOTICE OF COMMENCEMENT" when the filer "IS NOT IN PRIVITY OF CONTRACT WITH
// THE PROPERTY OWNER AND A NOTICE OF COMMENCEMENT IS FILED". PayApps cannot know either fact, so
// the user answers once (owed or not owed) and, when owed, records that copy apart from the owner's.
// Until both copies are settled the filing stays in the cash report. After payment in full, the
// user records the (g)(3) affidavit as signed (the cash report then asks to record it in the
// county) and as recorded, at which point the affidavit of nonpayment "shall be deemed void".
//
// Pure, computed on read; the filing is the only thing stored. The day the waiver was marked sent stands in for the day
// it was signed (Georgia's forms are dated by hand); the text says so. Calendar days, not moved for
// weekends or holidays. No package import: the client bundles src/shared, and this must stay small
// (test/unit/ga-waiver-clock.test.ts checks the count against packages/lien-waivers' gaNinetyDays).
//
// Mississippi (2026-11-26): Miss. Code Ann. § 85-7-419(5)(b) is Georgia's rule with other numbers.
// Either Mississippi statutory waiver (§ 85-7-433(1), (2)) is conclusively deemed paid at the
// earliest of the money arriving, a written acknowledgment of payment in full, or sixty days after it
// was signed, unless the claimant first files an affidavit of nonpayment (§ 85-7-433(3)) in the
// property's county and sends the owner a copy; the affidavit's closing paragraph gives two days from
// filing for that copy. A filing suspends the waiver until payment in full ((5)(e)); once paid in
// full, the claimant on request signs an affidavit that payment was received, which voids the
// affidavit of nonpayment once recorded ((5)(c)). Mississippi's paragraph names no copy to a
// contractor, so that question is never asked there. The same clock, the same stored filing (the
// ga_affidavit_* columns, named for Georgia, which came first) and the same stages serve both
// states; `NONPAYMENT_RULES` holds what differs. The count is checked against the package's
// msSixtyDays in the test.
import type { GaContractorCopy, WaiverKind, WaiverStatus } from "./enums";
import { formatCents } from "./money";

/** The states whose waivers run a nonpayment clock, and what differs between them. */
export interface NonpaymentRule {
  state: "GA" | "MS";
  stateName: string;
  /** Days after the waiver's date before it is effective anyway. */
  days: number;
  /** Days from filing the affidavit to send the owner's copy. */
  copyDays: number;
  copyDaysWord: string;
  /** Whether the affidavit also sends a copy to the contractor on a notice of commencement. */
  contractorCopy: boolean;
  /** The rule that sets the days and the affidavit. */
  cite: string;
  /** The rule that suspends the waiver once filed. */
  suspendCite: string;
  /** The rule on the affidavit that payment in full was received. */
  paidCite: string;
}

export const NONPAYMENT_RULES: Readonly<Record<"GA" | "MS", NonpaymentRule>> = {
  GA: {
    state: "GA",
    stateName: "Georgia",
    days: 90,
    copyDays: 7,
    copyDaysWord: "seven days",
    contractorCopy: true,
    cite: "O.C.G.A. § 44-14-366(g)(2)",
    suspendCite: "O.C.G.A. § 44-14-366(g)(5)",
    paidCite: "O.C.G.A. § 44-14-366(g)(3)",
  },
  MS: {
    state: "MS",
    stateName: "Mississippi",
    days: 60,
    copyDays: 2,
    copyDaysWord: "two days",
    contractorCopy: false,
    cite: "Miss. Code Ann. § 85-7-419(5)(b)",
    suspendCite: "Miss. Code Ann. § 85-7-419(5)(e)",
    paidCite: "Miss. Code Ann. § 85-7-419(5)(c)",
  },
};

/** The nonpayment rule for a waiver's state, or null where the state has none PayApps tracks. */
export function nonpaymentRule(state: string): NonpaymentRule | null {
  return state === "GA" || state === "MS" ? NONPAYMENT_RULES[state] : null;
}

/** § 44-14-366(g)(2)(C): "ninety days after the date of the execution of the waiver and release". */
export const GA_WAIVER_DAYS = 90;
/** The cash report starts naming the deadline this many days before it. */
export const GA_REMIND_DAYS = 30;
/** The affidavit's closing paragraph: "WITHIN SEVEN DAYS OF FILING THIS AFFIDAVIT OF NONPAYMENT". */
export const GA_COPY_DAYS = 7;

/** What the user recorded about a filed affidavit of nonpayment on one waiver. */
export interface GaAffidavitFiling {
  /** YYYY-MM-DD it was filed in the county. */
  filedOn: string;
  county: string;
  /** YYYY-MM-DD the copy went to the owner, if recorded. */
  copySentOn?: string;
  /** Whether a copy is owed to the contractor at the notice of commencement's address (unset: not answered). */
  contractorCopy?: GaContractorCopy;
  /** YYYY-MM-DD the copy went to the contractor, if recorded. */
  contractorCopySentOn?: string;
  /** (g)(3): YYYY-MM-DD the affidavit that payment in full was received was signed. */
  paidAffidavitSignedOn?: string;
  /** (g)(3): YYYY-MM-DD it was recorded in the county, which voids the affidavit of nonpayment. */
  paidAffidavitRecordedOn?: string;
}

/**
 * - `running`: the ninety days are counting and nothing is filed.
 * - `filed`: an affidavit is recorded as filed and the money still does not cover the waiver.
 * - `paid-after-filing`: filed, and the money recorded now covers the waiver ((g)(3)).
 * - `released`: paid after filing, and the (g)(3) affidavit of payment is recorded: the affidavit of
 *   nonpayment is void.
 */
export type GaClockStage = "running" | "filed" | "paid-after-filing" | "released";

export interface GaClockWaiver {
  id?: string;
  kind: WaiverKind;
  status: WaiverStatus;
  state: string;
  amountCents?: number;
  /** YYYY-MM-DD the waiver was marked sent. */
  sentOn?: string;
  /** The affidavit of nonpayment, once recorded as filed. */
  gaAffidavit?: GaAffidavitFiling;
}

export interface GaWaiverClock {
  /** The waiver's state: Georgia (90 days) or Mississippi (60 days). */
  state: "GA" | "MS";
  waiverId?: string;
  payAppId: string;
  number: number;
  signedOn: string;
  /** Last day of the period (signedOn + 90 calendar days in Georgia, 60 in Mississippi). */
  endsOn: string;
  /** Days from today to endsOn: 0 on the last day, negative once passed. */
  daysLeft: number;
  /** How much of the waiver's amount is not recorded as received. */
  unpaidCents: number;
  waiverAmountCents: number;
  stage: GaClockStage;
  /** Set once an affidavit of nonpayment is recorded as filed. */
  filing?: GaAffidavitFiling & {
    /** Filed after the ninety days ended: the statute asks for it "prior to the expiration". */
    late: boolean;
    /** Last day to send the owner's copy (filedOn + 7 in Georgia, + 2 in Mississippi). */
    copyDueOn: string;
    /** Days from today to copyDueOn; negative once passed. */
    copyDaysLeft: number;
  };
}

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const addDays = (iso: string, days: number) =>
  new Date(utc(iso) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * The Georgia and Mississippi waivers on one application that were marked sent and are not covered by the money
 * received on it. `receivedCents` is what came in on the application (on a paid one, what was paid;
 * a balance closed short was never received). Each waiver is measured against all of it: a later
 * waiver for a partial check is covered by that check, the first one for the whole application is
 * not.
 */
export function gaWaiverClocks(
  app: { id: string; number: number },
  receivedCents: number,
  waivers: readonly GaClockWaiver[],
  today: string,
): GaWaiverClock[] {
  const out: GaWaiverClock[] = [];
  for (const w of waivers) {
    const rule = nonpaymentRule(w.state);
    if (!rule || w.status !== "sent" || !w.sentOn || w.amountCents === undefined) {
      continue;
    }
    const unpaid = w.amountCents - Math.max(0, receivedCents);
    const filed = w.gaAffidavit;
    if (unpaid <= 0 && !filed) continue;
    const start = utc(w.sentOn);
    const now = utc(today);
    if (Number.isNaN(start) || Number.isNaN(now)) continue;
    const endsOn = addDays(w.sentOn, rule.days);
    const days = (iso: string) => Math.round((utc(iso) - now) / DAY_MS);
    const clock: GaWaiverClock = {
      state: rule.state,
      ...(w.id ? { waiverId: w.id } : {}),
      payAppId: app.id,
      number: app.number,
      signedOn: w.sentOn,
      endsOn,
      daysLeft: days(endsOn),
      unpaidCents: Math.max(0, unpaid),
      waiverAmountCents: w.amountCents,
      stage: !filed
        ? "running"
        : unpaid > 0
          ? "filed"
          : filed.paidAffidavitRecordedOn
            ? "released"
            : "paid-after-filing",
    };
    if (filed && !Number.isNaN(utc(filed.filedOn))) {
      const copyDueOn = addDays(filed.filedOn, rule.copyDays);
      clock.filing = {
        ...filed,
        late: filed.filedOn > endsOn,
        copyDueOn,
        copyDaysLeft: days(copyDueOn),
      };
    }
    out.push(clock);
  }
  return out;
}

const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** One sentence for the cash report and the pay-app page. */
export function gaClockText(c: GaWaiverClock): string {
  const r = NONPAYMENT_RULES[c.state];
  const name = r.stateName;
  const unpaid = `${formatCents(c.unpaidCents)} of the ${formatCents(c.waiverAmountCents)} it waives is not recorded as received`;
  const f = c.filing;
  if (f && c.stage === "released") {
    return `${name}: the lien waiver for application #${c.number} is covered by the payments recorded, and the affidavit that payment in full was received was recorded in ${f.county} County on ${f.paidAffidavitRecordedOn}, so the affidavit of nonpayment filed ${f.filedOn} is void (${r.paidCite}).`;
  }
  if (f && c.stage === "paid-after-filing") {
    if (f.paidAffidavitSignedOn) {
      return `${name}: the affidavit that payment in full was received on the lien waiver for application #${c.number} was signed ${f.paidAffidavitSignedOn}. Record it in ${f.county} County, where the affidavit of nonpayment was filed on ${f.filedOn}; once recorded, that affidavit is void (${r.paidCite}). Then record it here as recorded.`;
    }
    return `${name}: the lien waiver for application #${c.number} is now covered by the payments recorded, after you filed an affidavit of nonpayment in ${f.county} County on ${f.filedOn}. If asked, you must sign, in recordable form, an affidavit that payment in full was received; once it is recorded in that county, the affidavit of nonpayment is void (${r.paidCite}). The statute gives no form for it.`;
  }
  if (f) {
    const late = f.late
      ? ` That date is after the ${r.days} days ended on ${c.endsOn}; the statute asks for the filing before they end, so ask counsel where the waiver stands.`
      : "";
    if (!f.copySentOn) {
      const when =
        f.copyDaysLeft > 0
          ? `by ${f.copyDueOn}, in ${plural(f.copyDaysLeft)}`
          : f.copyDaysLeft === 0
            ? `by ${f.copyDueOn}, today`
            : `by ${f.copyDueOn}, ${plural(-f.copyDaysLeft)} ago`;
      const contractor = !r.contractorCopy
        ? ""
        : f.contractorCopy === "not-owed"
          ? ""
          : f.contractorCopy === "owed" && f.contractorCopySentOn
            ? ` The copy to the contractor was sent ${f.contractorCopySentOn}.`
            : f.contractorCopy === "owed"
              ? " Send one to the contractor at the address on the notice of commencement too."
              : " If you have no contract with the owner and a notice of commencement was filed, send one to the contractor at the address on that notice too.";
      return `${name}: the affidavit of nonpayment for the lien waiver on application #${c.number} was filed in ${f.county} County on ${f.filedOn}. Send a copy by registered or certified mail or statutory overnight delivery to the property's owner ${when} (${r.cite}).${contractor} Then record the copy as sent.${late}`;
    }
    if (gaContractorCopyPending(f, c.state)) {
      const ask =
        f.contractorCopy === "owed"
          ? "Its copy to the contractor at the address on the notice of commencement is not recorded as sent: send it and record it."
          : "If you have no contract with the owner and a notice of commencement was filed for the job, a copy also goes to the contractor at the address on that notice: record whether one is owed, and when it was sent.";
      return `${name}: the affidavit of nonpayment for the lien waiver on application #${c.number} was filed in ${f.county} County on ${f.filedOn}, and its copy to the owner was sent ${f.copySentOn}. ${ask} The affidavit's closing paragraph gives ${r.copyDaysWord} from filing, to ${f.copyDueOn} (${r.cite}).${late}`;
    }
    const contractor =
      r.contractorCopy && f.contractorCopy === "owed" && f.contractorCopySentOn
        ? ` and to the contractor ${f.contractorCopySentOn}`
        : "";
    return `${name}: the affidavit of nonpayment for the lien waiver on application #${c.number} was filed in ${f.county} County on ${f.filedOn}, and its copy to the owner was sent ${f.copySentOn}${contractor}. The waiver is suspended until payment in full is received (${r.suspendCite}); ${unpaid}.${late}`;
  }
  const effective =
    c.state === "MS"
      ? "the amount in it is deemed paid in full"
      : "the waiver is conclusively effective";
  if (c.daysLeft < 0) {
    return `${name}: the ${r.days} days after the lien waiver for application #${c.number} (marked sent ${c.signedOn}) ended on ${c.endsOn} and ${unpaid}. Unless you filed an affidavit of nonpayment before then, ${effective} (${r.cite}); ask counsel what is left. If you filed one, record it on the pay app. If the money came in, record the payment.`;
  }
  const when =
    c.daysLeft === 0
      ? `today is the last of the ${r.days} days`
      : `the ${r.days} days end on ${c.endsOn}, in ${plural(c.daysLeft)}`;
  const anyway =
    c.state === "MS"
      ? "the amount in the waiver is deemed paid in full anyway unless you file an affidavit of nonpayment in the property's county first and send the owner a copy"
      : "the waiver becomes effective anyway unless you file an affidavit of nonpayment in the property's county first";
  return `${name}: the lien waiver for application #${c.number} was marked sent ${c.signedOn} and ${unpaid}; ${when}. If it is not paid by then, ${anyway} (${r.cite}). PayApps prints the affidavit from the waiver and records it once filed. If the money came in, record the payment.`;
}

/**
 * The contractor's copy is unsettled: not answered whether one is owed, or owed and not recorded as
 * sent. "Not owed" settles it. Mississippi's affidavit names no contractor's copy, so it never is.
 */
export function gaContractorCopyPending(f: GaAffidavitFiling, state: string = "GA"): boolean {
  if (!nonpaymentRule(state)?.contractorCopy) return false;
  if (f.contractorCopy === "not-owed") return false;
  return !(f.contractorCopy === "owed" && f.contractorCopySentOn);
}

/**
 * Whether the cash report and the weekly email name this clock: the period from 30 days before its
 * end to 30 days after (in Mississippi, whose period is 60 days, that is from day 30); a filed
 * affidavit whose copies (the owner's, and in Georgia the contractor's unless recorded as not owed)
 * are not recorded as sent; and an affidavit of payment signed but not recorded. A suspended waiver
 * (copies sent), a paid one with nothing signed and a released one are shown on the pay app only.
 */
export function gaClockNeedsAction(c: GaWaiverClock): boolean {
  if (c.stage === "running") return Math.abs(c.daysLeft) <= GA_REMIND_DAYS;
  const f = c.filing;
  if (!f) return false;
  if (c.stage === "filed") return !f.copySentOn || gaContractorCopyPending(f, c.state);
  if (c.stage === "paid-after-filing") return Boolean(f.paidAffidavitSignedOn);
  return false;
}
