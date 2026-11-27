import type { NoticeForm } from "./notices.ts";
import type { BlockTemplate, FieldSpec } from "./types.ts";
import { isIsoDate } from "./validate.ts";

/**
 * Florida's Notice to Owner, Fla. Stat. § 713.06(2)(c): the notice a subcontractor, sub-subcontractor
 * or supplier who is not in privity with the owner serves before it can perfect a lien. The statute
 * says the notice "may be in substantially the following form and must include the information and
 * the warning contained in the following form", so the form is printed whole, word for word.
 *
 * Wording copied from the Florida Senate's published 2026 Florida Statutes on 2026-11-27 (snapshot
 * in sources/fl-713-06.txt, with § 713.18 on how to serve it). Where the statute prints a caption in
 * place of a blank ("(Owner’s name and address)", "(property description)") the caption became the
 * field's label, as in fl.ts. test/fl-notice.test.ts checks the whole form, and every phrase the
 * notes quote, against the snapshot.
 *
 * Not encoded: the combined "NOTICE TO OWNER/NOTICE TO CONTRACTOR" (§ 255.05, § 713.23), public
 * works, the claim of lien (§ 713.08), and any record of when a notice was served.
 */

export const FL_NOTICE_ID = "FL/notice-to-owner/statutory";
export const FL_NOTICE_SOURCE_URL = "https://www.flsenate.gov/Laws/Statutes/2026/713.06";
export const FL_NOTICE_CHECKED_ON = "2026-11-27";

/** § 713.06(2)(a): served "not later than 45 days after commencing" to furnish. */
export const FL_NOTICE_DAYS = 45;
/** § 713.18(2)(b): mailed "within 40 days after the date the lienor first furnishes", service is effective on mailing. */
export const FL_NOTICE_MAIL_DAYS = 40;

const DAY_MS = 86_400_000;
function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export interface FlNoticeDates {
  /** The last day to serve the notice, 45 calendar days after the first day of furnishing. */
  serveBy: string;
  /** The last day to mail it for § 713.18(2)'s service-on-mailing rule, 40 calendar days after. */
  mailBy: string;
}

/**
 * The two Florida dates from the first day the lienor furnished labor, services or materials.
 * Calendar days, not moved for a weekend or holiday (the statute's sections read here say nothing
 * about either, so PayApps says so rather than guess).
 */
export function flNoticeDates(firstFurnishedOn: string): FlNoticeDates {
  if (!isIsoDate(firstFurnishedOn)) {
    throw new RangeError(`First-furnished date must be a date (YYYY-MM-DD): ${firstFurnishedOn}`);
  }
  return {
    serveBy: addDays(firstFurnishedOn, FL_NOTICE_DAYS),
    mailBy: addDays(firstFurnishedOn, FL_NOTICE_MAIL_DAYS),
  };
}

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

const FL_NOTICE_FIELDS: readonly FieldSpec[] = [
  f(
    "ownerNameAddress",
    "Owner’s name and address",
    "multiline",
    true,
    "As in the recorded notice of commencement; without one, the building permit application (§ 713.06(2)(e)).",
  ),
  f(
    "workDescription",
    "General description of services or materials",
    "multiline",
    true,
    "E.g. electrical rough-in and finish, labor and materials.",
  ),
  f(
    "siteDescription",
    "Property description",
    "multiline",
    true,
    "Enough to identify the property: the street address, and the legal description from the notice of commencement if you have it.",
  ),
  f(
    "hiredBy",
    "Under an order given by",
    "text",
    true,
    "The company that hired you: the contractor, or the subcontractor above you.",
  ),
  f("lienorName", "Lienor’s name", "text", true, "Your company's name."),
  f("lienorAddress", "Lienor’s address", "multiline", true, "Your company's mailing address."),
  f(
    "copiesTo",
    "Copies to",
    "multiline",
    false,
    "The contractor (required from a sub-subcontractor or a supplier to a subcontractor), and anyone the notice of commencement names to receive a copy. Left blank, the notice prints a line to fill in by hand.",
  ),
];

/** The form's three opening warnings, in capitals as the statute prints them. */
const FL_WARNINGS: readonly string[] = [
  "WARNING! FLORIDA’S CONSTRUCTION LIEN LAW ALLOWS SOME UNPAID CONTRACTORS, SUBCONTRACTORS, AND MATERIAL SUPPLIERS TO FILE LIENS AGAINST YOUR PROPERTY EVEN IF YOU HAVE MADE PAYMENT IN FULL.",
  "UNDER FLORIDA LAW, YOUR FAILURE TO MAKE SURE THAT WE ARE PAID MAY RESULT IN A LIEN AGAINST YOUR PROPERTY AND YOUR PAYING TWICE.",
  "TO AVOID A LIEN AND PAYING TWICE, YOU MUST OBTAIN A WRITTEN RELEASE FROM US EVERY TIME YOU PAY YOUR CONTRACTOR.",
];

const FL_NOTICE_BODY: readonly BlockTemplate[] = [
  ...FL_WARNINGS.map((text): BlockTemplate => ({ type: "notice", text })),
  { type: "title", text: "NOTICE TO OWNER" },
  { type: "paragraph", text: "To" },
  { type: "paragraph", text: "{{ownerNameAddress}}" },
  {
    type: "paragraph",
    text: "The undersigned hereby informs you that he or she has furnished or is furnishing services or materials as follows:",
  },
  { type: "paragraph", text: "{{workDescription}}" },
  { type: "paragraph", text: "for the improvement of the real property identified as" },
  { type: "paragraph", text: "{{siteDescription}}" },
  { type: "paragraph", text: "under an order given by {{hiredBy}}." },
  {
    type: "paragraph",
    text: "Florida law prescribes the serving of this notice and restricts your right to make payments under your contract in accordance with Section 713.06, Florida Statutes.",
  },
  { type: "title", text: "IMPORTANT INFORMATION FOR YOUR PROTECTION" },
  {
    type: "paragraph",
    text: "Under Florida’s laws, those who work on your property or provide materials and are not paid have a right to enforce their claim for payment against your property. This claim is known as a construction lien.",
  },
  {
    type: "paragraph",
    text: "If your contractor fails to pay subcontractors or material suppliers or neglects to make other legally required payments, the people who are owed money may look to your property for payment, EVEN IF YOU HAVE PAID YOUR CONTRACTOR IN FULL.",
  },
  { type: "heading", text: "PROTECT YOURSELF:" },
  {
    type: "paragraph",
    text: "—RECOGNIZE that this Notice to Owner may result in a lien against your property unless all those supplying a Notice to Owner have been paid.",
  },
  {
    type: "paragraph",
    text: "—LEARN more about the Construction Lien Law, Chapter 713, Part I, Florida Statutes, and the meaning of this notice by contacting an attorney or the Florida Department of Business and Professional Regulation.",
  },
  { type: "spacer" },
  {
    type: "signature",
    lines: [
      { label: "Lienor’s Signature", value: "" },
      { label: "Lienor’s Name", value: "{{lienorName}}" },
      { label: "Lienor’s Address", value: "{{lienorAddress}}" },
    ],
  },
  { type: "heading", text: "Copies to:" },
  { type: "paragraph", text: "{{copiesTo}}" },
];

/** Florida's Notice to Owner, Fla. Stat. § 713.06(2)(c). */
export function flNoticeToOwner(): NoticeForm {
  return {
    id: FL_NOTICE_ID,
    state: "FL",
    title: "Notice to Owner",
    citation: {
      text: "Fla. Stat. § 713.06(2)",
      officialUrl: FL_NOTICE_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: FL_NOTICE_CHECKED_ON,
        sourceUrl: FL_NOTICE_SOURCE_URL,
        checkedBy: "sources/fl-713-06.txt; test/fl-notice.test.ts",
      },
    },
    sendTo:
      "the owner, with a copy to the contractor from a sub-subcontractor or a materialman to a subcontractor, and a copy to any person the owner's notice of commencement designates",
    fields: FL_NOTICE_FIELDS,
    body: FL_NOTICE_BODY,
    attachment: null,
    notes: [
      'Florida: "All lienors under this section, except laborers, as a prerequisite to perfecting a lien under this chapter and recording a claim of lien, must serve a notice on the owner" (Fla. Stat. § 713.06(2)(a)). Section 713.06 covers lienors not in privity with the owner: subcontractors, sub-subcontractors and suppliers.',
      'Timing: "The notice must be served before commencing, or not later than 45 days after commencing, to furnish his or her labor, services, or materials, but, in any event, before the date of the owner’s disbursement of the final payment after the contractor has furnished the affidavit" (§ 713.06(2)(a)). Enter the first day you furnished work and PayApps counts the 45 calendar days; it does not move the date for a weekend or holiday.',
      'Missing it is fatal: "the failure to serve the notice, or to timely serve it, is a complete defense to enforcement of a lien by any person" (§ 713.06(2)(a)), and while small errors in the contents can be forgiven, "a lienor must strictly comply with the time requirements" (§ 713.06(2)(f)).',
      'Copies: "A sub-subcontractor or a materialman to a subcontractor must serve a copy of the notice on the contractor", and a copy goes to any person the owner designated in the notice of commencement (§ 713.06(2)(a), (b)). With no recorded notice of commencement, you "may rely on the information contained in the building permit application" (§ 713.06(2)(e)).',
      "How to serve it (§ 713.18(1)): hand delivery; common carrier delivery service or registered, Global Express Guaranteed, or certified mail, with evidence of delivery; or posting on the site of the improvement if neither can be accomplished.",
      'Service on mailing: a notice to owner is served as of the day it is mailed if it is sent by registered, Global Express Guaranteed, or certified mail, "within 40 days after the date the lienor first furnishes labor, services, or materials", and you keep a mail log or the USPS tracking records (§ 713.18(2)). PayApps shows that mail-by date beside the 45-day one.',
      "Not covered here: the combined notice to contractor on bonded or public jobs (§ 255.05, § 713.23) and the claim of lien itself (§ 713.08).",
    ],
  };
}
