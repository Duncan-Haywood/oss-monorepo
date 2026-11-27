import type { BlockTemplate, FieldSpec, SignatureLineTemplate, WaiverKind } from "./types.ts";

/**
 * Michigan's four waiver forms, Mich. Comp. Laws § 570.1115(9)(a)-(d) (Construction Lien Act,
 * sec. 115).
 *
 * Wording copied from the Michigan Legislature's published text on 2026-11-25
 * (https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-570-1115; snapshot in
 * sources/mi-570-1115.txt; last amended 2007, Act 28). Each dotted blank is a `{{field}}`; the
 * captions printed under blanks ("(other contracting party)", "(date)") became field labels.
 * test/mi.test.ts checks each sentence against the snapshot, and test/whole-form.test.ts compares
 * all four forms with the statute's as a whole.
 *
 * Michigan names the forms "partial" and "full", not "progress" and "final": partial is listed as
 * the progress kind and full as the final kind. Kept exactly as enacted, including:
 * - "(circle one) does does not": the signer circles one by hand. PayApps does not choose for them.
 * - The full conditional waiver says the contract "has been fully paid and satisfied" and then
 *   that the waiver "is conditioned on actual payment"; § 570.1115(4) makes it effective upon that
 *   payment.
 * - The signature block: two lines over "(signature of lien claimant)", then "Signed on" with its
 *   date, the claimant's address (two lines) and telephone. The first line carries the claimant's
 *   name and the second is signed by hand.
 * - "DO NOT SIGN BLANK OR INCOMPLETE FORMS. RETAIN A COPY." closes every form.
 */

export const MI_SOURCE_URL = "https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-570-1115";
export const MI_CHECKED_ON = "2026-11-25";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

const PARTY = f(
  "customerName",
  "Other Contracting Party",
  "text",
  true,
  "Who your contract is with (usually the general contractor).",
);
const PROVIDE = f(
  "workProvided",
  "To Provide",
  "text",
  true,
  'What your contract is to provide, e.g. "electrical labor and materials".',
);
const PROPERTY = f(
  "jobLocation",
  "Property Described As",
  "multiline",
  true,
  "The property's address or legal description.",
);
const AMOUNT = (label: string, help: string) => f("paymentAmountCents", label, "money", true, help);
const THROUGH = f(
  "throughDate",
  "Labor/Materials Provided Through",
  "date",
  true,
  "Labor and materials provided after this date are not covered.",
);
const SIGNER = [
  f("claimantName", "Lien Claimant", "text", true, "Your company's name."),
  f("signedDate", "Signed On", "date", true),
  f(
    "claimantAddress",
    "Address",
    "multiline",
    false,
    "Your address. Left blank, it prints a line to fill in before signing.",
  ),
  f(
    "claimantPhone",
    "Telephone",
    "text",
    false,
    "Your telephone. Left blank, it prints a line to fill in before signing.",
  ),
];

export const MI_FIELDS: Record<WaiverKind, readonly FieldSpec[]> = {
  "unconditional-progress": [
    PARTY,
    PROVIDE,
    PROPERTY,
    AMOUNT("Construction Lien Waived to the Amount Of", "The amount received for this waiver."),
    THROUGH,
    ...SIGNER,
  ],
  "conditional-progress": [
    PARTY,
    PROVIDE,
    PROPERTY,
    AMOUNT(
      "Construction Lien Waived to the Amount Of",
      "The payment the waiver is exchanged for; it is effective once this amount is paid.",
    ),
    THROUGH,
    ...SIGNER,
  ],
  "unconditional-final": [PARTY, PROVIDE, PROPERTY, ...SIGNER],
  "conditional-final": [
    PARTY,
    PROVIDE,
    PROPERTY,
    AMOUNT(
      "Conditioned on Actual Payment Of",
      "The final payment; the waiver is effective once this amount is paid.",
    ),
    ...SIGNER,
  ],
};

const COVERS =
  "This waiver, together with all previous waivers, if any, (circle one) does does not cover all amounts due to me/us for contract improvement provided through the date shown above.";

const RESIDENTIAL =
  "If the improvement is provided to property that is a residential structure and if the owner or lessee of the property or the owner's or lessee's designee has received a notice of furnishing from me/one of us or if I/we are not required to provide one, and the owner, lessee, or designee has not received this waiver directly from me/one of us, the owner, lessee, or designee may not rely upon it without contacting me/one of us, either in writing, by telephone, or personally, to verify that it is authentic.";

const PARTIAL = (as: "as" | "as:") =>
  `I/we have a contract with {{customerName}} to provide {{workProvided}} for the improvement to the property described ${as} {{jobLocation}}, and by signing this waiver waive my/our construction lien to the amount of {{paymentAmountCents}}, for labor/materials provided through {{throughDate}}.`;

const FULL =
  "My/our contract with {{customerName}} to provide {{workProvided}} for the improvement of the property described as: {{jobLocation}} has been fully paid and satisfied. By signing this waiver, all my/our construction lien rights against the described property are waived and released.";

const signature: BlockTemplate = {
  type: "signature",
  lines: [
    { label: "Lien Claimant", value: "{{claimantName}}" },
    { label: "Signature of Lien Claimant", value: "" },
    { label: "Signed on", value: "{{signedDate}}" },
    { label: "Address", value: "{{claimantAddress}}" },
    { label: "Telephone", value: "{{claimantPhone}}" },
  ] satisfies SignatureLineTemplate[],
};

const CLOSE: BlockTemplate = {
  type: "notice",
  text: "DO NOT SIGN BLANK OR INCOMPLETE FORMS. RETAIN A COPY.",
};

export const MI_BODIES: Record<WaiverKind, readonly BlockTemplate[]> = {
  "unconditional-progress": [
    { type: "title", text: "PARTIAL UNCONDITIONAL WAIVER" },
    { type: "paragraph", text: PARTIAL("as") },
    { type: "paragraph", text: `${COVERS} ${RESIDENTIAL}` },
    { type: "spacer" },
    signature,
    CLOSE,
  ],
  "conditional-progress": [
    { type: "title", text: "PARTIAL CONDITIONAL WAIVER" },
    { type: "paragraph", text: PARTIAL("as:") },
    {
      type: "paragraph",
      text: `${COVERS} This waiver is conditioned on actual payment of the amount shown above.`,
    },
    { type: "paragraph", text: RESIDENTIAL },
    { type: "spacer" },
    signature,
    CLOSE,
  ],
  "unconditional-final": [
    { type: "title", text: "FULL UNCONDITIONAL WAIVER" },
    { type: "paragraph", text: FULL },
    { type: "paragraph", text: RESIDENTIAL },
    { type: "spacer" },
    signature,
    CLOSE,
  ],
  "conditional-final": [
    { type: "title", text: "FULL CONDITIONAL WAIVER" },
    { type: "paragraph", text: FULL },
    {
      type: "paragraph",
      text: `This waiver is conditioned on actual payment of {{paymentAmountCents}}. ${RESIDENTIAL}`,
    },
    { type: "spacer" },
    signature,
    CLOSE,
  ],
};

export const MI_NOTES: readonly string[] = [
  "Michigan: waivers of construction liens are executed on the forms of Mich. Comp. Laws § 570.1115(9), used in substantially that format. A partial waiver is the progress kind here and a full waiver the final kind.",
  "A claimant paid in full must give the owner, lessee or designee a full unconditional waiver; one paid in part must give a partial unconditional waiver for the amount received if asked (§ 570.1115(2), (3)).",
  "A partial or full conditional waiver is effective upon payment of the amount it names (§ 570.1115(4)). A waiver is effective when someone pays relying on it unless they had written notice that its consideration failed (§ 570.1115(6)).",
  "Requiring a lien waiver in advance of the work, as part of the contract, is invalid except to the extent payment was actually made (§ 570.1115(1)).",
  'Circle "does" or "does not" by hand on the partial forms: whether this waiver and earlier ones cover everything due through the date is the signer\'s statement, and PayApps does not make it.',
];
