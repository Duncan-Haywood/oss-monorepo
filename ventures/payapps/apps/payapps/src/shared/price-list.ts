// The company's price list: the material prices, labor rates, equipment rates and sub quotes a
// contractor reuses from bid to bid, kept once per company instead of retyped (or copied from the
// last estimate) on every new estimate. An item is a category, a description, a unit and a unit cost,
// with an optional code (a supplier's part number or the company's own) and a note (where the price
// came from: "Ferguson quote 11/20").
//
// An estimate line and a price-list item are the same thing when their category, description and
// unit match, compared without case or extra spaces (priceKey). That key is how the estimate page
// fills a line picked from the list, saves its own lines to the list, and offers to bring an older
// estimate's prices up to date. Pure: the worker stores items, the client calls these to plan.
import type { EstimateLineInput } from "./estimate";
import type { CostCategory } from "./job-cost";

/** Items one company keeps; a big mechanical sub's material book runs to a few thousand. */
export const MAX_PRICE_LIST_ITEMS = 5_000;
/** Items one request adds or updates (from an estimate's lines or a supplier's spreadsheet). */
export const MAX_PRICE_LIST_BATCH = 1_000;
export const MAX_PRICE_CODE_LENGTH = 40;
export const MAX_PRICE_DESCRIPTION_LENGTH = 300;
export const MAX_PRICE_NOTE_LENGTH = 300;

export interface PriceItemInput {
  category: CostCategory;
  /** A part number or the company's own code; null: none. */
  code: string | null;
  description: string;
  unit: string | null;
  /** Millionths of a dollar a unit, like estimate lines. */
  unitCostMicros: number;
  /** Where the price came from; null: none. */
  note: string | null;
}

export interface PriceItem extends PriceItemInput {
  id: string;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** What makes a line and an item the same price: category, description and unit, case-blind. */
export const priceKey = (x: { category: CostCategory; description: string; unit: string | null }) =>
  `${x.category}|${norm(x.description)}|${norm(x.unit)}`;

/** The item's fields tidied the way they are stored (trimmed, single spaces, blanks to null). */
export function cleanItem(x: PriceItemInput): PriceItemInput {
  const tidy = (s: string | null) => {
    const t = (s ?? "").trim().replace(/\s+/g, " ");
    return t === "" ? null : t;
  };
  return {
    category: x.category,
    code: tidy(x.code),
    description: (tidy(x.description) ?? "") as string,
    unit: tidy(x.unit),
    unitCostMicros: x.unitCostMicros,
    note: tidy(x.note),
  };
}

/** Problems that keep an item off the list; empty when it can be saved. */
export function itemProblems(x: PriceItemInput): string[] {
  const out: string[] = [];
  if (!x.description.trim()) out.push("Name the item.");
  if (!Number.isSafeInteger(x.unitCostMicros) || x.unitCostMicros < 0)
    out.push(`"${x.description}": the unit cost must be zero or more.`);
  return out;
}

export interface MergePlan {
  /** Items not on the list yet, in the order given. */
  add: PriceItemInput[];
  /** Items on the list whose cost (or code or note, when one is given) changes. */
  update: { id: string; item: PriceItemInput; oldUnitCostMicros: number }[];
  /** Already on the list at the same cost. */
  unchanged: number;
  /**
   * Keys given more than once at different costs (two lines of "Galvanized duct, LB" priced
   * differently): the last one is used, and each is named so the person can check it.
   */
  conflicts: string[];
}

/**
 * How a batch of items (an estimate's lines, a supplier's sheet) lands on the list: new keys are
 * added, matching keys get the new cost, and a code or note left blank keeps the saved one.
 */
export function planMerge(existing: PriceItem[], incoming: PriceItemInput[]): MergePlan {
  const byKey = new Map(existing.map((e) => [priceKey(e), e]));
  // Last one wins within the batch; remember where the costs disagreed.
  const seen = new Map<string, PriceItemInput>();
  const conflicts: string[] = [];
  for (const raw of incoming) {
    const x = cleanItem(raw);
    const k = priceKey(x);
    const prev = seen.get(k);
    if (prev && prev.unitCostMicros !== x.unitCostMicros && !conflicts.includes(x.description))
      conflicts.push(x.description);
    // Re-insert so the order is the last appearance's.
    seen.delete(k);
    seen.set(k, prev ? { ...x, code: x.code ?? prev.code, note: x.note ?? prev.note } : x);
  }
  const plan: MergePlan = { add: [], update: [], unchanged: 0, conflicts };
  for (const [k, x] of seen) {
    const e = byKey.get(k);
    if (!e) {
      plan.add.push(x);
      continue;
    }
    const merged: PriceItemInput = {
      ...x,
      // The saved spelling stays (the key matched, so they differ only in case or spacing).
      description: e.description,
      unit: e.unit,
      code: x.code ?? e.code,
      note: x.note ?? e.note,
    };
    if (
      merged.unitCostMicros === e.unitCostMicros &&
      merged.code === e.code &&
      merged.note === e.note
    ) {
      plan.unchanged += 1;
    } else {
      plan.update.push({ id: e.id, item: merged, oldUnitCostMicros: e.unitCostMicros });
    }
  }
  return plan;
}

/** An estimate's lines as price-list items (quantity and bid item are the estimate's, not the list's). */
export function itemsFromLines(lines: EstimateLineInput[]): PriceItemInput[] {
  return lines
    .filter((l) => l.description.trim() !== "")
    .map((l) => ({
      category: l.category,
      code: null,
      description: l.description,
      unit: l.unit,
      unitCostMicros: l.unitCostMicros,
      note: null,
    }));
}

export interface PriceChange {
  /** Index into the lines given. */
  line: number;
  itemId: string;
  description: string;
  fromMicros: number;
  toMicros: number;
}

/**
 * Lines whose price-list item now costs something else: what "Use today's prices" would change on
 * an older estimate. Lines with no matching item are left alone.
 */
export function priceChanges(lines: EstimateLineInput[], items: PriceItem[]): PriceChange[] {
  const byKey = new Map(items.map((i) => [priceKey(i), i]));
  const out: PriceChange[] = [];
  lines.forEach((l, line) => {
    const i = byKey.get(priceKey(l));
    if (i && i.unitCostMicros !== l.unitCostMicros)
      out.push({
        line,
        itemId: i.id,
        description: l.description,
        fromMicros: l.unitCostMicros,
        toMicros: i.unitCostMicros,
      });
  });
  return out;
}

/** How many lines match an item on the list (so the page can say "12 of 30 lines are on your list"). */
export function linesOnList(lines: EstimateLineInput[], items: PriceItem[]): number {
  const keys = new Set(items.map(priceKey));
  return lines.filter((l) => keys.has(priceKey(l))).length;
}

/**
 * The items a search shows: every word typed appears in the description, code, unit or note (any
 * order, case-blind), within a category when one is picked; sorted by category then description.
 */
export function searchItems<T extends PriceItem>(
  items: T[],
  query: string,
  category: CostCategory | null = null,
): T[] {
  const words = norm(query).split(" ").filter(Boolean);
  return items
    .filter((i) => category === null || i.category === category)
    .filter((i) => {
      const hay = norm([i.description, i.code, i.unit, i.note].filter(Boolean).join(" "));
      return words.every((w) => hay.includes(w));
    })
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        norm(a.description).localeCompare(norm(b.description)),
    );
}
