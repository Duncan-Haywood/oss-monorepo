// Business loan offer comparator: turns term-loan, SBA-style and fixed-payback
// (factor-rate) offers into one comparable true APR, total cost and cost per
// dollar. Pure functions, no I/O, no network.

export const KINDS = { loan: "Amortizing loan (stated APR)", factor: "Fixed payback (factor rate)" };

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
export const money = (x) => (x < 0 ? "-" : "") + "$" + Math.abs(round(x, 0)).toLocaleString("en-US");
export const pct = (x, d = 1) => round(x, d).toFixed(d) + "%";
export const num = (s) => {
  const n = Number(String(s ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) && String(s ?? "").trim() !== "" ? n : NaN;
};

// Net present value of per-period cash flows at period rate r.
function npv(flows, r) {
  let v = 0;
  for (let t = 0; t < flows.length; t++) v += flows[t] / (1 + r) ** t;
  return v;
}

// Period rate whose NPV is zero: +cash at t=0, then payments out. Bisection is
// slow but cannot diverge, which matters for factor offers whose rate is large.
export function irr(flows) {
  if (!(flows[0] > 0) || !flows.slice(1).some((f) => f < 0)) return NaN;
  let lo = 0, hi = 1;
  if (npv(flows, 0) >= 0) return 0; // pays back no more than it received
  while (npv(flows, hi) < 0 && hi < 1e6) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(flows, mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function payment(principal, r, n) {
  if (r === 0) return principal / n;
  return (principal * r) / (1 - (1 + r) ** -n);
}
export function balanceAfter(principal, r, n, k) {
  if (r === 0) return principal - (principal / n) * k;
  const p = payment(principal, r, n);
  return principal * (1 + r) ** k - (p * ((1 + r) ** k - 1)) / r;
}

// Comma or tab separated, with "double quotes" so a name may hold a comma.
function splitFields(line) {
  const out = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if ((ch === "," || ch === "\t") && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseOffers(text) {
  const offers = [], errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = splitFields(line);
    const at = `Line ${i + 1}`;
    if (/^name$/i.test(c[0])) return; // header row
    if (c.length < 5) return errors.push(`${at}: need name, kind, amount, rate, term months (got ${c.length} fields)`);
    const kindWord = c[1].toLowerCase();
    const kind = /^(l|loan|term|sba|line|bank)/.test(kindWord) ? "loan" : /^(f|factor|mca|advance|payback|fixed)/.test(kindWord) ? "factor" : null;
    if (!kind) return errors.push(`${at}: kind must be "loan" or "factor" (got "${c[1]}")`);
    const o = { name: c[0] || `Offer ${offers.length + 1}`, kind, amount: num(c[2]), rate: num(c[3]), termMonths: num(c[4]), feePct: c[5] === undefined || c[5] === "" ? 0 : num(c[5]), feeFlat: c[6] === undefined || c[6] === "" ? 0 : num(c[6]), ppy: c[7] === undefined || c[7] === "" ? 12 : num(c[7]), prepayPct: c[8] === undefined || c[8] === "" ? 0 : num(c[8]) };
    if (!(o.amount > 0)) return errors.push(`${at}: amount must be a positive number`);
    if (!(o.rate >= 0) || (kind === "factor" && !(o.rate >= 1))) return errors.push(`${at}: ${kind === "factor" ? "factor rate looks like 1.35 (must be 1 or more)" : "APR must be 0 or more, e.g. 9.5"}`);
    if (!(o.termMonths >= 1 && o.termMonths <= 600)) return errors.push(`${at}: term must be 1 to 600 months`);
    if (!(o.feePct >= 0 && o.feePct < 50) || !(o.feeFlat >= 0)) return errors.push(`${at}: fees must be 0 or more (percent under 50)`);
    if (![1, 2, 4, 12, 24, 26, 52, 252].includes(o.ppy)) return errors.push(`${at}: payments per year must be one of 1, 2, 4, 12, 24, 26, 52, 252 (annual, semiannual, quarterly, monthly, semimonthly, biweekly, weekly, business-daily)`);
    if (!(o.prepayPct >= 0 && o.prepayPct <= 20)) return errors.push(`${at}: prepayment percentage must be 0 to 20`);
    offers.push(o);
  });
  return { offers, errors };
}

// Compare offers. opts: { monthlyRevenue, monthlyCashFlow, payoffMonth }
export function compare(offers, opts = {}) {
  if (!offers.length) return { error: "Add at least one offer." };
  const results = offers.map((o) => {
    const n = Math.max(1, Math.round((o.termMonths * o.ppy) / 12));
    const fees = (o.amount * o.feePct) / 100 + o.feeFlat;
    const net = o.amount - fees;
    let pay, total;
    if (o.kind === "factor") { total = o.amount * o.rate; pay = total / n; }
    else { pay = payment(o.amount, o.rate / 100 / o.ppy, n); total = pay * n; }
    const flows = [net, ...Array(n).fill(-pay)];
    const r = irr(flows);
    const apr = r * o.ppy * 100, ear = ((1 + r) ** o.ppy - 1) * 100;
    const monthlyPay = pay * (o.ppy / 12);
    const cost = total - net; // everything paid beyond cash actually received
    const res = { ...o, n, fees, net, pay, monthlyPay, total, cost, costPerDollar: cost / net, apr, ear, flags: [] };
    if (opts.monthlyRevenue > 0) res.payPctRevenue = (monthlyPay / opts.monthlyRevenue) * 100;
    if (opts.monthlyCashFlow > 0) res.coverage = opts.monthlyCashFlow / monthlyPay;
    // k is the number of payments made before the payoff. Under one payment
    // there is no stream to solve a rate on (the page showed "NaN%"), so skip.
    const k = Math.round(((opts.payoffMonth || 0) * o.ppy) / 12);
    if (opts.payoffMonth > 0 && opts.payoffMonth < o.termMonths && k >= 1) {
      let payoff, early;
      if (o.kind === "loan") {
        const bal = balanceAfter(o.amount, o.rate / 100 / o.ppy, n, k);
        payoff = bal * (1 + o.prepayPct / 100);
      } else {
        payoff = (total - pay * k) * (1 - o.prepayPct / 100); // prepayPct = discount a factor lender gives, usually 0
      }
      const ef = [net, ...Array(k).fill(-pay)];
      ef[k] -= payoff;
      const er = irr(ef);
      early = { month: opts.payoffMonth, payoff, totalPaid: pay * k + payoff, cost: pay * k + payoff - net, apr: er * o.ppy * 100 };
      res.early = early;
    }
    if (o.kind === "factor") res.flags.push("A factor rate has no interest rate in it: the cost is fixed, so paying early usually saves nothing and the APR above is higher the shorter the payback.");
    if (o.ppy >= 52) res.flags.push(`Payments ${o.ppy === 252 ? "every business day" : "weekly"}: ${money(res.monthlyPay)} a month leaves the account, so check it against your slowest week, not your average.`);
    if (res.apr > 60) res.flags.push("APR above 60%: usually only worth it if the money earns more than it costs within the payback period.");
    if (o.feePct + o.feeFlat / o.amount * 100 > 5) res.flags.push("Upfront fees above 5% of the amount: the cash you receive is noticeably less than the headline amount.");
    return res;
  });
  const byApr = [...results].sort((a, b) => a.apr - b.apr), byCost = [...results].sort((a, b) => a.cost - b.cost);
  const warnings = [];
  const amts = new Set(results.map((r) => r.amount));
  if (amts.size > 1) warnings.push("The offers are for different amounts. Compare APR for price; compare total cost only for the same amount and term.");
  const terms = new Set(results.map((r) => r.termMonths));
  if (terms.size > 1) warnings.push("The offers run for different terms: a shorter term costs fewer dollars even at a higher APR, so look at both columns.");
  return { results, cheapestApr: byApr[0].name, cheapestCost: byCost[0].name, rankApr: byApr.map((r) => r.name), warnings };
}

// Dollars of extra monthly profit the money must earn to pay for itself.
export function breakEvenReturn(result) {
  return { monthlyCost: result.cost / result.termMonths, annualPctOfNet: (result.cost / result.net / (result.termMonths / 12)) * 100 };
}

export function offersCsv(r) {
  const rows = [["Offer", "Kind", "Amount", "Cash received", "Payment", "Payments per year", "Total repaid", "Cost of money", "Cost per $1 received", "True APR %", "Effective annual rate %"]];
  for (const x of r.results) rows.push([x.name, x.kind, round(x.amount), round(x.net), round(x.pay), x.ppy, round(x.total), round(x.cost), round(x.costPerDollar, 3), round(x.apr, 2), round(x.ear, 2)]);
  return rows.map((row) => row.map((v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\n");
}

export const sampleOffers = () =>
  [
    "Bank term loan, loan, 100000, 9.5, 60, 1, 500, 12, 2",
    "SBA 7(a) style, loan, 100000, 11, 120, 3.5, 2500, 12, 0",
    "Online lender, loan, 100000, 22, 24, 4, 0, 52, 0",
    "Cash advance, factor, 100000, 1.32, 9, 3, 0, 252, 0",
  ].join("\n");
