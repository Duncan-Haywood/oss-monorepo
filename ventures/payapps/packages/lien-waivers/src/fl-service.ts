import { FL_NOTICE_DAYS, FL_NOTICE_MAIL_DAYS, flNoticeDates } from "./fl-notice.ts";
import { isIsoDate } from "./validate.ts";

/**
 * Florida's Notice to Owner, part 2: who a notice went to, how, and whether it was served in time.
 * Every rule is the statute's own words, from the Florida Senate's 2026 text in
 * sources/fl-713-06.txt (checked by test/fl-service.test.ts):
 *
 * - § 713.06(2)(a): served "not later than 45 days after commencing" to furnish; the owner, plus a
 *   copy on the contractor from "A sub-subcontractor or a materialman to a subcontractor", and on
 *   the subcontractor from a materialman to a sub-subcontractor who knows its name and address.
 * - § 713.06(2)(b): a copy to the person the notice of commencement designates; failing to serve it
 *   "does not invalidate an otherwise valid lien".
 * - § 713.06(2)(d): a notice served on a lender goes to the persons and address the notice of
 *   commencement designates.
 * - § 713.18(1): hand delivery; common carrier delivery service or registered, Global Express
 *   Guaranteed, or certified mail "with evidence of delivery"; or posting on the site if neither
 *   "cannot be accomplished".
 * - § 713.18(2): a notice to owner mailed by registered, Global Express Guaranteed, or certified mail
 *   "within 40 days after the date the lienor first furnishes" is served "as of the date of mailing",
 *   if the lienor keeps the mail log or the USPS tracking records (c)1-2 describe.
 *
 * Otherwise a mailed or carried notice is served when it is delivered, so the record takes the
 * delivery date from the evidence of delivery. Not encoded: § 713.18(3) (a notice returned
 * "refused", "moved, not forwardable" or "unclaimed"), the "before the date of the owner’s
 * disbursement of the final payment" limit, which PayApps cannot see, and any move of a date off a
 * weekend or holiday (the sections read say nothing about one, so the earlier date stands).
 */

export const FL_SERVICE_METHODS = [
  "certified-mail",
  "registered-mail",
  "global-express-guaranteed",
  "hand-delivery",
  "common-carrier",
  "posting",
] as const;
export type FlServiceMethod = (typeof FL_SERVICE_METHODS)[number];

export const FL_SERVICE_METHOD_LABELS: Readonly<Record<FlServiceMethod, string>> = {
  "certified-mail": "Certified mail",
  "registered-mail": "Registered mail",
  "global-express-guaranteed": "Global Express Guaranteed",
  "hand-delivery": "Hand delivery",
  "common-carrier": "Common carrier delivery service",
  posting: "Posted on the site (only if delivery and mail cannot be accomplished)",
};

/** The three mail services § 713.18(2)(a) names for service as of the date of mailing. */
export const FL_MAIL_ON_MAILING: readonly FlServiceMethod[] = [
  "certified-mail",
  "registered-mail",
  "global-express-guaranteed",
];

/** Who § 713.06(2)(a), (b) and (d) say gets the notice or a copy. */
export const FL_NOTICE_RECIPIENTS = [
  "owner",
  "contractor",
  "subcontractor",
  "designee",
  "lender",
] as const;
export type FlNoticeRecipient = (typeof FL_NOTICE_RECIPIENTS)[number];

export const FL_NOTICE_RECIPIENT_LABELS: Readonly<Record<FlNoticeRecipient, string>> = {
  owner: "Owner",
  contractor: "Contractor (copy)",
  subcontractor: "Subcontractor (copy, from a supplier to a sub-subcontractor)",
  designee: "Person designated in the notice of commencement (copy)",
  lender: "Lender (as the notice of commencement designates)",
};

/**
 * The recipient the reminder waits on. The owner always (§ 713.06(2)(a)); the contractor's copy is
 * owed only by a sub-subcontractor or a supplier to a subcontractor, which PayApps cannot know, so
 * the reminder says so rather than hold itself open for a copy a direct sub does not owe.
 */
export const FL_REMINDER_RECIPIENTS: readonly FlNoticeRecipient[] = ["owner"];

export type FlServedBasis = "mailing" | "delivery" | "posting";

export interface FlNoticeService {
  /** First day plus 45 days (§ 713.06(2)(a)). */
  serveBy: string;
  /** First day plus 40 days (§ 713.18(2)(b)). */
  mailBy: string;
  /** The day the notice counts as served, or null when a delivery date is needed and missing. */
  servedOn: string | null;
  /** Why: mailed within 40 days (§ 713.18(2)), delivered (§ 713.18(1)(a)-(b)), or posted ((1)(c)). */
  basis: FlServedBasis;
  /** servedOn on or before serveBy; null when servedOn is unknown. */
  onTime: boolean | null;
}

export interface FlNoticeGiven {
  method: FlServiceMethod;
  /** The day mailed, handed to the carrier, delivered by hand, or posted. */
  on: string;
  /** The delivery date from the evidence of delivery, for a mailed or carried notice. */
  deliveredOn?: string | null;
}

function assertDate(iso: string, what: string) {
  if (!isIsoDate(iso)) throw new RangeError(`${what} must be a date (YYYY-MM-DD): ${iso}`);
}

/** When the notice to one person counts as served and whether that is within the 45 days. */
export function flNoticeService(firstFurnishedOn: string, given: FlNoticeGiven): FlNoticeService {
  const { serveBy, mailBy } = flNoticeDates(firstFurnishedOn);
  assertDate(given.on, "Date sent");
  const delivered = given.deliveredOn || null;
  if (delivered) {
    assertDate(delivered, "Date delivered");
    if (delivered < given.on) throw new RangeError("Delivered before it was sent");
  }
  if (given.method === "hand-delivery" || given.method === "posting") {
    const servedOn = given.on;
    return {
      serveBy,
      mailBy,
      servedOn,
      basis: given.method === "posting" ? "posting" : "delivery",
      onTime: servedOn <= serveBy,
    };
  }
  if (FL_MAIL_ON_MAILING.includes(given.method) && given.on <= mailBy) {
    return { serveBy, mailBy, servedOn: given.on, basis: "mailing", onTime: true };
  }
  return {
    serveBy,
    mailBy,
    servedOn: delivered,
    basis: "delivery",
    onTime: delivered ? delivered <= serveBy : null,
  };
}

/** One line on how the notice counts, for the log and the job history. */
export function flServiceText(s: FlNoticeService): string {
  if (s.basis === "mailing") {
    return `Served as of the day mailed, within the ${FL_NOTICE_MAIL_DAYS} days (§ 713.18(2)), if you keep the mail log or USPS tracking records.`;
  }
  if (s.servedOn === null) {
    return `Mailed or sent after the ${FL_NOTICE_MAIL_DAYS} days or by carrier: served when delivered. Enter the delivery date from the evidence of delivery (§ 713.18(1)(b)).`;
  }
  const when = s.basis === "posting" ? "Posted" : "Served";
  return s.onTime
    ? `${when} ${s.servedOn}, within the ${FL_NOTICE_DAYS} days (§ 713.06(2)(a)).`
    : `${when} ${s.servedOn}, after the ${FL_NOTICE_DAYS} days ended ${s.serveBy}: "the failure to serve the notice, or to timely serve it, is a complete defense to enforcement of a lien" (§ 713.06(2)(a)).`;
}
