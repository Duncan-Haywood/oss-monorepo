// Veterinarian associate pay calculator: compares two associate offers whose
// pay is a salary, the greater of a guaranteed base or a percentage of
// production, or a base plus a percentage above a production threshold. Pure
// arithmetic on numbers the visitor types; no network, no benchmark data (no
// market percentage or salary survey is embedded or asserted).

export const MODES = ["salary", "greater", "plus"];

export function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  return Math.round(n).toLocaleString("en-US");
}

const share = (o) => (o.pct / 100) * (1 - o.excl / 100);

// Yearly cash pay at a yearly production (or collections) figure.
//   salary : the base.
//   greater: the larger of the guaranteed base and pct of adjusted production.
//   plus   : base + pct of adjusted production above the threshold.
// "Adjusted" production is production less the share the contract excludes
// (lab, outside services, discounted or pass-through items).
export function pay(o, prod) {
  const adj = prod * (1 - o.excl / 100);
  if (o.mode === "salary") return o.base;
  if (o.mode === "greater") return Math.max(o.base, (o.pct / 100) * adj);
  return o.base + (o.pct / 100) * Math.max(0, adj - o.threshold);
}

// Cash pay plus recurring extras plus the sign-on spread over the stay.
export function totalComp(o, prod, stayYears) {
  return pay(o, prod) + o.other + o.signOn / stayYears;
}

// Gross production at which the percentage starts to add to the base:
// greater -> base / share; plus -> threshold / (1 - excl); salary -> null.
export function startsPayingAt(o) {
  if (o.mode === "salary" || !(o.pct > 0)) return null;
  if (o.mode === "greater") return o.base / share(o);
  return o.threshold / (1 - o.excl / 100);
}

// Gross production needed to reach a cash-pay target; 0 if the base already
// does, null if the contract cannot reach it (salary, or no percentage).
export function productionForCash(o, target) {
  if (target <= o.base) return 0;
  if (o.mode === "salary" || !(o.pct > 0)) return null;
  if (o.mode === "greater") return target / share(o);
  return (o.threshold + (target - o.base) / (o.pct / 100)) / (1 - o.excl / 100);
}

// Volumes at which A and B have the same yearly value, found on a fine grid
// and interpolated (both curves are piecewise linear).
export function crossovers(a, b, stayYears, hi) {
  const out = [];
  const steps = 4000;
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const w = (hi * i) / steps;
    const d = totalComp(a, w, stayYears) - totalComp(b, w, stayYears);
    if (prev !== null && prev.d !== 0 && ((prev.d < 0) !== (d < 0)) && d !== 0) {
      const t = Math.abs(prev.d) / (Math.abs(prev.d) + Math.abs(d));
      out.push(prev.w + t * (w - prev.w));
    }
    prev = { w, d };
  }
  return out;
}

const NUM_FIELDS = ["base", "pct", "excl", "threshold", "signOn", "other"];

export function parseInput(raw) {
  const p = {
    prod: parseNum(raw.prod), stayYears: parseNum(raw.stayYears), hours: parseNum(raw.hours),
    weeks: parseNum(raw.weeks), target: parseNum(raw.target), a: {}, b: {},
  };
  const errors = [];
  if (!(p.prod > 0)) errors.push("Enter the yearly production or collections you expect to generate (a number above zero).");
  if (p.stayYears === null) p.stayYears = 3;
  if (!(p.stayYears >= 1 && p.stayYears <= 40)) errors.push("Years you expect to stay must be between 1 and 40.");
  if (p.hours === null) p.hours = 40;
  if (!(p.hours >= 1 && p.hours <= 100)) errors.push("Hours per week must be between 1 and 100.");
  if (p.weeks === null) p.weeks = 48;
  if (!(p.weeks >= 1 && p.weeks <= 52)) errors.push("Weeks worked per year must be between 1 and 52.");
  for (const [k, side] of [["A", p.a], ["B", p.b]]) {
    side.mode = MODES.includes(raw["mode" + k]) ? raw["mode" + k] : "salary";
    for (const f of NUM_FIELDS) {
      const v = parseNum(raw[f + k]);
      if (Number.isNaN(v) || (v !== null && v < 0)) errors.push(`Offer ${k}: ${f} must be a number, zero or more.`);
      side[f] = v === null ? 0 : v;
    }
    if (side.pct > 100) errors.push(`Offer ${k}: the percentage of production cannot be above 100.`);
    if (side.excl >= 100) errors.push(`Offer ${k}: the excluded share of production must be under 100.`);
    if (side.mode === "salary" && side.base === 0) errors.push(`Offer ${k}: enter a base salary.`);
    if (side.mode !== "salary" && side.pct === 0) errors.push(`Offer ${k}: enter the percentage of production, or choose salary.`);
  }
  return { p, errors };
}

export function analyze(raw) {
  const { p, errors } = parseInput(raw);
  if (errors.length) return { error: errors[0], errors };
  const { a, b, prod, stayYears } = p;
  const hoursYear = p.hours * p.weeks;
  const at = (o, w) => totalComp(o, w, stayYears);
  const detail = [["A", a], ["B", b]].map(([name, o]) => {
    const start = startsPayingAt(o);
    return {
      name,
      cash: pay(o, prod),
      total: at(o, prod),
      floor: o.base + o.other + o.signOn / stayYears,
      cashShareOfProduction: pay(o, prod) / prod,
      hourly: at(o, prod) / hoursYear,
      startsAt: start,
      onBase: start !== null && prod <= start,
      gap: start !== null && prod < start ? start - prod : 0,
      forTarget: p.target ? productionForCash(o, p.target) : undefined,
    };
  });
  const [da, db] = detail;
  const hi = Math.max(prod * 2.5, ...detail.map((d) => (d.startsAt || 0) * 1.5), 1);
  const cross = crossovers(a, b, stayYears, hi);
  const levels = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3];
  const scenarios = levels.map((m) => {
    const w = prod * m;
    const ta = at(a, w), tb = at(b, w);
    return { label: m === 1 ? "Your expected production" : `${Math.round(m * 100)}% of expected`, prod: w, a: ta, b: tb, diff: ta - tb, winner: Math.abs(ta - tb) < 0.5 ? "tie" : ta > tb ? "A" : "B" };
  });

  const findings = [];
  const lead = da.total >= db.total ? "A" : "B";
  const gapAmt = Math.abs(da.total - db.total);
  findings.push({ severity: "info", title: gapAmt < 0.5 ? "The offers are worth the same at your expected production" : `Offer ${lead} is worth about $${money(gapAmt)} more a year at $${money(prod)} of production`, detail: `Yearly value counts cash pay, recurring extras (CE, dues, licences, stipends), and the sign-on bonus spread over ${stayYears} year(s). A: $${money(da.total)} ($${da.hourly.toFixed(2)} an hour over ${money(hoursYear)} hours). B: $${money(db.total)} ($${db.hourly.toFixed(2)} an hour).` });
  for (const d of detail) {
    const o = d.name === "A" ? a : b;
    if (o.mode === "salary") continue;
    if (o.excl > 0) {
      findings.push({ severity: "medium", title: `Offer ${d.name}: ${o.pct}% is really ${(share(o) * 100).toFixed(1)}% of your gross production`, detail: `The contract excludes ${o.excl}% of production before the percentage applies, so the headline ${o.pct}% is paid on ${100 - o.excl}% of what you bill. Ask exactly which lines (lab, outside services, pharmacy, discounts) are excluded and whether the exclusion is capped.` });
    }
    if (d.onBase) {
      findings.push({ severity: "medium", title: `Offer ${d.name}: at your expected production you are paid the base only`, detail: o.mode === "greater" ? `The percentage overtakes the guaranteed base at $${money(d.startsAt)} of production and you expect $${money(prod)}, $${money(d.gap)} short. Below that the percentage adds nothing; the offer is a salary of $${money(o.base)}.` : `The percentage starts above a threshold equal to $${money(d.startsAt)} of gross production and you expect $${money(prod)}, $${money(d.gap)} short. Until then you are paid the base only.` });
    }
  }
  for (const w0 of cross.slice(0, 3)) {
    const above = at(a, w0 * 1.02) > at(b, w0 * 1.02) ? "A" : "B";
    const below = above === "A" ? "B" : "A";
    findings.push({ severity: "info", title: `The offers pay the same at about $${money(w0)} of production`, detail: `Just below that ${below} pays more; just above it ${above} does. You expect $${money(prod)}, which is ${prod > w0 ? "above" : "below"} it.` });
  }
  if (!cross.length) findings.push({ severity: "info", title: "One offer pays at least as much at every production level tested", detail: "The two pay curves do not cross between zero and 2.5 times your expected production." });
  const lowA = at(a, prod * 0.8), lowB = at(b, prod * 0.8);
  findings.push({ severity: "info", title: "If your production comes in 20 percent low", detail: `A pays $${money(lowA)} (${lowA - da.total < 0 ? "-" : "+"}$${money(Math.abs(lowA - da.total))} vs expected) and B pays $${money(lowB)} (${lowB - db.total < 0 ? "-" : "+"}$${money(Math.abs(lowB - db.total))}). A new associate usually takes months to fill a schedule; ask whether the base is guaranteed while the book builds.` });

  return { p, detail, scenarios, crossovers: cross, findings, error: null };
}

export function sampleInput() {
  return { prod: "800000", stayYears: "3", hours: "45", weeks: "48", target: "", modeA: "greater", baseA: "120000", pctA: "22", exclA: "10", thresholdA: "", signOnA: "10000", otherA: "3000", modeB: "plus", baseB: "95000", pctB: "18", exclB: "0", thresholdB: "400000", signOnB: "0", otherB: "0" };
}

export function reportCsv(a) {
  const rows = [["scenario", "production", "offer_a_total", "offer_b_total", "a_minus_b"]];
  for (const s of a.scenarios) rows.push([s.label, Math.round(s.prod), Math.round(s.a), Math.round(s.b), Math.round(s.diff)]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}
