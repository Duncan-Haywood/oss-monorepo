// Job offer comparison: turns base, bonus, sign-on, vesting equity, retirement
// match and hours into a per-year total and a true hourly rate, offer by offer.
// Deterministic and local. Pre-tax by default; an optional flat tax rate gives
// an after-tax view. Equity is haircut by a confidence percentage you choose.

export const MAX_OFFERS = 3;
export const YEARS = 4;

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
const blank = (v) => String(v ?? "").trim() === "";
const opt = (v, dflt = 0) => (blank(v) ? dflt : parseNum(v));

// Equity vests evenly over `vestYears`, one slice a year; the value reaching
// you in plan-year y (1-based) is that year's vested slice, valued
// at the grant price grown by `growth` a year and cut by the confidence factor.
export function equityByYear(grant, vestYears, growth, confidence, years = YEARS) {
  const out = [];
  let prev = 0;
  for (let y = 1; y <= years; y++) {
    let vested;
    vested = vestYears <= 1 ? 1 : Math.min(1, y / vestYears);
    const inc = Math.max(0, vested - prev);
    prev = vested;
    out.push(grant * inc * Math.pow(1 + growth, y - 1) * confidence);
  }
  return out;
}

export function offerYears(o, years = YEARS) {
  const bonus = o.base * o.bonusPct;
  const match = Math.min(o.base * o.matchPct, o.matchCap ?? Infinity);
  const equity = equityByYear(o.equityGrant, o.vestYears, o.growth, o.confidence, years);
  const refresh = o.refresh ?? 0;
  const rows = [];
  for (let y = 1; y <= years; y++) {
    const signOn = y === 1 ? o.signOn : 0;
    const ref = y >= 2 ? refresh * o.confidence : 0;
    const cash = o.base + bonus + signOn;
    const total = cash + equity[y - 1] + ref + match + o.other;
    rows.push({ year: y, base: o.base, bonus, signOn, equity: equity[y - 1] + ref, match, other: o.other, cash, total, afterTax: total * (1 - o.taxRate) });
  }
  return rows;
}

// Base salary at which this offer's four-year average reaches `target` (bisection: the average rises with base).
export function baseToMatch(o, target) {
  const avgAt = (base) => offerYears({ ...o, base }).reduce((a, r) => a + r.total, 0) / YEARS;
  let lo = o.base, hi = Math.max(o.base, 1) * 20;
  if (avgAt(lo) >= target) return lo;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (avgAt(mid) < target) lo = mid; else hi = mid; }
  return hi;
}

function parseOffer(raw, i) {
  const label = String(raw.name ?? "").trim() || `Offer ${i + 1}`;
  const base = parseNum(raw.base);
  if (!(base > 0)) return { error: `${label}: enter a yearly base salary above zero.` };
  const num = (key, name, dflt, max = Infinity) => {
    const v = opt(raw[key], dflt);
    if (!(v >= 0 && v <= max)) return { error: `${label}: ${name} must be a number between 0 and ${max}, or blank.` };
    return { v };
  };
  const fields = {};
  for (const [key, name, dflt, max] of [["bonusPct", "target bonus percent", 0, 500], ["signOn", "sign-on bonus", 0], ["equityGrant", "total equity grant value", 0], ["vestYears", "vesting years", 4, 10], ["growth", "yearly growth percent", 0, 100], ["confidence", "equity confidence percent", 100, 100], ["refresh", "yearly refresh grant value", 0], ["matchPct", "retirement match percent", 0, 100], ["matchCap", "match dollar cap", null], ["other", "other yearly benefits value", 0], ["taxRate", "tax rate percent", 0, 90], ["hours", "hours worked per week", 40, 100], ["commute", "commute hours per week", 0, 60], ["pto", "paid days off", 15, 120]]) {
    if (key === "matchCap") { fields[key] = blank(raw[key]) ? Infinity : parseNum(raw[key]); if (!(fields[key] >= 0)) return { error: `${label}: match cap must be a number, or blank.` }; continue; }
    const r = num(key, name, dflt, max);
    if (r.error) return r;
    fields[key] = r.v;
  }
  if (fields.vestYears < 1 && fields.equityGrant > 0) return { error: `${label}: vesting years must be at least 1.` };
  const pct = (k) => fields[k] / 100;
  return { offer: { label, base, bonusPct: pct("bonusPct"), signOn: fields.signOn, equityGrant: fields.equityGrant, vestYears: fields.vestYears || 1, growth: pct("growth"), confidence: pct("confidence"), refresh: fields.refresh, matchPct: pct("matchPct"), matchCap: fields.matchCap, other: fields.other, taxRate: pct("taxRate"), hours: fields.hours, commute: fields.commute, pto: fields.pto } };
}

export function analyze(input) {
  const list = (input.offers ?? []).filter((o) => !blank(o.base) || !blank(o.name));
  if (list.length < 1) return { error: "Enter at least one offer with a base salary." };
  if (list.length > MAX_OFFERS) return { error: `Compare at most ${MAX_OFFERS} offers.` };
  const offers = [];
  for (let i = 0; i < list.length; i++) {
    const r = parseOffer(list[i], i);
    if (r.error) return r;
    offers.push(r.offer);
  }
  const results = offers.map((o) => {
    const rows = offerYears(o);
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const total4 = sum("total"), avg = total4 / YEARS;
    const workedHours = Math.max(1, (52 - o.pto / 5) * (o.hours + o.commute));
    return { offer: o, rows, total4, avg, afterTax4: sum("afterTax"), year1: rows[0].total, hourly: avg / workedHours, workedHours, equityShare: total4 > 0 ? sum("equity") / total4 : 0 };
  });
  const ranked = [...results].sort((a, b) => b.avg - a.avg);
  const best = ranked[0];
  const findings = [];
  if (results.length > 1) {
    const gap = best.avg - ranked[1].avg;
    findings.push({ severity: "info", title: `${best.offer.label} pays the most: about $${money(best.avg)} a year on average`, detail: `That is $${money(gap)} a year above ${ranked[1].offer.label} over four years, before tax, counting equity at your confidence level.` });
    const byHourly = [...results].sort((a, b) => b.hourly - a.hourly)[0];
    if (byHourly !== best) findings.push({ severity: "medium", title: `${byHourly.offer.label} wins per hour worked`, detail: `Counting hours, commute and paid days off, ${byHourly.offer.label} pays about $${byHourly.hourly.toFixed(0)} an hour against $${best.hourly.toFixed(0)} for ${best.offer.label}. The highest total is not the best rate.` });
    for (const r of results) {
      if (r === best) continue;
      const baseNeeded = baseToMatch(r.offer, best.avg);
      findings.push({ severity: "info", title: `To match ${best.offer.label}, ${r.offer.label} would need about $${money(baseNeeded)} base`, detail: `That is $${money(baseNeeded - r.offer.base)} above its current base, a useful number for a counteroffer.` });
    }
  }
  for (const r of results) {
    if (r.equityShare > 0.3) findings.push({ severity: "medium", title: `${Math.round(r.equityShare * 100)}% of ${r.offer.label}'s four-year value is equity`, detail: `At a lower confidence than ${Math.round(r.offer.confidence * 100)}% or a private company's illiquid shares, this offer can be worth much less than it looks. Try 50% confidence to see the cash-only floor.` });
    if (r.offer.signOn > 0) findings.push({ severity: "info", title: `${r.offer.label}'s sign-on bonus is in year 1 only`, detail: "Many employers claw back a sign-on bonus if you leave in the first year. Year 1 is higher than the years that follow." });
  }
  return { results, best, findings };
}

export function sampleInput() {
  return { offers: [
    { name: "Startup", base: "150000", bonusPct: "10", signOn: "10000", equityGrant: "240000", vestYears: "4", growth: "0", confidence: "40", matchPct: "0", other: "0", taxRate: "32", hours: "50", commute: "3", pto: "15" },
    { name: "Big company", base: "175000", bonusPct: "15", signOn: "25000", equityGrant: "200000", vestYears: "4", growth: "5", confidence: "85", refresh: "40000", matchPct: "4", other: "3000", taxRate: "32", hours: "45", commute: "5", pto: "25" },
    { name: "Nonprofit", base: "128000", bonusPct: "0", signOn: "0", equityGrant: "0", vestYears: "4", growth: "0", confidence: "100", matchPct: "6", other: "5000", taxRate: "32", hours: "40", commute: "0", pto: "30" },
  ] };
}

const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const rows = [["Offer", "Year 1 total", "Four-year average", "Four-year total", "Four-year after tax", "True hourly rate"]];
  for (const r of a.results) rows.push([r.offer.label, round2(r.year1), round2(r.avg), round2(r.total4), round2(r.afterTax4), round2(r.hourly)]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
