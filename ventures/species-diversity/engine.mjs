// Species diversity: how many species are there, counting the ones you have
// not found yet, and is this site really richer than that one?
//
// Abundance data (individuals counted per species) in, Hill numbers out:
// species richness (q = 0), the exponential of Shannon entropy (q = 1) and
// inverse Simpson (q = 2), each as observed, as estimated for the whole
// assemblage (Chao1 with its log-normal interval, ACE, the Chao-Wang-Jost
// entropy estimator, the unbiased Simpson estimator), and as a curve over
// sample size and over sample coverage, interpolated (rarefaction) and
// extrapolated, after Chao et al. (2014) and Chao & Jost (2012). Several
// assemblages are compared at a common sample coverage and a common sample
// size, with bootstrap intervals.
//
// Written from the papers in PAPERS. No third-party code was ported. Where a
// formula follows the iNEXT R package (Hsieh, Ma & Chao 2016; GPL-3), it was
// re-derived and written here from its published mathematics, and the
// comment says so. Plain ES module, no imports: the page, the CLI and
// platform/agents/tools.mjs all load this same file.

export const PAPERS = [
  {
    key: "hill1973diversity",
    cite: "Hill, M. O. (1973). Diversity and evenness: a unifying notation and its consequences. Ecology 54(2), 427-432.",
    doi: "10.2307/1934352",
    used: "Hill numbers qD, the effective number of species of order q: richness (q = 0), exp(Shannon) (q = 1), inverse Simpson (q = 2)",
  },
  {
    key: "chao2014rarefaction",
    cite: "Chao, A., Gotelli, N. J., Hsieh, T. C., Sander, E. L., Ma, K. H., Colwell, R. K. & Ellison, A. M. (2014). Rarefaction and extrapolation with Hill numbers: a framework for sampling and estimation in species diversity studies. Ecological Monographs 84(1), 45-67.",
    doi: "10.1890/13-0133.1",
    used: "interpolated (rarefied) Hill numbers of order 0, 1 and 2 at any smaller sample size; the extrapolation of richness and of q = 2 to larger sizes; the bootstrap from an estimated assemblage that includes undetected species",
  },
  {
    key: "chao2012coverage",
    cite: "Chao, A. & Jost, L. (2012). Coverage-based rarefaction and extrapolation: standardizing samples by completeness rather than size. Ecology 93(12), 2533-2547.",
    doi: "10.1890/11-1952.1",
    used: "sample coverage (the share of the assemblage's individuals that belong to species already found) as a function of sample size, its extrapolation, and comparing assemblages at equal coverage",
  },
  {
    key: "chao1984nonparametric",
    cite: "Chao, A. (1984). Nonparametric estimation of the number of classes in a population. Scandinavian Journal of Statistics 11(4), 265-270.",
    doi: null,
    used: "the Chao1 lower bound on richness from singletons and doubletons, S_obs + f1^2/(2 f2)",
  },
  {
    key: "chao1987unequal",
    cite: "Chao, A. (1987). Estimating the population size for capture-recapture data with unequal catchability. Biometrics 43(4), 783-791.",
    doi: "10.2307/2531532",
    used: "the variance of Chao1 and the log-transformed interval for the number of undetected species",
  },
  {
    key: "chao1992ace",
    cite: "Chao, A. & Lee, S.-M. (1992). Estimating the number of classes via sample coverage. Journal of the American Statistical Association 87(417), 210-217.",
    doi: "10.1080/01621459.1992.10475194",
    used: "ACE, the abundance-based coverage estimator of richness, with rare species those seen 10 or fewer times",
  },
  {
    key: "chao2013entropy",
    cite: "Chao, A., Wang, Y. T. & Jost, L. (2013). Entropy and the species accumulation curve: a novel entropy estimator via discovery rates of new species. Methods in Ecology and Evolution 4(11), 1091-1100.",
    doi: "10.1111/2041-210X.12108",
    used: "the nearly unbiased Shannon entropy estimator, whose exponential is the estimated q = 1 diversity",
  },
  {
    key: "good1953population",
    cite: "Good, I. J. (1953). The population frequencies of species and the estimation of population parameters. Biometrika 40(3-4), 237-264.",
    doi: "10.1093/biomet/40.3-4.237",
    used: "sample coverage and its estimate from singletons (Turing's 1 - f1/n), which Chao & Jost refine",
  },
  {
    key: "hurlbert1971nonconcept",
    cite: "Hurlbert, S. H. (1971). The nonconcept of species diversity: a critique and alternative parameters. Ecology 52(4), 577-586.",
    doi: "10.2307/1934145",
    used: "expected species in a random subsample of m individuals (classical rarefaction), the q = 0 interpolation",
  },
  {
    key: "hsieh2016inext",
    cite: "Hsieh, T. C., Ma, K. H. & Chao, A. (2016). iNEXT: an R package for rarefaction and extrapolation of species diversity (Hill numbers). Methods in Ecology and Evolution 7(12), 1451-1456.",
    doi: "10.1111/2041-210X.12613",
    used: "conventions followed so results line up with the reference software: the q = 1 extrapolation rule of iNEXT 3.0.2, the default common coverage and size for comparisons (the lowest among assemblages at twice their sample size), and the Chao1 cases when f2 = 0 or f1 = 0",
  },
];

export const DEFAULTS = {
  confidence: 0.95,
  species: "", // column holding species names (default: a column named species/taxon/..., else the first text column)
  count: "", // column holding counts (default: a column named count/abundance/...; none: each row is one individual)
  group: "", // column that splits rows into assemblages (sites, treatments, years)
  endpoint: null, // largest sample size on the curves (default: twice each assemblage's size)
  knots: 40, // points per curve
  bootstrap: 100, // bootstrap replicates for the intervals (0 turns them off)
  seed: 1, // seed for the bootstrap, so a result can be reproduced exactly
  rareThreshold: 10, // ACE: species seen this many times or fewer are "rare"
};

// A small made-up assemblage so `analyze(SAMPLE)` runs as is; the page's real
// example is data/portal-rodents.csv.
export const SAMPLE = { counts: [52, 30, 21, 12, 9, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1] };

export const ORDERS = [0, 1, 2];
export const ORDER_NAMES = { 0: "species richness", 1: "Shannon diversity (exp of entropy)", 2: "Simpson diversity (inverse Simpson)" };

// ---------------------------------------------------------------- parsing

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r\n|\n|\r/).find((l) => l.trim() !== "");
  if (firstLine == null) throw new Error("No data: paste a CSV with a header row.");
  const delim = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const records = [];
  let row = [];
  let cur = "";
  let q = false;
  const endField = () => { row.push(cur.trim()); cur = ""; };
  const endRow = () => { endField(); if (row.some((c) => c !== "")) records.push(row); row = []; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) endField();
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; endRow(); }
    else cur += c;
  }
  if (q) throw new Error("A quoted field is never closed: check the quotes in the data.");
  endRow();
  if (!records.length) throw new Error("No data: paste a CSV with a header row.");
  return { header: records[0], rows: records.slice(1), delim };
}

const SPECIES_NAMES = ["species", "taxon", "taxa", "scientific name", "scientificname", "scientific_name", "species name", "name", "otu", "code", "speciescode", "category", "class", "type"];
const COUNT_NAMES = ["count", "counts", "abundance", "individuals", "n", "number", "total", "freq", "frequency", "individualcount", "individual_count", "quantity"];

const isCount = (v) => /^\d+(\.0+)?$/.test(v);

function colIndex(header, name, what) {
  const low = header.map((h) => h.toLowerCase());
  const i = low.indexOf(String(name).trim().toLowerCase());
  if (i < 0) throw new Error(`No column named "${name}" for the ${what}. Columns: ${header.join(", ")}.`);
  return i;
}

// Reads abundance data from CSV text. Three layouts:
//   long:  species, count[, group]   (one row per species, or per species and site)
//   raw:   species[, group]          (one row per individual seen; no count column)
//   wide:  species, siteA, siteB ... (one row per species, one count column per assemblage)
// Rows naming the same species in the same assemblage are added together.
// Returns [{ name, species: [...], counts: [...] }] with zero counts dropped.
export function readAbundance(text, opts = {}) {
  const { header, rows } = parseCsv(text);
  const low = header.map((h) => h.toLowerCase());
  if (!rows.length) throw new Error("The data has a header row but no data rows.");
  const numericCol = header.map((_, j) => rows.every((r) => (r[j] ?? "") === "" || isCount(r[j])) && rows.some((r) => (r[j] ?? "") !== ""));
  const groupIdx = opts.group ? colIndex(header, opts.group, "group") : -1;
  let speciesIdx;
  if (opts.species) speciesIdx = colIndex(header, opts.species, "species");
  else {
    speciesIdx = low.findIndex((h, j) => SPECIES_NAMES.includes(h) && j !== groupIdx);
    if (speciesIdx < 0) speciesIdx = header.findIndex((_, j) => !numericCol[j] && j !== groupIdx);
    if (speciesIdx < 0) throw new Error("No species column: give one column of species names (or codes) and one of counts.");
  }
  let countIdx = -1;
  if (opts.count) countIdx = colIndex(header, opts.count, "counts");
  else {
    // By name even when a cell is not a whole number, so a typo is reported rather than
    // the column silently dropped and every row read as one individual.
    countIdx = low.findIndex((h, j) => COUNT_NAMES.includes(h) && j !== speciesIdx && j !== groupIdx);
  }
  const others = header.map((_, j) => j).filter((j) => j !== speciesIdx && j !== groupIdx);
  const numericOthers = others.filter((j) => numericCol[j]);
  const assemblages = new Map();
  const add = (name, sp, c) => {
    if (!assemblages.has(name)) assemblages.set(name, new Map());
    const m = assemblages.get(name);
    m.set(sp, (m.get(sp) || 0) + c);
  };
  const parseC = (v, line, col) => {
    if (!isCount(v)) throw new Error(`Row ${line}: "${v}" in column ${col} is not a whole-number count of individuals.`);
    return Number(v);
  };
  let layout;
  if (countIdx < 0 && groupIdx < 0 && numericOthers.length >= 2) {
    // Wide: every numeric column is an assemblage.
    layout = "wide";
    for (const j of numericOthers) assemblages.set(header[j], new Map());
    rows.forEach((r, i) => {
      const sp = r[speciesIdx] ?? "";
      if (sp === "") return;
      for (const j of numericOthers) {
        const v = r[j] ?? "";
        if (v === "") continue;
        add(header[j], sp, parseC(v, i + 2, header[j]));
      }
    });
  } else {
    if (countIdx < 0 && numericOthers.length === 1) countIdx = numericOthers[0];
    layout = countIdx < 0 ? "raw" : "long";
    rows.forEach((r, i) => {
      const sp = r[speciesIdx] ?? "";
      if (sp === "") return;
      const g = groupIdx < 0 ? "" : r[groupIdx] ?? "";
      if (countIdx < 0) add(g, sp, 1);
      else {
        const v = r[countIdx] ?? "";
        if (v === "") return;
        add(g, sp, parseC(v, i + 2, header[countIdx]));
      }
    });
  }
  const out = [];
  for (const [name, m] of assemblages) {
    const pairs = [...m].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    out.push({ name, species: pairs.map((p) => p[0]), counts: pairs.map((p) => p[1]) });
  }
  if (groupIdx >= 0) out.sort((a, b) => String(a.name).localeCompare(String(b.name), "en", { numeric: true }));
  return { layout, assemblages: out, columns: { species: header[speciesIdx], count: countIdx < 0 ? null : header[countIdx], group: groupIdx < 0 ? null : header[groupIdx] } };
}

// ---------------------------------------------------------------- special functions

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// log of n choose k for whole numbers, exact sums for small arguments.
const LOGFACT = [0];
function logFact(n) {
  if (n < 0) return NaN;
  if (n < 4096) {
    while (LOGFACT.length <= n) LOGFACT.push(LOGFACT[LOGFACT.length - 1] + Math.log(LOGFACT.length));
    return LOGFACT[n];
  }
  return lgamma(n + 1);
}
export const lchoose = (n, k) => (k < 0 || k > n ? -Infinity : logFact(n) - logFact(k) - logFact(n - k));

// Upper normal tail by the continued fraction (accurate to ~1e-15 for x >= 0).
function normalUpper(x) {
  if (x < 0) return 1 - normalUpper(-x);
  if (x < 3) {
    // Series for the lower part: Phi(x) - 1/2 = phi(x) * sum x^(2k+1)/(1*3*...*(2k+1)).
    let term = x, sum = x;
    for (let k = 1; k < 200; k++) { term *= (x * x) / (2 * k + 1); sum += term; if (term < 1e-17 * sum) break; }
    return 0.5 - sum * Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  }
  let f = 0;
  for (let k = 60; k >= 1; k--) f = k / (x + f);
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) / (x + f);
}
// Two-sided normal critical value, zCrit(0.95) = 1.959964..., by bisection on the upper tail.
export function zCrit(confidence) {
  const p = (1 - confidence) / 2;
  let lo = 0, hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (normalUpper(mid) > p) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------- the estimators

// Frequency counts: f[k] = number of species seen exactly k times.
export function frequencies(counts) {
  const f = new Map();
  for (const x of counts) if (x > 0) f.set(x, (f.get(x) || 0) + 1);
  return f;
}

// Undetected species, Chao1's f0-hat (Chao 1984, with the (n-1)/n factor of Chao et al. 2014).
function f0Hat(n, f1, f2) {
  return f2 > 0 ? ((n - 1) / n) * (f1 * f1) / (2 * f2) : ((n - 1) / n) * (f1 * (f1 - 1)) / 2;
}
// iNEXT's A: the factor by which each extra individual shrinks the singletons' share.
// 1 - A is the chance the next individual is a new species, per singleton share (Chao & Jost 2012).
function aHat(n, f1, f2) {
  const f0 = f0Hat(n, f1, f2);
  return f1 > 0 ? (n * f0) / (n * f0 + f1) : 1;
}

export function basics(countsIn) {
  const counts = countsIn.filter((x) => x > 0);
  const n = counts.reduce((a, b) => a + b, 0);
  const S = counts.length;
  const f = frequencies(counts);
  const f1 = f.get(1) || 0;
  const f2 = f.get(2) || 0;
  const fk = Array.from({ length: 10 }, (_, k) => f.get(k + 1) || 0);
  return { n, S, f1, f2, fk, counts, coverage: coverageAt(counts, n), turing: n > 0 ? 1 - f1 / n : NaN };
}

// Chao1 with the variance and log-transformed interval of Chao (1987); the
// three cases (f2 > 0; f1 > 1 and f2 = 0; otherwise) are those used by iNEXT.
export function chao1(countsIn, confidence = 0.95) {
  const counts = countsIn.filter((x) => x > 0);
  const n = counts.reduce((a, b) => a + b, 0);
  const D = counts.length;
  const f = frequencies(counts);
  const f1 = f.get(1) || 0;
  const f2 = f.get(2) || 0;
  const z = zCrit(confidence);
  const k = (n - 1) / n;
  let est, v, lower, upper;
  if (f1 > 0 && f2 > 0) {
    est = D + (k * f1 * f1) / (2 * f2);
    const r = f1 / f2;
    v = f2 * ((k * r * r) / 2 + k * k * r ** 3 + (k * k * r ** 4) / 4);
  } else if (f1 > 1 && f2 === 0) {
    est = D + (k * f1 * (f1 - 1)) / 2;
    v = (k * f1 * (f1 - 1)) / 2 + (k * k * f1 * (2 * f1 - 1) ** 2) / 4 - (k * k * f1 ** 4) / 4 / est;
  } else {
    // No singletons (or one singleton and no doubletons): nothing points to undetected species.
    est = D;
    let varObs = 0, sumIE = 0, P = 0;
    for (const [i, fi] of f) { varObs += fi * (Math.exp(-i) - Math.exp(-2 * i)); sumIE += i * Math.exp(-i) * fi; P += (fi * Math.exp(-i)) / D; }
    varObs -= (sumIE * sumIE) / n;
    v = varObs;
    lower = Math.max(D, D / (1 - P) - (z * Math.sqrt(Math.max(0, varObs))) / (1 - P));
    upper = D / (1 - P) + (z * Math.sqrt(Math.max(0, varObs))) / (1 - P);
    return { estimate: est, se: Math.sqrt(Math.max(0, v)), lower, upper, f1, f2, observed: D, method: f1 === 0 ? "no singletons" : "one singleton, no doubletons" };
  }
  const t = est - D;
  const K = Math.exp(z * Math.sqrt(Math.log(1 + v / (t * t))));
  lower = D + t / K;
  upper = D + t * K;
  return { estimate: est, se: Math.sqrt(Math.max(0, v)), lower, upper, f1, f2, observed: D, method: f2 > 0 ? "singletons and doubletons" : "bias-corrected (no doubletons)" };
}

// ACE (Chao & Lee 1992). Null when every rare species is a singleton.
export function ace(countsIn, rareThreshold = 10) {
  const counts = countsIn.filter((x) => x > 0);
  const rare = counts.filter((x) => x <= rareThreshold);
  const sAbund = counts.length - rare.length;
  const sRare = rare.length;
  const nRare = rare.reduce((a, b) => a + b, 0);
  const f1 = rare.filter((x) => x === 1).length;
  if (sRare === 0) return { estimate: sAbund, cv2: 0, coverageRare: 1, sRare, sAbund, note: null };
  const cAce = 1 - f1 / nRare;
  if (cAce <= 0) return { estimate: null, cv2: null, coverageRare: 0, sRare, sAbund, note: "Every rare species is a singleton, so ACE is undefined." };
  let sumII = 0;
  for (const x of rare) sumII += x * (x - 1);
  const cv2 = nRare > 1 ? Math.max((sRare / cAce) * sumII / (nRare * (nRare - 1)) - 1, 0) : 0;
  return { estimate: sAbund + sRare / cAce + (f1 / cAce) * cv2, cv2, coverageRare: cAce, sRare, sAbund, note: null };
}

// Sum_{j >= 0} A^(j+1) / (n + j): the tail -log(1-A) - sum_{l=1}^{n-1} A^l / l, times A^(1-n),
// computed without the cancellation of the textbook form. Direct sum while it converges
// quickly; otherwise its integral form A * int_0^inf e^(-n s) / (1 - A e^(-s)) ds on a
// geometric grid, with 8-point Gauss-Legendre on each piece.
const GL8 = [[-0.9602898564975363, 0.1012285362903763], [-0.7966664774136267, 0.2223810344533745], [-0.5255324099163290, 0.3137066458778873], [-0.1834346424956498, 0.3626837833783620], [0.1834346424956498, 0.3626837833783620], [0.5255324099163290, 0.3137066458778873], [0.7966664774136267, 0.2223810344533745], [0.9602898564975363, 0.1012285362903763]];
export function entropyTail(A, n) {
  if (A <= 0) return 0;
  if (A >= 1) return Infinity;
  const terms = Math.ceil(40 / (1 - A));
  if (terms <= 2e6) {
    let sum = 0, p = A;
    for (let j = 0; j < terms + 10; j++) {
      const t = p / (n + j);
      sum += t;
      if (t < 1e-18 * sum) break;
      p *= A;
    }
    return sum;
  }
  const g = (s) => (A * Math.exp(-n * s)) / (1 - A * Math.exp(-s));
  const top = 60 / n;
  const eps = Math.min((1 - A) / 64, top / 1e6);
  const knots = [0];
  for (let s = eps; s < top; s *= 1.25) knots.push(s);
  knots.push(top);
  let sum = 0;
  for (let i = 0; i + 1 < knots.length; i++) {
    const a = knots[i], b = knots[i + 1], h = (b - a) / 2, c = (a + b) / 2;
    for (const [x, w] of GL8) sum += w * h * g(c + h * x);
  }
  return sum;
}

// Shannon entropy estimator of Chao, Wang & Jost (2013), in nats.
export function chaoEntropy(countsIn) {
  const counts = countsIn.filter((x) => x > 0);
  const n = counts.reduce((a, b) => a + b, 0);
  if (n === 0) return NaN;
  const f = frequencies(counts);
  const f1 = f.get(1) || 0;
  const f2 = f.get(2) || 0;
  // First part: sum over species of X/n * (digamma(n) - digamma(X)) = X/n * sum_{k=X}^{n-1} 1/k.
  const H = new Float64Array(n + 1); // H[k] = harmonic number 1 + ... + 1/k
  for (let k = 1; k <= n; k++) H[k] = H[k - 1] + 1 / k;
  let part1 = 0;
  for (const [x, fx] of f) part1 += (fx * x / n) * (H[n - 1] - H[x - 1]);
  const A = aHat(n, f1, f2);
  const part2 = A >= 1 || f1 === 0 ? 0 : (f1 / n) * entropyTail(A, n);
  return part1 + part2;
}

// Unbiased estimator of the Simpson index sum p^2 (Good 1953), and its inverse.
export function simpsonSum(countsIn) {
  const counts = countsIn.filter((x) => x > 0);
  const n = counts.reduce((a, b) => a + b, 0);
  let s = 0;
  for (const x of counts) s += (x * (x - 1)) / (n * (n - 1));
  return s;
}

// Observed (plug-in) Hill numbers of the sample.
export function observedHill(countsIn, q) {
  const counts = countsIn.filter((x) => x > 0);
  const n = counts.reduce((a, b) => a + b, 0);
  if (q === 0) return counts.length;
  if (q === 1) { let h = 0; for (const x of counts) h -= (x / n) * Math.log(x / n); return Math.exp(h); }
  let s = 0;
  for (const x of counts) s += (x / n) ** q;
  return s ** (1 / (1 - q));
}

// Estimated Hill numbers of the whole assemblage (the curve's asymptote).
export function asymptoticHill(counts, q) {
  if (q === 0) return chao1(counts).estimate;
  if (q === 1) return Math.exp(chaoEntropy(counts));
  if (q === 2) { const s = simpsonSum(counts); return s > 0 ? 1 / s : Infinity; }
  throw new Error(`Order q = ${q} is not offered; use 0, 1 or 2.`);
}

// ---------------------------------------------------------------- curves

// Expected frequency counts in a random subsample of m individuals drawn
// without replacement: fbar[k] for k = 1..m (hypergeometric, Chao et al. 2014 eq. 4).
function subsampleFreq(f, n, m) {
  const fbar = new Float64Array(m + 1);
  const lnm = lchoose(n, m);
  for (const [x, fx] of f) {
    const kLo = Math.max(1, m - (n - x));
    const kHi = Math.min(x, m);
    for (let k = kLo; k <= kHi; k++) fbar[k] += fx * Math.exp(lchoose(x, k) + lchoose(n - x, m - k) - lnm);
  }
  return fbar;
}

// Rarefied Hill numbers at a whole-number size m <= n.
function interpolateInt(f, n, m, q, simp) {
  if (m === n) {
    const counts = [];
    for (const [x, fx] of f) for (let i = 0; i < fx; i++) counts.push(x);
    return observedHill(counts, q);
  }
  if (q === 0) {
    let s = 0;
    const lnm = lchoose(n, m);
    for (const [x, fx] of f) s += fx * (n - x >= m ? 1 - Math.exp(lchoose(n - x, m) - lnm) : 1);
    return s;
  }
  if (q === 2) return 1 / (1 / m + (1 - 1 / m) * simp);
  const fbar = subsampleFreq(f, n, m);
  let h = 0;
  for (let k = 1; k <= m; k++) if (fbar[k] > 0) h -= fbar[k] * (k / m) * Math.log(k / m);
  return Math.exp(h);
}

// Coverage of a sample of size m (Chao & Jost 2012, eqs. 4a and 9), as a number in [0, 1].
// Non-whole m between 1 and n is interpolated linearly, as iNEXT does.
export function coverageAt(countsIn, m) {
  const counts = countsIn.filter((x) => x > 0);
  const n = counts.reduce((a, b) => a + b, 0);
  const f = frequencies(counts);
  const f1 = f.get(1) || 0;
  const f2 = f.get(2) || 0;
  const A = aHat(n, f1, f2);
  const atInt = (k) => {
    if (k >= n) return 1 - (f1 / n) * A ** (k - n + 1);
    let s = 0;
    for (const [x, fx] of f) if (n - x >= k) s += fx * (x / n) * Math.exp(lchoose(n - x, k) - lchoose(n - 1, k));
    return 1 - s;
  };
  if (m >= n) return atInt(m);
  if (m === Math.round(m)) return atInt(m);
  const lo = Math.floor(m), hi = Math.ceil(m);
  return (hi - m) * atInt(lo) + (m - lo) * atInt(hi);
}

// A function m -> qD for one assemblage: rarefaction for m < n, the sample at
// m = n, extrapolation for m > n.
export function curveFunction(countsIn, q) {
  const counts = countsIn.filter((x) => x > 0);
  const n = counts.reduce((a, b) => a + b, 0);
  const f = frequencies(counts);
  const f1 = f.get(1) || 0;
  const f2 = f.get(2) || 0;
  const simp = simpsonSum(counts);
  const obs = observedHill(counts, q);
  const cache = new Map();
  const interp = (k) => {
    if (!cache.has(k)) cache.set(k, interpolateInt(f, n, k, q, simp));
    return cache.get(k);
  };
  let extrap;
  if (q === 0) {
    // Chao et al. (2014), eq. 9: S_obs + f0 [1 - (1 - f1 / (n f0 + f1))^(m - n)].
    const f0 = f0Hat(n, f1, f2);
    extrap = (m) => (f0 > 0 ? obs + f0 * (1 - (1 - f1 / (n * f0 + f1)) ** (m - n)) : obs);
  } else if (q === 2) {
    // Chao et al. (2014), eq. 10, valid for any m.
    extrap = (m) => 1 / (1 / m + (1 - 1 / m) * simp);
  } else {
    // q = 1, as in iNEXT 3.0.2 (TD.m.est): approach the estimated asymptote
    // geometrically, D(n + m*) = D_obs + (D_asy - D_obs)(1 - (1 - beta)^m*),
    // with beta fixed by the last step of the rarefaction curve,
    // beta = (D_obs - D(n-1)) / (D_asy - D(n-1)). For q = 0 the same rule is
    // exactly eq. 9 above; for q = 1 it is a smooth bridge from the sample to
    // the Chao-Wang-Jost asymptote.
    const asy = Math.exp(chaoEntropy(counts));
    const prev = n > 1 ? interp(n - 1) : obs;
    const beta = asy !== prev ? (obs - prev) / (asy - prev) : 0;
    extrap = (m) => obs + (asy - obs) * (1 - (1 - beta) ** (m - n));
  }
  return (m) => {
    if (!(m > 0)) return NaN;
    if (m < n) {
      if (m === Math.round(m)) return interp(m);
      const lo = Math.floor(m), hi = Math.ceil(m);
      const vlo = lo < 1 ? 0 : interp(lo);
      const vhi = hi >= n ? obs : interp(hi);
      return (hi - m) * vlo + (m - lo) * vhi;
    }
    if (m === n) return obs;
    return extrap(m);
  };
}

// Sample size at which the curve reaches coverage C (iNEXT's invChat.Ind):
// the closed form when extrapolating, a one-dimensional search when rarefying.
export function sizeForCoverage(countsIn, C) {
  const counts = countsIn.filter((x) => x > 0);
  const n = counts.reduce((a, b) => a + b, 0);
  const f = frequencies(counts);
  const f1 = f.get(1) || 0;
  const f2 = f.get(2) || 0;
  const refC = coverageAt(counts, n);
  let m;
  if (Math.abs(refC - C) < 1e-15) m = n;
  else if (refC > C) {
    // Coverage rises with m; bisection on the (piecewise linear) interpolated curve.
    let lo = 0, hi = n;
    for (let i = 0; i < 200 && hi - lo > 1e-10; i++) {
      const mid = (lo + hi) / 2;
      const c = mid < 1 ? mid * coverageAt(counts, 1) : coverageAt(counts, mid);
      if (c < C) lo = mid; else hi = mid;
    }
    m = (lo + hi) / 2;
  } else {
    let A;
    if (f1 > 0 && f2 > 0) A = ((n - 1) * f1) / ((n - 1) * f1 + 2 * f2);
    else if (f1 > 1 && f2 === 0) A = ((n - 1) * (f1 - 1)) / ((n - 1) * (f1 - 1) + 2);
    else A = 0;
    m = A === 0 ? n : n + (Math.log(n / f1) + Math.log(1 - C)) / Math.log(A) - 1;
  }
  return Math.max(1, m);
}

// ---------------------------------------------------------------- bootstrap

// mulberry32: small, fast, seeded.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The estimated assemblage the bootstrap draws from (Chao et al. 2014,
// Appendix; iNEXT's EstiBootComm.Ind): detected species' relative abundances
// shrunk for the undetected share, plus ceil(f0-hat) undetected species
// sharing the coverage deficit equally.
export function bootstrapAssemblage(countsIn) {
  const counts = countsIn.filter((x) => x > 0);
  const n = counts.reduce((a, b) => a + b, 0);
  const f = frequencies(counts);
  const f1 = f.get(1) || 0;
  const f2 = f.get(2) || 0;
  const f0 = f0Hat(n, f1, f2);
  const A = f1 > 0 ? (n * f0) / (n * f0 + f1) : 1;
  const a = (f1 / n) * A;
  let b = 0;
  for (const x of counts) b += (x / n) * (1 - x / n) ** n;
  const w = f0 === 0 ? 0 : a / b;
  const p = counts.map((x) => (x / n) * (1 - w * (1 - x / n) ** n));
  const unseen = Math.ceil(f0);
  for (let i = 0; i < unseen; i++) p.push(a / unseen);
  return p;
}

// One multinomial draw of n individuals from probabilities p.
function drawCounts(p, n, rand) {
  const cum = new Float64Array(p.length);
  let s = 0;
  for (let i = 0; i < p.length; i++) { s += p[i]; cum[i] = s; }
  const out = new Array(p.length).fill(0);
  for (let i = 0; i < n; i++) {
    const u = rand() * s;
    let lo = 0, hi = p.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; }
    out[lo]++;
  }
  return out.filter((x) => x > 0);
}

function sd(xs) {
  const v = xs.filter((x) => Number.isFinite(x));
  if (v.length < 2) return NaN;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
}

// ---------------------------------------------------------------- one assemblage

function knotSizes(n, endpoint, knots) {
  // Like iNEXT: knots spaced evenly up to the endpoint, with n itself included.
  const step = endpoint / Math.max(1, knots - 1);
  const ms = new Set([1, n, endpoint]);
  for (let i = 1; i < knots - 1; i++) ms.add(Math.max(1, Math.round(i * step)));
  return [...ms].filter((m) => m >= 1 && m <= endpoint).sort((a, b) => a - b);
}

export function analyzeOne(name, countsIn, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const counts = countsIn.map(Number);
  if (!counts.every((x) => Number.isInteger(x) && x >= 0)) throw new Error(`${name ? `${name}: ` : ""}counts are whole numbers of individuals.`);
  const kept = counts.filter((x) => x > 0);
  const b = basics(kept);
  if (b.n < 2) throw new Error(`${name ? `${name}: ` : ""}need at least two individuals.`);
  const z = zCrit(o.confidence);
  const endpoint = Math.max(b.n, Math.round(o.endpoint ?? 2 * b.n));
  const ms = knotSizes(b.n, endpoint, Math.max(3, Math.round(o.knots)));
  const fns = ORDERS.map((q) => curveFunction(kept, q));
  const curve = ms.map((m) => ({ m, method: m < b.n ? "rarefaction" : m === b.n ? "observed" : "extrapolation", coverage: coverageAt(kept, m), qD: fns.map((fn) => fn(m)) }));
  const ch1 = chao1(kept, o.confidence);
  const est = {
    0: ch1.estimate,
    1: Math.exp(chaoEntropy(kept)),
    2: asymptoticHill(kept, 2),
  };
  const obs = ORDERS.map((q) => observedHill(kept, q));
  // Bootstrap: one set of draws reused for the curve, the asymptotes and coverage.
  const B = Math.max(0, Math.round(o.bootstrap));
  const boots = [];
  if (B > 0) {
    const p = bootstrapAssemblage(kept);
    const rand = rng(o.seed);
    for (let r = 0; r < B; r++) boots.push(drawCounts(p, b.n, rand));
  }
  const bootFns = boots.map((x) => ORDERS.map((q) => curveFunction(x, q)));
  for (const pt of curve) {
    pt.se = ORDERS.map((_, qi) => (B > 1 ? sd(bootFns.map((fs) => fs[qi](pt.m))) : NaN));
    pt.lower = pt.qD.map((v, qi) => (Number.isFinite(pt.se[qi]) ? Math.max(0, v - z * pt.se[qi]) : null));
    pt.upper = pt.qD.map((v, qi) => (Number.isFinite(pt.se[qi]) ? v + z * pt.se[qi] : null));
    pt.coverageSe = B > 1 ? sd(boots.map((x) => coverageAt(x, pt.m))) : NaN;
  }
  const asySe = {
    1: B > 1 ? sd(boots.map((x) => Math.exp(chaoEntropy(x)))) : NaN,
    2: B > 1 ? sd(boots.map((x) => asymptoticHill(x, 2))).valueOf() : NaN,
  };
  const asymptotic = ORDERS.map((q, qi) => {
    if (q === 0) return { q, observed: obs[qi], estimate: ch1.estimate, se: ch1.se, lower: ch1.lower, upper: ch1.upper, interval: "Chao (1987) log-normal" };
    const se = asySe[q];
    return { q, observed: obs[qi], estimate: est[q], se, lower: Number.isFinite(se) ? Math.max(0, est[q] - z * se) : null, upper: Number.isFinite(se) ? est[q] + z * se : null, interval: "bootstrap" };
  });
  const aceRes = ace(kept, o.rareThreshold);
  // How much more sampling: to reach 95% and 99% coverage, and to find 90% of Chao1's species.
  const effort = [0.95, 0.99].map((C) => ({ target: `coverage ${Math.round(C * 100)}%`, coverage: C, size: b.coverage >= C ? null : sizeForCoverage(kept, C) }));
  const share = 0.9;
  let speciesSize = null;
  if (ch1.estimate > b.S && b.S < share * ch1.estimate) {
    // Solve S(m) = 0.9 * Chao1 on the q = 0 extrapolation (closed form).
    const f0 = f0Hat(b.n, b.f1, b.f2);
    const target = share * ch1.estimate;
    const r = 1 - b.f1 / (b.n * f0 + b.f1);
    const frac = 1 - (target - b.S) / f0;
    if (frac > 0 && r > 0 && r < 1) speciesSize = b.n + Math.log(frac) / Math.log(r);
  }
  effort.push({ target: `${Math.round(share * 100)}% of estimated species`, share, size: speciesSize, note: b.S >= share * ch1.estimate ? "already found" : null });
  return {
    name,
    n: b.n,
    S: b.S,
    f1: b.f1,
    f2: b.f2,
    fk: b.fk,
    coverage: b.coverage,
    turing: b.turing,
    species: null,
    asymptotic,
    chao1: ch1,
    ace: aceRes,
    entropy: { observed: Math.log(obs[1]), estimate: Math.log(est[1]) },
    simpson: { observed: 1 / obs[2], estimate: simpsonSum(kept) },
    curve,
    effort,
    bootstrap: B,
    _fns: fns,
    _bootFns: bootFns,
    _counts: kept,
  };
}

// Estimate every assemblage at one coverage (or size), with bootstrap SEs.
function atLevel(a, level, base, z) {
  const m = base === "coverage" ? sizeForCoverage(a._counts, level) : level;
  const n = a.n;
  return ORDERS.map((q, qi) => {
    const v = a._fns[qi](m);
    const se = a._bootFns.length > 1 ? sd(a._bootFns.map((fs) => fs[qi](m))) : NaN;
    return {
      q, m, method: m < n - 1e-9 ? "rarefaction" : m > n + 1e-9 ? "extrapolation" : "observed",
      coverage: coverageAt(a._counts, m), qD: v, se,
      lower: Number.isFinite(se) ? Math.max(0, v - z * se) : null, upper: Number.isFinite(se) ? v + z * se : null,
    };
  });
}

// ---------------------------------------------------------------- the whole analysis

function round(x, d = 1) { return Number.isFinite(x) ? Number(x.toFixed(d)) : x; }
const fmt = (x, d = 1) => (x == null || !Number.isFinite(x) ? "n/a" : x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (x, d = 1) => (x == null || !Number.isFinite(x) ? "n/a" : `${(100 * x).toFixed(d)}%`);
// Coverage near 100% needs more digits to say anything.
const pctCov = (x) => (x == null || !Number.isFinite(x) ? "n/a" : x >= 0.99995 ? "over 99.99%" : x >= 0.99 ? `${(100 * x).toFixed(2)}%` : pct(x));
const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;
const whole = (x) => (x == null || !Number.isFinite(x) ? "n/a" : Math.round(x).toLocaleString("en-US"));

function describe(a, conf) {
  const pc = Math.round(conf * 100);
  const c = a.chao1;
  const lead = a.name ? `${a.name}: ` : "";
  const parts = [`${lead}${whole(a.n)} individuals of ${a.S} species; sample coverage ${pctCov(a.coverage)} (the next individual has ${1 - a.coverage < 0.0001 ? "less than a 0.01%" : `about a ${1 - a.coverage < 0.01 ? `${(100 * (1 - a.coverage)).toFixed(2)}%` : pct(1 - a.coverage)}`} chance of being a species not yet seen).`];
  if (c.estimate - a.S < 0.5) parts.push(`Chao1 finds no sign of species still undetected (${plural(a.f1, "singleton", "singletons")}, ${plural(a.f2, "doubleton", "doubletons")}): richness looks complete at ${a.S}.`);
  else parts.push(`Chao1 puts richness at ${fmt(c.estimate)} (${pc}% interval ${fmt(c.lower)} to ${fmt(c.upper)}), so about ${whole(c.estimate - a.S)} species are still undetected; it is a lower bound.`);
  const q1 = a.asymptotic[1], q2 = a.asymptotic[2];
  parts.push(`Shannon diversity is ${fmt(q1.observed)} effective species in the sample, ${fmt(q1.estimate)} estimated for the assemblage; Simpson diversity ${fmt(q2.observed)} and ${fmt(q2.estimate)}.`);
  const e99 = a.effort.find((e) => e.coverage === 0.99);
  if (e99 && e99.size != null) parts.push(`About ${whole(e99.size - a.n)} more individuals would bring coverage to 99%.`);
  return parts.join(" ");
}

function compareText(cmp, conf) {
  if (!cmp) return "";
  const pc = Math.round(conf * 100);
  const lines = [];
  const lvl = cmp.coverage.level;
  for (const qi of [0, 1, 2]) {
    const rows = cmp.coverage.rows.map((r) => ({ name: r.name, ...r.values[qi] })).sort((x, y) => y.qD - x.qD);
    const top = rows[0], bottom = rows[rows.length - 1];
    const overlap = top.lower != null && bottom.upper != null && top.lower <= bottom.upper;
    lines.push(`At ${pctCov(lvl)} coverage, ${ORDER_NAMES[qi]}: ${rows.map((r) => `${r.name} ${fmt(r.qD)}`).join(", ")}${rows.length > 1 ? (overlap ? ` (the ${pc}% intervals of highest and lowest overlap)` : ` (the ${pc}% intervals of ${top.name} and ${bottom.name} do not overlap)`) : ""}.`);
  }
  return lines.join(" ");
}

export function analyze(input = {}) {
  const opts = { ...DEFAULTS, ...input };
  const confidence = Number(opts.confidence);
  if (!(confidence > 0 && confidence < 1)) throw new Error(`confidence must be between 0 and 1, got ${opts.confidence}.`);
  if (!(Number(opts.knots) >= 3 && Number(opts.knots) <= 400)) throw new Error("knots must be between 3 and 400.");
  if (!(Number(opts.bootstrap) >= 0 && Number(opts.bootstrap) <= 2000)) throw new Error("bootstrap must be between 0 and 2,000 replicates.");
  let assemblages;
  let source;
  let layout = null;
  if (Array.isArray(opts.counts)) {
    assemblages = [{ name: "", counts: opts.counts.map(Number), species: null }];
    source = "counts";
  } else if (opts.assemblages && typeof opts.assemblages === "object") {
    assemblages = Object.entries(opts.assemblages).map(([name, counts]) => ({ name, counts: (Array.isArray(counts) ? counts : []).map(Number), species: null }));
    source = "counts";
  } else if (opts.text != null) {
    const r = readAbundance(opts.text, opts);
    assemblages = r.assemblages;
    layout = r.layout;
    source = "csv";
  } else throw new Error("Give abundance data: CSV text (species and counts), a list of counts such as [12, 5, 3, 1], or several lists by name.");
  if (!assemblages.length) throw new Error("No assemblages found in the data.");
  if (assemblages.length > 60) throw new Error(`${assemblages.length} assemblages: at most 60 at a time. Group by a coarser column.`);
  for (const a of assemblages) {
    if (!a.counts.every((x) => Number.isInteger(x) && x >= 0)) throw new Error(`${a.name ? `${a.name}: ` : ""}counts are whole numbers of individuals.`);
  }
  const results = assemblages.map((a) => {
    const r = analyzeOne(a.name, a.counts, { ...opts, confidence });
    if (a.species) r.species = a.species.map((s, i) => ({ species: s, count: a.counts[i] }));
    return r;
  });
  const z = zCrit(confidence);
  let comparison = null;
  if (results.length > 1) {
    // iNEXT's defaults: the lowest coverage, and the lowest size, any assemblage reaches at twice its sample size.
    const covLevel = Math.min(...results.map((r) => coverageAt(r._counts, 2 * r.n)));
    const sizeLevel = Math.min(...results.map((r) => 2 * r.n));
    comparison = {
      coverage: { level: covLevel, rows: results.map((r) => ({ name: r.name, values: atLevel(r, covLevel, "coverage", z) })) },
      size: { level: sizeLevel, rows: results.map((r) => ({ name: r.name, values: atLevel(r, sizeLevel, "size", z) })) },
    };
  }
  const groups = results.map((r) => {
    const { _fns, _bootFns, _counts, ...rest } = r;
    return { ...rest, text: describe(r, confidence) };
  });
  const summary = [...groups.map((g) => g.text), compareText(comparison, confidence)].filter(Boolean).join("\n");
  return { source, layout, confidence, orders: ORDERS, groups, comparison, summary, papers: PAPERS.map((p) => p.key) };
}

// ---------------------------------------------------------------- report

export function report(res) {
  const pc = Math.round(res.confidence * 100);
  const lines = [];
  for (const g of res.groups) {
    lines.push(`${g.name ? `Assemblage ${g.name}: ` : ""}n = ${g.n}, species observed = ${g.S}, singletons f1 = ${g.f1}, doubletons f2 = ${g.f2}, coverage = ${g.coverage.toFixed(4)}`);
    lines.push(`order,observed,estimate,se,lower_${pc},upper_${pc},interval`);
    for (const a of g.asymptotic) lines.push([`q=${a.q}`, round(a.observed, 3), round(a.estimate, 3), round(a.se, 3), a.lower == null ? "" : round(a.lower, 3), a.upper == null ? "" : round(a.upper, 3), a.interval].join(","));
    lines.push(`ACE (rare <= 10),${g.ace.estimate == null ? "undefined" : round(g.ace.estimate, 3)}`);
    lines.push(`m,method,coverage,q0,q1,q2,q0_lower,q0_upper,q1_lower,q1_upper,q2_lower,q2_upper`);
    for (const p of g.curve) lines.push([p.m, p.method, round(p.coverage, 4), ...p.qD.map((v) => round(v, 3)), ...[0, 1, 2].flatMap((qi) => [p.lower?.[qi] == null ? "" : round(p.lower[qi], 3), p.upper?.[qi] == null ? "" : round(p.upper[qi], 3)])].join(","));
    for (const e of g.effort) lines.push(`More sampling for ${e.target}: ${e.size == null ? (e.note || "already reached or not estimable") : `${Math.ceil(e.size - g.n)} more individuals (total ${Math.ceil(e.size)})`}`);
    lines.push(g.text);
    lines.push("");
  }
  if (res.comparison) {
    for (const base of ["coverage", "size"]) {
      const c = res.comparison[base];
      lines.push(base === "coverage" ? `Compared at a common sample coverage of ${c.level.toFixed(4)}` : `Compared at a common sample size of ${c.level}`);
      lines.push(`assemblage,q,m,method,coverage,qD,se,lower_${pc},upper_${pc}`);
      for (const r of c.rows) for (const v of r.values) lines.push([r.name, v.q, round(v.m, 1), v.method, round(v.coverage, 4), round(v.qD, 3), round(v.se, 3), v.lower == null ? "" : round(v.lower, 3), v.upper == null ? "" : round(v.upper, 3)].join(","));
      lines.push("");
    }
  }
  lines.push(res.summary);
  return lines.join("\n").trimEnd();
}
