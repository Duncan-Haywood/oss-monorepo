// Win/loss analytics (pure): which customers, materials and machines the shop wins on, at what
// markup it wins and loses, and "what price did we win at" for repeat parts. Input is the shop's
// own decided quotes (won, lost, expired) with their stored lines; nothing is estimated or modelled.
//
// Counting rules, so every number on the page can be traced back to quotes in the log:
// - Win rate = won / (won + lost), the same as the quote log. Expired quotes got no decision, so
//   they are shown but not counted in the rate. Superseded quotes never reach here (their revision
//   carries the outcome).
// - A quote counts once per customer, once per material and once per machine it used, however many
//   lines used it. "Customer-supplied" is its own material row.
// - Markup is measured on each priced line's first (smallest-quantity) break, the same break the
//   quote log's headline total uses: (markup + minimum-charge top-up) / cost. A quote's markup is
//   the cost-weighted figure across its priced lines.
// - Fewer than LOW_SAMPLE decided quotes in a row is flagged: a 100% win rate on two quotes is noise.
// - The estimator is the member who created the quote (a revision: who pressed Revise), the same
//   person the day-before expiry email goes to. A quote whose creator's account was deleted is
//   counted under "Former member".
// - Months are calendar months of the decision date in the shop's time zone (Rate card, "Time
//   zone"; UTC until one is set), oldest first, with empty months between the first and the last
//   shown as zero rows so a gap reads as a gap, not as a missing row. The CSV's date column reads
//   the same calendar, so a quote's row and its month row agree.
// - Routings and part families are the shop's saved routings *as they are today*: a line counts for
//   a routing when the routing's operations appear in it in order (by machine and label, the same
//   test the routing suggestions use, lineUsesRouting), so a routing applied and then tuned still
//   counts. A line with operations that match no saved routing counts under "No saved routing". A
//   part family row counts the quotes whose lines used any routing tagged with that family (case
//   and spacing ignored); routings with no family add no family row.
import type { CostBreak, CostInputs, RateSnapshot } from "./costing";
import { csvField } from "./rate-card-import";
import { partNumberKey } from "./repeat-parts";
import { lineUsesRouting } from "./routing-suggest";
import type { RoutingOperation } from "./routings";
import { effectiveTimeZone, UTC, zonedDate } from "./time-zone";

export const LOW_SAMPLE = 5;
/** Parts listed in "what price did we win at", most recently decided first. */
export const MAX_PRICE_PARTS = 50;
/** Decided quotes listed per part. */
export const MAX_PRICE_ENTRIES = 10;
/** Upper edges of the markup bands, in basis points; the last band is open-ended. */
export const MARKUP_BAND_EDGES_BPS = [1_500, 2_500, 3_500, 5_000] as const;
/** Months listed at most (the newest); "all time" over ten years keeps its last ten. */
export const MAX_MONTHS = 120;

export type DecidedOutcome = "won" | "lost" | "expired";

export interface DecidedLine {
  partNumber: string;
  revision: string | null;
  inputs: CostInputs;
  breaks: CostBreak[] | null;
  snapshot: RateSnapshot | null;
}

export interface DecidedQuote {
  id: string;
  label: string;
  customerCompany: string;
  outcome: DecidedOutcome;
  /** ISO timestamp. */
  decidedAt: string | null;
  headlineTotalCents: number | null;
  wonAmountCents: number | null;
  lostReason: string | null;
  /** The member who created the quote; null once their account is gone. */
  estimatorId: string | null;
  estimatorName: string | null;
  lines: DecidedLine[];
}

/** One of the shop's saved routings, as the report reads it (today's operations and family). */
export interface WinLossRouting {
  id: string;
  name: string;
  partFamily: string | null;
  operations: readonly Pick<RoutingOperation, "machineId" | "label">[];
}

/** Row key of the lines whose operations match none of the saved routings. */
export const NO_ROUTING_KEY = "no-routing";

export interface WinLossRow {
  key: string;
  label: string;
  won: number;
  lost: number;
  expired: number;
  /** won + lost. */
  decided: number;
  winRate: number | null;
  /** Awarded value of the won quotes. */
  wonCents: number;
  /** Headline (smallest-quantity) value of the lost quotes. */
  lostCents: number;
  lowSample: boolean;
}

export interface MarkupBand extends WinLossRow {
  /** Inclusive lower edge, bps. */
  fromBps: number;
  /** Exclusive upper edge, bps; null for the open top band. */
  toBps: number | null;
}

export interface PriceEntry {
  quoteId: string;
  label: string;
  customerCompany: string;
  outcome: DecidedOutcome;
  decidedAt: string | null;
  revision: string | null;
  /** Each quantity break as quoted: quantity and unit price. */
  breaks: { quantity: number; unitPriceCents: number }[];
}

export interface PartPrices {
  partNumber: string;
  won: number;
  lost: number;
  entries: PriceEntry[];
}

export interface WinLossReport {
  quoteCount: number;
  totals: WinLossRow;
  byCustomer: WinLossRow[];
  byMaterial: WinLossRow[];
  byMachine: WinLossRow[];
  byEstimator: WinLossRow[];
  /** By saved routing (today's), plus "No saved routing"; empty when the shop has no routings. */
  byRouting: WinLossRow[];
  /** By the part family of the routings used; empty when no routing has a family. */
  byPartFamily: WinLossRow[];
  /** Calendar months of the decision in `timeZone`, oldest first, gaps filled with zero rows. */
  byMonth: WinLossRow[];
  /** The IANA zone the months were read in: the shop's, or "UTC" when it has none. */
  timeZone: string;
  byMarkup: MarkupBand[];
  /** Cost-weighted markup of won and of lost quotes, bps; null with none priced. */
  markupWonBps: number | null;
  markupLostBps: number | null;
  lostReasons: { reason: string; count: number }[];
  prices: PartPrices[];
}

interface Acc {
  key: string;
  label: string;
  won: number;
  lost: number;
  expired: number;
  wonCents: number;
  lostCents: number;
}

const newAcc = (key: string, label: string): Acc => ({
  key,
  label,
  won: 0,
  lost: 0,
  expired: 0,
  wonCents: 0,
  lostCents: 0,
});

function add(acc: Acc, q: DecidedQuote) {
  if (q.outcome === "won") {
    acc.won += 1;
    acc.wonCents += q.wonAmountCents ?? q.headlineTotalCents ?? 0;
  } else if (q.outcome === "lost") {
    acc.lost += 1;
    acc.lostCents += q.headlineTotalCents ?? 0;
  } else {
    acc.expired += 1;
  }
}

function finish(a: Acc): WinLossRow {
  const decided = a.won + a.lost;
  return {
    ...a,
    decided,
    winRate: decided > 0 ? a.won / decided : null,
    lowSample: decided < LOW_SAMPLE,
  };
}

/** Most decided first, then the higher win rate, then by label. */
function rank(rows: WinLossRow[]): WinLossRow[] {
  return rows.sort(
    (a, b) =>
      b.decided - a.decided ||
      (b.winRate ?? -1) - (a.winRate ?? -1) ||
      b.expired - a.expired ||
      a.label.localeCompare(b.label),
  );
}

class Grouper {
  private map = new Map<string, Acc>();
  /** The first label seen wins; callers feed quotes newest first, so that is today's name. */
  add(key: string, label: string, q: DecidedQuote) {
    let acc = this.map.get(key);
    if (!acc) {
      acc = newAcc(key, label);
      this.map.set(key, acc);
    }
    add(acc, q);
  }
  rows(): WinLossRow[] {
    return rank([...this.map.values()].map(finish));
  }
}

/** The estimator's name as shown: "Former member" once the account is gone. */
export function estimatorLabel(q: Pick<DecidedQuote, "estimatorId" | "estimatorName">): string {
  if (!q.estimatorId) return "Former member";
  return q.estimatorName?.trim() || "Unnamed member";
}

/** Company names compared by case and spacing, like part numbers. */
export function customerKey(company: string): string {
  return company.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Part families compared by case and spacing. */
export function familyKey(family: string): string {
  return family.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The saved routings a quote's lines used, and whether any line with operations used none of them.
 * Each routing (and the "none" case) is counted once per quote however many lines matched.
 */
export function quoteRoutings(
  q: Pick<DecidedQuote, "lines">,
  routings: readonly WinLossRouting[],
): { used: WinLossRouting[]; unmatched: boolean } {
  const used = new Map<string, WinLossRouting>();
  let unmatched = false;
  for (const l of q.lines) {
    if (l.inputs.operations.length === 0) continue;
    let any = false;
    for (const r of routings) {
      if (lineUsesRouting(l.inputs.operations, r.operations)) {
        any = true;
        used.set(r.id, r);
      }
    }
    if (!any) unmatched = true;
  }
  return { used: [...used.values()], unmatched };
}

/** Cost and markup (incl. the line-minimum top-up) of a quote's priced lines at their first break. */
export function quoteMarkup(
  q: Pick<DecidedQuote, "lines">,
): { costCents: number; markupCents: number } | null {
  let costCents = 0;
  let markupCents = 0;
  let priced = 0;
  for (const l of q.lines) {
    const b = l.breaks?.[0];
    if (!b) continue;
    priced += 1;
    costCents += b.costCents;
    markupCents += b.markupCents + b.minimumAdjustmentCents;
  }
  if (priced === 0 || costCents <= 0) return null;
  return { costCents, markupCents };
}

export function markupBps(m: { costCents: number; markupCents: number }): number {
  return Math.round((m.markupCents / m.costCents) * 10_000);
}

function bandIndex(bps: number): number {
  const i = MARKUP_BAND_EDGES_BPS.findIndex((edge) => bps < edge);
  return i === -1 ? MARKUP_BAND_EDGES_BPS.length : i;
}

export function bandLabel(fromBps: number, toBps: number | null): string {
  const pct = (bps: number) => `${bps / 100}%`;
  if (fromBps === 0 && toBps != null) return `Under ${pct(toBps)}`;
  if (toBps == null) return `${pct(fromBps)} and over`;
  return `${pct(fromBps)} to ${pct(toBps)}`;
}

const time = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "2026-10-31" from an ISO timestamp, on the calendar of `timeZone`; null when missing or bad. */
export function decidedDate(iso: string | null, timeZone: string = UTC): string | null {
  const t = time(iso);
  if (!t) return null;
  return zonedDate(t, timeZone);
}

/**
 * "2026-11" from an ISO timestamp, on the calendar of `timeZone` (UTC by default); null when the
 * date is missing or bad.
 */
export function monthKey(iso: string | null, timeZone: string = UTC): string | null {
  return decidedDate(iso, timeZone)?.slice(0, 7) ?? null;
}

/** "Nov 2026" from "2026-11". */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

/** Every month key from `first` to `last` inclusive ("2026-11" style), in order. */
export function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number) as [number, number];
  const [ly, lm] = last.split("-").map(Number) as [number, number];
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function byMonthRows(quotes: DecidedQuote[], timeZone: string): WinLossRow[] {
  const accs = new Map<string, Acc>();
  for (const q of quotes) {
    const k = monthKey(q.decidedAt, timeZone);
    if (!k) continue;
    let acc = accs.get(k);
    if (!acc) {
      acc = newAcc(k, monthLabel(k));
      accs.set(k, acc);
    }
    add(acc, q);
  }
  if (accs.size === 0) return [];
  const keys = [...accs.keys()].sort();
  const all = monthRange(keys[0] as string, keys[keys.length - 1] as string).slice(-MAX_MONTHS);
  return all.map((k) => finish(accs.get(k) ?? newAcc(k, monthLabel(k))));
}

export function winLossReport(
  input: DecidedQuote[],
  routings: readonly WinLossRouting[] = [],
  timeZone: string | null = null,
): WinLossReport {
  const zone = effectiveTimeZone(timeZone);
  const quotes = [...input].sort((a, b) => time(b.decidedAt) - time(a.decidedAt));
  const totals = newAcc("all", "All decided quotes");
  const customers = new Grouper();
  const materialsG = new Grouper();
  const machinesG = new Grouper();
  const estimators = new Grouper();
  const routingsG = new Grouper();
  const familiesG = new Grouper();
  const bands: Acc[] = [0, ...MARKUP_BAND_EDGES_BPS].map((from, i) => {
    const to = MARKUP_BAND_EDGES_BPS[i] ?? null;
    return newAcc(`band-${i}`, bandLabel(from, to));
  });
  const markupSums = { won: { cost: 0, markup: 0 }, lost: { cost: 0, markup: 0 } };
  const reasons = new Map<string, { reason: string; count: number }>();
  const parts = new Map<string, PartPrices>();

  for (const q of quotes) {
    add(totals, q);
    customers.add(customerKey(q.customerCompany), q.customerCompany.trim(), q);
    estimators.add(q.estimatorId ?? "former", estimatorLabel(q), q);

    const mats = new Map<string, string>();
    const machs = new Map<string, string>();
    for (const l of q.lines) {
      if (l.inputs.customerSuppliedMaterial && !l.inputs.material) {
        mats.set("customer-supplied", "Customer-supplied");
      } else if (l.inputs.material) {
        const id = l.inputs.material.materialId;
        const name = l.snapshot?.materials.find((m) => m.id === id)?.name;
        if (!mats.has(id)) mats.set(id, name ?? "Material no longer on the card");
      }
      for (const op of l.inputs.operations) {
        const name = l.snapshot?.machines.find((m) => m.id === op.machineId)?.name;
        if (!machs.has(op.machineId)) {
          machs.set(op.machineId, name ?? "Machine no longer on the card");
        }
      }
    }
    for (const [k, label] of mats) materialsG.add(k, label, q);
    for (const [k, label] of machs) machinesG.add(k, label, q);

    if (routings.length > 0) {
      const { used, unmatched } = quoteRoutings(q, routings);
      const families = new Map<string, string>();
      for (const r of used) {
        routingsG.add(r.id, r.name, q);
        const f = r.partFamily?.trim();
        if (f && !families.has(familyKey(f))) families.set(familyKey(f), f);
      }
      if (unmatched) routingsG.add(NO_ROUTING_KEY, "No saved routing", q);
      for (const [k, label] of families) familiesG.add(k, label, q);
    }

    const m = quoteMarkup(q);
    if (m) {
      const band = bands[bandIndex(markupBps(m))];
      if (band) add(band, q);
      if (q.outcome !== "expired") {
        markupSums[q.outcome].cost += m.costCents;
        markupSums[q.outcome].markup += m.markupCents;
      }
    }

    if (q.outcome === "lost") {
      const reason = q.lostReason?.trim() || "No reason recorded";
      const k = reason.toLowerCase();
      const r = reasons.get(k) ?? { reason, count: 0 };
      r.count += 1;
      reasons.set(k, r);
    }

    const seenParts = new Set<string>();
    for (const l of q.lines) {
      const k = partNumberKey(l.partNumber);
      if (!k || k === "NEW PART" || seenParts.has(k)) continue;
      seenParts.add(k);
      let p = parts.get(k);
      if (!p) {
        p = { partNumber: l.partNumber.trim(), won: 0, lost: 0, entries: [] };
        parts.set(k, p);
      }
      if (q.outcome === "won") p.won += 1;
      if (q.outcome === "lost") p.lost += 1;
      if (p.entries.length < MAX_PRICE_ENTRIES) {
        p.entries.push({
          quoteId: q.id,
          label: q.label,
          customerCompany: q.customerCompany,
          outcome: q.outcome,
          decidedAt: q.decidedAt,
          revision: l.revision,
          breaks: (l.breaks ?? []).map((b) => ({
            quantity: b.quantity,
            unitPriceCents: b.unitPriceCents,
          })),
        });
      }
    }
  }

  const avg = (s: { cost: number; markup: number }) =>
    s.cost > 0 ? markupBps({ costCents: s.cost, markupCents: s.markup }) : null;

  return {
    quoteCount: quotes.length,
    totals: finish(totals),
    byCustomer: customers.rows(),
    byMaterial: materialsG.rows(),
    byMachine: machinesG.rows(),
    byEstimator: estimators.rows(),
    byRouting: routingsG.rows(),
    byPartFamily: familiesG.rows(),
    byMonth: byMonthRows(quotes, zone),
    timeZone: zone,
    byMarkup: bands.map((b, i) => ({
      ...finish(b),
      fromBps: i === 0 ? 0 : (MARKUP_BAND_EDGES_BPS[i - 1] ?? 0),
      toBps: MARKUP_BAND_EDGES_BPS[i] ?? null,
    })),
    markupWonBps: avg(markupSums.won),
    markupLostBps: avg(markupSums.lost),
    lostReasons: [...reasons.values()].sort(
      (a, b) => b.count - a.count || a.reason.localeCompare(b.reason),
    ),
    // Parts quoted more than once, or won or lost at least once, are the useful ones; a part that
    // only ever expired once says nothing about price.
    prices: [...parts.values()]
      .filter((p) => p.won + p.lost > 0 && p.entries.length > 0)
      .slice(0, MAX_PRICE_PARTS),
  };
}

// ---- CSV export: one row per decided quote, the rows every figure on the page is counted from ----

export const WIN_LOSS_CSV_HEADER = [
  "Quote",
  "Customer",
  "Estimator",
  "Outcome",
  "Decided",
  "Quoted total (smallest quantity)",
  "Won amount",
  "Markup on cost %",
  "Lost reason",
  "Part numbers",
  "Routings",
] as const;

const decimal = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));

/**
 * The decided quotes as CSV, newest decision first, for a spreadsheet or pivot table. Money is a
 * plain decimal in the shop's currency (no symbol, no thousands separator) so a sheet reads it as a
 * number; markup is the same cost-weighted figure as the page, blank when no line was priced. Text a
 * spreadsheet would run as a formula gets a leading apostrophe (csvField). "Routings" names the
 * saved routings the quote's lines used, as on the page (blank when the shop has none).
 */
export function winLossCsv(
  input: DecidedQuote[],
  routings: readonly WinLossRouting[] = [],
  timeZone: string | null = null,
): string {
  const zone = effectiveTimeZone(timeZone);
  const quotes = [...input].sort((a, b) => time(b.decidedAt) - time(a.decidedAt));
  const header = WIN_LOSS_CSV_HEADER.map((h) => (h === "Decided" ? `Decided (${zone})` : h));
  const lines = [header.map(csvField).join(",")];
  for (const q of quotes) {
    const m = quoteMarkup(q);
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const l of q.lines) {
      const k = partNumberKey(l.partNumber);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      parts.push(l.partNumber.trim());
    }
    // Text cells go through csvField; the numbers are ours and stay numbers (a negative markup
    // must not gain an apostrophe).
    lines.push(
      [
        csvField(q.label),
        csvField(q.customerCompany.trim()),
        csvField(estimatorLabel(q)),
        q.outcome,
        decidedDate(q.decidedAt, zone) ?? "",
        decimal(q.headlineTotalCents),
        q.outcome === "won" ? decimal(q.wonAmountCents ?? q.headlineTotalCents) : "",
        m ? (markupBps(m) / 100).toFixed(1) : "",
        csvField(q.outcome === "lost" ? (q.lostReason?.trim() ?? "") : ""),
        csvField(parts.join("; ")),
        csvField(routingsCell(q, routings)),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** The CSV's "Routings" cell: routing names in the shop's order, then "No saved routing". */
function routingsCell(q: DecidedQuote, routings: readonly WinLossRouting[]): string {
  if (routings.length === 0) return "";
  const { used, unmatched } = quoteRoutings(q, routings);
  const names = used.map((r) => r.name.trim());
  if (unmatched) names.push("No saved routing");
  return names.join("; ");
}
