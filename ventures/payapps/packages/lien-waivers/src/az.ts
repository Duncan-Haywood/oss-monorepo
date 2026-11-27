import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * Arizona's four waiver and release forms, Ariz. Rev. Stat. § 33-1008(D)(1)-(4).
 *
 * Wording copied from the Arizona Legislature's published text on 2026-11-25
 * (https://www.azleg.gov/ars/33/01008.htm; snapshot in sources/az-33-1008.txt). Each statutory
 * blank is a `{{field}}`; the small italic captions under the blanks ("(maker of check)") became
 * field labels. test/az.test.ts checks every sentence below against the snapshot, word for word,
 * so an edit that drifts from the statute fails the build.
 *
 * § 33-1008(A): a waiver is effective only if it "follows substantially one of the forms set forth
 * in this section", and for a conditional release only with evidence of payment.
 */

export const AZ_SOURCE_URL = "https://www.azleg.gov/ars/33/01008.htm";
export const AZ_CHECKED_ON = "2026-11-25";

const RELEASE_SCOPE =
  "any mechanic's lien, any state or federal statutory bond right, any private bond right, any claim for payment and any rights under any similar ordinance, rule or statute related to claim or payment rights for persons in the undersigned's position";

const UNCONDITIONAL_NOTICE =
  "Notice: This document waives rights unconditionally and states that you have been paid for giving up those rights. This document is enforceable against you if you sign it, even if you have not been paid. If you have not been paid, use a conditional release form.";

const WARRANTY = (payment: "progress" | "final", tail: string, all = "all of his") =>
  `The undersigned warrants that he either has already paid or will use the monies he receives from this ${payment} payment to promptly pay in full ${all} laborers, subcontractors, materialmen and suppliers for all work, materials, equipment or services provided for or to the above referenced project${tail}.`;

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
  f(
    "jobDescription",
    "Job description",
    "text",
    true,
    'The statute\'s "located at ____ (job description)" blank: the job and its location.',
  ),
  f(
    "customerName",
    "Person with whom undersigned contracted",
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
  f("checkAmountCents", "Amount of check", "money", true),
  f("checkPayee", "Payee or payees of check", "text", true),
];

const THROUGH = f("throughDate", "Through date", "date", true);
const AMOUNT_PAID = f("amountPaidCents", "Progress payment received", "money", true);
const DISPUTED = f("disputedClaimsCents", "Disputed claims", "money", false);

export const AZ_FIELDS: Record<WaiverKind, readonly FieldSpec[]> = {
  "conditional-progress": [...COMMON, ...CHECK, THROUGH],
  "unconditional-progress": [...COMMON, AMOUNT_PAID, THROUGH],
  "conditional-final": [...COMMON, ...CHECK, DISPUTED],
  "unconditional-final": [...COMMON, DISPUTED],
};

const signature = (dateLabel: "Date" | "Dated"): BlockTemplate => ({
  type: "signature",
  lines: [
    { label: dateLabel, value: "{{signedDate}}" },
    { label: "Company name", value: "{{claimantName}}" },
    { label: "By (Signature)", value: "" },
    { label: "Title", value: "{{signerTitle}}" },
  ] satisfies SignatureLineTemplate[],
});

const HEAD: BlockTemplate[] = [
  { type: "field", label: "Project", value: "{{projectName}}" },
  { type: "field", label: "Job No.", value: "{{jobNumber}}" },
];

export const AZ_BODIES: Record<WaiverKind, readonly BlockTemplate[]> = {
  "conditional-progress": [
    { type: "title", text: "Conditional waiver and release on progress payment" },
    ...HEAD,
    {
      type: "paragraph",
      text: `On receipt by the undersigned of a check from {{checkMaker}} in the sum of {{checkAmountCents}} payable to {{checkPayee}} and when the check has been properly endorsed and has been paid by the bank on which it is drawn, this document becomes effective to release ${RELEASE_SCOPE} that the undersigned has on the job of {{ownerName}} located at {{jobDescription}} to the following extent. This release covers a progress payment for all labor, services, equipment or materials furnished to the jobsite or to {{customerName}}, through {{throughDate}} only and does not cover any retention, pending modifications and changes or items furnished after that date. Before any recipient of this document relies on it, that person should verify evidence of payment to the undersigned.`,
    },
    { type: "paragraph", text: WARRANTY("progress", " up to the date of this waiver") },
    { type: "spacer" },
    signature("Date"),
  ],
  "unconditional-progress": [
    { type: "title", text: "Unconditional waiver and release on progress payment" },
    ...HEAD,
    {
      type: "paragraph",
      text: `The undersigned has been paid and has received a progress payment in the sum of {{amountPaidCents}} for all labor, services, equipment or material furnished to the jobsite or to {{customerName}} on the job of {{ownerName}} located at {{jobDescription}} and does hereby release ${RELEASE_SCOPE} that the undersigned has on the above referenced project to the following extent. This release covers a progress payment for all labor, services, equipment or materials furnished to the jobsite or to {{customerName}} through {{throughDate}} only and does not cover any retention, pending modifications and changes or items furnished after that date.`,
    },
    { type: "paragraph", text: WARRANTY("progress", " up to the date of this waiver") },
    { type: "spacer" },
    signature("Dated"),
    { type: "notice", text: UNCONDITIONAL_NOTICE },
  ],
  "conditional-final": [
    { type: "title", text: "Conditional waiver and release on final payment" },
    ...HEAD,
    {
      type: "paragraph",
      text: `On receipt by the undersigned of a check from {{checkMaker}} in the sum of {{checkAmountCents}} payable to {{checkPayee}} and when the check has been properly endorsed and has been paid by the bank on which it is drawn, this document becomes effective to release ${RELEASE_SCOPE}, the undersigned has on the job of {{ownerName}} located at {{jobDescription}}. This release covers the final payment to the undersigned for all labor, services, equipment or materials furnished to the jobsite or to {{customerName}}, except for disputed claims in the amount of {{disputedClaimsCents}}. Before any recipient of this document relies on it, the person should verify evidence of payment to the undersigned.`,
    },
    { type: "paragraph", text: WARRANTY("final", " up to the date of this waiver", "all his") },
    { type: "spacer" },
    signature("Dated"),
  ],
  "unconditional-final": [
    { type: "title", text: "Unconditional waiver and release on final payment" },
    ...HEAD,
    {
      type: "paragraph",
      text: `The undersigned has been paid in full for all labor, services, equipment or material furnished to the jobsite or to {{customerName}}, on the job of {{ownerName}} located at {{jobDescription}} and does hereby waive and release any right to mechanic's lien, any state or federal statutory bond right, any private bond right, any claim for payment and any rights under any similar ordinance, rule or statute related to claim or payment rights for persons in the undersigned's position, except for disputed claims for extra work in the amount of {{disputedClaimsCents}}.`,
    },
    { type: "paragraph", text: WARRANTY("final", "") },
    { type: "spacer" },
    signature("Dated"),
    { type: "notice", text: UNCONDITIONAL_NOTICE },
  ],
};

export const AZ_NOTES: readonly string[] = [
  "Arizona: a waiver and release is effective only if it follows substantially one of the forms in Ariz. Rev. Stat. § 33-1008(D) and is signed by the claimant or its authorized agent; a conditional release also needs evidence of payment (§ 33-1008(A)).",
  "Arizona requires the unconditional-waiver notice in type at least as large as the largest type otherwise on the document (§ 33-1008(D)(2) and (4)).",
];
