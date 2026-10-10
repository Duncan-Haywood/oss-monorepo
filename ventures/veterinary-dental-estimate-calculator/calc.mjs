// Veterinary dental estimate: what a cleaning really costs the clinic at each grade of
// dental disease, so one flat "dental" quote does not quietly lose money on grade 3-4 mouths.
// Pure functions, no I/O. All money in the currency the user types.

export const GRADES = Object.freeze([1, 2, 3, 4]);

export const DEFAULTS = Object.freeze({
  // Fees charged to the client
  cleaningFee: 260,        // scale, polish, charting, per case
  anesthesiaRate: 95,      // charged per anesthesia hour, incl. monitoring
  bloodworkFee: 110,
  ivFee: 75,               // catheter + fluids
  radiographFee: 150,      // full-mouth dental radiographs
  blockFee: 22,            // local nerve block per extraction site
  simpleExtractionFee: 60,
  surgicalExtractionFee: 135,
  medsFee: 40,             // take-home pain medication / antibiotics
  // Clinic costs
  consumablesCost: 38,     // drugs, gas, scaler tips, per case
  extractionSupplies: 9,   // suture, gauze, burs per extracted tooth
  techRate: 30,            // loaded technician cost per hour
  dvmRate: 95,             // loaded veterinarian cost per hour
  overheadPerHour: 60,     // room, equipment, share of rent per anesthesia hour
  // Time
  baseMinutes: 45,         // anesthesia minutes for scale, polish, charting, radiographs
  simpleMinutes: 5,        // added anesthesia minutes per simple extraction
  surgicalMinutes: 14,     // added anesthesia minutes per surgical extraction
  dvmBaseMinutes: 15,      // DVM hands-on minutes before any extraction
  dvmExtractionMinutes: 6, // DVM minutes per extraction (both kinds) beyond that
  // Expected extractions by grade of disease
  g1Simple: 0, g1Surgical: 0,
  g2Simple: 1, g2Surgical: 0,
  g3Simple: 3, g3Surgical: 2,
  g4Simple: 5, g4Surgical: 5,
  // Policy
  flatQuote: 520,          // the one price you quote today (0 = none)
  targetMarginPct: 40,
});

const n = (v, d) => (v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);
const r2 = (x) => Math.round(x * 100) / 100;

export function clean(input = {}) {
  const o = {};
  for (const k of Object.keys(DEFAULTS)) o[k] = n(input[k], DEFAULTS[k]);
  const bad = [];
  for (const k of Object.keys(o)) if (o[k] < 0) bad.push(`${k} cannot be negative.`);
  if (o.targetMarginPct >= 100) bad.push("Target margin must be below 100.");
  if (o.baseMinutes <= 0) bad.push("Base anesthesia minutes must be above zero.");
  return { o, error: bad.length ? bad.join(" ") : null };
}

// One grade of disease: itemised fee, cost, profit and profit per anesthesia hour.
export function gradeCase(o, g) {
  const simple = o[`g${g}Simple`], surgical = o[`g${g}Surgical`], teeth = simple + surgical;
  const anesMin = o.baseMinutes + simple * o.simpleMinutes + surgical * o.surgicalMinutes;
  const dvmMin = o.dvmBaseMinutes + teeth * o.dvmExtractionMinutes;
  const hours = anesMin / 60;
  const fee = {
    cleaning: o.cleaningFee,
    anesthesia: o.anesthesiaRate * hours,
    bloodwork: o.bloodworkFee,
    iv: o.ivFee,
    radiographs: o.radiographFee,
    blocks: o.blockFee * teeth,
    extractions: o.simpleExtractionFee * simple + o.surgicalExtractionFee * surgical,
    meds: o.medsFee,
  };
  const revenue = Object.values(fee).reduce((a, b) => a + b, 0);
  const cost = o.consumablesCost + o.extractionSupplies * teeth + o.techRate * hours + o.dvmRate * (dvmMin / 60) + o.overheadPerHour * hours;
  const profit = revenue - cost;
  const margin = revenue > 0 ? profit / revenue : 0;
  const priceForTarget = cost / (1 - o.targetMarginPct / 100);
  const flat = o.flatQuote > 0 ? o.flatQuote : null;
  const flatProfit = flat === null ? null : flat - cost;
  return {
    grade: g, simple, surgical, teeth,
    anesMin: r2(anesMin), dvmMin: r2(dvmMin), fee, revenue: r2(revenue), cost: r2(cost), profit: r2(profit),
    margin, profitPerHour: r2(profit / hours), priceForTarget: r2(priceForTarget),
    flat, flatProfit: flatProfit === null ? null : r2(flatProfit),
    flatMargin: flat ? (flat - cost) / flat : null,
  };
}

export function estimate(input) {
  const { o, error } = clean(input);
  if (error) return { error };
  const cases = GRADES.map((g) => gradeCase(o, g));
  const findings = [];
  if (o.flatQuote > 0) {
    const loss = cases.filter((c) => c.flatProfit < 0);
    const thin = cases.filter((c) => c.flatProfit >= 0 && c.flatMargin < o.targetMarginPct / 100);
    if (loss.length) {
      findings.push({ severity: "high", title: `A flat ${o.flatQuote} quote loses money on grade ${loss.map((c) => c.grade).join(", ")}`,
        detail: `Grade ${loss[0].grade} costs about ${loss[0].cost} to deliver, so the clinic is ${r2(-loss[0].flatProfit)} short before a single recheck. Quote a range with an upper bound, or require an exam-time update once radiographs show the grade.` });
    }
    if (thin.length) {
      findings.push({ severity: "medium", title: `Grade ${thin.map((c) => c.grade).join(", ")} clear cost but miss your ${o.targetMarginPct}% margin`,
        detail: `The flat quote earns less than target there. The price that hits ${o.targetMarginPct}% is ${thin.map((c) => `grade ${c.grade}: ${c.priceForTarget}`).join("; ")}.` });
    }
    const first = cases.find((c) => c.flatProfit < 0);
    if (!first) findings.push({ severity: "info", title: "The flat quote covers cost at every grade", detail: "Check it still holds if extraction counts run higher than the table above." });
  }
  const worst = cases.reduce((a, b) => (b.profitPerHour < a.profitPerHour ? b : a));
  const best = cases.reduce((a, b) => (b.profitPerHour > a.profitPerHour ? b : a));
  findings.push({ severity: "info", title: `Profit per anesthesia hour runs from ${best.profitPerHour} (grade ${best.grade}) to ${worst.profitPerHour} (grade ${worst.grade})`,
    detail: "A long, complicated dental ties up the room, the tech and the doctor for hours. Per-hour profit shows which grades are worth scheduling first and which need a higher price or a deposit." });
  const estimateRange = { low: cases[0].priceForTarget, high: cases[3].priceForTarget, mid: cases[1].priceForTarget };
  return { o, cases, findings, estimateRange };
}

// Revenue the clinic gives up each year by flat-quoting, given a case mix (shares of dentals by grade, summing to 100).
export function annualGap(input, mixPct, dentalsPerYear) {
  const { o, error } = clean(input);
  if (error) return { error };
  const total = mixPct.reduce((a, b) => a + b, 0);
  if (!(total > 0) || mixPct.length !== 4) return { error: "Give four case-mix shares." };
  const cases = GRADES.map((g) => gradeCase(o, g));
  const target = cases.reduce((a, c, i) => a + c.priceForTarget * (mixPct[i] / total), 0);
  const flat = o.flatQuote;
  return {
    flat, blendedTarget: r2(target),
    perCase: r2(target - flat),
    perYear: r2((target - flat) * dentalsPerYear),
  };
}

export const money = (x) => (x < 0 ? "-" : "") + "$" + Math.abs(Math.round(x * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1) + "%";
