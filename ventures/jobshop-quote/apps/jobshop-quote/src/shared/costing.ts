// Deterministic costing engine. Pure functions, no I/O: the same inputs and rate card always give
// the same price. Prices come ONLY from the shop's own rate card and the estimator's inputs; the LLM
// never produces a number that ends up here (see docs/ARCHITECTURE.md, "No invented prices").
//
// Model, per quantity break q (the parts shipped):
//   starts    = ceil(q / (1 − fallout%)): parts started so q good ones ship (fallout 0: starts = q)
//   material  = per_lb:    blank weight (lb) × starts × $/lb × (1 + scrap%), at least the material minimum
//               per_stock: ceil(starts / parts per stock) × $/stock piece, at least the material minimum
//   setup     = Σ ops  setup minutes / 60 × setup rate (machine hourly rate unless a setup rate is set)
//   run       = Σ ops  cycle minutes per part / 60 × hourly rate × starts
//   finishing = Σ ops  max(per-part charge × starts, lot charge)
//   extras    = Σ      per-part × q + per-lot (hardware, certs, crating go on the parts shipped)
//   markup    = material × material markup% + (setup + run) × labor markup%
//               + finishing × outside-service markup% (in-house finishing: labor markup%)
//               + extras × material markup% (extras are purchased items: hardware, certs, crating)
//   price     = max(cost + markup, line minimum); unit price = ceil(price / q); total = unit × q
// All money is integer cents (minor units) of the shop's currency (shared/currency.ts). Each component
// is rounded to the cent once, then summed.
import { z } from "zod";
import { formatMoney } from "./currency";
import type { MaterialPricing } from "./enums";
import { exactMoneyText, footPriceCents, lbPriceCents } from "./material-price";

export const MAX_QUANTITY_BREAKS = 8;
export const MAX_QUANTITY = 1_000_000;
/** Fallout above 50% means starting more than twice the order: a process to fix, not to quote. */
export const MAX_FALLOUT_BPS = 5_000;

// ---- Rate card (the shop's own numbers) ----

export interface RateMachine {
  id: string;
  name: string;
  hourlyRateCents: number;
  /** Null: setups bill at the hourly rate. */
  setupRateCents: number | null;
}

export interface RateMaterial {
  id: string;
  name: string;
  pricingBasis: MaterialPricing;
  /** per_lb only. */
  pricePerLbCents: number | null;
  /** per_lb only: lb per cubic inch (6061 aluminum ≈ 0.0975, 1018 steel ≈ 0.284). */
  densityLbPerIn3: number | null;
  /** per_stock only: price of one stock piece. */
  stockPriceCents: number | null;
  stockDescription: string | null;
  /**
   * per_ft only (bar, tube, extrusion bought by length): price of one foot. Absent on rows and
   * rate snapshots saved before per-foot pricing existed.
   */
  pricePerFootCents?: number | null;
  /**
   * The supplier's unit kept exactly: per_lb priced per hundredweight (100 lb, pricePerLbCents
   * null) and per_ft priced per metre (pricePerFootCents null). Absent on older rows and snapshots.
   */
  pricePerCwtCents?: number | null;
  pricePerMetreCents?: number | null;
  /** per_ft only: saw kerf and facing added to each part's blank length, inches. */
  cutAllowanceIn?: number | null;
  /**
   * per_ft only: the length the shop buys the stock in (a 144 in bar), inches. Set, material is
   * priced in whole bars; null, by the foot actually used plus scrap.
   */
  barLengthIn?: number | null;
  /** per_ft with a bar length: the end of each bar that cannot become parts (chuck or feeder drop). */
  barRemnantIn?: number | null;
  /**
   * Saw kerf, facing and drop, in basis points of the blank weight (per_lb) or of the length used
   * (per_ft without a bar length; with one, the drop is in the whole-bar count).
   */
  scrapBps: number;
  /** Smallest material charge per line (supplier minimums, cut charges). */
  minChargeCents: number;
}

export interface RateFinishingOp {
  id: string;
  name: string;
  perPartCents: number;
  /** Lot minimum: the vendor's or the department's minimum charge per batch. */
  lotChargeCents: number;
  /** Sent out to a vendor (anodize, plating, heat treat): marked up at the outside-service rate. */
  outsideService: boolean;
}

export interface RateSettings {
  /** Markup on shop labor (setup + run), basis points: 2500 = 25%. */
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  /** Smallest price for one line at any quantity. */
  minimumLineCents: number;
}

export interface RateCard extends RateSettings {
  /** ISO 4217 code the basis lines print amounts in (shared/currency.ts); absent or null is USD. */
  currency?: string | null;
  machines: RateMachine[];
  materials: RateMaterial[];
  finishingOps: RateFinishingOp[];
}

// ---- Estimator inputs (one quote line) ----

const inches = z.number().positive().max(10_000);

export const blankSchema = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("rect"), lengthIn: inches, widthIn: inches, thicknessIn: inches }),
  z.object({ shape: z.literal("round"), diameterIn: inches, lengthIn: inches }),
  z.object({ shape: z.literal("weight"), weightLb: z.number().positive().max(100_000) }),
]);
export type Blank = z.infer<typeof blankSchema>;

const cents = z.number().int().min(0).max(1_000_000_000);
const minutes = z.number().min(0).max(100_000);

export const costInputsSchema = z.object({
  quantities: z.array(z.number().int().min(1).max(MAX_QUANTITY)).min(1).max(MAX_QUANTITY_BREAKS),
  /**
   * The shop's material. Null is allowed only with `customerSuppliedMaterial: true`, so a line where
   * nobody chose a material can never price as if material were free.
   */
  customerSuppliedMaterial: z.boolean().default(false),
  material: z
    .object({
      materialId: z.string().min(1),
      blank: blankSchema.nullable().default(null),
      partsPerStock: z.number().int().min(1).max(100_000).nullable().default(null),
    })
    .nullable(),
  operations: z
    .array(
      z.object({
        machineId: z.string().min(1),
        label: z.string().max(120).default(""),
        setupMinutes: minutes,
        /**
         * Null: not entered yet. Pricing is blocked until the estimator types a time (0 is allowed
         * for a setup-only operation such as programming or first-article inspection).
         */
        cycleMinutesPerPart: minutes.nullable(),
      }),
    )
    .max(30)
    .default([]),
  /**
   * Expected fallout (scrap parts) in basis points of the parts started: 300 = 3%. Machine time,
   * per-part finishing and material are priced on the starts needed to ship each quantity good.
   * Separate from a material's scrapBps, which is kerf, facing and drop on the blank weight.
   */
  falloutBps: z.number().int().min(0).max(MAX_FALLOUT_BPS).optional(),
  finishing: z
    .array(z.object({ opId: z.string().min(1) }))
    .max(20)
    .default([]),
  extras: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        perPartCents: cents.default(0),
        lotCents: cents.default(0),
      }),
    )
    .max(20)
    .default([]),
});
export type CostInputs = z.infer<typeof costInputsSchema>;

/** Inputs for a new line before the estimator has filled anything in. */
export const emptyCostInputs = (quantities: number[] = [1]): CostInputs => ({
  quantities,
  customerSuppliedMaterial: false,
  material: null,
  operations: [],
  finishing: [],
  extras: [],
});

/** "cycle 4.5 min/part", or "cycle not entered" for an operation whose time is still blank. */
export const cycleText = (cycleMinutesPerPart: number | null) =>
  cycleMinutesPerPart === null ? "cycle not entered" : `cycle ${cycleMinutesPerPart} min/part`;

/**
 * The quote editor's "Fallout %" box: "" is none (undefined), "3" or "2.5%" is 300 or 250 bps.
 * "invalid" for anything else, or above MAX_FALLOUT_BPS, so the line keeps its last good value.
 */
export function falloutBpsFromText(text: string): number | undefined | "invalid" {
  const t = text.trim().replace(/%$/, "").trim();
  if (t === "") return undefined;
  if (!/^\d+(\.\d+)?$/.test(t)) return "invalid";
  const bps = Math.round(Number(t) * 100);
  return bps <= MAX_FALLOUT_BPS ? bps : "invalid";
}

/** Parts to start so `quantity` good parts ship at `falloutBps` expected fallout. */
export function startsFor(quantity: number, falloutBps: number | undefined): number {
  if (!falloutBps || falloutBps <= 0) return quantity;
  // Integer arithmetic: q × 10000 / (10000 − fallout), rounded up, with no float error at exact hits.
  return Math.ceil((quantity * 10_000) / (10_000 - falloutBps) - 1e-9);
}

// ---- Output ----

export interface CostBreak {
  quantity: number;
  /**
   * Parts started to ship `quantity` good ones. Absent on breaks priced before fallout existed and
   * equal to quantity with no fallout.
   */
  starts?: number;
  materialCents: number;
  setupCents: number;
  runCents: number;
  finishingCents: number;
  extrasCents: number;
  costCents: number;
  markupCents: number;
  /** Added to reach the line minimum (0 when the price already exceeds it). */
  minimumAdjustmentCents: number;
  unitPriceCents: number;
  totalCents: number;
}

/** The rate-card rows a result used, copied so a saved quote never changes when rates do. */
export interface RateSnapshot extends RateSettings {
  machines: RateMachine[];
  materials: RateMaterial[];
  finishingOps: RateFinishingOp[];
}

export interface CostResult {
  breaks: CostBreak[];
  /** Human-readable basis of every component (deterministic; shown on the quote and to the LLM). */
  basis: string[];
  /** Blank weight per part in lb (per_lb materials), for display. */
  blankWeightLb: number | null;
  snapshot: RateSnapshot;
}

export type CostIssueCode =
  | "unknown_material"
  | "unknown_machine"
  | "unknown_finishing_op"
  | "material_needs_blank"
  | "material_needs_density"
  | "material_needs_price"
  | "material_needs_parts_per_stock"
  | "material_needs_length"
  | "material_bar_too_short"
  | "duplicate_quantity"
  | "material_not_chosen"
  | "no_operations"
  | "operation_needs_cycle_time"
  | "operation_has_no_time";

export interface CostIssue {
  code: CostIssueCode;
  message: string;
}

export type CostOutcome = { ok: true; result: CostResult } | { ok: false; issues: CostIssue[] };

// ---- Geometry helpers ----

/** Blank volume in cubic inches (null for a weight-only blank). */
export function blankVolumeIn3(blank: Blank): number | null {
  switch (blank.shape) {
    case "rect":
      return blank.lengthIn * blank.widthIn * blank.thicknessIn;
    case "round":
      return Math.PI * (blank.diameterIn / 2) ** 2 * blank.lengthIn;
    case "weight":
      return null;
  }
}

export function blankWeightLb(blank: Blank, densityLbPerIn3: number | null): number | null {
  if (blank.shape === "weight") return blank.weightLb;
  const volume = blankVolumeIn3(blank);
  if (volume === null || densityLbPerIn3 === null) return null;
  return volume * densityLbPerIn3;
}

/** The blank's length in inches (rect and round blanks), or null for a weight-only blank. */
export function blankLengthIn(blank: Blank): number | null {
  return blank.shape === "weight" ? null : blank.lengthIn;
}

export interface BarStockUse {
  /** Blank length plus the row's cut allowance: what one part takes off the bar, inches. */
  cutLengthIn: number;
  /** Whole parts one bar yields after its remnant; null when the row has no bar length. */
  partsPerBar: number | null;
}

/**
 * How a per-foot material is used by one part: the length cut per part and, when the shop buys the
 * stock in fixed bars, how many parts one bar yields (floor of the usable length over the cut
 * length; 0 when a part is longer than the usable bar). Pure; no rate is assumed.
 */
export function barStockUse(
  material: Pick<RateMaterial, "cutAllowanceIn" | "barLengthIn" | "barRemnantIn">,
  blankLength: number,
): BarStockUse {
  const cutLengthIn = blankLength + Math.max(0, material.cutAllowanceIn ?? 0);
  const bar = material.barLengthIn ?? null;
  if (bar === null || bar <= 0) return { cutLengthIn, partsPerBar: null };
  const usable = bar - Math.max(0, material.barRemnantIn ?? 0);
  // A tolerance so 144 in of bar exactly yields 48 parts of 3 in, not 47 from float error.
  const partsPerBar = usable <= 0 ? 0 : Math.floor(usable / cutLengthIn + 1e-9);
  return { cutLengthIn, partsPerBar };
}

// ---- Engine ----

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;
const fmt = (n: number, digits = 3) => Number(n.toFixed(digits)).toString();

export function computeCost(rateCard: RateCard, rawInputs: CostInputs): CostOutcome {
  const inputs = costInputsSchema.parse(rawInputs);
  const money = (c: number) => formatMoney(c, rateCard.currency, { grouping: false });
  const issues: CostIssue[] = [];
  const basis: string[] = [];

  if (new Set(inputs.quantities).size !== inputs.quantities.length) {
    issues.push({ code: "duplicate_quantity", message: "Each quantity break must be different" });
  }

  if (!inputs.material && !inputs.customerSuppliedMaterial) {
    issues.push({
      code: "material_not_chosen",
      message: "Choose a rate-card material or mark the material customer-supplied",
    });
  }
  if (inputs.operations.length === 0) {
    issues.push({ code: "no_operations", message: "Add at least one machine operation" });
  }

  // Resolve every referenced rate. Anything missing is an issue, never a guessed price.
  const material = inputs.material
    ? rateCard.materials.find((m) => m.id === inputs.material?.materialId)
    : null;
  if (inputs.material && !material) {
    issues.push({ code: "unknown_material", message: "Material is not on the rate card" });
  }
  const ops = inputs.operations.map((op) => ({
    op,
    machine: rateCard.machines.find((m) => m.id === op.machineId),
  }));
  ops.forEach(({ op, machine }, i) => {
    const name = op.label || machine?.name || op.machineId;
    if (!machine) {
      issues.push({
        code: "unknown_machine",
        message: `Machine for operation "${op.label || op.machineId}" is not on the rate card`,
      });
    }
    // An unfilled time must never price as free machine time (docs/ARCHITECTURE.md, rule 2).
    if (op.cycleMinutesPerPart === null) {
      issues.push({
        code: "operation_needs_cycle_time",
        message: `Enter the cycle minutes per part for operation ${i + 1} (${name}); 0 for a setup-only operation`,
      });
    } else if (op.setupMinutes === 0 && op.cycleMinutesPerPart === 0) {
      issues.push({
        code: "operation_has_no_time",
        message: `Operation ${i + 1} (${name}) has no setup and no cycle time; enter one or remove it`,
      });
    }
  });
  const finishing = inputs.finishing.map((f) => ({
    f,
    rate: rateCard.finishingOps.find((o) => o.id === f.opId),
  }));
  for (const { f, rate } of finishing) {
    if (!rate) {
      issues.push({
        code: "unknown_finishing_op",
        message: `Finishing operation ${f.opId} is not on the rate card`,
      });
    }
  }

  let weightLb: number | null = null;
  let barUse: BarStockUse | null = null;
  if (material && inputs.material) {
    if (material.pricingBasis === "per_lb") {
      if (lbPriceCents(material) === null) {
        issues.push({ code: "material_needs_price", message: `${material.name} has no $/lb` });
      }
      const blank = inputs.material.blank;
      if (!blank) {
        issues.push({
          code: "material_needs_blank",
          message: `Enter blank size or weight for ${material.name}`,
        });
      } else {
        weightLb = blankWeightLb(blank, material.densityLbPerIn3);
        if (weightLb === null) {
          issues.push({
            code: "material_needs_density",
            message: `${material.name} has no density; enter the blank weight instead`,
          });
        }
      }
    } else if (material.pricingBasis === "per_ft") {
      if (footPriceCents(material) === null) {
        issues.push({
          code: "material_needs_price",
          message: `${material.name} has no price per foot`,
        });
      }
      const blank = inputs.material.blank;
      const length = blank ? blankLengthIn(blank) : null;
      if (length === null) {
        issues.push({
          code: "material_needs_length",
          message: `${material.name} is priced by the foot: enter the blank's length (a weight alone cannot be priced by length)`,
        });
      } else {
        barUse = barStockUse(material, length);
        if (barUse.partsPerBar === 0) {
          issues.push({
            code: "material_bar_too_short",
            message: `A ${fmt(barUse.cutLengthIn)} in cut does not fit the usable length of one ${fmt(
              material.barLengthIn ?? 0,
            )} in bar of ${material.name}${
              material.barRemnantIn ? ` (${fmt(material.barRemnantIn)} in remnant)` : ""
            }; shorten the blank or change the bar length on the rate card`,
          });
        }
      }
    } else {
      if (material.stockPriceCents === null) {
        issues.push({
          code: "material_needs_price",
          message: `${material.name} has no stock price`,
        });
      }
      if (!inputs.material.partsPerStock) {
        issues.push({
          code: "material_needs_parts_per_stock",
          message: `Enter how many parts one stock piece of ${material.name} yields`,
        });
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  // Basis lines (quantity-independent rates).
  if (material && inputs.material) {
    if (material.pricingBasis === "per_lb" && weightLb !== null) {
      basis.push(
        `Material: ${material.name}, ${fmt(weightLb)} lb per part at ${perLbText(
          material,
          rateCard.currency,
        )} plus ${fmt(material.scrapBps / 100, 2)}% scrap` +
          (material.minChargeCents > 0 ? `, minimum ${money(material.minChargeCents)}` : ""),
      );
    } else if (material.pricingBasis === "per_ft" && barUse) {
      const blank = inputs.material.blank;
      const length = blank ? (blankLengthIn(blank) ?? 0) : 0;
      const allowance = material.cutAllowanceIn ?? 0;
      const perFoot = perFootText(material, rateCard.currency);
      const cut =
        allowance > 0
          ? `${fmt(length)} in blank + ${fmt(allowance)} in cut allowance = ${fmt(barUse.cutLengthIn)} in per part`
          : `${fmt(barUse.cutLengthIn)} in per part`;
      basis.push(
        `Material: ${material.name}${
          material.stockDescription ? ` (${material.stockDescription})` : ""
        }, ${cut} at ${perFoot}` +
          (barUse.partsPerBar !== null
            ? `, bought in ${fmt(material.barLengthIn ?? 0)} in bars${
                material.barRemnantIn ? ` (${fmt(material.barRemnantIn)} in remnant)` : ""
              }: ${barUse.partsPerBar} parts per bar, whole bars charged`
            : material.scrapBps > 0
              ? ` plus ${fmt(material.scrapBps / 100, 2)}% scrap`
              : "") +
          (material.minChargeCents > 0 ? `, minimum ${money(material.minChargeCents)}` : ""),
      );
    } else {
      basis.push(
        `Material: ${material.name}${
          material.stockDescription ? ` (${material.stockDescription})` : ""
        } at ${money(material.stockPriceCents ?? 0)} per stock piece, ${
          inputs.material.partsPerStock
        } parts per piece` +
          (material.minChargeCents > 0 ? `, minimum ${money(material.minChargeCents)}` : ""),
      );
    }
  } else {
    basis.push("Material: customer-supplied");
  }
  for (const { op, machine } of ops) {
    if (!machine) continue;
    const setupRate = machine.setupRateCents ?? machine.hourlyRateCents;
    basis.push(
      `${op.label || machine.name} on ${machine.name}: ${fmt(op.setupMinutes, 1)} min setup at ${money(
        setupRate,
      )}/h, ${fmt(op.cycleMinutesPerPart ?? 0, 2)} min per part at ${money(machine.hourlyRateCents)}/h`,
    );
  }
  for (const { rate } of finishing) {
    if (!rate) continue;
    basis.push(
      `${rate.name}${rate.outsideService ? " (outside service)" : ""}: ${money(
        rate.perPartCents,
      )} per part, lot minimum ${money(rate.lotChargeCents)}`,
    );
  }
  for (const extra of inputs.extras) {
    basis.push(
      `${extra.label}: ${money(extra.perPartCents)} per part + ${money(extra.lotCents)} per lot`,
    );
  }
  const falloutBps = inputs.falloutBps ?? 0;
  if (falloutBps > 0) {
    basis.push(
      `Fallout: ${fmt(falloutBps / 100, 2)}% expected, so machine time, per-part finishing and material are priced on the parts started (ceil(quantity / ${fmt(
        1 - falloutBps / 10_000,
        4,
      )}))`,
    );
  }
  basis.push(
    `Markup: labor ${fmt(rateCard.laborMarkupBps / 100, 2)}%, material ${fmt(
      rateCard.materialMarkupBps / 100,
      2,
    )}%, outside services ${fmt(rateCard.outsideServiceMarkupBps / 100, 2)}%` +
      (rateCard.minimumLineCents > 0 ? `; line minimum ${money(rateCard.minimumLineCents)}` : ""),
  );

  const breaks: CostBreak[] = inputs.quantities.map((q) => {
    const starts = startsFor(q, falloutBps);
    let materialCents = 0;
    if (material && inputs.material) {
      const perFoot = footPriceCents(material) ?? 0;
      const raw =
        material.pricingBasis === "per_lb"
          ? (weightLb ?? 0) * starts * (lbPriceCents(material) ?? 0) * (1 + pct(material.scrapBps))
          : material.pricingBasis === "per_ft"
            ? barUse?.partsPerBar
              ? Math.ceil(starts / barUse.partsPerBar) *
                ((material.barLengthIn ?? 0) / 12) *
                perFoot
              : starts * ((barUse?.cutLengthIn ?? 0) / 12) * perFoot * (1 + pct(material.scrapBps))
            : Math.ceil(starts / (inputs.material.partsPerStock ?? 1)) *
              (material.stockPriceCents ?? 0);
      materialCents = Math.max(roundCents(raw), material.minChargeCents);
    }
    let setupCents = 0;
    let runCents = 0;
    for (const { op, machine } of ops) {
      if (!machine) continue;
      setupCents += roundCents(
        (op.setupMinutes / 60) * (machine.setupRateCents ?? machine.hourlyRateCents),
      );
      runCents += roundCents(
        ((op.cycleMinutesPerPart ?? 0) / 60) * machine.hourlyRateCents * starts,
      );
    }
    let outsideCents = 0;
    let inHouseFinishCents = 0;
    for (const { rate } of finishing) {
      if (!rate) continue;
      const c = Math.max(rate.perPartCents * starts, rate.lotChargeCents);
      if (rate.outsideService) outsideCents += c;
      else inHouseFinishCents += c;
    }
    const finishingCents = outsideCents + inHouseFinishCents;
    const extrasCents = inputs.extras.reduce((s, e) => s + e.perPartCents * q + e.lotCents, 0);

    const costCents = materialCents + setupCents + runCents + finishingCents + extrasCents;
    const markupCents =
      roundCents(materialCents * pct(rateCard.materialMarkupBps)) +
      roundCents((setupCents + runCents + inHouseFinishCents) * pct(rateCard.laborMarkupBps)) +
      roundCents(outsideCents * pct(rateCard.outsideServiceMarkupBps)) +
      roundCents(extrasCents * pct(rateCard.materialMarkupBps));
    const priced = costCents + markupCents;
    const minimumAdjustmentCents = Math.max(0, rateCard.minimumLineCents - priced);
    const unitPriceCents = Math.ceil((priced + minimumAdjustmentCents) / q);
    return {
      quantity: q,
      starts,
      materialCents,
      setupCents,
      runCents,
      finishingCents,
      extrasCents,
      costCents,
      markupCents,
      minimumAdjustmentCents,
      unitPriceCents,
      totalCents: unitPriceCents * q,
    };
  });

  const snapshot: RateSnapshot = {
    laborMarkupBps: rateCard.laborMarkupBps,
    materialMarkupBps: rateCard.materialMarkupBps,
    outsideServiceMarkupBps: rateCard.outsideServiceMarkupBps,
    minimumLineCents: rateCard.minimumLineCents,
    machines: dedupe(ops.flatMap(({ machine }) => (machine ? [machine] : []))),
    materials: material ? [material] : [],
    finishingOps: dedupe(finishing.flatMap(({ rate }) => (rate ? [rate] : []))),
  };

  return { ok: true, result: { breaks, basis, blankWeightLb: weightLb, snapshot } };
}

function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const i of items) seen.set(i.id, i);
  return [...seen.values()];
}

// ---- Estimating aids (suggestions only; the estimator decides) ----

/**
 * A rectangular blank from a part's bounding box plus a per-side stock allowance, rounded up to the
 * next 1/8 in. Used when CAD geometry is available (packages/cad-features via ports/geometry.ts).
 */
export function blankFromBoundingBox(
  bbox: { xIn: number; yIn: number; zIn: number },
  allowancePerSideIn = 0.125,
): Blank {
  const up = (v: number) => Math.ceil((v + 2 * allowancePerSideIn) * 8 - 1e-9) / 8;
  const [thicknessIn, widthIn, lengthIn] = [bbox.xIn, bbox.yIn, bbox.zIn]
    .map(up)
    .sort((a, b) => a - b) as [number, number, number];
  return { shape: "rect", lengthIn, widthIn, thicknessIn };
}

/**
 * Rough-cut minutes per part from the volume removed and a machine's material removal rate
 * (in³/min the shop measured for that machine and material). Null when either is unknown.
 */
export function suggestCycleMinutes(
  blankVolume: number | null,
  partVolume: number | null,
  removalRateIn3PerMin: number | null,
): number | null {
  if (blankVolume === null || partVolume === null || !removalRateIn3PerMin) return null;
  const removed = Math.max(0, blankVolume - partVolume);
  return Math.round((removed / removalRateIn3PerMin) * 10) / 10;
}

export interface RoughingMachine {
  id: string;
  name: string;
  defaultSetupMinutes: number;
  removalRateIn3PerMin: number | null;
}

/** A roughing machine's removal rate in one material row (rate card "Removal rates by material"). */
export interface MaterialRemovalRate {
  machineId: string;
  materialId: string;
  removalRateIn3PerMin: number;
}

/**
 * A suggested roughing operation from CAD: the volume a blank loses to become the part, at the
 * removal rate the shop measured. Only when the part volume was measured with better than low
 * confidence and the result is positive. The label says where the number came from.
 *
 * Which rate: removal rate depends on the material (aluminum roughs several times faster than
 * steel). When the shop has entered rates for the line's material, the active machines with a rate
 * for it are the candidates and that rate is used; otherwise the machines' single default rate is.
 * Either way exactly one candidate must remain (with several, which one runs the job is the
 * estimator's call).
 */
export function suggestRoughingOperation(
  part: { volumeIn3: number | null; volumeConfidence: "high" | "medium" | "low" | null },
  blank: Blank | null,
  machines: RoughingMachine[],
  material: CutMaterial | null = null,
  rates: readonly MaterialRemovalRate[] = [],
): CostInputs["operations"][number] | null {
  if (!blank || part.volumeIn3 === null || part.volumeConfidence === "low") return null;
  const forMaterial = material
    ? rates.filter(
        (r) =>
          r.materialId === material.id &&
          r.removalRateIn3PerMin > 0 &&
          machines.some((m) => m.id === r.machineId),
      )
    : [];
  let machine: RoughingMachine | null;
  let rate: number;
  let source = "";
  if (forMaterial.length > 0) {
    const row = onlyOne(forMaterial);
    if (!row) return null;
    machine = machines.find((m) => m.id === row.machineId) ?? null;
    if (!machine) return null;
    rate = row.removalRateIn3PerMin;
    source = ` (rate for ${material?.name ?? "this material"})`;
  } else {
    machine = onlyOne(machines.filter((m) => (m.removalRateIn3PerMin ?? 0) > 0));
    if (!machine) return null;
    rate = machine.removalRateIn3PerMin ?? 0;
  }
  const stock = blankVolumeIn3(blank);
  const minutesPerPart = suggestCycleMinutes(stock, part.volumeIn3, rate);
  if (minutesPerPart === null || minutesPerPart <= 0 || stock === null) return null;
  const removed = Math.max(0, stock - part.volumeIn3);
  return {
    machineId: machine.id,
    label: `Rough from CAD: ${fmt(removed, 2)} in³ removed at ${fmt(rate, 2)} in³/min${source}`,
    setupMinutes: machine.defaultSetupMinutes,
    cycleMinutesPerPart: Math.min(100_000, minutesPerPart),
  };
}

// ---- Sheet-metal suggestions from a DXF flat pattern ----

/** What a DXF flat pattern gives the sheet blank (inches; GeometryFeatures.flat.blankIn). */
export interface FlatBlankMeasures {
  widthIn: number;
  heightIn: number;
  /** The parser's bounding-box confidence (units included); null on rows stored without one. */
  confidence: "high" | "medium" | "low" | null;
}

/**
 * A rectangular sheet blank from a flat pattern's overall size and the sheet thickness the shop put
 * on the chosen material's rate row, length and width rounded up to the next 1/8 in. No nesting
 * margin is added: the skeleton and kerf a nest wastes belong in the material's scrap %. Null when
 * the material has no sheet thickness, the size is not positive or the parser marked it low.
 */
export function blankFromFlatPattern(
  flat: FlatBlankMeasures,
  sheetThicknessIn: number | null,
): Blank | null {
  if (sheetThicknessIn === null || !(sheetThicknessIn > 0)) return null;
  if (!(flat.widthIn > 0 && flat.heightIn > 0)) return null;
  if (flat.confidence === "low") return null;
  const up = (v: number) => Math.ceil(v * 8 - 1e-9) / 8;
  const [widthIn, lengthIn] = [up(flat.widthIn), up(flat.heightIn)].sort((a, b) => a - b) as [
    number,
    number,
  ];
  return { shape: "rect", lengthIn, widthIn, thicknessIn: sheetThicknessIn };
}

/** A machine's sheet-metal rates as the shop entered them on the rate card (null: not measured). */
export interface SheetMetalMachine {
  id: string;
  name: string;
  defaultSetupMinutes: number;
  cutSpeedInPerMin: number | null;
  pierceSeconds: number | null;
  secondsPerBend: number | null;
}

/** What a DXF flat pattern gives the sheet-metal suggestions (inches; from GeometryFeatures.flat). */
export interface FlatPatternMeasures {
  cutLengthIn: number;
  pierceCount: number;
  bendLineCount: number;
  /** The parser's confidence in the outline and cut length (GeometryFeatures.confidence.volume). */
  measuresConfidence: "high" | "medium" | "low" | null;
  /** Confidence in the hole count, which is the pierce count less the outline. */
  holesConfidence: "high" | "medium" | "low" | null;
  /** Confidence in the bend lines; null on rows stored before bends carried one. */
  bendsConfidence: "high" | "medium" | "low" | null;
}

/** Minutes, rounded UP to the hundredth: a cut part's cycle is short, and rounding must not lose it. */
const upToHundredth = (min: number) => Math.ceil(min * 100 - 1e-9) / 100;

const onlyOne = <T>(rows: T[]): T | null => (rows.length === 1 ? (rows[0] as T) : null);

/** A cutting machine's speed on one material row (rate card "Cut speeds by material"). */
export interface MaterialCutSpeed {
  machineId: string;
  materialId: string;
  cutSpeedInPerMin: number;
  /** Null: the machine's own pierce time. */
  pierceSeconds: number | null;
}

/** The quote line's material as the cutting suggestion names it (null: none chosen). */
export interface CutMaterial {
  id: string;
  name: string;
}

/**
 * A suggested cutting operation (laser, waterjet, plasma, router) from a flat pattern: the cut path
 * at the shop's cut speed plus one pierce per closed contour at the shop's pierce time. Only when
 * the outline and holes were measured with better than low confidence and the cut length is
 * positive.
 *
 * Which speed: cut speed depends on material and thickness, which a DXF does not carry. When the
 * shop has entered speeds for the line's material (a material row is one alloy at one sheet
 * thickness), the machines with a speed for it are the candidates and that speed (and its pierce
 * time, else the machine's) is used. Otherwise the machines' single default speed is used. Either
 * way exactly one candidate must remain among the active machines given (with several, which one
 * runs the job is the estimator's call). A machine without a pierce time cuts without one, and the
 * label names the speed used, and the material it was entered for, so the estimator can check it.
 */
export function suggestCuttingOperation(
  flat: FlatPatternMeasures,
  machines: SheetMetalMachine[],
  material: CutMaterial | null = null,
  speeds: readonly MaterialCutSpeed[] = [],
): CostInputs["operations"][number] | null {
  if (!(flat.cutLengthIn > 0)) return null;
  if (flat.measuresConfidence === "low" || flat.holesConfidence === "low") return null;
  const forMaterial = material
    ? speeds.filter(
        (s) =>
          s.materialId === material.id &&
          s.cutSpeedInPerMin > 0 &&
          machines.some((m) => m.id === s.machineId),
      )
    : [];
  let machine: SheetMetalMachine | null;
  let speed: number;
  let pierce: number;
  let source = "";
  if (forMaterial.length > 0) {
    const row = onlyOne(forMaterial);
    if (!row) return null;
    machine = machines.find((m) => m.id === row.machineId) ?? null;
    if (!machine) return null;
    speed = row.cutSpeedInPerMin;
    pierce = row.pierceSeconds ?? machine.pierceSeconds ?? 0;
    source = ` (rate for ${material?.name ?? "this material"})`;
  } else {
    machine = onlyOne(machines.filter((m) => (m.cutSpeedInPerMin ?? 0) > 0));
    if (!machine) return null;
    speed = machine.cutSpeedInPerMin as number;
    pierce = machine.pierceSeconds ?? 0;
  }
  const pierces = Math.max(0, Math.round(flat.pierceCount));
  const minutes = upToHundredth(flat.cutLengthIn / speed + (pierces * pierce) / 60);
  if (!(minutes > 0)) return null;
  const pierceText =
    pierce > 0
      ? ` + ${pierces} pierce${pierces === 1 ? "" : "s"} × ${fmt(pierce, 2)} s`
      : " (no pierce time on the rate card)";
  return {
    machineId: machine.id,
    label:
      `Cut from DXF: ${fmt(flat.cutLengthIn, 1)} in at ${fmt(speed, 1)} in/min${pierceText}${source}`.slice(
        0,
        120,
      ),
    setupMinutes: machine.defaultSetupMinutes,
    cycleMinutesPerPart: Math.min(100_000, minutes),
  };
}

/**
 * A suggested bending operation (press brake) from the flat pattern's bend lines at the shop's
 * seconds per bend. Only when exactly one active machine has a time per bend and the bend lines are
 * trusted: drawn on a layer named for bends (dashed linetypes alone are often hidden lines, so they
 * are low confidence and suggest nothing). No bend lines found suggests nothing either, since a
 * drawing without a bend layer may still be a bent part.
 */
export function suggestBendingOperation(
  flat: FlatPatternMeasures,
  machines: SheetMetalMachine[],
): CostInputs["operations"][number] | null {
  const bends = Math.round(flat.bendLineCount);
  if (bends <= 0) return null;
  if (flat.bendsConfidence === null || flat.bendsConfidence === "low") return null;
  const machine = onlyOne(machines.filter((m) => (m.secondsPerBend ?? 0) > 0));
  if (!machine) return null;
  const perBend = machine.secondsPerBend as number;
  return {
    machineId: machine.id,
    label: `Bend from DXF: ${bends} bend line${bends === 1 ? "" : "s"} × ${fmt(perBend, 1)} s`,
    setupMinutes: machine.defaultSetupMinutes,
    cycleMinutesPerPart: Math.min(100_000, upToHundredth((bends * perBend) / 60)),
  };
}

// ---- Drilling suggestion from a STEP solid's hole locations ----

/** A machine's drilling rates as the shop entered them on the rate card (null: not measured). */
export interface DrillingMachine {
  id: string;
  name: string;
  defaultSetupMinutes: number;
  /** Per hole location: position, spot, rapid in and out, retract. */
  secondsPerHole: number | null;
  /**
   * Drill feed (penetration rate) in inches per minute: the time the drill spends in the cut, from
   * each hole's depth. Absent or null: holes are timed by seconds per hole alone.
   */
  drillFeedInPerMin?: number | null;
  /**
   * Peck depth in drill diameters (the G83 Q value as a multiple of D): how far each peck goes before
   * the drill retracts to clear chips. With secondsPerPeck it times peck cycles on deep holes.
   */
  peckDepthDiameters?: number | null;
  /** Seconds for each extra peck's retract and return to depth (one peck cycle). */
  secondsPerPeck?: number | null;
}

/**
 * The extra peck retracts a hole takes beyond the one retract every hole has: pecks of `peckD`
 * diameters to `depth`, so ceil(depth / (peckD × D)) plunges and one fewer extra retracts. Only
 * deep holes (over DEEP_HOLE_DEPTH_TO_DIAMETER) are pecked: shallower ones drill in one plunge
 * (a G81 cycle). Zero when the hole is not deep or has no depth.
 */
export function extraPecks(
  depthIn: number,
  diameterIn: number,
  peckDepthDiameters: number,
): number {
  if (!(depthIn > 0) || !(diameterIn > 0) || !(peckDepthDiameters > 0)) return 0;
  if (!(depthIn > DEEP_HOLE_DEPTH_TO_DIAMETER * diameterIn + 1e-9)) return 0;
  // A tolerance keeps an exact multiple (6 in at 1×D of 1 in) from rounding up to one more plunge.
  const plunges = Math.ceil(depthIn / (peckDepthDiameters * diameterIn) - 1e-9);
  return Math.max(0, plunges - 1);
}

/** A machine's drill feed in one material row (rate card "Drill feeds by material"). */
export interface MaterialDrillFeed {
  machineId: string;
  materialId: string;
  drillFeedInPerMin: number;
}

/** What a STEP solid gives the drilling suggestion (inches; from GeometryFeatures.holeLocations). */
export interface HoleLocationMeasures {
  /** One entry per hole axis, smallest diameter first; two or more diameters is a stepped hole. */
  locations: { diametersIn: number[]; depthIn: number }[];
  holesConfidence: "high" | "medium" | "low" | null;
}

/**
 * Holes whose smallest diameter is above this are bores (interpolated or bored on a mill), not
 * drilled, and are left to the estimator. 1 in is where common jobber and taper-length drill sets
 * stop; a shop drilling larger edits the operation.
 */
export const MAX_DRILLED_DIAMETER_IN = 1;

/**
 * Depth over this many diameters is called a deep hole in the label: a common shop rule of thumb
 * for where a drill starts needing peck cycles (chip clearing), which the feed alone does not time.
 * When the drilling machine has a peck depth and seconds per peck on the rate card, deep holes get
 * that peck time (extraPecks); otherwise the label only flags them and the estimator adds it.
 */
export const DEEP_HOLE_DEPTH_TO_DIAMETER = 3;

/**
 * A suggested drilling operation from a STEP solid: one cycle per hole location (spot, drill,
 * retract; a counterbore or other step on the same axis is the same location). Each location takes
 * the shop's seconds per hole, plus, when the machine has a drill feed, its depth at that feed
 * (depth / in per min). The feed is not split by diameter: with feed per revolution growing roughly
 * in step with drill diameter and spindle speed falling in step with it, the penetration rate
 * changes far less across sizes than either does, so one measured rate is a fair first estimate;
 * the label names it so the estimator can check it.
 *
 * Which feed: penetration rate does depend on the material (cutting speed in stainless or titanium
 * is a fraction of aluminum's, and the rpm, so the in/min, falls with it). When the shop has entered
 * drill feeds for the line's material, the active machines with a feed for it are the candidates and
 * that feed is used, with the machine's seconds per hole; otherwise each machine's single default
 * feed is. Either way exactly one candidate must remain (with several, which one drills is the
 * estimator's call), the holes were measured with better than low confidence, and at least one
 * location is drill-sized. Bores above MAX_DRILLED_DIAMETER_IN are
 * left out and the label says how many, as it does deep holes (DEEP_HOLE_DEPTH_TO_DIAMETER). A STEP
 * model rarely carries threads, so tapping is suggested only for the sizes the estimator marks
 * threaded (suggestTappingOperation). When the drilling machine already has an operation on this line (the roughing one), its setup is not counted twice.
 */
export function suggestDrillingOperation(
  holes: HoleLocationMeasures,
  machines: DrillingMachine[],
  machinesAlreadySetUp: readonly string[] = [],
  material: CutMaterial | null = null,
  feeds: readonly MaterialDrillFeed[] = [],
): CostInputs["operations"][number] | null {
  if (holes.holesConfidence === null || holes.holesConfidence === "low") return null;
  const smallest = (l: { diametersIn: number[] }) => Math.min(...l.diametersIn);
  const valid = holes.locations.filter((l) => l.diametersIn.length > 0 && smallest(l) > 0);
  const drilled = valid.filter((l) => smallest(l) <= MAX_DRILLED_DIAMETER_IN + 1e-9);
  if (drilled.length === 0) return null;
  const forMaterial = material
    ? feeds.filter(
        (f) =>
          f.materialId === material.id &&
          f.drillFeedInPerMin > 0 &&
          machines.some((m) => m.id === f.machineId),
      )
    : [];
  let machine: DrillingMachine | null;
  let feed: number | null;
  let source = "";
  if (forMaterial.length > 0) {
    const row = onlyOne(forMaterial);
    if (!row) return null;
    machine = machines.find((m) => m.id === row.machineId) ?? null;
    if (!machine) return null;
    feed = row.drillFeedInPerMin;
    source = `feed for ${material?.name ?? "this material"}`;
  } else {
    machine = onlyOne(
      machines.filter((m) => (m.secondsPerHole ?? 0) > 0 || (m.drillFeedInPerMin ?? 0) > 0),
    );
    if (!machine) return null;
    feed =
      machine.drillFeedInPerMin && machine.drillFeedInPerMin > 0 ? machine.drillFeedInPerMin : null;
  }
  const perHole = machine.secondsPerHole && machine.secondsPerHole > 0 ? machine.secondsPerHole : 0;
  const n = drilled.length;
  const depthOf = (l: { depthIn: number }) =>
    Number.isFinite(l.depthIn) && l.depthIn > 0 ? l.depthIn : 0;
  const totalDepthIn = drilled.reduce((sum, l) => sum + depthOf(l), 0);
  const noDepth = drilled.filter((l) => depthOf(l) === 0).length;
  const stepped = drilled.filter((l) => l.diametersIn.length > 1).length;
  const deep = drilled.filter(
    (l) => depthOf(l) > DEEP_HOLE_DEPTH_TO_DIAMETER * smallest(l) + 1e-9,
  ).length;
  const bores = valid.length - n;
  const peckD =
    machine.peckDepthDiameters && machine.peckDepthDiameters > 0 ? machine.peckDepthDiameters : 0;
  const perPeck = machine.secondsPerPeck && machine.secondsPerPeck > 0 ? machine.secondsPerPeck : 0;
  const pecks =
    peckD > 0 && perPeck > 0
      ? drilled.reduce((sum, l) => sum + extraPecks(depthOf(l), smallest(l), peckD), 0)
      : 0;
  const minutes = (n * perHole) / 60 + (feed ? totalDepthIn / feed : 0) + (pecks * perPeck) / 60;
  if (!(minutes > 0)) return null;
  const notes = [
    source,
    stepped > 0 && `${stepped} stepped`,
    deep > 0 &&
      (pecks > 0
        ? `${deep} deep, pecked every ${fmt(peckD, 2)}×D`
        : `${deep} deep, over ${DEEP_HOLE_DEPTH_TO_DIAMETER}×D`),
    feed && noDepth > 0 && `${noDepth} without a depth`,
    bores > 0 &&
      `${bores} bore${bores === 1 ? "" : "s"} over ${MAX_DRILLED_DIAMETER_IN} in left out`,
  ].filter(Boolean);
  const holesText = `${n} hole${n === 1 ? "" : "s"}`;
  const timing = [
    perHole > 0 && `${holesText} × ${fmt(perHole, 1)} s`,
    feed && `${fmt(totalDepthIn, 2)} in deep at ${fmt(feed, 1)} in/min`,
    pecks > 0 && `${pecks} peck${pecks === 1 ? "" : "s"} × ${fmt(perPeck, 1)} s`,
  ].filter(Boolean);
  const label = `Drill from CAD: ${perHole > 0 ? "" : `${holesText}, `}${timing.join(" + ")}${
    notes.length ? ` (${notes.join(", ")})` : ""
  }`;
  return {
    machineId: machine.id,
    label: label.slice(0, 120),
    setupMinutes: machinesAlreadySetUp.includes(machine.id) ? 0 : machine.defaultSetupMinutes,
    cycleMinutesPerPart: Math.min(100_000, upToHundredth(minutes)),
  };
}

// ---- Tapping suggestion from the hole sizes the estimator marked threaded ----

/** A machine's tapping rate as the shop entered it on the rate card (null: not measured). */
export interface TappingMachine {
  id: string;
  name: string;
  defaultSetupMinutes: number;
  /** Per tapped hole: position, tap in, reverse out (the tap drill is timed by the drilling op). */
  secondsPerTappedHole?: number | null;
}

/** Two diameters closer than this (in) are one size: the CAD reader rounds to 0.001 in or finer. */
const SAME_DIAMETER_IN = 0.0005;

/**
 * The drill-sized hole sizes of a STEP solid, each with how many locations have it as their
 * smallest diameter (a tapped hole's tap drill, under any counterbore), smallest first. These are
 * what the estimator marks threaded on the RFQ: a STEP model rarely carries threads, so the app
 * asks rather than guesses. Empty when the holes were measured with low confidence.
 */
export function drilledHoleSizes(
  holes: HoleLocationMeasures,
): { diameterIn: number; count: number }[] {
  if (holes.holesConfidence === null || holes.holesConfidence === "low") return [];
  const sizes: { diameterIn: number; count: number }[] = [];
  for (const l of holes.locations) {
    if (l.diametersIn.length === 0) continue;
    const d = Math.min(...l.diametersIn);
    if (!(d > 0) || d > MAX_DRILLED_DIAMETER_IN + 1e-9) continue;
    const same = sizes.find((s) => Math.abs(s.diameterIn - d) < SAME_DIAMETER_IN);
    if (same) same.count += 1;
    else sizes.push({ diameterIn: d, count: 1 });
  }
  return sizes.sort((a, b) => a.diameterIn - b.diameterIn);
}

/**
 * A suggested tapping operation: every hole location whose size the estimator marked threaded,
 * at the shop's seconds per tapped hole. The tap drill stays in the drilling operation (the same
 * locations are drilled first), so this adds only the tapping cycle. Only when exactly one active
 * machine has a seconds per tapped hole, the holes were measured with better than low confidence,
 * and at least one marked size is on the part. A size marked but no longer on the model (a new
 * file) is ignored. When the tapping machine already has an operation on this line (roughing or
 * drilling), its setup is not counted twice.
 */
export function suggestTappingOperation(
  holes: HoleLocationMeasures,
  tappedDiametersIn: readonly number[],
  machines: TappingMachine[],
  machinesAlreadySetUp: readonly string[] = [],
): CostInputs["operations"][number] | null {
  if (tappedDiametersIn.length === 0) return null;
  const tapped = drilledHoleSizes(holes).filter((s) =>
    tappedDiametersIn.some((d) => Math.abs(d - s.diameterIn) < SAME_DIAMETER_IN),
  );
  const n = tapped.reduce((sum, s) => sum + s.count, 0);
  if (n === 0) return null;
  const machine = onlyOne(machines.filter((m) => (m.secondsPerTappedHole ?? 0) > 0));
  if (!machine) return null;
  const perTap = machine.secondsPerTappedHole as number;
  const sizes = tapped.map((s) => `${s.count}× Ø${fmt(s.diameterIn, 4)}`).join(", ");
  const label = `Tap from CAD: ${n} hole${n === 1 ? "" : "s"} × ${fmt(perTap, 1)} s (${sizes})`;
  return {
    machineId: machine.id,
    label: label.slice(0, 120),
    setupMinutes: machinesAlreadySetUp.includes(machine.id) ? 0 : machine.defaultSetupMinutes,
    cycleMinutesPerPart: Math.min(100_000, upToHundredth((n * perTap) / 60)),
  };
}

/** "$4.25/lb", or for a per-cwt price "$412.50/cwt ($4.125/lb)": the supplier's figure first. */
export function perLbText(m: RateMaterial, currency: string | null | undefined): string {
  const lb = `${exactMoneyText(lbPriceCents(m) ?? 0, currency)}/lb`;
  if (m.pricePerCwtCents == null) return lb;
  return `${exactMoneyText(m.pricePerCwtCents, currency)}/cwt (${lb})`;
}

/** "$3.50/ft", or for a per-metre price "$10.00/m ($3.048/ft)". */
export function perFootText(m: RateMaterial, currency: string | null | undefined): string {
  const ft = `${exactMoneyText(footPriceCents(m) ?? 0, currency)}/ft`;
  if (m.pricePerMetreCents == null) return ft;
  return `${exactMoneyText(m.pricePerMetreCents, currency)}/m (${ft})`;
}
