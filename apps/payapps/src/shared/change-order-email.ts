// An email to the GC's project manager about one pending change order, drafted from the change order
// as entered. Pure and offline: no LLM, nothing sent. The contractor reads it, edits it and sends it
// from their own mail program. Every fact in it is one the job page already shows (number, scope,
// amount, contract time, the contract sum before and after, the date sent) and nothing is invented:
// no claim that a file is attached (the contractor attaches the PDF), no legal threat, no view on
// whether the GC must approve.
//
// Which draft:
// - "request": pending and no date sent recorded: asks the PM to review and sign.
// - "follow-up": pending and sent on a recorded date: asks where it stands and what is needed, and
//   names the contractor's last follow-up when a draft was copied or opened after the date sent.
// Approved and rejected change orders get no draft.
//
// The greeting and recipient come only from the GC project manager entered on the job (change order
// requests go to the PM, pay applications to the billing contact); without one it greets the GC's
// project team and leaves the recipient blank.

import { scheduleText } from "./change-order-request";
import { formatCents } from "./money";

export type ChangeOrderEmailKind = "request" | "follow-up";

export interface ChangeOrderEmailJob {
  name: string;
  number: string | null;
  gcName: string;
  gcPmName?: string | null;
  gcPmEmail?: string | null;
  originalContractSumCents: number;
}

export interface ChangeOrderEmailCo {
  id: string;
  number: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  submittedOn: string | null;
  scheduleDays: number | null;
  totalCents: number;
  /** Date a draft was last copied or opened here; a follow-up mentions it when after the date sent. */
  lastEmailedOn?: string | null;
}

export interface ChangeOrderEmail {
  kind: ChangeOrderEmailKind;
  /** The GC project manager's address from the job, or null (the contractor adds it). */
  to: string | null;
  subject: string;
  body: string;
}

/** "Attn: Dana Ruiz, dana@builder.com" for the request PDF, or null when no PM is entered. */
export function pmAttentionLine(job: {
  gcPmName?: string | null;
  gcPmEmail?: string | null;
}): string | null {
  const parts = [job.gcPmName?.trim(), job.gcPmEmail?.trim()].filter(Boolean);
  return parts.length ? `Attn: ${parts.join(", ")}` : null;
}

/** "Hello Dana Ruiz," with a PM on the job, else "Hello Harbor Builders project team,". */
export function pmGreeting(job: Pick<ChangeOrderEmailJob, "gcName" | "gcPmName">): string {
  const name = job.gcPmName?.trim();
  return name ? `Hello ${name},` : `Hello ${job.gcName} project team,`;
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * The last time a draft was opened, when it is worth naming in a follow-up: after the date sent (an
 * earlier one was the request itself) and before today (today's is this email). Null otherwise.
 */
export function lastChase(
  co: Pick<ChangeOrderEmailCo, "submittedOn" | "lastEmailedOn">,
  today: string,
): string | null {
  const last = co.lastEmailedOn;
  if (!last || !co.submittedOn) return null;
  return last > co.submittedOn && last < today ? last : null;
}

/** "last emailed 2026-11-20 (5 days ago)" for a change order row, or null when never. */
export function lastEmailedText(lastEmailedOn: string | null | undefined, today: string) {
  if (!lastEmailedOn) return null;
  const days = Math.max(0, daysBetween(lastEmailedOn, today));
  const ago = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `last emailed ${lastEmailedOn} (${ago})`;
}

/** "an add of $4,200.00" or "a deduct of $1,000.00" (or "no change in price"). */
function priceText(cents: number): string {
  if (cents === 0) return "no change in price";
  return cents > 0 ? `an add of ${formatCents(cents)}` : `a deduct of ${formatCents(-cents)}`;
}

/** The scope in one line for a subject: the first line, cut at 60 characters on a word. */
function shortScope(description: string): string {
  const first = description.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (first.length <= 60) return first;
  const cut = first.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

/**
 * The draft for one change order, or null when it is approved or rejected. `changeOrders` is every
 * change order on the job, for the contract sum before and after (approved ones count; other pending
 * ones are not added). Signed with the user's name and company; a blank one leaves a placeholder.
 */
export function changeOrderEmail(
  job: ChangeOrderEmailJob,
  co: ChangeOrderEmailCo,
  changeOrders: Pick<ChangeOrderEmailCo, "id" | "status" | "totalCents">[],
  from: { name: string; company: string },
  today: string,
): ChangeOrderEmail | null {
  if (co.status !== "pending") return null;
  const label = job.number ? `${job.name} (job ${job.number})` : job.name;
  const approved = changeOrders
    .filter((c) => c.id !== co.id && c.status === "approved")
    .reduce((s, c) => s + c.totalCents, 0);
  const before = job.originalContractSumCents + approved;
  const after = before + co.totalCents;
  const scope = co.description.trim();
  const facts = [
    `Price: ${priceText(co.totalCents)}.`,
    scheduleText(co.scheduleDays),
    co.totalCents === 0
      ? `Contract sum: ${formatCents(before)}, unchanged.`
      : `Contract sum: ${formatCents(before)} before this change order, ${formatCents(after)} after it.`,
  ];
  const lines: string[] = [];
  let kind: ChangeOrderEmailKind;
  let subject: string;

  if (!co.submittedOn) {
    kind = "request";
    subject = `Change order request ${co.number}: ${shortScope(scope)} (${label})`;
    lines.push(
      `We are requesting a change order on ${label} (our change order request ${co.number}) for the following change:`,
      scope,
      facts.join("\n"),
      "Please review it and return a signed change order. If you need anything before you can approve it (pricing backup, a breakdown, or a question on the scope), let me know and I will get it to you right away.",
    );
  } else {
    kind = "follow-up";
    const days = Math.max(0, daysBetween(co.submittedOn, today));
    const chased = lastChase(co, today);
    subject = `Following up: change order request ${co.number}, ${label}`;
    lines.push(
      `I am following up on our change order request ${co.number} on ${label}, sent on ${co.submittedOn}${days > 0 ? ` (${days} day${days === 1 ? "" : "s"} ago)` : ""}${chased ? `, and on my follow-up of ${chased}` : ""}, for the following change:`,
      scope,
      facts.join("\n"),
      "Could you tell me where it stands? If it is approved, please send the signed change order so we can bill the work. If something is holding it up (pricing backup, a breakdown, or a question on the scope), let me know what you need.",
    );
  }

  const name = from.name.trim() || "[your name]";
  const company = from.company.trim() || "[your company]";
  const body = [
    pmGreeting(job),
    "",
    ...lines.filter((l) => l !== "").flatMap((l) => [l, ""]),
    "Thank you,",
    name,
    company,
  ].join("\n");
  return { kind, to: job.gcPmEmail?.trim() || null, subject, body };
}
