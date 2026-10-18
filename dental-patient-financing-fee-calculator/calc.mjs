// Compares three ways a dental or orthodontic practice can collect a large treatment fee: third-party patient financing
// (the practice pays a merchant fee and is funded within days), an in-house payment plan (down payment plus instalments,
// some patients stop paying), and paying in full at a discount. It values each at today's money, subtracts the cost of
// care, then weights by how many presented cases each option gets accepted. Arithmetic on the numbers the user types.

export const SHARED_DEFAULTS = {
  caseFee: "", careCostPct: "", cardFeePct: "", costOfMoneyPct: "", casesPerYear: "",
  merchantFeePct: "", fundingDays: "", accFin: "",
  downPct: "", months: "", stopPct: "", stopSharePct: "", adminPerMonth: "", accPlan: "",
  discountPct: "", accCash: "",
};
export const EXAMPLE_SHARED = {
  caseFee: "6500", careCostPct: "55", cardFeePct: "2.9", costOfMoneyPct: "8", casesPerYear: "120",
  merchantFeePct: "7", fundingDays: "3", accFin: "68",
  downPct: "20", months: "18", stopPct: "9", stopSharePct: "50", adminPerMonth: "6", accPlan: "58",
  discountPct: "5", accCash: "42",
};

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (t) => {
  const s = String(t ?? "").replace(/[$%\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

// Money received later is worth less: simple daily discounting for the funding delay.
const dayFactor = (rate, days) => 1 / (1 + rate * days / 365);

// Third-party financing: the practice receives the case fee less the merchant fee after the funding delay.
export function financing(p) {
  const received = p.fee * (1 - p.merchantFee);
  return { received, pv: received * dayFactor(p.rate, p.fundingDays), fees: p.fee * p.merchantFee, lost: 0, admin: 0 };
}

// In-house plan: down payment now, equal instalments monthly. A share of patients stop paying after a share of the term;
// card fees apply to every payment taken; admin cost applies to each month an account is still paying.
export function inHouse(p) {
  const down = p.fee * p.downPct;
  const monthly = p.months > 0 ? (p.fee - down) / p.months : 0;
  const stopMonth = Math.round(p.months * p.stopShare);
  let collected = down, fees = down * p.cardFee, admin = 0, pv = down * (1 - p.cardFee);
  for (let t = 1; t <= p.months; t++) {
    const payers = t > stopMonth ? 1 - p.stopRate : 1;
    const paid = monthly * payers;
    const cost = paid * p.cardFee + p.adminPerMonth * payers;
    collected += paid; fees += paid * p.cardFee; admin += p.adminPerMonth * payers;
    pv += (paid - cost) / (1 + p.rate / 12) ** t;
  }
  return { received: collected - fees - admin, pv, fees, lost: p.fee - collected, admin, monthly, down };
}

// Paying in full at a discount, by card.
export function payInFull(p) {
  const price = p.fee * (1 - p.discount);
  return { received: price * (1 - p.cardFee), pv: price * (1 - p.cardFee), fees: price * p.cardFee, lost: p.fee - price, admin: 0 };
}

export function analyze(inputs) {
  const warnings = [];
  const need = (k, label, min, max) => {
    const v = num(inputs[k]);
    if (v == null || Number.isNaN(v) || v < min || (max != null && v > max)) {
      warnings.push(`${label} must be a number${max != null ? ` from ${min} to ${max}` : ` of at least ${min}`}.`);
      return null;
    }
    return v;
  };
  const f = {
    fee: need("caseFee", "Treatment fee ($)", 1),
    care: need("careCostPct", "Your cost of delivering the treatment (% of fee)", 0, 100),
    card: need("cardFeePct", "Card processing fee (%)", 0, 20),
    rate: need("costOfMoneyPct", "What waiting for money costs you (% a year)", 0, 100),
    cases: need("casesPerYear", "Cases presented per year", 0),
    mf: need("merchantFeePct", "Financing company merchant fee (%)", 0, 40),
    days: need("fundingDays", "Days until financing pays you", 0, 365),
    accFin: need("accFin", "Cases accepted with financing offered (%)", 0, 100),
    down: need("downPct", "In-house plan down payment (%)", 0, 100),
    months: need("months", "In-house plan length (months)", 1, 120),
    stop: need("stopPct", "Patients who stop paying (%)", 0, 100),
    stopShare: need("stopSharePct", "How far into the plan they stop (% of term)", 0, 100),
    admin: need("adminPerMonth", "Admin cost per paying account per month ($)", 0),
    accPlan: need("accPlan", "Cases accepted with an in-house plan (%)", 0, 100),
    disc: need("discountPct", "Pay-in-full discount (%)", 0, 100),
    accCash: need("accCash", "Cases accepted when patients must pay in full (%)", 0, 100),
  };
  if (Object.values(f).some((v) => v == null)) return { ok: false, warnings };
  const p = {
    fee: f.fee, merchantFee: f.mf / 100, fundingDays: f.days, rate: f.rate / 100, cardFee: f.card / 100,
    downPct: f.down / 100, months: Math.round(f.months), stopRate: f.stop / 100, stopShare: f.stopShare / 100,
    adminPerMonth: f.admin, discount: f.disc / 100,
  };
  const care = f.fee * f.care / 100;
  const mk = (name, r, acc) => {
    const contribution = r.pv - care;
    return { name, ...r, care, contribution, acceptance: acc / 100, perPresented: contribution * acc / 100, perYear: contribution * acc / 100 * f.cases, accepted: f.cases * acc / 100 };
  };
  const options = [
    mk("Third-party financing", financing(p), f.accFin),
    mk("In-house payment plan", inHouse(p), f.accPlan),
    mk("Pay in full only", payInFull(p), f.accCash),
  ];
  const [fin, plan, cash] = options;
  // Acceptance a rival option would need to equal another option's expected value per presented case.
  const need2 = (a, b) => (b.contribution > 0 ? a.perPresented / b.contribution * 100 : null);
  const breakEven = {
    finVsPlan: need2(plan, fin),
    finVsCash: need2(cash, fin),
    planVsCash: need2(cash, plan),
  };
  // Merchant fee at which financing and the in-house plan earn the same per accepted case.
  const targetPv = plan.contribution + care;
  const merchantBreakEven = 1 - targetPv / dayFactor(p.rate, p.fundingDays) / f.fee;
  const sweep = [0, 5, 10, 20, 30].map((s) => {
    const r = inHouse({ ...p, stopRate: s / 100 });
    const c = r.pv - care;
    return { stop: s, contribution: c, perPresented: c * f.accPlan / 100, lost: r.lost };
  });
  const feeLadder = [3, 5, 7, 9, 12].map((m) => {
    const r = financing({ ...p, merchantFee: m / 100 });
    const c = r.pv - care;
    return { fee: m, contribution: c, perPresented: c * f.accFin / 100 };
  });
  const best = options.reduce((a, b) => (b.perYear > a.perYear ? b : a));
  return { ok: true, warnings, options, breakEven, merchantBreakEven: merchantBreakEven * 100, sweep, feeLadder, best, care, cases: f.cases };
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["option", "money_received_in_today_terms", "cost_of_care", "contribution_per_accepted_case", "acceptance_pct", "contribution_per_case_presented", "contribution_per_year"].join(",")];
  for (const o of a.options) lines.push([q(o.name), o.pv.toFixed(2), o.care.toFixed(2), o.contribution.toFixed(2), (o.acceptance * 100).toFixed(1), o.perPresented.toFixed(2), o.perYear.toFixed(2)].join(","));
  return lines.join("\n") + "\n";
}
