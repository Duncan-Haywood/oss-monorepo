import type { NoticeForm } from "./notices.ts";
import type { BlockTemplate, FieldSpec, ValidationError, WaiverData } from "./types.ts";

/**
 * The Miller Act's 90-day written notice, 40 U.S.C. § 3133(b)(2): what a sub-subcontractor or a
 * supplier to a subcontractor (someone "having a direct contractual relationship with a
 * subcontractor but no contractual relationship, express or implied, with the contractor
 * furnishing the payment bond") gives the prime contractor on a federal job before it may sue on
 * the payment bond.
 *
 * Unlike the state notices in this package, the statute prescribes no form. It prescribes the
 * notice's contents (it must "state with substantial accuracy the amount claimed and the name of
 * the party to whom the material was furnished or supplied or for whom the labor was done or
 * performed"), who gets it ("the contractor"), when (within 90 days of the last day) and how it is
 * served. So, as with California's notice (§§ 8102, 8202), each item's heading is the statute's own
 * phrase, and the layout, the title, the one-sentence statement of the claim and the signature
 * lines are this package's, which the form's notes say. test/miller-notice.test.ts checks every
 * heading and every quoted phrase against the snapshot (sources/us-40-3133.txt, GPO's United States
 * Code, 2023 edition, read 2026-11-27).
 *
 * Not encoded: state "little Miller Act" bond claims on state and local public works, and the
 * suit itself (§ 3133(b)(3)-(4)). The dates are counted in the app (src/shared/public-jobs.ts).
 */

export const MILLER_NOTICE_ID = "US/miller-act/notice-of-claim";
export const MILLER_SOURCE_URL =
  "https://www.govinfo.gov/content/pkg/USCODE-2023-title40/html/USCODE-2023-title40-subtitleII-partA-chap31-subchapIII-sec3133.htm";
export const MILLER_OFFICIAL_URL = "https://www.law.cornell.edu/uscode/text/40/3133";
export const MILLER_CHECKED_ON = "2026-11-27";

/** The statute's phrases used as the notice's headings (checked verbatim against the snapshot). */
export const MILLER_PHRASES = {
  contractor: "the contractor furnishing the payment bond",
  amount: "the amount claimed",
  party:
    "the name of the party to whom the material was furnished or supplied or for whom the labor was done or performed",
  lastDay: "the day on which the last of the labor was performed or material was supplied",
} as const;

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

const FIELDS: readonly FieldSpec[] = [
  f("noticeDate", "Date of the notice", "date", true, "The day you send the notice."),
  f(
    "primeContractor",
    "To: the prime contractor (the contractor furnishing the payment bond), name and address",
    "multiline",
    true,
    "The general contractor holding the federal contract, at an office where it does business. Not the sub that hired you.",
  ),
  f(
    "project",
    "Project",
    "multiline",
    true,
    "The project's name and location, as on the contract or the agency's notice to proceed.",
  ),
  f(
    "contractNumber",
    "Federal contract number (if known)",
    "text",
    false,
    "From your subcontract, the bond or the agency. Left blank, this item is left off.",
  ),
  f(
    "claimant",
    "Your company: name and address",
    "multiline",
    true,
    "The company giving the notice and the address replies should go to.",
  ),
  f(
    "furnishedTo",
    "Who you furnished the labor or material to (the sub that hired you)",
    "multiline",
    true,
    "The subcontractor you contracted with, by its legal name.",
  ),
  f(
    "workDescription",
    "The labor or material (if you want to describe it)",
    "multiline",
    false,
    "E.g. electrical labor and materials per purchase order 2214. Left blank, this item is left off.",
  ),
  f(
    "amountClaimed",
    "Amount claimed",
    "text",
    true,
    "What is unpaid for your labor and material on this job, retainage included, e.g. $48,250.00. The statute asks for it with substantial accuracy.",
  ),
  f(
    "lastDay",
    "Last day you performed labor or supplied material",
    "date",
    true,
    "The 90 days run from this day. Punch-list and warranty work usually does not count.",
  ),
];

const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

const BODY: readonly BlockTemplate[] = [
  { type: "title", text: "NOTICE OF CLAIM ON PAYMENT BOND" },
  { type: "paragraph", text: "Written notice under 40 U.S.C. § 3133(b)(2) (the Miller Act)" },
  { type: "field", label: "Date", value: "{{noticeDate}}" },
  { type: "heading", text: `To ${MILLER_PHRASES.contractor}:` },
  { type: "paragraph", text: "{{primeContractor}}" },
  { type: "heading", text: "Project:" },
  { type: "paragraph", text: "{{project}}" },
  { type: "heading", text: "Federal contract number:" },
  { type: "paragraph", text: "{{contractNumber}}" },
  { type: "heading", text: "Claimant:" },
  { type: "paragraph", text: "{{claimant}}" },
  { type: "spacer" },
  {
    type: "paragraph",
    text: "The claimant gives you written notice of its claim on the payment bond furnished for the contract named above, for labor or material it furnished in carrying out the work provided for in that contract and for which it has not been paid in full.",
  },
  { type: "heading", text: `${cap(MILLER_PHRASES.amount)}:` },
  { type: "paragraph", text: "{{amountClaimed}}" },
  { type: "heading", text: `${cap(MILLER_PHRASES.party)}:` },
  { type: "paragraph", text: "{{furnishedTo}}" },
  { type: "heading", text: "The labor or material:" },
  { type: "paragraph", text: "{{workDescription}}" },
  { type: "heading", text: `${cap(MILLER_PHRASES.lastDay)}:` },
  { type: "paragraph", text: "{{lastDay}}" },
  { type: "spacer" },
  {
    type: "signature",
    lines: [
      { label: "Signature", value: "" },
      { label: "Name and title", value: "" },
      { label: "Date", value: "{{noticeDate}}" },
    ],
  },
];

/**
 * The notice reports a last day already past: one dated before the day it names as the last day
 * of labor or material states something that cannot be true. (Dates are YYYY-MM-DD once
 * validated, so they compare as strings.)
 */
function checkDates(data: WaiverData): ValidationError[] {
  const noticeDate = typeof data.noticeDate === "string" ? data.noticeDate.trim() : null;
  const lastDay = typeof data.lastDay === "string" ? data.lastDay.trim() : null;
  if (!noticeDate || !lastDay) return [];
  if (lastDay <= noticeDate) return [];
  return [
    {
      field: "lastDay",
      code: "INVALID_DATE",
      message: `Last day you performed labor or supplied material (${lastDay}) is after the date of the notice (${noticeDate}). Send the notice once the last day has passed, or correct either date.`,
    },
  ];
}

/** The Miller Act 90-day notice to the prime contractor, 40 U.S.C. § 3133(b)(2). */
export function millerActNotice(): NoticeForm {
  return {
    id: MILLER_NOTICE_ID,
    state: "US",
    title: "Miller Act notice of claim on the payment bond (90-day notice)",
    citation: {
      text: "40 U.S.C. § 3133(b)(2)",
      officialUrl: MILLER_OFFICIAL_URL,
      verification: {
        status: "verified",
        checkedOn: MILLER_CHECKED_ON,
        sourceUrl: MILLER_SOURCE_URL,
        checkedBy: "sources/us-40-3133.txt; test/miller-notice.test.ts",
      },
    },
    sendTo: "the prime contractor, the contractor furnishing the payment bond",
    fields: FIELDS,
    body: BODY,
    attachment: null,
    omitIfBlank: ["contractNumber", "workDescription"],
    crossCheck: checkDates,
    notes: [
      'Who needs it: "A person having a direct contractual relationship with a subcontractor but no contractual relationship, express or implied, with the contractor furnishing the payment bond" (40 U.S.C. § 3133(b)(2)). A company that contracted with the prime itself needs no 90-day notice before suing.',
      'When: "within 90 days from the date on which the person did or performed the last of the labor or furnished or supplied the last of the material for which the claim is made" (§ 3133(b)(2)). Send it well before the 90th day: courts differ on whether it must arrive, not only be sent, by then.',
      "What it says: the statute asks it to \"state with substantial accuracy the amount claimed and the name of the party to whom the material was furnished or supplied or for whom the labor was done or performed\" (§ 3133(b)(2)). The statute sets no form: the title, layout and the sentence stating the claim are PayApps' wording, and each heading is the statute's phrase.",
      'How to serve it: "by any means that provides written, third-party verification of delivery to the contractor at any place the contractor maintains an office or conducts business or at the contractor\'s residence", or "in any manner in which the United States marshal of the district in which the public improvement is situated by law may serve summons" (§ 3133(b)(2)(A), (B)). Certified mail with a return receipt, or a courier that records a signature, and keep the proof.',
      "Attach the unpaid invoices or pay applications. Many claimants also send a copy to the surety named on the bond and to the subcontractor they worked for; the statute requires the notice only to the prime.",
      'The bond: the contracting agency "shall furnish a certified copy of a payment bond and the contract for which it was given" to someone who submits an affidavit that it supplied labor or material and has not been paid (§ 3133(a)). The bond names the surety.',
      'The suit, if you are still unpaid: from day 91, "no later than one year after the day on which the last of the labor was performed or material was supplied", in the name of the United States for your use, in the federal district court where the contract was performed (§ 3133(b)(1), (3), (4)).',
    ],
  };
}
