// Available fault current engine. Pure: no imports, no clock, no randomness.
//
// The bolted three-phase (or single-phase line-to-line) fault current at every
// panel of a radial system, from the service transformer (or a known utility
// figure) through feeders, parallel sets and downstream transformers, with
// motor contribution at the service. Impedances are added as complex numbers
// (the "ohmic" method). The same network is also solved with every impedance
// added as a plain magnitude, which is what the point-to-point method's
// multipliers amount to, so the reader sees how far the two disagree.
//
// Conductor resistance is computed from first principles, not copied from a
// code table: the cross-section (AWG geometric series, kcmil or metric nominal
// area), copper at 100 % IACS or aluminium at 61 % IACS, the linear temperature
// coefficient, 2 % for stranding and the IEC 60287 skin-effect formula at the
// system frequency. Reactance is an entered per-length figure (default
// 0.050 ohm per 1000 ft), raised by a quarter in steel conduit.

export const MATERIALS = {
  cu: { name: "copper", rho20: 1.7241e-8, alpha: 0.00393 },
  al: { name: "aluminium", rho20: 2.8264e-8, alpha: 0.00403 },
};

import { arcFlash, arcFlashWorstEnclosed, EQUIPMENT } from "./arcflash.mjs";

export { EQUIPMENT, CONFIGS, arcLabelText } from "./arcflash.mjs";

const STRAND = 1.02;
const KCMIL_MM2 = 0.5067074790975;
const M_PER_FT = 0.3048;
const SQRT3 = Math.sqrt(3);
export const DEFAULT_X_PER_1000FT = 0.05;
export const MAGNETIC_X_FACTOR = 1.25;

function awgAreaMm2(n) {
  const d = 0.127 * Math.pow(92, (36 - n) / 39);
  return (Math.PI * d * d) / 4;
}

const AWG = [
  ["14", 14], ["12", 12], ["10", 10], ["8", 8], ["6", 6], ["4", 4], ["3", 3], ["2", 2], ["1", 1],
  ["1/0", 0], ["2/0", -1], ["3/0", -2], ["4/0", -3],
].map(([id, n]) => ({ id, label: `${id} AWG`, areaMm2: awgAreaMm2(n) }));
const KCMIL = [250, 300, 350, 400, 500, 600, 750, 1000].map((k) => ({ id: String(k), label: `${k} kcmil`, areaMm2: k * KCMIL_MM2 }));
const METRIC = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630].map((a) => ({ id: `${a}mm2`, label: `${a} mm²`, areaMm2: a }));

export const SIZES = [...AWG, ...KCMIL, ...METRIC];

// What an omitted field means. No transformer, voltage or motors are assumed:
// a caller who leaves them out gets an error, not the page's example.
export const DEFAULTS = {
  phase: "3", volts: "", freq: "60", sourceMode: "transformer", kva: "", pctZ: "", txXR: "", tolerancePct: "10",
  utilityMva: "", utilityXR: "10", knownA: "", knownXR: "", motorFla: "", motorMult: "4", tempC: "25",
  lengthUnit: "ft", serviceName: "Service", serviceRatingKa: "", segments: [],
  arcConfig: "VCB", arcCapMs: "", serviceArcEquip: "", serviceClearMs: "", serviceClearMinMs: "",
};

// The page's example.
export const EXAMPLE = {
  phase: "3",
  volts: "480",
  freq: "60",
  sourceMode: "transformer",
  kva: "1500",
  pctZ: "3.5",
  txXR: "6",
  tolerancePct: "10",
  utilityMva: "",
  utilityXR: "10",
  knownA: "",
  knownXR: "",
  motorFla: "1804",
  motorMult: "4",
  tempC: "25",
  lengthUnit: "ft",
  serviceName: "Service (transformer secondary)",
  serviceRatingKa: "65",
  arcConfig: "VCB",
  arcCapMs: "",
  serviceArcEquip: "lv-swgr",
  serviceClearMs: "500",
  serviceClearMinMs: "750",
  segments: [
    { name: "MDP", from: 0, size: "400", material: "cu", sets: "6", length: "25", conduit: "magnetic", x: "", ratingKa: "65", arcEquip: "lv-swgr", clearMs: "50", clearMinMs: "320" },
    { name: "Panel LP-1", from: 1, size: "1/0", material: "cu", sets: "1", length: "150", conduit: "magnetic", x: "", ratingKa: "10", arcEquip: "lv-panel", clearMs: "25", clearMinMs: "25" },
    { name: "Panel LP-2 (via 75 kVA transformer)", from: 1, size: "1", material: "cu", sets: "1", length: "40", conduit: "magnetic", x: "", ratingKa: "10", txKva: "75", txPctZ: "4.5", txXR: "2", txVolts: "208", arcEquip: "lv-panel", clearMs: "16", clearMinMs: "16" },
  ],
};

export function sampleInput() {
  return JSON.parse(JSON.stringify(EXAMPLE));
}

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// complex helpers
const C = (re, im = 0) => ({ re, im });
const add = (a, b) => C(a.re + b.re, a.im + b.im);
const scale = (a, k) => C(a.re * k, a.im * k);
const abs = (a) => Math.hypot(a.re, a.im);
function div(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
function parallel(a, b) {
  return div(C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re), add(a, b));
}
/** An impedance of magnitude z with the given X/R ratio. */
function polar(z, xr) {
  if (!(xr > 0)) return C(z, 0);
  const r = z / Math.sqrt(1 + xr * xr);
  return C(r, r * xr);
}

/** DC resistance in ohms per metre at tempC (stranded). */
export function rdcPerMetre(areaMm2, material = "cu", tempC = 25) {
  const m = MATERIALS[material];
  if (!m) throw new Error(`unknown material ${material}`);
  return ((m.rho20 * (1 + m.alpha * (tempC - 20))) / (areaMm2 * 1e-6)) * STRAND;
}

/** IEC 60287-1-1 skin effect factor ys for a round conductor (ks = 1). */
export function skinFactor(rdcPerM, freq = 60) {
  const xs2 = ((8 * Math.PI * freq) / rdcPerM) * 1e-7;
  const xs4 = xs2 * xs2;
  return xs4 / (192 + 0.8 * xs4);
}

/** AC resistance in ohms per metre (DC times 1 + skin effect). */
export function racPerMetre(areaMm2, material, tempC, freq) {
  const rdc = rdcPerMetre(areaMm2, material, tempC);
  return rdc * (1 + skinFactor(rdc, freq));
}

/** IEC 60909 peak factor kappa from R/X. */
export function kappa(xr) {
  if (!(xr > 0)) return 1.02;
  return 1.02 + 0.98 * Math.exp(-3 / xr);
}

function ceil100(a) {
  return Math.ceil(a / 100) * 100;
}

function fmtA(a) {
  return Math.round(a).toLocaleString("en-US");
}

/**
 * Solve the network. Returns nodes in input order (node 0 is the service) with
 * the ohmic and magnitude-sum (point-to-point) fault currents, X/R, peak, and
 * the equipment rating check; or { error }.
 */
export function analyze(input = {}) {
  const x = { ...DEFAULTS, ...input };
  if (!Array.isArray(x.segments)) x.segments = [];
  const phase3 = String(x.phase) !== "1";
  const k = phase3 ? SQRT3 : 1; // I = V / (k |Z|)
  const cm = phase3 ? 1 : 2; // conductors in the fault loop per phase impedance
  const V = num(x.volts);
  if (!(V > 0) || V > 35000) return { error: "Enter the service voltage (line to line), more than 0 V." };
  const freq = num(x.freq) ?? 60;
  if (freq !== 50 && freq !== 60) return { error: "Frequency must be 50 or 60 Hz." };
  const tempC = num(x.tempC) ?? 25;
  if (Number.isNaN(tempC) || tempC < -40 || tempC > 250) return { error: "Conductor temperature must be between -40 and 250 C." };
  const lengthUnit = x.lengthUnit === "m" ? "m" : "ft";
  const toM = lengthUnit === "m" ? 1 : M_PER_FT;
  const assumptions = [];

  // ---- source at the service, on the service voltage
  let zs; // complex
  let source;
  if (x.sourceMode === "known") {
    const Ia = num(x.knownA);
    if (!(Ia > 0)) return { error: "Enter the available fault current the utility gave you, in amps, more than 0." };
    let xr = num(x.knownXR);
    if (Number.isNaN(xr) || (xr !== null && xr <= 0)) return { error: "X/R must be blank or more than 0." };
    if (xr === null) { xr = 6; assumptions.push("The utility figure's X/R was not entered; 6 was assumed. It only changes the complex sum, not the magnitude sum."); }
    zs = polar(V / (k * Ia), xr);
    source = { mode: "known", amps: Ia, xr };
  } else {
    const kva = num(x.kva), pctZ = num(x.pctZ);
    if (!(kva > 0)) return { error: "Enter the transformer size in kVA, more than 0." };
    if (!(pctZ > 0) || pctZ >= 50) return { error: "Enter the transformer impedance %Z from its nameplate, more than 0 and under 50." };
    const tol = num(x.tolerancePct) ?? 0;
    if (Number.isNaN(tol) || tol < 0 || tol >= 50) return { error: "Impedance allowance must be 0 or more and under 50 %." };
    let xr = num(x.txXR);
    if (Number.isNaN(xr) || (xr !== null && xr <= 0)) return { error: "Transformer X/R must be blank or more than 0." };
    if (xr === null) { xr = 6; assumptions.push("The transformer's X/R was not entered; 6 was assumed (its test report gives %R)."); }
    const zEff = (pctZ * (1 - tol / 100)) / 100;
    const zt = polar((zEff * V * V) / (kva * 1000), xr);
    let zu = C(0, 0);
    const mva = num(x.utilityMva);
    if (Number.isNaN(mva) || (mva !== null && mva <= 0)) return { error: "Utility fault MVA must be blank (infinite) or more than 0." };
    if (mva !== null) {
      let uxr = num(x.utilityXR);
      if (Number.isNaN(uxr) || (uxr !== null && uxr <= 0)) return { error: "Utility X/R must be blank or more than 0." };
      if (uxr === null) uxr = 10;
      zu = polar((V * V) / (mva * 1e6), uxr);
    } else {
      assumptions.push("The utility's primary was taken as an infinite bus (no source impedance ahead of the transformer), which gives the highest current.");
    }
    if (tol > 0) assumptions.push(`The transformer's %Z was reduced by ${tol} % (${pctZ} % to ${+(zEff * 100).toFixed(4)} %) to cover the nameplate tolerance; set the allowance to 0 to use the nameplate figure.`);
    const fla = (kva * 1000) / (k * V);
    source = { mode: "transformer", kva, pctZ, zEffPct: zEff * 100, xr, tolerancePct: tol, utilityMva: mva, fla, infiniteBusA: fla / zEff };
    zs = add(zu, zt);
  }

  // ---- motor contribution at the service, in phase with the source
  const fla = num(x.motorFla), mult = num(x.motorMult) ?? 4;
  if (Number.isNaN(fla) || (fla !== null && fla < 0)) return { error: "Motor full-load amps must be blank, 0 or more." };
  if (Number.isNaN(mult) || mult < 0 || mult > 20) return { error: "Motor contribution multiplier must be from 0 to 20 times full-load amps." };
  const motorA = fla ? fla * mult : 0;
  let zSvc = zs, zSvcMag = abs(zs);
  if (motorA > 0) {
    const zm = scale(div(zs, C(abs(zs), 0)), V / (k * motorA)); // same angle as the source
    zSvc = parallel(zs, zm);
    zSvcMag = 1 / (1 / abs(zs) + 1 / abs(zm));
  }

  const nodes = [];
  const mkNode = (name, volts, z, zMag, ratingKa, extra) => {
    const I = volts / (k * abs(z));
    const Ip = volts / (k * zMag);
    const xr = z.re > 0 ? z.im / z.re : Infinity;
    const kap = kappa(xr);
    const rating = ratingKa;
    return {
      name, volts, z, zMag, amps: I, ampsP2P: Ip, xr, kappa: kap, peakA: kap * Math.SQRT2 * I,
      p2pLowPct: Math.max(0, ((I - Ip) / I) * 100),
      ratingKa: rating, ok: rating === null ? null : I <= rating * 1000, labelA: ceil100(I), ...extra,
    };
  };
  const svcRating = num(x.serviceRatingKa);
  if (Number.isNaN(svcRating) || (svcRating !== null && svcRating <= 0)) return { error: "The service equipment rating must be blank or more than 0 kA." };
  nodes.push(mkNode(String(x.serviceName || "Service").slice(0, 80), V, zSvc, zSvcMag, svcRating, { from: null, motorA, segment: null }));

  const segs = x.segments;
  if (segs.length > 40) return { error: "Up to 40 feeders." };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i] || {};
    const label = `Feeder ${i + 1}${s.name ? ` (${String(s.name).slice(0, 80)})` : ""}`;
    const from = s.from === undefined || s.from === null || s.from === "" ? i : num(s.from);
    if (!Number.isInteger(from) || from < 0 || from > i) return { error: `${label}: "fed from" must be the service or an earlier panel.` };
    const up = nodes[from];
    const len = num(s.length) ?? 0;
    if (Number.isNaN(len) || len < 0 || len > 100000) return { error: `${label}: enter the one-way length, 0 or more.` };
    const sets = num(s.sets) ?? 1;
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) return { error: `${label}: parallel sets must be a whole number from 1 to 20.` };
    let zc = C(0, 0);
    let size = null, material = s.material === "al" ? "al" : "cu", rPer = 0, xPer = 0;
    if (len > 0) {
      size = SIZES.find((z) => z.id === String(s.size ?? "").trim()) || null;
      if (!size) return { error: `${label}: choose a conductor size.` };
      const xIn = num(s.x);
      if (Number.isNaN(xIn) || (xIn !== null && xIn < 0)) return { error: `${label}: reactance must be blank or 0 or more.` };
      // An entered reactance is per 1000 ft (feet) or per km (metres) and used as is;
      // the default is raised by a quarter in steel conduit.
      if (xIn !== null) xPer = lengthUnit === "m" ? xIn / 1000 : xIn / (1000 * M_PER_FT);
      else xPer = (DEFAULT_X_PER_1000FT / (1000 * M_PER_FT)) * (s.conduit === "magnetic" ? MAGNETIC_X_FACTOR : 1);
      rPer = racPerMetre(size.areaMm2, material, tempC, freq);
      const Lm = len * toM;
      zc = scale(C(rPer, xPer), (cm * Lm) / sets);
    }
    let z = add(up.z, zc);
    let zMag = up.zMag + abs(zc);
    let volts = up.volts;
    let tx = null;
    const txKva = num(s.txKva);
    if (Number.isNaN(txKva) || (txKva !== null && txKva <= 0)) return { error: `${label}: transformer kVA must be blank or more than 0.` };
    if (txKva !== null) {
      const tz = num(s.txPctZ), tv = num(s.txVolts);
      let txr = num(s.txXR);
      if (!(tz > 0) || tz >= 50) return { error: `${label}: enter the transformer's %Z, more than 0 and under 50.` };
      if (!(tv > 0) || tv > 35000) return { error: `${label}: enter the transformer's secondary voltage, line to line.` };
      if (Number.isNaN(txr) || (txr !== null && txr <= 0)) return { error: `${label}: transformer X/R must be blank or more than 0.` };
      if (txr === null) { txr = 4; assumptions.push(`${label}: the transformer's X/R was not entered; 4 was assumed.`); }
      const ratio2 = (tv / volts) ** 2;
      const tol = source.mode === "transformer" ? source.tolerancePct : 0;
      const zEff = (tz * (1 - tol / 100)) / 100;
      const zt = polar((zEff * tv * tv) / (txKva * 1000), txr);
      z = add(scale(z, ratio2), zt);
      zMag = zMag * ratio2 + abs(zt);
      tx = { kva: txKva, pctZ: tz, zEffPct: zEff * 100, xr: txr, primaryV: volts, secondaryV: tv, infiniteBusA: (txKva * 1000) / (k * tv) / zEff };
      volts = tv;
    }
    if (len === 0 && !tx) return { error: `${label}: enter a length, or a transformer, or both.` };
    const rk = num(s.ratingKa);
    if (Number.isNaN(rk) || (rk !== null && rk <= 0)) return { error: `${label}: the equipment rating must be blank or more than 0 kA.` };
    nodes.push(mkNode(s.name ? String(s.name).slice(0, 80) : `Panel ${i + 1}`, volts, z, zMag, rk, {
      from, motorA: 0,
      segment: { size: size ? size.label : null, material, sets, length: len, conduit: s.conduit === "magnetic" ? "magnetic" : "nonmagnetic", rPer1000ft: rPer * 1000 * M_PER_FT, xPer1000ft: xPer * 1000 * M_PER_FT, tx },
    }));
  }

  // ---- arc flash (IEEE 1584-2018) where a panel names its equipment and a clearing time
  const arcConfig = ["VCB", "VCBB", "HCB", "VOA", "HOA", "worst"].includes(String(x.arcConfig)) ? String(x.arcConfig) : "VCB";
  const arcCap = num(x.arcCapMs);
  if (Number.isNaN(arcCap) || (arcCap !== null && arcCap <= 0)) return { error: "The arc-flash time cap must be blank or more than 0 ms." };
  const arcInputs = [{ arcEquip: x.serviceArcEquip, clearMs: x.serviceClearMs, clearMinMs: x.serviceClearMinMs }, ...segs.map((s) => s || {})];
  nodes.forEach((n, i) => {
    const a = arcInputs[i] || {};
    const eqId = String(a.arcEquip ?? "").trim();
    n.arc = null;
    if (!eqId) return;
    const eq = EQUIPMENT.find((e) => e.id === eqId);
    if (!eq) { n.arc = { error: "Unknown equipment type." }; return; }
    if (!phase3) { n.arc = { error: "IEEE 1584-2018 covers three-phase systems only." }; return; }
    const inp = { volts: n.volts, config: arcConfig, ibfKa: n.amps / 1000, gapMm: eq.gap, distMm: eq.dist, heightMm: eq.h, widthMm: eq.w, depthMm: eq.d, clearMs: a.clearMs, clearMinMs: a.clearMinMs, capMs: arcCap };
    const r = arcConfig === "worst" ? arcFlashWorstEnclosed(inp) : arcFlash(inp);
    n.arc = { ...r, equipment: eq.label };
  });
  const arcDone = nodes.filter((n) => n.arc && !n.arc.error);

  // ---- findings
  const findings = [];
  const over = nodes.filter((n) => n.ok === false);
  for (const n of over) {
    findings.push({ severity: "high", title: `${n.name}: ${fmtA(n.amps)} A available, above its ${n.ratingKa} kA rating`, detail: `Equipment whose interrupting or short-circuit rating is below the available fault current can fail violently in a fault (NEC 110.9 and 110.10 in the US). Check the rating on the actual equipment and any listed series rating; a higher-rated device, current-limiting fuses or more impedance ahead of it lower the risk.` });
  }
  const svc = nodes[0];
  findings.push({ severity: "info", title: `Service: ${fmtA(svc.amps)} A symmetrical, X/R ${Number.isFinite(svc.xr) ? svc.xr.toFixed(1) : "∞"}`, detail: `Rounded up for a label: ${svc.labelA.toLocaleString("en-US")} A.${motorA > 0 ? ` Includes ${fmtA(motorA)} A of motor contribution (${mult} x ${fla} A full-load).` : ""}${source.mode === "transformer" ? ` The transformer alone on an infinite bus gives ${fmtA(source.infiniteBusA)} A.` : ""}` });
  const worst = nodes.slice(1).reduce((m, n) => (n.p2pLowPct > (m?.p2pLowPct ?? -1) ? n : m), null);
  if (worst && worst.p2pLowPct >= 2) {
    findings.push({ severity: "medium", title: `Adding impedances as magnitudes reads ${worst.p2pLowPct.toFixed(1)} % low at ${worst.name}`, detail: `The point-to-point method's multipliers add every impedance as if all had the same angle. The transformer is mostly reactance and a long small feeder mostly resistance, so their true (complex) sum is smaller and the real fault current higher: ${fmtA(worst.amps)} A against ${fmtA(worst.ampsP2P)} A here. Use the higher figure when you check equipment ratings.` });
  }
  const arcFindings = [];
  for (const n of nodes.filter((m) => m.arc && m.arc.error)) {
    arcFindings.push({ severity: "medium", title: `${n.name}: no arc-flash result`, detail: n.arc.error });
  }
  if (arcDone.length) {
    const top = arcDone.reduce((m, n) => (n.arc.eCal > m.arc.eCal ? n : m));
    const a = top.arc;
    arcFindings.push({ severity: a.eCal > 8 ? "high" : "medium", title: `Highest arc-flash energy: ${a.eCal.toFixed(1)} cal/cm² at ${top.name}`, detail: `IEEE 1584-2018 (${a.config}) at ${Math.round(a.distMm / 25.4)} in, from ${(a.ibfKa).toFixed(2)} kA bolted. Arcing current ${a.full.iarcKa.toFixed(2)} kA (reduced ${a.reduced.iarcKa.toFixed(2)} kA): read your protective device's total clearing time at both on its curve. The ${a.worst === "reduced" ? "reduced arcing current, cleared more slowly," : "full arcing current"} gives the higher energy here. Arc flash boundary ${Math.round(a.afbMm / 25.4)} in. Arc-rated PPE must be rated at least the incident energy.` });
    const seen = new Set();
    for (const n of arcDone) for (const w of n.arc.warnings) { const key = w.slice(0, 40); if (!seen.has(key)) { seen.add(key); arcFindings.push({ severity: "info", title: `Arc flash: ${n.name}`, detail: w }); } }
    if (motorA > 0) arcFindings.push({ severity: "info", title: "Arc flash uses the full bolted current, motors included", detail: "Motor contribution decays within a few cycles, so a long-clearing arc sees less of it. The bolted figure with motors gives the higher arcing current; repeat with the motors left out to see the lower-current case, which can clear more slowly and give more energy." });
  }
  findings.push(...arcFindings);
  for (const a of assumptions) findings.push({ severity: "info", title: "Assumption", detail: a });

  return {
    input: { phase: phase3 ? "3" : "1", volts: V, freq, tempC, lengthUnit },
    source, motorA, nodes, findings,
    over: over.length,
    arcConfig, arcMaxCal: arcDone.length ? Math.max(...arcDone.map((n) => n.arc.eCal)) : null,
  };
}

/** NEC 110.24 style label text for one node; date is supplied by the caller. */
export function labelText(node, date) {
  const d = String(date || "").trim() || "____________";
  return `AVAILABLE FAULT CURRENT\n${node.name}\nMaximum available fault current: ${node.labelA.toLocaleString("en-US")} A\n(${Math.round(node.amps).toLocaleString("en-US")} A symmetrical rms, ${node.volts} V)\nDate of calculation: ${d}`;
}

function csvCell(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportCsv(a) {
  const head = ["node", "name", "fed_from", "volts", "conductor", "sets", "length_" + a.input.lengthUnit, "transformer", "fault_a_sym", "fault_a_magnitude_sum", "magnitude_sum_low_pct", "x_over_r", "kappa", "peak_a", "rating_ka", "within_rating", "label_a", "arc_equipment", "arc_config", "arcing_ka", "arcing_ka_reduced", "incident_energy_cal_cm2", "working_distance_in", "arc_flash_boundary_in"];
  const rows = a.nodes.map((n, i) => [
    i, n.name, n.from === null ? "" : n.from, n.volts,
    n.segment && n.segment.size ? `${n.segment.size} ${n.segment.material}` : "",
    n.segment ? n.segment.sets : "", n.segment ? n.segment.length : "",
    n.segment && n.segment.tx ? `${n.segment.tx.kva} kVA ${n.segment.tx.pctZ}%Z to ${n.segment.tx.secondaryV} V` : "",
    Math.round(n.amps), Math.round(n.ampsP2P), n.p2pLowPct.toFixed(2),
    Number.isFinite(n.xr) ? n.xr.toFixed(2) : "inf", n.kappa.toFixed(3), Math.round(n.peakA),
    n.ratingKa ?? "", n.ok === null ? "" : n.ok ? "yes" : "NO", n.labelA,
    ...(n.arc && !n.arc.error
      ? [n.arc.equipment, n.arc.config, n.arc.full.iarcKa.toFixed(3), n.arc.reduced.iarcKa.toFixed(3), n.arc.eCal.toFixed(2), Math.round(n.arc.distMm / 25.4), Math.round(n.arc.afbMm / 25.4)]
      : [n.arc && n.arc.error ? `error: ${n.arc.error}` : "", "", "", "", "", "", ""]),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
