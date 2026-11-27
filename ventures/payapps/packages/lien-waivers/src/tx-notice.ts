import type { NoticeForm } from "./notices.ts";
import type { BlockTemplate, FieldSpec } from "./types.ts";

/**
 * Texas' two notices of claim from a subcontractor or supplier (a "claimant other than an original
 * contractor"), Tex. Prop. Code §§ 53.056(a-2) and 53.057(a-2) as amended by H.B. 2237 (2021), for
 * original contracts entered into on or after 1 January 2022. Each statute says the notice "must be
 * in substantially the following form", so each form is printed whole, word for word, its
 * "_______________" lines filled from the job or left as a rule.
 *
 * Wording copied from the Texas Legislature's Property Code chapter 53 (read 2026-11-27; snapshot
 * in sources/tx-53-notices.txt, with §§ 53.001, 53.003 and 53.052). Where a line is a caption under
 * a rule ("(Claimant's contact person)"), the caption became the field's label and a signature
 * line's label. test/tx-notice.test.ts checks both whole forms, and every phrase the notes quote,
 * against the snapshot. The deadlines are in tx-dates.ts.
 *
 * Not encoded: the rules for original contracts signed before 2022 (the earlier second-month notice
 * to the original contractor), public works (Gov't Code ch. 2253), the lien affidavit itself
 * (§ 53.054) and the notice of the filed affidavit (§ 53.055).
 */

export const TX_LABOR_NOTICE_ID = "TX/notice-of-claim/unpaid-labor-or-materials";
export const TX_RETAINAGE_NOTICE_ID = "TX/notice-of-claim/unpaid-retainage";
export const TX_NOTICE_SOURCE_URL = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.53.htm";
export const TX_NOTICE_CHECKED_ON = "2026-11-27";

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

function fields(amountKey: string, amountLabel: string, amountHelp: string): FieldSpec[] {
  return [
    f("noticeDate", "Date", "date", true, "The day you send the notice."),
    f(
      "projectDescription",
      "Project description and/or address",
      "multiline",
      true,
      "The job's name and street address, enough for the owner to know which project it is.",
    ),
    f("claimantName", "Claimant's name", "text", true, "Your company's name."),
    f(
      "workType",
      "Type of labor or materials provided",
      "text",
      true,
      "E.g. electrical labor and materials.",
    ),
    f(
      "originalContractor",
      "Original contractor's name",
      "text",
      true,
      "The general contractor whose contract is with the owner.",
    ),
    f(
      "contractedWith",
      "Party with whom claimant contracted if different from original contractor",
      "text",
      false,
      "The subcontractor that hired you, if not the GC. Left blank, the notice prints a line.",
    ),
    f(amountKey, amountLabel, "text", true, amountHelp),
    f(
      "contactPerson",
      "Claimant's contact person",
      "text",
      true,
      "Who at your company the owner or GC should call.",
    ),
    f(
      "claimantAddress",
      "Claimant's address",
      "multiline",
      true,
      "Your company's mailing address.",
    ),
  ];
}

const WARNING = "WARNING: This notice is provided to preserve lien rights.";
const OWNER_WARNING =
  "Owner's property may be subject to a lien if sufficient funds are not withheld from future payments to the original contractor to cover this debt.";

function body(title: string, amountLabel: string, amountKey: string): BlockTemplate[] {
  return [
    { type: "title", text: title },
    { type: "notice", text: WARNING },
    { type: "notice", text: OWNER_WARNING },
    { type: "field", label: "Date", value: "{{noticeDate}}" },
    { type: "field", label: "Project description and/or address", value: "{{projectDescription}}" },
    { type: "field", label: "Claimant's name", value: "{{claimantName}}" },
    { type: "field", label: "Type of labor or materials provided", value: "{{workType}}" },
    { type: "field", label: "Original contractor's name", value: "{{originalContractor}}" },
    {
      type: "field",
      label: "Party with whom claimant contracted if different from original contractor",
      value: "{{contractedWith}}",
    },
    { type: "field", label: amountLabel, value: `{{${amountKey}}}` },
    { type: "spacer" },
    {
      type: "signature",
      lines: [
        { label: "Claimant's contact person", value: "{{contactPerson}}" },
        { label: "Claimant's address", value: "{{claimantAddress}}" },
      ],
    },
  ];
}

const SEND_TO = "the owner or reputed owner and the original contractor";

const COMMON_NOTES: readonly string[] = [
  'How to send it: "in person to the party entitled to the notice or to that party\'s agent", "by certified mail", or "by any other form of traceable, private delivery or mailing service that can confirm proof of receipt" (§ 53.003(b)). By certified mail, "deposit or mailing of the notice in the United States mail in the form required constitutes compliance" (§ 53.003(c)). Keep the receipt or tracking record.',
  'Weekends: when a deadline "is a Saturday, Sunday, or legal holiday, the period is extended to include the next day that is not a Saturday, Sunday, or legal holiday" (§ 53.003(e)). PayApps moves a date past a weekend but not past a holiday, so the date it shows can be a day early, never late.',
  "These are the rules for an original contract (the owner's contract with the general contractor) signed on or after 1 January 2022 (H.B. 2237, 2021). Older contracts follow the earlier law, with different notices and dates. Public works are bond claims under Gov't Code ch. 2253, not covered here.",
  '"The notice may include an invoice or billing statement" (§§ 53.056(a-3), 53.057(a-3)): attach the unpaid pay application or invoice.',
];

/** § 53.056(a-2): the monthly notice of claim for unpaid labor or materials. */
export function txLaborNotice(): NoticeForm {
  return {
    id: TX_LABOR_NOTICE_ID,
    state: "TX",
    title: "Notice of claim for unpaid labor or materials",
    citation: {
      text: "Tex. Prop. Code § 53.056",
      officialUrl: TX_NOTICE_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: TX_NOTICE_CHECKED_ON,
        sourceUrl: TX_NOTICE_SOURCE_URL,
        checkedBy: "sources/tx-53-notices.txt; test/tx-notice.test.ts",
      },
    },
    sendTo: SEND_TO,
    fields: fields(
      "claimAmount",
      "Claim amount",
      "What is unpaid for the month (or months) this notice covers, e.g. $18,400.00.",
    ),
    body: body("NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS", "Claim amount", "claimAmount"),
    attachment: null,
    notes: [
      'Texas: "a claimant other than an original contractor must give the notice prescribed by Subsections (a-1) and (a-2) for the lien to be valid" (Tex. Prop. Code § 53.056(a)). It goes "to the owner or reputed owner and the original contractor" (§ 53.056(a-1)).',
      'One notice per month of unpaid work, sent "not later than the 15th day of the third month after the month during which" the labor or materials were provided; on a residential construction project, "not later than the 15th day of the second month after the month" (§ 53.056(a-1)). Work done in March and still unpaid: by 15 June (commercial) or 15 May (residential). A month you miss loses the lien for that month\'s work only.',
      'Residential means "a project for the construction or repair of a new or existing residence" (§ 53.001(10)): a house, duplex, triplex or quadruplex, or a condominium or co-op unit, owned and lived in by its owner (§ 53.001(8)). Everything else is "other than residential".',
      'The lien itself: file the affidavit with the county clerk "not later than the 15th day of the fourth month after" the month you last provided labor or materials, or the third month on a residential job (§ 53.052(b), (c)). The notice does not file a lien.',
      ...COMMON_NOTES,
    ],
  };
}

/** § 53.057(a-2): the notice of claim for unpaid retainage. */
export function txRetainageNotice(): NoticeForm {
  return {
    id: TX_RETAINAGE_NOTICE_ID,
    state: "TX",
    title: "Notice of claim for unpaid retainage",
    citation: {
      text: "Tex. Prop. Code § 53.057",
      officialUrl: TX_NOTICE_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: TX_NOTICE_CHECKED_ON,
        sourceUrl: TX_NOTICE_SOURCE_URL,
        checkedBy: "sources/tx-53-notices.txt; test/tx-notice.test.ts",
      },
    },
    sendTo: SEND_TO,
    fields: fields(
      "retainageUnpaid",
      "Total retainage unpaid",
      "The retainage held on your contract and not yet paid, e.g. $9,250.00.",
    ),
    body: body("NOTICE OF CLAIM FOR UNPAID RETAINAGE", "Total retainage unpaid", "retainageUnpaid"),
    attachment: null,
    notes: [
      'Texas: "To the extent that a claim for unpaid retainage is not included wholly or partly in a notice provided under Section 53.056, a claimant other than an original contractor whose contract provides for retainage must give notice under this section for a lien for unpaid retainage to be valid" (Tex. Prop. Code § 53.057(a)).',
      'When: to the owner or reputed owner and the original contractor "not later than the earlier of" the "30th day after the date the claimant\'s contract is completed, terminated, or abandoned" or the "30th day after the date the original contract is terminated or abandoned" (§ 53.057(a-1)).',
      'The lien for retainage: file the affidavit "not later than the 15th day of the third month after the month in which the original contract under which the claimant performed was completed, terminated, or abandoned" (§ 53.052(d)).',
      ...COMMON_NOTES,
    ],
  };
}
