// Physician wRVU contract calculator: base salary plus a per-wRVU incentive
// above a threshold, for two offers. Pure arithmetic on numbers the visitor
// types; no network, no data tables (no MGMA/AMGA benchmark is embedded or asserted).

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

// Annual cash compensation at a wRVU volume: base + incentive above threshold.
export function pay(offer, wrvu) {
  return offer.base + Math.max(0, wrvu - offer.threshold) * offer.cf;
}

// Everything that counts as yearly value: cash pay, recurring extras, and the
// sign-on bonus spread over the years the visitor expects to stay.
export function totalComp(offer, wrvu, stayYears) {
  return pay(offer, wrvu) + offer.other + offer.signOn / stayYears;
}

// wRVUs at which the base stops being a guarantee and the visitor has produced
// it at the offer's own rate: base / cf. A threshold above this is a hole.
export function earnOutWrvu(offer) {
  return offer.cf > 0 ? offer.base / offer.cf : null;
}

// Volume needed to reach a cash-pay target; 0 if the base already reaches it,
// null if the offer has no incentive rate and the base falls short.
export function wrvuForCash(offer, target) {
  if (target <= offer.base) return 0;
  if (offer.cf <= 0) return null;
  return offer.threshold + (target - offer.base) / offer.cf;
}

// First volumes at which A and B pay the same, found on a fine grid and then
// interpolated (both curves are piecewise linear, so this is exact to the grid).
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

const FIELDS = ["base", "threshold", "cf", "signOn", "other"];

export function parseInput(raw) {
  const p = { stayYears: parseNum(raw.stayYears), wrvu: parseNum(raw.wrvu), target: parseNum(raw.target), a: {}, b: {} };
  const errors = [];
  if (!(p.wrvu > 0)) errors.push("Enter your expected annual wRVUs (a number above zero).");
  if (p.stayYears === null) p.stayYears = 3;
  if (!(p.stayYears >= 1 && p.stayYears <= 40)) errors.push("Years you expect to stay must be between 1 and 40.");
  for (const [k, side] of [["A", p.a], ["B", p.b]]) {
    for (const f of FIELDS) {
      const v = parseNum(raw[f + k]);
      if (Number.isNaN(v) || (v !== null && v < 0)) errors.push(`Offer ${k}: ${f} must be a number, zero or more.`);
      side[f] = v === null ? 0 : v;
    }
    if (side.base === 0 && side.cf === 0) errors.push(`Offer ${k}: enter a base salary or a dollars-per-wRVU rate.`);
  }
  return { p, errors };
}

export function analyze(raw) {
  const { p, errors } = parseInput(raw);
  if (errors.length) return { error: errors[0], errors };
  const { a, b, wrvu, stayYears } = p;
  const offers = [["A", a], ["B", b]];
  const at = (o, w) => totalComp(o, w, stayYears);
  const detail = offers.map(([name, o]) => ({
    name,
    cash: pay(o, wrvu),
    total: at(o, wrvu),
    floor: o.base + o.other + o.signOn / stayYears,
    effectivePerWrvu: pay(o, wrvu) / wrvu,
    earnOut: earnOutWrvu(o),
    incentiveActive: wrvu > o.threshold && o.cf > 0,
    shortfall: o.cf > 0 && wrvu < o.threshold ? o.threshold - wrvu : 0,
    forTarget: p.target ? wrvuForCash(o, p.target) : undefined,
  }));
  const [da, db] = detail;
  const hi = Math.max(wrvu * 2.5, a.threshold * 1.5, b.threshold * 1.5, 1);
  const cross = crossovers(a, b, stayYears, hi);
  const levels = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3];
  const scenarios = levels.map((m) => {
    const w = wrvu * m;
    const ta = at(a, w), tb = at(b, w);
    return { label: m === 1 ? "Your expected volume" : `${Math.round(m * 100)}% of expected`, wrvu: w, a: ta, b: tb, diff: ta - tb, winner: Math.abs(ta - tb) < 0.5 ? "tie" : ta > tb ? "A" : "B" };
  });

  const findings = [];
  const lead = da.total >= db.total ? "A" : "B";
  const gap = Math.abs(da.total - db.total);
  findings.push({ severity: "info", title: gap < 0.5 ? "The offers are worth the same at your expected volume" : `Offer ${lead} is worth about $${money(gap)} more a year at ${money(wrvu)} wRVUs`, detail: `Yearly value counts cash pay, recurring extras, and the sign-on bonus spread over ${stayYears} year(s). A: $${money(da.total)}. B: $${money(db.total)}.` });
  for (const d of detail) {
    const o = d.name === "A" ? a : b;
    if (d.shortfall > 0) {
      findings.push({ severity: "medium", title: `Offer ${d.name}: your expected volume is below the incentive threshold`, detail: `You would be paid the base only. The threshold is ${money(o.threshold)} wRVUs and you expect ${money(wrvu)}, ${money(d.shortfall)} short. Every wRVU below the threshold adds nothing.` });
    }
    if (o.cf > 0 && o.base > 0 && d.earnOut !== null && o.threshold > d.earnOut + 0.5) {
      findings.push({ severity: "medium", title: `Offer ${d.name}: the threshold is ${money(o.threshold - d.earnOut)} wRVUs above where the base is earned out`, detail: `At $${o.cf.toFixed(2)} per wRVU the base equals ${money(d.earnOut)} wRVUs of work, but the incentive starts at ${money(o.threshold)}. Between the two you are producing at no extra pay; the effective rate over all your wRVUs is $${d.effectivePerWrvu.toFixed(2)}, not the headline $${o.cf.toFixed(2)}.` });
    }
  }
  if (cross.length) {
    const w0 = cross[0];
    const above = at(a, w0 * 1.1) > at(b, w0 * 1.1) ? "A" : "B";
    const below = above === "A" ? "B" : "A";
    findings.push({ severity: "info", title: `The offers pay the same at about ${money(w0)} wRVUs`, detail: `Below that volume ${below} pays more; above it ${above} does. You expect ${money(wrvu)}, which is ${wrvu > w0 ? "above" : "below"} it.` });
  } else {
    findings.push({ severity: "info", title: "One offer pays at least as much at every volume we tested", detail: "The two pay curves do not cross between zero and 2.5 times your expected volume." });
  }
  const lowA = at(a, wrvu * 0.8), lowB = at(b, wrvu * 0.8);
  findings.push({ severity: "info", title: "If your volume comes in 20 percent low", detail: `A pays $${money(lowA)} (${money(lowA - da.total)} vs expected) and B pays $${money(lowB)} (${money(lowB - db.total)} vs expected). New practices often ramp up slowly; ask each employer whether the base is guaranteed for a period.` });

  return { p, detail, scenarios, crossovers: cross, findings, error: null };
}

export function sampleInput() {
  return { wrvu: "5200", stayYears: "3", target: "", baseA: "280000", thresholdA: "4800", cfA: "52", signOnA: "30000", otherA: "0", baseB: "320000", thresholdB: "0", cfB: "0", signOnB: "0", otherB: "0" };
}

export function reportCsv(a) {
  const rows = [["scenario", "wrvu", "offer_a_total", "offer_b_total", "a_minus_b"]];
  for (const s of a.scenarios) rows.push([s.label, Math.round(s.wrvu), Math.round(s.a), Math.round(s.b), Math.round(s.diff)]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}
