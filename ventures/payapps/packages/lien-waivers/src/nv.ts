import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * Nevada's four waiver and release forms, Nev. Rev. Stat. § 108.2457(5)(a)-(d).
 *
 * Wording copied from the Nevada Legislature's published text on 2026-11-25
 * (https://www.leg.state.nv.us/NRS/NRS-108.html#NRS108Sec2457; snapshot in
 * sources/nv-108-2457.txt). Each dotted blank is a `{{field}}` and its printed label became the
 * field's label. test/nv.test.ts rebuilds every form from these blocks and compares it with the
 * snapshot as a whole, so a changed, added or dropped word fails the build.
 *
 * Nevada is stricter than Arizona: a waiver is unenforceable unless it is "in the following
 * forms" (§ 108.2457(5)), not merely substantially so. Kept exactly as enacted, including the
 * capitalised titles, the curly apostrophe in "Undersigned’s" and the two different notices.
 */

export const NV_SOURCE_URL = "https://www.leg.state.nv.us/NRS/NRS-108.html#NRS108Sec2457";
export const NV_CHECKED_ON = "2026-11-25";

const RIGHTS =
  "any notice of lien, any private bond right, any claim for payment and any rights under any similar ordinance, rule or statute related to payment rights that the undersigned has on the above-described Property";

const UPON_RECEIPT = `Upon receipt by the undersigned of a check in the above-referenced Payment Amount payable to the undersigned, and when the check has been properly endorsed and has been paid by the bank on which it is drawn, this document becomes effective to release and the undersigned shall be deemed to waive ${RIGHTS} to the following extent:`;

const VERIFY =
  "Before any recipient of this document relies on it, the recipient should verify evidence of payment to the undersigned.";

const WARRANTY = (payment: "this progress" | "the final" | "this final", what: string) =>
  `The undersigned warrants that he or she either has already paid or will use the money received from ${payment} payment promptly to pay in full all laborers, subcontractors, materialmen and suppliers for all work, ${what} that are the subject of this waiver and release.`;

const PROGRESS_SCOPE = (what: string) =>
  `This release covers a progress payment for the work, ${what} furnished by the undersigned to the Property or to the Undersigned’s Customer which are the subject of the Invoice or Payment Application, but only to the extent of the Payment Amount or such portion of the Payment Amount as the undersigned is actually paid, and does not cover any retention withheld, any items, modifications or changes pending approval, disputed items and claims, or items furnished that are not paid.`;

const NOTICE_PROGRESS =
  "Notice: This document waives rights unconditionally and states that you have been paid for giving up those rights. This document is enforceable against you if you sign it to the extent of the Payment Amount or the amount received. If you have not been paid, use a conditional release form.";

const NOTICE_FINAL =
  "Notice: This document waives rights unconditionally and states that you have been paid for giving up those rights. This document is enforceable against you if you sign it, even if you have not been paid. If you have not been paid, use a conditional release form.";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

const COMMON: readonly FieldSpec[] = [
  f("projectName", "Property Name", "text", true),
  f("jobLocation", "Property Location", "text", true),
  f(
    "customerName",
    "Undersigned’s Customer",
    "text",
    true,
    "The party that hired the claimant (usually the general contractor).",
  ),
  f("invoiceNumber", "Invoice/Payment Application Number", "text", true),
  f(
    "paymentAmountCents",
    "Payment Amount",
    "money",
    true,
    "The payment this waiver is exchanged for (conditional) or that was received (unconditional).",
  ),
  f("claimantName", "Company Name", "text", true),
  f("signerTitle", "Its", "text", true, "The signer's title, e.g. President."),
  f("signedDate", "Dated", "date", true),
];
const PERIOD = f("paymentPeriod", "Payment Period", "text", false);
const DISPUTED = f("disputedClaimsCents", "Amount of Disputed Claims", "money", false);

export const NV_FIELDS: Record<WaiverKind, readonly FieldSpec[]> = {
  "conditional-progress": COMMON,
  "unconditional-progress": COMMON,
  "conditional-final": [...COMMON, PERIOD, DISPUTED],
  "unconditional-final": [...COMMON, DISPUTED],
};

const HEAD: BlockTemplate[] = [
  { type: "field", label: "Property Name", value: "{{projectName}}" },
  { type: "field", label: "Property Location", value: "{{jobLocation}}" },
  { type: "field", label: "Undersigned’s Customer", value: "{{customerName}}" },
  { type: "field", label: "Invoice/Payment Application Number", value: "{{invoiceNumber}}" },
  { type: "field", label: "Payment Amount", value: "{{paymentAmountCents}}" },
];

const signature: BlockTemplate = {
  type: "signature",
  lines: [
    { label: "Dated", value: "{{signedDate}}" },
    { label: "Company Name", value: "{{claimantName}}" },
    { label: "By", value: "" },
    { label: "Its", value: "{{signerTitle}}" },
  ] satisfies SignatureLineTemplate[],
};

export const NV_BODIES: Record<WaiverKind, readonly BlockTemplate[]> = {
  "conditional-progress": [
    { type: "title", text: "CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT" },
    ...HEAD,
    { type: "paragraph", text: UPON_RECEIPT },
    {
      type: "paragraph",
      text: `${PROGRESS_SCOPE("materials or equipment")} ${VERIFY} ${WARRANTY("this progress", "materials or equipment")}`,
    },
    { type: "spacer" },
    signature,
  ],
  "unconditional-progress": [
    { type: "title", text: "UNCONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT" },
    ...HEAD,
    {
      type: "paragraph",
      text: `The undersigned has been paid and has received a progress payment in the above-referenced Payment Amount for all work, materials and equipment the undersigned furnished to the Customer for the above-described Property and does hereby waive and release ${RIGHTS} to the following extent:`,
    },
    {
      type: "paragraph",
      text: `${PROGRESS_SCOPE("materials and equipment")} ${WARRANTY("this progress", "materials or equipment")}`,
    },
    { type: "spacer" },
    signature,
    { type: "notice", text: NOTICE_PROGRESS },
  ],
  "conditional-final": [
    { type: "title", text: "CONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT" },
    ...HEAD,
    { type: "field", label: "Payment Period", value: "{{paymentPeriod}}" },
    { type: "field", label: "Amount of Disputed Claims", value: "{{disputedClaimsCents}}" },
    { type: "paragraph", text: UPON_RECEIPT },
    {
      type: "paragraph",
      text: `This release covers the final payment to the undersigned for all work, materials or equipment furnished by the undersigned to the Property or to the Undersigned’s Customer and does not cover payment for Disputed Claims, if any. ${VERIFY} ${WARRANTY("the final", "materials or equipment")}`,
    },
    { type: "spacer" },
    signature,
  ],
  "unconditional-final": [
    { type: "title", text: "UNCONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT" },
    ...HEAD,
    { type: "field", label: "Amount of Disputed Claims", value: "{{disputedClaimsCents}}" },
    {
      type: "paragraph",
      text: `The undersigned has been paid in full for all work, materials and equipment furnished to the Customer for the above-described Property and does hereby waive and release ${RIGHTS}, except for the payment of Disputed Claims, if any, noted above. ${WARRANTY("this final", "materials and equipment")}`,
    },
    { type: "spacer" },
    signature,
    { type: "notice", text: NOTICE_FINAL },
  ],
};

export const NV_NOTES: readonly string[] = [
  "Nevada: a waiver and release is unenforceable unless it is in the forms of Nev. Rev. Stat. § 108.2457(5), signed by the lien claimant or its authorized agent; a conditional one needs payment of the amount it names (§ 108.2457(1)).",
  "Nevada requires the unconditional-waiver notice in type at least as large as the largest type otherwise on the document (§ 108.2457(5)(b) and (d)).",
  "If the payment is a check that fails to clear, the waiver is void (§ 108.2457(5)(e)).",
];
