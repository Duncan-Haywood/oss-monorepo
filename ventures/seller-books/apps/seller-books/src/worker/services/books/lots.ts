// Cost of goods for lots: a bulk purchase's total cost is spread over its items. Items with a typed-in
// (manual) cost keep it; the rest of the lot cost is split evenly, and leftover cents go to the first
// items so the shares always add back up to the lot total exactly.

export interface LotItemInput {
  id: string;
  manualCostCents: number | null;
}

export interface LotAllocation {
  costs: Map<string, number>;
  /** Lot cost not carried by any item (no items yet, or manual costs that don't add up). */
  unallocatedCents: number;
  warnings: string[];
}

export function allocateLotCost(totalCents: number, items: LotItemInput[]): LotAllocation {
  if (!Number.isInteger(totalCents) || totalCents < 0)
    throw new Error("Lot cost must be whole cents ≥ 0");
  const costs = new Map<string, number>();
  const warnings: string[] = [];
  const manualSum = items.reduce((s, i) => s + (i.manualCostCents ?? 0), 0);
  const even = items.filter((i) => i.manualCostCents == null);
  for (const i of items) if (i.manualCostCents != null) costs.set(i.id, i.manualCostCents);
  let remaining = totalCents - manualSum;
  if (remaining < 0) {
    warnings.push("Typed-in item costs add up to more than the lot cost; other items get $0.");
    remaining = 0;
  }
  if (even.length === 0) {
    if (remaining > 0 && items.length > 0) {
      warnings.push("Typed-in item costs add up to less than the lot cost.");
    }
    return { costs, unallocatedCents: remaining, warnings };
  }
  const base = Math.floor(remaining / even.length);
  let extra = remaining - base * even.length;
  for (const i of even) {
    costs.set(i.id, base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra--;
  }
  return { costs, unallocatedCents: 0, warnings };
}
