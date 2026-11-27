import { CA_CHECKED_ON, CA_SOURCE_URL } from "./ca.ts";
import type { NoticeDocument } from "./notices.ts";
import type { Block } from "./types.ts";
import { formatDate, isIsoDate } from "./validate.ts";

/**
 * California preliminary notice, part 2: when it is due, when it counts as given, and the proof of
 * notice declaration. Every rule here is a statute's own words, from the Legislative Counsel's text
 * in sources/ca-8102-8216.txt (checked by test/ca-proof.test.ts):
 *
 * - § 8204(a): "A preliminary notice shall be given not later than 20 days after the claimant has
 *   first furnished work on the work of improvement." A late notice covers "work performed within
 *   20 days prior to the service of the preliminary notice, and at any time thereafter."
 * - §§ 8106, 8110: personal delivery; registered or certified mail, express mail, or overnight
 *   delivery by an express service carrier; or leaving it and mailing a copy under Code Civ. Proc.
 *   § 415.20.
 * - § 8116: when notice is complete for each of those means.
 * - § 8118: what the proof of notice declaration states, and what accompanies it when mailed.
 *
 * Dates are counted in calendar days and never moved for a weekend or a holiday: whether a rule
 * outside these sections (Code Civ. Proc. §§ 12-12a) extends a deadline is a question for counsel,
 * and the earlier date is the safe one. The declaration does not print the "under penalty of
 * perjury" sentence of Code Civ. Proc. § 2015.5: that section's official text is not in the
 * snapshot, and this package prints no statutory wording it has not checked.
 */

/** Ways § 8106 allows, with mail split into the § 8110 services (each needs different proof). */
export const CA_NOTICE_METHODS = [
  "personal",
  "registered-mail",
  "certified-mail",
  "express-mail",
  "overnight-carrier",
  "leave-and-mail",
] as const;
export type CaNoticeMethod = (typeof CA_NOTICE_METHODS)[number];

export const CA_NOTICE_METHOD_LABELS: Readonly<Record<CaNoticeMethod, string>> = {
  personal: "Personal delivery",
  "registered-mail": "Registered mail",
  "certified-mail": "Certified mail",
  "express-mail": "Express mail",
  "overnight-carrier": "Overnight delivery by an express service carrier",
  "leave-and-mail": "Left and a copy mailed (Code Civ. Proc. § 415.20)",
};

/** Who § 8200(a) says gets the notice. */
export const CA_NOTICE_RECIPIENTS = ["owner", "direct-contractor", "lender"] as const;
export type CaNoticeRecipient = (typeof CA_NOTICE_RECIPIENTS)[number];

export const CA_NOTICE_RECIPIENT_LABELS: Readonly<Record<CaNoticeRecipient, string>> = {
  owner: "Owner or reputed owner",
  "direct-contractor": "Direct contractor or reputed direct contractor",
  lender: "Construction lender or reputed construction lender",
};

export const CA_NOTICE_DAYS = 20;

const DAY_MS = 86_400_000;
function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
function assertDate(iso: string, what: string) {
  if (!isIsoDate(iso)) throw new RangeError(`${what} must be a date (YYYY-MM-DD): ${iso}`);
}

/** § 8204(a): the last day to give the notice, 20 calendar days after work was first furnished. */
export function caNoticeDueOn(firstFurnishedOn: string): string {
  assertDate(firstFurnishedOn, "First-furnished date");
  return addDays(firstFurnishedOn, CA_NOTICE_DAYS);
}

/** § 8116: the day notice given by `method` on `on` is complete and deemed given. */
export function caNoticeCompleteOn(method: CaNoticeMethod, on: string): string {
  assertDate(on, "Date given");
  // (a) personal delivery: when delivered; (b) mail or express carrier: when deposited;
  // (c) leaving it and mailing a copy under CCP § 415.20: five days after mailing.
  return method === "leave-and-mail" ? addDays(on, 5) : on;
}

export interface CaNoticeTiming {
  dueOn: string;
  /** When the notice is complete (§ 8116), or null when none is recorded. */
  givenOn: string | null;
  onTime: boolean | null;
  /**
   * For a late notice, the first day of work it covers (§ 8204(a): work performed within 20 days
   * before service, and after); null when on time or not given.
   */
  coversWorkFrom: string | null;
}

/** Whether the notice to one person was given on time, from § 8116's completion date. */
export function caNoticeTiming(
  firstFurnishedOn: string,
  given: { method: CaNoticeMethod; on: string } | null,
): CaNoticeTiming {
  const dueOn = caNoticeDueOn(firstFurnishedOn);
  if (!given) return { dueOn, givenOn: null, onTime: null, coversWorkFrom: null };
  const givenOn = caNoticeCompleteOn(given.method, given.on);
  const onTime = givenOn <= dueOn;
  return {
    dueOn,
    givenOn,
    onTime,
    coversWorkFrom: onTime ? null : addDays(givenOn, -CA_NOTICE_DAYS),
  };
}

/** § 8118(b): what accompanies the declaration when the notice was mailed or sent by carrier. */
export function caProofAttachments(method: CaNoticeMethod): string[] {
  switch (method) {
    case "personal":
      return [];
    case "overnight-carrier":
      return [
        "Documentation provided by an express service carrier showing that payment was made to send the notice using an overnight delivery service.",
        "A tracking record or other documentation provided by an express service carrier showing delivery or attempted delivery of the notice.",
      ];
    default:
      // Registered, certified or express mail, and the mailed copy under CCP § 415.20.
      return [
        "Documentation provided by the United States Postal Service showing that payment was made to mail the notice using registered or certified mail, or express mail.",
        "A return receipt, delivery confirmation, signature confirmation, tracking record, or other proof of delivery or attempted delivery provided by the United States Postal Service, or a photocopy of the record of delivery and receipt maintained by the United States Postal Service, showing the date of delivery and to whom delivered, or in the event of nondelivery, by the returned envelope itself.",
      ];
  }
}

export interface CaProofInput {
  recipient: CaNoticeRecipient;
  /** Name and address of the person given notice (§ 8118(a)(3)). */
  recipientNameAddress: string;
  method: CaNoticeMethod;
  /** Day delivered, deposited or mailed. */
  on: string;
  /** City or address where it was delivered or mailed. */
  place: string;
  /** Tracking or receipt number, if any. */
  tracking?: string;
  /** Who gave it (the declarant), and for whom. */
  declarant: string;
  claimant: string;
  siteDescription: string;
}

export const CA_PROOF_ID = "CA/proof-of-notice/8118";

/** The § 8118 proof of notice declaration for one preliminary notice, as PDF-ready blocks. */
export function caProofOfNotice(input: CaProofInput): NoticeDocument {
  assertDate(input.on, "Date given");
  for (const [k, v] of Object.entries({
    recipientNameAddress: input.recipientNameAddress,
    place: input.place,
    declarant: input.declarant,
    claimant: input.claimant,
    siteDescription: input.siteDescription,
  })) {
    if (!v.trim()) throw new RangeError(`${k} is required`);
  }
  const label = CA_NOTICE_METHOD_LABELS[input.method];
  const completeOn = caNoticeCompleteOn(input.method, input.on);
  const manner =
    input.method === "personal"
      ? `By personal delivery (Cal. Civ. Code § 8106(a)) on ${formatDate(input.on)}, at ${input.place.trim()}. Notice was complete when delivered (§ 8116(a)).`
      : input.method === "leave-and-mail"
        ? `By leaving the notice and mailing a copy in the manner provided in Code Civ. Proc. § 415.20 (Cal. Civ. Code § 8106(c)); the copy was mailed on ${formatDate(input.on)} from ${input.place.trim()}. Notice is complete five days after mailing, on ${formatDate(completeOn)} (§ 8116(c)).`
        : `By ${label.toLowerCase()} (Cal. Civ. Code §§ 8106(b), 8110), deposited on ${formatDate(input.on)} at ${input.place.trim()}${input.tracking?.trim() ? `, tracking or receipt number ${input.tracking.trim()}` : ""}. Notice was complete when deposited (§ 8116(b)).`;
  const attachments = caProofAttachments(input.method);
  const blocks: Block[] = [
    { type: "title", text: "PROOF OF NOTICE DECLARATION" },
    {
      type: "paragraph",
      text: "Cal. Civ. Code § 8118(a): proof that notice was given to a person in the manner required by Part 6 of Division 4.",
    },
    { type: "heading", text: "(1) The type or description of the notice given" },
    {
      type: "paragraph",
      text: `Preliminary notice (private works), Cal. Civ. Code §§ 8102, 8200-8206, given by ${input.claimant.trim()} for work on: ${input.siteDescription.trim()}.`,
    },
    { type: "heading", text: "(2) The date, place, and manner of notice" },
    { type: "paragraph", text: manner },
    { type: "heading", text: "(3) The name and address of the person to which notice was given" },
    {
      type: "paragraph",
      text: `${input.recipientNameAddress.trim()}\nCapacity: ${CA_NOTICE_RECIPIENT_LABELS[input.recipient]} (§ 8200(a)).`,
    },
  ];
  if (attachments.length > 0) {
    blocks.push(
      { type: "heading", text: "Accompanying documentation (§ 8118(b)), one of:" },
      ...attachments.map((t): Block => ({ type: "paragraph", text: `[ ] ${t}` })),
    );
  }
  blocks.push(
    {
      type: "paragraph",
      text: `I gave the notice described above in the manner stated. Declared by ${input.declarant.trim()}.`,
    },
    {
      type: "signature",
      lines: [
        { label: "Signature", value: "" },
        { label: "Name and title", value: input.declarant.trim() },
        { label: "Date and place signed", value: "" },
      ],
    },
  );
  return {
    formId: CA_PROOF_ID,
    state: "CA",
    title: "Proof of notice declaration",
    citation: "Cal. Civ. Code § 8118",
    sendTo:
      "Kept with your records; filed or produced when the lien, stop payment notice or bond claim is enforced",
    disclaimers: [
      "A California declaration is signed under penalty of perjury (Code Civ. Proc. § 2015.5). That section's official wording is not printed here because its text was not checked against the Legislative Counsel's source; add it, or use your counsel's form.",
      `Statute text: ${CA_SOURCE_URL}, checked ${CA_CHECKED_ON}.`,
      "Generated by software; not legal advice. Have counsel review before relying on it.",
    ],
    values: {
      recipient: input.recipient,
      method: input.method,
      on: input.on,
      completeOn,
    },
    blocks,
    attachment: null,
  };
}
