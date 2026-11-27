// Material price lists, part 2: a per-foot material's bar setup (cut allowance, bar length,
// remnant, and the scrap % that stands in for the drop when no bar length is set), edited in place
// on the Materials card. Pure: what the setup says, whether a draft line was priced with another
// setup (Re-price would change it), and what a sample blank gets per bar before and after an edit.
// Nothing here prices or re-prices; the engine (costing.ts, barStockUse) does that.
import { barStockUse } from "./costing";
import type { MaterialPricing } from "./enums";
import { linePriceNotes, type PriceFields, type StaleMaterial } from "./material-price";

export interface BarSetup {
  pricingBasis: MaterialPricing;
  cutAllowanceIn?: number | null;
  barLengthIn?: number | null;
  barRemnantIn?: number | null;
  scrapBps: number;
}

/** The setup as the engine reads it: no allowance and no remnant both cost as 0. */
function normal(m: BarSetup) {
  const bar = m.barLengthIn && m.barLengthIn > 0 ? m.barLengthIn : null;
  return {
    allowance: Math.max(0, m.cutAllowanceIn ?? 0),
    bar,
    remnant: bar === null ? 0 : Math.max(0, m.barRemnantIn ?? 0),
    // With a bar length the drop is in the whole-bar count, so scrap % does not price the line.
    scrapBps: bar === null ? m.scrapBps : 0,
  };
}

/**
 * True when a line priced with `priced` would cost differently with `current`'s bar setup. Only
 * per-foot on both sides: a basis change is the price note's to report (priceMoved).
 */
export function barSetupMoved(priced: BarSetup, current: BarSetup): boolean {
  if (priced.pricingBasis !== "per_ft" || current.pricingBasis !== "per_ft") return false;
  const a = normal(priced);
  const b = normal(current);
  return (
    a.allowance !== b.allowance ||
    a.bar !== b.bar ||
    a.remnant !== b.remnant ||
    a.scrapBps !== b.scrapBps
  );
}

const num = (n: number) => Number(n.toFixed(4)).toString();

/**
 * "0.125 in cut allowance, 144 in bars (3 in remnant)" or "no cut allowance, by length used plus
 * 5% scrap": the setup as the card and the draft-line note say it.
 */
export function barSetupText(m: BarSetup): string {
  const s = normal(m);
  const allowance = s.allowance > 0 ? `${num(s.allowance)} in cut allowance` : "no cut allowance";
  if (s.bar === null) {
    const scrap = s.scrapBps > 0 ? ` plus ${num(s.scrapBps / 100)}% scrap` : "";
    return `${allowance}, by length used${scrap}`;
  }
  const remnant = s.remnant > 0 ? ` (${num(s.remnant)} in remnant)` : "";
  return `${allowance}, ${num(s.bar)} in bars${remnant}`;
}

/** What one blank length gets from a setup: the cut length and, with a bar length, parts per bar. */
export function blankUseText(m: BarSetup, blankIn: number): string {
  const s = normal(m);
  const use = barStockUse(
    { cutAllowanceIn: s.allowance, barLengthIn: s.bar, barRemnantIn: s.remnant },
    blankIn,
  );
  const cut = `${num(use.cutLengthIn)} in per part`;
  if (use.partsPerBar === null) return `${cut}, charged by length used`;
  if (use.partsPerBar === 0) return `${cut}, longer than the usable bar (the price is blocked)`;
  return `${cut}, ${use.partsPerBar} part${use.partsPerBar === 1 ? "" : "s"} per bar`;
}

/**
 * The edit form's check: "A 2.875 in blank: 3 in per part, 47 parts per bar now; 3.0625 in per
 * part, 46 parts per bar with these settings." Null for a blank that is not a positive length.
 */
export function blankCheckText(before: BarSetup, after: BarSetup, blankIn: number): string | null {
  if (!Number.isFinite(blankIn) || blankIn <= 0) return null;
  const now = blankUseText(before, blankIn);
  const next = blankUseText(after, blankIn);
  const head = `A ${num(blankIn)} in blank: `;
  return now === next
    ? `${head}${now}, unchanged.`
    : `${head}${now} now; ${next} with these settings.`;
}

/**
 * The draft-line note when the card's bar setup changed since the line was priced, else null.
 * "This line was priced with 1018 CRS at 0.125 in cut allowance, 144 in bars (3 in remnant); the
 * rate card now has 0.1875 in cut allowance, 240 in bars (3 in remnant). Re-price to use it."
 */
export function barSetupNote(
  name: string,
  priced: BarSetup | undefined,
  current: BarSetup,
): string | null {
  if (!priced || !barSetupMoved(priced, current)) return null;
  return `This line was priced with ${name} at ${barSetupText(priced)}; the rate card now has ${barSetupText(current)}. Re-price to use it.`;
}

type WithBarSetup = PriceFields & Omit<BarSetup, "pricingBasis">;

/**
 * Every note a draft line shows about its material: the price notes (linePriceNotes: stale, price
 * moved) and then the bar-setup note. Same arguments as linePriceNotes.
 */
export function lineMaterialNotes(
  line: {
    inputs: { material: { materialId: string } | null };
    snapshot: { materials: (WithBarSetup & { id: string })[] } | null;
  },
  materials: (StaleMaterial & WithBarSetup)[],
  maxAgeDays: number | null | undefined,
  now: Date,
  currency: string | null,
): string[] {
  const notes = linePriceNotes(line, materials, maxAgeDays, now, currency);
  const id = line.inputs.material?.materialId;
  const current = id ? materials.find((m) => m.id === id) : undefined;
  if (!current) return notes;
  const priced = line.snapshot?.materials.find((m) => m.id === id);
  const bar = barSetupNote(current.name, priced, current);
  return bar ? [...notes, bar] : notes;
}
