// Cost of goods for lots: a bulk purchase's total cost is spread over its items. Items with a typed-in
// (manual) cost keep it; the rest of the lot cost is split over the others, either evenly or in
// proportion to what the seller expects each to sell for ("value"). The shares always add back up to
// the lot total exactly: leftover cents go to the first items (even) or to the largest remainders
// (value).
//
// Why "value": a $40 bin holding one jacket worth $200 and nineteen $5 shirts gives the jacket $2 of
// cost when split evenly, so its sale shows $198 of profit and the unsold shirts carry $38 into
// closing inventory. Splitting by expected price gives the jacket about two-thirds of the cost, so each
// item's profit and the year's closing inventory (Schedule C line 41) follow what the items are worth.
// A lump-sum cost apportioned by the parts' relative value is the usual way to divide basis
// (Treas. Reg. § 1.61-6(a): "equitably apportioned"); which method fits is the seller's and their
// preparer's call, and the lot keeps the one they chose.

export const LOT_SPLITS = ["even", "value"] as const;
export type LotSplit = (typeof LOT_SPLITS)[number];

export interface LotItemInput {
  id: string;
  manualCostCents: number | null;
  /** What the seller expects it to sell for; used by the "value" split. */
  estimatedValueCents?: number | null;
}

export interface LotAllocation {
  costs: Map<string, number>;
  /** Lot cost not carried by any item (no items yet, or manual costs that don't add up). */
  unallocatedCents: number;
  warnings: string[];
  /** The split actually used: "value" falls back to "even" until every shared item has a value. */
  splitUsed: LotSplit;
}

export function allocateLotCost(
  totalCents: number,
  items: LotItemInput[],
  split: LotSplit = "even",
): LotAllocation {
  if (!Number.isInteger(totalCents) || totalCents < 0)
    throw new Error("Lot cost must be whole cents ≥ 0");
  const costs = new Map<string, number>();
  const warnings: string[] = [];
  const manualSum = items.reduce((s, i) => s + (i.manualCostCents ?? 0), 0);
  const shared = items.filter((i) => i.manualCostCents == null);
  for (const i of items) if (i.manualCostCents != null) costs.set(i.id, i.manualCostCents);
  let remaining = totalCents - manualSum;
  if (remaining < 0) {
    warnings.push("Typed-in item costs add up to more than the lot cost; other items get $0.");
    remaining = 0;
  }
  if (shared.length === 0) {
    if (remaining > 0 && items.length > 0) {
      warnings.push("Typed-in item costs add up to less than the lot cost.");
    }
    return { costs, unallocatedCents: remaining, warnings, splitUsed: split };
  }

  let splitUsed: LotSplit = split;
  if (split === "value") {
    const missing = shared.filter((i) => !i.estimatedValueCents || i.estimatedValueCents <= 0);
    if (missing.length > 0) {
      splitUsed = "even";
      warnings.push(
        `${missing.length} of ${shared.length} items sharing the lot cost ${
          missing.length === 1 ? "has" : "have"
        } no expected price, so the lot is split evenly until each one has one.`,
      );
    } else {
      const values = shared.map((i) => i.estimatedValueCents as number);
      const valueSum = values.reduce((s, v) => s + v, 0);
      // Largest-remainder rounding, in BigInt so a large lot times a large value cannot lose precision.
      const R = BigInt(remaining);
      const S = BigInt(valueSum);
      const parts = shared.map((i, k) => {
        const num = R * BigInt(values[k] ?? 0);
        return { id: i.id, k, base: Number(num / S), rem: num % S };
      });
      let extra = remaining - parts.reduce((s, p) => s + p.base, 0);
      const byRemainder = [...parts].sort((a, b) =>
        a.rem === b.rem ? a.k - b.k : a.rem > b.rem ? -1 : 1,
      );
      for (const p of byRemainder) {
        if (extra <= 0) break;
        p.base += 1;
        extra--;
      }
      for (const p of parts) costs.set(p.id, p.base);
      return { costs, unallocatedCents: 0, warnings, splitUsed };
    }
  }

  const base = Math.floor(remaining / shared.length);
  let extra = remaining - base * shared.length;
  for (const i of shared) {
    costs.set(i.id, base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra--;
  }
  return { costs, unallocatedCents: 0, warnings, splitUsed };
}
