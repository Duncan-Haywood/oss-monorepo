// Arc-flash incident energy and arc flash boundary by the IEEE 1584-2018 model.
//
// Ported to JavaScript from the FSL-1.1-MIT-licensed Python library `arcflash`
// (Copyright 2022 Li-aung Yip, https://github.com/LiaungYip/arcflash, files
// arcflash/ieee_1584/{tables,cubicle,equations,calculation}.py). That library
// reproduces the worked examples of IEEE 1584-2018 Annex D.1 and D.2 and reports
// agreement with the IEEE's own calculator spreadsheets on 144,000 cases; this
// port is checked against every intermediate and final Annex D figure in
// arcflash.test.mjs (see README, "Arc flash").
// The coefficient tables below are the library's transcription of IEEE
// 1584-2018 Tables 1 to 5 and 7; Table 8/10 is its condensed typical-equipment
// table. Units follow the standard: kV, kA, mm, ms, J/cm².
//
// Licence of the ported code (the port keeps it; the rest of this venture is
// MIT under the repository's own notice):
//
// MIT License
//
// Copyright (c) 2022 Li-aung Yip - https://www.penwatch.net
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const T1 = `VCB 0.6 -0.04287 1.035 -0.083 0 0 -4.783E-09 1.962E-06 -0.000229 0.003141 1.092
VCB 2.7 0.0065 1.001 -0.024 -1.557E-12 4.556E-10 -4.186E-08 8.346E-07 5.482E-05 -0.003191 0.9729
VCB 14.3 0.005795 1.015 -0.011 -1.557E-12 4.556E-10 -4.186E-08 8.346E-07 5.482E-05 -0.003191 0.9729
VCBB 0.6 -0.017432 0.98 -0.05 0 0 -5.767E-09 2.524E-06 -0.00034 0.01187 1.013
VCBB 2.7 0.002823 0.995 -0.0125 0 -9.204E-11 2.901E-08 -3.262E-06 0.0001569 -0.004003 0.9825
VCBB 14.3 0.014827 1.01 -0.01 0 -9.204E-11 2.901E-08 -3.262E-06 0.0001569 -0.004003 0.9825
HCB 0.6 0.054922 0.988 -0.11 0 0 -5.382E-09 2.316E-06 -0.000302 0.0091 0.9725
HCB 2.7 0.001011 1.003 -0.0249 0 0 4.859E-10 -1.814E-07 -9.128E-06 -0.0007 0.9881
HCB 14.3 0.008693 0.999 -0.02 0 -5.043E-11 2.233E-08 -3.046E-06 0.000116 -0.001145 0.9839
VOA 0.6 0.043785 1.04 -0.18 0 0 -4.783E-09 1.962E-06 -0.000229 0.003141 1.092
VOA 2.7 -0.02395 1.006 -0.0188 -1.557E-12 4.556E-10 -4.186E-08 8.346E-07 5.482E-05 -0.003191 0.9729
VOA 14.3 0.005371 1.0102 -0.029 -1.557E-12 4.556E-10 -4.186E-08 8.346E-07 5.482E-05 -0.003191 0.9729
HOA 0.6 0.111147 1.008 -0.24 0 0 -3.895E-09 1.641E-06 -0.000197 0.002615 1.1
HOA 2.7 0.000435 1.006 -0.038 0 0 7.859E-10 -1.914E-07 -9.128E-06 -0.0007 0.9981
HOA 14.3 0.000904 0.999 -0.02 0 0 7.859E-10 -1.914E-07 -9.128E-06 -0.0007 0.9981`;

const T2 = `VCB 0 -0.0000014269 0.000083137 -0.0019382 0.022366 -0.12645 0.30226
VCBB 1.138e-06 -6.0287e-05 0.0012758 -0.013778 0.080217 -0.24066 0.33524
HCB 0 -3.097e-06 0.00016405 -0.0033609 0.033308 -0.16182 0.34627
VOA 9.5606E-07 -5.1543E-05 0.0011161 -0.01242 0.075125 -0.23584 0.33696
HOA 0 -3.1555e-06 0.0001682 -0.0034607 0.034124 -0.1599 0.34629`;

// Tables 3 (600 V), 4 (2700 V) and 5 (14 300 V): k1..k13 per configuration.
const T345 = {
  0.6: `VCB 0.753364 0.566 1.752636 0 0 -4.783E-09 0.000001962 -0.000229 0.003141 1.092 0 -1.598 0.957
VCBB 3.068459 0.26 -0.098107 0 0 -5.767E-09 0.000002524 -0.00034 0.01187 1.013 -0.06 -1.809 1.19
HCB 4.073745 0.344 -0.370259 0 0 -5.382E-09 0.000002316 -0.000302 0.0091 0.9725 0 -2.03 1.036
VOA 0.679294 0.746 1.222636 0 0 -4.783E-09 0.000001962 -0.000229 0.003141 1.092 0 -1.598 0.997
HOA 3.470417 0.465 -0.261863 0 0 -3.895E-09 0.000001641 -0.000197 0.002615 1.1 0 -1.99 1.04`,
  2.7: `VCB 2.40021 0.165 0.354202 -1.557E-12 4.556E-10 -4.186E-08 8.346E-07 5.482E-05 -0.003191 0.9729 0 -1.569 0.9778
VCBB 3.870592 0.185 -0.736618 0 -9.204E-11 2.901E-08 -3.262E-06 0.0001569 -0.004003 0.9825 0 -1.742 1.09
HCB 3.486391 0.177 -0.193101 0 0 4.859E-10 -1.814E-07 -9.128E-06 -0.0007 0.9881 0.027 -1.723 1.055
VOA 3.880724 0.105 -1.906033 -1.557E-12 4.556E-10 -4.186E-08 8.346E-07 5.482E-05 -0.003191 0.9729 0 -1.515 1.115
HOA 3.616266 0.149 -0.761561 0 0 7.859E-10 -1.914E-07 -9.128E-06 -0.0007 0.9981 0 -1.639 1.078`,
  14.3: `VCB 3.825917 0.11 -0.999749 -1.557E-12 4.556E-10 -4.186E-08 8.346E-07 5.482E-05 -0.003191 0.9729 0 -1.568 0.99
VCBB 3.644309 0.215 -0.585522 0 -9.204E-11 2.901E-08 -3.262E-06 0.0001569 -0.004003 0.9825 0 -1.677 1.06
HCB 3.044516 0.125 0.245106 0 -5.043E-11 2.233E-08 -3.046E-06 0.000116 -0.001145 0.9839 0 -1.655 1.084
VOA 3.405454 0.12 -0.93245 -1.557E-12 4.556E-10 -4.186E-08 8.346E-07 5.482E-05 -0.003191 0.9729 0 -1.534 0.979
HOA 2.04049 0.177 1.005092 0 0 7.859E-10 -1.914E-07 -9.128E-06 -0.0007 0.9981 -0.05 -1.633 1.151`,
};

const T7 = `Typical VCB -0.000302 0.03441 0.4325
Typical VCBB -0.0002976 0.032 0.479
Typical HCB -0.0001923 0.01935 0.6899
Shallow VCB 0.002222 -0.02556 0.6222
Shallow VCBB -0.002778 0.1194 -0.2778
Shallow HCB -0.0005556 0.03722 0.4778`;

const rows = (s) => s.trim().split("\n").map((l) => l.trim().split(/\s+/));
const TABLE1 = {};
for (const [ec, v, ...k] of rows(T1)) TABLE1[`${ec} ${Number(v)}`] = k.map(Number);
const TABLE2 = {};
for (const [ec, ...k] of rows(T2)) TABLE2[ec] = k.map(Number);
const TABLE345 = {};
for (const [v, txt] of Object.entries(T345)) for (const [ec, ...k] of rows(txt)) TABLE345[`${ec} ${Number(v)}`] = k.map(Number);
const TABLE7 = {};
for (const [box, ec, ...b] of rows(T7)) TABLE7[`${box} ${ec}`] = b.map(Number);

export const CONFIGS = [
  { id: "VCB", label: "VCB: vertical conductors in a box (most common)" },
  { id: "VCBB", label: "VCBB: vertical conductors ending in an insulating barrier, in a box" },
  { id: "HCB", label: "HCB: horizontal conductors in a box" },
  { id: "VOA", label: "VOA: vertical conductors in open air" },
  { id: "HOA", label: "HOA: horizontal conductors in open air" },
];

// IEEE 1584-2018 Tables 8 and 10 as condensed by the arcflash library:
// typical gap G, enclosure height, width, depth and working distance, mm.
export const EQUIPMENT = [
  { id: "lv-panel", label: "Panelboard, 208-600 V", gap: 25, h: 355.6, w: 304.8, d: 250, dist: 457.2 },
  { id: "lv-panel-shallow", label: "Panelboard, 208-600 V, shallow (8 in deep or less)", gap: 25, h: 355.6, w: 304.8, d: 100, dist: 457.2 },
  { id: "lv-mcc", label: "MCC, 208-600 V", gap: 25, h: 355.6, w: 304.8, d: 250, dist: 457.2 },
  { id: "lv-swgr", label: "Switchgear / switchboard, 208-600 V", gap: 32, h: 508, w: 508, d: 508, dist: 609.6 },
  { id: "lv-jbox", label: "Cable junction box, 208-600 V", gap: 13, h: 355.6, w: 304.8, d: 250, dist: 457.2 },
  { id: "5kv-swgr", label: "Switchgear, 5 kV class", gap: 104, h: 914.4, w: 914.4, d: 914.4, dist: 914.4 },
  { id: "5kv-swgr-2", label: "Switchgear, 5 kV class, 1143 x 762 mm", gap: 104, h: 1143, w: 762, d: 762, dist: 914.4 },
  { id: "5kv-mcc", label: "MCC, 5 kV class", gap: 104, h: 660.4, w: 660.4, d: 660.4, dist: 914.4 },
  { id: "15kv-swgr", label: "Switchgear, 15 kV class", gap: 152, h: 1143, w: 762, d: 762, dist: 914.4 },
  { id: "15kv-mcc", label: "MCC, 15 kV class", gap: 152, h: 914.4, w: 914.4, d: 914.4, dist: 914.4 },
];

export const J_PER_CAL = 4.184;
const MM_TO_IN = 0.03937; // the truncated factor IEEE 1584-2018 prints; kept so Annex D matches
const log10 = Math.log10;

function poly(k, x) { // k[0] x^(n-1) + ... + k[n-1]
  let s = 0;
  for (const c of k) s = s * x + c;
  return s;
}

/** Eq. 1: intermediate arcing current at 0.6, 2.7 or 14.3 kV, kA. */
export function iarcIntermediate(ec, vKey, ibf, gap) {
  const k = TABLE1[`${ec} ${vKey}`];
  const x1 = k[0] + k[1] * log10(ibf) + k[2] * log10(gap);
  const x2 = poly(k.slice(3), ibf);
  return 10 ** x1 * x2;
}

/** Eqs. 3-6: intermediate incident energy, J/cm². iarc600 is given for the LV case (Eq. 6). */
function eIntermediate(ec, vKey, iarc, ibf, tMs, gap, dist, cf, iarc600) {
  const k = TABLE345[`${ec} ${vKey}`];
  const x1 = (12.552 / 50) * tMs;
  const x2 = k[0] + k[1] * log10(gap);
  const x3 = (k[2] * (iarc600 ?? iarc)) / poly([...k.slice(3, 10), 0], ibf); // k4 Ibf^7 + ... + k10 Ibf
  const x4 = k[10] * log10(ibf) + k[12] * log10(iarc) + log10(1 / cf);
  const x5 = k[11] * log10(dist);
  return x1 * 10 ** (x2 + x3 + x4 + x5);
}

/** Eqs. 7-10 recast (as the arcflash library does): the distance where E falls to 1.2 cal/cm² (5.0208 J/cm²), mm. */
function afbFromE(ec, vKey, e, dist) {
  const k12 = TABLE345[`${ec} ${vKey}`][11];
  const f = e / dist ** k12;
  return (5.0208 / f) ** (1 / k12);
}

/** Eqs. 16-24: interpolate an intermediate quantity to the system voltage (0.6 < V <= 15 kV). */
export function interpolate(v, x600, x2700, x14300) {
  const x1 = ((x2700 - x600) / 2.1) * (v - 2.7) + x2700;
  const x2 = ((x14300 - x2700) / 11.6) * (v - 14.3) + x14300;
  const x3 = (x1 * (2.7 - v)) / 2.1 + (x2 * (v - 0.6)) / 2.1;
  return v <= 2.7 ? x3 : x2;
}

/** Eq. 25: final arcing current below 600 V, kA. */
function iarcFinalLV(v, iarc600, ibf) {
  const x1 = (0.6 / v) ** 2;
  const x2 = 1 / iarc600 ** 2;
  const x3 = (0.6 ** 2 - v ** 2) / (0.6 ** 2 * ibf ** 2);
  return 1 / Math.sqrt(x1 * (x2 - x3));
}

/** Arcing current variation correction factor (equation under Eq. 2). */
export function varCf(ec, v) {
  return poly(TABLE2[ec], v);
}

/** Enclosure size correction factor CF (Eqs. 11-15, Table 6). */
export function enclosureCf(ec, v, h, w, d) {
  if (ec === "VOA" || ec === "HOA") return { cf: 1, box: null, width1: null, height1: null, ees: null };
  const box = v < 0.6 && h < 508 && w < 508 && d <= 203.2 ? "Shallow" : "Typical";
  const [A, B] = { VCB: [4, 20], VCBB: [10, 24], HCB: [10, 22] }[ec];
  const eq1112 = (dim) => (660.4 + (dim - 660.4) * ((v + A) / B)) / 25.4;
  let width1, height1;
  if (w < 508) width1 = box === "Typical" ? 20 : MM_TO_IN * w;
  else if (w <= 660.4) width1 = MM_TO_IN * w;
  else if (w <= 1244.6) width1 = eq1112(w);
  else width1 = eq1112(1244.6);
  if (h < 508) height1 = box === "Typical" ? 20 : MM_TO_IN * h;
  else if (h <= 660.4) height1 = MM_TO_IN * h;
  else if (h <= 1244.6) height1 = ec === "VCB" ? MM_TO_IN * h : eq1112(h);
  else height1 = ec === "VCB" ? 49 : eq1112(1244.6);
  const ees = (height1 + width1) / 2;
  const [b1, b2, b3] = TABLE7[`${box} ${ec}`];
  const x = b1 * ees * ees + b2 * ees + b3;
  return { cf: box === "Typical" ? x : 1 / x, box, width1, height1, ees };
}

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * One IEEE 1584-2018 calculation.
 * input: { volts (line to line, V), ibfKa (bolted three-phase fault, kA), config,
 *          gapMm, distMm, heightMm, widthMm, depthMm,
 *          clearMs (clearing time at the full arcing current),
 *          clearMinMs (clearing time at the reduced arcing current; blank = clearMs),
 *          capMs (optional cap on both times, e.g. 2000) }
 * Returns the full and reduced arcing-current cases and the worse of the two, or { error }.
 */
export function arcFlash(input = {}) {
  const V = num(input.volts);
  if (!(V >= 208 && V <= 15000)) return { error: "IEEE 1584-2018 covers three-phase systems from 208 V to 15,000 V line to line." };
  const v = V / 1000;
  const lv = v <= 0.6;
  const ec = String(input.config || "VCB").toUpperCase();
  if (!TABLE2[ec]) return { error: "Choose an electrode configuration: VCB, VCBB, HCB, VOA or HOA." };
  const ibf = num(input.ibfKa);
  if (lv && !(ibf >= 0.5 && ibf <= 106)) return { error: "At 600 V and below the model covers bolted fault currents from 0.5 to 106 kA." };
  if (!lv && !(ibf >= 0.2 && ibf <= 65)) return { error: "Above 600 V the model covers bolted fault currents from 0.2 to 65 kA." };
  const G = num(input.gapMm);
  if (lv && !(G >= 6.35 && G <= 76.2)) return { error: "At 600 V and below the conductor gap must be 6.35 to 76.2 mm." };
  if (!lv && !(G >= 19.05 && G <= 254)) return { error: "Above 600 V the conductor gap must be 19.05 to 254 mm." };
  const D = num(input.distMm);
  if (!(D >= 305)) return { error: "The working distance must be at least 305 mm (12 in)." };
  const open = ec === "VOA" || ec === "HOA";
  let H = num(input.heightMm), W = num(input.widthMm), Dp = num(input.depthMm);
  if (open) { H = H || 0; W = W || 0; Dp = Dp || 0; } else {
    if (!(H > 0) || !(W > 0) || !(Dp > 0)) return { error: "Enter the enclosure's height, width and depth (or choose an open-air configuration)." };
    if (W < 4 * G) return { error: "The enclosure must be at least four times the conductor gap wide for the model to apply." };
  }
  const t = num(input.clearMs);
  if (!(t > 0) || t > 60000) return { error: "Enter the arc clearing time in milliseconds, more than 0 (the protective device's total clearing time at the arcing current)." };
  let tMin = num(input.clearMinMs);
  if (Number.isNaN(tMin) || (tMin !== null && (tMin <= 0 || tMin > 60000))) return { error: "The clearing time at the reduced arcing current must be blank or more than 0 ms." };
  const cap = num(input.capMs);
  if (Number.isNaN(cap) || (cap !== null && cap <= 0)) return { error: "The time cap must be blank or more than 0 ms." };
  const warnings = [];
  if (tMin === null) {
    tMin = t;
    warnings.push("No separate clearing time was entered for the reduced arcing current, so the same time was used. A lower current can take a protective device much longer to clear: read its curve at the reduced current too.");
  }
  let tFull = t, tRed = tMin;
  if (cap !== null) {
    if (tFull > cap || tRed > cap) warnings.push(`Clearing time capped at ${cap} ms. IEEE 1584 allows a cap (commonly 2 seconds) only where a worker can plainly move away from the arc; in a bucket, a crawl space or behind a door, use the full time.`);
    tFull = Math.min(tFull, cap); tRed = Math.min(tRed, cap);
  } else if (Math.max(t, tMin) > 2000) {
    warnings.push("A clearing time over 2 seconds was used as entered. IEEE 1584 discusses capping it at 2 seconds where a worker can readily move away; set the cap only if that is true here.");
  }

  const enc = enclosureCf(ec, v, H, W, Dp);
  const vcf = varCf(ec, v);
  const keys = [0.6, 2.7, 14.3];

  function oneCase(reduced, tMs) {
    const f = reduced ? 1 - 0.5 * vcf : 1;
    if (lv) {
      const ia600 = iarcIntermediate(ec, 0.6, ibf, G);
      const iarc = iarcFinalLV(v, ia600, ibf) * f;
      const e = eIntermediate(ec, 0.6, iarc, ibf, tMs, G, D, enc.cf, ia600);
      return { iarcKa: iarc, tMs, eJ: e, afbMm: afbFromE(ec, 0.6, e, D), inter: null };
    }
    const ia = keys.map((vk) => iarcIntermediate(ec, vk, ibf, G) * f);
    const es = keys.map((vk, i) => eIntermediate(ec, vk, ia[i], ibf, tMs, G, D, enc.cf));
    const afbs = keys.map((vk, i) => afbFromE(ec, vk, es[i], D));
    return {
      iarcKa: interpolate(v, ...ia), tMs,
      eJ: interpolate(v, ...es), afbMm: interpolate(v, ...afbs),
      inter: { iarcKa: ia, eJ: es, afbMm: afbs },
    };
  }
  const full = oneCase(false, tFull);
  const reduced = oneCase(true, tRed);
  for (const c of [full, reduced]) { c.eCal = c.eJ / J_PER_CAL; }
  const worst = reduced.eJ > full.eJ ? "reduced" : "full";
  const w = worst === "reduced" ? reduced : full;
  return {
    volts: V, config: ec, ibfKa: ibf, gapMm: G, distMm: D, heightMm: H, widthMm: W, depthMm: Dp,
    cf: enc.cf, box: enc.box, ees: enc.ees, width1: enc.width1, height1: enc.height1, varCf: vcf,
    full, reduced, worst,
    eJ: w.eJ, eCal: w.eCal, afbMm: Math.max(full.afbMm, reduced.afbMm),
    warnings,
  };
}

/** Worst result across the enclosed configurations (VCB, VCBB, HCB) when the real one is unknown. */
export function arcFlashWorstEnclosed(input = {}) {
  const runs = ["VCB", "VCBB", "HCB"].map((c) => arcFlash({ ...input, config: c }));
  const bad = runs.find((r) => r.error);
  if (bad) return bad;
  const top = runs.reduce((m, r) => (r.eJ > m.eJ ? r : m));
  return { ...top, compared: runs.map((r) => ({ config: r.config, eCal: r.eCal, afbMm: r.afbMm })) };
}

/** Arc flash label lines for a result (NFPA 70E 130.5(H) style fields); date supplied by the caller. */
export function arcLabelText(name, r, date) {
  const d = String(date || "").trim() || "____________";
  const inch = (mm) => Math.round(mm / 25.4);
  return [
    "WARNING: ARC FLASH HAZARD",
    String(name || "Equipment").slice(0, 80),
    `Nominal voltage: ${r.volts} V`,
    `Incident energy: ${r.eCal.toFixed(1)} cal/cm² at ${inch(r.distMm)} in working distance`,
    `Arc flash boundary: ${inch(r.afbMm)} in (${Math.round(r.afbMm)} mm)`,
    `Bolted fault current: ${(r.ibfKa).toFixed(2)} kA; arcing current ${r.full.iarcKa.toFixed(2)} kA (reduced ${r.reduced.iarcKa.toFixed(2)} kA)`,
    `IEEE 1584-2018, ${r.config}; date of calculation: ${d}`,
  ].join("\n");
}
