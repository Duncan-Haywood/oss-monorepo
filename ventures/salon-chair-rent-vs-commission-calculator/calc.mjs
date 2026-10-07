// Salon chair rent vs commission calculator: compares two ways a stylist,
// barber, nail tech or esthetician can work in a shop (commission, booth/chair
// rent, or rent plus a smaller commission) at the weekly service revenue the
// visitor expects. Pure arithmetic on numbers the visitor types; no network and
// no benchmark data (no market commission split or rent is embedded or asserted).

export const MODES = ["commission", "rent", "hybrid"];

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

// Share of service / retail sales the worker keeps. Chair rent means the
// worker keeps everything and pays the rent instead; the other two modes keep
// the entered percentage.
const keepSvc = (o) => (o.mode === "rent" ? 1 : o.keep / 100);
const keepRetail = (o) => (o.mode === "rent" ? 1 : o.retailKeep / 100);
const paysRent = (o) => o.mode !== "commission";

// Yearly figures at a scale of the expected weekly sales (1 = as entered).
export function yearly(o, c, scale = 1) {
  const svc = c.services * scale * c.weeks;
  const retail = c.retail * scale * c.weeks;
  const tips = (svc * c.tipPct) / 100;
  const take = svc * keepSvc(o) + retail * keepRetail(o) + tips;
  const supplies = (svc * o.supplies) / 100;
  const card = ((svc + retail) * o.card) / 100;
  const rent = paysRent(o) ? o.rent * o.rentWeeks : 0;
  const fixed = o.fixed * 12;
  const pretax = take - supplies - card - rent - fixed;
  const tax = (Math.max(0, pretax) * o.se) / 100;
  return { take, supplies, card, rent, fixed, pretax, tax, net: pretax - tax, sales: svc + retail };
}

export const netAt = (o, c, scale = 1) => yearly(o, c, scale).net;

// Weekly service revenue at which pre-tax income is zero (the revenue that just
// covers the rent and fixed costs), keeping retail in the same proportion.
export function breakEvenWeekly(o, c) {
  const perScale =
    c.services * c.weeks * (keepSvc(o) + c.tipPct / 100 - o.supplies / 100 - o.card / 100) +
    c.retail * c.weeks * (keepRetail(o) - o.card / 100);
  const fixedCost = (paysRent(o) ? o.rent * o.rentWeeks : 0) + o.fixed * 12;
  if (fixedCost <= 0) return 0;
  if (!(perScale > 0)) return null;
  return (fixedCost / perScale) * c.services;
}

// Scales of expected sales at which A and B net the same (both curves are
// piecewise linear, so a fine grid plus interpolation finds them).
export function crossovers(a, b, c, hiScale = 3) {
  const out = [];
  const steps = 3000;
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const s = (hiScale * i) / steps;
    const d = netAt(a, c, s) - netAt(b, c, s);
    if (prev !== null && prev.d !== 0 && prev.d < 0 !== d < 0 && d !== 0) {
      const t = Math.abs(prev.d) / (Math.abs(prev.d) + Math.abs(d));
      out.push(prev.s + t * (s - prev.s));
    }
    prev = { s, d };
  }
  return out;
}

const NUM_FIELDS = ["keep", "retailKeep", "rent", "rentWeeks", "supplies", "card", "fixed", "se"];

export function parseInput(raw) {
  const p = {
    services: parseNum(raw.services), retail: parseNum(raw.retail), tipPct: parseNum(raw.tipPct),
    weeks: parseNum(raw.weeks), hours: parseNum(raw.hours), a: {}, b: {},
  };
  const errors = [];
  if (!(p.services > 0)) errors.push("Enter the service revenue you expect to book in a normal week (a number above zero).");
  if (p.retail === null) p.retail = 0;
  if (Number.isNaN(p.retail) || p.retail < 0) errors.push("Weekly retail sales must be a number, zero or more.");
  if (p.tipPct === null) p.tipPct = 0;
  if (!(p.tipPct >= 0 && p.tipPct <= 100)) errors.push("Tips as a percentage of services must be between 0 and 100.");
  if (p.weeks === null) p.weeks = 48;
  if (!(p.weeks >= 1 && p.weeks <= 52)) errors.push("Weeks worked per year must be between 1 and 52.");
  if (p.hours === null) p.hours = 36;
  if (!(p.hours >= 1 && p.hours <= 100)) errors.push("Hours per week must be between 1 and 100.");
  for (const [k, side] of [["A", p.a], ["B", p.b]]) {
    side.mode = MODES.includes(raw["mode" + k]) ? raw["mode" + k] : "commission";
    for (const f of NUM_FIELDS) {
      const v = parseNum(raw[f + k]);
      if (Number.isNaN(v) || (v !== null && v < 0)) errors.push(`Offer ${k}: ${f} must be a number, zero or more.`);
      side[f] = v === null ? 0 : v;
    }
    if (parseNum(raw["rentWeeks" + k]) === null) side.rentWeeks = 52;
    if (side.keep > 100 || side.retailKeep > 100) errors.push(`Offer ${k}: the share you keep cannot be above 100 percent.`);
    if (side.supplies > 100 || side.card > 100 || side.se > 100) errors.push(`Offer ${k}: percentages cannot be above 100.`);
    if (side.rentWeeks > 52) errors.push(`Offer ${k}: weeks of rent cannot be above 52.`);
    if (side.mode !== "rent" && side.keep === 0) errors.push(`Offer ${k}: enter the percentage of services you keep, or choose chair rent.`);
    if (side.mode !== "commission" && side.rent === 0) errors.push(`Offer ${k}: enter the weekly rent, or choose commission.`);
  }
  return { p, errors };
}

export function analyze(raw) {
  const { p, errors } = parseInput(raw);
  if (errors.length) return { error: errors[0], errors };
  const { a, b } = p;
  const hoursYear = p.hours * p.weeks;
  const detail = [["A", a], ["B", b]].map(([name, o]) => {
    const y = yearly(o, p, 1);
    return {
      name, ...y,
      hourly: y.net / hoursYear,
      keptOfSales: y.sales > 0 ? y.net / y.sales : 0,
      breakEven: breakEvenWeekly(o, p),
      offWeeksRent: paysRent(o) ? o.rent * Math.max(0, o.rentWeeks - p.weeks) : 0,
    };
  });
  const [da, db] = detail;
  const cross = crossovers(a, b, p, 3).map((s) => s * p.services);
  const levels = [0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.5];
  const scenarios = levels.map((m) => {
    const ta = netAt(a, p, m), tb = netAt(b, p, m);
    return { label: m === 1 ? "Your expected week" : `${Math.round(m * 100)}% of expected bookings`, weekly: p.services * m, a: ta, b: tb, diff: ta - tb, winner: Math.abs(ta - tb) < 0.5 ? "tie" : ta > tb ? "A" : "B" };
  });

  const findings = [];
  const lead = da.net >= db.net ? "A" : "B";
  const gap = Math.abs(da.net - db.net);
  findings.push({ severity: "info", title: gap < 0.5 ? "The two arrangements net the same at your expected bookings" : `Arrangement ${lead} nets about $${money(gap)} more a year at $${money(p.services)} of services a week`, detail: `Take-home is what you keep of services, retail and tips, less supplies, card fees, rent and fixed costs, less the self-employment tax rate you entered. A: $${money(da.net)} ($${da.hourly.toFixed(2)} an hour over ${money(hoursYear)} hours). B: $${money(db.net)} ($${db.hourly.toFixed(2)} an hour).` });
  for (const d of detail) {
    const o = d.name === "A" ? a : b;
    if (paysRent(o) && o.rentWeeks > p.weeks) {
      findings.push({ severity: "medium", title: `Arrangement ${d.name}: you pay $${money(d.offWeeksRent)} of rent for weeks you are not working`, detail: `Rent runs ${o.rentWeeks} weeks a year and you work ${p.weeks}. Vacation, sick weeks and slow weeks still cost $${money(o.rent)} each. Ask whether rent is paused for time off.` });
    }
    if (d.breakEven !== null && paysRent(o)) {
      findings.push({ severity: "info", title: `Arrangement ${d.name}: you need about $${money(d.breakEven)} of services a week just to cover rent and fixed costs`, detail: `Below that you lose money on the chair. You expect $${money(p.services)}, which is ${p.services >= d.breakEven ? "above" : "below"} it.` });
    }
    if (d.net < 0) findings.push({ severity: "medium", title: `Arrangement ${d.name} loses money at your expected bookings`, detail: `Costs exceed what you keep by $${money(-d.pretax)} a year before tax.` });
  }
  const cos = cross.filter((w) => w > 0);
  for (const w0 of cos.slice(0, 3)) {
    const sc = w0 / p.services;
    const above = netAt(a, p, sc * 1.02) > netAt(b, p, sc * 1.02) ? "A" : "B";
    const below = above === "A" ? "B" : "A";
    findings.push({ severity: "info", title: `The two pay the same at about $${money(w0)} of services a week`, detail: `Just below that ${below} nets more; just above it ${above} does. You expect $${money(p.services)}, which is ${p.services > w0 ? "above" : "below"} it.` });
  }
  if (!cos.length) findings.push({ severity: "info", title: "One arrangement nets at least as much at every booking level tested", detail: "The two curves do not cross between zero and three times your expected weekly services." });
  const lowA = netAt(a, p, 0.7), lowB = netAt(b, p, 0.7);
  findings.push({ severity: "info", title: "If bookings come in 30 percent low", detail: `A nets $${money(lowA)} (${lowA - da.net < 0 ? "-" : "+"}$${money(Math.abs(lowA - da.net))} vs expected) and B nets $${money(lowB)} (${lowB - db.net < 0 ? "-" : "+"}$${money(Math.abs(lowB - db.net))}). Rent is owed whether or not the chair is full; commission shrinks with the bookings.` });

  return { p, detail, scenarios, crossovers: cos, findings, error: null };
}

export function sampleInput() {
  return {
    services: "2200", retail: "150", tipPct: "15", weeks: "48", hours: "36",
    modeA: "commission", keepA: "50", retailKeepA: "20", rentA: "", rentWeeksA: "", suppliesA: "0", cardA: "0", fixedA: "0", seA: "0",
    modeB: "rent", keepB: "", retailKeepB: "", rentB: "300", rentWeeksB: "52", suppliesB: "6", cardB: "2.9", fixedB: "120", seB: "14.1",
  };
}

export function reportCsv(a) {
  const rows = [["scenario", "weekly_services", "arrangement_a_net", "arrangement_b_net", "a_minus_b"]];
  for (const s of a.scenarios) rows.push([s.label, Math.round(s.weekly), Math.round(s.a), Math.round(s.b), Math.round(s.diff)]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}
