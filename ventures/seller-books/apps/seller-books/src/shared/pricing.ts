// Pricing from the seller's own fee history: what each platform actually took from their orders, turned
// into what an item would net there and the list price that leaves a target profit. Pure, shared by the
// Worker (GET /reports/pricing builds the models) and the SPA (the stock page quotes as the seller types).
//
// Definitions (shown on the page, docs/ARCHITECTURE.md "Pricing from your own fees"):
//   order          = an imported or typed order row dated in [from, to] with an item price above zero;
//                    refunds are left out (a returned sale is not a fee the price pays)
//   fees           = the fees the report itemised on that row (sale_fee), never a published rate
//   fee model      = fees ≈ fixed + percent × item price. With 5 or more orders whose prices differ, the
//                    two numbers are fitted by least squares on those orders; when the fit is unusable (a
//                    negative fixed part, a percent outside 0-100%) or there are fewer orders, fixed is 0 and
//                    percent is the platform's total fees ÷ total item price
//   other charges  = charges not tied to one order (ads, promoted listings, other fees) ÷ total item price;
//                    postage bought apart from the order counts as postage, and subscriptions are left out
//                    (a monthly fee is not a cost of one more sale)
//   net postage    = (postage on the orders + postage charges − shipping the buyers paid) ÷ orders; below
//                    zero when buyers paid more for shipping than the labels cost
//   net of a price = price − (fixed + percent × price) − other rate × price − net postage
//   profit         = net − the item's cost
//   price for a target profit P = (P + cost + fixed + net postage) ÷ (1 − percent − other rate), rounded up to
//                    the cent; none when the fees take 99.5% or more of the price
// Sales tax is not income and is never part of a price here. The figures are averages of past orders: a
// platform that changed its fees, a promotion or a different item mix will not match them.
import { PLATFORM_LABELS, type SaleChannel } from "./enums";

const label = (p: string) => PLATFORM_LABELS[p as SaleChannel] ?? p;

/** One order row, as the Worker loads it. */
export interface PricingOrderInput {
  platform: string;
  itemCents: number;
  shippingChargedCents: number;
  shippingLabelCents: number;
  /** Sum of the row's itemised fees (credits negative). */
  feesCents: number;
}

/** One platform charge not tied to an order, dated in the window. */
export interface PricingChargeInput {
  platform: string;
  kind: string; // ChargeKind
  amountCents: number;
}

export interface PlatformFeeModel {
  platform: string;
  orders: number;
  itemCents: number;
  feesCents: number;
  otherChargesCents: number;
  /** Shipping the buyers paid on these orders. */
  shippingChargedCents: number;
  /** Postage on the orders plus postage charged apart from them. */
  postageCents: number;
  /** "fit": fixed and percent fitted on the orders; "ratio": fixed 0, percent = fees ÷ item price. */
  model: "fit" | "ratio";
  /** Fixed part of the fee per order, in cents (0 for the ratio model). */
  fixedCents: number;
  /** Fee percent of the item price, as a fraction (0.13 = 13%). */
  percent: number;
  /** Other charges as a fraction of the item price. */
  otherRate: number;
  /** Net postage per order in cents (negative when buyers paid more than the labels). */
  netPostageCents: number;
  /** Mean absolute gap between each order's fees and the model's, in cents: how well it describes them. */
  typicalMissCents: number;
  /** All fees and other charges ÷ item price, as a fraction. */
  effectiveRate: number;
}

export interface PricingReport {
  from: string;
  to: string;
  platforms: PlatformFeeModel[];
  /** Orders below this count get a "rough" mark on the page. */
  fewOrders: number;
  warnings: string[];
}

/** Below this many orders a platform's figures are marked rough. */
export const FEW_ORDERS = 10;
/** Fewest orders for a fitted fixed + percent model. */
export const MIN_FIT_ORDERS = 5;

const CHARGE_POSTAGE = "shipping_label";
const CHARGE_EXCLUDED = new Set(["subscription"]);

/** Least squares for fees = a + b × price; null when the prices do not vary. */
function fitLine(xs: number[], ys: number[]): { a: number; b: number } | null {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i] as number;
    sy += ys[i] as number;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    sxx += dx * dx;
    sxy += dx * ((ys[i] as number) - my);
  }
  // Prices that barely vary (all within a cent of each other) cannot separate fixed from percent.
  if (sxx < n) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/** Fee models by platform, most orders first. */
export function buildPricingModels(input: {
  from: string;
  to: string;
  orders: PricingOrderInput[];
  charges: PricingChargeInput[];
}): PricingReport {
  const byPlatform = new Map<string, PricingOrderInput[]>();
  for (const o of input.orders) {
    if (o.itemCents <= 0) continue;
    const list = byPlatform.get(o.platform) ?? [];
    list.push(o);
    byPlatform.set(o.platform, list);
  }
  const other = new Map<string, number>();
  const postageCharges = new Map<string, number>();
  for (const c of input.charges) {
    if (CHARGE_EXCLUDED.has(c.kind)) continue;
    const pool = c.kind === CHARGE_POSTAGE ? postageCharges : other;
    pool.set(c.platform, (pool.get(c.platform) ?? 0) + c.amountCents);
  }

  const platforms: PlatformFeeModel[] = [];
  const warnings: string[] = [];
  for (const [platform, orders] of byPlatform) {
    const n = orders.length;
    let item = 0;
    let fees = 0;
    let shipCharged = 0;
    let labels = 0;
    for (const o of orders) {
      item += o.itemCents;
      fees += o.feesCents;
      shipCharged += o.shippingChargedCents;
      labels += o.shippingLabelCents;
    }
    const otherCents = other.get(platform) ?? 0;
    const postage = labels + (postageCharges.get(platform) ?? 0);

    let model: "fit" | "ratio" = "ratio";
    let fixed = 0;
    let percent = item > 0 ? fees / item : 0;
    if (n >= MIN_FIT_ORDERS) {
      const fit = fitLine(
        orders.map((o) => o.itemCents),
        orders.map((o) => o.feesCents),
      );
      if (fit && fit.a >= 0 && fit.b >= 0 && fit.b < 1) {
        model = "fit";
        fixed = fit.a;
        percent = fit.b;
      }
    }
    let miss = 0;
    for (const o of orders) miss += Math.abs(o.feesCents - (fixed + percent * o.itemCents));

    platforms.push({
      platform,
      orders: n,
      itemCents: item,
      feesCents: fees,
      otherChargesCents: otherCents,
      shippingChargedCents: shipCharged,
      postageCents: postage,
      model,
      fixedCents: Math.round(fixed),
      percent,
      otherRate: item > 0 ? otherCents / item : 0,
      netPostageCents: Math.round((postage - shipCharged) / n),
      typicalMissCents: Math.round(miss / n),
      effectiveRate: item > 0 ? (fees + otherCents) / item : 0,
    });
    if (fees === 0 && otherCents === 0)
      warnings.push(
        `${label(platform)}: no fees on these orders. A report that gives only the payout (or a direct sale) records none, so its net is item price less postage.`,
      );
  }
  platforms.sort((x, y) => y.orders - x.orders || x.platform.localeCompare(y.platform));
  for (const [platform, cents] of other)
    if (!byPlatform.has(platform) && cents !== 0)
      warnings.push(
        `${label(platform)}: charges with no orders in these dates, so no rate can be worked out from them.`,
      );
  return { from: input.from, to: input.to, platforms, fewOrders: FEW_ORDERS, warnings };
}

export interface PriceQuote {
  platform: string;
  priceCents: number;
  feesCents: number;
  otherCents: number;
  netPostageCents: number;
  netCents: number;
  profitCents: number;
  /** profit ÷ price as a fraction, null at a zero price. */
  margin: number | null;
}

/** What `priceCents` nets on a platform, and the profit over `costCents`. */
export function quotePrice(m: PlatformFeeModel, priceCents: number, costCents: number): PriceQuote {
  const feesCents = Math.round(m.fixedCents + m.percent * priceCents);
  const otherCents = Math.round(m.otherRate * priceCents);
  const netCents = priceCents - feesCents - otherCents - m.netPostageCents;
  const profitCents = netCents - costCents;
  return {
    platform: m.platform,
    priceCents,
    feesCents,
    otherCents,
    netPostageCents: m.netPostageCents,
    netCents,
    profitCents,
    margin: priceCents > 0 ? profitCents / priceCents : null,
  };
}

/** The lowest whole-cent price whose profit is at least `targetProfitCents`; null when fees take it all. */
export function priceForProfit(
  m: PlatformFeeModel,
  costCents: number,
  targetProfitCents: number,
): number | null {
  const keep = 1 - m.percent - m.otherRate;
  // Fees of 99.5% or more leave no usable price (and floating point can leave a crumb above zero).
  if (keep < 0.005) return null;
  let p = Math.max(
    0,
    Math.ceil((targetProfitCents + costCents + m.fixedCents + m.netPostageCents) / keep),
  );
  // Rounding inside quotePrice can leave the profit a cent short; step up until it is met.
  for (let i = 0; i < 5 && quotePrice(m, p, costCents).profitCents < targetProfitCents; i++) p++;
  // And the cent below may already meet it.
  for (
    let i = 0;
    i < 5 && p > 0 && quotePrice(m, p - 1, costCents).profitCents >= targetProfitCents;
    i++
  )
    p--;
  return p;
}
