// Material price lists, part 1: when each material's price was last set, its price history, and a
// warning when a draft quote prices from a price older than the shop's limit. Pure functions; the
// service (services/ratecard) records the changes and the client shows them. Metal prices move
// month to month, so a rate card typed in once and never touched again quotes yesterday's metal.
// Nothing here changes a price: the warning tells the estimator to check, it never re-prices.
import { currencyPrefix, formatMoney } from "./currency";
import type { MaterialPricing } from "./enums";

/** Days a shop may set as the limit; null (or 0 in the form) turns the warning off. */
export const MAX_PRICE_AGE_DAYS_LIMIT = 3650;
/** New shops and shops that never set it warn after this many days. */
export const DEFAULT_PRICE_MAX_AGE_DAYS = 90;
/** The history endpoint returns at most this many rows per material, newest first (all are kept). */
export const PRICE_HISTORY_LIMIT = 50;

export interface PriceFields {
  pricingBasis: MaterialPricing;
  pricePerLbCents: number | null;
  stockPriceCents: number | null;
  /** per_ft rows; absent on rate snapshots and history rows from before per-foot pricing. */
  pricePerFootCents?: number | null;
  /**
   * The supplier's unit kept exactly: per_lb priced per hundredweight (100 lb), per_ft priced per
   * metre. When set, the matching per-lb / per-ft field is null. Absent on older rows.
   */
  pricePerCwtCents?: number | null;
  pricePerMetreCents?: number | null;
}

/** Feet in one metre is 1 / 0.3048 (the international foot); a metre price × 0.3048 is per foot. */
export const FT_PER_METRE_FACTOR = 0.3048;

/** The exact $/lb, in cents (fractional when priced per cwt: $412.50/cwt is 412.5 ¢/lb). */
export function lbPriceCents(p: {
  pricePerLbCents: number | null;
  pricePerCwtCents?: number | null;
}): number | null {
  if (p.pricePerCwtCents != null) return p.pricePerCwtCents / 100;
  return p.pricePerLbCents;
}

/** The exact $/ft, in cents (fractional when priced per metre: $10.00/m is 304.8 ¢/ft). */
export function footPriceCents(p: {
  pricePerFootCents?: number | null;
  pricePerMetreCents?: number | null;
}): number | null {
  if (p.pricePerMetreCents != null) return p.pricePerMetreCents * FT_PER_METRE_FACTOR;
  return p.pricePerFootCents ?? null;
}

/**
 * The price the material charges by: $/lb for per_lb, $/stock piece for per_stock, $/ft for per_ft,
 * exact (a cwt or metre price is converted without rounding, so it can be fractional cents).
 */
export function effectivePrice(p: PriceFields): number | null {
  if (p.pricingBasis === "per_ft") return footPriceCents(p);
  return p.pricingBasis === "per_lb" ? lbPriceCents(p) : p.stockPriceCents;
}

/** The unit the shop's price is kept in: "lb", "cwt", "ft", "m" or "piece". */
export function priceUnit(p: PriceFields): "lb" | "cwt" | "ft" | "m" | "piece" {
  if (p.pricingBasis === "per_lb") return p.pricePerCwtCents != null ? "cwt" : "lb";
  if (p.pricingBasis === "per_ft") return p.pricePerMetreCents != null ? "m" : "ft";
  return "piece";
}

/** The price as the shop keeps it, in that unit (whole cents): the cwt price, the metre price, … */
export function keptPrice(p: PriceFields): number | null {
  switch (priceUnit(p)) {
    case "cwt":
      return p.pricePerCwtCents ?? null;
    case "m":
      return p.pricePerMetreCents ?? null;
    case "ft":
      return p.pricePerFootCents ?? null;
    case "lb":
      return p.pricePerLbCents;
    default:
      return p.stockPriceCents;
  }
}

/**
 * Money with the sub-cent digits a converted price carries: 412.5 ¢ is "$4.125", 304.8 ¢ is
 * "$3.048"; whole cents read as formatMoney does. At most four decimal places of the currency unit.
 */
export function exactMoneyText(cents: number, currency: string | null | undefined): string {
  const tenThousandths = Math.round(cents * 100);
  if (tenThousandths % 100 === 0) return formatMoney(cents, currency, { grouping: false });
  const negative = tenThousandths < 0;
  const abs = Math.abs(tenThousandths);
  const whole = Math.floor(abs / 10_000);
  const frac = (abs % 10_000).toString().padStart(4, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${currencyPrefix(currency)}${whole}.${frac.padEnd(2, "0")}`;
}

/**
 * Whether an edit changes what the material charges. A name, density, scrap or sheet-size edit is
 * not a new price, so it does not reset the price date. A change of basis or of the unit the price
 * is kept in (lb or cwt, ft or metre) always counts. Fields
 * the patch leaves out keep their current value.
 */
export function priceChanged(before: PriceFields, patch: Partial<PriceFields>): boolean {
  const after: PriceFields = { ...before, ...definedOnly(patch) };
  if (after.pricingBasis !== before.pricingBasis) return true;
  // A price re-entered in the supplier's unit ($4.25/lb as $425.00/cwt) is a new entry on the card.
  if (priceUnit(after) !== priceUnit(before)) return true;
  return effectivePrice(after) !== effectivePrice(before);
}

function definedOnly(patch: Partial<PriceFields>): Partial<PriceFields> {
  const out: Partial<PriceFields> = {};
  if (patch.pricingBasis !== undefined) out.pricingBasis = patch.pricingBasis;
  if (patch.pricePerLbCents !== undefined) out.pricePerLbCents = patch.pricePerLbCents;
  if (patch.stockPriceCents !== undefined) out.stockPriceCents = patch.stockPriceCents;
  if (patch.pricePerFootCents !== undefined) out.pricePerFootCents = patch.pricePerFootCents;
  if (patch.pricePerCwtCents !== undefined) out.pricePerCwtCents = patch.pricePerCwtCents;
  if (patch.pricePerMetreCents !== undefined) out.pricePerMetreCents = patch.pricePerMetreCents;
  return out;
}

/**
 * What Re-price would change on a line priced at `priced`: the basis or the exact price, not the
 * unit it is written in ($4.25/lb and $425.00/cwt price a line the same).
 */
export function priceMoved(priced: PriceFields, current: PriceFields): boolean {
  if (priced.pricingBasis !== current.pricingBasis) return true;
  return effectivePrice(priced) !== effectivePrice(current);
}

const DAY_MS = 86_400_000;

/** Whole days from `setAt` to `now` (never negative: a clock a little ahead reads as 0). */
export function priceAgeDays(setAt: Date | string, now: Date): number {
  const t = typeof setAt === "string" ? Date.parse(setAt) : setAt.getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/** True when the shop's limit is on and the price is older than it. */
export function isPriceStale(
  setAt: Date | string,
  maxAgeDays: number | null | undefined,
  now: Date,
): boolean {
  if (!maxAgeDays || maxAgeDays <= 0) return false;
  return priceAgeDays(setAt, now) > maxAgeDays;
}

export function ageText(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export interface StaleMaterial {
  id: string;
  name: string;
  priceSetAt: string;
  active?: boolean;
}

/**
 * The warning a draft line shows when its material's price on today's card is older than the
 * shop's limit, or null. Only the shop's own date is stated; no market price is guessed.
 */
export function stalePriceWarning(
  material: StaleMaterial | undefined,
  maxAgeDays: number | null | undefined,
  now: Date,
): string | null {
  if (!material || !isPriceStale(material.priceSetAt, maxAgeDays, now)) return null;
  const days = priceAgeDays(material.priceSetAt, now);
  return `The ${material.name} price on the rate card was last set ${ageText(days)} (${material.priceSetAt.slice(0, 10)}), past the shop's ${maxAgeDays}-day limit. Check it with your supplier, update the rate card, then Re-price.`;
}

export interface PriceHistoryEntry {
  pricingBasis: MaterialPricing;
  pricePerLbCents: number | null;
  stockPriceCents: number | null;
  pricePerFootCents?: number | null;
  pricePerCwtCents?: number | null;
  pricePerMetreCents?: number | null;
  createdAt: string;
}

/**
 * One history row as text: "$4.25/lb, up 6.3% from $4.00/lb". `previous` is the row before it
 * (older); a basis change or a first price has no percentage. The import preview passes the card's
 * price as `previous` and the sheet's as `entry`.
 */
export function priceChangeText(
  entry: PriceFields | PriceHistoryEntry,
  previous: PriceFields | PriceHistoryEntry | null,
  currency: string | null,
): string {
  const now = priceText(entry, currency);
  if (!previous) return now;
  const before = priceText(previous, currency);
  const a = effectivePrice(entry);
  const b = effectivePrice(previous);
  if (previous.pricingBasis !== entry.pricingBasis || a === null || b === null || b === 0) {
    return `${now}, was ${before}`;
  }
  if (a === b) return `${now}, unchanged`;
  const pct = ((a - b) / b) * 100;
  const dir = pct > 0 ? "up" : "down";
  return `${now}, ${dir} ${Math.abs(pct).toFixed(1)}% from ${before}`;
}

export function priceText(p: PriceHistoryEntry | PriceFields, currency: string | null): string {
  const v = keptPrice(p);
  if (v === null) return "no price";
  const u = priceUnit(p);
  const unit = u === "piece" ? " per stock piece" : `/${u}`;
  return `${formatMoney(v, currency)}${unit}`;
}

/**
 * What a draft line should say about its material price: the card's price is past the shop's
 * limit, and/or the card's price differs from the one the line was priced at (so Re-price would
 * change it). Empty when there is nothing to say.
 */
export function linePriceNotes(
  line: {
    inputs: { material: { materialId: string } | null };
    snapshot: { materials: (PriceFields & { id: string })[] } | null;
  },
  materials: (StaleMaterial & PriceFields)[],
  maxAgeDays: number | null | undefined,
  now: Date,
  currency: string | null,
): string[] {
  const id = line.inputs.material?.materialId;
  if (!id) return [];
  const current = materials.find((m) => m.id === id);
  if (!current) return [];
  const notes: string[] = [];
  const priced = line.snapshot?.materials.find((m) => m.id === id);
  if (priced && priceMoved(priced, current)) {
    notes.push(
      `This line was priced with ${current.name} at ${priceText(priced, currency)}; the rate card now has ${priceText(current, currency)}. Re-price to use it.`,
    );
  }
  const stale = stalePriceWarning(current, maxAgeDays, now);
  if (stale) notes.push(stale);
  return notes;
}

/**
 * Where an imported price came from, for its history row: ", from Ryerson's price list dated
 * 2026-11-20". Empty when the import named neither a supplier nor a date.
 */
export function priceListText(supplier: string | null, date: string | null): string {
  const who = supplier?.trim();
  if (who && date) return `, from ${who}'s price list dated ${date}`;
  if (who) return `, from ${who}'s price list`;
  if (date) return `, price list dated ${date}`;
  return "";
}
