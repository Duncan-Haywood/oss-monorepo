import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * Georgia's two statutory waiver forms, O.C.G.A. § 44-14-366(d) (interim payment) and (e) (final
 * payment).
 *
 * The official Code is published through LexisNexis, which the build environment cannot reach, so
 * the wording comes from the two Acts that wrote the current section, both as passed and published
 * by the State: SB 315 (2020), which rewrote § 44-14-366 effective 1 Jan 2021, and SB 143 (2021),
 * which rewrote (g)(2), the affidavit of nonpayment. The bills' struck words were dropped and their
 * underlined words kept (sources/ga-44-14-366.txt says how). test/ga.test.ts checks each sentence
 * against that snapshot and test/whole-form.test.ts compares each form with the statute's as a
 * whole.
 *
 * How Georgia differs:
 * - The statute prints two forms, "upon interim payment" and "upon final payment". Neither is
 *   conditional or unconditional: each waives "upon the receipt of the sum of $____", and
 *   § 44-14-366(g)(2) makes the waiver effective at the earliest of the money actually arriving, a
 *   separate written acknowledgment of payment in full, or ninety days after it was signed unless
 *   the claimant files an affidavit of nonpayment in the property's county before then. So the
 *   interim form is listed as both progress kinds and the final form as both final kinds, and the
 *   notes say what the ninety days mean.
 * - Both forms "shall substantially follow the language" given, "be in at least 12 point font, and
 *   need not be in boldface capital letters" ((d), (e)): `GA_MIN_FONT_PT` is how the PDF printer
 *   learns the size. The forms keep the statute's capitals.
 * - The forms are dated by hand ("GIVEN UNDER HAND AND SEAL THIS ____ DAY OF ____, ____."), signed
 *   under seal, and have a witness line and an address line. They print no labels on those lines
 *   beyond "(SEAL)", "(WITNESS)" and "(ADDRESS)"; the claimant's name goes on the unlabelled line
 *   under the seal, which this package labels "Claimant".
 * - The captions the statute prints after each blank ("(NAME OF CONTRACTOR)" and so on) are kept,
 *   so the printed form reads as the statute's does.
 */

export const GA_SOURCE_URL =
  "https://gov.georgia.gov/document/2020-signed-legislation/sb-315/download";
export const GA_AMENDMENT_URL =
  "https://gov.georgia.gov/document/2021-signed-legislation/sb-143/download";
export const GA_CHECKED_ON = "2026-11-26";
/** "at least 12 point font" (O.C.G.A. § 44-14-366(d), (e)). */
export const GA_MIN_FONT_PT = 12;

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

const HEAD: readonly FieldSpec[] = [
  f(
    "county",
    "County (heading)",
    "text",
    true,
    "The Georgia county in the form's heading, STATE OF GEORGIA, COUNTY OF ____: where the waiver is signed, usually the property's county.",
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
  f(
    "amountPaidCents",
    "Sum",
    "money",
    true,
    "The payment this waiver is given for. It waives upon receipt of this sum.",
  ),
  f(
    "claimantName",
    "Claimant",
    "text",
    true,
    "Your company's name, printed on the line under the seal.",
  ),
];

const THROUGH: FieldSpec = f(
  "throughDate",
  "Through date",
  "date",
  true,
  "The waiver covers liens and bond rights through this date, excepting retained amounts.",
);

export const GA_INTERIM_FIELDS: readonly FieldSpec[] = [...HEAD, THROUGH];
export const GA_FINAL_FIELDS: readonly FieldSpec[] = HEAD;

export const GA_FIELDS: Partial<Record<WaiverKind, readonly FieldSpec[]>> = {
  "conditional-progress": GA_INTERIM_FIELDS,
  "unconditional-progress": GA_INTERIM_FIELDS,
  "conditional-final": GA_FINAL_FIELDS,
  "unconditional-final": GA_FINAL_FIELDS,
};

const RECITAL =
  "THE UNDERSIGNED MECHANIC AND/OR MATERIALMAN HAS BEEN EMPLOYED BY {{customerName}} (NAME OF CONTRACTOR) TO FURNISH {{workDescription}} (DESCRIBE MATERIALS AND/OR LABOR) FOR THE CONSTRUCTION OF IMPROVEMENTS KNOWN AS {{projectName}} (TITLE OF THE PROJECT OR BUILDING) WHICH IS LOCATED IN THE CITY OF {{cityOrTown}}, COUNTY OF {{propertyCounty}}, AND IS OWNED BY {{ownerName}} (NAME OF OWNER) AND MORE PARTICULARLY DESCRIBED AS FOLLOWS:";

const PROPERTY_CAPTION =
  "(DESCRIBE THE PROPERTY UPON WHICH THE IMPROVEMENTS WERE MADE BY USING EITHER A METES AND BOUNDS DESCRIPTION, THE LAND LOT DISTRICT, BLOCK AND LOT NUMBER, OR STREET ADDRESS OF THE PROJECT.)";

const INTERIM_WAIVER =
  "UPON THE RECEIPT OF THE SUM OF {{amountPaidCents}}, THE MECHANIC AND/OR MATERIALMAN WAIVES AND RELEASES ANY AND ALL LIENS OR CLAIMS OF LIENS IT HAS UPON THE FOREGOING DESCRIBED PROPERTY OR ANY RIGHTS AGAINST ANY LABOR AND/OR MATERIAL BOND THROUGH THE DATE OF {{throughDate}} (DATE) AND EXCEPTING THOSE RIGHTS AND LIENS THAT THE MECHANIC AND/OR MATERIALMAN MIGHT HAVE IN ANY RETAINED AMOUNTS, ON ACCOUNT OF LABOR OR MATERIALS, OR BOTH, FURNISHED BY THE UNDERSIGNED TO OR ON ACCOUNT OF SAID CONTRACTOR FOR SAID BUILDING OR PREMISES.";

const FINAL_WAIVER =
  "UPON THE RECEIPT OF THE SUM OF {{amountPaidCents}}, THE MECHANIC AND/OR MATERIALMAN WAIVES AND RELEASES ANY AND ALL LIENS OR CLAIMS OF LIENS IT HAS UPON THE FOREGOING DESCRIBED PROPERTY OR ANY RIGHTS AGAINST ANY LABOR AND/OR MATERIAL BOND ON ACCOUNT OF LABOR OR MATERIALS, OR BOTH, FURNISHED BY THE UNDERSIGNED TO OR ON ACCOUNT OF SAID CONTRACTOR FOR SAID PROPERTY.";

/** Dated by hand when signed under seal, as the statute prints it. */
const GIVEN = "GIVEN UNDER HAND AND SEAL THIS ______ DAY OF ______________, ____.";

/** The notice the statute requires "on the face of the form" (its last sentence says so). */
export const GA_NOTICE =
  "NOTICE: WHEN YOU EXECUTE AND SUBMIT THIS DOCUMENT, YOU SHALL BE CONCLUSIVELY DEEMED TO HAVE WAIVED AND RELEASED ANY AND ALL LIENS AND CLAIMS OF LIENS UPON THE FOREGOING DESCRIBED PROPERTY AND ANY RIGHTS REGARDING ANY LABOR OR MATERIAL BOND REGARDING THE SAID PROPERTY TO THE EXTENT (AND ONLY TO THE EXTENT) SET FORTH ABOVE, EVEN IF YOU HAVE NOT ACTUALLY RECEIVED SUCH PAYMENT, 90 DAYS AFTER THE DATE STATED ABOVE UNLESS YOU FILE AN AFFIDAVIT OF NONPAYMENT PRIOR TO THE EXPIRATION OF SUCH 90 DAY PERIOD. THE FAILURE TO INCLUDE THIS NOTICE LANGUAGE ON THE FORM SHALL RENDER THE FORM UNENFORCEABLE AND INVALID AS A WAIVER AND RELEASE UNDER O.C.G.A. § 44-14-366.";

const signature: BlockTemplate = {
  type: "signature",
  lines: [
    { label: "(SEAL)", value: "" },
    { label: "Claimant", value: "{{claimantName}}" },
    { label: "(WITNESS)", value: "" },
    { label: "(ADDRESS)", value: "" },
  ] satisfies SignatureLineTemplate[],
};

function body(title: string, waiver: string): readonly BlockTemplate[] {
  return [
    { type: "title", text: title },
    { type: "paragraph", text: "STATE OF GEORGIA" },
    { type: "paragraph", text: "COUNTY OF {{county}}" },
    { type: "paragraph", text: RECITAL },
    { type: "paragraph", text: "{{propertyDescription}}" },
    { type: "paragraph", text: PROPERTY_CAPTION },
    { type: "paragraph", text: waiver },
    { type: "paragraph", text: GIVEN },
    signature,
    { type: "notice", text: GA_NOTICE },
  ];
}

export const GA_INTERIM_TITLE =
  "WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS UPON INTERIM PAYMENT";
export const GA_FINAL_TITLE =
  "WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS UPON FINAL PAYMENT";

const INTERIM = body(GA_INTERIM_TITLE, INTERIM_WAIVER);
const FINAL = body(GA_FINAL_TITLE, FINAL_WAIVER);

export const GA_BODIES: Partial<Record<WaiverKind, readonly BlockTemplate[]>> = {
  "conditional-progress": INTERIM,
  "unconditional-progress": INTERIM,
  "conditional-final": FINAL,
  "unconditional-final": FINAL,
};

export const GA_NOTES: readonly string[] = [
  'Georgia: O.C.G.A. § 44-14-366 gives two forms, one upon interim payment ((d)) and one upon final payment ((e)), which a waiver "shall substantially follow", printed "in at least 12 point font". Neither is conditional or unconditional; the same form is used whether or not the money has arrived.',
  "Ninety days (§ 44-14-366(g)(2)): once signed, the waiver is conclusively effective at the earliest of the payment actually arriving, a separate written acknowledgment of payment in full, or 90 days after it was signed, unless before then you file an affidavit of nonpayment in the county where the property is. If you sign before you are paid and the money does not come, the 90 days run anyway. The statute names only the affidavit of nonpayment as stopping them.",
  "The affidavit of nonpayment has its own statutory form (§ 44-14-366(g)(2)), sworn before a notary; within seven days of filing it, a copy goes to the owner by registered or certified mail or statutory overnight delivery, and in some cases to the contractor. PayApps prints it filled from the waiver and counts the 90 days from the day the waiver is marked sent; ask counsel before filing.",
  "The interim waiver covers lien and bond rights through the date you enter and excepts retained amounts; the final waiver has no exception. Both are limited to lien and labor or material bond rights and do not affect your other rights or remedies (§ 44-14-366(a)), and no lien or bond right can be waived before the work is furnished ((b)).",
  "Sign under seal, date it by hand, and have it witnessed: the form has lines for the seal, a witness and an address.",
  "Wording: rebuilt from the two Acts that wrote § 44-14-366, SB 315 (2020, in force 1 Jan 2021) and SB 143 (2021), as passed and published by the State of Georgia. The official Code (published through LexisNexis) was not read; check it, or have counsel check it, before relying on the form.",
];
