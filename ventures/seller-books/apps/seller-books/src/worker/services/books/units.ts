// Which inventory items an order sold. Pure, so the rules are unit-tested without a database.
//
// Specific identification (Schedule C Part III) needs each unit sold matched to an item the seller held on
// the sale date: an item bought after the sale cannot have been the one that sold. An order for three of a
// SKU sold three items, so it takes three, oldest first; when fewer are on hand it takes what there is and
// the order counts as missing cost for the rest.

export interface FreeUnit {
  id: string;
  acquiredDate: string;
}

/**
 * Removes and returns up to `quantity` units from `free` (sorted oldest first) bought on or before `date`.
 * Units bought later stay in `free` for later sales.
 */
export function takeUnits<T extends FreeUnit>(free: T[], date: string, quantity: number): T[] {
  const want = Math.max(1, Math.floor(quantity) || 1);
  const taken: T[] = [];
  for (let i = 0; i < free.length && taken.length < want; ) {
    const unit = free[i] as T;
    if (unit.acquiredDate <= date) {
      taken.push(unit);
      free.splice(i, 1);
    } else i++;
  }
  return taken;
}

/** Splits `total` cents over `n` parts that sum to it exactly; the leftover cents go to the first parts. */
export function splitCents(total: number, n: number): number[] {
  if (n <= 1) return [total];
  const base = Math.trunc(total / n);
  let rest = total - base * n;
  const step = rest < 0 ? -1 : 1;
  return Array.from({ length: n }, () => {
    if (rest === 0) return base;
    rest -= step;
    return base + step;
  });
}
