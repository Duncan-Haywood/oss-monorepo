import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * Wyoming's one lien waiver form, Wyo. Stat. § 29-10-101(b).
 *
 * Wording copied from the Wyoming Legislature's published Title 29 on 2026-11-25
 * (https://wyoleg.gov/statutes/compress/title29.pdf; snapshot in sources/wy-29-10-101.txt).
 * Each blank the claimant fills is a `{{field}}` and its printed label became the field's label;
 * the notary acknowledgment's blanks stay printed rules ("____") for the notarial officer to fill.
 * test/wy.test.ts checks each sentence against the snapshot, and test/whole-form.test.ts compares
 * the form with the statute's as a whole.
 *
 * Wyoming differs from every other encoded state:
 * - The statute gives one form, "LIEN WAIVER", and says the form for waiver of a lien "shall be
 *   completed in substantially the following form" (§ 29-10-101(b)). It is not split into
 *   progress and final, or conditional and unconditional.
 * - The form waives "In consideration of the PAYMENT received to date" and "acknowledges receipt of
 *   payment", so it is listed as both unconditional kinds. It reserves the retainage withheld and
 *   any amount still unpaid, each a blank; on a final payment both are usually $0.00.
 * - There is no conditional wording, so the conditional kinds are listed with `absent` set
 *   (statutory.ts), as for Florida: tracked, never printed with wording this package made up.
 * - It ends in a notary acknowledgment, the only encoded form that does.
 */

export const WY_SOURCE_URL = "https://wyoleg.gov/statutes/compress/title29.pdf";
export const WY_CHECKED_ON = "2026-11-25";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

const FIELDS: readonly FieldSpec[] = [
  f(
    "customerName",
    "TO",
    "text",
    true,
    "Who the waiver is given to: the party that pays you (usually the general contractor) or the owner.",
  ),
  f("projectName", "PROJECT", "text", true),
  f("claimantName", "FROM", "text", true, "Your company's name."),
  f("signedDate", "DATE", "date", true),
  f(
    "amountPaidCents",
    "PAYMENT",
    "money",
    true,
    "The payment received that this waiver is given for.",
  ),
  f(
    "retainageHeldCents",
    "Retainage withheld",
    "money",
    true,
    "Retainage withheld to date; the waiver reserves your lien rights for it. Usually $0.00 on a final waiver.",
  ),
  f(
    "unpaidCents",
    "Not yet paid for work performed",
    "money",
    true,
    "What you are still owed for work or materials already provided; the waiver reserves your lien rights for it. Usually $0.00 on a final waiver.",
  ),
  f("signerTitle", "Title", "text", true, "The signer's title, e.g. President."),
];

export const WY_FIELDS: Partial<Record<WaiverKind, readonly FieldSpec[]>> = {
  "unconditional-progress": FIELDS,
  "unconditional-final": FIELDS,
};

const NOTE =
  "Note to lien claimant: Signing this form has legal implications. If you have any questions regarding how to complete this form or whether it has been properly completed, you should consult an attorney.";

const WAIVER =
  "In consideration of the PAYMENT received to date, the undersigned does hereby waive, release, and relinquish any and all claim and/or right of lien against the project and the real property improvements thereto for labor and/or materials furnished for use in construction of the project; provided however, the undersigned reserves all claims and/or rights of lien as to monies withheld as retainage in the amount of {{retainageHeldCents}}, and any labor and/or materials hereafter furnished for which payment has not yet been made. The undersigned has not been paid the sum of {{unpaidCents}} for work performed and/or materials provided under contract on this project and retains the right to file a lien against the property and pursue any and all actions to recover the full amount due, including any and all equitable claims. The undersigned acknowledges receipt of payment for work performed or materials provided and acknowledges that this waiver may be relied upon by the owner even if the undersigned accepts payment in uncertified funds and such payment is subsequently dishonored or revoked, in which case this lien waiver shall remain in full force and effect. The foregoing waiver shall not apply, however, if payment tendered by the owner is dishonored or revoked.";

const signature: BlockTemplate = {
  type: "signature",
  lines: [
    { label: "By (subcontractor/materialman/employee)", value: "" },
    { label: "Title", value: "{{signerTitle}}" },
    { label: "Date", value: "{{signedDate}}" },
  ] satisfies SignatureLineTemplate[],
};

/** The acknowledgment, completed by the notarial officer: its blanks stay printed rules. */
const ACKNOWLEDGMENT: readonly BlockTemplate[] = [
  { type: "paragraph", text: "STATE OF ____________________ )" },
  { type: "paragraph", text: ")ss." },
  { type: "paragraph", text: "COUNTY OF ____________________ )" },
  {
    type: "paragraph",
    text: "This instrument was acknowledged before me on this _____ day of _____________, 20___, by _____________________ (name of person) as lien claimant or ______________________ (title, position or type of authority granted by lien claimant) of _____________________________ (lien claimant).",
  },
  {
    type: "paragraph",
    text: "IN WITNESS THEREOF, I have hereunto set my hand and affixed my official seal on the day and year last above written.",
  },
  { type: "paragraph", text: "______________________________" },
  { type: "paragraph", text: "Notarial officer" },
  { type: "paragraph", text: "My Commission Expires:" },
  { type: "paragraph", text: "Seal:" },
];

const BODY: readonly BlockTemplate[] = [
  { type: "notice", text: NOTE },
  { type: "title", text: "LIEN WAIVER" },
  { type: "field", label: "TO", value: "{{customerName}}" },
  { type: "field", label: "PROJECT", value: "{{projectName}}" },
  { type: "field", label: "FROM", value: "{{claimantName}}" },
  { type: "field", label: "DATE", value: "{{signedDate}}" },
  { type: "field", label: "PAYMENT", value: "{{amountPaidCents}}" },
  { type: "paragraph", text: WAIVER },
  { type: "spacer" },
  signature,
  { type: "spacer" },
  ...ACKNOWLEDGMENT,
];

export const WY_BODIES: Partial<Record<WaiverKind, readonly BlockTemplate[]>> = {
  "unconditional-progress": BODY,
  "unconditional-final": BODY,
};

/** Why Wyoming has nothing to print for the conditional kinds. */
export const WY_NO_CONDITIONAL_FORM =
  "Wyoming's statute gives one lien waiver form (Wyo. Stat. § 29-10-101(b)), which waives in consideration of the payment received to date and acknowledges receipt of payment. It has no conditional wording, and this package does not supply any. Before signing a Wyoming waiver ahead of payment, ask counsel.";

export const WY_NOTES: readonly string[] = [
  'Wyoming: the form for waiver of a lien "shall be completed in substantially the following form" (Wyo. Stat. § 29-10-101(b)). It is the one form the statute gives, used here for progress and final waivers alike, and it ends in an acknowledgment before a notarial officer, who fills in its blanks.',
  "The waiver reserves lien rights for the retainage withheld and the amount not yet paid that you enter, and for labor or materials furnished later. On a final waiver both amounts are usually $0.00.",
  "The form says the waiver may be relied on, and stays in effect, if the undersigned accepts uncertified funds that are later dishonored or revoked, and also that it does not apply if payment tendered by the owner is dishonored or revoked. Both sentences are printed as the statute gives them; ask counsel before signing against a check that has not cleared.",
  "Wyo. Stat. § 29-2-112 also calls for a preliminary notice of the right to a lien, sent to the record owner within the time periods it specifies (form in § 29-10-101(a)). That notice can be printed too; the deadline is not checked.",
];
