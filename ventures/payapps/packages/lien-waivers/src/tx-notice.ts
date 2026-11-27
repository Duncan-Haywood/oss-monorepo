import type { NoticeForm } from "./notices.ts";
import type { BlockTemplate, FieldSpec } from "./types.ts";
import { isIsoDate } from "./validate.ts";

/**
 * Texas notices of claim, Tex. Prop. Code §§ 53.056 and 53.057 (as rewritten by H.B. 2237, for
 * original contracts entered into on or after 2022-01-01). A subcontractor or supplier (a "claimant
 * other than an original contractor") must send, for its lien to be valid:
 *
 * - for unpaid labor or materials, a "NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS" to the owner or
 *   reputed owner and the original contractor by the 15th day of the third month after the month the
 *   work was provided (the second month on a residential construction project), § 53.056(a-1); and
 * - for unpaid retainage not already claimed that way, a "NOTICE OF CLAIM FOR UNPAID RETAINAGE" by
 *   the 30th day after its own contract is completed, terminated or abandoned (or the original
 *   contract is terminated or abandoned, if earlier), § 53.057(a-1).
 *
 * Both forms are copied word for word from the statute ("must be in substantially the following
 * form", § 53.056(a-2), § 53.057(a-2)); the snapshot is sources/tx-53-056.txt, read on the Texas
 * Legislature's site on 2026-11-27, and test/tx-notice.test.ts checks each form and every phrase
 * the notes quote against it. The statute prints a caption in place of two blanks ("(Claimant's
 * contact person)", "(Claimant's address)"); those became the fields' labels, as in fl-notice.ts.
 *
 * Deadlines: § 53.003(e) extends a deadline that falls on "a Saturday, Sunday, or legal holiday" to
 * the next day that is none of those. This module moves a Saturday or Sunday; it does not know the
 * Texas legal holidays, so it says so rather than guess, and the unmoved 15th stays the date to aim
 * for.
 *
 * Not encoded: the lien affidavit (§§ 53.052, 53.054), its notice (§ 53.055), the past-due notice
 * to the original contractor that § 53.056(a-4) makes optional, specially fabricated materials, and
 * original contracts entered into before 2022 (the old second- and third-month notices).
 */

export const TX_NOTICE_ID = "TX/notice-of-claim/unpaid-labor-or-materials";
export const TX_RETAINAGE_NOTICE_ID = "TX/notice-of-claim/unpaid-retainage";
export const TX_NOTICE_SOURCE_URL =
  "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.53.htm#53.056";
export const TX_RETAINAGE_SOURCE_URL =
  "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.53.htm#53.057";
export const TX_NOTICE_CHECKED_ON = "2026-11-27";

/** Whether the job is a "residential construction project" (§ 53.001(10)), which shortens the clock. */
export const TX_PROJECT_KINDS = ["commercial", "residential"] as const;
export type TxProjectKind = (typeof TX_PROJECT_KINDS)[number];

export const TX_PROJECT_KIND_LABELS: Record<TxProjectKind, string> = {
  commercial: "Not residential (commercial, public-private, multifamily for rent): third month",
  residential:
    "Residential construction project (an owner's house, duplex to fourplex, or condo unit they live in): second month",
};

/** § 53.003(b): in person, certified mail, or a traceable delivery service that confirms receipt. */
export const TX_NOTICE_METHODS = ["certified-mail", "in-person", "traceable-delivery"] as const;
export type TxNoticeMethod = (typeof TX_NOTICE_METHODS)[number];

export const TX_NOTICE_METHOD_LABELS: Record<TxNoticeMethod, string> = {
  "certified-mail": "Certified mail (counts when mailed, § 53.003(c))",
  "in-person": "In person, to the party or its agent",
  "traceable-delivery": "Traceable private delivery or mailing service with proof of receipt",
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The month (YYYY-MM) a date (YYYY-MM-DD) falls in. */
export function monthOf(iso: string): string {
  if (!isIsoDate(iso)) throw new RangeError(`Not a date (YYYY-MM-DD): ${iso}`);
  return iso.slice(0, 7);
}

function addMonths(month: string, n: number): string {
  const m = MONTH.exec(month);
  if (!m) throw new RangeError(`Not a month (YYYY-MM): ${month}`);
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Every month from the one `from` falls in to the one `to` falls in, in order. */
export function monthsBetween(from: string, to: string): string[] {
  const first = monthOf(from);
  const last = monthOf(to);
  if (last < first) throw new RangeError(`${to} is before ${from}`);
  const out: string[] = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) out.push(m);
  return out;
}

export interface TxNoticeDeadline {
  /** The month the labor or materials were provided (YYYY-MM). */
  month: string;
  /** The 15th of the third month after it (second, residential), § 53.056(a-1). */
  dueOn: string;
  /**
   * When `dueOn` is a Saturday or Sunday, the Monday § 53.003(e) extends it to (a Monday that is a
   * legal holiday extends further, which this does not check); otherwise null.
   */
  weekendExtendedTo: string | null;
}

const DAY_MS = 86_400_000;

/** The § 53.056(a-1) deadline for the work of one month. */
export function txNoticeDeadline(month: string, kind: TxProjectKind): TxNoticeDeadline {
  const due = `${addMonths(month, kind === "residential" ? 2 : 3)}-15`;
  const t = Date.parse(`${due}T00:00:00Z`);
  const dow = new Date(t).getUTCDay();
  const shift = dow === 6 ? 2 : dow === 0 ? 1 : 0;
  return {
    month,
    dueOn: due,
    weekendExtendedTo: shift ? new Date(t + shift * DAY_MS).toISOString().slice(0, 10) : null,
  };
}

/**
 * The deadline that governs work billed for a period: the earliest month the period touches, since
 * work in that month has the earliest notice date and one notice by then can claim the whole
 * period's unpaid amount. A pay application whose period starts on 26 October and ends on
 * 25 November therefore takes October's date.
 */
export function txPeriodDeadline(
  periodFrom: string,
  periodTo: string,
  kind: TxProjectKind,
): TxNoticeDeadline {
  const months = monthsBetween(periodFrom, periodTo);
  return txNoticeDeadline(months[0] as string, kind);
}

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

const COMMON_FIELDS = (amountKey: string, amountLabel: string, amountHelp: string) =>
  [
    f("signedDate", "Date", "date", true, "The date you send the notice."),
    f(
      "projectDescription",
      "Project description and/or address",
      "multiline",
      true,
      "The job's name and street address, enough for the owner to recognise the property.",
    ),
    f("claimantName", "Claimant's name", "text", true, "Your company's name."),
    f(
      "workType",
      "Type of labor or materials provided",
      "multiline",
      true,
      "E.g. electrical rough-in and finish, labor and materials.",
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
      "Only if you were hired by another subcontractor (or are a supplier to one). Left blank, the line prints empty.",
    ),
    f(amountKey, amountLabel, "text", true, amountHelp),
    f(
      "claimantContact",
      "Claimant's contact person",
      "text",
      true,
      "Who the owner or GC should call about the claim.",
    ),
    f(
      "claimantAddress",
      "Claimant's address",
      "multiline",
      true,
      "Your company's mailing address.",
    ),
  ] as const;

const TX_FIELDS: readonly FieldSpec[] = COMMON_FIELDS(
  "claimAmount",
  "Claim amount",
  "What is unpaid for the work this notice claims, e.g. $18,240.00. You may attach the invoice or pay application (§ 53.056(a-3)).",
);
const TX_RETAINAGE_FIELDS: readonly FieldSpec[] = COMMON_FIELDS(
  "retainageUnpaid",
  "Total retainage unpaid",
  "The retainage held on the job and not yet paid, e.g. $9,650.00.",
);

const WARNING = "WARNING: This notice is provided to preserve lien rights.";
const OWNER_WARNING =
  "Owner's property may be subject to a lien if sufficient funds are not withheld from future payments to the original contractor to cover this debt.";

const body = (title: string, amountLabel: string, amountKey: string): readonly BlockTemplate[] => [
  { type: "title", text: title },
  { type: "notice", text: WARNING },
  { type: "notice", text: OWNER_WARNING },
  { type: "field", label: "Date", value: "{{signedDate}}" },
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
      { label: "Claimant's contact person", value: "{{claimantContact}}" },
      { label: "Claimant's address", value: "{{claimantAddress}}" },
    ],
  },
];

export const TX_NOTICE_BODY = body(
  "NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS",
  "Claim amount",
  "claimAmount",
);
export const TX_RETAINAGE_NOTICE_BODY = body(
  "NOTICE OF CLAIM FOR UNPAID RETAINAGE",
  "Total retainage unpaid",
  "retainageUnpaid",
);

const SEND_TO = "the owner or reputed owner and the original contractor";

const HOW_TO_SEND =
  'How to send it (§ 53.003(b)): "in person to the party entitled to the notice or to that party\'s agent", "by certified mail", or "by any other form of traceable, private delivery or mailing service that can confirm proof of receipt". By certified mail, "deposit or mailing of the notice in the United States mail in the form required constitutes compliance" (§ 53.003(c)). Keep the date and the method: a lien affidavit must state "the date each notice of the claim was sent to the owner and the method by which the notice was sent" (§ 53.054(a)(8)).';

const WEEKEND =
  'A deadline on "a Saturday, Sunday, or legal holiday" is "extended to include the next day that is not a Saturday, Sunday, or legal holiday" (§ 53.003(e)). PayApps moves a Saturday or Sunday but does not track Texas legal holidays: send by the 15th and the question never arises.';

const SCOPE =
  "These are the notices for original contracts entered into on or after January 1, 2022 (H.B. 2237). A job whose prime contract is older follows the earlier notice rules, which PayApps does not encode. Public works (Tex. Gov't Code ch. 2253) and specially fabricated materials are not covered.";

const verification = (url: string) => ({
  status: "verified" as const,
  checkedOn: TX_NOTICE_CHECKED_ON,
  sourceUrl: url,
  checkedBy: "sources/tx-53-056.txt; test/tx-notice.test.ts",
});

/** Texas' notice of claim for unpaid labor or materials, Tex. Prop. Code § 53.056(a-2). */
export function txNoticeOfClaim(): NoticeForm {
  return {
    id: TX_NOTICE_ID,
    state: "TX",
    title: "Notice of claim for unpaid labor or materials",
    citation: {
      text: "Tex. Prop. Code § 53.056",
      officialUrl: TX_NOTICE_SOURCE_URL,
      verification: verification(TX_NOTICE_SOURCE_URL),
    },
    sendTo: SEND_TO,
    fields: TX_FIELDS,
    body: TX_NOTICE_BODY,
    attachment: null,
    notes: [
      'Texas: "a claimant other than an original contractor must give the notice prescribed by Subsections (a-1) and (a-2) for the lien to be valid" (Tex. Prop. Code § 53.056(a)). "For all unpaid labor or materials provided, the claimant must send a notice of claim for unpaid labor or materials to the owner or reputed owner and the original contractor" (§ 53.056(a-1)).',
      'Timing, month by month: "for projects other than residential construction projects, not later than the 15th day of the third month after the month during which" the labor or materials were provided; "for residential construction projects, not later than the 15th day of the second month" (§ 53.056(a-1)). Work done in March on a commercial job: by June 15. Each month of unpaid work has its own date, so a notice can claim several months at once if it goes by the earliest one.',
      '"The notice may include an invoice or billing statement" (§ 53.056(a-3)): attach the pay application the amount comes from.',
      HOW_TO_SEND,
      WEEKEND,
      SCOPE,
    ],
  };
}

/** Texas' notice of claim for unpaid retainage, Tex. Prop. Code § 53.057(a-2). */
export function txRetainageNotice(): NoticeForm {
  return {
    id: TX_RETAINAGE_NOTICE_ID,
    state: "TX",
    title: "Notice of claim for unpaid retainage",
    citation: {
      text: "Tex. Prop. Code § 53.057",
      officialUrl: TX_RETAINAGE_SOURCE_URL,
      verification: verification(TX_RETAINAGE_SOURCE_URL),
    },
    sendTo: SEND_TO,
    fields: TX_RETAINAGE_FIELDS,
    body: TX_RETAINAGE_NOTICE_BODY,
    attachment: null,
    notes: [
      'Texas: "To the extent that a claim for unpaid retainage is not included wholly or partly in a notice provided under Section 53.056, a claimant other than an original contractor whose contract provides for retainage must give notice under this section for a lien for unpaid retainage to be valid" (Tex. Prop. Code § 53.057(a)).',
      'Timing: "not later than the earlier of: (1) the 30th day after the date the claimant\'s contract is completed, terminated, or abandoned; or (2) the 30th day after the date the original contract is terminated or abandoned" (§ 53.057(a-1)). PayApps does not know when your contract was completed: count the 30 days from that date yourself.',
      HOW_TO_SEND,
      WEEKEND,
      SCOPE,
    ],
  };
}
