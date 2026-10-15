// Print-on-demand seller profit: what one sale actually leaves after the
// platform's fees, the POD supplier's item and shipping cost, refunds, ad
// spend and sample orders. Pure functions; no I/O.

export const RATES_AS_OF = "2026-09-29";

// Fee lines are charged on the order total (item price + shipping the buyer
// pays) unless noted. These are the author's recollection of published US
// schedules, marked "verify" on the page, and every one can be overridden.
export const PLATFORMS = {
  etsy: {
    name: "Etsy",
    lines: [
      { label: "Transaction fee", pct: 6.5, fixed: 0 },
      { label: "Payment processing", pct: 3, fixed: 0.25 },
      { label: "Listing fee (renews per sale)", pct: 0, fixed: 0.2 },
    ],
    note: "Etsy transaction 6.5%, payment processing 3% + $0.25, $0.20 listing fee. Offsite Ads adds 15% (12% once you pass $10,000 a year) on orders it drives, and is set separately below.",
  },
  shopify: {
    name: "Shopify (Shopify Payments)",
    lines: [{ label: "Card processing", pct: 2.9, fixed: 0.3 }],
    note: "Shopify Payments card rate on a basic plan is 2.9% + $0.30. Rates fall on higher plans, and the monthly plan fee is not included.",
  },
  ebay: {
    name: "eBay",
    lines: [{ label: "Final value fee", pct: 13.6, fixed: 0.4 }],
    note: "13.6% + $0.40 is the common final value fee for most categories on orders over $10; some categories and sellers pay less or more.",
  },
  custom: {
    name: "Custom",
    lines: [{ label: "Your fee", pct: 0, fixed: 0 }],
    note: "Type your own percent and fixed fee.",
  },
};

const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : d);
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n) => {
  const v = round2(n);
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-${s}` : s;
};

function normalise(i) {
  const platform = Object.hasOwn(PLATFORMS, i.platform) ? i.platform : "etsy";
  const o = {
    platform,
    price: num(i.price, NaN),
    shipCharged: Math.max(0, num(i.shipCharged)),
    baseCost: num(i.baseCost, NaN),
    shipCost: Math.max(0, num(i.shipCost)),
    refundPct: num(i.refundPct),
    adSpend: Math.max(0, num(i.adSpend)),
    sampleCost: Math.max(0, num(i.sampleCost)),
    offsitePct: num(i.offsitePct),
    offsiteShare: num(i.offsiteShare),
    customPct: num(i.customPct),
    customFixed: num(i.customFixed),
    orders: Math.max(0, num(i.orders)),
    targetMarginPct: num(i.targetMarginPct, 30),
  };
  return o;
}

function validate(o) {
  const errors = [];
  if (!(o.price > 0)) errors.push("Enter a selling price above zero.");
  if (!(o.baseCost >= 0)) errors.push("Enter the supplier's item cost (0 or more).");
  if (o.refundPct < 0 || o.refundPct > 100) errors.push("Refund rate must be between 0 and 100.");
  if (o.offsiteShare < 0 || o.offsiteShare > 100) errors.push("Offsite Ads share must be between 0 and 100.");
  return errors;
}

// Fees as { pct (fraction of order total), fixed ($) } for one platform.
export function feeModel(o, platform = o.platform) {
  const p = PLATFORMS[platform];
  const lines = platform === "custom" ? [{ label: "Your fee", pct: o.customPct, fixed: o.customFixed }] : p.lines.map((l) => ({ ...l }));
  if (platform === "etsy" && o.offsiteShare > 0 && o.offsitePct > 0) {
    // Expected value: only the share of orders Offsite Ads drove pays it.
    lines.push({ label: `Offsite Ads (${o.offsitePct}% on ${o.offsiteShare}% of orders)`, pct: (o.offsitePct * o.offsiteShare) / 100, fixed: 0 });
  }
  return { lines, pct: lines.reduce((s, l) => s + l.pct / 100, 0), fixed: lines.reduce((s, l) => s + l.fixed, 0) };
}

function unit(o, price, platform) {
  const order = price + o.shipCharged;
  const fm = feeModel(o, platform);
  const feeLines = fm.lines.map((l) => ({ label: l.label, amount: (order * l.pct) / 100 + l.fixed }));
  const fees = feeLines.reduce((s, l) => s + l.amount, 0);
  // A refunded order still cost the supplier's charge and the fees; only the
  // revenue is given back. That is the pessimistic, and usual, case.
  const refundLoss = (order * o.refundPct) / 100;
  const cogs = o.baseCost + o.shipCost;
  const profit = order - refundLoss - fees - cogs - o.sampleCost - o.adSpend;
  return { price, order, fees, feeLines, refundLoss, cogs, sampleCost: o.sampleCost, adSpend: o.adSpend, profit, marginPct: order > 0 ? (profit / order) * 100 : 0 };
}

// Price that hits a target margin (margin is profit / order total).
// profit = order*(1 - r - f - m) - (F + C + A + S) = 0 solved for order.
export function solvePrice(o, targetMarginPct, platform = o.platform) {
  const fm = feeModel(o, platform);
  const k = 1 - o.refundPct / 100 - fm.pct - targetMarginPct / 100;
  if (!(k > 0)) return null;
  const order = (fm.fixed + o.baseCost + o.shipCost + o.sampleCost + o.adSpend) / k;
  const price = order - o.shipCharged;
  return price > 0 ? price : null;
}

export function priceLadder(o, platform = o.platform) {
  return [-20, -10, 0, 10, 20, 30].map((d) => {
    const price = round2(o.price * (1 + d / 100));
    return { deltaPct: d, ...unit(o, price, platform) };
  });
}

export function comparePlatforms(o) {
  return Object.keys(PLATFORMS).filter((k) => k !== "custom").map((k) => ({ key: k, name: PLATFORMS[k].name, ...unit(o, o.price, k) }));
}

export function analyze(input) {
  const o = normalise(input);
  const errors = validate(o);
  if (errors.length) return { errors };
  const u = unit(o, o.price, o.platform);
  const noAd = unit({ ...o, adSpend: 0 }, o.price, o.platform);
  const warnings = [];
  if (u.profit < 0) warnings.push("You lose money on every sale at this price.");
  else if (u.marginPct < 10) warnings.push("Under 10% margin leaves no room for a refund streak, a price cut or an ad.");
  if (o.platform !== "custom" && o.baseCost > o.price * 0.7) warnings.push("The supplier cost is over 70% of the price; most of the sale goes to production before any fee.");
  const target = solvePrice(o, o.targetMarginPct);
  const maxAd = noAd.profit;
  return {
    errors: [],
    warnings,
    inputs: o,
    unit: u,
    target: { marginPct: o.targetMarginPct, price: target },
    maxAdSpend: maxAd,
    breakEvenRoas: maxAd > 0 ? u.order / maxAd : null,
    ladder: priceLadder(o),
    platforms: comparePlatforms(o),
    monthly: o.orders > 0 ? { orders: o.orders, profit: u.profit * o.orders, revenue: u.order * o.orders } : null,
  };
}

export function sampleInputs() {
  return { platform: "etsy", price: 29.99, shipCharged: 0, baseCost: 14.5, shipCost: 4.75, refundPct: 2, adSpend: 0, sampleCost: 0.5, offsitePct: 15, offsiteShare: 10, orders: 100, targetMarginPct: 30 };
}

export function summaryText(r) {
  if (r.errors && r.errors.length) return r.errors.join(" ");
  const { unit: u, inputs: o } = r;
  const L = [];
  L.push(`Print-on-demand profit on ${PLATFORMS[o.platform].name} (fee rates as of ${RATES_AS_OF}; verify against the current schedule)`);
  L.push(`Order total $${money(u.order)} (price $${money(o.price)} + shipping charged $${money(o.shipCharged)})`);
  for (const f of u.feeLines) L.push(`  ${f.label}: -$${money(f.amount)}`);
  L.push(`  Supplier item + shipping: -$${money(u.cogs)}`);
  if (u.refundLoss) L.push(`  Refunds (${o.refundPct}% of orders): -$${money(u.refundLoss)}`);
  if (u.sampleCost) L.push(`  Samples per sale: -$${money(u.sampleCost)}`);
  if (u.adSpend) L.push(`  Ad spend per sale: -$${money(u.adSpend)}`);
  L.push(`Profit per sale: $${money(u.profit)} (${round2(u.marginPct)}% of the order total)`);
  if (r.target.price) L.push(`Price for a ${r.target.marginPct}% margin: $${money(r.target.price)}`);
  if (r.maxAdSpend > 0) L.push(`Most you can pay per sale in ads and still break even: $${money(r.maxAdSpend)}${r.breakEvenRoas ? ` (break-even ROAS ${round2(r.breakEvenRoas)}x)` : ""}`);
  if (r.monthly) L.push(`At ${r.monthly.orders} orders: $${money(r.monthly.profit)} profit on $${money(r.monthly.revenue)} revenue`);
  return L.join("\n");
}

export function csvText(r) {
  if (r.errors && r.errors.length) return "";
  const rows = [["price", "order_total", "fees", "supplier_cost", "profit", "margin_pct"]];
  for (const l of r.ladder) rows.push([l.price, round2(l.order), round2(l.fees), round2(l.cogs), round2(l.profit), round2(l.marginPct)]);
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
