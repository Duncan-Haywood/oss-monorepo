import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * Texas's four waiver and release forms, Tex. Prop. Code § 53.284(b)-(e).
 *
 * Wording copied from the Texas Legislature's published text on 2026-11-25. The statutes site
 * (statutes.capitol.texas.gov) is a JavaScript app; the chapter file it loads is served at
 * https://tcss.legis.texas.gov/resources/PR/htm/PR.53.htm (snapshot in sources/tx-53-284.txt).
 * The section is unchanged since it was added in 2011 (Acts 2011, 82nd Leg., ch. 271, eff.
 * January 1, 2012); the chapter file carries amendments through 2025.
 *
 * Each blank is a `{{field}}` and the caption printed after it ("(maker of check)") became the
 * field's label. test/tx.test.ts checks each sentence against the snapshot, and
 * test/whole-form.test.ts compares every form with the statute's as a whole.
 *
 * § 53.284(a): a waiver is unenforceable unless it "substantially complies" with these forms. The
 * two unconditional forms must open with a notice "printed in bold type at least as large as the
 * largest type used in the document, but not smaller than 10-point type" (§ 53.284(c)(1), (e)(1)),
 * so here the notice is the first block, above the title.
 */

export const TX_SOURCE_URL = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.53.htm#53.284";
export const TX_CHECKED_ON = "2026-11-25";

const RIGHTS =
  "any mechanic's lien right, any right arising from a payment bond that complies with a state or federal statute, any common law payment bond right, any claim for payment, and any rights under any similar ordinance, rule, or statute related to claim or payment rights for persons in the signer's position";

const ON_RECEIPT = `On receipt by the signer of this document of a check from {{checkMaker}} in the sum of {{checkAmountCents}} payable to {{checkPayee}} and when the check has been properly endorsed and has been paid by the bank on which it is drawn, this document becomes effective to release ${RIGHTS} that the signer has on the property of {{ownerName}} located at {{jobLocation}} to the following extent: {{jobDescription}}.`;

const PROGRESS_SCOPE =
  "This release covers a progress payment for all labor, services, equipment, or materials furnished to the property or to {{customerName}} as indicated in the attached statement(s) or progress payment request(s), except for unpaid retention, pending modifications and changes, or other items furnished.";

const VERIFY =
  "Before any recipient of this document relies on this document, the recipient should verify evidence of payment to the signer.";

const WARRANTY = (payment: "progress" | "final", tail: string) =>
  `The signer warrants that the signer has already paid or will use the funds received from this ${payment} payment to promptly pay in full all of the signer's laborers, subcontractors, materialmen, and suppliers for all work, materials, equipment, or services provided for or to the above referenced project ${tail}.`;
const WARRANTY_PROGRESS = WARRANTY(
  "progress",
  "in regard to the attached statement(s) or progress payment request(s)",
);
const WARRANTY_FINAL = WARRANTY("final", "up to the date of this waiver and release");

/** § 53.284(c)(1) and (e)(1): the same words for both unconditional forms. */
const NOTICE =
  "NOTICE: This document waives rights unconditionally and states that you have been paid for giving up those rights. It is prohibited for a person to require you to sign this document if you have not been paid the payment amount set forth below. If you have not been paid, use a conditional release form.";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

const COMMON: readonly FieldSpec[] = [
  f("projectName", "Project", "text", false),
  f("jobNumber", "Job No.", "text", false),
  f("ownerName", "Owner", "text", true),
  f("jobLocation", "Location", "text", true),
  f(
    "jobDescription",
    "Job description",
    "text",
    true,
    'The statute\'s "to the following extent: ____ (job description)" blank: the work this waiver covers.',
  ),
  f(
    "customerName",
    "Person with whom signer contracted",
    "text",
    true,
    "The party that hired the claimant (usually the general contractor).",
  ),
  f("claimantName", "Company name", "text", true),
  f("signerTitle", "Title", "text", true),
  f("signedDate", "Date", "date", true),
];

const CHECK: readonly FieldSpec[] = [
  f("checkMaker", "Maker of check", "text", true),
  f("checkAmountCents", "Sum of check", "money", true),
  f("checkPayee", "Payee or payees of check", "text", true),
];

export const TX_FIELDS: Record<WaiverKind, readonly FieldSpec[]> = {
  "conditional-progress": [...COMMON, ...CHECK],
  "unconditional-progress": [
    ...COMMON,
    f("amountPaidCents", "Progress payment received", "money", true),
  ],
  "conditional-final": [...COMMON, ...CHECK],
  "unconditional-final": COMMON,
};

const HEAD: BlockTemplate[] = [
  { type: "field", label: "Project", value: "{{projectName}}" },
  { type: "field", label: "Job No.", value: "{{jobNumber}}" },
];

const signature: BlockTemplate = {
  type: "signature",
  lines: [
    { label: "Date", value: "{{signedDate}}" },
    { label: "Company name", value: "{{claimantName}}" },
    { label: "By (Signature)", value: "" },
    { label: "Title", value: "{{signerTitle}}" },
  ] satisfies SignatureLineTemplate[],
};

export const TX_BODIES: Record<WaiverKind, readonly BlockTemplate[]> = {
  "conditional-progress": [
    { type: "title", text: "CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT" },
    ...HEAD,
    { type: "paragraph", text: ON_RECEIPT },
    { type: "paragraph", text: PROGRESS_SCOPE },
    { type: "paragraph", text: VERIFY },
    { type: "paragraph", text: WARRANTY_PROGRESS },
    { type: "spacer" },
    signature,
  ],
  "unconditional-progress": [
    { type: "notice", text: NOTICE },
    { type: "title", text: "UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT" },
    ...HEAD,
    {
      type: "paragraph",
      text: `The signer of this document has been paid and has received a progress payment in the sum of {{amountPaidCents}} for all labor, services, equipment, or materials furnished to the property or to {{customerName}} on the property of {{ownerName}} located at {{jobLocation}} to the following extent: {{jobDescription}}. The signer therefore waives and releases ${RIGHTS} that the signer has on the above referenced project to the following extent:`,
    },
    { type: "paragraph", text: PROGRESS_SCOPE },
    { type: "paragraph", text: WARRANTY_PROGRESS },
    { type: "spacer" },
    signature,
  ],
  "conditional-final": [
    { type: "title", text: "CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT" },
    ...HEAD,
    { type: "paragraph", text: ON_RECEIPT },
    {
      type: "paragraph",
      text: "This release covers the final payment to the signer for all labor, services, equipment, or materials furnished to the property or to {{customerName}}.",
    },
    { type: "paragraph", text: VERIFY },
    { type: "paragraph", text: WARRANTY_FINAL },
    { type: "spacer" },
    signature,
  ],
  "unconditional-final": [
    { type: "notice", text: NOTICE },
    { type: "title", text: "UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT" },
    ...HEAD,
    {
      type: "paragraph",
      text: `The signer of this document has been paid in full for all labor, services, equipment, or materials furnished to the property or to {{customerName}} on the property of {{ownerName}} located at {{jobLocation}} to the following extent: {{jobDescription}}. The signer therefore waives and releases ${RIGHTS}.`,
    },
    { type: "paragraph", text: WARRANTY_FINAL },
    { type: "spacer" },
    signature,
  ],
};

export const TX_NOTES: readonly string[] = [
  "Texas: a waiver and release is unenforceable unless it substantially complies with the applicable form in Tex. Prop. Code § 53.284(b)-(e).",
  "Texas requires the unconditional-waiver notice at the top of the document, in bold type at least as large as the largest type used in the document and not smaller than 10-point (§ 53.284(c)(1) and (e)(1)).",
  'Texas\'s progress forms cover what is "indicated in the attached statement(s) or progress payment request(s)": attach the pay application.',
];
