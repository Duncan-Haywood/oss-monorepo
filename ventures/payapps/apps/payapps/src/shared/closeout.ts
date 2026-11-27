// Close-out: the documents a subcontract asks for at the end of a job (warranty letter, O&M
// manuals, as-built drawings, attic stock, final lien waivers, consent of surety and so on) before
// the GC releases the subcontractor's retainage. Pure: each item's status for today, the
// checklist's summary, the standard list a contractor can start from, what still stands between
// the job and its retainage (with the punch list and the retainage held, which the Worker reads),
// and the release-request email. Shared by the Worker (services/payapps/closeout.ts) and the SPA
// (components/closeout.tsx). Nothing is estimated: every date is one the contractor entered, the
// standard list is a starting point to edit (the subcontract and spec section 01 77 00 or 01 78 00
// decide what a job needs), and the retainage figure is the one on the job's latest pay application.

import { daysBetween } from "./cash-report";
import { pmGreeting } from "./change-order-email";
import { formatCents } from "./money";
import type { PunchListSummary } from "./punch-list";

/** The kinds of close-out document; "other" is anything the subcontract names that these miss. */
export const CLOSEOUT_KINDS = [
  "warranty",
  "om_manuals",
  "as_builts",
  "attic_stock",
  "final_waiver",
  "consent_of_surety",
  "training",
  "test_reports",
  "inspection_signoff",
  "other",
] as const;
export type CloseoutKind = (typeof CLOSEOUT_KINDS)[number];

export const CLOSEOUT_KIND_LABELS: Record<CloseoutKind, string> = {
  warranty: "Warranty",
  om_manuals: "O&M manuals",
  as_builts: "As-built drawings",
  attic_stock: "Attic stock / extra materials",
  final_waiver: "Final lien waiver",
  consent_of_surety: "Consent of surety",
  training: "Owner training",
  test_reports: "Test and start-up reports",
  inspection_signoff: "Final inspection sign-off",
  other: "Other",
};

/**
 * The list a contractor can add in one go and then edit: the documents subcontracts most often ask
 * for at close-out. Consent of surety is left out (only bonded jobs need it) and offered on its
 * own; so are training and test reports, which depend on the trade.
 */
export const STANDARD_CLOSEOUT_ITEMS: { kind: CloseoutKind; title: string }[] = [
  {
    kind: "warranty",
    title: "Warranty letter (one year from substantial completion, or as the subcontract says)",
  },
  { kind: "om_manuals", title: "Operation and maintenance manuals and product data" },
  { kind: "as_builts", title: "As-built drawings (marked-up record set)" },
  { kind: "attic_stock", title: "Attic stock and extra materials, with a signed receipt" },
  { kind: "inspection_signoff", title: "Final inspection sign-off" },
  { kind: "final_waiver", title: "Final lien waiver (conditional on the final payment)" },
];

/**
 * missing: not sent, no due date passed; overdue: not sent and its due date has passed; sent: with
 * the GC, waiting for them to accept it; accepted: the GC took it; waived: the GC or the subcontract
 * says this job does not need it (kept on the list with the reason, out of the count).
 */
export type CloseoutStatus = "missing" | "overdue" | "sent" | "accepted" | "waived";

export const CLOSEOUT_STATUS_LABELS: Record<CloseoutStatus, string> = {
  missing: "To send",
  overdue: "Overdue",
  sent: "Sent, awaiting the GC",
  accepted: "Accepted",
  waived: "Not required",
};

export interface CloseoutItemFacts {
  kind: CloseoutKind;
  title: string;
  /** Where the requirement comes from, as typed ("Subcontract Exhibit D", "Spec 01 78 00"). */
  requiredBy: string | null;
  /** ISO dates (YYYY-MM-DD); null: not entered. */
  dueOn: string | null;
  sentOn: string | null;
  acceptedOn: string | null;
  acceptedBy: string | null;
  /** Why this job does not need it; set means waived. */
  waivedNote: string | null;
}

export function closeoutStatus(
  item: Pick<CloseoutItemFacts, "dueOn" | "sentOn" | "acceptedOn" | "waivedNote">,
  today: string,
): CloseoutStatus {
  if (item.acceptedOn) return "accepted";
  if (item.waivedNote?.trim()) return "waived";
  if (item.sentOn) return "sent";
  if (item.dueOn && item.dueOn < today) return "overdue";
  return "missing";
}

/** Calendar days past the due date, for an item not sent yet; 0 otherwise. */
export function closeoutDaysOverdue(
  item: Pick<CloseoutItemFacts, "dueOn" | "sentOn" | "acceptedOn" | "waivedNote">,
  today: string,
): number {
  if (closeoutStatus(item, today) !== "overdue" || !item.dueOn) return 0;
  return daysBetween(item.dueOn, today);
}

export interface CloseoutSummary {
  total: number;
  missing: number;
  overdue: number;
  sent: number;
  accepted: number;
  waived: number;
  /** Items still to send (missing + overdue). */
  toSend: number;
  /** Items that count (all but waived) that are sent or accepted, in whole percent; null when none counts. */
  deliveredPct: number | null;
  /** True when there are items and every one that counts has been sent or accepted. */
  delivered: boolean;
}

export function summarizeCloseout(items: CloseoutItemFacts[], today: string): CloseoutSummary {
  const s: CloseoutSummary = {
    total: items.length,
    missing: 0,
    overdue: 0,
    sent: 0,
    accepted: 0,
    waived: 0,
    toSend: 0,
    deliveredPct: null,
    delivered: false,
  };
  for (const i of items) s[closeoutStatus(i, today)]++;
  s.toSend = s.missing + s.overdue;
  const counted = s.total - s.waived;
  if (counted > 0) {
    s.deliveredPct = Math.floor(((s.sent + s.accepted) / counted) * 100);
    s.delivered = s.toSend === 0;
  }
  return s;
}

/** Checks an item's dates as a whole; returns the first problem in words, or null. */
export function closeoutDateProblem(
  item: Pick<CloseoutItemFacts, "sentOn" | "acceptedOn">,
  today: string,
): string | null {
  if (item.sentOn && item.sentOn > today) return "The date sent cannot be in the future";
  if (item.acceptedOn && item.acceptedOn > today) {
    return "The date accepted cannot be in the future";
  }
  if (item.sentOn && item.acceptedOn && item.acceptedOn < item.sentOn) {
    return "The date accepted cannot be before the date sent";
  }
  return null;
}

/**
 * The standard items a job does not have yet, matched by kind, so pressing "Add the standard list"
 * twice adds nothing the second time and never doubles an item the contractor added by hand.
 */
export function standardItemsToAdd(existingKinds: CloseoutKind[]) {
  const have = new Set(existingKinds);
  return STANDARD_CLOSEOUT_ITEMS.filter((i) => !have.has(i.kind));
}

/** What the retainage check reads from the job's pay applications (the Worker fills it). */
export interface RetainagePosition {
  /** Retainage held on the latest pay application sent; 0 when none is sent or none held. */
  heldCents: number;
  /** The number of that application; null when none is sent. */
  lastApplication: number | null;
  /** True when the latest application sent bills the whole contract (balance to finish 0). */
  workComplete: boolean;
}

export interface CloseoutReadiness {
  /** Nothing on the lists stands between the job and asking for its retainage. */
  ready: boolean;
  /** What still does, in words, most important first; empty when ready. */
  blockers: string[];
}

/**
 * What stands between the job and asking the GC to release its retainage: the work billed in full,
 * every punch item that is the contractor's accepted, and every close-out document that counts sent
 * or accepted. It reads only what was entered; the subcontract may ask for more (a final
 * application, a payment bond release), which the release email leaves to the contractor.
 */
export function closeoutReadiness(
  closeout: CloseoutSummary,
  punch: PunchListSummary,
  retainage: RetainagePosition,
): CloseoutReadiness {
  const blockers: string[] = [];
  if (retainage.heldCents <= 0) {
    blockers.push(
      retainage.lastApplication === null
        ? "No pay application has been sent on this job, so no retainage is held yet."
        : "No retainage is held on the latest pay application sent.",
    );
  } else if (!retainage.workComplete) {
    blockers.push(
      `The latest pay application sent (#${retainage.lastApplication}) does not bill the whole contract yet: bill the remaining work first.`,
    );
  }
  const punchLeft = punch.total - punch.disputed - punch.accepted;
  if (punchLeft > 0) {
    const parts = [
      punch.toFix ? `${punch.toFix} to fix` : null,
      punch.done ? `${punch.done} awaiting the GC's back-check` : null,
    ].filter(Boolean);
    blockers.push(
      `${punchLeft} punch list item${punchLeft === 1 ? " is" : "s are"} not accepted yet (${parts.join(", ")}).`,
    );
  }
  if (closeout.total === 0) {
    blockers.push(
      "No close-out documents are listed: add the ones your subcontract asks for (or the standard list) so you can show the GC everything is in.",
    );
  } else if (closeout.toSend > 0) {
    blockers.push(
      `${closeout.toSend} close-out document${closeout.toSend === 1 ? " is" : "s are"} still to send${closeout.overdue ? ` (${closeout.overdue} overdue)` : ""}.`,
    );
  }
  return { ready: blockers.length === 0, blockers };
}

export interface CloseoutEmailJob {
  name: string;
  number: string | null;
  gcName: string;
  gcPmName?: string | null;
  gcPmEmail?: string | null;
}

export interface CloseoutEmail {
  to: string | null;
  subject: string;
  body: string;
}

/** One line per document in an email: "- O&M manuals and product data (sent 2026-11-20, accepted 2026-11-24 by Dana Ruiz)". */
export function closeoutLine(
  item: Pick<CloseoutItemFacts, "title" | "sentOn" | "acceptedOn" | "acceptedBy">,
): string {
  const when = [
    item.sentOn ? `sent ${item.sentOn}` : null,
    item.acceptedOn
      ? `accepted ${item.acceptedOn}${item.acceptedBy?.trim() ? ` by ${item.acceptedBy.trim()}` : ""}`
      : null,
  ].filter(Boolean);
  return `- ${item.title.trim()}${when.length ? ` (${when.join(", ")})` : ""}`;
}

/**
 * The email to the GC's project manager asking for the retainage to be released, once nothing on
 * the lists stands in the way. Null until then. It states the amount held on the latest pay
 * application, the punch list's state and each document with the dates entered, and asks what else
 * the GC needs; it does not claim the subcontract's conditions are met, only what was delivered.
 */
export function retainageReleaseEmail(
  job: CloseoutEmailJob,
  items: CloseoutItemFacts[],
  punch: PunchListSummary,
  retainage: RetainagePosition,
  from: { name: string; company: string },
  today: string,
): CloseoutEmail | null {
  const summary = summarizeCloseout(items, today);
  if (!closeoutReadiness(summary, punch, retainage).ready) return null;
  const label = job.number ? `${job.name} (job ${job.number})` : job.name;
  const sign = [from.name.trim() || "[your name]", from.company.trim()].filter(Boolean).join("\n");
  const delivered = items.filter((i) => {
    const s = closeoutStatus(i, today);
    return s === "sent" || s === "accepted";
  });
  const waived = items.filter((i) => closeoutStatus(i, today) === "waived");
  const lines: string[] = [
    pmGreeting(job),
    `Our work on ${label} is complete and billed in full. We are asking for the release of our retainage, ${formatCents(retainage.heldCents)} as held on pay application #${retainage.lastApplication}.`,
  ];
  if (punch.total > 0) {
    lines.push(
      `Every punch list item on our scope has been accepted (${punch.accepted} item${punch.accepted === 1 ? "" : "s"}${punch.disputed ? `; ${punch.disputed} noted as not ours` : ""}).`,
    );
  }
  lines.push(
    `We have delivered the following close-out documents:\n${delivered.map(closeoutLine).join("\n")}`,
  );
  if (waived.length > 0) {
    lines.push(
      `Not required on this job:\n${waived.map((i) => `- ${i.title.trim()}: ${i.waivedNote?.trim()}`).join("\n")}`,
    );
  }
  lines.push(
    "Please let us know if you need anything else from us to release it, or when we should expect payment. We will send the retainage billing and any further waiver your process asks for.",
    `Thank you,\n${sign}`,
  );
  return {
    to: job.gcPmEmail?.trim() || null,
    subject: `Retainage release request: ${formatCents(retainage.heldCents)} (${label})`,
    body: lines.join("\n\n"),
  };
}

/** The job page's anchor for its close-out checklist (components/closeout.tsx scrolls to it). */
export const CLOSEOUT_ANCHOR = "closeout";
