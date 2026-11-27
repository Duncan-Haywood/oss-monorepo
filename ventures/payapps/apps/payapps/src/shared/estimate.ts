// Estimates (bids): what a subcontractor works out before the job exists. Cost lines (a quantity, a
// unit and a unit cost, in one of the job-cost categories) roll up into bid items, the items the GC
// sees on the proposal and that become the job's schedule of values when the bid is won. Markup is
// set per category (labor is often marked up more than material), and sales tax, when the
// contractor pays it on materials, is added to material cost before its markup.
//
// The math is pure and exact: quantities in thousandths, unit costs in millionths of a dollar (the
// same units as unit-price lines, src/shared/unit-price.ts), cents everywhere after the extension.
// Rounding is done once per bid item and category, so the proposal total is exactly the sum of its
// items, and each item's price is exactly its cost plus tax plus markup as printed.
//
// Alternates (part 2): a bid item can be an add alternate (priced on the proposal but left out of the
// base bid, added if the GC accepts it) or a deduct alternate (in the base bid, taken out if the GC
// accepts the deduction: "omit the generator, deduct $X"). A substitution is a deduct of the base item
// plus an add of its replacement. Alternates share one numbering (Alternate No. 1, 2, ..) in order of
// first appearance; the totals are the base bid's. When the bid is won, the accepted alternates decide
// which items become the job's schedule of values, and the contract sum is exactly what they add up to.
import { COST_CATEGORIES, type CostCategory, mulDivRound } from "./job-cost";
import { extendCents } from "./unit-price";

export const ESTIMATE_STATUSES = ["draft", "sent", "won", "lost"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const ALTERNATE_KINDS = ["add", "deduct"] as const;
export type AlternateKind = (typeof ALTERNATE_KINDS)[number];
export const ALTERNATE_KIND_LABELS: Record<AlternateKind, string> = {
  add: "Add alternate",
  deduct: "Deduct alternate",
};
/** Bid item key (bidItemKey) to its alternate kind; an item not in it is part of the base bid. */
export type Alternates = Record<string, AlternateKind>;

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  won: "Won",
  lost: "Lost",
};

/** Lines in one estimate; a large commercial bid breakdown runs to a few hundred. */
export const MAX_ESTIMATE_LINES = 1_000;
/** Bid items in one estimate (they become schedule-of-values lines, which a bulk add caps at 500). */
export const MAX_BID_ITEMS = 500;
export const MAX_BID_ITEM_LENGTH = 300;
/** Largest markup accepted: 500% (a small service line can be marked up more than 100%). */
export const MAX_MARKUP_BPS = 50_000;

const BPS = 10_000;

export interface EstimateLineInput {
  /** The bid item (proposal line, later the SOV line) this cost rolls into, e.g. "Ductwork". */
  bidItem: string;
  category: CostCategory;
  description: string;
  /** Thousandths (12.5 is 12500). */
  quantityMilli: number;
  unit: string | null;
  /** Millionths of a dollar a unit ($0.875 is 875000). */
  unitCostMicros: number;
}

export type MarkupBps = Record<CostCategory, number>;

export interface EstimateRates {
  markupBps: MarkupBps;
  /** Sales tax the contractor pays on materials, added to material cost (0 when none). */
  materialTaxBps: number;
}

export interface BidItemTotal {
  /**
   * Base-bid items (deduct alternates included) are 1..n in order of first appearance; an add
   * alternate is "Alt 2" for Alternate No. 2. Won, the job's SOV lines are renumbered 1..m.
   */
  itemNumber: string;
  /** null: part of the base bid only. */
  alternate: AlternateKind | null;
  /** Alternate No. (1..k across adds and deducts), or null. */
  alternateNumber: number | null;
  description: string;
  lineCount: number;
  /** Direct cost by category, before tax and markup. */
  costByCategory: Record<CostCategory, number>;
  costCents: number;
  taxCents: number;
  markupCents: number;
  /** cost + tax + markup: the price on the proposal. */
  priceCents: number;
}

/** The base bid (add alternates left out, deduct alternates in). */
export interface EstimateTotals {
  costByCategory: Record<CostCategory, number>;
  costCents: number;
  taxCents: number;
  markupCents: number;
  priceCents: number;
  /** (price − cost − tax) / price, in basis points; null when the price is 0. */
  marginBps: number | null;
  /** Sum of the add alternates' prices (what accepting all of them adds), and of the deducts'. */
  addAlternatesCents: number;
  deductAlternatesCents: number;
}

export interface EstimateResult {
  /** Each line's extended cost, in input order. */
  lineCostCents: number[];
  bidItems: BidItemTotal[];
  totals: EstimateTotals;
}

const zeroByCategory = (): Record<CostCategory, number> =>
  Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<CostCategory, number>;

/** The key two lines share when they belong to the same bid item: case and spacing ignored. */
export const bidItemKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function computeEstimate(
  lines: EstimateLineInput[],
  rates: EstimateRates,
  alternates: Alternates = {},
): EstimateResult {
  const lineCostCents = lines.map((l) => extendCents(l.quantityMilli, l.unitCostMicros));
  const items = new Map<
    string,
    { key: string; description: string; cost: Record<CostCategory, number>; n: number }
  >();
  lines.forEach((l, i) => {
    const key = bidItemKey(l.bidItem);
    let item = items.get(key);
    if (!item) {
      item = {
        key,
        description: l.bidItem.trim().replace(/\s+/g, " "),
        cost: zeroByCategory(),
        n: 0,
      };
      items.set(key, item);
    }
    item.cost[l.category] += lineCostCents[i] ?? 0;
    item.n += 1;
  });

  const totals: EstimateTotals = {
    costByCategory: zeroByCategory(),
    costCents: 0,
    taxCents: 0,
    markupCents: 0,
    priceCents: 0,
    marginBps: null,
    addAlternatesCents: 0,
    deductAlternatesCents: 0,
  };
  const bidItems: BidItemTotal[] = [];
  let n = 0;
  let alt = 0;
  for (const item of items.values()) {
    const kind = Object.hasOwn(alternates, item.key) ? (alternates[item.key] ?? null) : null;
    if (kind) alt += 1;
    if (kind !== "add") n += 1;
    let cost = 0;
    let markup = 0;
    const tax = mulDivRound(item.cost.material, rates.materialTaxBps, BPS);
    for (const c of COST_CATEGORIES) {
      const base = item.cost[c] + (c === "material" ? tax : 0);
      cost += item.cost[c];
      markup += mulDivRound(base, rates.markupBps[c] ?? 0, BPS);
    }
    const price = cost + tax + markup;
    bidItems.push({
      itemNumber: kind === "add" ? `Alt ${alt}` : String(n),
      alternate: kind,
      alternateNumber: kind ? alt : null,
      description: item.description,
      lineCount: item.n,
      costByCategory: item.cost,
      costCents: cost,
      taxCents: tax,
      markupCents: markup,
      priceCents: price,
    });
    if (kind === "add") {
      totals.addAlternatesCents += price;
      continue;
    }
    if (kind === "deduct") totals.deductAlternatesCents += price;
    for (const c of COST_CATEGORIES) totals.costByCategory[c] += item.cost[c];
    totals.costCents += cost;
    totals.taxCents += tax;
    totals.markupCents += markup;
    totals.priceCents += price;
  }
  totals.marginBps =
    totals.priceCents === 0 ? null : mulDivRound(totals.markupCents, BPS, totals.priceCents);
  return { lineCostCents, bidItems, totals };
}

/** The schedule of values and cost budgets a won estimate starts the job with. */
export interface JobFromEstimate {
  contractSumCents: number;
  lines: {
    itemNumber: string;
    description: string;
    originalCents: number;
    budgetCents: number;
    /** The budget by cost type: the item's cost in each category, the material tax on material. */
    budgetByCategory: Partial<Record<CostCategory, number>>;
  }[];
}

/** A bid item's cost by category with the material sales tax on material; types with none left out. */
export function budgetByCategory(b: BidItemTotal): Partial<Record<CostCategory, number>> {
  const out: Partial<Record<CostCategory, number>> = {};
  for (const c of COST_CATEGORIES) {
    const v = b.costByCategory[c] + (c === "material" ? b.taxCents : 0);
    if (v !== 0) out[c] = v;
  }
  return out;
}

/** Whether a bid item is in the job when the GC accepted the alternates named (bid item keys). */
export function inJob(b: BidItemTotal, accepted: ReadonlySet<string>): boolean {
  const on = accepted.has(bidItemKey(b.description));
  if (b.alternate === "add") return on;
  if (b.alternate === "deduct") return !on;
  return true;
}

/**
 * The job a won estimate becomes: one schedule-of-values line per bid item in it (the base bid, less
 * the deduct alternates accepted, plus the add alternates accepted), numbered 1..m, at its price; the
 * item's cost (with tax: what the contractor expects to spend) as that line's job-cost budget, split
 * by cost type the way it was bid. The contract sum is exactly the sum of those lines.
 */
export function jobFromEstimate(result: EstimateResult, accepted: string[] = []): JobFromEstimate {
  const on = new Set(accepted.map(bidItemKey));
  const lines = result.bidItems
    .filter((b) => inJob(b, on))
    .map((b, i) => ({
      itemNumber: String(i + 1),
      description: b.description.slice(0, MAX_BID_ITEM_LENGTH),
      originalCents: b.priceCents,
      budgetCents: b.costCents + b.taxCents,
      budgetByCategory: budgetByCategory(b),
    }));
  return { contractSumCents: lines.reduce((s, l) => s + l.originalCents, 0), lines };
}

/**
 * Why an estimate cannot become a job yet, or [] when it can. `accepted` names the alternates the GC
 * accepted (bid item descriptions or keys); left out, none are, which is the base bid.
 */
export function winProblems(result: EstimateResult, accepted: string[] = []): string[] {
  const out: string[] = [];
  if (result.bidItems.length === 0) out.push("Add at least one cost line before marking it won.");
  const alternates = new Set(
    result.bidItems.filter((b) => b.alternate).map((b) => bidItemKey(b.description)),
  );
  for (const a of accepted) {
    if (!alternates.has(bidItemKey(a))) out.push(`"${a}" is not an alternate on this estimate.`);
  }
  if (result.bidItems.length > 0 && result.bidItems.every((b) => b.alternate === "add"))
    out.push("The base bid is empty: make at least one bid item part of it.");
  const job = jobFromEstimate(result, accepted);
  if (job.lines.length > MAX_BID_ITEMS)
    out.push(`A job takes at most ${MAX_BID_ITEMS} schedule-of-values lines; combine bid items.`);
  if (result.bidItems.length > 0 && job.contractSumCents <= 0)
    out.push(
      accepted.length
        ? "With those alternates the job totals $0."
        : "The estimate totals $0; enter unit costs first.",
    );
  for (const b of result.bidItems) {
    if (b.priceCents < 0) out.push(`Bid item "${b.description}" is below $0.`);
  }
  return out;
}

/** The alternates that name a bid item in these lines (by key), so a renamed item's is dropped. */
export function alternatesFor(lines: EstimateLineInput[], alternates: Alternates): Alternates {
  const keys = new Set(lines.map((l) => bidItemKey(l.bidItem)));
  const out: Alternates = {};
  for (const [k, kind] of Object.entries(alternates)) if (keys.has(k)) out[k] = kind;
  return out;
}

/** Problems with a set of lines before they are saved, or [] when there are none. */
export function lineProblems(lines: EstimateLineInput[]): string[] {
  const out: string[] = [];
  if (lines.length > MAX_ESTIMATE_LINES)
    out.push(`An estimate takes at most ${MAX_ESTIMATE_LINES} lines.`);
  const keys = new Set(lines.map((l) => bidItemKey(l.bidItem)));
  if (keys.size > MAX_BID_ITEMS)
    out.push(`An estimate takes at most ${MAX_BID_ITEMS} bid items; combine some.`);
  lines.forEach((l, i) => {
    if (!bidItemKey(l.bidItem)) out.push(`Line ${i + 1}: name its bid item.`);
    if (l.quantityMilli < 0) out.push(`Line ${i + 1}: the quantity is below 0.`);
  });
  return out;
}

/** "EST-0007" */
export const estimateLabel = (n: number) => `EST-${String(n).padStart(4, "0")}`;

/** Days a proposal is open for acceptance by default (the PDF prints the date it lapses). */
export const DEFAULT_VALID_DAYS = 30;
