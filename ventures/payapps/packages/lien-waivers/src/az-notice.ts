import type { NoticeForm } from "./notices.ts";
import type { BlockTemplate, FieldSpec } from "./types.ts";

/**
 * Arizona's preliminary twenty day notice, Ariz. Rev. Stat. § 33-992.01: the notice every person
 * who furnishes labor, professional services, materials, machinery, fixtures or tools (except a
 * person "performing actual labor for wages") serves "as a necessary prerequisite to the validity of
 * any claim of lien" (§ 33-992.01(B)). Subsection D says the notice "shall follow substantially the
 * following form", so the form is printed whole: every caption, the boldface Notice to Property
 * Owner, the two ten-day paragraphs that must be in type "at least as large as the largest type
 * otherwise on the document", and the § 33-992.02 acknowledgment of receipt the form says "shall be
 * inserted here".
 *
 * Wording copied from the Arizona Legislature's published text on 2026-11-28 (snapshot in
 * sources/az-33-992.txt). The statute prints the form in two columns; here the left column (the
 * four names and addresses) comes first, then the right (the claimant, the work, the site, the
 * price), each caption whole. test/az-notice.test.ts checks every caption and every sentence against
 * the snapshot, so an edit that drifts from the statute fails the build.
 *
 * Not encoded: when the twenty days run out for a given job (PayApps does not track Arizona's
 * date yet), the § 33-992.02(2) affidavit of mailing, and the lien itself (§ 33-993).
 */

export const AZ_NOTICE_ID = "AZ/preliminary-twenty-day-notice/statutory";
export const AZ_NOTICE_SOURCE_URL = "https://www.azleg.gov/ars/33/00992-01.htm";
export const AZ_RECEIPT_SOURCE_URL = "https://www.azleg.gov/ars/33/00992-02.htm";
export const AZ_NOTICE_CHECKED_ON = "2026-11-28";

/** § 33-992.01(C): given "not later than twenty days after the claimant has first furnished". */
export const AZ_NOTICE_DAYS = 20;

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

/** The form's captions, as § 33-992.01(D) prints them (each one whole, column by column). */
export const AZ_CAPTIONS = {
  owner: "The name and address of the owner or reputed owner are:",
  original: "The name and address of the original contractor are:",
  lender: "The name and address of any lender or reputed lender and assigns are:",
  contracted: "The name and address of the person with whom the claimant has contracted are:",
  completedBy: "This preliminary lien notice has been completed by (name and address of claimant):",
  work: "You are hereby notified that the claimant has furnished or will furnish labor, professional services, materials, machinery, fixtures or tools of the following general description:",
  site: "In the construction, alteration or repair of the building, structure or improvement located at:",
  land: "And situated on that certain lot(s) or parcel(s) of land in {{county}} County, Arizona, described as follows:",
  price:
    "An estimate of the total price of the labor, professional services, materials, machinery, fixtures or tools furnished or to be furnished is: {{estimate}}",
} as const;

export const AZ_NOT_A_LIEN =
  "In accordance with Arizona Revised Statutes section 33-992.01, this is not a lien. This is not a reflection on the integrity of any contractor or subcontractor.";

/** The boldface Notice to Property Owner, § 33-992.01(D) (the same text as (C)(5)). */
export const AZ_OWNER_NOTICE: readonly string[] = [
  "If bills are not paid in full for the labor, professional services, materials, machinery, fixtures or tools furnished, or to be furnished, a mechanic's lien leading to the loss, through court foreclosure proceedings, of all or part of your property being improved may be placed against the property. You may wish to protect yourself against this consequence by either:",
  "1. Requiring your contractor to furnish a conditional waiver and release pursuant to Arizona Revised Statutes section 33-1008, subsection D, paragraphs 1 and 3 signed by the person or firm giving you this notice before you make payment to your contractor.",
  "2. Requiring your contractor to furnish an unconditional waiver and release pursuant to Arizona Revised Statutes section 33-1008, subsection D, paragraphs 2 and 4 signed by the person or firm giving you this notice after you make payment to your contractor.",
  "3. Using any other method or device that is appropriate under the circumstances.",
];

/** The two paragraphs the form wants "in type at least as large as the largest type otherwise on the document". */
export const AZ_TEN_DAYS: readonly string[] = [
  "Within ten days after the receipt of this preliminary twenty day notice the owner or other interested party is required to furnish all information necessary to correct any inaccuracies in the notice pursuant to Arizona Revised Statutes section 33-992.01, subsection J or lose as a defense any inaccuracy of that information.",
  "Within ten days after the receipt of this preliminary twenty day notice if any payment bond has been recorded in compliance with Arizona Revised Statutes section 33-1003, the owner must provide a copy of the payment bond, including the name and address of the surety company and bonding agent providing the payment bond to the person who has given the preliminary twenty day notice. In the event that the owner or other interested party fails to provide the bond information within that ten day period, the claimant shall retain lien rights to the extent precluded or prejudiced from asserting a claim against the bond as a result of not timely receiving the bond information.",
];

const RULE = "________________";

/** § 33-992.02(1): the acknowledgment of receipt, left blank for the person served to fill in. */
export const AZ_RECEIPT_TITLE = "Acknowledgment of receipt of preliminary twenty day notice";
const AZ_RECEIPT: readonly BlockTemplate[] = [
  { type: "spacer" },
  { type: "signature", lines: [{ label: "Signature of sender", value: "" }] },
  { type: "heading", text: AZ_RECEIPT_TITLE },
  {
    type: "paragraph",
    text: `This acknowledges receipt on ${RULE} of a copy of the preliminary twenty day notice at ${RULE} .`,
  },
  { type: "signature", lines: [{ label: "Date", value: "" }] },
  { type: "paragraph", text: "(Date this acknowledgment is executed)" },
  { type: "signature", lines: [{ label: "Signature", value: "" }] },
  {
    type: "paragraph",
    text: "Signature of person acknowledging receipt, with title if acknowledgment is made on behalf of another person",
  },
];

const AZ_NOTICE_FIELDS: readonly FieldSpec[] = [
  f(
    "ownerNameAddress",
    "Owner or reputed owner, name and address",
    "multiline",
    true,
    "As on the building permit, the county assessor's record or the GC's contract.",
  ),
  f(
    "directContractor",
    "Original contractor (the GC with the contract with the owner), name and address",
    "multiline",
    true,
    "The contractor in a direct contract with the owner (§ 33-992.01(A)(2)).",
  ),
  f(
    "lender",
    "Lender or reputed lender and assigns, name and address",
    "multiline",
    false,
    "The construction lender, if any. The owner must give it to you on request (§ 33-992.01(J)). If there is none, type None; left blank, the notice prints a line.",
  ),
  f(
    "contractedWith",
    "The person you contracted with, name and address",
    "multiline",
    true,
    "The company that hired you: the GC, or the subcontractor above you.",
  ),
  f("claimantName", "By (your company's name)", "text", true, "Your company's legal name."),
  f(
    "claimantAddress",
    "Your company's address",
    "multiline",
    true,
    "The mailing address the owner and the others should answer to.",
  ),
  f(
    "workDescription",
    "General description of what you furnish",
    "multiline",
    true,
    "E.g. electrical rough-in and finish, labor and materials. A general description also covers later work outside it, within the limits of § 33-992.01(H).",
  ),
  f(
    "propertyAddress",
    "Where the improvement is located",
    "multiline",
    true,
    "The street address, or the location by roads and landmarks.",
  ),
  f("county", "County", "text", true, "The Arizona county the land is in, e.g. Maricopa."),
  f(
    "legalDescription",
    "Legal description of the lot(s) or parcel(s)",
    "multiline",
    false,
    "As on the deed or the assessor's record (lot, subdivision, APN). Left blank, the notice prints a line to fill in by hand.",
  ),
  f(
    "estimate",
    "Estimate of the total price",
    "text",
    true,
    "Usually your contract sum with approved change orders, e.g. $184,500.00. A new notice is needed once the real total is 30% or more above it (§ 33-992.01(G)).",
  ),
  f("signedDate", "Date", "date", true, "The date you sign and mail the notice."),
];

const item = (heading: string, key: string): BlockTemplate[] => [
  { type: "heading", text: heading },
  { type: "paragraph", text: `{{${key}}}` },
];

const AZ_NOTICE_BODY: readonly BlockTemplate[] = [
  { type: "title", text: "Arizona Preliminary Twenty Day Lien Notice" },
  { type: "notice", text: AZ_NOT_A_LIEN },
  ...item(AZ_CAPTIONS.owner, "ownerNameAddress"),
  ...item(AZ_CAPTIONS.original, "directContractor"),
  ...item(AZ_CAPTIONS.lender, "lender"),
  ...item(AZ_CAPTIONS.contracted, "contractedWith"),
  { type: "heading", text: AZ_CAPTIONS.completedBy },
  { type: "field", label: "Date", value: "{{signedDate}}" },
  { type: "field", label: "By", value: "{{claimantName}}" },
  { type: "field", label: "Address", value: "{{claimantAddress}}" },
  ...item(AZ_CAPTIONS.work, "workDescription"),
  ...item(AZ_CAPTIONS.site, "propertyAddress"),
  { type: "heading", text: AZ_CAPTIONS.land },
  { type: "paragraph", text: "{{legalDescription}}" },
  { type: "paragraph", text: AZ_CAPTIONS.price },
  { type: "spacer" },
  { type: "title", text: "Notice to Property Owner" },
  ...AZ_OWNER_NOTICE.map((text): BlockTemplate => ({ type: "notice", text })),
  ...AZ_TEN_DAYS.map((text): BlockTemplate => ({ type: "notice", text })),
  { type: "spacer" },
  {
    type: "signature",
    lines: [
      { label: "Dated", value: "{{signedDate}}" },
      { label: "(Company name)", value: "{{claimantName}}" },
      { label: "By (Signature)", value: "" },
      { label: "(Title)", value: "" },
    ],
  },
  ...AZ_RECEIPT,
];

/** Arizona's preliminary twenty day notice, Ariz. Rev. Stat. §§ 33-992.01 and 33-992.02. */
export function azPreliminaryNotice(): NoticeForm {
  return {
    id: AZ_NOTICE_ID,
    state: "AZ",
    title: "Preliminary twenty day notice",
    citation: {
      text: "Ariz. Rev. Stat. §§ 33-992.01, 33-992.02",
      officialUrl: AZ_NOTICE_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: AZ_NOTICE_CHECKED_ON,
        sourceUrl: AZ_NOTICE_SOURCE_URL,
        checkedBy: "sources/az-33-992.txt; test/az-notice.test.ts",
      },
    },
    sendTo:
      "the owner or reputed owner, the original contractor or reputed contractor, the construction lender, if any, or reputed construction lender, if any, and the person with whom the claimant has contracted for the purchase of those items",
    fields: AZ_NOTICE_FIELDS,
    body: AZ_NOTICE_BODY,
    attachment: null,
    notes: [
      'Arizona: except for a person performing actual labor for wages, everyone who furnishes labor, professional services, materials, machinery, fixtures or tools serves this notice "as a necessary prerequisite to the validity of any claim of lien", on the owner or reputed owner, the original contractor or reputed contractor, the construction lender, if any, and the person with whom you contracted (Ariz. Rev. Stat. § 33-992.01(B)). Mail one copy to each.',
      'Timing, in the statute\'s words: the notice "shall be given not later than twenty days after the claimant has first furnished labor, professional services, materials, machinery, fixtures or tools to the jobsite" (§ 33-992.01(C)). A late notice still works, but only for what was "furnished within twenty days before the service of the notice and at any time thereafter" (§ 33-992.01(E)). PayApps does not count Arizona\'s twenty days for you yet: write the date down, and do not wait for a weekend or holiday rule.',
      'How to give it: "by first class mail sent with a certificate of mailing, registered or certified mail, postage prepaid in all cases", to each person\'s residence or business address; "Service is complete at the time of the deposit of notice in the mail" (§ 33-992.01(F)).',
      "Proof: the signed acknowledgment of receipt printed at the end of the notice (§ 33-992.02(1)). If it is not completed and returned within thirty days from the date of mailing, proof is an affidavit of the person who mailed it, with the certificate of mailing or the certified or registered mail receipt attached (§ 33-992.02(2)). Keep those receipts; PayApps does not print the affidavit.",
      "One notice covers all your work on the job, unless the actual estimated total price ends up 30% or more above the price in your last notice, or the work is furnished under contracts with more than one subcontractor; then the notice requirements are met again for the additional work (§ 33-992.01(G)).",
      "If the owner later sends information that shows your notice was inaccurate, give an amended notice within thirty days after receiving it (§ 33-992.01(K)). The owner must answer a written request for the job's information within ten days (§ 33-992.01(J)).",
      "The notice is one prerequisite; whether and when a lien can be recorded is set by the rest of Arizona's mechanics' lien statutes (A.R.S. § 33-981 and following), which this form does not check.",
    ],
  };
}
