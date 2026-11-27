// Unit-price lines: a schedule-of-values line billed by quantity (1,200 CY of concrete at $145.50/CY,
// 3,400 LF of curb at $18.25/LF) instead of by percent of a lump sum. Site work, paving, utilities,
// concrete and landscaping subcontracts are often written this way, and the GC's portal or pay-app
// form then wants the quantity installed each period, not a dollar figure.
//
// Money stays in cents everywhere else: the pay-app math (payapp-math.ts) never sees a quantity. A
// unit-price line carries its unit, its unit price and (on the original contract) its quantity; a
// pay-app entry on it carries the quantity installed this period, and the work this period in cents
// is always that quantity times the unit price, rounded half away from zero to the cent. The server
// refuses an entry whose cents do not match (services/payapps/pay-apps.ts), so the two cannot drift.
//
// Units of storage: quantities in thousandths (`quantityMilli`, 3 decimals: 12.5 CY is 12500) and unit
// prices in millionths of a dollar (`unitPriceMicros`, up to 6 decimals: $0.875/LF is 875000), both
// integers, so nothing is lost to floating point. Products use BigInt.
import { formatCents as centsLabel } from "./money";

/** Largest quantity accepted: 1,000,000,000 units (thousandths fit easily in a safe integer). */
export const MAX_QUANTITY_MILLI = 1_000_000_000_000;
/** Largest unit price accepted: $10,000,000 a unit. */
export const MAX_UNIT_PRICE_MICROS = 10_000_000_000_000;
export const MAX_UNIT_LENGTH = 12;

/** Common unit abbreviations offered in the form; any short text is accepted. */
export const COMMON_UNITS = [
  "EA",
  "LF",
  "SF",
  "SY",
  "CY",
  "TON",
  "LB",
  "GAL",
  "HR",
  "DAY",
  "LS",
  "MO",
] as const;

const DIV_CENTS = 10_000_000n; // milli (1e3) × micros (1e6) → dollars, × 100 cents → 1e9 / 1e2 = 1e7

/** quantity × unit price in cents, rounded half away from zero. Negative quantities (a correction) allowed. */
export function extendCents(quantityMilli: number, unitPriceMicros: number): number {
  const p = BigInt(quantityMilli) * BigInt(unitPriceMicros);
  const neg = p < 0n;
  const abs = neg ? -p : p;
  let q = abs / DIV_CENTS;
  if ((abs % DIV_CENTS) * 2n >= DIV_CENTS) q += 1n;
  return Number(neg ? -q : q);
}

/**
 * A quantity typed by a person ("1,200", "12.5", "-3") in thousandths; null when it is not a number
 * with at most 3 decimals. Thousands separators are commas; a decimal comma is not read here (the
 * form shows the format).
 */
export function parseQuantity(input: string): number | null {
  return parseFixed(input, 3, MAX_QUANTITY_MILLI);
}

/** A unit price ("145.50", "$0.875", "1,250") in millionths of a dollar; null when not readable. */
export function parseUnitPrice(input: string): number | null {
  const v = parseFixed(input.replace(/^\s*\$/, ""), 6, MAX_UNIT_PRICE_MICROS);
  return v !== null && v < 0 ? null : v;
}

function parseFixed(input: string, decimals: number, max: number): number | null {
  const s = input.trim().replace(/,(?=\d{3}(\D|$))/g, "");
  const m = /^(-)?(\d+)?(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === undefined && !m[3])) return null;
  const frac = m[3] ?? "";
  if (frac.length > decimals) return null;
  const whole = m[2] ?? "0";
  const v = Number(whole) * 10 ** decimals + Number(frac.padEnd(decimals, "0") || "0");
  if (!Number.isSafeInteger(v) || Math.abs(v) > max) return null;
  return m[1] && v !== 0 ? -v : v;
}

/** "1,200" / "12.5" / "0.125": a quantity with its trailing zeros dropped. */
export function formatQuantity(quantityMilli: number): string {
  return formatFixed(quantityMilli, 3, 0);
}

/** "$145.50" / "$0.875": a unit price with at least two decimals. */
export function formatUnitPrice(unitPriceMicros: number): string {
  return `$${formatFixed(unitPriceMicros, 6, 2)}`;
}

/** The unit price as a plain decimal string for a spreadsheet cell ("145.5"). */
export function unitPriceDecimal(unitPriceMicros: number): string {
  return formatFixed(unitPriceMicros, 6, 0).replaceAll(",", "");
}

/** The quantity as a plain decimal string for a spreadsheet cell ("1200", "12.5"). */
export function quantityDecimal(quantityMilli: number): string {
  return formatFixed(quantityMilli, 3, 0).replaceAll(",", "");
}

function formatFixed(v: number, decimals: number, minDecimals: number): string {
  const neg = v < 0;
  const abs = Math.abs(v);
  const scale = 10 ** decimals;
  const whole = Math.floor(abs / scale);
  let frac = String(abs % scale)
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  if (frac.length < minDecimals) frac = frac.padEnd(minDecimals, "0");
  const w = whole.toLocaleString("en-US");
  return `${neg ? "-" : ""}${w}${frac ? `.${frac}` : ""}`;
}

/** The pricing a line carries; every field null on a lump-sum line. */
export interface UnitPricing {
  unit: string | null;
  unitPriceMicros: number | null;
  /** Original contract quantity (base lines only; a change-order line's quantity comes from its amount). */
  quantityMilli: number | null;
}

export const isUnitPriced = (l: Pick<UnitPricing, "unit" | "unitPriceMicros">): boolean =>
  !!l.unit && l.unitPriceMicros !== null;

/**
 * Why a line's pricing is not accepted, or null when it is. A base line with a quantity must have a
 * scheduled value equal to quantity × unit price, to the cent; a change-order line takes no quantity.
 */
export function unitPricingProblem(
  p: UnitPricing,
  line: { originalCents: number; isChangeOrderLine: boolean },
): string | null {
  const hasUnit = !!p.unit;
  const hasPrice = p.unitPriceMicros !== null;
  if (hasUnit !== hasPrice) return "A unit-price line needs both its unit and its unit price";
  if (p.quantityMilli !== null && !hasPrice) return "A quantity needs a unit and a unit price";
  if (p.unit && p.unit.length > MAX_UNIT_LENGTH)
    return `The unit is at most ${MAX_UNIT_LENGTH} characters (CY, LF, TON)`;
  if (
    p.unitPriceMicros !== null &&
    (p.unitPriceMicros <= 0 || p.unitPriceMicros > MAX_UNIT_PRICE_MICROS)
  )
    return "The unit price must be more than zero";
  if (p.quantityMilli !== null) {
    if (line.isChangeOrderLine)
      return "A change-order line's quantity comes from its change order: leave the quantity blank";
    if (p.quantityMilli <= 0 || p.quantityMilli > MAX_QUANTITY_MILLI)
      return "The contract quantity must be more than zero";
    const ext = extendCents(p.quantityMilli, p.unitPriceMicros as number);
    if (!Number.isSafeInteger(ext)) return "Quantity × unit price is too large";
    if (ext !== line.originalCents) {
      return `Quantity × unit price is ${centsLabel(ext)}, but the scheduled value is ${centsLabel(line.originalCents)}`;
    }
  }
  return null;
}

/**
 * Why a pay-app entry on a line is not accepted, or null. A quantity is only for a unit-price line,
 * and the work this period must then be exactly quantity × unit price.
 */
export function entryQuantityProblem(
  quantityThisPeriodMilli: number | null | undefined,
  workThisPeriodCents: number,
  line: Pick<UnitPricing, "unit" | "unitPriceMicros"> & { itemNumber: string },
): string | null {
  if (quantityThisPeriodMilli === null || quantityThisPeriodMilli === undefined) return null;
  if (!isUnitPriced(line))
    return `Line ${line.itemNumber} is not a unit-price line: enter its work this period in dollars`;
  const ext = extendCents(quantityThisPeriodMilli, line.unitPriceMicros as number);
  if (ext !== workThisPeriodCents) {
    return `Line ${line.itemNumber}: ${formatQuantity(quantityThisPeriodMilli)} ${line.unit} × ${formatUnitPrice(
      line.unitPriceMicros as number,
    )} is ${centsLabel(ext)}, not ${centsLabel(workThisPeriodCents)}`;
  }
  return null;
}

/**
 * Quantity installed to date on a line, through one application, from the quantities entered on it
 * and on every earlier application. `exact` is false when some of the work to date was entered in
 * dollars (an opening balance, or an entry made before the line had a unit price): the dollars are
 * then converted back at the unit price, and the result is labelled approximate.
 */
export function quantityToDate(
  line: Pick<UnitPricing, "unitPriceMicros"> & { openingCompletedCents: number },
  entries: readonly { workThisPeriodCents: number; quantityThisPeriodMilli: number | null }[],
): { quantityMilli: number; exact: boolean } | null {
  if (line.unitPriceMicros === null) return null;
  let milli = 0;
  let dollarCents = line.openingCompletedCents;
  for (const e of entries) {
    if (e.quantityThisPeriodMilli !== null) milli += e.quantityThisPeriodMilli;
    else dollarCents += e.workThisPeriodCents;
  }
  if (dollarCents === 0) return { quantityMilli: milli, exact: true };
  // cents → milli: cents / 100 dollars / (micros / 1e6) × 1000 = cents × 1e7 / micros
  const converted = Number((BigInt(dollarCents) * DIV_CENTS) / BigInt(line.unitPriceMicros));
  return { quantityMilli: milli + converted, exact: false };
}
