// Real estate syndication distribution waterfall: an investor class (LPs plus
// the sponsor's own co-invest, pari passu) earns a preferred return, then the
// sponsor takes a rising promote above each IRR hurdle. Pure functions, no
// dependencies, nothing leaves the device. Educational arithmetic on numbers
// the user types -- not securities, legal, tax or investment advice.

export function money(n) {
  const v = Number.isFinite(n) ? n : 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-$" : "$") + s;
}

export function pct(x) {
  return x === null || x === undefined || !Number.isFinite(x) ? "n/a" : (x * 100).toFixed(2) + "%";
}

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const nn = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const pos = (n) => Math.max(0, nn(n));

// "120000, 130000, 1800000" or one per line; $ and thousands commas inside a
// number are not supported on a single line, so commas separate values.
export function parseCashFlows(text) {
  const out = [];
  const bad = [];
  for (const tok of String(text || "").split(/[\s,;]+/)) {
    if (!tok) continue;
    const v = Number(tok.replace(/[$_]/g, ""));
    if (Number.isFinite(v) && v >= 0) out.push(v);
    else bad.push(tok);
  }
  return { flows: out, bad };
}

// Annual-period IRR by bisection on NPV. Returns null without a sign change.
export function irr(flows) {
  if (!flows.length || !(flows.some((v) => v < 0) && flows.some((v) => v > 0))) return null;
  const npv = (rate) => flows.reduce((s, v, t) => s + v / Math.pow(1 + rate, t), 0);
  let lo = -0.99;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// tiers: [{ hurdle, promote }] where hurdle is the investor-class IRR a tier
// runs until (null for the last, open-ended tier) and promote is the share of
// that tier's cash that goes to the sponsor on top of its co-invest.
export function waterfall({ equity, gpPct = 0, cashFlows, tiers }) {
  const E = pos(equity);
  const gpShare = Math.min(1, pos(gpPct) / 100);
  const flows = (cashFlows || []).map(pos);
  const T = tiers.map((t, i) => ({
    hurdle: t.hurdle === null || t.hurdle === undefined ? null : pos(t.hurdle) / 100,
    promote: Math.min(1, pos(t.promote) / 100),
    i,
  }));
  // balance[k]: what the investor class still needs, at hurdle k's rate, to have earned exactly that IRR.
  const balance = T.map(() => E);
  const years = [];
  const tierTotals = T.map(() => ({ investor: 0, promote: 0, cash: 0 }));
  for (let y = 0; y < flows.length; y++) {
    for (let k = 0; k < T.length; k++) if (T[k].hurdle !== null) balance[k] *= 1 + T[k].hurdle;
    let cash = flows[y];
    let investor = 0;
    let promote = 0;
    for (let k = 0; k < T.length && cash > 1e-9; k++) {
      const share = 1 - T[k].promote;
      let used;
      if (T[k].hurdle === null) used = cash;
      else {
        const need = Math.max(0, balance[k] - investor);
        used = share <= 0 ? 0 : Math.min(cash, need / share);
      }
      const toInvestor = used * share;
      const toPromote = used * T[k].promote;
      investor += toInvestor;
      promote += toPromote;
      cash -= used;
      tierTotals[k].investor += toInvestor;
      tierTotals[k].promote += toPromote;
      tierTotals[k].cash += used;
    }
    for (let k = 0; k < T.length; k++) if (T[k].hurdle !== null) balance[k] = Math.max(0, balance[k] - investor);
    years.push({ year: y + 1, cash: flows[y], investor: r2(investor), promote: r2(promote) });
  }

  const gpCoinvest = E * gpShare;
  const lpEquity = E - gpCoinvest;
  const lpFlows = [-lpEquity];
  const gpFlows = [-gpCoinvest];
  const investorFlows = [-E];
  for (const y of years) {
    lpFlows.push(y.investor * (1 - gpShare));
    gpFlows.push(y.investor * gpShare + y.promote);
    investorFlows.push(y.investor);
  }
  const sum = (a, from = 1) => a.slice(from).reduce((s, v) => s + v, 0);
  const totalCash = sum(flows, 0);
  const lpTotal = sum(lpFlows);
  const gpTotal = sum(gpFlows);
  const promoteTotal = years.reduce((s, y) => s + y.promote, 0);
  const profit = totalCash - E;
  const dealFlows = [-E, ...flows];
  return {
    equity: E, gpCoinvest: r2(gpCoinvest), lpEquity: r2(lpEquity), totalCash: r2(totalCash), profit: r2(profit),
    dealIrr: irr(dealFlows), lpIrr: irr(lpFlows), gpIrr: gpCoinvest > 0 || promoteTotal > 0 ? irr(gpFlows) : null,
    investorIrr: irr(investorFlows),
    lpMultiple: lpEquity > 0 ? r2(lpTotal / lpEquity) : null,
    gpMultiple: gpCoinvest > 0 ? r2(gpTotal / gpCoinvest) : null,
    dealMultiple: E > 0 ? r2(totalCash / E) : null,
    lpProfit: r2(lpTotal - lpEquity), lpTotal: r2(lpTotal),
    gpTotal: r2(gpTotal), gpProfit: r2(gpTotal - gpCoinvest),
    promote: r2(promoteTotal),
    promoteShareOfProfit: profit > 0 ? promoteTotal / profit : null,
    feeDrag: irr(dealFlows) !== null && irr(lpFlows) !== null ? irr(dealFlows) - irr(lpFlows) : null,
    years,
    tiers: T.map((t, k) => ({
      label: k === 0 ? "Preferred return" : t.hurdle === null ? "Above the last hurdle" : `Up to ${pct(t.hurdle)} investor IRR`,
      hurdle: t.hurdle, promote: t.promote,
      investor: r2(tierTotals[k].investor), sponsor: r2(tierTotals[k].promote), cash: r2(tierTotals[k].cash),
    })),
  };
}

export function analyse(input) {
  const parsed = parseCashFlows(input.cashFlowText);
  const tiers = [
    { hurdle: input.pref, promote: 0 },
    { hurdle: input.hurdle2, promote: input.promote2 },
    { hurdle: input.hurdle3, promote: input.promote3 },
    { hurdle: null, promote: input.promote4 },
  ];
  const findings = [];
  if (parsed.bad.length) {
    findings.push({ severity: "high", title: "Some cash-flow values were not read", detail: `Ignored: ${parsed.bad.join(", ")}. Enter annual distributable cash as plain non-negative numbers, the sale proceeds in the final year.` });
  }
  if (!(nn(input.equity) > 0) || !parsed.flows.length) {
    findings.push({ severity: "high", title: "Enter equity and at least one year of cash flow", detail: "The waterfall needs the equity raised and the cash available to distribute each year, with sale proceeds in the last year." });
    return { result: null, findings, bad: parsed.bad };
  }
  const h = [nn(input.pref), nn(input.hurdle2), nn(input.hurdle3)];
  if (!(h[0] <= h[1] && h[1] <= h[2])) {
    findings.push({ severity: "high", title: "Hurdles should rise", detail: "The preferred return, second hurdle and third hurdle should be in increasing order, otherwise a later tier is skipped." });
  }
  const result = waterfall({ equity: input.equity, gpPct: input.gpPct, cashFlows: parsed.flows, tiers });
  if (result.totalCash <= result.equity) {
    findings.push({ severity: "medium", title: "The deal never returns the equity", detail: "Total distributions do not exceed the equity raised, so the investors lose money and there is no promote." });
  } else if (result.promote === 0) {
    findings.push({ severity: "info", title: "No promote earned", detail: `The investor class IRR (${pct(result.investorIrr)}) did not pass the ${pct(nn(input.pref) / 100)} preferred return, so everything went pro rata to capital.` });
  } else {
    findings.push({ severity: "info", title: "Sponsor share of profit", detail: `The promote is ${money(result.promote)}, ${pct(result.promoteShareOfProfit)} of the deal's profit, before the sponsor's own co-invest returns.` });
  }
  if (result.feeDrag !== null && result.feeDrag > 0.03) {
    findings.push({ severity: "medium", title: "Large gap between deal IRR and LP IRR", detail: `LPs earn ${pct(result.lpIrr)} against ${pct(result.dealIrr)} for the deal: ${pct(result.feeDrag)} goes to the promote and sponsor co-invest structure. Check that is the split you intend.` });
  }
  findings.push({ severity: "info", title: "Modelling choices", detail: "Annual periods, compounding preferred return, no catch-up, no fees, and each hurdle is measured on the whole investor class. Real operating agreements differ on all of these; the document controls." });
  return { result, findings, bad: parsed.bad };
}
