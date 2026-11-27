// Lower-tier lien waivers (pure): the waivers a contractor collects from its own suppliers and
// sub-subcontractors for a pay application, so it can hand them to its GC with its own. Many GCs
// ask a sub for "lower-tier waivers" from everyone who furnished labor or materials before they
// release a payment; PayApps tracks which are in and which are still owed, and suggests who to ask
// from the job's purchase orders and subcontracts (job costing) and from the last application's
// list. Runs in the browser (the panel, live) and the Worker (validation, the summary).
//
// What a particular GC, contract or state requires is not decided here: the contractor ticks who
// owes one. Nothing about the waiver's legal effect is claimed; the waiver itself is the supplier's
// document, and PayApps only records that it came in.

import type { JobCostCommitmentDto } from "./api/types";
import type { WaiverKind } from "./enums";
import { formatCents } from "./money";

export const LOWER_TIER_PARTY_KINDS = ["supplier", "subcontractor"] as const;
export type LowerTierPartyKind = (typeof LOWER_TIER_PARTY_KINDS)[number];
export const LOWER_TIER_PARTY_KIND_LABELS: Record<LowerTierPartyKind, string> = {
  supplier: "Supplier",
  subcontractor: "Sub-subcontractor",
};

/** The pay-application page's anchor for the lower-tier panel (the projects page and email link to it). */
export const LOWER_TIER_ANCHOR = "lower-tier-waivers";

/** The most lower-tier waivers one pay application tracks. */
export const MAX_LOWER_TIER_PER_PAY_APP = 300;

export const WAIVER_KIND_SHORT_LABELS: Record<WaiverKind, string> = {
  "conditional-progress": "Conditional progress",
  "unconditional-progress": "Unconditional progress",
  "conditional-final": "Conditional final",
  "unconditional-final": "Unconditional final",
};

/** The facts a row carries, as the rules read them. */
export interface LowerTierFacts {
  party: string;
  partyKind: LowerTierPartyKind | null;
  kind: WaiverKind;
  /** YYYY-MM-DD the waiver covers work through; null: not entered. */
  throughDate: string | null;
  /** The amount the waiver is for, in cents; null: not entered. */
  amountCents: number | null;
  requestedOn: string | null;
  receivedOn: string | null;
}

export type LowerTierStatus = "received" | "requested" | "owed";

/** Case, spacing and trailing punctuation do not make two parties ("ABC Supply, Inc." = "abc supply inc"). */
export function lowerTierPartyKey(name: string): string {
  return name.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

export function lowerTierStatus(
  r: Pick<LowerTierFacts, "requestedOn" | "receivedOn">,
): LowerTierStatus {
  if (r.receivedOn) return "received";
  return r.requestedOn ? "requested" : "owed";
}

/** Days since the request, while the waiver is still out (0 on the day asked); null otherwise. */
export function lowerTierDaysWaiting(
  r: Pick<LowerTierFacts, "requestedOn" | "receivedOn">,
  today: string,
): number | null {
  if (r.receivedOn || !r.requestedOn) return null;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${r.requestedOn}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : null;
}

const realDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** A reason the dates cannot stand, or null. A received or requested date cannot be in the future. */
export function lowerTierDateProblem(
  r: Pick<LowerTierFacts, "throughDate" | "requestedOn" | "receivedOn">,
  today: string,
): string | null {
  for (const [label, v] of [
    ["Through date", r.throughDate],
    ["Requested date", r.requestedOn],
    ["Received date", r.receivedOn],
  ] as const) {
    if (v && !realDate(v)) return `${label} ${v} is not a real date`;
  }
  if (r.requestedOn && r.requestedOn > today) return "The request date is in the future";
  if (r.receivedOn && r.receivedOn > today) return "The received date is in the future";
  if (r.requestedOn && r.receivedOn && r.receivedOn < r.requestedOn) {
    return "The waiver cannot be received before it was requested";
  }
  return null;
}

export interface LowerTierSummary {
  total: number;
  received: number;
  /** Still out: requested or not yet asked for. */
  outstanding: number;
  /** Not yet asked for. */
  notRequested: number;
  /** Parties with at least one waiver still out, in list order, each once. */
  outstandingParties: string[];
  /** Every listed waiver is in (and there is at least one). */
  complete: boolean;
}

export function summarizeLowerTier(rows: readonly LowerTierFacts[]): LowerTierSummary {
  const outstandingParties: string[] = [];
  const seen = new Set<string>();
  let received = 0;
  let notRequested = 0;
  for (const r of rows) {
    const s = lowerTierStatus(r);
    if (s === "received") {
      received++;
      continue;
    }
    if (s === "owed") notRequested++;
    const key = lowerTierPartyKey(r.party);
    if (!seen.has(key)) {
      seen.add(key);
      outstandingParties.push(r.party);
    }
  }
  return {
    total: rows.length,
    received,
    outstanding: rows.length - received,
    notRequested,
    outstandingParties,
    complete: rows.length > 0 && received === rows.length,
  };
}

/** The most rows the company-wide address book reads (newest first); older addresses drop off. */
export const MAX_LOWER_TIER_EMAIL_ROWS = 2000;

/**
 * Each party's email address, keyed by lowerTierPartyKey, from rows given newest first: the first
 * address seen for a party wins, so a corrected address replaces the old one on the next request.
 * Rows without an address are skipped.
 */
export function lowerTierPartyEmails(
  newestFirst: readonly { party: string; partyEmail: string | null }[],
): Record<string, string> {
  // A Map, not an object, while collecting: a party named "constructor" is not an inherited key.
  const out = new Map<string, string>();
  for (const r of newestFirst) {
    const key = lowerTierPartyKey(r.party);
    const email = r.partyEmail?.trim();
    if (key && email && !out.has(key)) out.set(key, email);
  }
  return Object.fromEntries(out);
}

/** Where this row's request goes: its own address, else the one saved for the party, else null. */
export function lowerTierEmailFor(
  r: { party: string; partyEmail?: string | null },
  partyEmails: Readonly<Record<string, string>>,
): string | null {
  const own = r.partyEmail?.trim();
  if (own) return own;
  const key = lowerTierPartyKey(r.party);
  return Object.hasOwn(partyEmails, key) ? (partyEmails[key] ?? null) : null;
}

/** One party the panel offers to add, with what PayApps knows about it. */
export interface LowerTierSuggestion {
  party: string;
  partyKind: LowerTierPartyKind | null;
  /** Invoiced to date against the job's commitments to this party; null when not from job costing. */
  invoicedCents: number | null;
  /** Why it is suggested, in the user's words. */
  source: "commitments" | "last-pay-app" | "both";
  /** Pre-ticked: something was invoiced, or it was on the last application's list. */
  preselected: boolean;
}

/**
 * The parties to ask for this application's lower-tier waivers: the job's purchase-order and
 * subcontract vendors (one per vendor, invoiced to date summed, commitments dated after the report
 * date counted as nothing invoiced) and the parties on the previous application's list, less those
 * already on this application's list. A vendor with nothing invoiced yet is offered unticked: it may
 * have furnished nothing this period.
 */
export function lowerTierSuggestions(input: {
  commitments: readonly Pick<
    JobCostCommitmentDto,
    "vendor" | "kind" | "invoicedCents" | "afterAsOf"
  >[];
  previous: readonly Pick<LowerTierFacts, "party" | "partyKind">[];
  current: readonly Pick<LowerTierFacts, "party">[];
}): LowerTierSuggestion[] {
  const taken = new Set(input.current.map((r) => lowerTierPartyKey(r.party)));
  const out = new Map<string, LowerTierSuggestion>();
  for (const c of input.commitments) {
    const key = lowerTierPartyKey(c.vendor);
    if (!key || taken.has(key)) continue;
    const invoiced = c.afterAsOf ? 0 : Math.max(0, c.invoicedCents);
    const kind: LowerTierPartyKind = c.kind === "subcontract" ? "subcontractor" : "supplier";
    const s = out.get(key);
    if (s) {
      s.invoicedCents = (s.invoicedCents ?? 0) + invoiced;
      // A vendor with both a subcontract and a PO is the sub-subcontractor it was hired as.
      if (kind === "subcontractor") s.partyKind = kind;
      s.preselected = (s.invoicedCents ?? 0) > 0;
    } else {
      out.set(key, {
        party: c.vendor.trim(),
        partyKind: kind,
        invoicedCents: invoiced,
        source: "commitments",
        preselected: invoiced > 0,
      });
    }
  }
  for (const p of input.previous) {
    const key = lowerTierPartyKey(p.party);
    if (!key || taken.has(key)) continue;
    const s = out.get(key);
    if (s) {
      s.source = "both";
      s.preselected = true;
      s.partyKind ??= p.partyKind;
    } else {
      out.set(key, {
        party: p.party.trim(),
        partyKind: p.partyKind,
        invoicedCents: null,
        source: "last-pay-app",
        preselected: true,
      });
    }
  }
  return [...out.values()];
}

/**
 * The waiver to ask a lower tier for with this application, by default: the same scope as the
 * contractor's own (a final application asks for final waivers), conditional, through the period
 * end. Unconditional waivers for money already paid out to the party are the contractor's call.
 */
export function defaultLowerTierKind(isFinal: boolean): WaiverKind {
  return isFinal ? "conditional-final" : "conditional-progress";
}

/** A plain request the contractor can paste into an email or text to the party. Our words only. */
export function lowerTierRequestText(input: {
  party: string;
  kind: WaiverKind;
  throughDate: string | null;
  amountCents: number | null;
  jobName: string;
  jobNumber?: string | null;
  gcName: string;
  contractorName: string;
}): string {
  const kind = WAIVER_KIND_SHORT_LABELS[input.kind].toLowerCase();
  const job = input.jobNumber ? `${input.jobName} (job ${input.jobNumber})` : input.jobName;
  const parts = [
    `Hello ${input.party},`,
    "",
    `For our pay application to ${input.gcName} on ${job}, please send us ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} lien waiver` +
      (input.throughDate ? ` through ${input.throughDate}` : "") +
      (input.amountCents !== null ? ` for ${formatCents(input.amountCents)}` : "") +
      ".",
    "Your own state's form, if it has one, is fine. A signed PDF or a photo of the signed copy works.",
    "",
    "Thank you,",
    input.contractorName,
  ];
  return parts.join("\n");
}

/** One lower-tier row still out, with its job and pay application, as the company-wide list reads it. */
export interface CompanyLowerTierInput
  extends Pick<LowerTierFacts, "party" | "requestedOn" | "receivedOn"> {
  id: string;
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  payAppId: string;
  payAppNumber: number;
}

/** A pay application with lower-tier waivers still out (projects page, weekly email). */
export interface LowerTierPayAppToChase {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  payAppId: string;
  payAppNumber: number;
  /** Rows not received (requested or not asked for yet). */
  outstanding: number;
  /** Of those, not asked for yet. */
  notRequested: number;
  /** Parties with a waiver still out, in list order, each once. */
  parties: string[];
  /** The longest wait among the requested ones, in days; null when none has been asked for. */
  daysWaiting: number | null;
}

/** Parties named in the one-line text; any more are counted. */
export const MAX_LOWER_TIER_PARTIES_NAMED = 3;

/**
 * Every pay application across the company's jobs with a lower-tier waiver still out, the longest
 * wait first (a list nobody has asked for yet after those), then job name and pay-app number. A row
 * counts until a received date is entered or the signed waiver is filed on it; nothing here decides
 * whether the GC requires it, only that the contractor listed it and it has not come in.
 */
export function lowerTierToChase(
  list: readonly CompanyLowerTierInput[],
  today: string,
): LowerTierPayAppToChase[] {
  const byApp = new Map<string, { out: LowerTierPayAppToChase; seen: Set<string> }>();
  for (const r of list) {
    if (lowerTierStatus(r) === "received") continue;
    let g = byApp.get(r.payAppId);
    if (!g) {
      g = {
        out: {
          projectId: r.projectId,
          projectName: r.projectName,
          projectNumber: r.projectNumber,
          gcName: r.gcName,
          payAppId: r.payAppId,
          payAppNumber: r.payAppNumber,
          outstanding: 0,
          notRequested: 0,
          parties: [],
          daysWaiting: null,
        },
        seen: new Set(),
      };
      byApp.set(r.payAppId, g);
    }
    g.out.outstanding++;
    if (!r.requestedOn) g.out.notRequested++;
    const days = lowerTierDaysWaiting(r, today);
    if (days !== null) g.out.daysWaiting = Math.max(g.out.daysWaiting ?? 0, days);
    const key = lowerTierPartyKey(r.party);
    if (!g.seen.has(key)) {
      g.seen.add(key);
      g.out.parties.push(r.party.trim());
    }
  }
  return [...byApp.values()]
    .map((g) => g.out)
    .sort(
      (a, b) =>
        (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1) ||
        a.projectName.localeCompare(b.projectName) ||
        a.payAppNumber - b.payAppNumber,
    );
}

/**
 * "Clinic TI (#2207), pay app 4 to Harbor Builders: 3 lower-tier waivers still out (ABC Supply,
 * Ferguson and Valley Rebar), the oldest asked for 12 days ago, 1 not asked for yet."
 */
export function lowerTierToChaseText(p: LowerTierPayAppToChase): string {
  const job = `${p.projectName}${p.projectNumber ? ` (#${p.projectNumber})` : ""}`;
  const named = p.parties.slice(0, MAX_LOWER_TIER_PARTIES_NAMED);
  const rest = p.parties.length - named.length;
  const who =
    rest > 0
      ? `${named.join(", ")} and ${rest} more`
      : named.length <= 1
        ? (named[0] ?? "")
        : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  const count = `${p.outstanding} lower-tier waiver${p.outstanding === 1 ? "" : "s"} still out`;
  const asked = p.outstanding - p.notRequested;
  const wait =
    p.daysWaiting === null
      ? ""
      : asked === 1
        ? p.daysWaiting === 0
          ? ", asked for today"
          : `, asked for ${p.daysWaiting} day${p.daysWaiting === 1 ? "" : "s"} ago`
        : p.daysWaiting === 0
          ? ", the oldest asked for today"
          : `, the oldest asked for ${p.daysWaiting} day${p.daysWaiting === 1 ? "" : "s"} ago`;
  const notAsked =
    p.notRequested === 0
      ? ""
      : p.notRequested === p.outstanding
        ? ", none asked for yet"
        : `, ${p.notRequested} not asked for yet`;
  return `${job}, pay app ${p.payAppNumber} to ${p.gcName}: ${count} (${who})${wait}${notAsked}.`;
}
