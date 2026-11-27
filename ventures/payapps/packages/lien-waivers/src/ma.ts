import type { BlockTemplate, FieldSpec, FormDefinition, SignatureLineTemplate } from "./types.ts";

/**
 * Massachusetts' one statutory waiver form, the Partial Waiver and Subordination of Lien of
 * Mass. Gen. Laws c. 254, § 32(4).
 *
 * Wording copied from the General Court's published text on 2026-11-26 (snapshot in
 * sources/ma-254-32.txt). test/ma.test.ts checks each sentence against the snapshot and
 * test/whole-form.test.ts compares the form with the statute's as a whole.
 *
 * How Massachusetts differs:
 * - § 32 makes a covenant or agreement "purporting to bar the filing of a notice of contract or the
 *   taking of any steps to enforce a lien" under chapter 254 "void and unenforceable", with four
 *   exceptions. The fourth is this form: "partial waivers and subordinations of liens given by
 *   persons who have filed or recorded notices of contract under section two substantially in the
 *   following form with no material deviation therefrom".
 * - So the form exists for one kind only, a partial (progress) waiver, and § 32(4) names who gives
 *   it: a person who has filed or recorded a notice of contract under § 2. It waives "upon receipt
 *   of" the payment it names, so it is listed as the conditional progress kind.
 * - Its header is the pay application's own arithmetic (original contract, approved change orders,
 *   completed to date, retainage, previous payments, current amount due), which PayApps fills from
 *   the G702 summary.
 * - The statute prints no final or unconditional form.
 *
 * Like Missouri, Massachusetts is not a statutory-forms state here: `listForms("MA")` returns the
 * general forms (with Massachusetts notes) and this form is offered beside them by
 * `alternativeForms("MA")`, with `appliesTo` saying when it applies. It is never picked
 * automatically, because whether a notice of contract was filed decides it and PayApps does not
 * know that. Whether any other waiver is enforceable on a Massachusetts job is a question for
 * counsel; this package does not answer it.
 */

export const MA_SOURCE_URL =
  "https://malegislature.gov/Laws/GeneralLaws/PartIII/TitleIV/Chapter254/Section32";
export const MA_CHECKED_ON = "2026-11-26";
export const MA_PARTIAL_FORM_ID = "MA/conditional-progress/statutory-partial-subordination";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

/** The form's blanks, in the order the statute prints them. */
export const MA_FIELDS: readonly FieldSpec[] = [
  f("signedDate", "Date", "date", true),
  f("county", "County", "text", true, "The Massachusetts county the property is in."),
  f("applicationNumber", "Application for Payment No.", "text", true),
  f("ownerName", "Owner", "text", true, "The owner of the property, as of record."),
  f(
    "contractorName",
    "Contractor",
    "text",
    true,
    "The header's CONTRACTOR line. The statute's closing sentence calls the person giving this waiver a contractor.",
  ),
  f("lenderName", "Lender/Mortgagee", "text", false, "The construction lender, if there is one."),
  f("originalContractCents", "1. Original Contract Amount", "money", true),
  f(
    "approvedChangeOrders",
    "2. Approved Change Orders",
    "text",
    true,
    "The net of approved change orders, in dollars; a deductive net prints with a minus sign.",
  ),
  f("adjustedContractCents", "3. Adjusted Contract Amount (line 1 plus 2)", "money", true),
  f("completedToDateCents", "4. Completed to Date", "money", true),
  f("retainageCents", "5. Less Retainage", "money", true),
  f("totalPayableCents", "6. Total Payable to Date (line 4 less line 5)", "money", true),
  f("previousPaymentsCents", "7. Less Previous Payments", "money", true),
  f("currentAmountDueCents", "8. Current Amount Due (line 6 less line 7)", "money", true),
  f(
    "pendingChangeOrders",
    "9. Pending Change Orders",
    "text",
    false,
    "Change orders submitted but not yet approved, in dollars.",
  ),
  f("disputedClaimsCents", "10. Disputed Claims", "money", false),
  f(
    "customerName",
    "Has a contract with",
    "text",
    true,
    "The party you contracted with (the GC, or the owner if you contract with the owner).",
  ),
  f(
    "propertyDescription",
    "Property known and identified as",
    "multiline",
    true,
    "The job's name and street address, or its description in the notice of contract.",
  ),
  f("cityOrTown", "City or town", "text", true),
  f(
    "paymentAmountWords",
    "Payment received, in words",
    "text",
    true,
    'For example "Twelve Thousand Three Hundred Forty-Five and 67/100 Dollars".',
  ),
  f("paymentAmountCents", "Payment received, in figures", "money", true),
  f(
    "invoiceDate",
    "Invoice/requisition/application for payment dated",
    "date",
    true,
    "The date of the pay application this payment is for.",
  ),
  f(
    "throughDate",
    "Work performed or furnished through",
    "date",
    true,
    "The last day of the payment period.",
  ),
  f("signerName", "Name of person signing", "text", true),
  f("signerTitle", "Title", "text", true),
];

const RECITAL =
  "The undersigned who has a contract with {{customerName}} for furnishing labor or materials or both labor and materials or rental equipment, appliances or tools for the erection, alteration, repair or removal of a building or structure or other improvement of real property known and identified as {{propertyDescription}} located in {{cityOrTown}} (city or town), {{county}} County, Commonwealth of Massachusetts and owned by {{ownerName}}, upon receipt of {{paymentAmountWords}} ({{paymentAmountCents}}) in payment of an invoice/requisition/application for payment dated {{invoiceDate}} does hereby:";

const WAIVE =
  "(a) waive any and all liens and right of lien on such real property for labor or materials, or both labor and materials, or rental equipment, appliances or tools, performed or furnished through the following date: {{throughDate}} (payment period), except for retainage, unpaid agreed or pending change orders, and disputed claims as stated above; and";

const SUBORDINATE =
  "(b) subordinate any and all liens and right of lien to secure payment for such unpaid, agreed or pending change orders and disputed claims, and such further labor or materials, or both labor and materials, or rental equipment, appliances or tools, except for retainage, performed or furnished at any time through the twenty-fifth day after the end of the above payment period, to the extent of the amount actually advanced by the above lender/mortgagee through such twenty-fifth day.";

/** The statute prints no signature lines; these say who signed under the perjury clause. */
const signature: BlockTemplate = {
  type: "signature",
  lines: [
    { label: "Signature", value: "" },
    { label: "Name", value: "{{signerName}}" },
    { label: "Title", value: "{{signerTitle}}" },
    { label: "For", value: "{{contractorName}}" },
  ] satisfies SignatureLineTemplate[],
};

const line = (label: string, key: string): BlockTemplate => ({
  type: "field",
  label,
  value: `{{${key}}}`,
});

export const MA_BODY: readonly BlockTemplate[] = [
  { type: "title", text: "Partial Waiver and Subordination of Lien" },
  line("COMMONWEALTH OF MASSACHUSETTS: Date", "signedDate"),
  { type: "paragraph", text: "{{county}} COUNTY" },
  line("Application for Payment No", "applicationNumber"),
  line("OWNER", "ownerName"),
  line("CONTRACTOR", "contractorName"),
  line("LENDER/MORTGAGEE", "lenderName"),
  line("1. Original Contract Amount", "originalContractCents"),
  line("2. Approved Change Orders", "approvedChangeOrders"),
  line("3. Adjusted Contract Amount", "adjustedContractCents"),
  { type: "paragraph", text: "(line 1 plus 2)" },
  line("4. Completed to Date", "completedToDateCents"),
  line("5. Less Retainage", "retainageCents"),
  line("6. Total Payable to Date", "totalPayableCents"),
  { type: "paragraph", text: "(line 4 less line 5)" },
  line("7. Less Previous Payments", "previousPaymentsCents"),
  line("8. Current Amount Due", "currentAmountDueCents"),
  { type: "paragraph", text: "(line 6 less line 7)" },
  line("9. Pending Change Orders", "pendingChangeOrders"),
  line("10. Disputed Claims", "disputedClaimsCents"),
  { type: "spacer" },
  { type: "paragraph", text: RECITAL },
  { type: "paragraph", text: WAIVE },
  { type: "paragraph", text: SUBORDINATE },
  // Day, month and year are written by hand when signing under the penalties of perjury.
  {
    type: "paragraph",
    text: "Signed under the penalties of perjury this ____ day of ________, ____.",
  },
  { type: "spacer" },
  signature,
];

export const MA_APPLIES_TO =
  "A partial (progress) waiver on a Massachusetts job given by a person who has filed or recorded a notice of contract under Mass. Gen. Laws c. 254, § 2. Section 32(4) exempts partial waivers and subordinations of lien given by such persons from § 32's rule that agreements barring lien filing are void, when they are substantially in this form with no material deviation from it.";

export const MA_NOTES: readonly string[] = [
  "Massachusetts: Mass. Gen. Laws c. 254, § 32 makes a covenant or agreement purporting to bar the filing of a notice of contract or the taking of steps to enforce a lien, or to subordinate those rights, void and unenforceable, except as § 32(1)-(4) list. This form is exception (4), for persons who have filed or recorded notices of contract under § 2, and must be substantially in the statute's form with no material deviation.",
  "The waiver takes effect upon receipt of the payment it names, and excepts retainage, unpaid agreed or pending change orders, and disputed claims as stated on lines 5, 9 and 10. Part (b) also subordinates lien rights for work through the twenty-fifth day after the payment period, to the extent the lender/mortgagee actually advances funds by then.",
  "It is signed under the penalties of perjury: check every amount against the application before signing.",
  "Giving it does not affect the lien rights of any other person claiming a lien under chapter 254 (§ 32).",
];

/** Added to Massachusetts' general forms, so a job with a notice of contract is pointed to § 32(4). */
export const MA_GENERAL_NOTES: readonly string[] = [
  "Massachusetts (Mass. Gen. Laws c. 254, § 32): an agreement purporting to bar the filing of a notice of contract or the enforcement of a lien is void and unenforceable, except as § 32(1)-(4) list. For a partial waiver given by a person who has filed or recorded a notice of contract under § 2, choose the Massachusetts Partial Waiver and Subordination of Lien instead of this form. Ask Massachusetts counsel whether this general form is enforceable on your job.",
];

export function maPartialForm(): FormDefinition {
  return {
    id: MA_PARTIAL_FORM_ID,
    state: "MA",
    kind: "conditional-progress",
    source: "statutory",
    title: "Massachusetts Partial Waiver and Subordination of Lien",
    citation: {
      text: "Mass. Gen. Laws c. 254, § 32(4)",
      officialUrl: MA_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: MA_CHECKED_ON,
        sourceUrl: MA_SOURCE_URL,
        checkedBy:
          "Claude Code agent session, against the General Court of Massachusetts' published text",
      },
    },
    fields: MA_FIELDS,
    body: MA_BODY,
    appliesTo: MA_APPLIES_TO,
    notes: MA_NOTES,
  };
}
