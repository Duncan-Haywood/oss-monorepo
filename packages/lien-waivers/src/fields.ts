import { type FieldSpec, isConditional, isFinal, type WaiverKind } from "./types.ts";

/** Fields shared by every waiver kind. */
const COMMON: readonly FieldSpec[] = [
  { key: "claimantName", label: "Name of Claimant", type: "text", required: true },
  {
    key: "customerName",
    label: "Name of Customer",
    type: "text",
    required: true,
    help: "The party that hired the claimant and makes the payment.",
  },
  { key: "ownerName", label: "Owner", type: "text", required: false },
  { key: "jobLocation", label: "Job Location", type: "multiline", required: true },
  { key: "signerName", label: "Signer's Name", type: "text", required: true },
  { key: "signerTitle", label: "Signer's Title", type: "text", required: true },
  { key: "signedDate", label: "Date of Signature", type: "date", required: true },
];

const PROGRESS: readonly FieldSpec[] = [
  { key: "throughDate", label: "Through Date", type: "date", required: true },
  {
    key: "exceptions",
    label: "Exceptions",
    type: "multiline",
    required: false,
    help: "Retention, unpaid extras or other amounts this waiver does not cover.",
  },
];

const FINAL: readonly FieldSpec[] = [
  {
    key: "disputedClaimsCents",
    label: "Amount of Disputed Claims",
    type: "money",
    required: false,
  },
];

const CONDITIONAL: readonly FieldSpec[] = [
  { key: "checkMaker", label: "Maker of Check", type: "text", required: true },
  { key: "checkAmountCents", label: "Amount of Check", type: "money", required: true },
  { key: "checkPayee", label: "Check Payable to", type: "text", required: true },
];

const UNCONDITIONAL: readonly FieldSpec[] = [
  { key: "amountPaidCents", label: "Amount Paid", type: "money", required: true },
];

/** Field set for a kind. Statutory forms may define their own when their text is encoded. */
export function fieldsFor(kind: WaiverKind): readonly FieldSpec[] {
  return [
    ...COMMON,
    ...(isFinal(kind) ? FINAL : PROGRESS),
    ...(isConditional(kind) ? CONDITIONAL : UNCONDITIONAL),
  ];
}
