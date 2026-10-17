// What an online course launch earns after refunds, fees, affiliates and ad spend. Pure functions, no DOM.
// Arithmetic on figures the user types; no conversion rate, price, fee schedule or tax treatment is asserted
// anywhere in here. Assumptions are stated on the page: processor fees are not returned on a refund, while the
// platform fee and affiliate commission apply to kept sales only.

export const DEFAULTS = Object.freeze({
  listSize: 0,
  visitPct: 10,
  convPct: 2,
  adSpend: 0,
  cpc: 0,
  paidConvPct: 1,
  price: 0,
  refundPct: 5,
  processorPct: 2.9,
  processorFixed: 0.3,
  platformPct: 0,
  affiliateSalesPct: 0,
  affiliateCommissionPct: 30,
  fixedCosts: 0,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const clean = (s) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (s && s[k] !== undefined) o[k] = num(s[k], DEFAULTS[k]);
  return o;
};

// Expected money kept from one buyer after the refund chance, processor, platform and affiliate cuts.
export function perBuyer(o) {
  const kept = 1 - o.refundPct / 100;
  const gross = o.price;
  const refunds = o.price * (1 - kept);
  const processor = o.price * (o.processorPct / 100) + o.processorFixed;
  const platform = o.price * (o.platformPct / 100) * kept;
  const affiliate = o.price * (o.affiliateSalesPct / 100) * (o.affiliateCommissionPct / 100) * kept;
  return { gross, refunds, processor, platform, affiliate, net: gross - refunds - processor - platform - affiliate };
}

function outcome(o, convScale = 1, priceOverride = null) {
  const q = priceOverride === null ? o : { ...o, price: priceOverride };
  const pb = perBuyer(q);
  const organicVisitors = q.listSize * (q.visitPct / 100);
  const paidVisitors = q.cpc > 0 ? q.adSpend / q.cpc : 0;
  const organicBuyers = organicVisitors * (q.convPct / 100) * convScale;
  const paidBuyers = paidVisitors * (q.paidConvPct / 100) * convScale;
  const buyers = organicBuyers + paidBuyers;
  const grossRevenue = buyers * pb.gross;
  const net = buyers * pb.net - q.adSpend - q.fixedCosts;
  return { buyers, organicBuyers, paidBuyers, organicVisitors, paidVisitors, grossRevenue, net, pb };
}

const CONV_SCALES = [0.25, 0.5, 0.75, 1, 1.25, 1.5];
const PRICE_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function analyze(settingsIn) {
  const o = clean(settingsIn);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (!(o.price > 0)) return { error: "Enter the course price, above 0." };
  if (!(o.listSize > 0) && !(o.adSpend > 0 && o.cpc > 0)) return { error: "Enter an email list size, or an ad budget with a cost per visit, so the launch has some traffic." };
  for (const k of ["visitPct", "convPct", "paidConvPct", "refundPct", "platformPct", "affiliateSalesPct", "affiliateCommissionPct", "processorPct"]) {
    if (o[k] > 100) return { error: `"${k}" is a percentage and cannot be above 100.` };
  }
  if (o.refundPct >= 100) return { error: "A refund rate of 100% means no sale is kept." };
  if (o.adSpend > 0 && !(o.cpc > 0)) return { error: "Add the cost per visit (CPC) for your ads, or set ad spend to 0." };

  const base = outcome(o);
  const pb = base.pb;
  const warnings = [];
  const totalCosts = o.adSpend + o.fixedCosts;

  const beBuyers = pb.net > 0 ? totalCosts / pb.net : Infinity;
  const totalVisitors = base.organicVisitors + base.paidVisitors;
  // Overall visit-to-sale rate that would just cover costs, holding traffic where you typed it.
  const beConvPct = Number.isFinite(beBuyers) && totalVisitors > 0 ? (beBuyers / totalVisitors) * 100 : null;
  // List size needed with ad traffic unchanged: organic buyers still required divided by (visit rate x conversion).
  const organicNeeded = Number.isFinite(beBuyers) ? Math.max(0, beBuyers - base.paidBuyers) : Infinity;
  const perListMember = (o.visitPct / 100) * (o.convPct / 100);
  const beListSize = Number.isFinite(organicNeeded) && perListMember > 0 ? organicNeeded / perListMember : null;

  const totals = {
    ...base,
    refunds: base.buyers * pb.refunds,
    processor: base.buyers * pb.processor,
    platform: base.buyers * pb.platform,
    affiliate: base.buyers * pb.affiliate,
    adSpend: o.adSpend,
    fixedCosts: o.fixedCosts,
    netPerBuyer: pb.net,
    profitPerListMember: o.listSize > 0 ? base.net / o.listSize : null,
    roas: o.adSpend > 0 && base.paidBuyers > 0 ? (base.paidBuyers * pb.net) / o.adSpend : null,
    beBuyers: Number.isFinite(beBuyers) ? beBuyers : null,
    beConvPct,
    beListSize,
  };

  if (pb.net <= 0) warnings.push("After fees, refunds and affiliate commissions each sale keeps nothing at this price, so no number of buyers covers your costs. Check the fee and commission figures.");
  if (o.adSpend > 0 && base.paidBuyers > 0 && totals.roas !== null && totals.roas < 1) warnings.push(`The paid traffic returns ${totals.roas.toFixed(2)} per 1 spent after fees, so ads alone lose money on the first sale. That can still be right if buyers come back, but the launch itself does not cover them.`);
  if (o.paidConvPct > o.convPct && o.adSpend > 0) warnings.push("Cold traffic usually converts below your own list. Check that the ad conversion rate is not set above the list's.");
  if (o.convPct > 10) warnings.push("A list conversion above 10% is unusual for a priced course. Treat the result as a best case and try the lower scenarios below.");

  const conv = CONV_SCALES.map((s) => {
    const x = outcome(o, s);
    return { scale: s, convPct: o.convPct * s, buyers: x.buyers, grossRevenue: x.grossRevenue, net: x.net };
  });
  // Price ladder holds conversion where you typed it, which a real price change would not.
  const prices = PRICE_SCALES.map((s) => {
    const p = Math.round(o.price * s * 100) / 100;
    const x = outcome(o, 1, p);
    return { price: p, buyers: x.buyers, grossRevenue: x.grossRevenue, net: x.net, netPerBuyer: x.pb.net };
  });
  // Buyers needed at each price to match today's profit: the honest question behind a price change.
  prices.forEach((x) => { x.buyersToMatch = x.netPerBuyer > 0 ? (base.net + totalCosts) / x.netPerBuyer : null; });

  let verdict;
  const n = Math.round(base.buyers * 10) / 10;
  if (base.net > 0.5) verdict = `On your numbers the launch sells about ${n} copies and clears about ${Math.round(base.net).toLocaleString("en-US")} after every cost.`;
  else if (base.net < -0.5) verdict = `On your numbers the launch sells about ${n} copies and loses about ${Math.round(-base.net).toLocaleString("en-US")} after every cost.`;
  else verdict = `On your numbers the launch sells about ${n} copies and roughly breaks even.`;

  return { settings: o, totals, conv, prices, verdict, warnings };
}

export function sampleJob() {
  return {
    settings: {
      listSize: 4000, visitPct: 12, convPct: 2.5, adSpend: 1500, cpc: 1.2, paidConvPct: 1.2,
      price: 297, refundPct: 6, processorPct: 2.9, processorFixed: 0.3, platformPct: 5,
      affiliateSalesPct: 20, affiliateCommissionPct: 30, fixedCosts: 800,
    },
  };
}

const f2 = (v) => (v === null || !Number.isFinite(v) ? "" : v.toFixed(2));
export function reportCsv(r) {
  const t = r.totals;
  const rows = [["Line", "Amount"],
    ["Expected buyers", f2(t.buyers)], ["Gross revenue", f2(t.grossRevenue)], ["Refunds", f2(-t.refunds)],
    ["Processor fees", f2(-t.processor)], ["Platform fees", f2(-t.platform)], ["Affiliate commissions", f2(-t.affiliate)],
    ["Ad spend", f2(-t.adSpend)], ["Fixed launch costs", f2(-t.fixedCosts)], ["Net profit", f2(t.net)],
    ["Break-even buyers", f2(t.beBuyers)], ["Break-even visit-to-sale rate %", f2(t.beConvPct)], ["Break-even list size", f2(t.beListSize)]];
  rows.push([], ["Conversion scenario %", "Buyers", "Net profit"]);
  for (const c of r.conv) rows.push([f2(c.convPct), f2(c.buyers), f2(c.net)]);
  const q = (c) => { const s = String(c ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => v.toFixed(d) + "%";
