import { GA_AMENDMENT_URL, GA_CHECKED_ON, GA_MIN_FONT_PT } from "./ga.ts";
import type { NoticeForm } from "./notices.ts";
import type { BlockTemplate, FieldSpec, ValidationError, WaiverData } from "./types.ts";

/**
 * Georgia's affidavit of nonpayment, O.C.G.A. § 44-14-366(g)(2), and the ninety days it answers.
 *
 * A Georgia waiver (either statutory form, § 44-14-366(d) or (e)) waives "upon the receipt of the
 * sum", and (g)(2) makes it conclusively effective at the earliest of the money actually arriving, a
 * separate written acknowledgment of payment in full, or ninety days after the date it was signed,
 * "unless prior to the expiration of said 90 day period the claimant files in the county in which
 * the property is located an affidavit of nonpayment, using substantially the language in the
 * following form", at least 12 point. So a subcontractor who signs the waiver with the pay
 * application and is not paid loses the lien and bond rights it covers on day ninety unless it
 * files this affidavit first.
 *
 * The wording is (g)(2)'s form as SB 143 (2021) rewrote it, copied verbatim from
 * sources/ga-44-14-366.txt and checked in test/ga-affidavit.test.ts. Its blanks are the same as the
 * waiver's (so a waiver's values fill it), plus the waiver's date, the waiver's amount and the
 * amount still unpaid. The swearing date, the seal, the witness and the notary are left to be done
 * by hand before a notary, as the statute prints them. The form's last paragraph (the copy to the
 * owner within seven days of filing) prints as the statute prints it, at the foot of the form.
 *
 * Counting: `gaNinetyDays` counts 90 calendar days from the waiver's date. It does not move a
 * deadline that falls on a weekend or holiday, and it does not say the affidavit is right for the
 * job: that is the claimant's and counsel's call.
 */

export const GA_AFFIDAVIT_ID = "GA/affidavit-of-nonpayment/statutory";
/** "Ninety days after the date of the execution of the waiver and release" (§ 44-14-366(g)(2)(C)). */
export const GA_WAIVER_DAYS = 90;
/** "Within seven days of filing this affidavit of nonpayment" a copy goes to the owner. */
export const GA_AFFIDAVIT_COPY_DAYS = 7;

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

export const GA_AFFIDAVIT_FIELDS: readonly FieldSpec[] = [
  f(
    "county",
    "County (heading)",
    "text",
    true,
    "STATE OF GEORGIA, COUNTY OF ____: the county the affidavit is sworn in. It is filed in the county where the property is.",
  ),
  f(
    "customerName",
    "Name of contractor",
    "text",
    true,
    "Who employed you to furnish the work, as on the waiver.",
  ),
  f(
    "workDescription",
    "Materials and/or labor furnished",
    "text",
    true,
    "As on the waiver, e.g. electrical labor and materials.",
  ),
  f("projectName", "Title of the project or building", "text", true, "As on the waiver."),
  f("cityOrTown", "City the improvements are in", "text", true, "As on the waiver."),
  f(
    "propertyCounty",
    "County the improvements are in",
    "text",
    true,
    "The affidavit is filed in this county.",
  ),
  f("ownerName", "Name of owner", "text", true, "The owner of the property."),
  f(
    "propertyDescription",
    "Property description",
    "multiline",
    true,
    "As on the waiver: a metes and bounds description, the land lot district, block and lot number, or the street address.",
  ),
  f(
    "waiverDate",
    "Date of the lien waiver and release",
    "date",
    true,
    "The date the waiver was signed (executed). The 90 days run from it.",
  ),
  f(
    "waiverAmountCents",
    "Amount set forth in the waiver",
    "money",
    true,
    "The sum the waiver was given for.",
  ),
  f(
    "unpaidCents",
    "Amount that remains unpaid",
    "money",
    true,
    "How much of the waiver's amount has not been received. More than zero and no more than the waiver's amount.",
  ),
  f(
    "claimantName",
    "Claimant",
    "text",
    true,
    "Your company's name, printed under the signature line.",
  ),
];

const RECITAL =
  "THE UNDERSIGNED MECHANIC AND/OR MATERIALMAN HAS BEEN EMPLOYED BY {{customerName}} (NAME OF CONTRACTOR) TO FURNISH {{workDescription}} (DESCRIBE MATERIALS AND/OR LABOR) FOR THE CONSTRUCTION OF IMPROVEMENTS KNOWN AS {{projectName}} (TITLE OF THE PROJECT OR BUILDING) WHICH IS LOCATED IN THE CITY OF {{cityOrTown}}, COUNTY OF {{propertyCounty}}, AND IS OWNED BY {{ownerName}} (NAME OF OWNER) AND MORE PARTICULARLY DESCRIBED AS FOLLOWS:";

const PROPERTY_CAPTION =
  "(DESCRIBE THE PROPERTY UPON WHICH THE IMPROVEMENTS WERE MADE BY USING EITHER A METES AND BOUNDS DESCRIPTION, THE LAND LOT DISTRICT, BLOCK AND LOT NUMBER, OR STREET ADDRESS OF THE PROJECT.)";

const STATEMENT =
  "PURSUANT TO O.C.G.A. 44-14-366 THE UNDERSIGNED EXECUTED A LIEN WAIVER AND RELEASE WITH RESPECT TO THIS PROPERTY DATED {{waiverDate}}. THE AMOUNT SET FORTH IN SAID WAIVER AND RELEASE ({{waiverAmountCents}}) HAS NOT BEEN PAID IN FULL AND {{unpaidCents}} OF THE AMOUNT SET FORTH IN SAID WAIVER AND RELEASE REMAINS UNPAID, AND THE UNDERSIGNED HEREBY GIVES NOTICE OF SUCH NONPAYMENT.";

/** Sworn and dated by hand before the notary, as the statute prints it. */
const SWORN =
  "THE ABOVE FACTS ARE SWORN TRUE AND CORRECT BY THE UNDERSIGNED, THIS ______ DAY OF ______________, ____.";

/** The statute's own closing paragraph: the copy to the owner within seven days of filing. */
export const GA_AFFIDAVIT_COPY_NOTICE =
  "WITHIN SEVEN DAYS OF FILING THIS AFFIDAVIT OF NONPAYMENT, THE FILING PARTY SHALL SEND A COPY OF THE AFFIDAVIT BY REGISTERED OR CERTIFIED MAIL OR STATUTORY OVERNIGHT DELIVERY TO THE OWNER OF THE PROPERTY. IF THE FILING PARTY IS NOT IN PRIVITY OF CONTRACT WITH THE PROPERTY OWNER AND A NOTICE OF COMMENCEMENT IS FILED FOR THE IMPROVEMENT ON THE PROPERTY FOR WHICH THE FILING PARTY'S LABOR, SERVICES, OR MATERIALS WERE FURNISHED, A COPY OF THE AFFIDAVIT SHALL BE SENT TO THE CONTRACTOR AT THE ADDRESS SHOWN ON THE NOTICE OF COMMENCEMENT. WHENEVER THE OWNER OF THE PROPERTY IS AN ENTITY ON FILE WITH THE SECRETARY OF STATE'S CORPORATIONS DIVISION, SENDING A COPY OF THE AFFIDAVIT TO THE COMPANY'S ADDRESS OR THE REGISTERED AGENT'S ADDRESS ON FILE WITH THE SECRETARY OF STATE SHALL BE DEEMED SUFFICIENT.";

export const GA_AFFIDAVIT_TITLE = "AFFIDAVIT OF NONPAYMENT UNDER O.C.G.A. 44-14-366";

const BODY: readonly BlockTemplate[] = [
  { type: "title", text: GA_AFFIDAVIT_TITLE },
  { type: "paragraph", text: "STATE OF GEORGIA" },
  { type: "paragraph", text: "COUNTY OF {{county}}" },
  { type: "paragraph", text: RECITAL },
  { type: "paragraph", text: "{{propertyDescription}}" },
  { type: "paragraph", text: PROPERTY_CAPTION },
  { type: "paragraph", text: STATEMENT },
  { type: "paragraph", text: SWORN },
  {
    type: "signature",
    lines: [
      { label: "(SEAL) CLAIMANT'S SIGNATURE", value: "" },
      { label: "Claimant", value: "{{claimantName}}" },
    ],
  },
  { type: "paragraph", text: "SWORN TO AND EXECUTED IN THE PRESENCE OF:" },
  {
    type: "signature",
    lines: [
      { label: "WITNESS", value: "" },
      { label: "NOTARY PUBLIC", value: "" },
    ],
  },
  { type: "notice", text: GA_AFFIDAVIT_COPY_NOTICE },
];

/** The unpaid amount must be more than zero and no more than the waiver's amount. */
function checkAmounts(data: WaiverData): ValidationError[] {
  const total = data.waiverAmountCents;
  const unpaid = data.unpaidCents;
  if (typeof total !== "number" || typeof unpaid !== "number") return [];
  if (unpaid === 0) {
    return [
      {
        field: "unpaidCents",
        code: "INVALID_MONEY",
        message:
          "Amount that remains unpaid is zero: the affidavit says the waiver's amount has not been paid in full.",
      },
    ];
  }
  if (unpaid > total) {
    return [
      {
        field: "unpaidCents",
        code: "INVALID_MONEY",
        message: "Amount that remains unpaid is more than the amount set forth in the waiver.",
      },
    ];
  }
  return [];
}

/** Georgia's affidavit of nonpayment, O.C.G.A. § 44-14-366(g)(2) (as rewritten by SB 143, 2021). */
export function gaAffidavitOfNonpayment(): NoticeForm {
  return {
    id: GA_AFFIDAVIT_ID,
    state: "GA",
    title: "Affidavit of nonpayment (Georgia)",
    citation: {
      text: "O.C.G.A. § 44-14-366(g)(2)",
      officialUrl: GA_AMENDMENT_URL,
      verification: {
        status: "verified",
        checkedOn: GA_CHECKED_ON,
        sourceUrl: GA_AMENDMENT_URL,
        checkedBy: "sources/ga-44-14-366.txt; test/ga-affidavit.test.ts",
      },
    },
    sendTo:
      "filed in the county where the property is, before the 90 days after the waiver run out; then a copy to the owner within seven days",
    fields: GA_AFFIDAVIT_FIELDS,
    body: BODY,
    attachment: null,
    minFontPt: GA_MIN_FONT_PT,
    crossCheck: checkAmounts,
    notes: [
      'Georgia: a signed lien waiver is conclusively effective at the earliest of the payment actually arriving, a separate written acknowledgment of payment in full, or 90 days after the date it was signed, "unless prior to the expiration of said 90 day period the claimant files in the county in which the property is located an affidavit of nonpayment" in this form (O.C.G.A. § 44-14-366(g)(2)).',
      "File it, sworn before a notary, with the clerk of superior court of the county where the property is, before the 90 days end. PayApps counts 90 calendar days from the waiver's date and does not move the date for a weekend or holiday: do not wait for the last day.",
      "Within seven days of filing, send a copy by registered or certified mail or statutory overnight delivery to the owner, and in some cases to the contractor at the address on the notice of commencement (the form's last paragraph says when). Keep the receipts.",
      "Once filed, the waiver is suspended until you are paid in full ((g)(5)). If you are then paid in full, you must on request sign, in recordable form, an affidavit that payment in full was received, which voids this one once recorded ((g)(3)). The affidavit does not shorten the time to file a claim of lien ((g)(4)).",
      "Wording: (g)(2)'s form as rewritten by SB 143 (2021), as passed and published by the State of Georgia. The official Code (published through LexisNexis) was not read; check it, or have counsel check it, before relying on the form.",
    ],
  };
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

function daysFrom(from: string, to: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

export interface GaNinetyDays {
  /** The waiver's date (YYYY-MM-DD). */
  signedOn: string;
  /** 90 calendar days after it: the last day of the period (not moved for weekends or holidays). */
  endsOn: string;
  /** Days from `today` to `endsOn`; 0 on the last day, negative once it has passed. */
  daysLeft: number;
  /** The period has run out: unless an affidavit was filed, the waiver is effective. */
  ended: boolean;
}

/** The § 44-14-366(g)(2)(C) clock for a Georgia waiver signed on `signedOn`, as of `today`. */
export function gaNinetyDays(signedOn: string, today: string): GaNinetyDays {
  const endsOn = addDaysIso(signedOn, GA_WAIVER_DAYS);
  const daysLeft = daysFrom(today, endsOn);
  return { signedOn, endsOn, daysLeft, ended: daysLeft < 0 };
}

/** The last day to send the owner a copy of an affidavit filed on `filedOn` (seven days). */
export function gaAffidavitCopyDueOn(filedOn: string): string {
  return addDaysIso(filedOn, GA_AFFIDAVIT_COPY_DAYS);
}
