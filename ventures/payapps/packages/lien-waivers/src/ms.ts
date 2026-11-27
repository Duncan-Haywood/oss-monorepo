import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * Mississippi's two statutory waiver forms, Miss. Code Ann. § 85-7-433(1) (interim payment) and (2)
 * (final payment), which § 85-7-419(2) and (3) say a waiver "shall substantially follow".
 *
 * The official Code is published through LexisNexis, which the build environment cannot reach
 * (Justia and FindLaw answer 403), so the wording comes from the Act that wrote both sections:
 * SB 2622 (2014 Regular Session), "As Sent to Governor", approved 11 Apr 2014, as published by the
 * Mississippi Legislature (sources/ms-85-7-433.txt says how, and how later sessions were searched
 * for amendments). test/ms.test.ts checks each sentence against that snapshot and
 * test/whole-form.test.ts compares each form with the statute's as a whole.
 *
 * How Mississippi differs:
 * - Like Georgia's (whose pre-2021 forms Mississippi's follow closely), the forms are "upon
 *   payment" and "upon final payment", neither conditional nor unconditional: each waives "upon the
 *   receipt of the sum of $____", and § 85-7-419(5)(b) deems the amount paid in full at the earliest
 *   of the money arriving, a separate written acknowledgment of payment in full, or **sixty** days
 *   after the waiver was signed unless the claimant files an affidavit of nonpayment first. So the
 *   interim form is listed as both progress kinds and the final form as both final kinds.
 * - Every form is sworn before a notary ("SWORN TO AND SUBSCRIBED BEFORE ME ... NOTARY PUBLIC"),
 *   and the notary's blanks stay printed rules for the notary to fill, as on Wyoming's.
 * - The final payment form prints its signature and notary lines twice, above and below the NOTICE,
 *   in the bill's HTML and PDF alike. Both are printed, as the statute gives them.
 * - The statute prints no rule for the property description, only the caption telling the claimant
 *   how to describe it; the description is printed above that caption, as on Georgia's form.
 * - The statute prints no line for the claimant's name ("THE UNDERSIGNED ... BY: ... ITS: ..."):
 *   this package adds one, labelled "Claimant", above the signature, as it does for Georgia.
 */

export const MS_SOURCE_URL =
  "https://billstatus.ls.state.ms.us/documents/2014/html/SB/2600-2699/SB2622SG.htm";
export const MS_CHECKED_ON = "2026-11-26";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

/** The heading and recital blanks, shared by both waivers and the affidavit of nonpayment. */
export const MS_HEAD_FIELDS: readonly FieldSpec[] = [
  f(
    "county",
    "County (heading)",
    "text",
    true,
    "The Mississippi county in the form's heading, STATE OF MISSISSIPPI, COUNTY OF ____: where the form is signed before the notary, usually the property's county.",
  ),
  f(
    "customerName",
    "Name of contractor",
    "text",
    true,
    "Who employed you to furnish the work: for a subcontractor, usually the general contractor.",
  ),
  f(
    "workDescription",
    "Materials and/or labor furnished",
    "text",
    true,
    "What you furnished, e.g. electrical labor and materials.",
  ),
  f("projectName", "Title of the project or building", "text", true),
  f("cityOrTown", "City the improvements are in", "text", true),
  f("propertyCounty", "County the improvements are in", "text", true),
  f("ownerName", "Name of owner", "text", true, "The owner of the property."),
  f(
    "propertyDescription",
    "Property description",
    "multiline",
    true,
    "A metes and bounds description, the land lot district, block and lot number, or the street address of the project.",
  ),
];

/** The signer's lines, shared by both waivers and the affidavit. */
export const MS_SIGNER_FIELDS: readonly FieldSpec[] = [
  f(
    "claimantName",
    "Claimant",
    "text",
    true,
    "Your company's name, printed above the signature (the statute's form has no line for it).",
  ),
  f(
    "signerName",
    "Print name",
    "text",
    false,
    "The person signing, printed on the BY: line. Left blank, it is a line to fill in by hand.",
  ),
  f(
    "signerTitle",
    "Print title",
    "text",
    false,
    "The signer's title, e.g. President, printed on the ITS: line. Left blank, it is a line to fill in by hand.",
  ),
];

const SUM: FieldSpec = f(
  "amountPaidCents",
  "Sum",
  "money",
  true,
  "The payment this waiver is given for. It waives upon receipt of this sum.",
);

const THROUGH: FieldSpec = f(
  "throughDate",
  "Through date",
  "date",
  true,
  "The waiver covers liens and bond rights through this date, excepting retained amounts.",
);

export const MS_INTERIM_FIELDS: readonly FieldSpec[] = [
  ...MS_HEAD_FIELDS,
  SUM,
  THROUGH,
  ...MS_SIGNER_FIELDS,
];
export const MS_FINAL_FIELDS: readonly FieldSpec[] = [...MS_HEAD_FIELDS, SUM, ...MS_SIGNER_FIELDS];

export const MS_FIELDS: Partial<Record<WaiverKind, readonly FieldSpec[]>> = {
  "conditional-progress": MS_INTERIM_FIELDS,
  "unconditional-progress": MS_INTERIM_FIELDS,
  "conditional-final": MS_FINAL_FIELDS,
  "unconditional-final": MS_FINAL_FIELDS,
};

export const MS_RECITAL =
  "THE UNDERSIGNED MECHANIC AND/OR MATERIALMAN HAS BEEN EMPLOYED BY {{customerName}} (NAME OF CONTRACTOR) TO FURNISH {{workDescription}} (DESCRIBE MATERIALS AND/OR LABOR) FOR THE CONSTRUCTION OF IMPROVEMENTS KNOWN AS {{projectName}} (TITLE OF THE PROJECT OR BUILDING) WHICH IS LOCATED IN THE CITY OF {{cityOrTown}}, COUNTY OF {{propertyCounty}}, AND IS OWNED BY {{ownerName}} (NAME OF OWNER) AND MORE PARTICULARLY DESCRIBED AS FOLLOWS:";

export const MS_PROPERTY_CAPTION =
  "(DESCRIBE THE PROPERTY UPON WHICH THE IMPROVEMENTS WERE MADE BY USING EITHER A METES AND BOUNDS DESCRIPTION, THE LAND LOT DISTRICT, BLOCK AND LOT NUMBER, OR STREET ADDRESS OF THE PROJECT.)";

const INTERIM_WAIVER =
  "UPON THE RECEIPT OF THE SUM OF {{amountPaidCents}}, THE MECHANIC AND/OR MATERIALMAN WAIVES AND RELEASES ANY AND ALL LIENS OR CLAIMS OF LIENS IT HAS UPON THE FOREGOING DESCRIBED PROPERTY OR ANY RIGHTS AGAINST ANY LABOR AND/OR MATERIAL BOND THROUGH THE DATE OF {{throughDate}} (DATE) AND EXCEPTING THOSE RIGHTS AND LIENS THAT THE MECHANIC AND/OR MATERIALMAN MIGHT HAVE IN ANY RETAINED AMOUNTS, ON ACCOUNT OF LABOR OR MATERIALS, OR BOTH, FURNISHED BY THE UNDERSIGNED TO OR ON ACCOUNT OF SAID CONTRACTOR FOR SAID BUILDING OR PREMISES.";

const FINAL_WAIVER =
  "UPON THE RECEIPT OF THE SUM OF {{amountPaidCents}}, THE MECHANIC AND/OR MATERIALMAN WAIVES AND RELEASES ANY AND ALL LIENS OR CLAIMS OF LIENS IT HAS UPON THE FOREGOING DESCRIBED PROPERTY OR ANY RIGHTS AGAINST ANY LABOR AND/OR MATERIAL BOND ON ACCOUNT OF LABOR OR MATERIALS, OR BOTH, FURNISHED BY THE UNDERSIGNED TO OR ON ACCOUNT OF SAID CONTRACTOR FOR SAID PROPERTY.";

/** The notice the statute requires "on the face of the form" (its last sentence says so). */
export const MS_NOTICE =
  "NOTICE: WHEN YOU EXECUTE AND SUBMIT THIS DOCUMENT, YOU SHALL BE CONCLUSIVELY DEEMED TO HAVE BEEN PAID IN FULL THE AMOUNT STATED ABOVE, EVEN IF YOU HAVE NOT ACTUALLY RECEIVED THE PAYMENT, SIXTY (60) DAYS AFTER THE DATE STATED ABOVE UNLESS YOU FILE EITHER AN AFFIDAVIT OF NONPAYMENT OR A CLAIM OF LIEN BEFORE THE EXPIRATION OF THE SIXTY-DAY PERIOD. THE FAILURE TO INCLUDE THIS NOTICE LANGUAGE ON THE FACE OF THE FORM SHALL RENDER THE FORM UNENFORCEABLE AND INVALID AS A WAIVER AND RELEASE UNDER SECTION 85-7-419, MISSISSIPPI CODE OF 1972.";

/** "____ SIGNATURE / BY: ____ (PRINT NAME) / ITS: ____ (PRINT TITLE)", with our Claimant line. */
export const MS_SIGNATURE: BlockTemplate = {
  type: "signature",
  lines: [
    { label: "Claimant", value: "{{claimantName}}" },
    { label: "SIGNATURE", value: "" },
    { label: "BY (PRINT NAME)", value: "{{signerName}}" },
    { label: "ITS (PRINT TITLE)", value: "{{signerTitle}}" },
  ] satisfies SignatureLineTemplate[],
};

/** The jurat, completed by the notary: its blanks stay printed rules. */
export const MS_JURAT: readonly BlockTemplate[] = [
  {
    type: "paragraph",
    text: "SWORN TO AND SUBSCRIBED BEFORE ME, THIS THE ____ DAY OF _________, 20__.",
  },
  { type: "paragraph", text: "___________________________________" },
  { type: "paragraph", text: "NOTARY PUBLIC" },
];

export const MS_HEADING: readonly BlockTemplate[] = [
  { type: "paragraph", text: "STATE OF MISSISSIPPI" },
  { type: "paragraph", text: "COUNTY OF {{county}}" },
  { type: "paragraph", text: MS_RECITAL },
  { type: "paragraph", text: "{{propertyDescription}}" },
  { type: "paragraph", text: MS_PROPERTY_CAPTION },
];

export const MS_INTERIM_TITLE = "INTERIM WAIVER AND RELEASE UPON PAYMENT";
export const MS_FINAL_TITLE = "WAIVER AND RELEASE UPON FINAL PAYMENT";

const INTERIM: readonly BlockTemplate[] = [
  { type: "title", text: MS_INTERIM_TITLE },
  ...MS_HEADING,
  { type: "paragraph", text: INTERIM_WAIVER },
  MS_SIGNATURE,
  ...MS_JURAT,
  { type: "notice", text: MS_NOTICE },
];

// § 85-7-433(2) prints the signature and notary lines before the NOTICE and again after it.
const FINAL: readonly BlockTemplate[] = [
  { type: "title", text: MS_FINAL_TITLE },
  ...MS_HEADING,
  { type: "paragraph", text: FINAL_WAIVER },
  MS_SIGNATURE,
  ...MS_JURAT,
  { type: "notice", text: MS_NOTICE },
  MS_SIGNATURE,
  ...MS_JURAT,
];

export const MS_BODIES: Partial<Record<WaiverKind, readonly BlockTemplate[]>> = {
  "conditional-progress": INTERIM,
  "unconditional-progress": INTERIM,
  "conditional-final": FINAL,
  "unconditional-final": FINAL,
};

export const MS_NOTES: readonly string[] = [
  'Mississippi: Miss. Code Ann. § 85-7-433 gives two forms, an interim waiver and release upon payment ((1)) and a waiver and release upon final payment ((2)), which a waiver "shall substantially follow" (§ 85-7-419(2), (3)). Neither is conditional or unconditional; the same form is used whether or not the money has arrived. A blank filled in wrongly does not invalidate the form "if the subject matter of the release reasonably may be determined".',
  "Sixty days (§ 85-7-419(5)(b)): once signed, the amount is conclusively deemed paid in full at the earliest of the payment actually arriving, a separate written acknowledgment of payment in full, or 60 days after the waiver was signed, unless before then you file an affidavit of nonpayment in the county where the property is and send the owner a copy. If you sign before you are paid and the money does not come, the 60 days run anyway. The form's NOTICE also names filing a claim of lien.",
  "The affidavit of nonpayment has its own statutory form (§ 85-7-433(3)), sworn before a notary; within two days of filing it, a copy goes to the owner by registered or certified mail or statutory overnight delivery. PayApps can print it filled from the waiver; ask counsel before filing.",
  "The interim waiver covers lien and bond rights through the date you enter and excepts retained amounts; the final waiver has no exception. No lien or bond right can be waived before the work is furnished (§ 85-7-419(1)).",
  "Each form is sworn before a notary: sign it in the notary's presence. The final payment form prints its signature and notary lines twice, above and below the notice, as the statute does.",
  "Wording: from SB 2622 (2014), the Act that created §§ 85-7-419 and 85-7-433, as sent to the Governor and published by the Mississippi Legislature; no later amendment was found. The official Code (published through LexisNexis) was not read; check it, or have counsel check it, before relying on the form.",
];
