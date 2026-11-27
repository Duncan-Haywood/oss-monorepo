// An email to the GC's estimator about one estimate (bid), drafted from the estimate as saved: the
// proposal going out on bid day, or a follow-up once it has been sent. Pure and offline: no LLM,
// nothing sent. The contractor reads it, edits it, attaches the proposal PDF and sends it from their
// own mail program. Every fact in it is one the estimate page and the proposal PDF already show
// (number, job, location, bid due date, base bid, alternates, the date sent and the date it lapses)
// and nothing is invented: no claim that a file is attached, no claim about other bidders or the
// award, no pressure beyond asking where the bid stands.
//
// Which draft:
// - "proposal": a draft estimate (not yet marked sent): submits the base bid and alternates, and the
//   date it is open until, counted from today, the date the PDF prints for an unsent estimate.
// - "follow-up": sent: asks whether the job has been awarded and whether anything is needed from the
//   contractor, and (when it went to someone else) for the result. Past its open-for-acceptance date it
//   says so and offers to confirm or update the pricing instead of holding to it.
// Won and lost estimates get no draft.
//
// The greeting and recipient come only from the GC contact entered on the estimate; without one it
// greets the GC's estimating team and leaves the recipient blank.

import { addDays } from "./cash-report";
import type { AlternateKind } from "./estimate";
import { formatCents } from "./money";

export type EstimateEmailKind = "proposal" | "follow-up";

export interface EstimateEmailInput {
  label: string;
  name: string;
  gcName: string;
  gcContactName: string | null;
  gcContactEmail: string | null;
  location: string | null;
  bidDueOn: string | null;
  sentOn: string | null;
  status: "draft" | "sent" | "won" | "lost";
  validDays: number;
  totals: { priceCents: number };
  bidItems: {
    description: string;
    alternate: AlternateKind | null;
    alternateNumber: number | null;
    priceCents: number;
  }[];
}

export interface EstimateEmail {
  kind: EstimateEmailKind;
  /** The GC contact's address from the estimate, or null (the contractor adds it). */
  to: string | null;
  subject: string;
  body: string;
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** The date the proposal stops being open for acceptance, as the PDF prints it. */
export function proposalLapsesOn(
  e: Pick<EstimateEmailInput, "sentOn" | "validDays">,
  today: string,
): string {
  return addDays(e.sentOn ?? today, e.validDays);
}

/** "Hello Dana Ruiz," with a contact on the estimate, else "Hello Harbor Builders estimating team,". */
export function estimateGreeting(e: Pick<EstimateEmailInput, "gcName" | "gcContactName">): string {
  const name = e.gcContactName?.trim();
  return name ? `Hello ${name},` : `Hello ${e.gcName} estimating team,`;
}

/** "Alternate No. 1 (add): Generator pad, add $4,200.00", one per alternate in number order. */
export function alternateLines(bidItems: EstimateEmailInput["bidItems"]): string[] {
  return bidItems
    .filter((b) => b.alternate && b.alternateNumber !== null)
    .sort((a, b) => (a.alternateNumber ?? 0) - (b.alternateNumber ?? 0))
    .map(
      (b) =>
        `Alternate No. ${b.alternateNumber} (${b.alternate}): ${b.description}, ${b.alternate === "add" ? "add" : "deduct"} ${formatCents(b.priceCents)}`,
    );
}

/**
 * The draft for one estimate, or null when it is won or lost. Signed with the user's name and
 * company; a blank one leaves a placeholder.
 */
export function estimateEmail(
  e: EstimateEmailInput,
  from: { name: string; company: string },
  today: string,
): EstimateEmail | null {
  if (e.status === "won" || e.status === "lost") return null;
  const job = e.location?.trim() ? `${e.name} (${e.location.trim()})` : e.name;
  const alts = alternateLines(e.bidItems);
  const price = alts.length
    ? `Base bid: ${formatCents(e.totals.priceCents)}.`
    : `Bid price: ${formatCents(e.totals.priceCents)}.`;
  const figures = alts.length ? [price, "Alternates:", ...alts.map((a) => `- ${a}`)] : [price];
  const lapses = proposalLapsesOn(e, today);
  const lines: string[] = [];
  let kind: EstimateEmailKind;
  let subject: string;

  if (e.status === "draft") {
    kind = "proposal";
    const due = e.bidDueOn && e.bidDueOn >= today ? `, for the bid due ${e.bidDueOn}` : "";
    subject = `Proposal ${e.label}: ${e.name}`;
    lines.push(
      `We are pleased to submit our proposal ${e.label} for ${job}${due}.`,
      figures.join("\n"),
      `The proposal lists what is included and excluded, and is open for acceptance until ${lapses}.`,
      "If you have a question on our scope or need a breakdown, let me know and I will get it to you right away.",
    );
  } else {
    kind = "follow-up";
    const sent = e.sentOn ?? today;
    const days = Math.max(0, daysBetween(sent, today));
    subject = `Following up: proposal ${e.label}, ${e.name}`;
    lines.push(
      `I am following up on our proposal ${e.label} for ${job}, sent on ${sent}${days > 0 ? ` (${days} day${days === 1 ? "" : "s"} ago)` : ""}.`,
      figures.join("\n"),
      lapses >= today
        ? `It is open for acceptance until ${lapses}.`
        : `It was open for acceptance until ${lapses}. If the job is going ahead, let me know and I will confirm our pricing or send an updated proposal.`,
      "Could you tell me where the bid stands? If anything is needed from us (a scope question, a breakdown or a revised number), let me know. If the work has gone to another contractor, I would appreciate knowing, and any feedback on our number helps us on the next one.",
    );
  }

  const name = from.name.trim() || "[your name]";
  const company = from.company.trim() || "[your company]";
  const body = [
    estimateGreeting(e),
    "",
    ...lines.flatMap((l) => [l, ""]),
    "Thank you,",
    name,
    company,
  ].join("\n");
  return { kind, to: e.gcContactEmail?.trim() || null, subject, body };
}
