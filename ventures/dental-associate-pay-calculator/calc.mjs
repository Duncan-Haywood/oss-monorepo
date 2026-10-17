// Dental associate pay calculator: the "greater of a daily guarantee or a
// percentage of production or collections, net of lab fees" structure, for two
// offers. Pure arithmetic on numbers the visitor types; no network, and no
// benchmark percentage or market rate is embedded or asserted.

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

// The dollars the percentage is applied to, before lab fees: net production
// as-is, or net production times the share the practice actually collects.
export function adjustedBase(offer, ctx, prod) {
  return offer.basis === "collections" ? prod * ctx.collectRate : prod;
}

// Lab fees the associate bears: the practice's lab bill (a share of production)
// times the share of it the contract charges to the associate.
export function labCharge(offer, ctx, prod) {
  return prod * ctx.labRate * offer.labShare;
}

export function commission(offer, ctx, prod) {
  return Math.max(0, offer.pct * (adjustedBase(offer, ctx, prod) - labCharge(offer, ctx, prod)));
}

export function guarantee(offer, ctx) {
  return offer.guaranteeDay * ctx.days;
}

// Cash pay is the greater of the guarantee and the commission (a guarantee of
// zero means commission only).
export function pay(offer, ctx, prod) {
  return Math.max(guarantee(offer, ctx), commission(offer, ctx, prod));
}

export function totalComp(offer, ctx, prod) {
  return pay(offer, ctx, prod) + offer.other + offer.signOn / ctx.stayYears;
}

// Net production at which the commission catches up with the guarantee; below
// it the guarantee is what is paid. null if there is no guarantee to catch up
// with (0), or the commission rate cannot reach it.
export function guaranteeBreakeven(offer, ctx) {
  const g = guarantee(offer, ctx);
  if (g <= 0) return 0;
  const per = offer.pct * ((offer.basis === "collections" ? ctx.collectRate : 1) - ctx.labRate * offer.labShare);
  return per > 0 ? g / per : null;
}

// Net production needed for a cash-pay target; 0 if the guarantee already
// reaches it, null if the commission can never reach it.
export function productionForCash(offer, ctx, target) {
  if (target <= guarantee(offer, ctx)) return 0;
  const per = offer.pct * ((offer.basis === "collections" ? ctx.collectRate : 1) - ctx.labRate * offer.labShare);
  return per > 0 ? target / per : null;
}

// Volumes at which A and B pay the same (both curves are piecewise linear, so a
// fine grid plus interpolation is exact to the grid).
export function crossovers(a, b, ctx, hi) {
  const out = [];
  const steps = 4000;
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const w = (hi * i) / steps;
    const d = totalComp(a, ctx, w) - totalComp(b, ctx, w);
    if (prev !== null && prev.d !== 0 && ((prev.d < 0) !== (d < 0)) && d !== 0) {
      const t = Math.abs(prev.d) / (Math.abs(prev.d) + Math.abs(d));
      out.push(prev.w + t * (w - prev.w));
    }
    prev = { w, d };
  }
  return out;
}

const FIELDS = ["pct", "guaranteeDay", "labShare", "signOn", "other"];

export function parseInput(raw) {
  const p = {
    prod: parseNum(raw.prod),
    days: parseNum(raw.days),
    collectRate: parseNum(raw.collectRate),
    labRate: parseNum(raw.labRate),
    stayYears: parseNum(raw.stayYears),
    target: parseNum(raw.target),
    a: {},
    b: {},
  };
  const errors = [];
  if (!(p.prod > 0)) errors.push("Enter the net production you expect in a year (a number above zero).");
  if (p.days === null) p.days = 200;
  if (!(p.days > 0 && p.days <= 365)) errors.push("Days you work a year must be between 1 and 365.");
  if (p.collectRate === null) p.collectRate = 98;
  if (!(p.collectRate > 0 && p.collectRate <= 100)) errors.push("Collection rate must be a percent above 0 and up to 100.");
  if (p.labRate === null) p.labRate = 0;
  if (!(p.labRate >= 0 && p.labRate <= 50)) errors.push("Lab fees as a percent of production must be between 0 and 50.");
  if (p.stayYears === null) p.stayYears = 3;
  if (!(p.stayYears >= 1 && p.stayYears <= 40)) errors.push("Years you expect to stay must be between 1 and 40.");
  p.collectRate /= 100;
  p.labRate /= 100;
  for (const [k, side] of [["A", p.a], ["B", p.b]]) {
    for (const f of FIELDS) {
      const v = parseNum(raw[f + k]);
      if (Number.isNaN(v) || (v !== null && v < 0)) errors.push(`Offer ${k}: ${f} must be a number, zero or more.`);
      side[f] = v === null ? 0 : v;
    }
    if (side.labShare > 100) errors.push(`Offer ${k}: the lab share must be between 0 and 100 percent.`);
    if (side.pct > 100) errors.push(`Offer ${k}: the pay percentage must be between 0 and 100.`);
    side.pct /= 100;
    side.labShare /= 100;
    side.basis = raw["basis" + k] === "collections" ? "collections" : "production";
    if (side.pct === 0 && side.guaranteeDay === 0) errors.push(`Offer ${k}: enter a percentage or a daily guarantee.`);
  }
  return { p, errors };
}

export function analyze(raw) {
  const { p, errors } = parseInput(raw);
  if (errors.length) return { error: errors[0], errors };
  const ctx = { days: p.days, collectRate: p.collectRate, labRate: p.labRate, stayYears: p.stayYears };
  const { a, b, prod } = p;
  const offers = [["A", a], ["B", b]];
  const detail = offers.map(([name, o]) => {
    const com = commission(o, ctx, prod), g = guarantee(o, ctx);
    return {
      name,
      commission: com,
      guarantee: g,
      cash: pay(o, ctx, prod),
      total: totalComp(o, ctx, prod),
      guaranteeActive: g > com,
      effectivePct: pay(o, ctx, prod) / prod,
      perDay: pay(o, ctx, prod) / ctx.days,
      labLoss: labCharge(o, ctx, prod) * o.pct,
      breakeven: guaranteeBreakeven(o, ctx),
      forTarget: p.target ? productionForCash(o, ctx, p.target) : undefined,
    };
  });
  const [da, db] = detail;
  const at = (o, w) => totalComp(o, ctx, w);
  const hi = Math.max(prod * 2.5, 1);
  const cross = crossovers(a, b, ctx, hi);
  const levels = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3];
  const scenarios = levels.map((m) => {
    const w = prod * m;
    const ta = at(a, w), tb = at(b, w);
    return { label: m === 1 ? "Your expected production" : `${Math.round(m * 100)}% of expected`, prod: w, a: ta, b: tb, diff: ta - tb, winner: Math.abs(ta - tb) < 0.5 ? "tie" : ta > tb ? "A" : "B" };
  });

  const findings = [];
  const lead = da.total >= db.total ? "A" : "B";
  const gap = Math.abs(da.total - db.total);
  findings.push({ severity: "info", title: gap < 0.5 ? "The offers are worth the same at your expected production" : `Offer ${lead} is worth about $${money(gap)} more a year at $${money(prod)} of net production`, detail: `Yearly value counts cash pay, recurring extras, and the sign-on bonus spread over ${p.stayYears} year(s). A: $${money(da.total)}. B: $${money(db.total)}.` });
  for (const d of detail) {
    const o = d.name === "A" ? a : b;
    if (d.guarantee > 0 && d.guaranteeActive) {
      findings.push({ severity: "medium", title: `Offer ${d.name}: at your expected production you are paid the guarantee, not the percentage`, detail: `The commission would be $${money(d.commission)} but the guarantee is $${money(d.guarantee)} (${money(o.guaranteeDay)} a day for ${ctx.days} days). The percentage only starts to matter above about $${money(d.breakeven)} of net production. Ask whether the guarantee is a floor or is later netted against production.` });
    }
    if (o.labShare > 0 && ctx.labRate > 0 && o.pct > 0) {
      findings.push({ severity: "medium", title: `Offer ${d.name}: lab fees cost you about $${money(d.labLoss)} a year`, detail: `Lab fees run ${(ctx.labRate * 100).toFixed(1)}% of production and you carry ${(o.labShare * 100).toFixed(0)}% of them, which comes off the base before your ${(o.pct * 100).toFixed(1)}% is applied. Your effective percentage of net production is ${(d.effectivePct * 100).toFixed(1)}%, not the headline ${(o.pct * 100).toFixed(1)}%.` });
    }
    if (o.basis === "collections" && o.pct > 0 && ctx.collectRate < 1) {
      const lost = o.pct * prod * (1 - ctx.collectRate);
      findings.push({ severity: "info", title: `Offer ${d.name}: paid on collections, not production`, detail: `At a ${(ctx.collectRate * 100).toFixed(1)}% collection rate about $${money(lost)} of the percentage never reaches you compared with being paid on production. Collections also arrive later than the work, so early pay can lag.` });
    }
  }
  if (cross.length) {
    const w0 = cross[0];
    const above = at(a, w0 * 1.1) > at(b, w0 * 1.1) ? "A" : "B";
    const below = above === "A" ? "B" : "A";
    findings.push({ severity: "info", title: `The offers pay the same at about $${money(w0)} of net production`, detail: `Below that ${below} pays more; above it ${above} does. You expect $${money(prod)}, which is ${prod > w0 ? "above" : "below"} it.` });
  } else {
    findings.push({ severity: "info", title: "One offer pays at least as much at every volume we tested", detail: "The two pay curves do not cross between zero and 2.5 times your expected production." });
  }
  const lowA = at(a, prod * 0.7), lowB = at(b, prod * 0.7);
  findings.push({ severity: "info", title: "If production comes in 30 percent low (a new associate's schedule often starts thin)", detail: `A pays $${money(lowA)} (${money(lowA - da.total)} vs expected) and B pays $${money(lowB)} (${money(lowB - db.total)} vs expected). A guarantee matters most in the first months; ask how long it lasts.` });

  return { p, detail, scenarios, crossovers: cross, findings, error: null };
}

export function sampleInput() {
  return { prod: "700000", days: "200", collectRate: "98", labRate: "7", stayYears: "3", target: "", pctA: "30", basisA: "collections", guaranteeDayA: "600", labShareA: "50", signOnA: "10000", otherA: "0", pctB: "33", basisB: "production", guaranteeDayB: "0", labShareB: "100", signOnB: "0", otherB: "0" };
}

export function reportCsv(a) {
  const rows = [["scenario", "net_production", "offer_a_total", "offer_b_total", "a_minus_b"]];
  for (const s of a.scenarios) rows.push([s.label, Math.round(s.prod), Math.round(s.a), Math.round(s.b), Math.round(s.diff)]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}
