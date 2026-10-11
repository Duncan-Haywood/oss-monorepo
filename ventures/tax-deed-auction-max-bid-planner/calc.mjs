// Maximum bid at a tax deed auction. Works backwards from what the property
// will sell for to the most you can bid and still clear your target profit
// after every cost that follows a tax-deed win: buyer's premium and recording,
// liens the deed does not wipe out, clearing title and occupants, repairs,
// carrying costs and the return your cash could have earned meanwhile.
//
//   profit(B) = resale * (1 - sellCost) - holding - (A(B) + repairs) * (1 + carry)
//   A(B)      = B * (1 + premium) + recording + liens + quietTitle + eviction
//   carry     = interest * months / 12
//
// profit is linear in B, so the max bid is closed-form:
//   B = (((resale * (1 - sellCost) - holding - target) / (1 + carry))
//        - repairs - recording - liens - quietTitle - eviction) / (1 + premium)

export const MAX_BIDS = 6;

export function validateInput(i) {
  const e = [];
  const pos = (v) => Number.isFinite(v) && v > 0;
  const nonneg = (v) => Number.isFinite(v) && v >= 0;
  if (!pos(i.resale)) e.push("Enter the price you expect to sell for, above zero.");
  if (!(nonneg(i.sellCostPct) && i.sellCostPct < 30)) e.push("Selling costs must be between 0% and 30%.");
  if (!(nonneg(i.premiumPct) && i.premiumPct <= 30)) e.push("Buyer's premium must be between 0% and 30%.");
  if (!(nonneg(i.interestPct) && i.interestPct <= 40)) e.push("Return on cash must be between 0% and 40%.");
  if (!(Number.isFinite(i.months) && i.months > 0 && i.months <= 60)) e.push("Months to resell must be between 0 and 60.");
  for (const k of ["repairs", "monthlyHolding", "recording", "liens", "quietTitle", "eviction", "targetProfitMin"])
    if (!nonneg(i[k])) e.push("Costs must be zero or more.");
  if (!(nonneg(i.targetProfitPct) && i.targetProfitPct < 60)) e.push("Target profit must be between 0% and 60% of resale.");
  if (!Array.isArray(i.bids) || i.bids.length < 1) e.push("Add at least one bid to test.");
  else if (i.bids.length > MAX_BIDS) e.push(`This tool tests up to ${MAX_BIDS} bids.`);
  else i.bids.forEach((b, k) => { if (!pos(b.amount)) e.push(`Bid ${k + 1}: enter an amount above zero.`); });
  return e;
}

function costsAt(i, bid) {
  const carry = (i.interestPct / 100) * (i.months / 12);
  const premium = bid * (i.premiumPct / 100);
  const acquisition = bid + premium + i.recording + i.liens + i.quietTitle + i.eviction;
  const carrying = (acquisition + i.repairs) * carry;
  const holding = i.monthlyHolding * i.months;
  const selling = i.resale * (i.sellCostPct / 100);
  const allIn = acquisition + i.repairs + carrying + holding;
  const net = i.resale - selling - allIn;
  return { premium, acquisition, carrying, holding, selling, allIn, net };
}

export function profitAt(i, bid, resale = i.resale) {
  return costsAt({ ...i, resale }, bid).net;
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const i = input;
  const carry = (i.interestPct / 100) * (i.months / 12);
  const target = Math.max(i.resale * (i.targetProfitPct / 100), i.targetProfitMin);
  const netResale = i.resale * (1 - i.sellCostPct / 100) - i.monthlyHolding * i.months;
  const raw = ((netResale - target) / (1 + carry) - i.repairs - i.recording - i.liens - i.quietTitle - i.eviction) / (1 + i.premiumPct / 100);
  const maxBid = Math.max(0, raw);
  const fixedNonBid = i.recording + i.liens + i.quietTitle + i.eviction;

  const options = i.bids.map((b, k) => {
    const c = costsAt(i, b.amount);
    const cash = c.acquisition + i.repairs;
    const roi = cash > 0 ? c.net / cash : 0;
    const annual = roi * (12 / i.months);
    const stress = [0.9, 0.8].map((f) => profitAt(i, b.amount, i.resale * f));
    return {
      index: k + 1, label: b.label || `Bid ${k + 1}`, amount: b.amount,
      premium: c.premium, allIn: c.allIn, carrying: c.carrying, net: c.net,
      margin: c.net / i.resale, roi, annual, cash, vsTarget: c.net - target,
      headroom: maxBid - b.amount, stress10: stress[0], stress20: stress[1],
      clears: c.net >= target - 1e-6,
    };
  });
  // value drop that wipes out profit at the max bid: profit is linear in resale
  const slope = 1 - i.sellCostPct / 100; // d(net)/d(resale)
  const wipeout = maxBid > 0 ? target / (i.resale * slope) : null;
  const best = options.reduce((a, o) => (o.net > a.net ? o : a), options[0]);
  return {
    ok: true, input: i, maxBid, target, fixedNonBid, wipeoutDropPct: wipeout === null ? null : wipeout * 100,
    breakEvenBid: breakEven(i), options, bestIndex: best.index,
    notes: buildNotes(i, options, maxBid, raw),
  };
}

// Highest bid at which profit is exactly zero.
export function breakEven(i) {
  const carry = (i.interestPct / 100) * (i.months / 12);
  const netResale = i.resale * (1 - i.sellCostPct / 100) - i.monthlyHolding * i.months;
  const raw = (netResale / (1 + carry) - i.repairs - i.recording - i.liens - i.quietTitle - i.eviction) / (1 + i.premiumPct / 100);
  return Math.max(0, raw);
}

function buildNotes(i, options, maxBid, raw) {
  const n = [];
  if (raw <= 0) n.push("Even a bid of zero does not reach your target profit with these costs. Skip it, or re-check the resale value and the liens that survive the sale.");
  else n.push(`Do not bid above ${money(maxBid)}. Above it, the deal earns less than your target after the costs you listed.`);
  const over = options.filter((o) => !o.clears);
  if (over.length) n.push(`${over.length} of your test bids miss the target profit; ${options.filter((o) => o.net < 0).length} lose money.`);
  if (i.liens > 0) n.push("Liens that survive a tax deed (some municipal, IRS, HOA or easement liens, depending on the state) become yours. Confirm with a title search; this tool only subtracts the amount you typed.");
  if (i.quietTitle === 0) n.push("You entered no cost to clear title. Many tax deed buyers file a quiet-title action before they can insure a resale; budget for it unless the county guarantees the deed.");
  if (i.eviction === 0) n.push("You entered no cost for occupants. If the property may be occupied, remember notice periods, legal fees and delay.");
  return n;
}

export function money(x) {
  const neg = x < 0;
  const s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (neg ? "-$" : "$") + s;
}
export const pct = (x) => (x * 100).toFixed(1) + "%";

export function sampleInput() {
  return {
    resale: 120000, sellCostPct: 7, repairs: 30000, months: 6, monthlyHolding: 650, interestPct: 10,
    premiumPct: 5, recording: 450, liens: 3500, quietTitle: 3500, eviction: 2500,
    targetProfitPct: 12, targetProfitMin: 15000,
    bids: [{ label: "Opening bid", amount: 22000 }, { label: "Likely", amount: 38000 }, { label: "Stretch", amount: 52000 }],
  };
}

export function resultText(r) {
  const lines = [`Tax deed auction max bid: resale ${money(r.input.resale)}, ${r.input.months} months to resell`,
    `Maximum bid for a ${money(r.target)} profit: ${money(r.maxBid)} (break-even bid ${money(r.breakEvenBid)})`];
  for (const o of r.options) lines.push(`${o.label} ${money(o.amount)}: ${money(o.net)} profit, ${pct(o.roi)} on cash, ${o.clears ? "clears" : "misses"} the target`);
  lines.push("Arithmetic on the numbers entered, not legal, tax, title or investment advice.");
  return lines.join("\n");
}

export function resultCsv(r) {
  const head = "bid_label,bid,buyers_premium,all_in_cost,carrying_cost,profit,roi_on_cash,annualized,clears_target,profit_if_value_down_10pct,profit_if_value_down_20pct";
  const f = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v === true ? "yes" : v === false ? "no" : `"${String(v).replace(/"/g, '""')}"`);
  return [head, ...r.options.map((o) => [o.label, o.amount, o.premium, o.allIn, o.carrying, o.net, o.roi, o.annual, o.clears, o.stress10, o.stress20].map(f).join(","))].join("\n");
}

export function serializeState(input) { return JSON.stringify({ app: "tax-deed-auction-max-bid-planner", version: 1, input }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== "tax-deed-auction-max-bid-planner" || !d.input) return { error: "That file is not a saved max-bid scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input };
}
