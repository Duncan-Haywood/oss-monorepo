// Course / digital-product platform fee comparison. No network, no state.
//
// A creator selling a course or digital product pays a platform in up to
// three ways at once: a flat monthly plan fee, a percentage-plus-flat
// transaction fee the platform itself charges, and (on most platforms) the
// card processor's cut on top. Each platform's own pricing page quotes only
// its own bundle, so the real question -- which one leaves the most in my
// bank at MY volume, and at what volume does the answer flip -- is never
// answered side by side.
//
// Every platform's pricing changes often, so the presets below are starting
// points to be checked against the platform's pricing page, never facts this
// file vouches for. The arithmetic is the product; the numbers are inputs.

function number(value, name, { min = 0, max = null } = {}) {
  if (value === "" || value === null || value === undefined) throw new Error(`${name} is required`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (max !== null && result > max) throw new Error(`${name} must be at most ${max}`);
  return result;
}

/**
 * Starting-point fee schedules, USD. Approximate and from general knowledge,
 * NOT checked against a live pricing page in this session: the page tells
 * the visitor to verify and lets them edit every number.
 * `processorOnTop` = the platform's own fee excludes card processing, so the
 * processor's percentage + flat is charged in addition.
 */
export const PRESETS = [
  { id: "gumroad", name: "Gumroad", monthlyFee: 0, txPercent: 10, txFlat: 0.5, processorOnTop: true, note: "10% + $0.50 per direct sale, card processing charged on top (as reported by 2026 fee guides; confirm on gumroad.com/pricing)." },
  { id: "podia-free", name: "Podia (free plan)", monthlyFee: 0, txPercent: 8, txFlat: 0, processorOnTop: true, note: "No monthly fee, transaction fee, processing on top." },
  { id: "podia-paid", name: "Podia (paid plan)", monthlyFee: 39, txPercent: 0, txFlat: 0, processorOnTop: true, note: "Paid plan removes the platform transaction fee." },
  { id: "teachable-basic", name: "Teachable (entry plan)", monthlyFee: 39, txPercent: 5, txFlat: 0, processorOnTop: true, note: "Entry plan with a platform transaction fee." },
  { id: "thinkific-paid", name: "Thinkific (paid plan)", monthlyFee: 49, txPercent: 0, txFlat: 0, processorOnTop: true, note: "Paid plan, no platform transaction fee." },
  { id: "kajabi", name: "Kajabi (entry plan)", monthlyFee: 149, txPercent: 0, txFlat: 0, processorOnTop: true, note: "Higher fixed fee, no platform transaction fee." },
  // Added 2026-10-18 from secondary 2026 fee guides only (the platforms' own
  // pricing pages were not reachable from the build environment). `listed: false`
  // keeps the first-load table to the original course platforms; the page's
  // picker adds any of these.
  { id: "lemon-squeezy", name: "Lemon Squeezy", monthlyFee: 0, txPercent: 5, txFlat: 0.5, processorOnTop: false, listed: false, note: "5% + $0.50 per sale as a merchant of record, processing included; guides report small extra surcharges for international cards, PayPal and subscriptions." },
  { id: "paddle", name: "Paddle", monthlyFee: 0, txPercent: 5, txFlat: 0.5, processorOnTop: false, listed: false, note: "5% + $0.50 per sale as a merchant of record, processing and sales-tax handling included." },
  { id: "payhip-free", name: "Payhip (free plan)", monthlyFee: 0, txPercent: 5, txFlat: 0, processorOnTop: true, listed: false, note: "5% per sale on the free plan, processing on top; a paid plan removes the platform fee." },
  { id: "kofi-free", name: "Ko-fi (free plan, shop sales)", monthlyFee: 0, txPercent: 5, txFlat: 0, processorOnTop: true, listed: false, note: "5% of shop and membership income on the free plan (tips are not charged); processing on top." },
  { id: "kofi-gold", name: "Ko-fi Gold", monthlyFee: 6, txPercent: 0, txFlat: 0, processorOnTop: true, listed: false, note: "Flat monthly plan with no platform fee. Guides disagree on the price ($6 or $12): edit it." },
  { id: "buymeacoffee", name: "Buy Me a Coffee", monthlyFee: 0, txPercent: 5, txFlat: 0, processorOnTop: true, listed: false, note: "5% platform fee, card processing on top." },
  { id: "patreon-standard", name: "Patreon (Standard plan)", monthlyFee: 0, txPercent: 10, txFlat: 0, processorOnTop: true, listed: false, note: "10% platform fee, processing on top; see the patreon-fee-calculator for tier-by-tier pledges." },
  { id: "stan-store", name: "Stan Store", monthlyFee: 29, txPercent: 0, txFlat: 0, processorOnTop: true, listed: false, note: "Flat monthly plan with no transaction fee (guides give $29 to $99 depending on plan); processing on top." },
  { id: "udemy-marketplace", name: "Udemy (marketplace sale)", monthlyFee: 0, txPercent: 63, txFlat: 0, processorOnTop: false, note: "Instructor keeps roughly 37% of a Udemy-sourced sale; far more on your own coupon links." },
];

export const DEFAULT_PROCESSOR = { percent: 2.9, flat: 0.3 };

/** Per-sale platform + processor cost of one sale at `price`. */
function perSaleCost(price, p, processor) {
  let cost = price * (p.txPercent / 100) + p.txFlat;
  if (p.processorOnTop) cost += price * (processor.percent / 100) + processor.flat;
  return cost;
}

function cleanPlatform(p, i) {
  const label = `Platform ${i + 1}`;
  return {
    name: String(p.name || "").trim() || label,
    monthlyFee: number(p.monthlyFee, `${label} monthly fee`),
    txPercent: number(p.txPercent, `${label} transaction %`, { max: 100 }),
    txFlat: number(p.txFlat, `${label} flat fee per sale`),
    processorOnTop: Boolean(p.processorOnTop),
  };
}

/** Monthly numbers for one platform at a given volume. */
function evaluate(p, { price, sales, refundRate }, processor) {
  const gross = price * sales;
  const refunded = gross * (refundRate / 100);
  // Fees are assumed NOT returned on a refunded sale: processors generally
  // keep their cut and a platform's own fee schedule varies, so this is the
  // conservative reading and is stated on the page.
  const fees = perSaleCost(price, p, processor) * sales;
  const totalCost = fees + p.monthlyFee;
  const net = gross - refunded - totalCost;
  return {
    name: p.name,
    gross,
    refunded,
    fees,
    monthlyFee: p.monthlyFee,
    totalCost,
    net,
    costPercentOfGross: gross === 0 ? null : (totalCost / gross) * 100,
  };
}

/**
 * Sales per month at which platform `a` and `b` cost the same. Cost is linear
 * in sales (fixed fee + per-sale cost), so there is at most one crossover.
 * Returns null if the lines are parallel or never cross for sales > 0.
 */
export function crossoverSales(a, b, { price, processor = DEFAULT_PROCESSOR }) {
  const va = perSaleCost(price, a, processor);
  const vb = perSaleCost(price, b, processor);
  if (va === vb) return null;
  const n = (b.monthlyFee - a.monthlyFee) / (va - vb);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const VOLUME_LADDER = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];

export function compareCoursePlatforms(input) {
  let price, sales, refundRate, processor, platforms;
  try {
    price = number(input.price, "Price per sale");
    sales = number(input.salesPerMonth, "Sales per month");
    refundRate = number(input.refundRatePercent ?? 0, "Refund rate", { max: 100 });
    processor = {
      percent: number(input.processorPercent ?? DEFAULT_PROCESSOR.percent, "Processor %", { max: 100 }),
      flat: number(input.processorFlat ?? DEFAULT_PROCESSOR.flat, "Processor flat fee"),
    };
    if (!Array.isArray(input.platforms) || input.platforms.length < 2) throw new Error("Add at least two platforms to compare");
    platforms = input.platforms.map(cleanPlatform);
  } catch (e) {
    return { error: e.message };
  }
  if (price <= 0) return { error: "Price per sale must be greater than zero" };

  const ctx = { price, sales, refundRate };
  const rows = platforms.map((p) => evaluate(p, ctx, processor)).sort((a, b) => b.net - a.net);
  const best = rows[0];
  const worst = rows[rows.length - 1];

  // Which platform is cheapest at each volume, so the reader sees where the
  // answer flips instead of trusting a single volume they might outgrow.
  const ladder = VOLUME_LADDER.map((n) => {
    const at = platforms.map((p) => evaluate(p, { price, sales: n, refundRate }, processor)).sort((a, b) => b.net - a.net);
    return { sales: n, winner: at[0].name, net: at[0].net };
  });

  const findings = [];
  const spread = (best.net - worst.net) * 12;
  findings.push({
    severity: spread > 0 ? "high" : "info",
    title: `${best.name} leaves the most at ${sales} sale(s) a month`,
    detail: `It nets ${best.net.toFixed(2)} a month against ${worst.net.toFixed(2)} on ${worst.name}, a gap of about ${spread.toFixed(0)} a year at this volume.`,
  });

  // The bundle most readers get wrong: a flat-fee plan only wins above its crossover.
  const crossings = [];
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const n = crossoverSales(platforms[i], platforms[j], { price, processor });
      if (n !== null) {
        const [cheapLow, cheapHigh] = perSaleCost(price, platforms[i], processor) > perSaleCost(price, platforms[j], processor)
          ? [platforms[i].name, platforms[j].name] : [platforms[j].name, platforms[i].name];
        crossings.push({ a: platforms[i].name, b: platforms[j].name, sales: n, cheaperBelow: cheapLow, cheaperAbove: cheapHigh });
      }
    }
  }
  const relevant = crossings.filter((c) => c.a === best.name || c.b === best.name).sort((x, y) => Math.abs(x.sales - sales) - Math.abs(y.sales - sales))[0];
  if (relevant) {
    findings.push({
      severity: "medium",
      title: `The ranking flips near ${Math.round(relevant.sales)} sales a month`,
      detail: `Below about ${Math.round(relevant.sales)} sales, ${relevant.cheaperBelow} costs less than ${relevant.cheaperAbove}; above it, ${relevant.cheaperAbove} does. If you expect to grow past that, price the plan you will be on, not the one you are on.`,
    });
  }
  findings.push({
    severity: "info",
    title: "Check the fee schedule before you rely on this",
    detail: "Platform pricing changes often. The presets are approximate starting points; confirm each number on the platform's own pricing page and edit it here.",
  });

  return { price, sales, refundRate, processor, rows, best, worst, ladder, crossings, findings };
}

export function money(n) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
