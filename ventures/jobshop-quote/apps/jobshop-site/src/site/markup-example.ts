// The arithmetic behind the /machine-shop-markup guide. The page prints its tables from here, so the
// prose, the tables and the tests cannot disagree.
//
// 1. Markup and margin: the two conversions (margin = markup ÷ (1 + markup), markup = margin ÷
//    (1 − margin)), exact, for the table.
// 2. Markup policies on one job: the CNC guide's made-up anodized bracket (quote-example.ts, already
//    priced to the cent by the app's costing engine) priced under four markup settings. Each policy is
//    the same job with a different labor, material and outside-service markup and line minimum, priced
//    by priceExample; apps/jobshop-quote/test/unit/site-markup-example.test.ts prices every policy with
//    the real engine (computeCost) and checks each figure to the cent.
// 3. What the shop keeps: the price against the costs on the quote, and against the shop's full cost
//    once the margin already inside the hourly rate (the /machine-shop-hourly-rate guide's 20%) is
//    taken out of labor.
//
// The inputs are made up for illustration (labelled so on the page), never industry figures.

import {
  EXAMPLE as BRACKET,
  priceExample,
  type QuoteBreak,
  type QuoteExample,
} from "./quote-example";
import { EXAMPLE as SHOP, shopRate } from "./shop-rate";

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;

/** Margin (share of the price) that a markup (share of the cost) gives. */
export const marginFromMarkup = (markup: number): number => {
  if (markup <= -1) throw new Error("markup is above −100%");
  return markup / (1 + markup);
};

/** Markup on cost needed to earn a margin (share of the price). */
export const markupFromMargin = (margin: number): number => {
  if (margin >= 1) throw new Error("margin is below 100%");
  return margin / (1 - margin);
};

/** Markups the conversion table lists, as fractions. */
export const TABLE_MARKUPS: readonly number[] = [0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 1];
/** Margins the conversion table lists, as fractions. */
export const TABLE_MARGINS: readonly number[] = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5];

export interface MarkupPolicy {
  key: string;
  label: string;
  /** One line on what changes against the first policy. */
  note: string;
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  minimumLineCents: number;
  /** Null: the mill at the CNC guide's rate. Set: the mill at this rate instead. */
  hourlyRateCents: number | null;
}

/** The hourly-rate guide's cost of a billable hour (before its margin), to the cent. */
export const RATE_COST_CENTS = Math.round(shopRate(SHOP).costPerBillableHour * 100);
/** The margin the hourly-rate guide builds into the mill's rate. */
export const RATE_MARGIN = SHOP.margin;

/**
 * The first policy is the CNC guide's own card: labor 0% because the mill's rate ($123.85, the
 * hourly-rate guide's rate at a 20% margin) already holds the profit; 15% on material and on the
 * outside anodize; a $250 line minimum.
 */
export const POLICIES: readonly MarkupPolicy[] = [
  {
    key: "split",
    label: "Split markups (the CNC guide's card)",
    note: "Labor 0% (the rate holds the margin), material 15%, outside service 15%, $250 line minimum.",
    laborMarkupBps: BRACKET.laborMarkupBps,
    materialMarkupBps: BRACKET.materialMarkupBps,
    outsideServiceMarkupBps: BRACKET.outsideServiceMarkupBps,
    minimumLineCents: BRACKET.minimumLineCents,
    hourlyRateCents: null,
  },
  {
    key: "rate-at-cost",
    label: "Rate at cost, 25% labor markup",
    note: "The mill at its cost per billable hour and labor marked up 25%: the same 20% margin written as a markup.",
    laborMarkupBps: 2_500,
    materialMarkupBps: BRACKET.materialMarkupBps,
    outsideServiceMarkupBps: BRACKET.outsideServiceMarkupBps,
    minimumLineCents: BRACKET.minimumLineCents,
    hourlyRateCents: RATE_COST_CENTS,
  },
  {
    key: "pass-through",
    label: "Material and anodize at cost",
    note: "Material and the outside anodize passed through with no markup; the $250 minimum stays.",
    laborMarkupBps: BRACKET.laborMarkupBps,
    materialMarkupBps: 0,
    outsideServiceMarkupBps: 0,
    minimumLineCents: BRACKET.minimumLineCents,
    hourlyRateCents: null,
  },
  {
    key: "flat",
    label: "One 15% markup on everything",
    note: "15% on labor too, on top of a rate that already holds a 20% margin; the $250 minimum stays.",
    laborMarkupBps: 1_500,
    materialMarkupBps: 1_500,
    outsideServiceMarkupBps: 1_500,
    minimumLineCents: BRACKET.minimumLineCents,
    hourlyRateCents: null,
  },
];

export interface MarkupBreak extends QuoteBreak {
  materialMarkupCents: number;
  laborMarkupCents: number;
  outsideMarkupCents: number;
  /** Price over the costs on the quote, minus one: (total − cost) ÷ cost. */
  markupOnCost: number;
  /** (total − cost) ÷ total: the margin over the costs on the quote. */
  marginOnQuote: number;
  /**
   * The shop's full cost: labor at the hourly-rate guide's cost per billable hour (what the margin in
   * the rate was added to), material and the outside service as quoted.
   */
  fullCostCents: number;
  /** (total − full cost) ÷ total. */
  marginOnFullCost: number;
}

export interface PolicyResult {
  policy: MarkupPolicy;
  breaks: MarkupBreak[];
}

/** The bracket job with this policy's markups and minimum. */
export function jobFor(policy: MarkupPolicy, base: QuoteExample = BRACKET): QuoteExample {
  return {
    ...base,
    laborMarkupBps: policy.laborMarkupBps,
    materialMarkupBps: policy.materialMarkupBps,
    outsideServiceMarkupBps: policy.outsideServiceMarkupBps,
    minimumLineCents: policy.minimumLineCents,
    hourlyRateCents: policy.hourlyRateCents ?? base.hourlyRateCents,
  };
}

export function pricePolicy(policy: MarkupPolicy, base: QuoteExample = BRACKET): PolicyResult {
  const job = jobFor(policy, base);
  const breaks = priceExample(job).breaks.map((b): MarkupBreak => {
    const materialMarkupCents = roundCents(b.materialCents * pct(job.materialMarkupBps));
    const laborMarkupCents = roundCents((b.setupCents + b.runCents) * pct(job.laborMarkupBps));
    const outsideMarkupCents = roundCents(b.finishingCents * pct(job.outsideServiceMarkupBps));
    const laborAtCost = roundCents(
      ((b.setupCents + b.runCents) * RATE_COST_CENTS) / job.hourlyRateCents,
    );
    const fullCostCents = b.materialCents + laborAtCost + b.finishingCents;
    return {
      ...b,
      materialMarkupCents,
      laborMarkupCents,
      outsideMarkupCents,
      markupOnCost: (b.totalCents - b.costCents) / b.costCents,
      marginOnQuote: (b.totalCents - b.costCents) / b.totalCents,
      fullCostCents,
      marginOnFullCost: (b.totalCents - fullCostCents) / b.totalCents,
    };
  });
  return { policy, breaks };
}

export function priceAllPolicies(base: QuoteExample = BRACKET): PolicyResult[] {
  return POLICIES.map((p) => pricePolicy(p, base));
}

/** "15%" or "17.6%": a fraction as a percentage to one decimal, trailing ".0" dropped. */
export function pct1(f: number): string {
  const v = Math.round(f * 1000) / 10;
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}%`;
}
