import { fieldsFor } from "./fields.ts";
import {
  type BlockTemplate,
  type FormDefinition,
  isConditional,
  isFinal,
  WAIVER_KINDS,
  type WaiverKind,
} from "./types.ts";

/**
 * Generic waiver wording written for this package. It is NOT any state's statutory form,
 * has not been reviewed by counsel, and is offered only for states where this package does
 * not list a statutory form.
 */
export const GENERIC_NOTICE =
  "NOT A STATUTORY FORM. This waiver uses general wording; it is not a form prescribed by " +
  "any state statute. Lien and waiver law varies by state and changes. Have local counsel " +
  "review this form before you rely on it.";

const TITLES: Record<WaiverKind, string> = {
  "conditional-progress": "Conditional Waiver and Release on Progress Payment",
  "unconditional-progress": "Unconditional Waiver and Release on Progress Payment",
  "conditional-final": "Conditional Waiver and Release on Final Payment",
  "unconditional-final": "Unconditional Waiver and Release on Final Payment",
};

function genericBody(kind: WaiverKind): BlockTemplate[] {
  const conditional = isConditional(kind);
  const final = isFinal(kind);
  const blocks: BlockTemplate[] = [
    { type: "title", text: TITLES[kind] },
    { type: "notice", text: GENERIC_NOTICE },
    { type: "heading", text: "Identifying Information" },
    { type: "field", label: "Name of Claimant", value: "{{claimantName}}" },
    { type: "field", label: "Name of Customer", value: "{{customerName}}" },
    { type: "field", label: "Owner", value: "{{ownerName}}" },
    { type: "field", label: "Job Location", value: "{{jobLocation}}" },
  ];
  if (!final) blocks.push({ type: "field", label: "Through Date", value: "{{throughDate}}" });
  if (conditional) {
    blocks.push(
      { type: "heading", text: "Payment This Waiver Depends On" },
      { type: "field", label: "Maker of Check", value: "{{checkMaker}}" },
      { type: "field", label: "Amount of Check", value: "{{checkAmountCents}}" },
      { type: "field", label: "Check Payable to", value: "{{checkPayee}}" },
    );
  } else {
    blocks.push({ type: "field", label: "Amount Paid", value: "{{amountPaidCents}}" });
  }

  blocks.push({ type: "heading", text: "Waiver and Release" });
  const scope = final
    ? "for all labor, services, equipment and materials furnished to the job location"
    : "for labor, services, equipment and materials furnished to the job location through the Through Date stated above";
  const condition = conditional
    ? "This waiver and release takes effect only when the claimant has actually received the payment described above and the check has been honored by the bank it is drawn on. Until then it has no effect. "
    : "The claimant has been paid the amount stated above. This waiver and release is unconditional and takes effect when signed. ";
  blocks.push({
    type: "paragraph",
    text:
      condition +
      `The claimant waives and releases, to the extent of that payment, its lien rights, stop payment notice rights and payment bond rights ${scope}.`,
  });
  if (final) {
    blocks.push(
      {
        type: "paragraph",
        text: "This release does not cover the amount of disputed claims stated below, if any.",
      },
      { type: "field", label: "Amount of Disputed Claims", value: "{{disputedClaimsCents}}" },
    );
  } else {
    blocks.push(
      {
        type: "paragraph",
        text: "This release does not cover retention or amounts withheld, extras furnished before the Through Date for which payment has not been received, extras or items furnished after the Through Date, contract rights, or the exceptions stated below.",
      },
      { type: "field", label: "Exceptions", value: "{{exceptions}}" },
    );
  }
  if (!conditional) {
    blocks.push({
      type: "notice",
      text: "NOTICE TO CLAIMANT: Do not sign this unconditional waiver unless you have been paid in full the amount stated above. If you have not been paid, use a conditional waiver.",
    });
  }
  blocks.push({ type: "spacer" }, { type: "signature" });
  return blocks;
}

export function genericForm(kind: WaiverKind, state: string): FormDefinition {
  return {
    id: `${state}/${kind}/generic`,
    state,
    kind,
    source: "generic",
    title: TITLES[kind],
    citation: null,
    fields: fieldsFor(kind),
    body: genericBody(kind),
    notes: [GENERIC_NOTICE],
  };
}

export function genericForms(state: string): FormDefinition[] {
  return WAIVER_KINDS.map((k) => genericForm(k, state));
}
