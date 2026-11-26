import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * California's four waiver and release forms, Cal. Civ. Code §§ 8132 (conditional progress), 8134
 * (unconditional progress), 8136 (conditional final) and 8138 (unconditional final).
 *
 * Wording copied on 2026-11-25 from the California Legislative Counsel's official bulk download of
 * the codes (https://downloads.leginfo.legislature.ca.gov/pubinfo_2025.zip, table LAW_SECTION_TBL
 * and its per-section content files; snapshot in sources/ca-8132-8138.txt). The display site,
 * leginfo.legislature.ca.gov, answered 403 to the cloud proxy; the download host did not. Every
 * section is as added by Stats. 2010, Ch. 697 (SB 189), operative July 1, 2012, with no later
 * amendment listed.
 *
 * Each blank is a `{{field}}` with the statute's own label. test/ca.test.ts checks each sentence
 * against the snapshot, and test/whole-form.test.ts compares every form with the statute's as a
 * whole. Curly apostrophes are kept as the statute prints them (the PDF writer maps them to "'").
 *
 * Each section: a waiver given for a payment "shall be null, void, and unenforceable unless it is in
 * substantially the following form". §§ 8134 and 8138 add: "with the text of the 'Notice to
 * Claimant' in at least as large a type as the largest type otherwise in the form" (PayApps prints
 * every notice bold at the page's largest size, the title's).
 */

export const CA_SOURCE_URL = "https://downloads.leginfo.legislature.ca.gov/pubinfo_2025.zip";
export const CA_CHECKED_ON = "2026-11-25";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

const IDENTIFYING: readonly FieldSpec[] = [
  f("claimantName", "Name of Claimant", "text", true),
  f(
    "customerName",
    "Name of Customer",
    "text",
    true,
    "The party that hired the claimant (usually the general contractor) and makes the payment.",
  ),
  f("jobLocation", "Job Location", "multiline", true),
  f("ownerName", "Owner", "text", false),
];

const SIGNATURE: readonly FieldSpec[] = [
  f("signerTitle", "Claimant’s Title", "text", true),
  f("signedDate", "Date of Signature", "date", true),
];

const THROUGH = f("throughDate", "Through Date", "date", true);

const CHECK: readonly FieldSpec[] = [
  f("checkMaker", "Maker of Check", "text", true),
  f("checkAmountCents", "Amount of Check", "money", true),
  f("checkPayee", "Check Payable to", "text", true),
];

const PRIOR_UNPAID: readonly FieldSpec[] = [
  f(
    "priorWaiverDates",
    "Date(s) of waiver and release",
    "text",
    false,
    "Earlier conditional progress waivers you gave whose payment has not arrived. Leave blank if none.",
  ),
  f(
    "priorUnpaidAmounts",
    "Amount(s) of unpaid progress payment(s)",
    "text",
    false,
    "The amounts of those unpaid progress payments, e.g. 12,500.00. Leave blank if none.",
  ),
];

const DISPUTED = f(
  "disputedClaimsCents",
  "Disputed claims for extras in the amount of",
  "money",
  false,
  "Extras you are still claiming and the customer disputes. Leave blank if none.",
);

export const CA_FIELDS: Record<WaiverKind, readonly FieldSpec[]> = {
  "conditional-progress": [...IDENTIFYING, THROUGH, ...CHECK, ...PRIOR_UNPAID, ...SIGNATURE],
  "unconditional-progress": [
    ...IDENTIFYING,
    THROUGH,
    f("amountPaidCents", "Progress payment received", "money", true),
    ...SIGNATURE,
  ],
  "conditional-final": [...IDENTIFYING, ...CHECK, DISPUTED, ...SIGNATURE],
  "unconditional-final": [...IDENTIFYING, DISPUTED, ...SIGNATURE],
};

/** §§ 8132 and 8136: the same notice on both conditional forms. */
const CONDITIONAL_NOTICE =
  "NOTICE: THIS DOCUMENT WAIVES THE CLAIMANT’S LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT. A PERSON SHOULD NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT THE CLAIMANT HAS RECEIVED PAYMENT.";

/** §§ 8134 and 8138: the "Notice to Claimant" on both unconditional forms. */
const UNCONDITIONAL_NOTICE =
  "NOTICE TO CLAIMANT: THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS DOCUMENT IS ENFORCEABLE AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE NOT BEEN PAID. IF YOU HAVE NOT BEEN PAID, USE A CONDITIONAL WAIVER AND RELEASE FORM.";

const identifying = (progress: boolean): BlockTemplate[] => [
  { type: "heading", text: "Identifying Information" },
  { type: "field", label: "Name of Claimant", value: "{{claimantName}}" },
  { type: "field", label: "Name of Customer", value: "{{customerName}}" },
  { type: "field", label: "Job Location", value: "{{jobLocation}}" },
  { type: "field", label: "Owner", value: "{{ownerName}}" },
  ...(progress
    ? [{ type: "field", label: "Through Date", value: "{{throughDate}}" } as const]
    : []),
];

const RELEASES = (all: boolean, through: boolean) =>
  `This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for ${all ? "all " : ""}labor and service provided, and equipment and material delivered, to the customer on this job${through ? " through the Through Date of this document" : ""}. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, are waived and released by this document, unless listed as an Exception below.`;

const EFFECTIVE_ON_CHECK =
  "This document is effective only on the claimant’s receipt of payment from the financial institution on which the following check is drawn:";

const check: BlockTemplate[] = [
  { type: "field", label: "Maker of Check", value: "{{checkMaker}}" },
  { type: "field", label: "Amount of Check", value: "{{checkAmountCents}}" },
  { type: "field", label: "Check Payable to", value: "{{checkPayee}}" },
];

const CONTRACT_RIGHTS = (n: number) =>
  `(${n}) Contract rights, including (A) a right based on rescission, abandonment, or breach of contract, and (B) the right to recover compensation for work not compensated by the payment.`;

const disputed: BlockTemplate = {
  type: "field",
  label: "Disputed claims for extras in the amount of",
  value: "{{disputedClaimsCents}}",
};

const signature: BlockTemplate[] = [
  { type: "heading", text: "Signature" },
  {
    type: "signature",
    lines: [
      { label: "Claimant’s Signature", value: "" },
      { label: "Claimant’s Title", value: "{{signerTitle}}" },
      { label: "Date of Signature", value: "{{signedDate}}" },
    ] satisfies SignatureLineTemplate[],
  },
];

export const CA_BODIES: Record<WaiverKind, readonly BlockTemplate[]> = {
  "conditional-progress": [
    { type: "title", text: "CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT" },
    { type: "notice", text: CONDITIONAL_NOTICE },
    ...identifying(true),
    { type: "heading", text: "Conditional Waiver and Release" },
    { type: "paragraph", text: `${RELEASES(false, true)} ${EFFECTIVE_ON_CHECK}` },
    ...check,
    { type: "heading", text: "Exceptions" },
    { type: "paragraph", text: "This document does not affect any of the following:" },
    { type: "paragraph", text: "(1) Retentions." },
    { type: "paragraph", text: "(2) Extras for which the claimant has not received payment." },
    {
      type: "paragraph",
      text: "(3) The following progress payments for which the claimant has previously given a conditional waiver and release but has not received payment:",
    },
    { type: "field", label: "Date(s) of waiver and release", value: "{{priorWaiverDates}}" },
    {
      type: "field",
      label: "Amount(s) of unpaid progress payment(s)",
      value: "{{priorUnpaidAmounts}}",
    },
    { type: "paragraph", text: CONTRACT_RIGHTS(4) },
    ...signature,
  ],
  "unconditional-progress": [
    { type: "title", text: "UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT" },
    { type: "notice", text: UNCONDITIONAL_NOTICE },
    ...identifying(true),
    { type: "heading", text: "Unconditional Waiver and Release" },
    {
      type: "paragraph",
      text: `${RELEASES(false, true)} The claimant has received the following progress payment: {{amountPaidCents}}`,
    },
    { type: "heading", text: "Exceptions" },
    { type: "paragraph", text: "This document does not affect any of the following:" },
    { type: "paragraph", text: "(1) Retentions." },
    { type: "paragraph", text: "(2) Extras for which the claimant has not received payment." },
    { type: "paragraph", text: CONTRACT_RIGHTS(3) },
    ...signature,
  ],
  "conditional-final": [
    { type: "title", text: "CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT" },
    { type: "notice", text: CONDITIONAL_NOTICE },
    ...identifying(false),
    { type: "heading", text: "Conditional Waiver and Release" },
    { type: "paragraph", text: `${RELEASES(false, false)} ${EFFECTIVE_ON_CHECK}` },
    ...check,
    { type: "heading", text: "Exceptions" },
    { type: "paragraph", text: "This document does not affect any of the following:" },
    disputed,
    ...signature,
  ],
  "unconditional-final": [
    { type: "title", text: "UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT" },
    { type: "notice", text: UNCONDITIONAL_NOTICE },
    ...identifying(false),
    { type: "heading", text: "Unconditional Waiver and Release" },
    { type: "paragraph", text: `${RELEASES(true, false)} The claimant has been paid in full.` },
    { type: "heading", text: "Exceptions" },
    // § 8138 reads "does not affect the following" (§ 8136: "any of the following").
    { type: "paragraph", text: "This document does not affect the following:" },
    disputed,
    ...signature,
  ],
};

export const CA_NOTES: readonly string[] = [
  "California: a waiver and release given for a payment is null, void, and unenforceable unless it is in substantially the form of Cal. Civ. Code § 8132, 8134, 8136 or 8138, and it releases the owner, construction lender or payment-bond surety only if it is signed by the claimant (§ 8124(a)).",
  "California: a conditional release also needs evidence of payment before it releases them: the claimant's endorsement on a single or joint payee check that has been paid by the financial institution on which it was drawn, or the claimant's written acknowledgment of payment (§ 8124(b)).",
  'California\'s unconditional forms say they are enforceable against the claimant "even if you have not been paid" (§§ 8134, 8138): use them only once the payment has been received.',
  "California's final forms list one exception, disputed claims for extras in a stated amount (§§ 8136, 8138); the progress forms except retentions, unpaid extras and contract rights.",
];
