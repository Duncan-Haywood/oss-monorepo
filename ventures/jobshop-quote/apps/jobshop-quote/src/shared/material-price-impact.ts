// Material price lists, part 2: "quotes this changes". When a material's price on the rate card
// moves, which open quotes were priced at the old price? Drafts can be re-priced; a sent quote that
// is still open keeps the price the customer saw, but the estimator should know it now costs more
// (or less) to make. Pure: the service loads the open quotes' lines and today's card, this lists
// them per material with the move from the price each line was priced at. Nothing re-prices here.
import { effectivePrice, type PriceFields, priceChanged, priceMoved } from "./material-price";

/** Only these statuses are open: a won, lost, expired or superseded quote is decided or replaced. */
export const OPEN_QUOTE_STATUSES = ["draft", "sent"] as const;
export type OpenQuoteStatus = (typeof OPEN_QUOTE_STATUSES)[number];

/** The thresholds the rate card offers ("moved more than N%"); 0 lists every change. */
export const PRICE_IMPACT_THRESHOLDS = [0, 1, 2, 5, 10] as const;
/** The most quotes the service reads; it says when it stopped there. */
export const PRICE_IMPACT_MAX_QUOTES = 2_000;

export interface ImpactQuote {
  id: string;
  quoteNumber: number;
  revNumber: number;
  status: OpenQuoteStatus;
  customerCompany: string;
}

export interface ImpactLine {
  quoteId: string;
  inputs: { material: { materialId: string } | null };
  /** The rate-card rows the line was priced from; null while the line has blocking issues. */
  snapshot: { materials: (PriceFields & { id: string })[] } | null;
}

export interface ImpactMaterial extends PriceFields {
  id: string;
  name: string;
}

export interface AffectedQuote extends ImpactQuote {
  /** Lines on this quote priced at a price for this material that the card no longer has. */
  lines: number;
  /** The price the (most moved) line was priced at. */
  priced: PriceFields;
  /** Percent move from `priced` to the card's price; null when the basis changed or was 0. */
  movePct: number | null;
}

export interface MaterialImpact {
  materialId: string;
  name: string;
  current: PriceFields;
  quotes: AffectedQuote[];
}

/** Percent move from the priced price to the current one, or null when they cannot be compared. */
export function priceMovePct(priced: PriceFields, current: PriceFields): number | null {
  if (priced.pricingBasis !== current.pricingBasis) return null;
  const a = effectivePrice(current);
  const b = effectivePrice(priced);
  if (a === null || b === null || b === 0) return null;
  return ((a - b) / b) * 100;
}

/**
 * A move counts when the price changed and its size is at least `minPct` (in either direction).
 * A move that cannot be measured (a change of basis, a first price) always counts: the estimator
 * has to look at it whatever the threshold.
 */
export function moveCounts(movePct: number | null, minPct: number): boolean {
  if (movePct === null) return true;
  // Rounded to 0.1% so "moved 5.0%" is listed under "5% or more" despite float noise.
  return Math.round(Math.abs(movePct) * 10) / 10 >= minPct;
}

/**
 * Each material whose card price differs from the price an open quote's line was priced at, with
 * those quotes (most moved first, then by quote number). Materials with nothing to say are left
 * out; a line priced from another material, with no snapshot, or customer-supplied, never counts.
 */
export function materialPriceImpact(
  quotes: ImpactQuote[],
  lines: ImpactLine[],
  materials: ImpactMaterial[],
  minPct = 0,
): MaterialImpact[] {
  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const byMaterial = new Map<string, Map<string, AffectedQuote>>();
  for (const line of lines) {
    const quote = quoteById.get(line.quoteId);
    const id = line.inputs.material?.materialId;
    if (!quote || !id) continue;
    const current = materialById.get(id);
    const priced = line.snapshot?.materials.find((m) => m.id === id);
    if (!current || !priced || !priceMoved(priced, current)) continue;
    const movePct = priceMovePct(priced, current);
    if (!moveCounts(movePct, minPct)) continue;
    let affected = byMaterial.get(id);
    if (!affected) {
      affected = new Map();
      byMaterial.set(id, affected);
    }
    const prev = affected.get(quote.id);
    const pricedFields = priceOnly(priced);
    if (!prev) {
      affected.set(quote.id, { ...quote, lines: 1, priced: pricedFields, movePct });
    } else {
      prev.lines += 1;
      if (moreMoved(movePct, prev.movePct)) {
        prev.priced = pricedFields;
        prev.movePct = movePct;
      }
    }
  }
  const out: MaterialImpact[] = [];
  for (const [id, affected] of byMaterial) {
    const m = materialById.get(id);
    if (!m) continue;
    out.push({
      materialId: id,
      name: m.name,
      current: priceOnly(m),
      quotes: [...affected.values()].sort(
        (a, b) =>
          moveSize(b.movePct) - moveSize(a.movePct) ||
          a.quoteNumber - b.quoteNumber ||
          a.revNumber - b.revNumber,
      ),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Just the price fields (per-foot, per-cwt and per-metre included, so every move is seen). */
export function priceOnly(p: PriceFields): PriceFields {
  return {
    pricingBasis: p.pricingBasis,
    pricePerLbCents: p.pricePerLbCents,
    stockPriceCents: p.stockPriceCents,
    pricePerFootCents: p.pricePerFootCents ?? null,
    pricePerCwtCents: p.pricePerCwtCents ?? null,
    pricePerMetreCents: p.pricePerMetreCents ?? null,
  };
}

export interface ProposedPrice extends PriceFields {
  materialId: string;
}

/**
 * Material price lists, part 2b: the import preview's "quotes this changes". For each card material
 * whose price the import would change, the open quotes with a line priced at a price other than the
 * one the import sets (most often the price on the card today). A proposed price equal to the card's
 * is left out (the card's own "quotes this changes" already lists quotes priced before it), and so
 * is a material id that is not this shop's. Every move is listed: the preview shows them all.
 */
export function proposedPriceImpact(
  quotes: ImpactQuote[],
  lines: ImpactLine[],
  materials: ImpactMaterial[],
  proposed: ProposedPrice[],
): MaterialImpact[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const next = new Map<string, ImpactMaterial>();
  for (const p of proposed) {
    const cur = byId.get(p.materialId);
    const price = priceOnly(p);
    if (cur && priceChanged(priceOnly(cur), price)) next.set(cur.id, { ...cur, ...price });
  }
  return materialPriceImpact(quotes, lines, [...next.values()], 0);
}

export interface ImportPriceMove {
  row: number;
  materialId: string;
  before: PriceFields;
  after: PriceFields;
}

/**
 * The material price each row of an import would change: rows that update a card material (by id)
 * to a different price or basis. New materials and rows that leave the price alone are left out.
 * `values` is the row as the import would save it (the card's row merged with the sheet's cells).
 */
export function importPriceMoves(
  rows: { row: number; action: "create" | "update"; id?: string; values?: unknown }[],
  materials: (PriceFields & { id: string })[],
): ImportPriceMove[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const out: ImportPriceMove[] = [];
  for (const r of rows) {
    const cur = r.action === "update" && r.id ? byId.get(r.id) : undefined;
    const v = r.values as Partial<PriceFields> | undefined;
    if (!cur || !v?.pricingBasis) continue;
    const before = priceOnly(cur);
    const after = priceOnly({
      pricingBasis: v.pricingBasis,
      pricePerLbCents: v.pricePerLbCents ?? null,
      stockPriceCents: v.stockPriceCents ?? null,
      pricePerFootCents: v.pricePerFootCents ?? null,
      pricePerCwtCents: v.pricePerCwtCents ?? null,
      pricePerMetreCents: v.pricePerMetreCents ?? null,
    });
    if (priceChanged(before, after)) out.push({ row: r.row, materialId: cur.id, before, after });
  }
  return out;
}

/** An unmeasurable move sorts first: it needs a look whatever its size. */
const moveSize = (p: number | null) => (p === null ? Number.POSITIVE_INFINITY : Math.abs(p));
const moreMoved = (a: number | null, b: number | null) => moveSize(a) > moveSize(b);

/** "up 6.3%", "down 2.0%", or a note when the two prices cannot be compared as a percentage. */
export function moveText(movePct: number | null): string {
  if (movePct === null) return "not comparable (other basis, or no price then)";
  const dir = movePct > 0 ? "up" : "down";
  return `${dir} ${Math.abs(movePct).toFixed(1)}%`;
}
