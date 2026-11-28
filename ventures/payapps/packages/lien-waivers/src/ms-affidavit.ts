import { addDaysIso, daysFrom } from "./iso-days.ts";
import {
  MS_CHECKED_ON,
  MS_HEAD_FIELDS,
  MS_HEADING,
  MS_JURAT,
  MS_SIGNATURE,
  MS_SIGNER_FIELDS,
  MS_SOURCE_URL,
} from "./ms.ts";
import { msPeriodEnd } from "./ms-dates.ts";
import type { NoticeForm } from "./notices.ts";
import type { BlockTemplate, FieldSpec } from "./types.ts";

/**
 * Mississippi's affidavit of nonpayment, Miss. Code Ann. § 85-7-433(3), and the sixty days it
 * answers.
 *
 * A Mississippi waiver (either statutory form, § 85-7-433(1) or (2)) waives "upon the receipt of the
 * sum", and § 85-7-419(5)(b) deems the amount paid in full at the earliest of the money actually
 * arriving, a separate written acknowledgment of payment in full, or "sixty (60) days after the date
 * of the execution of the waiver and release, unless before the expiration of the sixty-day period
 * the claimant files in the county in which the property is located an affidavit of nonpayment,
 * using substantially the affidavit of nonpayment form set forth in Section 85-7-433(3), and sends a
 * true and accurate copy of the affidavit of nonpayment to the owner of the property".
 *
 * The wording is copied verbatim from sources/ms-85-7-433.txt and checked in test/ms.test.ts. Its
 * blanks are the waiver's heading blanks (so a waiver's values fill it), plus the waiver's date and
 * the amount set forth in it; § 85-7-419(5)(f) lets the claimant rely on the waiver's information.
 * Unlike Georgia's, the form has no blank for the amount still unpaid. The notary's lines are left
 * to be filled by hand, as the statute prints them, and the form's last paragraph (the copy to the
 * owner within two days of filing) prints at its foot.
 *
 * Counting (2026-11-28): § 85-7-425 sends the computation of time to § 1-3-67 (ms-dates.ts).
 * `msSixtyDays` gives the 60th calendar day after the waiver's date and, when that is a Saturday,
 * Sunday or legal holiday, the next day that is not (`lastDay`); `msAffidavitCopyDueOn` counts the
 * two days to the owner's copy without the Saturdays, Sundays and legal holidays in between, as
 * § 1-3-67 does for a period under seven days. Neither knows a county's own holiday or a clerk's
 * office closed for another reason, which can only make the true day later. It does not say the
 * affidavit is right for the job: that is the claimant's and counsel's call.
 */

export const MS_AFFIDAVIT_ID = "MS/affidavit-of-nonpayment/statutory";
/** "Sixty (60) days after the date of the execution of the waiver and release" (§ 85-7-419(5)(b)(iii)). */
export const MS_WAIVER_DAYS = 60;
/** "Within two (2) days of filing this affidavit of nonpayment" a copy goes to the owner. */
export const MS_AFFIDAVIT_COPY_DAYS = 2;

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

export const MS_AFFIDAVIT_FIELDS: readonly FieldSpec[] = [
  ...MS_HEAD_FIELDS,
  f(
    "waiverDate",
    "Date of the lien waiver and release",
    "date",
    true,
    "The date the waiver was signed (executed). The 60 days run from it.",
  ),
  f(
    "waiverAmountCents",
    "Amount set forth in the waiver",
    "money",
    true,
    "The sum the waiver was given for, which has not been paid.",
  ),
  ...MS_SIGNER_FIELDS,
];

const STATEMENT =
  "PURSUANT TO SECTION 85-7-419 THE UNDERSIGNED EXECUTED A LIEN WAIVER AND RELEASE WITH RESPECT TO THIS PROPERTY DATED {{waiverDate}}. THE AMOUNT SET FORTH IN THE WAIVER AND RELEASE ({{waiverAmountCents}}) HAS NOT BEEN PAID, AND THE UNDERSIGNED HEREBY GIVES NOTICE OF THE NONPAYMENT.";

/** The statute's own closing paragraph: the copy to the owner within two days of filing. */
export const MS_AFFIDAVIT_COPY_NOTICE =
  "WITHIN TWO (2) DAYS OF FILING THIS AFFIDAVIT OF NONPAYMENT, THE FILING PARTY SHALL SEND A COPY OF THE AFFIDAVIT BY REGISTERED OR CERTIFIED MAIL OR STATUTORY OVERNIGHT DELIVERY TO THE OWNER OF THE PROPERTY. WHENEVER THE OWNER OF THE PROPERTY IS AN ENTITY ON FILE WITH THE SECRETARY OF STATE'S OFFICE, SENDING A COPY OF THE AFFIDAVIT TO THE COMPANY'S ADDRESS OR THE REGISTERED AGENT'S ADDRESS ON FILE WITH THE SECRETARY OF STATE SHALL BE DEEMED SUFFICIENT.";

export const MS_AFFIDAVIT_TITLE = "AFFIDAVIT OF NONPAYMENT";

const BODY: readonly BlockTemplate[] = [
  { type: "title", text: MS_AFFIDAVIT_TITLE },
  ...MS_HEADING,
  { type: "paragraph", text: STATEMENT },
  { type: "paragraph", text: "THE ABOVE FACTS ARE SWORN TRUE AND CORRECT BY THE UNDERSIGNED." },
  MS_SIGNATURE,
  ...MS_JURAT,
  { type: "notice", text: MS_AFFIDAVIT_COPY_NOTICE },
];

/** Mississippi's affidavit of nonpayment, Miss. Code Ann. § 85-7-433(3) (SB 2622, 2014). */
export function msAffidavitOfNonpayment(): NoticeForm {
  return {
    id: MS_AFFIDAVIT_ID,
    state: "MS",
    title: "Affidavit of nonpayment (Mississippi)",
    citation: {
      text: "Miss. Code Ann. § 85-7-433(3)",
      officialUrl: MS_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: MS_CHECKED_ON,
        sourceUrl: MS_SOURCE_URL,
        checkedBy: "sources/ms-85-7-433.txt; test/ms.test.ts",
      },
    },
    sendTo:
      "filed in the county where the property is, before the 60 days after the waiver run out; then a copy to the owner within two days",
    fields: MS_AFFIDAVIT_FIELDS,
    body: BODY,
    attachment: null,
    notes: [
      'Mississippi: once a lien waiver is signed, the amount in it is conclusively deemed paid in full at the earliest of the payment actually arriving, a separate written acknowledgment of payment in full, or 60 days after the date it was signed, "unless before the expiration of the sixty-day period the claimant files in the county in which the property is located an affidavit of nonpayment" in this form and sends the owner a copy (Miss. Code Ann. § 85-7-419(5)(b)).',
      "File it, sworn before a notary, in the county where the property is, before the 60 days end. PayApps counts 60 calendar days from the waiver's date; when the 60th day is a Saturday, Sunday or legal holiday, Miss. Code Ann. § 1-3-67 (which § 85-7-425 applies) runs the period to the end of the next day that is not, and PayApps names that day too. It cannot know a county's own holiday or a day the clerk's office is closed for another reason: do not wait for the last day.",
      "Within two days of filing, not counting Saturdays, Sundays and legal holidays (§ 1-3-67, for a period under seven days), send a copy to the owner by registered or certified mail or statutory overnight delivery (the form's last paragraph; § 85-7-419(5)(b) refers to the manner § 85-7-405 sets for a notice of a claim of lien). Keep the receipts.",
      "Once filed, the waiver is suspended until you are paid in full (§ 85-7-419(5)(e)). If you are then paid in full, you must on request sign, in recordable form, an affidavit that payment in full was received, which voids this one once recorded in the same county ((5)(c)). The affidavit does not shorten the time to file a claim of lien ((5)(d)).",
      "Wording: § 85-7-433(3) as created by SB 2622 (2014), as sent to the Governor and published by the Mississippi Legislature; no later amendment was found. The official Code (published through LexisNexis) was not read; check it, or have counsel check it, before relying on the form.",
    ],
  };
}

export interface MsSixtyDays {
  /** The waiver's date (YYYY-MM-DD). */
  signedOn: string;
  /** 60 calendar days after it, as counted before § 1-3-67 moves it. */
  endsOn: string;
  /** The last day under § 1-3-67: `endsOn`, or the next day that is not a Saturday, Sunday or legal holiday. */
  lastDay: string;
  /** Days from `today` to `endsOn`; 0 on the last day, negative once it has passed. */
  daysLeft: number;
  /** `lastDay` has passed: unless an affidavit was filed, the amount is deemed paid. */
  ended: boolean;
}

/** The § 85-7-419(5)(b)(iii) clock for a Mississippi waiver signed on `signedOn`, as of `today`. */
export function msSixtyDays(signedOn: string, today: string): MsSixtyDays {
  const endsOn = addDaysIso(signedOn, MS_WAIVER_DAYS);
  const { lastDay } = msPeriodEnd(signedOn, MS_WAIVER_DAYS);
  const daysLeft = daysFrom(today, endsOn);
  return { signedOn, endsOn, lastDay, daysLeft, ended: daysFrom(today, lastDay) < 0 };
}

/**
 * The last day to send the owner a copy of an affidavit filed on `filedOn`: two days, not counting
 * the filing day or the Saturdays, Sundays and legal holidays after it (§ 1-3-67).
 */
export function msAffidavitCopyDueOn(filedOn: string): string {
  return msPeriodEnd(filedOn, MS_AFFIDAVIT_COPY_DAYS).lastDay;
}
