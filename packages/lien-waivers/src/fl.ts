import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * Florida's two waiver and release forms, Fla. Stat. § 713.20(4) and (5).
 *
 * Wording copied from the Florida Senate's published 2026 Florida Statutes on 2026-11-25 (the
 * 2025 edition reads the same; the section was last amended in 1999, s. 30, ch. 99-6; snapshot in
 * sources/fl-713-20.txt). Each blank is a `{{field}}`; where the statute prints a caption in place
 * of a blank ("(insert date)", "(insert the name of your customer)") the caption became the
 * field's label. test/fl.test.ts checks each sentence against the snapshot, and
 * test/whole-form.test.ts compares both forms with the statute's as a whole.
 *
 * Florida differs from Arizona, Nevada and Texas: it has two forms, not four, and neither is
 * labelled conditional or unconditional.
 * - (4) "WAIVER AND RELEASE OF LIEN UPON PROGRESS PAYMENT" and (5) "... UPON FINAL PAYMENT" each
 *   say the lienor "hereby waives and releases" its lien "in consideration of" the payment, with
 *   no condition in the text, so they are listed here as `unconditional-progress` and
 *   `unconditional-final`.
 * - § 713.20(7) lets a lienor who signs one in exchange for a check condition it on payment of
 *   the check, but prescribes no wording for the condition. The conditional kinds are listed with
 *   `absent` set (statutory.ts), so they can be tracked but are never printed with wording this
 *   package made up.
 * - The forms are not mandatory ("may be in substantially the following form", (4), (5)), but no
 *   one may require a lienor to furnish a different one ((6)), and a waiver that is not
 *   substantially similar is enforceable by its own terms ((8)).
 */

export const FL_SOURCE_URL = "https://www.flsenate.gov/Laws/Statutes/2026/713.20";
export const FL_CHECKED_ON = "2026-11-25";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

const CUSTOMER = f(
  "customerName",
  "Name of Your Customer",
  "text",
  true,
  "The party that hired the lienor (usually the general contractor).",
);
const OWNER = f("ownerName", "Name of the Owner", "text", true, "The property owner.");
const PROPERTY = f(
  "jobLocation",
  "Description of Property",
  "multiline",
  true,
  "The property's address or legal description, as on the Notice of Commencement.",
);
const LIENOR = f("claimantName", "Lienor", "text", true, "Your company's name.");
const DATED = f("signedDate", "Dated", "date", true);

export const FL_FIELDS: Partial<Record<WaiverKind, readonly FieldSpec[]>> = {
  "unconditional-progress": [
    f(
      "amountPaidCents",
      "Sum",
      "money",
      true,
      "The progress payment this waiver is given for. It does not cover retention.",
    ),
    f(
      "throughDate",
      "Furnished Through",
      "date",
      true,
      "Labor, services or materials furnished after this date are not covered.",
    ),
    CUSTOMER,
    OWNER,
    PROPERTY,
    LIENOR,
    DATED,
  ],
  "unconditional-final": [
    f("amountPaidCents", "Final Payment Amount", "money", true),
    CUSTOMER,
    OWNER,
    PROPERTY,
    LIENOR,
    DATED,
  ],
};

const signature: BlockTemplate = {
  type: "signature",
  lines: [
    { label: "DATED on", value: "{{signedDate}}" },
    { label: "Lienor", value: "{{claimantName}}" },
    { label: "By", value: "" },
  ] satisfies SignatureLineTemplate[],
};

export const FL_BODIES: Partial<Record<WaiverKind, readonly BlockTemplate[]>> = {
  "unconditional-progress": [
    { type: "title", text: "WAIVER AND RELEASE OF LIEN UPON PROGRESS PAYMENT" },
    {
      type: "paragraph",
      text: "The undersigned lienor, in consideration of the sum of {{amountPaidCents}}, hereby waives and releases its lien and right to claim a lien for labor, services, or materials furnished through {{throughDate}} to {{customerName}} on the job of {{ownerName}} to the following property:",
    },
    { type: "paragraph", text: "{{jobLocation}}" },
    {
      type: "paragraph",
      text: "This waiver and release does not cover any retention or labor, services, or materials furnished after the date specified.",
    },
    { type: "spacer" },
    signature,
  ],
  "unconditional-final": [
    { type: "title", text: "WAIVER AND RELEASE OF LIEN UPON FINAL PAYMENT" },
    {
      type: "paragraph",
      text: "The undersigned lienor, in consideration of the final payment in the amount of {{amountPaidCents}}, hereby waives and releases its lien and right to claim a lien for labor, services, or materials furnished to {{customerName}} on the job of {{ownerName}} to the following described property:",
    },
    { type: "paragraph", text: "{{jobLocation}}" },
    { type: "spacer" },
    signature,
  ],
};

/** Why Florida has nothing to print for the conditional kinds. */
export const FL_NO_CONDITIONAL_FORM =
  "Florida's statute has no separate conditional waiver form. Fla. Stat. § 713.20(4) and (5) give one form for a progress payment and one for the final payment, each a waiver and release given in consideration of the payment, with no condition in its text; this package prints those two as the unconditional waivers. § 713.20(7) lets a lienor who signs one in exchange for a check condition it on payment of the check, but the statute gives no wording for that condition, and this package does not supply any. Before signing a Florida waiver ahead of payment, ask counsel.";

export const FL_NOTES: readonly string[] = [
  "Florida: a waiver or release given in exchange for, or to induce, a progress or final payment may be in substantially the form of § 713.20(4) or (5). No one may require a lienor to furnish a waiver different from those forms (§ 713.20(6)); a waiver that is not substantially similar is enforceable by its own terms (§ 713.20(8)).",
  "A lien right may not be waived in advance and may be waived only to the extent of labor, services or materials furnished (§ 713.20(2)).",
  "The progress form does not cover retention or anything furnished after the date given (§ 713.20(4)).",
  "A lienor who signs a waiver in exchange for a check may condition it on payment of the check (§ 713.20(7)); this package does not print condition wording.",
];
