import type { NoticeForm } from "./notices.ts";
import type { BlockTemplate, FieldSpec } from "./types.ts";

/**
 * Ohio's notice of furnishing for private improvements, Ohio Rev. Code § 1311.05: the notice a
 * subcontractor or material supplier serves, where a notice of commencement was recorded, on the
 * owner's designee (or the owner) and the original contractor named in that notice, "within
 * twenty-one days after performing the first labor or work or furnishing the first materials"
 * (division (A)). Division (B) says the notice "shall be in substantially the following form", so
 * the form is printed whole: the title, its "(For use in connection with improvements to property
 * other than public improvements)" line, each blank's caption in parentheses, and the WARNING TO
 * OWNER in capitals.
 *
 * Wording copied from codes.ohio.gov on 2026-11-28 (snapshot in sources/oh-1311.txt, with
 * §§ 1311.04 and 1311.19, the notice of commencement and the service rules the notes quote).
 * test/oh-notice.test.ts reads the form back out of the snapshot and checks the printed notice
 * against it word for word, blanks aside. Two changes, both blanks to write on: the statute prints
 * the original contractor's address caption with no line above it, and ends at "Date:" with no line;
 * the notice gives each a line so it can be filled in. The line after the other contracting party's
 * caption is printed as the statute prints it, for a longer name and address. The statute's quotation marks around the form
 * are left off.
 *
 * Not encoded: the public improvement notice of furnishing (§ 1311.261, served on the principal
 * contractor), counting the 21 days on the job, and the lien affidavit (§ 1311.06).
 */

export const OH_NOTICE_ID = "OH/notice-of-furnishing/statutory";
export const OH_NOTICE_SOURCE_URL = "https://codes.ohio.gov/ohio-revised-code/section-1311.05";
export const OH_NOTICE_CHECKED_ON = "2026-11-28";

/** § 1311.05(A): "within twenty-one days after performing the first labor or work". */
export const OH_NOTICE_DAYS = 21;

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

/** Each blank's caption, as § 1311.05(B) prints it in parentheses (its line breaks joined). */
export const OH_CAPTIONS = {
  designee: "(Name of owner, part owner, or lessee or designee from the notice of commencement)",
  designeeAddress: "(Address from the notice of commencement)",
  originalContractor: "(Name of original contractor from notice of commencement)",
  originalContractorAddress: "(Address of original contractor from notice of commencement)",
  contractedWith: "(name and address of other contracting party)",
  date: "(date)",
  claimant: "(Name and address of lien claimant)",
  signer: "(Name and capacity of party signing for lien claimant)",
  signerAddress: "(Address of party signing)",
} as const;

export const OH_SUBTITLE =
  "(For use in connection with improvements to property other than public improvements)";

export const OH_WARNING =
  "WARNING TO OWNER: THIS NOTICE IS REQUIRED BY THE OHIO MECHANICS' LIEN LAW. IF YOU HAVE ANY QUESTIONS ABOUT YOUR RIGHTS AND DUTIES UNDER THESE STATUTES YOU SHOULD SEEK LEGAL ASSISTANCE TO PROTECT YOU FROM THE POSSIBILITY OF PAYING TWICE FOR THE IMPROVEMENTS TO YOUR PROPERTY.";

const OH_NOTICE_FIELDS: readonly FieldSpec[] = [
  f(
    "designee",
    "To: the owner's designee named in the notice of commencement (or the owner if none)",
    "multiline",
    true,
    "Copy the designee's name from the job's notice of commencement. Only if it names no designee (or the designee has ceased to exist) is the notice served on the owner, part owner or lessee it names; with several owners, the first one named is enough (§ 1311.05(A)).",
  ),
  f(
    "designeeAddress",
    "Address from the notice of commencement",
    "multiline",
    true,
    "The address the notice of commencement gives for the person above; the statute says to serve it there.",
  ),
  f(
    "originalContractor",
    "To: the original contractor named in the notice of commencement",
    "multiline",
    true,
    "The contractor that holds the contract with the owner, as the notice of commencement names it. A sub or supplier in direct contract with this contractor need not serve it a copy (§ 1311.05(A)), but serving it costs nothing.",
  ),
  f(
    "originalContractorAddress",
    "Original contractor's address from the notice of commencement",
    "multiline",
    true,
    "As the notice of commencement lists it.",
  ),
  f(
    "contractedWith",
    "The other contracting party (who hired you), name and address",
    "multiline",
    true,
    "The company you contract with: the original contractor, or the subcontractor above you.",
  ),
  f(
    "propertyLocation",
    "Where the real property is",
    "multiline",
    true,
    "A street address or description that reasonably identifies the property is enough (§ 1311.05(C)).",
  ),
  f(
    "firstFurnishedDate",
    "Date you first performed labor or work or furnished materials (or will)",
    "date",
    true,
    "The form allows a future date: 'were performed or furnished first or will be performed or furnished first on'. The 21 days run from the actual first day.",
  ),
  f(
    "claimantName",
    "Lien claimant (your company's name)",
    "text",
    true,
    "Your company's legal name.",
  ),
  f(
    "claimantAddress",
    "Lien claimant's address",
    "multiline",
    true,
    "Your company's mailing address.",
  ),
  f(
    "signer",
    "By: name and capacity of the person signing",
    "text",
    true,
    "E.g. Dana Ruiz, President. Sign beside it on the printed notice.",
  ),
  f(
    "signerAddress",
    "Address of the person signing",
    "multiline",
    false,
    "Usually the company's address. Left blank, the notice prints a line.",
  ),
  f("signedDate", "Date", "date", true, "The date you sign and serve the notice."),
];

const RULE = "________________";

const line = (text: string, caption: string): BlockTemplate[] => [
  { type: "paragraph", text },
  { type: "paragraph", text: caption },
];

const OH_NOTICE_BODY: readonly BlockTemplate[] = [
  { type: "title", text: "Notice of Furnishing" },
  { type: "paragraph", text: OH_SUBTITLE },
  ...line("To: {{designee}}", OH_CAPTIONS.designee),
  ...line("{{designeeAddress}}", OH_CAPTIONS.designeeAddress),
  ...line("To: {{originalContractor}}", OH_CAPTIONS.originalContractor),
  ...line("{{originalContractorAddress}}", OH_CAPTIONS.originalContractorAddress),
  {
    type: "paragraph",
    text: "Please take notice that the undersigned is performing certain labor or work or furnishing certain materials to {{contractedWith}}",
  },
  { type: "paragraph", text: OH_CAPTIONS.contractedWith },
  { type: "paragraph", text: RULE },
  {
    type: "paragraph",
    text: "in connection with the improvement to the real property located at {{propertyLocation}}",
  },
  {
    type: "paragraph",
    text: "The labor, work, or materials were performed or furnished first or will be performed or furnished first on {{firstFurnishedDate}} (date).",
  },
  { type: "spacer" },
  { type: "notice", text: OH_WARNING },
  { type: "spacer" },
  { type: "paragraph", text: "{{claimantName}}" },
  ...line("{{claimantAddress}}", OH_CAPTIONS.claimant),
  ...line("By {{signer}}", OH_CAPTIONS.signer),
  ...line("{{signerAddress}}", OH_CAPTIONS.signerAddress),
  { type: "paragraph", text: "Date: {{signedDate}}" },
];

/** Ohio's notice of furnishing for a subcontractor or material supplier, Ohio Rev. Code § 1311.05. */
export function ohNoticeOfFurnishing(): NoticeForm {
  return {
    id: OH_NOTICE_ID,
    state: "OH",
    title: "Notice of furnishing",
    citation: {
      text: "Ohio Rev. Code § 1311.05",
      officialUrl: OH_NOTICE_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: OH_NOTICE_CHECKED_ON,
        sourceUrl: OH_NOTICE_SOURCE_URL,
        checkedBy: "sources/oh-1311.txt; test/oh-notice.test.ts",
      },
    },
    sendTo:
      "the owner's, part owner's, or lessee's designee named in the notice of commencement or amended notice and the original contractor",
    fields: OH_NOTICE_FIELDS,
    body: OH_NOTICE_BODY,
    attachment: null,
    notes: [
      'Ohio: where a notice of commencement was recorded, a subcontractor or material supplier serves the notice of furnishing on the designee and the original contractor named in it, "at the address listed in the notice or amended notice at any time after the recording of the notice of commencement or amended notice but within twenty-one days after performing the first labor or work or furnishing the first materials" (Ohio Rev. Code § 1311.05(A)). Print two copies: one to the designee, one to the original contractor.',
      'Serve it by "Certified or registered mail, overnight delivery service, hand delivery, or any other method which includes a written evidence of receipt" (§ 1311.19(A)(2)); "if service of a notice of furnishing is made by certified mail, service is complete on the date of the mailing" (§ 1311.19(B)). Keep the receipts. PayApps does not count the 21 days for you yet: write down the day you first furnished.',
      "A late notice \"preserves the subcontractor's or material supplier's lien rights for amounts owing for labor and work performed and materials furnished within the twenty-one-day period immediately preceding service of the notice of furnishing and thereafter\", but not for anything earlier (§ 1311.05(D)(1)).",
      'No notice of commencement, no notice of furnishing: none is needed "if the owner, part owner, or lessee who contracted for the labor, work, or materials fails to record a notice of commencement" (§ 1311.05(H)). If one is recorded late, or not served on your written request, the time runs "until twenty-one days after the notice of commencement has been recorded" or "until twenty-one days after the notice of commencement actually has been served" to you (§ 1311.04(I), (J)).',
      '"No original contractor has to serve a notice of furnishing to preserve lien rights arising from a contract with an owner, part owner, or lessee", and "No laborer must serve a notice of furnishing" (§ 1311.05(A), (G)). The section does not apply to a home construction contract (§ 1311.05(E)) or to public improvements, which have their own notice to the principal contractor (§ 1311.261).',
      "The notice is one step: the lien itself is an affidavit recorded with the county recorder within the time Ohio Rev. Code § 1311.06 sets (60, 75 or 120 days from the last work, by the kind of property), which this form does not check.",
    ],
  };
}
