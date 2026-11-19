// ROC analysis: how well does a score, test or model tell cases from non-cases,
// is one better than another on the same people, and where should the cut go?
//
// Pure functions, no DOM, no network, seeded randomness only. Implemented from
// the papers' mathematics (PAPERS below); no third-party code was ported.
// numpy and scipy were used only to produce eval/reference.json.
//
// The core is DeLong, DeLong & Clarke-Pearson (1988): the AUC is a Mann-Whitney
// statistic, its variance comes from per-case "placement values", and the
// covariance of two AUCs measured on the same cases comes from the same
// placements, which gives a paired test that accounts for the correlation.
// Placements are computed with midranks (Sun & Xu 2014), O(N log N). Around it:
// thresholds by Youden's J (1950) or a target sensitivity, sensitivity and
// specificity with Wilson (1927) intervals, likelihood ratios with log-method
// intervals (Simel, Samsa & Matchar 1991), partial AUC standardised by McClish
// (1989) with a stratified bootstrap interval, and decision curves (net
// benefit, Vickers & Elkin 2006) for scores that are probabilities.

export const PAPERS = [
  {
    authors: "Elizabeth R. DeLong, David M. DeLong and Daniel L. Clarke-Pearson",
    title: "Comparing the areas under two or more correlated receiver operating characteristic curves: a nonparametric approach",
    venue: "Biometrics 44(3), 837-845",
    year: 1988,
    url: "https://doi.org/10.2307/2531595",
    doi: "10.2307/2531595",
    implemented: "The AUC's variance from the structural components (placement values) V10 and V01, the covariance matrix S = S10/m + S01/n of several AUCs on the same cases, the paired z test for a difference of two AUCs and the chi-square test of equality of k AUCs with the contrast matrix L.",
    deviations: "The interval for one AUC is the Wald interval AUC +/- z*SE, clipped to [0, 1], as in pROC's DeLong default; it can be poor for AUCs near 1 with few cases, which the page says.",
  },
  {
    authors: "Xu Sun and Weichao Xu",
    title: "Fast implementation of DeLong's algorithm for comparing the areas under correlated receiver operating characteristic curves",
    venue: "IEEE Signal Processing Letters 21(11), 1389-1393",
    year: 2014,
    url: "https://doi.org/10.1109/LSP.2014.2337313",
    doi: "10.1109/LSP.2014.2337313",
    implemented: "Placement values from midranks: V10_i = (Tz_i - Tx_i)/n and V01_j = 1 - (Tz_j - Ty_j)/m, with Tz the midranks in the pooled sample and Tx, Ty the midranks within cases and non-cases.",
    deviations: null,
  },
  {
    authors: "James A. Hanley and Barbara J. McNeil",
    title: "The meaning and use of the area under a receiver operating characteristic (ROC) curve",
    venue: "Radiology 143(1), 29-36",
    year: 1982,
    url: "https://doi.org/10.1148/radiology.143.1.7063747",
    doi: "10.1148/radiology.143.1.7063747",
    implemented: "The AUC as the probability that a random case scores higher than a random non-case, ties counted one half, equal to the trapezoidal area under the empirical ROC curve.",
    deviations: null,
  },
  {
    authors: "W. J. Youden",
    title: "Index for rating diagnostic tests",
    venue: "Cancer 3(1), 32-35",
    year: 1950,
    url: "https://doi.org/10.1002/1097-0142(1950)3:1<32::AID-CNCR2820030106>3.0.CO;2-3",
    doi: "10.1002/1097-0142(1950)3:1<32::AID-CNCR2820030106>3.0.CO;2-3",
    implemented: "J = sensitivity + specificity - 1, maximised over the observed cut-offs; ties broken toward the higher cut-off.",
    deviations: null,
  },
  {
    authors: "Edwin B. Wilson",
    title: "Probable inference, the law of succession, and statistical inference",
    venue: "Journal of the American Statistical Association 22(158), 209-212",
    year: 1927,
    url: "https://doi.org/10.1080/01621459.1927.10502953",
    doi: "10.1080/01621459.1927.10502953",
    implemented: "Score intervals for sensitivity, specificity and the predictive values at a cut-off.",
    deviations: null,
  },
  {
    authors: "David L. Simel, Gregory P. Samsa and David B. Matchar",
    title: "Likelihood ratios with confidence: sample size estimation for diagnostic test studies",
    venue: "Journal of Clinical Epidemiology 44(8), 763-770",
    year: 1991,
    url: "https://doi.org/10.1016/0895-4356(91)90128-V",
    doi: "10.1016/0895-4356(91)90128-V",
    implemented: "Intervals for the positive and negative likelihood ratios on the log scale, var(ln LR+) = 1/TP - 1/(TP+FN) + 1/FP - 1/(FP+TN), and the same with FN and TN for LR-.",
    deviations: "When a cell is zero, 0.5 is added to every cell for the interval only (the point estimate is left alone), a common convention the paper does not set.",
  },
  {
    authors: "Donna Katzman McClish",
    title: "Analyzing a portion of the ROC curve",
    venue: "Medical Decision Making 9(3), 190-195",
    year: 1989,
    url: "https://doi.org/10.1177/0272989X8900900307",
    doi: "10.1177/0272989X8900900307",
    implemented: "The partial AUC over false positive rates 0 to e, and its standardised form 0.5 * (1 + (pAUC - e^2/2) / (e - e^2/2)), which is 0.5 for a useless score and 1 for a perfect one.",
    deviations: "The interval is a stratified percentile bootstrap (cases and non-cases resampled separately, seeded) rather than the paper's parametric binormal variance.",
  },
  {
    authors: "Andrew J. Vickers and Elena B. Elkin",
    title: "Decision curve analysis: a novel method for evaluating prediction models",
    venue: "Medical Decision Making 26(6), 565-574",
    year: 2006,
    url: "https://doi.org/10.1177/0272989X06295361",
    doi: "10.1177/0272989X06295361",
    implemented: "Net benefit TP/N - FP/N * pt/(1 - pt) at each threshold probability pt, against treating everyone (prevalence - (1 - prevalence) * pt/(1 - pt)) and no one (0), and the net reduction in interventions per 100 people.",
    deviations: "Only for score columns that are probabilities (0 to 1), and only from the sample's own prevalence: a case-control sample, whose prevalence was fixed by design, needs the prevalence option.",
  },
];

export const DEFAULTS = { direction: "higher", level: 0.95, alpha: 0.05, partialFpr: 0.1, targetSensitivity: 0.9, targetSpecificity: 0.9, resamples: 500, seed: 1, prevalence: null };
const MAX_ROWS = 200000;
// Scores whose names say they are predicted probabilities get a decision
// curve unless probabilityColumns says otherwise: a marker that happens to
// lie in [0, 1] (a fraction, a ratio) is not a risk.
const PROB_NAME = /(prob|risk|pred|chance|likelihood|^p$|^p_|_p$)/i;
const MAX_SCORES = 8;
const CURVE_POINTS = 600;

// ---------- input ----------

// Quote-aware over the whole text, so a quoted field may hold the delimiter,
// doubled quotes or a line break. Blank records and lines starting with #
// are skipped.
function records(text, delim) {
  const out = [];
  let row = [];
  let cur = "";
  let q = false;
  let atStart = true;
  let comment = false;
  const endRow = () => {
    row.push(cur.trim());
    if (!comment && row.some((c) => c !== "")) out.push(row);
    row = [];
    cur = "";
    atStart = true;
    comment = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (comment) {
      if (ch === "\n") endRow();
      continue;
    }
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
      continue;
    }
    if (atStart && ch === "#" && row.length === 0 && cur.trim() === "") {
      comment = true;
      continue;
    }
    if (ch === '"') {
      q = true;
      atStart = false;
    } else if (ch === "\n") endRow();
    else if (ch === "\r") continue;
    else if (ch === delim) {
      row.push(cur.trim());
      cur = "";
      atStart = false;
    } else {
      cur += ch;
      if (ch !== " " && ch !== "\t") atStart = false;
    }
  }
  endRow();
  return out;
}

export function parseCsv(text) {
  const t = String(text ?? "").replace(/^\uFEFF/, "");
  const firstLine = t.split(/\r?\n/).find((l) => l.trim() !== "" && !/^\s*#/.test(l)) ?? "";
  const counts = { ",": (firstLine.match(/,/g) || []).length, "\t": (firstLine.match(/\t/g) || []).length, ";": (firstLine.match(/;/g) || []).length };
  let delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  let all;
  if (counts[delim] === 0) {
    delim = "ws";
    all = t.split(/\r?\n/).filter((l) => l.trim() !== "" && !/^\s*#/.test(l)).map((l) => l.trim().split(/\s+/));
  } else all = records(t, delim);
  if (all.length < 2) throw new Error("Paste a header row and at least a few rows of data.");
  const header = all[0].map((h, i) => h || `column ${i + 1}`);
  return { header, rows: all.slice(1) };
}

// A plain number; a trailing % divides by 100.
export function toNumber(s) {
  if (s == null) return NaN;
  let t = String(s).trim();
  let scale = 1;
  if (t.endsWith("%")) {
    t = t.slice(0, -1).trim();
    scale = 100;
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t) / scale;
}

const YES = new Set(["1", "1.0", "true", "yes", "y", "t", "event", "positive", "pos", "case", "cases", "disease", "diseased", "malignant", "abnormal", "fraud", "spam", "churned", "churn", "default", "defaulted", "dead", "died", "sick", "present", "detected", "m", "+"]);
const NO = new Set(["0", "0.0", "false", "no", "n", "f", "none", "negative", "neg", "control", "controls", "healthy", "benign", "normal", "legit", "legitimate", "ham", "retained", "stayed", "alive", "survived", "absent", "not detected", "b", "-"]);

// 1 for the event, 0 for the rest, null when unreadable. With `positive`
// set, that label is the event and every other non-empty value is not.
export function toOutcome(s, positive = null) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "") return null;
  if (positive != null && String(positive).trim() !== "") return t === String(positive).trim().toLowerCase() ? 1 : 0;
  if (YES.has(t)) return 1;
  if (NO.has(t)) return 0;
  return null;
}

// Each column's kind: "binary" (exactly two distinct values), "number",
// "text" or "empty"; numeric columns also say whether they fit in [0, 1].
export function profileColumns(parsed) {
  return parsed.header.map((name, j) => {
    let filled = 0;
    let nums = 0;
    let inUnit = 0;
    const distinct = new Set();
    for (const r of parsed.rows) {
      const v = r[j];
      if (v == null || v.trim() === "") continue;
      filled++;
      if (distinct.size < 3) distinct.add(v.trim().toLowerCase());
      const x = toNumber(v);
      if (Number.isFinite(x)) {
        nums++;
        if (x >= 0 && x <= 1) inUnit++;
      }
    }
    let kind = "text";
    if (filled === 0) kind = "empty";
    else if (distinct.size === 2) kind = "binary";
    else if (nums >= 0.95 * filled) kind = "number";
    return { name, index: j, kind, values: [...distinct], unit: filled > 0 && nums >= 0.95 * filled && inUnit >= 0.95 * filled };
  });
}

const OUTCOME_NAME = /(^y$|outcome|result|actual|event|label|target|class|diagnos|disease|status|truth|case|default|churn|fraud|spam|converted|died|death|positive)/i;
const ID_NAME = /(^id$|_id$|^id_|^index$|^row|^patient$|^subject$|^name$|^date$|^year$)/i;

function pick(cols, want, label) {
  if (want == null || want === "") return null;
  const c = cols.find((c) => c.name === want) || cols.find((c) => c.name.toLowerCase() === String(want).toLowerCase());
  if (!c) throw new Error(`No column named "${want}" for ${label}. Columns: ${cols.map((c) => c.name).join(", ")}.`);
  return c;
}

// Which of a binary column's two values is the event: the one that reads as
// yes, else the opposite of the one that reads as no, else the rarer one.
function guessPositive(parsed, col) {
  const [a, b] = col.values;
  const ra = toOutcome(a);
  const rb = toOutcome(b);
  if (ra === 1 && rb !== 1) return a;
  if (rb === 1 && ra !== 1) return b;
  if (ra === 0 && rb !== 0) return b;
  if (rb === 0 && ra !== 0) return a;
  let na = 0;
  let nb = 0;
  for (const r of parsed.rows) {
    const v = String(r[col.index] ?? "").trim().toLowerCase();
    if (v === a) na++;
    else if (v === b) nb++;
  }
  return na <= nb ? a : b;
}

function directionFor(opts, name) {
  const d = opts.direction;
  const v = d && typeof d === "object" ? d[name] ?? "higher" : d ?? "higher";
  if (v !== "higher" && v !== "lower") throw new Error(`Direction must be "higher" or "lower" (for ${name}), got "${v}".`);
  return v;
}

// Rows to outcomes y in {0, 1} and one or more score columns. A row is used
// only when its outcome and every chosen score are readable, so all scores
// are compared on the same cases (the paired design DeLong's test needs).
export function readData(parsed, opts = {}) {
  const cols = profileColumns(parsed);
  const binary = cols.filter((c) => c.kind === "binary");
  const oc =
    pick(cols, opts.outcomeColumn, "the outcome") ||
    binary.find((c) => OUTCOME_NAME.test(c.name) && !ID_NAME.test(c.name)) ||
    binary.find((c) => !ID_NAME.test(c.name) && c.values.some((v) => toOutcome(v) != null));
  if (!oc) throw new Error("No outcome column found: it needs two values per row, such as 1/0, yes/no or case/control.");
  let wanted = opts.scoreColumns;
  if (typeof wanted === "string") wanted = wanted.split(",").map((s) => s.trim()).filter(Boolean);
  let sc;
  if (wanted && wanted.length) sc = wanted.map((w) => pick(cols, w, "a score"));
  else sc = cols.filter((c) => c !== oc && (c.kind === "number" || (c.kind === "binary" && c.values.every((v) => Number.isFinite(toNumber(v))))) && !ID_NAME.test(c.name)).slice(0, MAX_SCORES);
  if (!sc.length) throw new Error("No score column found: it needs a column of numbers (a test result, a marker level, a model's score or probability).");
  if (sc.length > MAX_SCORES) throw new Error(`Up to ${MAX_SCORES} score columns at once; ${sc.length} were chosen.`);
  if (sc.includes(oc)) throw new Error(`"${oc.name}" is the outcome, so it cannot also be a score.`);
  if (new Set(sc).size !== sc.length) throw new Error("Each score column can be chosen once.");
  const positive = opts.positive != null && String(opts.positive).trim() !== "" ? String(opts.positive).trim() : oc.kind === "binary" && !(oc.values.every((v) => toOutcome(v) != null)) ? guessPositive(parsed, oc) : null;
  const y = [];
  const scores = sc.map(() => []);
  let skipped = 0;
  for (const r of parsed.rows) {
    const o = toOutcome(r[oc.index], positive);
    const xs = sc.map((c) => toNumber(r[c.index]));
    if (o == null || xs.some((x) => !Number.isFinite(x))) {
      skipped++;
      continue;
    }
    y.push(o);
    xs.forEach((x, k) => scores[k].push(x));
  }
  const named = {};
  sc.forEach((c, k) => (named[c.name] = scores[k]));
  const out = fromArrays(y, named, opts);
  out.skipped = skipped;
  out.columns = { outcome: oc.name, positive, scores: sc.map((c) => c.name) };
  return out;
}

function fromArrays(y, named, opts) {
  const names = Object.keys(named);
  if (!names.length) throw new Error("Give at least one score.");
  if (names.length > MAX_SCORES) throw new Error(`Up to ${MAX_SCORES} scores at once; ${names.length} were given.`);
  for (const n of names) {
    if (!Array.isArray(named[n]) || named[n].length !== y.length) throw new Error(`Score "${n}" needs one number per outcome (${y.length}).`);
    if (named[n].some((x) => typeof x !== "number" || !Number.isFinite(x))) throw new Error(`Score "${n}" has a value that is not a number.`);
  }
  if (y.some((v) => v !== 0 && v !== 1)) throw new Error("Outcomes must be 1 (case) or 0 (non-case).");
  if (y.length > MAX_ROWS) throw new Error(`Up to ${MAX_ROWS.toLocaleString("en-US")} rows; this table has ${y.length.toLocaleString("en-US")}.`);
  const m = y.reduce((s, v) => s + v, 0);
  const n = y.length - m;
  if (m < 2 || n < 2) throw new Error(`Need at least 2 cases and 2 non-cases; found ${m} and ${n}.`);
  if (y.length < 10) throw new Error(`Need at least 10 rows with an outcome and every score; found ${y.length}.`);
  const directions = {};
  for (const name of names) directions[name] = directionFor(opts, name);
  return { y, scores: named, names, directions, skipped: 0, columns: { outcome: null, positive: null, scores: names } };
}

// ---------- special functions ----------

// erfc by the Chebyshev fit in Numerical Recipes (fractional error < 1.2e-7).
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const normSf = (z) => 0.5 * erfc(z / Math.SQRT2);

// Inverse normal CDF (Acklam's rational approximation, relative error < 1.2e-9).
export function normInv(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function gammaln(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp0 = x + 5.5;
  const tmp = tmp0 - (x + 0.5) * Math.log(tmp0);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Upper regularised incomplete gamma Q(a, x) (Numerical Recipes gser/gcf).
function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let i = 0; i < 500; i++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}
export const chi2Sf = (x, df) => gammaQ(df / 2, x / 2);

// mulberry32: a small seeded generator, so bootstrap intervals reproduce.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- ranks, AUC and DeLong ----------

// 1-based midranks of x (ties get the mean of the ranks they span).
export function midranks(x) {
  const n = x.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => x[i] - x[j]);
  const r = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && x[idx[j + 1]] === x[idx[i]]) j++;
    const mid = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = mid;
    i = j + 1;
  }
  return r;
}

// AUC and DeLong placement values of one score: cases X (y = 1) against
// non-cases Y (y = 0), higher scores pointing to a case.
export function placements(score, y) {
  const X = [];
  const Y = [];
  for (let i = 0; i < y.length; i++) (y[i] ? X : Y).push(score[i]);
  const m = X.length;
  const n = Y.length;
  const tz = midranks(X.concat(Y));
  const tx = midranks(X);
  const ty = midranks(Y);
  const v10 = new Float64Array(m);
  const v01 = new Float64Array(n);
  let sumRank = 0;
  for (let i = 0; i < m; i++) {
    v10[i] = (tz[i] - tx[i]) / n;
    sumRank += tz[i];
  }
  for (let j = 0; j < n; j++) v01[j] = 1 - (tz[m + j] - ty[j]) / m;
  const auc = (sumRank - (m * (m + 1)) / 2) / (m * n);
  return { auc, v10, v01, m, n };
}

function cov(a, b) {
  const k = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < k; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= k;
  mb /= k;
  let s = 0;
  for (let i = 0; i < k; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (k - 1);
}

// DeLong's estimate for several scores on the same cases: AUCs and their
// covariance matrix S = S10/m + S01/n.
export function delong(scoreList, y) {
  const P = scoreList.map((s) => placements(s, y));
  const k = P.length;
  const { m, n } = P[0];
  const S = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let a = 0; a < k; a++)
    for (let b = a; b < k; b++) {
      const v = cov(P[a].v10, P[b].v10) / m + cov(P[a].v01, P[b].v01) / n;
      S[a][b] = v;
      S[b][a] = v;
    }
  return { auc: P.map((p) => p.auc), S, m, n };
}

function invert(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-15) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row.slice(n));
}

// Paired comparisons of every pair of AUCs, and the overall chi-square test
// of equality (DeLong et al. 1988, L = rows e_1 - e_j).
export function compare(d, names, level = 0.95) {
  const z = normInv(1 - (1 - level) / 2);
  const k = d.auc.length;
  const pairs = [];
  for (let a = 0; a < k; a++)
    for (let b = a + 1; b < k; b++) {
      const diff = d.auc[a] - d.auc[b];
      const v = d.S[a][a] + d.S[b][b] - 2 * d.S[a][b];
      const se = Math.sqrt(Math.max(v, 0));
      const zz = se > 0 ? diff / se : diff === 0 ? 0 : Math.sign(diff) * Infinity;
      const corr = d.S[a][a] > 0 && d.S[b][b] > 0 ? d.S[a][b] / Math.sqrt(d.S[a][a] * d.S[b][b]) : NaN;
      pairs.push({ a: names[a], b: names[b], diff, se, z: zz, p: Number.isFinite(zz) ? 2 * normSf(Math.abs(zz)) : 0, lower: diff - z * se, upper: diff + z * se, correlation: corr });
    }
  let overall = null;
  if (k >= 3) {
    const L = [];
    for (let j = 1; j < k; j++) L.push(d.auc.map((_, i) => (i === 0 ? 1 : i === j ? -1 : 0)));
    const Lt = L.map((row) => row.reduce((s, v, i) => s + v * d.auc[i], 0));
    const LSL = L.map((r1) => L.map((r2) => r1.reduce((s, v, i) => s + v * r2.reduce((t, w, j) => t + d.S[i][j] * w, 0), 0)));
    const inv = invert(LSL);
    if (inv) {
      let chi2 = 0;
      for (let i = 0; i < k - 1; i++) for (let j = 0; j < k - 1; j++) chi2 += Lt[i] * inv[i][j] * Lt[j];
      overall = { chi2, df: k - 1, p: chi2Sf(chi2, k - 1) };
    }
  }
  return { pairs, overall };
}

// ---------- the curve, cut-offs and accuracy at a cut-off ----------

// The empirical ROC curve: one point per distinct score, "score >= t means
// a case". Points run from (0, 0) at t = +inf to (1, 1).
export function rocCurve(score, y) {
  const idx = Array.from({ length: y.length }, (_, i) => i).sort((i, j) => score[j] - score[i]);
  let m = 0;
  for (const v of y) m += v;
  const n = y.length - m;
  const pts = [{ threshold: Infinity, tp: 0, fp: 0, tpr: 0, fpr: 0 }];
  let tp = 0;
  let fp = 0;
  let i = 0;
  while (i < idx.length) {
    const t = score[idx[i]];
    while (i < idx.length && score[idx[i]] === t) {
      if (y[idx[i]]) tp++;
      else fp++;
      i++;
    }
    pts.push({ threshold: t, tp, fp, tpr: tp / m, fpr: fp / n });
  }
  return { points: pts, m, n };
}

// Area under the polyline (ties are diagonal segments, so this equals the
// Mann-Whitney AUC with ties counted half). With `maxFpr`, only FPR <= maxFpr.
export function areaUnder(points, maxFpr = 1) {
  let a = 0;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    if (p0.fpr >= maxFpr) break;
    let x1 = p1.fpr;
    let y1 = p1.tpr;
    if (x1 > maxFpr) {
      y1 = p0.tpr + ((p1.tpr - p0.tpr) * (maxFpr - p0.fpr)) / (p1.fpr - p0.fpr);
      x1 = maxFpr;
    }
    a += ((x1 - p0.fpr) * (y1 + p0.tpr)) / 2;
  }
  return a;
}

export function mcclish(pauc, e) {
  const lo = (e * e) / 2;
  return 0.5 * (1 + (pauc - lo) / (e - lo));
}

export function wilson(k, n, level = 0.95) {
  if (n === 0) return { est: NaN, lower: NaN, upper: NaN };
  const z = normInv(1 - (1 - level) / 2);
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return { est: p, lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) };
}

function lrInterval(est, cells, level) {
  const z = normInv(1 - (1 - level) / 2);
  let [a, b, c, d] = cells; // the four counts of the formula: num hits, num total, den hits, den total
  if (a === 0 || c === 0 || a === b || c === d) {
    a += 0.5;
    c += 0.5;
    b += 1;
    d += 1;
  }
  const se = Math.sqrt(1 / a - 1 / b + 1 / c - 1 / d);
  const lest = Math.log(((a / b) / (c / d)));
  return { est, lower: Math.exp(lest - z * se), upper: Math.exp(lest + z * se) };
}

// Accuracy at "score >= t is a case" (already in the higher-is-case scale).
export function atCut(score, y, t, opts = {}) {
  const level = opts.level ?? DEFAULTS.level;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (let i = 0; i < y.length; i++) {
    const pos = score[i] >= t;
    if (y[i]) pos ? tp++ : fn++;
    else pos ? fp++ : tn++;
  }
  const sens = wilson(tp, tp + fn, level);
  const spec = wilson(tn, tn + fp, level);
  const prevalence = opts.prevalence ?? null;
  let ppv;
  let npv;
  if (prevalence != null) {
    const s = sens.est;
    const c = spec.est;
    ppv = { est: (s * prevalence) / (s * prevalence + (1 - c) * (1 - prevalence)), lower: NaN, upper: NaN };
    npv = { est: (c * (1 - prevalence)) / (c * (1 - prevalence) + (1 - s) * prevalence), lower: NaN, upper: NaN };
  } else {
    ppv = wilson(tp, tp + fp, level);
    npv = wilson(tn, tn + fn, level);
  }
  const lrPlus = lrInterval(fp === 0 ? Infinity : sens.est / (1 - spec.est), [tp, tp + fn, fp, fp + tn], level);
  const lrMinus = lrInterval(tn === 0 ? Infinity : (1 - sens.est) / spec.est, [fn, tp + fn, tn, fp + tn], level);
  return { threshold: t, tp, fp, fn, tn, sensitivity: sens, specificity: spec, ppv, npv, lrPlus, lrMinus, accuracy: (tp + tn) / y.length, youden: sens.est + spec.est - 1, prevalenceUsed: prevalence };
}

// Cut-offs chosen from the curve: Youden's J, the closest point to (0, 1),
// the most specific cut with sensitivity >= target, the most sensitive with
// specificity >= target.
export function cutoffs(points, opts = {}) {
  const ts = opts.targetSensitivity ?? DEFAULTS.targetSensitivity;
  const tsp = opts.targetSpecificity ?? DEFAULTS.targetSpecificity;
  const real = points.filter((p) => Number.isFinite(p.threshold));
  let youden = real[0];
  let closest = real[0];
  for (const p of real) {
    if (p.tpr - p.fpr > youden.tpr - youden.fpr + 1e-12) youden = p;
    const d = (1 - p.tpr) ** 2 + p.fpr ** 2;
    if (d < (1 - closest.tpr) ** 2 + closest.fpr ** 2 - 1e-12) closest = p;
  }
  const forSens = real.find((p) => p.tpr >= ts - 1e-12) || null;
  let forSpec = null;
  for (const p of real) if (1 - p.fpr >= tsp - 1e-12) forSpec = p;
  return { youden, closest, forSensitivity: forSens, forSpecificity: forSpec };
}

// ---------- decision curve ----------

export function decisionCurve(prob, y, opts = {}) {
  const from = opts.from ?? 0.01;
  const to = opts.to ?? 0.99;
  const step = opts.step ?? 0.01;
  const N = y.length;
  const prev = y.reduce((s, v) => s + v, 0) / N;
  const rows = [];
  for (let k = 0; ; k++) {
    const pt = Math.round((from + k * step) * 1e10) / 1e10;
    if (pt > to + 1e-12) break;
    let tp = 0;
    let fp = 0;
    for (let i = 0; i < N; i++)
      if (prob[i] >= pt) {
        if (y[i]) tp++;
        else fp++;
      }
    const w = pt / (1 - pt);
    const model = tp / N - (fp / N) * w;
    const all = prev - (1 - prev) * w;
    rows.push({ pt, model, all, none: 0, avoidedPer100: ((model - all) / w) * 100 });
  }
  const useful = rows.filter((r) => r.model > Math.max(r.all, 0) + 1e-12);
  return { rows, prevalence: prev, usefulFrom: useful.length ? useful[0].pt : null, usefulTo: useful.length ? useful[useful.length - 1].pt : null };
}

// ---------- bootstrap for the partial AUC ----------

function bootstrapPartial(score, y, e, resamples, seed, level) {
  const cases = [];
  const ctrls = [];
  for (let i = 0; i < y.length; i++) (y[i] ? cases : ctrls).push(score[i]);
  const rand = rng(seed);
  const m = cases.length;
  const n = ctrls.length;
  const yy = new Array(m + n).fill(0).fill(1, 0, m);
  const vals = [];
  const s = new Array(m + n);
  for (let b = 0; b < resamples; b++) {
    for (let i = 0; i < m; i++) s[i] = cases[Math.floor(rand() * m)];
    for (let j = 0; j < n; j++) s[m + j] = ctrls[Math.floor(rand() * n)];
    vals.push(mcclish(areaUnder(rocCurve(s, yy).points, e), e));
  }
  vals.sort((a, b) => a - b);
  const q = (p) => {
    const h = (vals.length - 1) * p;
    const lo = Math.floor(h);
    return vals[lo] + (vals[Math.min(lo + 1, vals.length - 1)] - vals[lo]) * (h - lo);
  };
  return { lower: q((1 - level) / 2), upper: q(1 - (1 - level) / 2), resamples };
}

// ---------- analysis ----------

function thin(points, max) {
  if (points.length <= max) return points;
  const out = [];
  const step = (points.length - 1) / (max - 1);
  for (let k = 0; k < max; k++) out.push(points[Math.round(k * step)]);
  return out;
}

export function analyze(input = {}) {
  const opts = { ...DEFAULTS, ...input };
  for (const [k, lo, hi] of [["level", 0.5, 0.9999], ["alpha", 1e-6, 0.5], ["partialFpr", 0.001, 1], ["targetSensitivity", 0.01, 1], ["targetSpecificity", 0.01, 1]])
    if (!(typeof opts[k] === "number" && opts[k] >= lo && opts[k] <= hi)) throw new Error(`${k} must be a number from ${lo} to ${hi}.`);
  if (!(Number.isInteger(opts.resamples) && opts.resamples >= 0 && opts.resamples <= 5000)) throw new Error("resamples must be a whole number from 0 to 5,000.");
  if (opts.prevalence != null && !(opts.prevalence > 0 && opts.prevalence < 1)) throw new Error("prevalence must be between 0 and 1 (exclusive).");
  let data;
  if (input.csv != null) data = readData(parseCsv(input.csv), opts);
  else if (Array.isArray(input.y)) {
    const named = input.scores && typeof input.scores === "object" && !Array.isArray(input.scores) ? input.scores : Array.isArray(input.score) ? { score: input.score } : null;
    if (!named) throw new Error('Give "score": [...] or "scores": {"name": [...]} beside "y".');
    data = fromArrays(input.y.map((v) => (v === true ? 1 : v === false ? 0 : v)), named, opts);
  } else throw new Error('Give "csv" (a table with an outcome column and score columns) or "y" with "score" or "scores".');

  const { y, names, directions } = data;
  // Work on the higher-is-case scale; report thresholds on the original one.
  const oriented = names.map((nm) => (directions[nm] === "lower" ? data.scores[nm].map((v) => -v) : data.scores[nm]));
  const d = delong(oriented, y);
  const z = normInv(1 - (1 - opts.level) / 2);
  const warnings = [];
  let probCols = opts.probabilityColumns ?? null;
  if (typeof probCols === "string") probCols = probCols.split(",").map((t) => t.trim()).filter(Boolean);
  if (probCols) for (const c of probCols) if (!names.includes(c)) throw new Error(`"${c}" is not one of the score columns (${names.join(", ")}).`);
  const unshow = (nm, t) => (directions[nm] === "lower" ? -t : t);
  const results = names.map((nm, k) => {
    const s = oriented[k];
    const curve = rocCurve(s, y);
    const auc = d.auc[k];
    const se = Math.sqrt(Math.max(d.S[k][k], 0));
    const cuts = cutoffs(curve.points, opts);
    const pick = opts.threshold != null && k === 0 ? { threshold: directions[nm] === "lower" ? -opts.threshold : opts.threshold, chosen: true } : cuts.youden;
    const at = atCut(s, y, pick.threshold, opts);
    const e = opts.partialFpr;
    const pauc = areaUnder(curve.points, e);
    const partial = { maxFpr: e, raw: pauc, standardised: mcclish(pauc, e), interval: opts.resamples > 0 && e < 1 ? bootstrapPartial(s, y, e, opts.resamples, opts.seed + k, opts.level) : null };
    const inUnit = data.scores[nm].every((v) => v >= 0 && v <= 1) && directions[nm] === "higher";
    const asked = probCols ? probCols.includes(nm) : PROB_NAME.test(nm);
    if (probCols && probCols.includes(nm) && !inUnit) warnings.push(`${nm}: a decision curve needs probabilities from 0 to 1 with higher meaning a case, so none was drawn.`);
    const isProb = inUnit && asked;
    if (auc < 0.5) warnings.push(`${nm}: the AUC is below 0.5, so lower values point to a case more often than higher ones. If that is how the score works, set its direction to "lower".`);
    const show = (c) => (c ? { ...c, threshold: unshow(nm, c.threshold), sensitivity: c.tpr, specificity: 1 - c.fpr, youden: c.tpr - c.fpr } : null);
    return {
      name: nm,
      direction: directions[nm],
      auc,
      se,
      lower: Math.max(0, auc - z * se),
      upper: Math.min(1, auc + z * se),
      p: se > 0 ? 2 * normSf(Math.abs(auc - 0.5) / se) : auc === 0.5 ? 1 : 0,
      curve: thin(curve.points, CURVE_POINTS).map((p) => ({ threshold: unshow(nm, p.threshold), tpr: p.tpr, fpr: p.fpr })),
      allPoints: curve.points.map((p) => ({ threshold: unshow(nm, p.threshold), tp: p.tp, fp: p.fp, tpr: p.tpr, fpr: p.fpr })),
      distinct: curve.points.length - 1,
      cutoffs: { youden: show(cuts.youden), closest: show(cuts.closest), forSensitivity: show(cuts.forSensitivity), forSpecificity: show(cuts.forSpecificity) },
      at: { ...at, threshold: unshow(nm, at.threshold), chosen: Boolean(pick.chosen) },
      partial,
      decision: isProb ? decisionCurve(data.scores[nm], y) : null,
    };
  });
  const comparison = names.length > 1 ? compare(d, names, opts.level) : null;
  if (d.m < 30 || d.n < 30) warnings.push(`Only ${d.m} cases and ${d.n} non-cases: the intervals are rough, and DeLong's interval can be too narrow for an AUC near 1 with this few.`);
  const r = {
    n: y.length,
    cases: d.m,
    controls: d.n,
    prevalence: d.m / y.length,
    results,
    comparison,
    covariance: d.S,
    skipped: data.skipped,
    warnings,
    columns: data.columns,
    alpha: opts.alpha,
    settings: { level: opts.level, partialFpr: opts.partialFpr, targetSensitivity: opts.targetSensitivity, targetSpecificity: opts.targetSpecificity, resamples: opts.resamples, seed: opts.seed, prevalence: opts.prevalence, threshold: opts.threshold ?? null },
  };
  r.summary = summarize(r);
  return r;
}

// ---------- words ----------

export const fmt = (v, digits = 4) => {
  if (v === Infinity) return "∞";
  if (!Number.isFinite(v)) return "n/a";
  return v.toFixed(digits);
};
export const pct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "n/a");
export const fmtP = (p) => (!Number.isFinite(p) ? "n/a" : p < 0.0001 ? "< 0.0001" : p.toFixed(4));
const num = (v) => {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  return a !== 0 && (a < 0.001 || a >= 1e6) ? v.toPrecision(4) : String(Number(v.toPrecision(6)));
};

function grade(auc) {
  if (auc >= 0.9) return "excellent";
  if (auc >= 0.8) return "good";
  if (auc >= 0.7) return "fair";
  if (auc >= 0.6) return "poor";
  return "little better than chance";
}

export function summarize(r) {
  const lv = Math.round(r.settings.level * 100);
  const best = r.results.reduce((a, b) => (b.auc > a.auc ? b : a));
  const parts = [];
  parts.push(`Across ${r.n.toLocaleString("en-US")} rows (${r.cases.toLocaleString("en-US")} cases, ${r.controls.toLocaleString("en-US")} non-cases), ${r.results.length === 1 ? `${best.name} has` : `the best score, ${best.name}, has`} AUC ${fmt(best.auc, 3)} (${lv}% CI ${fmt(best.lower, 3)} to ${fmt(best.upper, 3)}): a random case scores higher than a random non-case ${pct(best.auc)} of the time, ${grade(best.auc)} discrimination by the usual rule of thumb.`);
  const a = best.at;
  parts.push(`${a.chosen ? "At the chosen cut-off" : "At the cut-off that maximises Youden's J"}, ${best.name} ${best.direction === "lower" ? "≤" : "≥"} ${num(a.threshold)}, sensitivity is ${pct(a.sensitivity.est)} and specificity ${pct(a.specificity.est)}.`);
  if (r.comparison) {
    const sig = r.comparison.pairs.filter((p) => p.p < r.alpha);
    const close = r.comparison.pairs.filter((p) => p.p >= r.alpha);
    if (r.comparison.pairs.length === 1) {
      const p = r.comparison.pairs[0];
      parts.push(`Paired DeLong test, ${p.a} against ${p.b}: difference ${fmt(p.diff, 3)} (${lv}% CI ${fmt(p.lower, 3)} to ${fmt(p.upper, 3)}), p = ${fmtP(p.p)}, ${p.p < r.alpha ? "a real difference at this sample size" : "not distinguishable at this sample size"}.`);
    } else {
      parts.push(`Of ${r.comparison.pairs.length} paired DeLong comparisons, ${sig.length} differ at p < ${r.alpha}${close.length ? `; ${close.map((p) => `${p.a} vs ${p.b} (p = ${fmtP(p.p)})`).slice(0, 3).join(", ")} ${close.length === 1 ? "does" : "do"} not` : ""}.`);
    }
  }
  return parts.join(" ");
}

export function report(r) {
  const lv = Math.round(r.settings.level * 100);
  const L = [];
  L.push("ROC analysis");
  L.push("");
  L.push(r.summary);
  L.push("");
  L.push(`Outcome: ${r.columns.outcome ?? "y"}${r.columns.positive ? ` (case: ${r.columns.positive})` : ""}. ${r.n} rows, ${r.cases} cases, ${r.controls} non-cases${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
  L.push("");
  L.push(`AUC (DeLong ${lv}% CI)`);
  for (const x of r.results) L.push(`  ${x.name.padEnd(24)} ${fmt(x.auc, 4)}  SE ${fmt(x.se, 4)}  CI ${fmt(x.lower, 4)} to ${fmt(x.upper, 4)}  ${x.direction === "lower" ? "(lower = case)" : ""}`);
  L.push("");
  L.push(`Partial AUC, false positive rate 0 to ${r.settings.partialFpr} (McClish standardised; 0.5 useless, 1 perfect)`);
  for (const x of r.results) L.push(`  ${x.name.padEnd(24)} raw ${fmt(x.partial.raw, 4)}  standardised ${fmt(x.partial.standardised, 4)}${x.partial.interval ? `  bootstrap CI ${fmt(x.partial.interval.lower, 4)} to ${fmt(x.partial.interval.upper, 4)}` : ""}`);
  if (r.comparison) {
    L.push("");
    L.push("Paired comparisons (DeLong)");
    for (const p of r.comparison.pairs) L.push(`  ${p.a} - ${p.b}: ${fmt(p.diff, 4)}  SE ${fmt(p.se, 4)}  z ${fmt(p.z, 3)}  p ${fmtP(p.p)}  CI ${fmt(p.lower, 4)} to ${fmt(p.upper, 4)}  r ${fmt(p.correlation, 3)}`);
    if (r.comparison.overall) L.push(`  All equal: chi-square ${fmt(r.comparison.overall.chi2, 3)} on ${r.comparison.overall.df} df, p ${fmtP(r.comparison.overall.p)}`);
  }
  for (const x of r.results) {
    const op = x.direction === "lower" ? "<=" : ">=";
    L.push("");
    L.push(`${x.name}: cut-offs (a case when ${x.name} ${op} t)`);
    const c = x.cutoffs;
    const line = (label, k) => (k ? `  ${label.padEnd(30)} t = ${num(k.threshold)}  sensitivity ${pct(k.sensitivity)}  specificity ${pct(k.specificity)}` : `  ${label.padEnd(30)} none reaches the target`);
    L.push(line("Youden's J", c.youden));
    L.push(line("Closest to top-left", c.closest));
    L.push(line(`Sensitivity >= ${pct(r.settings.targetSensitivity, 0)}`, c.forSensitivity));
    L.push(line(`Specificity >= ${pct(r.settings.targetSpecificity, 0)}`, c.forSpecificity));
    const a = x.at;
    L.push(`  At t = ${num(a.threshold)}${a.chosen ? " (chosen)" : " (Youden)"}: TP ${a.tp}, FP ${a.fp}, FN ${a.fn}, TN ${a.tn}`);
    const ci = (q) => (Number.isFinite(q.lower) ? ` (${pct(q.lower)} to ${pct(q.upper)})` : "");
    L.push(`    sensitivity ${pct(a.sensitivity.est)}${ci(a.sensitivity)}, specificity ${pct(a.specificity.est)}${ci(a.specificity)}`);
    L.push(`    PPV ${pct(a.ppv.est)}${ci(a.ppv)}, NPV ${pct(a.npv.est)}${ci(a.npv)}${a.prevalenceUsed != null ? ` at prevalence ${pct(a.prevalenceUsed)}` : " at the sample's prevalence"}`);
    L.push(`    LR+ ${fmt(a.lrPlus.est, 2)} (${fmt(a.lrPlus.lower, 2)} to ${fmt(a.lrPlus.upper, 2)}), LR- ${fmt(a.lrMinus.est, 3)} (${fmt(a.lrMinus.lower, 3)} to ${fmt(a.lrMinus.upper, 3)})`);
    if (x.decision) {
      const dc = x.decision;
      L.push(`  Decision curve: net benefit above treat-all and treat-none for threshold probabilities ${dc.usefulFrom == null ? "nowhere in 1% to 99%" : `${pct(dc.usefulFrom, 0)} to ${pct(dc.usefulTo, 0)}`}`);
    }
  }
  if (r.warnings.length) {
    L.push("");
    for (const w of r.warnings) L.push(`Note: ${w}`);
  }
  L.push("");
  L.push("Statistical output from the data supplied, not medical, legal, financial or professional advice. Methods: DeLong, DeLong & Clarke-Pearson 1988; Sun & Xu 2014; Youden 1950; Wilson 1927; Simel, Samsa & Matchar 1991; McClish 1989; Vickers & Elkin 2006.");
  return L.join("\n");
}

const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Every point of every curve: the cut-off and what it gives.
export function toCsv(r) {
  const L = ["score,threshold,true_positives,false_positives,sensitivity,specificity,youden_j"];
  for (const x of r.results)
    for (const p of x.allPoints) {
      if (!Number.isFinite(p.threshold)) continue;
      L.push([csvCell(x.name), num(p.threshold), p.tp, p.fp, p.tpr.toFixed(6), (1 - p.fpr).toFixed(6), (p.tpr - p.fpr).toFixed(6)].join(","));
    }
  return L.join("\n") + "\n";
}
