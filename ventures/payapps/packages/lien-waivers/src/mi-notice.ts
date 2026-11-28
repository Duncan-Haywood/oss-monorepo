import type { NoticeForm } from "./notices.ts";
import type { BlockTemplate, FieldSpec } from "./types.ts";

/**
 * Michigan's notice of furnishing, Mich. Comp. Laws § 570.1109 (Construction Lien Act, section 109):
 * the notice a subcontractor or supplier gives "to the designee and the general contractor, if any,
 * as named in the notice of commencement ... within 20 days after furnishing the first labor or
 * material" (subsection 1). Subsection 4 says the notice, "if not given on the form attached to the
 * notice of commencement, must be in substantially the following form", so the form is printed
 * whole: the title, each line's caption in parentheses under its blank, the sentence that names the
 * notice of commencement by liber, page and county "or (a copy of which is attached to this
 * notice)", and the WARNING TO OWNER in capitals.
 *
 * Wording copied from the Michigan Legislature's published text on 2026-11-28 (snapshot in
 * sources/mi-570-1108-1109.txt, with sections 108 and 108a, the notices of commencement the form
 * refers to). test/mi-notice.test.ts reads the form back out of the snapshot and checks the printed
 * notice against it word for word, so an edit that drifts from the statute fails the build. One
 * change: the statute's form ends "Date:....... ." and the stray full stop after the blank is left off.
 *
 * Not encoded: the laborer's notices of furnishing (subsections 2 and 3, timed from unpaid wages or
 * fringe benefits, not from first furnishing), counting the 20 days on the job, and the claim of lien
 * itself (§ 570.1111).
 */

export const MI_NOTICE_ID = "MI/notice-of-furnishing/statutory";
export const MI_NOTICE_SOURCE_URL =
  "https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-570-1109";
export const MI_NOTICE_CHECKED_ON = "2026-11-28";

/** § 570.1109(1): "within 20 days after furnishing the first labor or material". */
export const MI_NOTICE_DAYS = 20;

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

/** Each blank's caption, as § 570.1109(4) prints it in parentheses under the line. */
export const MI_CAPTIONS = {
  designee: "(name of designee (or owner or lessee) from notice of commencement)",
  designeeAddress: "(address from notice of commencement)",
  contractedWith: "(name and address of other contracting party)",
  work: "(describe type of work)",
  county: "(name of county)",
  claimant: "(name and address of lien claimant)",
  signer: "(name and capacity of party signing for lien claimant)",
  signerAddress: "(address of party signing)",
} as const;

export const MI_ATTACHED = "or (a copy of which is attached to this notice)";

export const MI_WARNING =
  "WARNING TO OWNER: THIS NOTICE IS REQUIRED BY THE MICHIGAN CONSTRUCTION LIEN ACT. IF YOU HAVE QUESTIONS ABOUT YOUR RIGHTS AND DUTIES UNDER THIS ACT, YOU SHOULD CONTACT AN ATTORNEY TO PROTECT YOU FROM THE POSSIBILITY OF PAYING TWICE FOR THE IMPROVEMENTS TO YOUR PROPERTY.";

const RULE = "________________";

const MI_NOTICE_FIELDS: readonly FieldSpec[] = [
  f(
    "designee",
    "To: the designee named in the notice of commencement (or the owner or lessee if none)",
    "multiline",
    true,
    "Copy the designee's name from the job's notice of commencement. Only if it names no designee (or the designee has died) is the notice served on the owner or lessee it names (§ 570.1109(1)).",
  ),
  f(
    "designeeAddress",
    "Address from the notice of commencement",
    "multiline",
    true,
    "The address the notice of commencement gives for the person above; the statute says to serve it there.",
  ),
  f(
    "contractedWith",
    "The other contracting party (who hired you), name and address",
    "multiline",
    true,
    "The company you contract with: the general contractor, or the subcontractor above you.",
  ),
  f(
    "workDescription",
    "Type of work (labor or material you furnish)",
    "multiline",
    true,
    "E.g. electrical rough-in and finish, labor and materials.",
  ),
  f(
    "liber",
    "Liber the notice of commencement is recorded in",
    "text",
    false,
    "From the register of deeds' recording stamp on the notice of commencement. If you attach a copy of the notice of commencement instead, leave liber, page and county blank; they print as lines.",
  ),
  f("page", "Page", "text", false, "The page of that liber."),
  f(
    "county",
    "County whose records it is recorded in",
    "text",
    false,
    "E.g. Oakland. A residential job's notice of commencement is not recorded (§ 570.1108a): attach a copy of it instead.",
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

const line = (text: string, caption: string): BlockTemplate[] => [
  { type: "paragraph", text },
  { type: "paragraph", text: caption },
];

const MI_NOTICE_BODY: readonly BlockTemplate[] = [
  { type: "title", text: "NOTICE OF FURNISHING" },
  ...line("To: {{designee}}", MI_CAPTIONS.designee),
  ...line("{{designeeAddress}}", MI_CAPTIONS.designeeAddress),
  ...line(
    "Please take notice that the undersigned is furnishing to {{contractedWith}}",
    MI_CAPTIONS.contractedWith,
  ),
  ...line("certain labor or material for {{workDescription}},", MI_CAPTIONS.work),
  ...line(
    "in connection with the improvements to the real property described in the notice of commencement recorded in liber {{liber}}, on page {{page}}, {{county}} records,",
    MI_CAPTIONS.county,
  ),
  { type: "paragraph", text: RULE },
  { type: "paragraph", text: MI_ATTACHED },
  { type: "spacer" },
  { type: "notice", text: MI_WARNING },
  { type: "spacer" },
  { type: "paragraph", text: "{{claimantName}}" },
  ...line("{{claimantAddress}}", MI_CAPTIONS.claimant),
  ...line("by {{signer}}", MI_CAPTIONS.signer),
  ...line("{{signerAddress}}", MI_CAPTIONS.signerAddress),
  { type: "paragraph", text: "Date: {{signedDate}}" },
];

/** Michigan's notice of furnishing for a subcontractor or supplier, Mich. Comp. Laws § 570.1109. */
export function miNoticeOfFurnishing(): NoticeForm {
  return {
    id: MI_NOTICE_ID,
    state: "MI",
    title: "Notice of furnishing",
    citation: {
      text: "Mich. Comp. Laws § 570.1109",
      officialUrl: MI_NOTICE_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: MI_NOTICE_CHECKED_ON,
        sourceUrl: MI_NOTICE_SOURCE_URL,
        checkedBy: "sources/mi-570-1108-1109.txt; test/mi-notice.test.ts",
      },
    },
    sendTo:
      "the designee and the general contractor, if any, as named in the notice of commencement at the address shown in the notice of commencement",
    fields: MI_NOTICE_FIELDS,
    body: MI_NOTICE_BODY,
    attachment: null,
    notes: [
      'Michigan: a subcontractor or supplier "shall provide a notice of furnishing to the designee and the general contractor, if any, as named in the notice of commencement at the address shown in the notice of commencement, either personally or by certified mail, within 20 days after furnishing the first labor or material" (Mich. Comp. Laws § 570.1109(1)). Print two copies: one to the designee, one to the general contractor. "If a designee has not been named in the notice of commencement, or if the designee has died, service must be made on the owner or lessee named in the notice of commencement."',
      '"If service of the notice of furnishing is made by certified mail, service is complete on mailing" (§ 570.1109(1)). Keep the certified mail receipts. PayApps does not count the 20 days for you yet: write down the day you first furnished.',
      'A late notice does not lose the lien for work after it is served, and keeps it for earlier work "except to the extent that payments were made by or on behalf of the owner or lessee to the contractor pursuant to either a contractor\'s sworn statement or a waiver of lien" for your work (§ 570.1109(5), (6)). Serving on time is what protects the work before the notice.',
      'The 20 days wait for the notice of commencement: if the owner fails to record one, the time runs "until 20 days after the notice of commencement has been recorded" (§ 570.1108(10)); if the owner, lessee or designee fails to provide one on your written request by certified mail, "until 20 days after the notice of commencement actually has been furnished" to you (§ 570.1108(11); § 570.1108a(9) for a residential structure, whose notice of commencement is provided on request, not recorded). Anyone up the chain who has it must send you a copy "within 10 days after the date of mailing of a written request by certified mail" (§ 570.1108(5) to (7)).',
      "\"A contractor is not required to provide a notice of furnishing to preserve lien rights arising from his or her contract directly with an owner or lessee\" (§ 570.1109(1)). A laborer's notice is timed from unpaid wages or fringe benefits (§ 570.1109(2), (3)) and is not this form's use.",
      "The notice is one step: the claim of lien is recorded separately, within the time the rest of the Construction Lien Act (Mich. Comp. Laws § 570.1101 and following) sets, which this form does not check.",
    ],
  };
}
