import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * Utah's two waiver and release forms, Utah Code § 38-1a-802(4)(b) and (c).
 *
 * Wording copied from the Utah Legislature's published text on 2026-11-25 (the section's XML
 * download, current version C38-1a-S802_1800010118000101; snapshot in
 * sources/ut-38-1a-802.txt). Each blank is a `{{field}}` and its printed label became the field's
 * label. test/ut.test.ts checks each sentence against the snapshot, and test/whole-form.test.ts
 * compares both forms with the statute's as a whole.
 *
 * Utah differs from Arizona, Nevada and Texas: it has two forms, not four.
 * - (4)(b) "UTAH CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT" is `conditional-progress`.
 * - (4)(c) "UTAH WAIVER AND RELEASE UPON FINAL PAYMENT" carries no conditional/unconditional label,
 *   but it takes effect only "once" the undersigned endorses the check and the check is paid, the
 *   same trigger as the progress form, so it is `conditional-final` here.
 * - There is no unconditional form. Those two kinds are listed with `absent` set (statutory.ts),
 *   so they can be tracked but never printed with wording this package made up.
 * A waiver is enforceable only if signed and "in substantially the form" of (4) (§ 38-1a-802(2),
 * (4)(a)), and for a progress payment "only to the extent of the payment" (§ 38-1a-802(2)(b)(ii)).
 */

export const UT_SOURCE_URL = "https://le.utah.gov/xcode/Title38/Chapter1A/38-1a-S802.html";
export const UT_CHECKED_ON = "2026-11-25";

const EFFECTIVE =
  "To the extent provided below, this document becomes effective to release and the undersigned is considered to waive any notice of lien or right under Utah Code Ann., Title 38, Chapter 1a, Preconstruction and Construction Liens, or any bond right under Utah Code Ann., Title 14, Contractors' Bonds, or Section 63G-6a-1103 related to payment rights the undersigned has on the above described Property once:";
const ONCE_1 =
  "(1) the undersigned endorses a check in the above referenced Payment Amount payable to the undersigned; and";
const ONCE_2 = "(2) the check is paid by the depository institution on which it is drawn.";

const WARRANTY = (payment: "this progress" | "the final") =>
  `The undersigned warrants that the undersigned either has already paid or will use the money the undersigned receives from ${payment} payment promptly to pay in full all the undersigned's laborers, subcontractors, materialmen, and suppliers for all work, materials, equipment, or combination of work, materials, and equipment that are the subject of this waiver and release.`;

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
    "Undersigned's Customer",
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
    "The check this waiver is exchanged for; it takes effect once that check is paid.",
  ),
  f("claimantName", "Company Name", "text", true),
  f("signerTitle", "Its", "text", true, "The signer's title, e.g. President."),
  f("signedDate", "Dated", "date", true),
];
const PERIOD = f(
  "paymentPeriod",
  "Payment Period",
  "text",
  true,
  "Items furnished or invoiced after this period are not covered.",
);

export const UT_FIELDS: Partial<Record<WaiverKind, readonly FieldSpec[]>> = {
  "conditional-progress": [...COMMON, PERIOD],
  "conditional-final": COMMON,
};

const HEAD: BlockTemplate[] = [
  { type: "field", label: "Property Name", value: "{{projectName}}" },
  { type: "field", label: "Property Location", value: "{{jobLocation}}" },
  { type: "field", label: "Undersigned's Customer", value: "{{customerName}}" },
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

export const UT_BODIES: Partial<Record<WaiverKind, readonly BlockTemplate[]>> = {
  "conditional-progress": [
    { type: "title", text: "UTAH CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT" },
    ...HEAD,
    { type: "field", label: "Payment Period", value: "{{paymentPeriod}}" },
    { type: "paragraph", text: EFFECTIVE },
    { type: "paragraph", text: ONCE_1 },
    { type: "paragraph", text: ONCE_2 },
    {
      type: "paragraph",
      text: "This waiver and release applies to a progress payment for the work, materials, equipment, or a combination of work, materials, and equipment furnished by the undersigned to the Property or to the Undersigned's Customer which are the subject of the Invoice or Payment Application, but only to the extent of the Payment Amount. This waiver and release does not apply to any retention withheld; any items, modifications, or changes pending approval; disputed items and claims; or items furnished or invoiced after the Payment Period.",
    },
    { type: "paragraph", text: WARRANTY("this progress") },
    { type: "spacer" },
    signature,
  ],
  "conditional-final": [
    { type: "title", text: "UTAH WAIVER AND RELEASE UPON FINAL PAYMENT" },
    ...HEAD,
    { type: "paragraph", text: EFFECTIVE },
    { type: "paragraph", text: ONCE_1 },
    { type: "paragraph", text: ONCE_2 },
    {
      type: "paragraph",
      text: "This waiver and release applies to the final payment for the work, materials, equipment, or combination of work, materials, and equipment furnished by the undersigned to the Property or to the Undersigned's Customer.",
    },
    { type: "paragraph", text: WARRANTY("the final") },
    { type: "spacer" },
    signature,
  ],
};

/** Why Utah has nothing to print for the unconditional kinds. */
export const UT_NO_UNCONDITIONAL_FORM =
  "Utah's statute has no unconditional waiver form. Utah Code § 38-1a-802(4) gives two forms, one for a progress payment ((4)(b)) and one for a final payment ((4)(c)); each takes effect once the undersigned endorses the check and the check is paid. This package prints those two and does not supply unconditional wording for Utah. If a customer asks for an unconditional waiver on a Utah job, ask counsel.";

export const UT_NOTES: readonly string[] = [
  "Utah: a waiver and release meets § 38-1a-802 if it is in substantially the form of Subsection (4); a claimant's waiver is enforceable only if signed by the claimant or its authorized agent and the claimant receives the payment it names, for a progress payment only to the extent of the payment (§ 38-1a-802(2), (4)(a)).",
  "Utah's final-payment form is not labelled conditional, but it takes effect only once the check is endorsed and paid, so it is listed as the conditional final waiver.",
  "If the payment is a check that fails to clear, the waiver is void (§ 38-1a-802(3)). The restrictive check endorsement of § 38-1a-802(4)(d) is not produced here.",
];
