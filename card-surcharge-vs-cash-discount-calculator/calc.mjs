// Card surcharge vs cash discount vs absorbing the fee, for a small merchant.
// Pure arithmetic on the user's own inputs; no network, no model.
//
// Monthly figures. Let S be total sales, Sc = S * cardShare the card sales,
// N = Sc / avgTicket the card transactions, m the contribution margin.
// Card cost of a sale of value V is V * rate + fee per transaction.
//   absorb     : P0 = S*m - Sc*rate - N*fee
//   surcharge  : card customers pay V*(1+s). A share `shift` pay cash/debit
//                instead, a share `lost` walk away, the rest stay on card.
//                The processor charges its rate on the surcharge too.
//   cash disc. : card price is the list price; cash pays V*(1-d). The same
//                shift/lost shares apply; shifted sales give up d of revenue.


export function money(n) {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
export function pct(x, d = 1) { return (x * 100).toFixed(d) + "%"; }

export function normalise(raw) {
  const i = {
    monthlySales: Number(raw.monthlySales) || 0,
    cardShare: Number(raw.cardShare) || 0,
    avgTicket: Number(raw.avgTicket) || 0,
    rate: Number(raw.rate) || 0,
    fee: Number(raw.fee) || 0,
    margin: Number(raw.margin) || 0,
    surcharge: Number(raw.surcharge) || 0,
    cashDiscount: Number(raw.cashDiscount) || 0,
    shift: Number(raw.shift) || 0,
    lost: Number(raw.lost) || 0,
  };
  const bad = (k) => !Number.isFinite(i[k]) || i[k] < 0;
  for (const k of Object.keys(i)) if (bad(k)) return { invalid: `${k} must be zero or more.` };
  if (i.monthlySales <= 0) return { invalid: "Enter your monthly sales." };
  if (i.avgTicket <= 0) return { invalid: "Enter your average ticket." };
  if (i.cardShare <= 0 || i.cardShare > 1) return { invalid: "Card share must be between 0 and 100%." };
  if (i.rate >= 1) return { invalid: "Processing rate must be under 100%." };
  if (i.margin > 1) return { invalid: "Margin cannot exceed 100%." };
  if (i.shift + i.lost > 1) return { invalid: "Shifted plus lost customers cannot exceed 100% of card customers." };
  if (i.cashDiscount >= 1) return { invalid: "Cash discount must be under 100%." };
  return i;
}

export function feeCost(i) {
  const card = i.monthlySales * i.cardShare;
  return card * i.rate + (card / i.avgTicket) * i.fee;
}

function profit(i, scenario, s, d, lost, shift) {
  const card = i.monthlySales * i.cardShare;
  const stay = 1 - shift - lost;
  const soldRevenue = i.monthlySales - card * lost;
  let feeRate = 0, extra = 0;
  if (scenario === "surcharge") {
    extra = card * stay * s;
    feeRate = card * stay * (1 + s) * i.rate + (card * stay / i.avgTicket) * i.fee;
  } else if (scenario === "cash") {
    extra = -card * shift * d;
    feeRate = card * stay * i.rate + (card * stay / i.avgTicket) * i.fee;
  } else {
    feeRate = card * i.rate + (card / i.avgTicket) * i.fee;
  }
  return soldRevenue * i.margin - feeRate + extra;
}

export function scenarioProfit(i, scenario, overrides = {}) {
  const s = overrides.surcharge ?? i.surcharge;
  const d = overrides.cashDiscount ?? i.cashDiscount;
  const lost = overrides.lost ?? i.lost;
  const shift = overrides.shift ?? i.shift;
  return profit(i, scenario, s, d, lost, shift);
}

// Surcharge that exactly repays the processing cost when nobody changes behaviour.
export function fullRecoverySurcharge(i) {
  return (i.rate + i.fee / i.avgTicket) / (1 - i.rate);
}

// Largest share of card customers who can walk away before the scenario is
// worse than absorbing the fee. Profit is linear in `lost`, so two points solve it.
export function breakEvenLost(i, scenario, overrides = {}) {
  const at = (l) => scenarioProfit(i, scenario, { ...overrides, lost: l }) - scenarioProfit(i, "absorb", { lost: 0 });
  const maxLost = 1 - (overrides.shift ?? i.shift);
  const a = at(0), b = at(maxLost);
  if (a < 0) return { lost: 0, reason: "never" };
  if (b >= 0) return { lost: maxLost, reason: "always" };
  return { lost: (a / (a - b)) * maxLost, reason: "ok" };
}

export function outcome(raw) {
  const i = normalise(raw);
  if (i.invalid) return i;
  const base = scenarioProfit(i, "absorb", { lost: 0, shift: 0 });
  const sur = scenarioProfit(i, "surcharge");
  const cash = scenarioProfit(i, "cash");
  const fees = feeCost(i);
  const recover = fullRecoverySurcharge(i);
  const beSur = breakEvenLost(i, "surcharge");
  const beCash = breakEvenLost(i, "cash");
  const findings = [];
  if (i.surcharge > 0.03) findings.push({ severity: "high", title: "Surcharge above 3%", detail: "Card brand rules are commonly reported to cap surcharges at 3% of the transaction, and some states set lower caps or ban surcharging. Confirm the current rules with your processor and state before charging it." });
  else if (i.surcharge > 0) findings.push({ severity: "info", title: "Check surcharge rules first", detail: "Surcharging is restricted or banned in some states, is generally not allowed on debit cards, and needs disclosure at the door and on receipts. Confirm with your processor." });
  if (sur - base < 0) findings.push({ severity: "medium", title: "Surcharge loses money at your customer response", detail: `With ${pct(i.shift, 0)} switching and ${pct(i.lost, 0)} walking away, the surcharge leaves you ${money(base - sur)} a month worse off than absorbing the fee.` });
  if (cash - base < 0) findings.push({ severity: "medium", title: "Cash discount loses money at your customer response", detail: `The cash discount leaves you ${money(base - cash)} a month worse off than absorbing the fee, because each shifted sale gives up the discount.` });
  if (fees / i.monthlySales > 0.03) findings.push({ severity: "info", title: "Fees are a large share of sales", detail: `Processing takes ${pct(fees / i.monthlySales, 2)} of total sales. A lower-rate plan or interchange-plus pricing may recover more than a surcharge would.` });
  const ss = [0, 0.01, 0.02, 0.03];
  const ls = [0, 0.02, 0.05, 0.1];
  const sensitivity = { surcharges: ss, losts: ls, rows: ss.map((s) => ({ surcharge: s, cells: ls.map((l) => scenarioProfit(i, "surcharge", { surcharge: s, lost: l }) - base)})) };
  return { input: i, monthlyFees: fees, baseProfit: base, surchargeProfit: sur, cashProfit: cash,
    surchargeDelta: sur - base, cashDelta: cash - base, fullRecoverySurcharge: recover,
    breakEvenLostSurcharge: beSur, breakEvenLostCash: beCash, findings, sensitivity };
}
