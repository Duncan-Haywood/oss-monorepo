// Pure payout arithmetic for an indie game sold on Steam, Epic Games Store,
// itch.io and GOG. No network, no stored live schedule beyond the constants
// below. Every rate is the store's publicly stated headline term as the
// author understands it and is editable on the page -- there was no live
// fetch and no real payout statement to check against, and stores change
// their terms. Treat the defaults as a starting point, not a quote.
//
// What this exists to answer, per store, for the same game:
//   - how much of the buyer's money reaches you after tax, refunds, the
//     store's cut, payment-processor fees and any withholding on your payout;
//   - how many copies you must sell to cover what the game cost to make;
//   - how many to sell to reach a profit you name.
//
// Tiered terms (Steam's cut falls with lifetime revenue, Epic's first
// million is free of cut) apply MARGINALLY to the revenue slice, so a game
// that already earned some lifetime revenue is priced correctly by typing it.

export const STORES = Object.freeze({
  steam: {
    label: 'Steam',
    // Cut by lifetime adjusted gross revenue for the app: 30% to $10M, 25% to
    // $50M, 20% beyond.
    brackets: [
      { upTo: 10_000_000, rate: 30 },
      { upTo: 50_000_000, rate: 25 },
      { upTo: Infinity, rate: 20 },
    ],
    processorPct: 0,
    perSaleFixed: 0,
    // Steam Direct's per-title fee, recouped once the title reaches $1,000 in
    // adjusted gross revenue.
    directFee: { amount: 100, recoupAt: 1000 },
    note: 'Steam Direct fee of $100 per title, recouped at $1,000 adjusted gross revenue.',
  },
  epic: {
    label: 'Epic Games Store',
    // 0% on the first $1M of lifetime revenue per app, then 12%. Whether a
    // given title qualifies depends on launch date and program terms.
    brackets: [
      { upTo: 1_000_000, rate: 0 },
      { upTo: Infinity, rate: 12 },
    ],
    processorPct: 0,
    perSaleFixed: 0,
    directFee: null,
    note: 'Epic Games Store: 0% on the first $1M of lifetime revenue (if your title qualifies; edit the amount, or type 0), then 12%.',
  },
  itch: {
    label: 'itch.io',
    // itch.io lets the creator pick their own share of each sale (default 10%).
    brackets: [{ upTo: Infinity, rate: 10 }],
    processorPct: 2.9,
    perSaleFixed: 0.3,
    directFee: null,
    note: 'itch.io: you choose the share you give itch.io (default 10%); payment-processor fees are on top of that.',
  },
  gog: {
    label: 'GOG',
    brackets: [{ upTo: Infinity, rate: 30 }],
    processorPct: 0,
    perSaleFixed: 0,
    directFee: null,
    note: 'GOG publishes a 30% standard split; GOG curates which titles it takes.',
  },
});

export const STORE_IDS = Object.freeze(Object.keys(STORES));

export const INPUT_IDS = Object.freeze([
  'price', 'units', 'realizedPct', 'refundPct', 'taxPct', 'withholdPct',
  'lifetimeBefore', 'devCost', 'targetProfit', 'itchSharePct', 'steamFee', 'epicFreeUpTo',
]);

export const DEFAULTS = Object.freeze({
  price: 19.99,
  units: 5000,
  realizedPct: 80, // regional pricing and sales lower the average realised price
  refundPct: 6,
  taxPct: 0, // blended VAT/sales tax that is inside the buyer's price
  withholdPct: 0, // tax withheld from your payout (treaty, W-8BEN, etc.)
  lifetimeBefore: 0,
  devCost: 0,
  targetProfit: 0,
  itchSharePct: 10,
  steamFee: 100,
  epicFreeUpTo: 1_000_000, // lifetime revenue on which Epic takes 0%; type 0 if your title does not qualify
});

const num = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Check and normalise the form values. Returns { ok, values } or { ok:false, errors }. */
export function readInputs(raw = {}) {
  const v = {};
  const errors = [];
  for (const id of INPUT_IDS) {
    const given = raw[id] === undefined || raw[id] === '' ? DEFAULTS[id] : raw[id];
    v[id] = num(given);
    if (!Number.isFinite(v[id])) errors.push(`${id} must be a number`);
  }
  if (errors.length) return { ok: false, errors };
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(v.price > 0, 'Price must be above zero.');
  need(v.units >= 0, 'Units cannot be negative.');
  need(v.realizedPct > 0 && v.realizedPct <= 100, 'Average realised price must be between 0 and 100 percent of list.');
  need(v.refundPct >= 0 && v.refundPct < 100, 'Refund rate must be from 0 up to 100 percent.');
  need(v.taxPct >= 0 && v.taxPct < 100, 'Tax inside the price must be from 0 up to 100 percent.');
  need(v.withholdPct >= 0 && v.withholdPct < 100, 'Withholding must be from 0 up to 100 percent.');
  need(v.lifetimeBefore >= 0, 'Lifetime revenue already earned cannot be negative.');
  need(v.devCost >= 0, 'Development cost cannot be negative.');
  need(v.itchSharePct >= 0 && v.itchSharePct <= 100, 'itch.io share must be from 0 to 100 percent.');
  need(v.steamFee >= 0, 'Steam Direct fee cannot be negative.');
  need(v.epicFreeUpTo >= 0, 'Epic zero-cut amount cannot be negative.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, values: v };
}

/** Marginal cut on a revenue slice that starts at `before` lifetime revenue. */
export function bracketCut(brackets, before, slice) {
  let cut = 0;
  let from = before;
  let left = slice;
  for (const b of brackets) {
    if (left <= 0) break;
    if (from >= b.upTo) continue;
    const room = Math.min(left, b.upTo - from);
    cut += room * (b.rate / 100);
    from += room;
    left -= room;
  }
  return cut;
}

function storeTerms(id, v) {
  const s = STORES[id];
  if (id === 'itch') return { ...s, brackets: [{ upTo: Infinity, rate: v.itchSharePct }] };
  if (id === 'epic') return { ...s, brackets: [{ upTo: v.epicFreeUpTo, rate: 0 }, { upTo: Infinity, rate: 12 }] };
  if (id === 'steam') return { ...s, directFee: v.steamFee > 0 ? { amount: v.steamFee, recoupAt: s.directFee.recoupAt } : null };
  return s;
}

/** Payout for `units` copies sold on one store. All money in the game's currency. */
export function payout(id, v, units = v.units) {
  const s = storeTerms(id, v);
  const listGross = units * v.price * (v.realizedPct / 100);
  const refunded = listGross * (v.refundPct / 100);
  const afterRefunds = listGross - refunded;
  const tax = afterRefunds - afterRefunds / (1 + v.taxPct / 100);
  const adjustedGross = afterRefunds - tax;
  const cut = bracketCut(s.brackets, v.lifetimeBefore, adjustedGross);
  const keptSales = units * (1 - v.refundPct / 100);
  const processor = adjustedGross * (s.processorPct / 100) + keptSales * s.perSaleFixed;
  const beforeWithholding = adjustedGross - cut - processor;
  const withholding = Math.max(0, beforeWithholding) * (v.withholdPct / 100);
  const received = beforeWithholding - withholding;
  let directFeeNet = 0;
  if (s.directFee) {
    directFeeNet = v.lifetimeBefore + adjustedGross >= s.directFee.recoupAt ? 0 : s.directFee.amount;
  }
  const profit = received - directFeeNet - v.devCost;
  return {
    store: id,
    label: s.label,
    units,
    listGross: round2(listGross),
    refunded: round2(refunded),
    tax: round2(tax),
    adjustedGross: round2(adjustedGross),
    cut: round2(cut),
    processor: round2(processor),
    withholding: round2(withholding),
    received: round2(received),
    directFeeNet: round2(directFeeNet),
    takePct: adjustedGross > 0 ? round2(((adjustedGross - received) / adjustedGross) * 100) : 0,
    perUnitReceived: units > 0 ? round2(received / units) : 0,
    profit: round2(profit),
    note: s.note,
  };
}

/**
 * Smallest whole number of copies whose profit reaches `target`, or null if
 * the store's terms make it unreachable (a payout of zero or less per copy).
 * Profit rises with units, so this is a search on a monotone function.
 */
export function unitsForProfit(id, v, target) {
  const at = (n) => payout(id, v, n).profit;
  if (at(0) >= target) return 0;
  let hi = 1;
  while (at(hi) < target) {
    hi *= 2;
    if (hi > 1e9) return null;
  }
  let lo = Math.floor(hi / 2);
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (at(mid) >= target) hi = mid; else lo = mid;
  }
  return hi;
}

/** Every store side by side, ranked by profit at the typed unit count. */
export function compareStores(v) {
  const rows = STORE_IDS.map((id) => {
    const p = payout(id, v);
    return {
      ...p,
      breakEvenUnits: unitsForProfit(id, v, 0),
      targetUnits: v.targetProfit > 0 ? unitsForProfit(id, v, v.targetProfit) : null,
    };
  });
  rows.sort((a, b) => b.profit - a.profit);
  return rows;
}

/**
 * Plain-language findings. Stores are not directly comparable on cut alone:
 * a listing on each is a separate decision with separate reach, so this states
 * the arithmetic and says what it leaves out rather than recommending one.
 */
export function findings(v, rows) {
  const out = [];
  const best = rows[0];
  const worst = rows[rows.length - 1];
  if (best && worst && best.store !== worst.store) {
    out.push({
      severity: 'info',
      title: `Same copies, ${money(best.profit - worst.profit)} apart`,
      detail: `At ${v.units.toLocaleString('en-US')} copies, ${best.label} leaves you ${money(best.received)} and ${worst.label} ${money(worst.received)}. This is the arithmetic only: the same copies will not sell on every store, because each has different reach.`,
    });
  }
  const steam = rows.find((r) => r.store === 'steam');
  if (steam && v.refundPct > 0) {
    out.push({
      severity: 'info',
      title: 'Refunds come out before the store cut',
      detail: `${v.refundPct}% refunded removes ${money(steam.refunded)} of sales before any cut is taken, so a refund does not cost you the store's percentage on that copy.`,
    });
  }
  if (v.taxPct === 0) {
    out.push({
      severity: 'medium',
      title: 'Tax inside the price is set to zero',
      detail: 'Where a store shows a price that includes VAT or sales tax, the tax is removed before your share is worked out, so leaving this at zero overstates your payout. Type a blended rate for your buyers (for example 10 to 20) to see the effect.',
    });
  }
  const unreachable = rows.filter((r) => r.breakEvenUnits === null);
  if (unreachable.length) {
    out.push({
      severity: 'high',
      title: 'Break-even is not reachable on some stores',
      detail: `${unreachable.map((r) => r.label).join(', ')}: each copy pays nothing after the store, fees and withholding, so no number of copies covers the cost.`,
    });
  }
  const slow = rows.filter((r) => r.breakEvenUnits !== null && r.breakEvenUnits > v.units && v.devCost > 0);
  if (slow.length) {
    out.push({
      severity: 'high',
      title: 'At this many copies the game does not pay for itself',
      detail: `${slow.map((r) => `${r.label} needs ${r.breakEvenUnits.toLocaleString('en-US')}`).join('; ')} copies to cover ${money(v.devCost)} of development cost; you typed ${v.units.toLocaleString('en-US')}.`,
    });
  }
  return out;
}

/** Wishlists to copies: a rule of thumb, not a forecast. */
export function unitsFromWishlists(wishlists, conversionPct) {
  const w = num(wishlists);
  const c = num(conversionPct);
  if (!Number.isFinite(w) || !Number.isFinite(c) || w < 0 || c < 0 || c > 100) return null;
  return Math.round(w * (c / 100));
}

export function money(v) {
  const n = Number(v) || 0;
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}$${s}`;
}

export function csvOf(rows) {
  const head = 'store,copies,adjusted_gross,store_cut,processor_fees,withholding,received,take_pct,profit,break_even_copies';
  const lines = rows.map((r) => [r.label, r.units, r.adjustedGross, r.cut, r.processor, r.withholding, r.received, r.takePct, r.profit, r.breakEvenUnits ?? ''].join(','));
  return [head, ...lines].join('\n');
}
