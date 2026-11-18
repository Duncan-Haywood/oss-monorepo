// Gage R&R (measurement system analysis) by the ANOVA method, crossed and
// nested, with modified large-sample confidence intervals for every
// variance component. Plain ES module, no imports: the page, the CLI and
// platform/agents/tools.mjs all load this same file.
//
// Written from the papers below; no third-party code was ported. The
// distribution functions are the textbook series and continued fractions
// (DLMF 8.11, 8.9 and 8.17), solved for quantiles by bisection.

export const PAPERS = [
  {
    key: "montgomery1993gauge",
    cite: "Montgomery, D. C. & Runger, G. C. (1993). Gauge capability and designed experiments. Part I: basic methods; Part II: experimental design models and variance component estimation. Quality Engineering 6(1), 115-135 and 6(2), 289-305.",
    doi: "10.1080/08982119308918710",
    used: "two-factor random-effects ANOVA for a crossed gauge study, the expected mean squares and the variance-component estimates",
  },
  {
    key: "burdick2003review",
    cite: "Burdick, R. K., Borror, C. M. & Montgomery, D. C. (2003). A review of methods for measurement systems capability analysis. Journal of Quality Technology 35(4), 342-354.",
    doi: "10.1080/00224065.2003.11980232",
    used: "modified large-sample (MLS) intervals for repeatability, reproducibility, part-to-part and total gauge variance",
  },
  {
    key: "ting1990mls",
    cite: "Ting, N., Burdick, R. K., Graybill, F. A., Jeyaratnam, S. & Lu, T.-F. C. (1990). Confidence intervals on linear combinations of variance components that are unrestricted in sign. Journal of Statistical Computation and Simulation 35(3-4), 135-143.",
    doi: "10.1080/00949659008811240",
    used: "the general MLS bound for a sum of mean squares with positive and negative coefficients",
  },
  {
    key: "graybill1980mls",
    cite: "Graybill, F. A. & Wang, C.-M. (1980). Confidence intervals on nonnegative linear combinations of variances. Journal of the American Statistical Association 75(372), 869-873.",
    doi: "10.1080/01621459.1980.10477565",
    used: "the MLS bound when every coefficient is positive",
  },
  {
    key: "aiag2010msa",
    cite: "AIAG (2010). Measurement Systems Analysis Reference Manual, 4th edition. Automotive Industry Action Group, Southfield, Michigan.",
    doi: null,
    used: "the %study variation and %tolerance guidelines (under 10%, 10 to 30%, over 30%) and the number of distinct categories, 1.41 times part over gauge standard deviation, truncated",
  },
];

export const DEFAULTS = {
  design: "crossed", // "crossed" | "nested"
  part: "",
  operator: "",
  measurement: "",
  k: 6, // study-variation multiplier: 6 (99.73%) or 5.15 (99%)
  lsl: null,
  usl: null,
  processSd: null,
  interaction: "auto", // "auto" | "keep" | "pool"
  poolAlpha: 0.05,
  confidence: 0.95,
};

// A small made-up crossed study (5 parts, 2 operators, 2 trials, shaft
// diameters in mm) so `analyze(SAMPLE_STUDY)` runs as is; the page's real
// example is data/benchmark-timing.csv.
export const SAMPLE_STUDY = {
  text: "part,operator,measurement\n1,A,10.02\n1,A,10.03\n2,A,9.97\n2,A,9.96\n3,A,10.06\n3,A,10.05\n4,A,9.93\n4,A,9.95\n5,A,10.00\n5,A,10.01\n1,B,10.03\n1,B,10.04\n2,B,9.98\n2,B,9.99\n3,B,10.07\n3,B,10.08\n4,B,9.95\n4,B,9.94\n5,B,10.02\n5,B,10.01\n",
  lsl: 9.8,
  usl: 10.2,
};

// ---------------------------------------------------------------- parsing

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const lines = src.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) throw new Error("No data: paste a CSV with a header row.");
  const head = lines[0];
  const delim = head.includes("\t") ? "\t" : head.includes(";") && !head.includes(",") ? ";" : ",";
  const split = (line) => {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { out.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(head);
  const rows = lines.slice(1).map(split);
  return { header, rows, delim };
}

export function num(v, delim = ",") {
  if (v == null) return NaN;
  let s = String(v).trim();
  if (s === "") return NaN;
  if (delim === ";" && /^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN;
  return Number(s);
}

const PART_NAMES = ["part", "parts", "sample", "item", "unit", "specimen", "batch", "wafer"];
const OP_NAMES = ["operator", "operators", "appraiser", "inspector", "technician", "gauge", "gage", "rater", "harness"];
const Y_NAMES = ["measurement", "measure", "value", "response", "reading", "result", "y"];

function findCol(header, wanted, names, what) {
  const low = header.map((h) => h.toLowerCase());
  if (wanted) {
    const i = low.indexOf(String(wanted).toLowerCase());
    if (i < 0) throw new Error(`No column named "${wanted}" for the ${what}. Columns: ${header.join(", ")}.`);
    return i;
  }
  for (const n of names) {
    const i = low.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

// Long format: one row per measurement, with part, operator and value columns.
export function readStudy(text, { part = "", operator = "", measurement = "" } = {}) {
  const { header, rows, delim } = parseCsv(text);
  let ip = findCol(header, part, PART_NAMES, "part");
  let io = findCol(header, operator, OP_NAMES, "operator");
  let iy = findCol(header, measurement, Y_NAMES, "measurement");
  if (ip < 0 || io < 0) {
    if (header.length < 3) throw new Error("Need three columns: part, operator and measurement (one row per reading).");
    if (ip < 0) ip = [0, 1, 2].find((i) => i !== io && i !== iy);
    if (io < 0) io = [0, 1, 2].find((i) => i !== ip && i !== iy);
  }
  if (iy < 0) iy = [...header.keys()].find((i) => i !== ip && i !== io && rows.every((r) => Number.isFinite(num(r[i], delim))));
  if (iy == null || iy < 0) throw new Error("Could not find a numeric measurement column; name it with the measurement option.");
  if (new Set([ip, io, iy]).size < 3) throw new Error("Part, operator and measurement must be three different columns.");
  const obs = [];
  rows.forEach((r, k) => {
    const y = num(r[iy], delim);
    if (!Number.isFinite(y)) throw new Error(`Row ${k + 2}: "${r[iy] ?? ""}" in ${header[iy]} is not a number. A missing reading is an error, not a zero.`);
    const p = r[ip] ?? "";
    const o = r[io] ?? "";
    if (p === "" || o === "") throw new Error(`Row ${k + 2}: the part or operator is blank.`);
    obs.push({ part: p, operator: o, y });
  });
  return { obs, columns: { part: header[ip], operator: header[io], measurement: header[iy] } };
}

// ------------------------------------------------------ special functions

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized lower incomplete gamma P(a, x).
export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (!Number.isFinite(x)) return 1;
  const lead = a * Math.log(x) - x - lgamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 10000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return Math.min(1, sum * Math.exp(lead));
  }
  // Continued fraction for Q(a, x), modified Lentz.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.max(0, 1 - Math.exp(lead) * h);
}

function betaCf(a, b, x) {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 10000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a, b).
export function betaI(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lead = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lead) * betaCf(a, b, x)) / a;
  return 1 - (Math.exp(lead) * betaCf(b, a, 1 - x)) / b;
}

export const chi2Cdf = (x, df) => gammaP(df / 2, x / 2);
export const fCdf = (x, d1, d2) => (x <= 0 ? 0 : betaI(d1 / 2, d2 / 2, (d1 * x) / (d1 * x + d2)));
// Upper tail of F without the cancellation of 1 - cdf.
export const fSf = (x, d1, d2) => (x <= 0 ? 1 : betaI(d2 / 2, d1 / 2, d2 / (d2 + d1 * x)));

function invert(cdf, p, lo, hi) {
  while (cdf(hi) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (cdf(mid) < p) lo = mid; else hi = mid;
    if (hi - lo <= 1e-15 * Math.max(1, hi)) break;
  }
  return 0.5 * (lo + hi);
}

// Lower-p quantiles: chi2Quantile(0.975, 10) is about 20.48.
export const chi2Quantile = (p, df) => invert((x) => chi2Cdf(x, df), p, 0, Math.max(1, df * 2));
export const fQuantile = (p, d1, d2) => invert((x) => fCdf(x, d1, d2), p, 0, 4);

// ----------------------------------------------------------- MLS bounds

// Two-sided 100(1-alpha)% MLS interval for gamma = sum c_q E(MS_q), from
// Ting et al. (1990); with every c_q > 0 the cross terms vanish but the
// G* term, and it is the Graybill-Wang (1980) bound.
export function mlsInterval(terms, alpha = 0.05) {
  const t = terms.filter((x) => x.c !== 0);
  const est = t.reduce((s, x) => s + x.c * x.ms, 0);
  const a2 = alpha / 2;
  const G = (n) => 1 - n / chi2Quantile(1 - a2, n);
  const H = (n) => n / chi2Quantile(a2, n) - 1;
  const pos = t.filter((x) => x.c > 0);
  const neg = t.filter((x) => x.c < 0);
  let vl = 0;
  let vu = 0;
  for (const q of pos) {
    const s = (q.c * q.ms) ** 2;
    vl += G(q.df) ** 2 * s;
    vu += H(q.df) ** 2 * s;
  }
  for (const r of neg) {
    const s = (r.c * r.ms) ** 2;
    vl += H(r.df) ** 2 * s;
    vu += G(r.df) ** 2 * s;
  }
  for (const q of pos) {
    for (const r of neg) {
      const F1 = fQuantile(1 - a2, q.df, r.df);
      const F2 = fQuantile(a2, q.df, r.df);
      const Gqr = ((F1 - 1) ** 2 - G(q.df) ** 2 * F1 ** 2 - H(r.df) ** 2) / F1;
      const Hqr = ((1 - F2) ** 2 - H(q.df) ** 2 * F2 ** 2 - G(r.df) ** 2) / F2;
      const prod = Math.abs(q.c * q.ms * r.c * r.ms);
      vl += Gqr * prod;
      vu += Hqr * prod;
    }
  }
  if (pos.length > 1) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const q = pos[i];
        const u = pos[j];
        const n = q.df + u.df;
        const g = 1 - n / chi2Quantile(1 - a2, n);
        const Gs = (g ** 2 * n ** 2 / (q.df * u.df) - G(q.df) ** 2 * q.df / u.df - G(u.df) ** 2 * u.df / q.df) / (pos.length - 1);
        vl += Gs * q.c * q.ms * u.c * u.ms;
      }
    }
  }
  if (neg.length > 1) {
    for (let i = 0; i < neg.length; i++) {
      for (let j = i + 1; j < neg.length; j++) {
        const r = neg[i];
        const u = neg[j];
        const n = r.df + u.df;
        const h = n / chi2Quantile(a2, n) - 1;
        const Hs = (h ** 2 * n ** 2 / (r.df * u.df) - H(r.df) ** 2 * r.df / u.df - H(u.df) ** 2 * u.df / r.df) / (neg.length - 1);
        vu += Hs * r.c * r.ms * u.c * u.ms;
      }
    }
  }
  const lower = Math.max(0, est - Math.sqrt(Math.max(0, vl)));
  const upper = Math.max(0, est + Math.sqrt(Math.max(0, vu)));
  return { estimate: est, lower, upper };
}

// ------------------------------------------------------------ the study

function levels(values) {
  const seen = new Map();
  for (const v of values) if (!seen.has(v)) seen.set(v, seen.size);
  return [...seen.keys()];
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// Groups observations into cells and checks the design is balanced.
export function layout(obs, design = "crossed") {
  if (!Array.isArray(obs) || obs.length === 0) throw new Error("No measurements.");
  const ops = levels(obs.map((o) => String(o.operator)));
  const parts = levels(obs.map((o) => String(o.part)));
  const cells = new Map();
  for (const o of obs) {
    if (!Number.isFinite(o.y)) throw new Error(`Measurement ${o.y} for part ${o.part}, operator ${o.operator} is not a number.`);
    const key = `${o.operator}\u0000${o.part}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(o.y);
  }
  if (ops.length < 2) throw new Error("Need at least two operators (or appraisers, gauges, setups).");
  const sizes = new Set([...cells.values()].map((c) => c.length));
  if (sizes.size !== 1) {
    const counts = [...cells.entries()].map(([k, v]) => `${k.replace("\u0000", " × ")}: ${v.length}`).slice(0, 6).join("; ");
    throw new Error(`Unbalanced study: every operator must measure each part the same number of times (${counts}${cells.size > 6 ? "; ..." : ""}). The ANOVA method here needs a balanced study; drop or repeat readings to balance it.`);
  }
  const n = [...sizes][0];
  if (n < 2) throw new Error("Each operator must measure each part at least twice: repeatability comes from the repeats.");
  if (design === "crossed") {
    if (parts.length < 2) throw new Error("Need at least two parts.");
    if (cells.size !== ops.length * parts.length) {
      const missing = [];
      for (const o of ops) for (const p of parts) if (!cells.has(`${o}\u0000${p}`)) missing.push(`${o} × ${p}`);
      throw new Error(`Crossed study, but ${missing.length} operator × part cells have no readings (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}). If each operator measured different parts (destructive testing), choose the nested design.`);
    }
    const y = ops.map((o) => parts.map((p) => cells.get(`${o}\u0000${p}`)));
    return { design, ops, parts, n, y };
  }
  // Nested: each part belongs to one operator; the same number of parts each.
  const owner = new Map();
  for (const o of obs) {
    const p = String(o.part);
    const prev = owner.get(p);
    if (prev != null && prev !== String(o.operator)) throw new Error(`Nested study, but part ${p} was measured by both ${prev} and ${o.operator}. In a nested study each part is measured by one operator; if every operator measured every part, choose the crossed design.`);
    owner.set(p, String(o.operator));
  }
  const byOp = ops.map((op) => parts.filter((p) => owner.get(p) === op));
  const per = new Set(byOp.map((b) => b.length));
  if (per.size !== 1) throw new Error(`Nested study needs the same number of parts for every operator (${ops.map((o, i) => `${o}: ${byOp[i].length}`).join(", ")}).`);
  const pPer = byOp[0].length;
  if (pPer < 2) throw new Error("Nested study needs at least two parts per operator.");
  const y = ops.map((o, i) => byOp[i].map((p) => cells.get(`${o}\u0000${p}`)));
  return { design, ops, parts, partsByOp: byOp, n, p: pPer, y };
}

function crossedAnova(L) {
  const { y, n } = L;
  const o = y.length;
  const p = y[0].length;
  const all = y.flat(2);
  const g = mean(all);
  const cell = y.map((r) => r.map((c) => mean(c)));
  const opMean = cell.map((r) => mean(r));
  const partMean = cell[0].map((_, j) => mean(cell.map((r) => r[j])));
  let ssO = 0; let ssP = 0; let ssPO = 0; let ssE = 0;
  for (let i = 0; i < o; i++) ssO += p * n * (opMean[i] - g) ** 2;
  for (let j = 0; j < p; j++) ssP += o * n * (partMean[j] - g) ** 2;
  for (let i = 0; i < o; i++) {
    for (let j = 0; j < p; j++) {
      ssPO += n * (cell[i][j] - opMean[i] - partMean[j] + g) ** 2;
      for (const v of y[i][j]) ssE += (v - cell[i][j]) ** 2;
    }
  }
  const dfP = p - 1; const dfO = o - 1; const dfPO = dfP * dfO; const dfE = o * p * (n - 1);
  return { o, p, n, g, cell, opMean, partMean, ss: { part: ssP, operator: ssO, interaction: ssPO, error: ssE }, df: { part: dfP, operator: dfO, interaction: dfPO, error: dfE } };
}

function row(source, ss, df, msDenom, dfDenom) {
  const ms = ss / df;
  const out = { source, df, ss, ms, f: null, p: null };
  if (msDenom != null) {
    out.f = msDenom > 0 ? ms / msDenom : ms > 0 ? Infinity : null;
    out.p = out.f == null ? null : Number.isFinite(out.f) ? fSf(out.f, df, dfDenom) : 0;
  }
  return out;
}

function components(defs, alpha) {
  // defs: [{key, label, terms}] where terms are {c, ms, df}.
  return defs.map((d) => {
    const est = d.terms.reduce((s, t) => s + t.c * t.ms, 0);
    const ci = mlsInterval(d.terms, alpha);
    return { key: d.key, label: d.label, variance: Math.max(0, est), raw: est, negative: est < 0, ci: { lower: ci.lower, upper: ci.upper } };
  });
}

// Accepts {obs} or {text} plus options; returns the full study.
export function analyze(input = {}) {
  if (typeof input === "string") input = { text: input };
  const opt = { ...DEFAULTS, ...input };
  let columns = null;
  let obs = opt.obs;
  if (!obs) {
    const read = readStudy(opt.text ?? "", opt);
    obs = read.obs;
    columns = read.columns;
  }
  const design = opt.design === "nested" ? "nested" : "crossed";
  const k = Number(opt.k);
  if (!(k > 0)) throw new Error("The study-variation multiplier must be positive (6 or 5.15).");
  const confidence = Number(opt.confidence);
  if (!(confidence > 0 && confidence < 1)) throw new Error("Confidence must be between 0 and 1, such as 0.95.");
  const alpha = 1 - confidence;
  const L = layout(obs, design);
  const warnings = [];
  let anova;
  let defs;
  let pooled = false;
  let interactionP = null;
  let summary;

  if (design === "crossed") {
    const A = crossedAnova(L);
    const { o, p, n } = A;
    const msE = A.ss.error / A.df.error;
    const msPO = A.ss.interaction / A.df.interaction;
    interactionP = msE > 0 ? fSf(msPO / msE, A.df.interaction, A.df.error) : msPO > 0 ? 0 : 1;
    const mode = opt.interaction;
    pooled = mode === "pool" || (mode === "auto" && interactionP > Number(opt.poolAlpha));
    const full = [
      row("Part", A.ss.part, A.df.part, msPO, A.df.interaction),
      row("Operator", A.ss.operator, A.df.operator, msPO, A.df.interaction),
      row("Part × operator", A.ss.interaction, A.df.interaction, msE, A.df.error),
      row("Repeatability", A.ss.error, A.df.error),
      { source: "Total", df: A.df.part + A.df.operator + A.df.interaction + A.df.error, ss: A.ss.part + A.ss.operator + A.ss.interaction + A.ss.error, ms: null, f: null, p: null },
    ];
    const mP = A.ss.part / A.df.part;
    const mO = A.ss.operator / A.df.operator;
    if (!pooled) {
      anova = { table: full, pooledTable: null };
      const PT = { c: 1 / (o * n), ms: mP, df: A.df.part };
      const OT = { c: 1 / (p * n), ms: mO, df: A.df.operator };
      defs = [
        { key: "repeatability", label: "Repeatability (equipment)", terms: [{ c: 1, ms: msE, df: A.df.error }] },
        { key: "reproducibility", label: "Reproducibility (appraiser)", terms: [OT, { c: (p - 1) / (p * n), ms: msPO, df: A.df.interaction }, { c: -1 / n, ms: msE, df: A.df.error }] },
        { key: "operator", label: "Operator", terms: [OT, { c: -1 / (p * n), ms: msPO, df: A.df.interaction }] },
        { key: "interaction", label: "Part × operator", terms: [{ c: 1 / n, ms: msPO, df: A.df.interaction }, { c: -1 / n, ms: msE, df: A.df.error }] },
        { key: "grr", label: "Total gauge R&R", terms: [OT, { c: (p - 1) / (p * n), ms: msPO, df: A.df.interaction }, { c: (p * (n - 1)) / (p * n), ms: msE, df: A.df.error }] },
        { key: "part", label: "Part-to-part", terms: [PT, { c: -1 / (o * n), ms: msPO, df: A.df.interaction }] },
      ];
    } else {
      const dfR = A.df.interaction + A.df.error;
      const msR = (A.ss.interaction + A.ss.error) / dfR;
      const red = [
        row("Part", A.ss.part, A.df.part, msR, dfR),
        row("Operator", A.ss.operator, A.df.operator, msR, dfR),
        row("Repeatability", A.ss.interaction + A.ss.error, dfR),
        full[4],
      ];
      anova = { table: full, pooledTable: red };
      const OT = { c: 1 / (p * n), ms: mO, df: A.df.operator };
      defs = [
        { key: "repeatability", label: "Repeatability (equipment)", terms: [{ c: 1, ms: msR, df: dfR }] },
        { key: "reproducibility", label: "Reproducibility (appraiser)", terms: [OT, { c: -1 / (p * n), ms: msR, df: dfR }] },
        { key: "operator", label: "Operator", terms: [OT, { c: -1 / (p * n), ms: msR, df: dfR }] },
        { key: "grr", label: "Total gauge R&R", terms: [OT, { c: 1 - 1 / (p * n), ms: msR, df: dfR }] },
        { key: "part", label: "Part-to-part", terms: [{ c: 1 / (o * n), ms: mP, df: A.df.part }, { c: -1 / (o * n), ms: msR, df: dfR }] },
      ];
    }
    summary = {
      grandMean: A.g,
      operators: L.ops.map((name, i) => ({ name, mean: A.opMean[i], meanRange: mean(L.y[i].map((c) => Math.max(...c) - Math.min(...c))) })),
      parts: L.parts.map((name, j) => ({ name, mean: A.partMean[j] })),
      cells: L.ops.map((op, i) => L.parts.map((pt, j) => ({ operator: op, part: pt, mean: A.cell[i][j], range: Math.max(...L.y[i][j]) - Math.min(...L.y[i][j]) }))).flat(),
    };
    if (p < 10) warnings.push(`${p} parts. A typical gauge study uses 10 parts, 2 or 3 operators and 2 or 3 trials; with few parts the part-to-part variance (and so %study variation and ndc) is poorly estimated, as the interval shows.`);
    if (o < 3) warnings.push(`${o} operators: the operator variance rests on ${o - 1} degree${o === 2 ? "" : "s"} of freedom, so its interval is wide.`);
  } else {
    const { y, n, p } = L;
    const o = y.length;
    const all = y.flat(2);
    const g = mean(all);
    const cell = y.map((r) => r.map((c) => mean(c)));
    const opMean = cell.map((r) => mean(r));
    let ssO = 0; let ssPO = 0; let ssE = 0;
    for (let i = 0; i < o; i++) {
      ssO += p * n * (opMean[i] - g) ** 2;
      for (let j = 0; j < p; j++) {
        ssPO += n * (cell[i][j] - opMean[i]) ** 2;
        for (const v of y[i][j]) ssE += (v - cell[i][j]) ** 2;
      }
    }
    const dfO = o - 1; const dfPO = o * (p - 1); const dfE = o * p * (n - 1);
    const msO = ssO / dfO; const msPO = ssPO / dfPO; const msE = ssE / dfE;
    anova = {
      table: [
        row("Operator", ssO, dfO, msPO, dfPO),
        row("Part (operator)", ssPO, dfPO, msE, dfE),
        row("Repeatability", ssE, dfE),
        { source: "Total", df: dfO + dfPO + dfE, ss: ssO + ssPO + ssE, ms: null, f: null, p: null },
      ],
      pooledTable: null,
    };
    const OT = { c: 1 / (p * n), ms: msO, df: dfO };
    defs = [
      { key: "repeatability", label: "Repeatability (equipment)", terms: [{ c: 1, ms: msE, df: dfE }] },
      { key: "reproducibility", label: "Reproducibility (operator)", terms: [OT, { c: -1 / (p * n), ms: msPO, df: dfPO }] },
      { key: "grr", label: "Total gauge R&R", terms: [OT, { c: -1 / (p * n), ms: msPO, df: dfPO }, { c: 1, ms: msE, df: dfE }] },
      { key: "part", label: "Part-to-part", terms: [{ c: 1 / n, ms: msPO, df: dfPO }, { c: -1 / n, ms: msE, df: dfE }] },
    ];
    summary = {
      grandMean: g,
      operators: L.ops.map((name, i) => ({ name, mean: opMean[i], meanRange: mean(y[i].map((c) => Math.max(...c) - Math.min(...c))) })),
      parts: L.ops.flatMap((op, i) => L.partsByOp[i].map((name, j) => ({ name, operator: op, mean: cell[i][j] }))),
      cells: L.ops.flatMap((op, i) => L.partsByOp[i].map((pt, j) => ({ operator: op, part: pt, mean: cell[i][j], range: Math.max(...y[i][j]) - Math.min(...y[i][j]) }))),
    };
    warnings.push("Nested design: part-to-part variation is estimated within operators, and any real difference between the parts each operator received shows up as reproducibility. Give every operator parts from the same homogeneous batch.");
  }

  const comps = components(defs, alpha);
  const get = (key) => comps.find((c) => c.key === key);
  // Report the sum of the truncated pieces, as gauge software conventionally does:
  // a negative interaction estimate counts as zero rather than lowering GRR.
  const rep = get("repeatability");
  const repro = get("reproducibility");
  const grr = get("grr");
  const part = get("part");
  const op = get("operator");
  const inter = get("interaction");
  if (design === "crossed" && !pooled) {
    repro.variance = op.variance + inter.variance;
  }
  grr.variance = rep.variance + repro.variance;
  // Total gauge variance is never below repeatability, so its lower bound need
  // not fall below repeatability's (this can only raise coverage: a miss needs
  // repeatability's own bound to miss). Keep every point inside its interval.
  grr.ci.lower = Math.max(grr.ci.lower, rep.ci.lower);
  for (const c of comps) {
    c.ci.lower = Math.min(c.ci.lower, c.variance);
    c.ci.upper = Math.max(c.ci.upper, c.variance);
  }
  const sums = design === "crossed" && !pooled ? ["grr", "reproducibility"] : ["grr"];
  for (const c of comps) if (c.negative && !sums.includes(c.key)) warnings.push(`The ${c.label.toLowerCase()} variance estimate came out negative (${fmt(c.raw)}) and is set to zero: the data show no ${c.label.toLowerCase()} variation beyond what repeatability explains.`);
  const totalVar = grr.variance + part.variance;
  const lsl = opt.lsl == null || opt.lsl === "" ? null : Number(opt.lsl);
  const usl = opt.usl == null || opt.usl === "" ? null : Number(opt.usl);
  let tolerance = null;
  if (lsl != null || usl != null) {
    if (lsl == null || usl == null || !Number.isFinite(lsl) || !Number.isFinite(usl)) throw new Error("Give both specification limits (LSL and USL) for %tolerance, or neither.");
    if (!(usl > lsl)) throw new Error("The upper specification limit must be above the lower one.");
    tolerance = usl - lsl;
  }
  const processSd = opt.processSd == null || opt.processSd === "" ? null : Number(opt.processSd);
  if (processSd != null && !(processSd > 0)) throw new Error("The historical process standard deviation must be positive.");

  const order = design === "crossed" && !pooled ? ["grr", "repeatability", "reproducibility", "operator", "interaction", "part"] : ["grr", "repeatability", "reproducibility", "part"];
  const table = order.map((key) => {
    const c = get(key);
    const sd = Math.sqrt(c.variance);
    return {
      key,
      source: c.label,
      variance: c.variance,
      sd,
      studyVar: k * sd,
      pctContribution: totalVar > 0 ? (100 * c.variance) / totalVar : null,
      pctStudyVar: totalVar > 0 ? (100 * sd) / Math.sqrt(totalVar) : null,
      pctTolerance: tolerance ? (100 * k * sd) / tolerance : null,
      pctProcess: processSd ? (100 * sd) / processSd : null,
      sdLower: Math.sqrt(c.ci.lower),
      sdUpper: Math.sqrt(c.ci.upper),
      pctToleranceLower: tolerance ? (100 * k * Math.sqrt(c.ci.lower)) / tolerance : null,
      pctToleranceUpper: tolerance ? (100 * k * Math.sqrt(c.ci.upper)) / tolerance : null,
    };
  });
  table.push({ key: "total", source: "Total variation", variance: totalVar, sd: Math.sqrt(totalVar), studyVar: k * Math.sqrt(totalVar), pctContribution: totalVar > 0 ? 100 : null, pctStudyVar: totalVar > 0 ? 100 : null, pctTolerance: tolerance ? (100 * k * Math.sqrt(totalVar)) / tolerance : null, pctProcess: processSd ? (100 * Math.sqrt(totalVar)) / processSd : null, sdLower: null, sdUpper: null, pctToleranceLower: null, pctToleranceUpper: null });

  const sdGrr = Math.sqrt(grr.variance);
  const sdPart = Math.sqrt(part.variance);
  const ndc = sdGrr > 0 ? Math.max(0, Math.floor(1.41 * (sdPart / sdGrr) + 1e-9)) : null;
  const grrRow = table[0];
  const verdict = judge(grrRow, ndc, tolerance != null);
  if (design === "crossed") {
    const pInter = interactionP;
    if (opt.interaction === "auto") warnings.push(pooled ? `Part × operator interaction p = ${fmtP(pInter)} > ${opt.poolAlpha}: it was pooled into repeatability (the ANOVA without it is shown). Choose "keep" to report it.` : `Part × operator interaction p = ${fmtP(pInter)} ≤ ${opt.poolAlpha}: operators disagree by different amounts on different parts. Look at the interaction plot.`);
  }
  return {
    design,
    pooled,
    interactionP,
    columns,
    counts: { operators: L.ops.length, parts: L.parts.length, replicates: L.n, readings: obs.length },
    anova,
    components: table,
    ndc,
    k,
    confidence,
    tolerance,
    processSd,
    verdict,
    summary,
    warnings,
  };
}

function judge(grrRow, ndc, byTolerance) {
  const pct = byTolerance ? grrRow.pctTolerance : grrRow.pctStudyVar;
  const basis = byTolerance ? "%tolerance" : "%study variation";
  if (pct == null) return { level: "unknown", text: "No variation at all: every reading is identical, so nothing can be judged." };
  let level;
  let text;
  if (pct < 10) { level = "acceptable"; text = `Gauge R&R is ${pct.toFixed(1)}% of ${basis.slice(1)}: under 10%, generally acceptable.`; }
  else if (pct <= 30) { level = "marginal"; text = `Gauge R&R is ${pct.toFixed(1)}% of ${basis.slice(1)}: between 10% and 30%, may be acceptable depending on the application, the cost of the gauge and the cost of a wrong call.`; }
  else { level = "unacceptable"; text = `Gauge R&R is ${pct.toFixed(1)}% of ${basis.slice(1)}: over 30%, the measurement system needs improvement.`; }
  if (ndc != null) text += ndc >= 5 ? ` It separates ${ndc} distinct categories of parts (5 or more is the usual bar).` : ` It separates only ${ndc} distinct categor${ndc === 1 ? "y" : "ies"} of parts; 5 or more is the usual bar.`;
  return { level, basis, pct, text };
}

function fmt(x) {
  return Math.abs(x) >= 1e-3 && Math.abs(x) < 1e6 ? x.toPrecision(4) : x.toExponential(3);
}
function fmtP(p) {
  return p < 0.0001 ? "< 0.0001" : p.toFixed(4);
}

// --------------------------------------------------------------- report

export function report(r) {
  const lines = [];
  const f = (x, d = 4) => (x == null ? "" : Number.isFinite(x) ? (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-4 && x !== 0) ? x.toExponential(d - 1) : x.toFixed(d)) : "inf");
  lines.push(`Gage R&R study, ANOVA method (${r.design}${r.pooled ? ", interaction pooled" : ""})`);
  lines.push(`${r.counts.parts} parts, ${r.counts.operators} operators, ${r.counts.replicates} replicates, ${r.counts.readings} readings`);
  lines.push("");
  lines.push("ANOVA");
  lines.push("source,df,ss,ms,f,p");
  for (const t of r.anova.pooledTable ?? r.anova.table) lines.push([t.source, t.df, f(t.ss, 6), f(t.ms, 6), f(t.f, 3), t.p == null ? "" : f(t.p, 4)].join(","));
  lines.push("");
  lines.push(`Variance components (study variation = ${r.k} x SD, ${Math.round(r.confidence * 100)}% MLS intervals for the SD)`);
  lines.push("source,variance,sd,sd_lower,sd_upper,study_var,pct_contribution,pct_study_var" + (r.tolerance ? ",pct_tolerance" : "") + (r.processSd ? ",pct_process" : ""));
  for (const c of r.components) lines.push([c.source, f(c.variance, 6), f(c.sd, 6), f(c.sdLower, 6), f(c.sdUpper, 6), f(c.studyVar, 6), f(c.pctContribution, 2), f(c.pctStudyVar, 2)].concat(r.tolerance ? [f(c.pctTolerance, 2)] : []).concat(r.processSd ? [f(c.pctProcess, 2)] : []).join(","));
  lines.push("");
  lines.push(`Number of distinct categories: ${r.ndc ?? "n/a"}`);
  lines.push(r.verdict.text);
  for (const w of r.warnings) lines.push(`Note: ${w}`);
  return lines.join("\n");
}
