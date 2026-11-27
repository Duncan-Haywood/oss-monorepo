// Job traveler (router) for a won quote: what the floor needs to make each part, taken from the
// quote line the shop priced. One sheet per line: the quantity ordered, the parts to start (with the
// line's expected fallout), the material and stock pieces to pull, and the operations in order with
// the setup and cycle times the estimate was built on, so the floor can see the estimate it is held
// to. Prices, rates and markup never appear: a traveler goes out to the floor, not to the customer.
//
// Nothing is guessed. A blank cycle time stays "not entered" (and the line's run total is then
// unknown), a machine, material or finishing operation the rate card no longer has prints as
// "(no longer on the rate card)", and stock pieces are counted only when the line says how many
// parts come from one piece.
import {
  type Blank,
  barStockUse,
  blankLengthIn,
  type CostInputs,
  MAX_QUANTITY,
  startsFor,
} from "./costing";

/** The names a traveler needs, by id: the line's price-time snapshot first, then today's rate card. */
export interface TravelerNames {
  machines: ReadonlyArray<{ id: string; name: string }>;
  materials: ReadonlyArray<{
    id: string;
    name: string;
    stockDescription?: string | null;
    /** per_ft rows: the cut list and the bars to pull come from these (shared/costing.ts barStockUse). */
    pricingBasis?: string;
    cutAllowanceIn?: number | null;
    barLengthIn?: number | null;
    barRemnantIn?: number | null;
  }>;
  finishingOps: ReadonlyArray<{ id: string; name: string; outsideService: boolean }>;
}

export interface TravelerLineInput {
  id: string;
  partNumber: string;
  revision: string | null;
  description: string | null;
  inputs: CostInputs;
}

export interface TravelerOperation {
  /** 10, 20, 30 ... in the order the estimate lists them (room to insert an operation by hand). */
  sequence: number;
  machine: string;
  label: string;
  setupMinutes: number;
  /** Null when the estimate never had a cycle time. */
  cycleMinutesPerPart: number | null;
  /** Cycle time × parts started; null when the cycle time is blank. */
  runMinutes: number | null;
}

export interface TravelerFinishing {
  sequence: number;
  name: string;
  outsideService: boolean;
}

export interface TravelerLine {
  lineId: string;
  partNumber: string;
  revision: string | null;
  description: string | null;
  quantity: number;
  starts: number;
  falloutPercent: number | null;
  material: {
    customerSupplied: boolean;
    name: string | null;
    stockDescription: string | null;
    blank: string | null;
    partsPerStock: number | null;
    /** Pieces of stock to pull for the parts started; null when parts per piece is not set. */
    stockPieces: number | null;
    /** "bar" for per-foot stock bought in fixed bars, "piece" otherwise. */
    stockUnit: "piece" | "bar";
    /**
     * Per-foot stock: "Cut 53 blanks at 3" (13.25 ft)", the blank length plus the rate card's cut
     * allowance. Null for other materials or a blank with no length.
     */
    cutList: string | null;
  };
  operations: TravelerOperation[];
  finishing: TravelerFinishing[];
  /** Setup plus run for every operation; null when any cycle time is blank. */
  totalMinutes: number | null;
  /** Things the floor should know are missing from the estimate. */
  notes: string[];
}

export const GONE = "(no longer on the rate card)";

const fmtIn = (n: number) => `${Number(n.toFixed(4))}"`;

/** "2.5" x 1" x 0.75" bar", "1.25" dia x 3" round", "4.2 lb". */
export function blankText(blank: Blank | null): string | null {
  if (!blank) return null;
  switch (blank.shape) {
    case "rect":
      return `${fmtIn(blank.lengthIn)} x ${fmtIn(blank.widthIn)} x ${fmtIn(blank.thicknessIn)}`;
    case "round":
      return `${fmtIn(blank.diameterIn)} dia x ${fmtIn(blank.lengthIn)}`;
    case "weight":
      return `${Number(blank.weightLb.toFixed(3))} lb`;
  }
}

/**
 * The quantity to make for a line: the one asked for, else the line's only quantity break. A line
 * quoted at several breaks needs the quantity on the purchase order; null means it was not given.
 */
export function orderQuantity(inputs: CostInputs, asked: number | undefined): number | null {
  if (asked !== undefined) return asked;
  return inputs.quantities.length === 1 ? (inputs.quantities[0] ?? null) : null;
}

/**
 * Which lines go on the traveler and at what quantity. In order: the quantity asked for; else, when
 * the customer accepted online, the break they picked (a part they did not order is left off, unless
 * a quantity is asked for it); else the line's only break. `missing` lists the part numbers that still
 * need the quantity on the PO.
 */
export function planQuantities<L extends { id: string; partNumber: string; inputs: CostInputs }>(
  lines: readonly L[],
  asked: Readonly<Record<string, number>>,
  accepted: ReadonlyArray<{ lineId: string; quantity: number }> | null,
): { plan: { line: L; quantity: number }[]; leftOff: string[]; missing: string[] } {
  const plan: { line: L; quantity: number }[] = [];
  const leftOff: string[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    const own = asked[line.id];
    if (own !== undefined) {
      plan.push({ line, quantity: own });
      continue;
    }
    if (accepted) {
      const choice = accepted.find((c) => c.lineId === line.id);
      if (choice) plan.push({ line, quantity: choice.quantity });
      else leftOff.push(line.partNumber);
      continue;
    }
    const q = orderQuantity(line.inputs, undefined);
    if (q === null) missing.push(line.partNumber);
    else plan.push({ line, quantity: q });
  }
  return { plan, leftOff, missing };
}

export function isValidOrderQuantity(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITY;
}

export function travelerLine(
  line: TravelerLineInput,
  quantity: number,
  names: TravelerNames,
): TravelerLine {
  const inputs = line.inputs;
  const starts = startsFor(quantity, inputs.falloutBps);
  const notes: string[] = [];

  const mat = inputs.material;
  const matRow = mat ? names.materials.find((m) => m.id === mat.materialId) : undefined;
  const length = mat?.blank ? blankLengthIn(mat.blank) : null;
  const bar =
    matRow?.pricingBasis === "per_ft" && length !== null ? barStockUse(matRow, length) : null;
  const partsPerStock = bar ? bar.partsPerBar || null : (mat?.partsPerStock ?? null);
  const material: TravelerLine["material"] = {
    customerSupplied: inputs.customerSuppliedMaterial,
    name: mat ? (matRow?.name ?? GONE) : null,
    stockDescription: matRow?.stockDescription ?? null,
    blank: blankText(mat?.blank ?? null),
    partsPerStock,
    stockPieces: partsPerStock ? Math.ceil(starts / partsPerStock) : null,
    stockUnit: bar?.partsPerBar ? "bar" : "piece",
    cutList: bar
      ? `Cut ${starts} blank${starts === 1 ? "" : "s"} at ${fmtIn(bar.cutLengthIn)} (${Number(
          ((starts * bar.cutLengthIn) / 12).toFixed(2),
        )} ft)`
      : null,
  };
  if (!mat && !inputs.customerSuppliedMaterial) notes.push("No material on the estimate.");

  let sequence = 0;
  let total: number | null = 0;
  const operations = inputs.operations.map((op): TravelerOperation => {
    sequence += 10;
    const runMinutes = op.cycleMinutesPerPart === null ? null : op.cycleMinutesPerPart * starts;
    if (runMinutes === null) {
      total = null;
      notes.push(`Op ${sequence}: no cycle time on the estimate.`);
    } else if (total !== null) {
      total += op.setupMinutes + runMinutes;
    }
    return {
      sequence,
      machine: names.machines.find((m) => m.id === op.machineId)?.name ?? GONE,
      label: op.label,
      setupMinutes: op.setupMinutes,
      cycleMinutesPerPart: op.cycleMinutesPerPart,
      runMinutes,
    };
  });
  if (operations.length === 0) notes.push("No operations on the estimate.");

  const finishing = inputs.finishing.map((f): TravelerFinishing => {
    sequence += 10;
    const row = names.finishingOps.find((o) => o.id === f.opId);
    return { sequence, name: row?.name ?? GONE, outsideService: row?.outsideService ?? false };
  });

  const fallout = inputs.falloutBps ? inputs.falloutBps / 100 : null;
  return {
    lineId: line.id,
    partNumber: line.partNumber,
    revision: line.revision,
    description: line.description,
    quantity,
    starts,
    falloutPercent: fallout,
    material,
    operations,
    finishing,
    totalMinutes: operations.length === 0 ? null : total,
    notes,
  };
}

/** Merge a line's snapshot names over today's rate card (the snapshot is what the price used). */
export function mergeNames(snapshot: TravelerNames | null, current: TravelerNames): TravelerNames {
  if (!snapshot) return current;
  const merge = <T extends { id: string }>(a: readonly T[], b: readonly T[]): T[] => [
    ...a,
    ...b.filter((x) => !a.some((y) => y.id === x.id)),
  ];
  return {
    machines: merge(snapshot.machines, current.machines),
    materials: merge(snapshot.materials, current.materials),
    finishingOps: merge(snapshot.finishingOps, current.finishingOps),
  };
}

/** "45 min", "2 h 05 min" (rounded to the minute). */
export function minutesText(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
