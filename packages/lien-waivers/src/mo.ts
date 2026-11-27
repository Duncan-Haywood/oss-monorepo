import type { BlockTemplate, FieldSpec, FormDefinition, SignatureLineTemplate } from "./types.ts";

/**
 * Missouri's one statutory waiver form, Mo. Rev. Stat. § 429.016.27.
 *
 * Wording copied from the Missouri Revisor of Statutes' published text on 2026-11-25 (effective
 * 28 Aug 2010, L. 2010 H.B. 1692 et al.; snapshot in sources/mo-429-016.txt). test/mo.test.ts
 * checks each sentence against the snapshot and test/whole-form.test.ts compares the form with the
 * statute's as a whole.
 *
 * Missouri differs from every other encoded state:
 * - The form exists for one kind only, the unconditional final waiver, and only for residential
 *   real property as § 429.016.1-.2 define it (new residential construction for sale: dwellings of
 *   four units or fewer, condominiums, townhouses, cooperatives, and the streets and utilities on
 *   those parcels). Repair, remodeling or additions to an owner-occupied home of four units or
 *   fewer are excluded (they fall under § 429.013), and so is commercial work.
 * - On that property an unconditional final waiver "shall only be valid if it is on a form that is
 *   substantially as follows" (§ 429.016.27). Partial and conditional waivers may be given
 *   (§ 429.016.25) but have no prescribed form.
 * - Everywhere else in Missouri the statute prescribes no waiver form at all.
 *
 * So Missouri is not a statutory-forms state here: `listForms("MO")` returns the general forms
 * (with Missouri notes), and this form is offered beside them by `alternativeForms("MO")`, with
 * `appliesTo` saying when to choose it. It is never picked automatically, because the job's
 * property type decides it and PayApps does not know it.
 */

export const MO_SOURCE_URL = "https://revisor.mo.gov/main/OneSection.aspx?section=429.016";
export const MO_CHECKED_ON = "2026-11-25";
export const MO_RESIDENTIAL_FORM_ID = "MO/unconditional-final/statutory-residential";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help?: string,
): FieldSpec => (help ? { key, label, type, required, help } : { key, label, type, required });

/**
 * The statute's two blanks (the claimant's legal name and address; the property's legal
 * description), then what § 429.016.27 says must be typed or printed by the signature.
 */
export const MO_FIELDS: readonly FieldSpec[] = [
  f("claimantName", "Claimant's legal name", "text", true, "Your company's legal name."),
  f("claimantAddress", "Claimant's address", "text", true),
  f(
    "legalDescription",
    "Legal description of the Property",
    "multiline",
    true,
    "As recorded (lot, block, subdivision, county), not only the street address.",
  ),
  f("signerName", "Name of person signing", "text", true),
  f("signerTitle", "Title or position", "text", true),
  f("signerAddress", "Signer's address", "text", true),
  f("signerPhone", "Signer's telephone number", "text", true),
  f(
    "signedDate",
    "Date signed",
    "date",
    true,
    "The form waives lien rights for work before this date and for later work under agreements made before it.",
  ),
];

const RELEASE =
  "Claimant {{claimantName}}, {{claimantAddress}} hereby fully, finally, and unconditionally waives and releases any right to assert or enforce a mechanic's lien claim against the residential real property identified below for all work performed by Claimant prior to the date set forth below and for any work hereafter performed by or on behalf of Claimant under any agreements executed by Claimant prior to said date set forth below:";

/** § 429.016.27: name, title or position, address and telephone by the signature; the date beside it. */
const signature: BlockTemplate = {
  type: "signature",
  lines: [
    { label: "Signature", value: "" },
    { label: "Date signed", value: "{{signedDate}}" },
    { label: "Claimant's legal name", value: "{{claimantName}}" },
    { label: "Name of person signing", value: "{{signerName}}" },
    { label: "Title or position", value: "{{signerTitle}}" },
    { label: "Address", value: "{{signerAddress}}" },
    { label: "Telephone", value: "{{signerPhone}}" },
  ] satisfies SignatureLineTemplate[],
};

export const MO_BODY: readonly BlockTemplate[] = [
  { type: "title", text: "UNCONDITIONAL FINAL LIEN WAIVER" },
  { type: "heading", text: "FOR RESIDENTIAL REAL PROPERTY" },
  { type: "paragraph", text: RELEASE },
  { type: "paragraph", text: "{{legalDescription}}" },
  { type: "spacer" },
  signature,
];

export const MO_APPLIES_TO =
  "Residential real property in Missouri as Mo. Rev. Stat. § 429.016.1-.2 define it: new residential construction such as homes of four units or fewer (occupied or not), condominiums, townhouses and cooperatives, and the streets, utilities and common areas on those parcels. Not for repair, remodeling or additions to an owner-occupied home of four units or fewer (§ 429.013), and not for commercial work. On that property an unconditional final waiver is valid only on this form (§ 429.016.27).";

export const MO_NOTES: readonly string[] = [
  "Missouri: on residential real property (§ 429.016.1-.2) an unconditional, final mechanic's lien waiver is valid only if it is on a form substantially as in § 429.016.27. It waives all lien rights for work before the date signed and for later work under agreements made before that date (§ 429.016.26), and binds the claimant even if the promised payment never arrives (§ 429.016.29).",
  "Claimant's legal name and the name, title or position, address and telephone number of the signer must be typed or printed above or below the signature, and the date signed beside it (§ 429.016.27).",
  "A claimant that recorded a notice of rights and has been paid in full must give this waiver within five calendar days of a written request (§ 429.016.30).",
  "Only the lien right is waived: a waiver signed for less than full payment does not release any other claim, remedy or cause of action (§ 429.016.28).",
];

/** Added to Missouri's general forms, so a residential job is pointed to the statutory one. */
export const MO_GENERAL_NOTES: readonly string[] = [
  "Missouri prescribes a waiver form only for an unconditional final waiver on residential real property (Mo. Rev. Stat. § 429.016.27); on such a job choose the Missouri residential form instead of this one for that waiver. Elsewhere in Missouri, and for partial or conditional waivers (§ 429.016.25), the statute gives no form.",
  "On Missouri residential real property, a waiver given for less than the amount claimed due at the time does not waive lien rights unless it is the statutory unconditional final waiver (§ 429.016.25).",
];

export function moResidentialForm(): FormDefinition {
  return {
    id: MO_RESIDENTIAL_FORM_ID,
    state: "MO",
    kind: "unconditional-final",
    source: "statutory",
    title: "Unconditional Final Lien Waiver for Residential Real Property",
    citation: {
      text: "Mo. Rev. Stat. § 429.016.27",
      officialUrl: MO_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: MO_CHECKED_ON,
        sourceUrl: MO_SOURCE_URL,
        checkedBy:
          "Claude Code agent session, against the Missouri Revisor of Statutes' published text",
      },
    },
    fields: MO_FIELDS,
    body: MO_BODY,
    appliesTo: MO_APPLIES_TO,
    notes: MO_NOTES,
  };
}
