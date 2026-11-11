// PV string sizing: how many modules can go in one series string, and how many
// strings each inverter MPPT input can take, from the module datasheet, the
// inverter datasheet and two site temperatures.
//
// Method (the temperature-coefficient method; NEC 690.7 lets the module maker's
// coefficient be used for the maximum-voltage calculation):
//   Voc at the coldest temperature  = Voc_stc x (1 + beta_Voc x (T_min - 25))
//   Vmp on the hottest afternoon    = Vmp_stc x (1 + beta_Vmp x (T_cell_hot - 25))
//   T_cell_hot                      = T_high + rise, rise = (NOCT - 20) x 1000/800
//                                     (the NOCT cell-temperature model at 1000 W/m2)
//                                     unless a measured rise is entered
//   Vmp at the coldest temperature  = Vmp_stc x (1 + beta_Vmp x (T_min - 25))
// Longest string  = floor(lowest voltage limit / Voc_cold)   (a hard limit)
// Shortest string = ceil(MPPT minimum / Vmp_hot)              (below it the inverter
//                                                              loses the maximum power point)
// Strings per MPPT = floor(inverter max short-circuit current / (1.25 x Isc)), the 1.25
// being NEC 690.8(A)(1)'s irradiance factor; conductors are sized at 1.25 x 1.25 x Isc
// (690.8(B)). These are physics and arithmetic on the numbers typed in; the edition of
// the code, the AHJ and the equipment listing decide what is allowed.
//
// Pure: no I/O, no clock, no randomness; the input object is never changed.

export const NOCT_REF_C = 20; // ambient at NOCT conditions
export const NOCT_REF_G = 800; // irradiance at NOCT conditions, W/m2
export const DESIGN_G = 1000; // irradiance assumed for the hot-afternoon case, W/m2
export const ISC_FACTOR = 1.25; // NEC 690.8(A)(1)
export const AMPACITY_FACTOR = 1.25; // NEC 690.8(B), on top of ISC_FACTOR
const EPS = 1e-9;

/** An invented module, inverter and site: example numbers only, not a real product. */
export function sampleInput() {
  return {
    tempUnit: "C",
    tMin: "-20",
    tHigh: "35",
    noct: "45",
    cellRise: "",
    vocStc: "49.5",
    vmpStc: "41.4",
    iscStc: "10.3",
    impStc: "9.66",
    pmaxStc: "400",
    betaVoc: "-0.27",
    betaVocUnit: "%",
    betaVmp: "-0.35",
    betaVmpUnit: "%",
    moduleMaxV: "1000",
    seriesFuse: "20",
    invMaxV: "600",
    codeMaxV: "600",
    mpptMin: "100",
    mpptMax: "550",
    mpptCount: "2",
    mpptMaxI: "20",
    mpptMaxIsc: "26",
    invAcW: "7600",
    modules: "24",
  };
}

/** The page's example, so agents calling the engine get the same starting point. */
export const DEFAULTS = Object.freeze(sampleInput());

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(/,/g, "").replace(/[\s°]*[CFVAW%]*$/i, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Celsius from a value in the chosen unit. */
export function toC(t, unit) {
  return unit === "F" ? ((t - 32) * 5) / 9 : t;
}

/** Module voltage at cell temperature tC from an STC voltage and a coefficient (% per C, or mV per C per module). */
export function voltageAt(vStc, beta, unit, tC) {
  const dT = tC - 25;
  return unit === "mV" ? vStc + (beta / 1000) * dT : vStc * (1 + (beta / 100) * dT);
}

function parse(input) {
  const x = { ...input };
  const errors = [];
  const req = (k, label, { positive = true } = {}) => {
    const v = num(x[k]);
    if (v === null) errors.push(`Enter ${label}.`);
    else if (Number.isNaN(v)) errors.push(`${label[0].toUpperCase()}${label.slice(1)} is not a number.`);
    else if (positive && !(v > 0)) errors.push(`${label[0].toUpperCase()}${label.slice(1)} must be more than zero.`);
    return v;
  };
  const opt = (k, label, { positive = true } = {}) => {
    const v = num(x[k]);
    if (v === null) return null;
    if (Number.isNaN(v)) { errors.push(`${label[0].toUpperCase()}${label.slice(1)} is not a number.`); return null; }
    if (positive && !(v > 0)) { errors.push(`${label[0].toUpperCase()}${label.slice(1)} must be more than zero.`); return null; }
    return v;
  };
  const unit = x.tempUnit === "F" ? "F" : "C";
  const p = {
    tempUnit: unit,
    tMin: req("tMin", "the coldest expected temperature", { positive: false }),
    tHigh: req("tHigh", "the hot-day design temperature", { positive: false }),
    noct: opt("noct", "the module NOCT"),
    cellRise: opt("cellRise", "the cell temperature rise", { positive: false }),
    vocStc: req("vocStc", "the module Voc"),
    vmpStc: req("vmpStc", "the module Vmp"),
    iscStc: req("iscStc", "the module Isc"),
    impStc: opt("impStc", "the module Imp"),
    pmaxStc: opt("pmaxStc", "the module power"),
    betaVoc: req("betaVoc", "the Voc temperature coefficient", { positive: false }),
    betaVocUnit: x.betaVocUnit === "mV" ? "mV" : "%",
    betaVmp: opt("betaVmp", "the Vmp (or Pmax) temperature coefficient", { positive: false }),
    betaVmpUnit: x.betaVmpUnit === "mV" ? "mV" : "%",
    moduleMaxV: opt("moduleMaxV", "the module maximum system voltage"),
    seriesFuse: opt("seriesFuse", "the module series fuse rating"),
    invMaxV: req("invMaxV", "the inverter maximum DC input voltage"),
    codeMaxV: opt("codeMaxV", "the system voltage limit"),
    mpptMin: req("mpptMin", "the MPPT minimum voltage"),
    mpptMax: opt("mpptMax", "the MPPT maximum voltage"),
    mpptCount: opt("mpptCount", "the number of MPPT inputs"),
    mpptMaxI: opt("mpptMaxI", "the MPPT maximum input current"),
    mpptMaxIsc: opt("mpptMaxIsc", "the MPPT maximum short-circuit current"),
    invAcW: opt("invAcW", "the inverter AC rating"),
    modules: opt("modules", "the number of modules"),
  };
  if (errors.length) return { errors };
  if (p.betaVoc >= 0) errors.push("The Voc temperature coefficient is negative on crystalline modules (voltage rises in the cold). Enter it with its minus sign, for example -0.27.");
  if (p.betaVmp !== null && p.betaVmp >= 0) errors.push("The Vmp temperature coefficient is negative (for example -0.35). Leave it blank to use the Voc coefficient, which understates the hot-day drop.");
  if (p.betaVocUnit === "%" && p.betaVoc < -2) errors.push("A Voc coefficient below -2 % per degree is not plausible; is it in mV per degree?");
  if (p.betaVmp !== null && p.betaVmpUnit === "%" && p.betaVmp < -2) errors.push("A Vmp coefficient below -2 % per degree is not plausible; is it in mV per degree?");
  if (p.vmpStc >= p.vocStc) errors.push("Vmp must be lower than Voc; check the two datasheet values.");
  if (p.impStc !== null && p.impStc > p.iscStc) errors.push("Imp must not be higher than Isc; check the two datasheet values.");
  if (p.mpptMax !== null && p.mpptMax <= p.mpptMin) errors.push("The MPPT maximum must be above the MPPT minimum.");
  if (p.mpptMin >= p.invMaxV) errors.push("The MPPT minimum must be below the inverter's maximum DC voltage.");
  const tMinC = toC(p.tMin, unit), tHighC = toC(p.tHigh, unit);
  if (tHighC <= tMinC) errors.push("The hot-day temperature must be above the coldest temperature.");
  if (tMinC < -60 || tMinC > 40) errors.push("The coldest temperature should be between -60 and 40 C (-76 and 104 F).");
  if (tHighC < -10 || tHighC > 60) errors.push("The hot-day temperature should be between -10 and 60 C (14 and 140 F).");
  if (p.noct !== null && (p.noct < 25 || p.noct > 70)) errors.push("NOCT is usually between 40 and 50 C; enter it in degrees C.");
  if (p.cellRise !== null && (p.cellRise < 0 || p.cellRise > 60)) errors.push("The cell temperature rise should be between 0 and 60 C.");
  if (p.mpptCount !== null && (!Number.isInteger(p.mpptCount) || p.mpptCount > 64)) errors.push("The number of MPPT inputs must be a whole number up to 64.");
  if (p.modules !== null && (!Number.isInteger(p.modules) || p.modules > 100000)) errors.push("The number of modules must be a whole number.");
  if (errors.length) return { errors };
  return { p, tMinC, tHighC };
}

/**
 * Size the strings. Input: one object of strings or numbers (see sampleInput()).
 * Returns { error } on bad input, else the limits, per-module voltages, checks,
 * findings and, when a module count is given, every layout that fits.
 */
export function analyze(input = {}) {
  const parsed = parse(input || {});
  if (parsed.errors) return { error: parsed.errors[0], errors: parsed.errors };
  const { p, tMinC, tHighC } = parsed;
  const findings = [];

  const rise = p.cellRise !== null ? p.cellRise : ((p.noct ?? 45) - NOCT_REF_C) * (DESIGN_G / NOCT_REF_G);
  const riseBasis = p.cellRise !== null ? "entered" : p.noct !== null ? "from NOCT" : "assumed NOCT 45 C";
  const tCellHot = tHighC + rise;
  const vmpBeta = p.betaVmp ?? p.betaVoc;
  const vmpUnit = p.betaVmp !== null ? p.betaVmpUnit : p.betaVocUnit;

  const vocCold = voltageAt(p.vocStc, p.betaVoc, p.betaVocUnit, tMinC);
  const vmpHot = voltageAt(p.vmpStc, vmpBeta, vmpUnit, tCellHot);
  const vmpCold = voltageAt(p.vmpStc, vmpBeta, vmpUnit, tMinC);
  if (!(vmpHot > 0)) return { error: "The coefficients and temperatures give a Vmp at or below zero; check the coefficient units.", errors: [] };

  const limits = [
    { label: "inverter maximum DC input", v: p.invMaxV },
    ...(p.codeMaxV !== null ? [{ label: "system voltage limit you entered", v: p.codeMaxV }] : []),
    ...(p.moduleMaxV !== null ? [{ label: "module maximum system voltage", v: p.moduleMaxV }] : []),
  ];
  const binding = limits.reduce((a, b) => (b.v < a.v ? b : a));
  const maxLen = Math.floor(binding.v / vocCold + EPS);
  const minLen = Math.ceil(p.mpptMin / vmpHot - EPS);
  const trackLen = p.mpptMax !== null ? Math.floor(p.mpptMax / vmpCold + EPS) : null;

  const iscDesign = p.iscStc * ISC_FACTOR;
  const ampacity = iscDesign * AMPACITY_FACTOR;
  const perMpptIsc = p.mpptMaxIsc !== null ? Math.floor(p.mpptMaxIsc / iscDesign + EPS) : null;
  const perMpptImp = p.mpptMaxI !== null && p.impStc !== null ? Math.floor(p.mpptMaxI / p.impStc + EPS) : null;
  const perMppt = perMpptIsc ?? (p.mpptMaxIsc === null && p.mpptMaxI !== null ? Math.max(1, Math.floor(p.mpptMaxI / p.iscStc + EPS)) : null);
  const mppts = p.mpptCount ?? 1;

  if (maxLen < 1) {
    findings.push({ severity: "high", title: "Not even one module fits", detail: `One module's cold Voc (${round(vocCold)} V) is above the ${binding.label} (${binding.v} V).` });
  } else if (minLen > maxLen) {
    findings.push({ severity: "high", title: "No string length works with this inverter", detail: `The cold-voltage limit allows at most ${maxLen} modules, but the hot-day Vmp needs at least ${minLen} to stay above the ${p.mpptMin} V MPPT minimum. Use an inverter with a wider MPPT window or a module with a different voltage.` });
  } else {
    findings.push({ severity: "info", title: `Strings of ${minLen} to ${maxLen} modules`, detail: `${maxLen} is set by the ${binding.label} (${binding.v} V) against ${round(vocCold)} V per module at ${round(tMinC, 1)} C; ${minLen} by the ${p.mpptMin} V MPPT minimum against ${round(vmpHot)} V per module at a ${round(tCellHot, 1)} C cell.` });
  }
  if (trackLen !== null && trackLen < maxLen && trackLen >= minLen) {
    findings.push({ severity: "medium", title: `Above ${trackLen} modules the string leaves the MPPT window on cold mornings`, detail: `At ${round(tMinC, 1)} C a string of ${trackLen + 1} has a Vmp of ${round((trackLen + 1) * vmpCold)} V, above the ${p.mpptMax} V MPPT maximum. Lengths up to ${maxLen} stay within the safety limit, but the inverter cannot hold the maximum power point in that cold and loses some energy.` });
  }
  if (p.betaVmp === null) findings.push({ severity: "medium", title: "No Vmp coefficient: the Voc coefficient was used", detail: "Vmp falls faster with heat than Voc, so the hot-day Vmp and the shortest string are optimistic. Use the datasheet's Pmax coefficient if no Vmp coefficient is given." });
  if (p.noct === null && p.cellRise === null) findings.push({ severity: "medium", title: "No NOCT entered: 45 C assumed", detail: `A cell ${round(rise, 1)} C above the air is a typical open-rack value at full sun; roof-flush mounts run hotter. Enter the datasheet NOCT or your own rise.` });
  if (perMpptIsc !== null && perMpptIsc < 1) findings.push({ severity: "high", title: "One string's current is above the MPPT short-circuit limit", detail: `1.25 x Isc = ${round(iscDesign)} A is above the ${p.mpptMaxIsc} A the input accepts.` });
  if (perMpptImp !== null && perMpptIsc !== null && perMpptImp < perMpptIsc) findings.push({ severity: "info", title: `Past ${perMpptImp} string${perMpptImp === 1 ? "" : "s"} per MPPT the input clips current`, detail: `${perMpptImp + 1} strings at Imp ${p.impStc} A each is ${round((perMpptImp + 1) * p.impStc)} A, above the ${p.mpptMaxI} A usable input current. That is allowed up to the short-circuit limit but the extra current is lost at peak sun.` });
  if (p.seriesFuse !== null && perMppt !== null && perMppt >= 3) {
    const backfeed = (perMppt - 1) * iscDesign;
    if (backfeed > p.seriesFuse) findings.push({ severity: "medium", title: "Three or more strings in parallel can back-feed a faulted string", detail: `With ${perMppt} strings on one input, a fault in one can draw ${round(backfeed)} A from the others, above the ${p.seriesFuse} A module series fuse rating. Check whether the inverter fuses each string (NEC 690.9).` });
  }
  findings.push({ severity: "info", title: `Conductors: at least ${round(ampacity)} A per string after conditions of use`, detail: `Maximum circuit current is 1.25 x Isc = ${round(iscDesign)} A per string; conductor ampacity is 1.25 times that before temperature and conduit-fill corrections, which this tool does not apply.` });

  const lengths = [];
  if (maxLen >= 1 && minLen <= maxLen) {
    for (let n = Math.max(1, minLen); n <= maxLen; n++) {
      lengths.push({
        modules: n,
        vocCold: round(n * vocCold),
        vmpHot: round(n * vmpHot),
        vmpCold: round(n * vmpCold),
        voltageMarginPct: round((1 - (n * vocCold) / binding.v) * 100, 1),
        mpptMarginPct: round(((n * vmpHot) / p.mpptMin - 1) * 100, 1),
        coldTracking: p.mpptMax === null ? null : n * vmpCold <= p.mpptMax + EPS,
        stcKw: p.pmaxStc !== null ? round((n * p.pmaxStc) / 1000, 2) : null,
      });
    }
  }

  let layouts = [];
  if (p.modules !== null && p.modules > 0 && lengths.length) {
    const cap = perMppt === null ? Infinity : perMppt * mppts;
    for (const L of lengths) {
      const strings = Math.floor(p.modules / L.modules);
      if (strings < 1) continue;
      const used = Math.min(strings, cap);
      if (!Number.isFinite(used) || used < 1) continue;
      const base = Math.floor(used / mppts), extra = used % mppts;
      const split = Array.from({ length: Math.min(mppts, used) }, (_, i) => base + (i < extra ? 1 : 0)).filter((s) => s > 0);
      const dcKw = p.pmaxStc !== null ? (used * L.modules * p.pmaxStc) / 1000 : null;
      layouts.push({
        stringLength: L.modules,
        strings: used,
        perMppt: split,
        modulesUsed: used * L.modules,
        unused: p.modules - used * L.modules,
        coldTracking: L.coldTracking,
        dcKw: dcKw === null ? null : round(dcKw, 2),
        dcAcRatio: dcKw !== null && p.invAcW !== null ? round((dcKw * 1000) / p.invAcW, 2) : null,
        currentClipped: perMpptImp !== null && Math.max(...split) > perMpptImp,
      });
    }
    layouts.sort((a, b) => a.unused - b.unused || (b.coldTracking !== false) - (a.coldTracking !== false) || Number(a.currentClipped) - Number(b.currentClipped) || b.stringLength - a.stringLength);
    layouts = layouts.slice(0, 40);
    const best = layouts[0];
    if (!best) findings.push({ severity: "medium", title: `${p.modules} modules do not make one valid string`, detail: `The shortest valid string is ${minLen} modules.` });
    else if (best.unused > 0) findings.push({ severity: "medium", title: `${p.modules} modules do not split evenly into valid strings`, detail: `The closest fit uses ${best.modulesUsed} (${best.strings} x ${best.stringLength}) and leaves ${best.unused}; with this inverter, ${perMppt === null ? "" : `at most ${perMppt * mppts} strings fit, and `}uneven string lengths on separate MPPTs are another option this tool does not search.` });
  }

  return {
    p,
    temps: { tMinC: round(tMinC, 2), tHighC: round(tHighC, 2), rise: round(rise, 2), riseBasis, tCellHot: round(tCellHot, 2) },
    perModule: { vocCold: round(vocCold, 3), vmpHot: round(vmpHot, 3), vmpCold: round(vmpCold, 3) },
    limit: { label: binding.label, volts: binding.v },
    maxLen: Math.max(0, maxLen),
    minLen,
    trackLen,
    current: { iscDesign: round(iscDesign, 3), ampacity: round(ampacity, 3), perMpptIsc, perMpptImp, perMppt, mppts },
    lengths,
    layouts,
    findings,
  };
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  const t = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** The result as CSV: per-length voltages, then layouts. */
export function reportCsv(a) {
  const rows = [["String length", "Voc cold V", "Vmp hot V", "Vmp cold V", "Margin to limit %", "Margin above MPPT min %", "Cold MPPT tracking"]];
  for (const l of a.lengths) rows.push([l.modules, l.vocCold, l.vmpHot, l.vmpCold, l.voltageMarginPct, l.mpptMarginPct, l.coldTracking === null ? "" : l.coldTracking ? "yes" : "no"]);
  if (a.layouts.length) {
    rows.push([]);
    rows.push(["Layout: string length", "Strings", "Strings per MPPT", "Modules used", "Unused", "DC kW", "DC/AC"]);
    for (const l of a.layouts) rows.push([l.stringLength, l.strings, l.perMppt.join("+"), l.modulesUsed, l.unused, l.dcKw, l.dcAcRatio]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
