// Ordinal regression: what moves a rating, a Likert answer, a grade or a
// severity stage up or down the scale, by how much, and does one model of the
// whole scale fit, or does a predictor act differently at the top and bottom?
//
// Pure functions, no DOM, no network. Implemented from the papers'
// mathematics (PAPERS below); no third-party code was ported. statsmodels,
// numpy and scipy were used only to produce eval/reference.json.
//
// The model is McCullagh's (1980) proportional-odds model, the ordered logit
// (Walker & Duncan 1967), with an ordered probit as the alternative link:
// P(Y <= j | x) = F(theta_j - x'beta), one set of slopes for every cut of the
// scale. It is fitted by Newton-Raphson on the exact gradient and Hessian with
// step halving, from the marginal cut-points, on centred and scaled predictors
// (mapped back afterwards, covariance by the Jacobian). Around it: a
// likelihood-ratio test against no predictors, McFadden's pseudo R-squared,
// odds ratios with Wald intervals, predicted probabilities of every category
// at a profile and along each predictor, and Brant's (1990) Wald test of the
// proportional-odds assumption from J - 1 separate binary logits.

export const PAPERS = [
  {
    authors: "Peter McCullagh",
    title: "Regression models for ordinal data",
    venue: "Journal of the Royal Statistical Society, Series B 42(2), 109-142",
    year: 1980,
    url: "https://doi.org/10.1111/j.2517-6161.1980.tb01109.x",
    doi: "10.1111/j.2517-6161.1980.tb01109.x",
    implemented: "The cumulative-link model P(Y <= j | x) = F(theta_j - x'beta) with the logistic link (proportional odds) and the normal link (ordered probit); maximum likelihood by Newton-Raphson with the observed information as the covariance.",
    deviations: "Intervals are Wald intervals on the coefficient scale (exponentiated for odds ratios), not profile-likelihood intervals.",
  },
  {
    authors: "Strother H. Walker and David B. Duncan",
    title: "Estimation of the probability of an event as a function of several independent variables",
    venue: "Biometrika 54(1/2), 167-179",
    year: 1967,
    url: "https://doi.org/10.1093/biomet/54.1-2.167",
    doi: "10.1093/biomet/54.1-2.167",
    implemented: "The ordered logistic model for an outcome with more than two ordered categories.",
    deviations: null,
  },
  {
    authors: "Rollin Brant",
    title: "Assessing proportionality in the proportional odds model for ordinal logistic regression",
    venue: "Biometrics 46(4), 1171-1178",
    year: 1990,
    url: "https://doi.org/10.2307/2532457",
    doi: "10.2307/2532457",
    implemented: "The Wald test that the slopes of the J - 1 binary logits for Y > j are equal, overall and per predictor, with the cross-covariance of two binary fits (X'W_j X)^-1 X'W_jl X (X'W_l X)^-1, w_jl = pi_l - pi_j pi_l for j < l.",
    deviations: "Tests each coefficient column (each dummy of a categorical predictor separately), as Stata's brant does; offered for the logit link only.",
  },
  {
    authors: "Daniel McFadden",
    title: "Conditional logit analysis of qualitative choice behavior",
    venue: "In P. Zarembka (ed.), Frontiers in Econometrics, Academic Press, 105-142",
    year: 1974,
    url: "https://eml.berkeley.edu/reprints/mcfadden/zarembka.pdf",
    implemented: "The likelihood-ratio index 1 - logL(model) / logL(thresholds only), reported as a pseudo R-squared.",
    deviations: null,
  },
  {
    authors: "Alan Agresti",
    title: "Analysis of Ordinal Categorical Data (2nd edition)",
    venue: "Wiley",
    year: 2010,
    url: "https://doi.org/10.1002/9780470594001",
    doi: "10.1002/9780470594001",
    implemented: "Interpretation of cumulative odds ratios, the null model from the marginal proportions, and predicted category probabilities.",
    deviations: null,
  },
];

export const DEFAULTS = { link: "logit", level: 0.95, alpha: 0.05 };
const MAX_ROWS = 100000;
const MAX_LEVELS = 15;
const MAX_COEFS = 40;
const MAX_CAT_LEVELS = 20;
const CURVE_POINTS = 41;

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

// Each column's kind: "number" (95% or more of the filled cells read as
// numbers), "text" or "empty", with its distinct values (up to 60).
export function profileColumns(parsed) {
  return parsed.header.map((name, j) => {
    let filled = 0;
    let nums = 0;
    const distinct = new Map();
    for (const r of parsed.rows) {
      const v = r[j];
      if (v == null || v.trim() === "") continue;
      filled++;
      const t = v.trim();
      if (distinct.size <= 60 || distinct.has(t)) distinct.set(t, (distinct.get(t) || 0) + 1);
      if (Number.isFinite(toNumber(t))) nums++;
    }
    let kind = "text";
    if (filled === 0) kind = "empty";
    else if (nums >= 0.95 * filled) kind = "number";
    return { name, index: j, kind, filled, distinct: distinct.size, values: [...distinct.keys()], counts: Object.fromEntries(distinct) };
  });
}

// Ordered answer scales, low to high. A label may have synonyms (one slot).
const SCALES = [
  [["strongly disagree", "completely disagree", "totally disagree"], ["disagree", "mostly disagree"], ["somewhat disagree", "slightly disagree", "tend to disagree"], ["neutral", "neither agree nor disagree", "neither", "undecided", "not sure", "unsure", "neither disagree nor agree"], ["somewhat agree", "slightly agree", "tend to agree"], ["agree", "mostly agree"], ["strongly agree", "completely agree", "totally agree"]],
  [["very dissatisfied", "extremely dissatisfied"], ["dissatisfied"], ["somewhat dissatisfied", "slightly dissatisfied"], ["neutral", "neither satisfied nor dissatisfied", "neither"], ["somewhat satisfied", "slightly satisfied"], ["satisfied"], ["very satisfied", "extremely satisfied"]],
  [["never"], ["rarely", "seldom"], ["sometimes", "occasionally"], ["often", "frequently"], ["very often", "usually", "most of the time"], ["always"]],
  [["very poor", "terrible", "awful"], ["poor", "bad"], ["fair", "average", "ok", "okay"], ["good"], ["very good"], ["excellent", "outstanding"]],
  [["very low"], ["low"], ["medium", "moderate", "mid", "average"], ["high"], ["very high"]],
  [["none", "absent", "no"], ["mild", "minimal", "slight"], ["moderate"], ["severe", "marked"], ["very severe", "extreme", "critical"]],
  [["very unlikely", "extremely unlikely", "definitely not"], ["unlikely", "probably not"], ["neutral", "neither likely nor unlikely", "might or might not", "unsure", "not sure"], ["likely", "probably"], ["very likely", "extremely likely", "definitely"]],
  [["not at all important", "not important"], ["slightly important", "of little importance"], ["moderately important", "somewhat important"], ["important"], ["very important"], ["extremely important"]],
  [["very bad"], ["bad"], ["neutral", "ok", "okay"], ["good"], ["very good"]],
  [["strongly oppose"], ["oppose", "somewhat oppose"], ["neutral", "neither"], ["support", "somewhat support"], ["strongly support"]],
  [["very easy"], ["easy"], ["neutral", "neither easy nor difficult"], ["difficult", "hard"], ["very difficult", "very hard"]],
  [["not at all"], ["a little", "slightly"], ["somewhat", "moderately"], ["very", "quite a bit"], ["extremely"]],
];

const leadingNumber = (s) => {
  const m = String(s).trim().match(/^([-+]?\d+(\.\d+)?)(\s*[-–:.)=]\s*|\s+|$)/);
  return m ? Number(m[1]) : NaN;
};

// The order of an outcome's values, low to high, and how it was decided:
// "given", "numeric" (all numbers, or all start with one: "1 - Poor"),
// "scale" (a known answer scale) or "appearance" (a guess).
export function orderLevels(values, given = null) {
  const vals = [...values];
  if (given != null && given !== "") {
    const list = (Array.isArray(given) ? given : String(given).split(/[,;|\n]/)).map((s) => String(s).trim()).filter(Boolean);
    const lower = new Map(vals.map((v) => [v.toLowerCase(), v]));
    const out = [];
    for (const g of list) {
      const hit = vals.includes(g) ? g : lower.get(g.toLowerCase());
      if (hit == null) throw new Error(`The level "${g}" is not a value of the outcome. Values: ${vals.slice(0, 20).join(", ")}.`);
      if (out.includes(hit)) throw new Error(`The level "${g}" is listed twice.`);
      out.push(hit);
    }
    const missing = vals.filter((v) => !out.includes(v));
    if (missing.length) throw new Error(`The level order leaves out ${missing.slice(0, 6).map((v) => `"${v}"`).join(", ")}: list every value of the outcome, lowest first.`);
    return { levels: out, how: "given" };
  }
  if (vals.every((v) => Number.isFinite(toNumber(v)))) return { levels: vals.sort((a, b) => toNumber(a) - toNumber(b)), how: "numeric" };
  if (vals.every((v) => Number.isFinite(leadingNumber(v)))) {
    const keys = vals.map(leadingNumber);
    if (new Set(keys).size === keys.length) return { levels: vals.sort((a, b) => leadingNumber(a) - leadingNumber(b)), how: "numeric" };
  }
  const norm = (s) => s.toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  for (const scale of SCALES) {
    const rank = (v) => scale.findIndex((slot) => slot.includes(norm(v)));
    const ranks = vals.map(rank);
    if (ranks.every((r) => r >= 0) && new Set(ranks).size === ranks.length) return { levels: vals.map((v, i) => [v, ranks[i]]).sort((a, b) => a[1] - b[1]).map((p) => p[0]), how: "scale" };
  }
  return { levels: vals, how: "appearance" };
}

const OUTCOME_NAME = /(^y$|rating|score|quality|grade|satisf|likert|answer|response|stage|severity|level|rank|outcome|class|category|opinion|agree)/i;
const ID_NAME = /(^id$|_id$|^id_|^index$|^row|^patient$|^subject$|^name$|^date$|^timestamp|^time$|^email|^respondent)/i;

function pick(cols, want, label) {
  if (want == null || want === "") return null;
  const c = cols.find((c) => c.name === want) || cols.find((c) => c.name.toLowerCase() === String(want).toLowerCase());
  if (!c) throw new Error(`No column named "${want}" for ${label}. Columns: ${cols.map((c) => c.name).join(", ")}.`);
  return c;
}

const listOf = (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v.map(String) : String(v).split(",").map((s) => s.trim()).filter(Boolean));

function outcomeCandidate(c) {
  return c.kind !== "empty" && c.distinct >= 3 && c.distinct <= MAX_LEVELS && !ID_NAME.test(c.name) && (c.kind === "text" || c.values.every((v) => Number.isInteger(toNumber(v))));
}

// A predictor column usable as it stands: numbers, or text with 2 to 20 values.
function usable(c) {
  if (c.kind === "empty" || ID_NAME.test(c.name)) return false;
  return c.kind === "number" || (c.distinct >= 2 && c.distinct <= MAX_CAT_LEVELS);
}

// Rows to an outcome coded 0..J-1 and a design matrix. A row is used only
// when its outcome and every chosen predictor are readable.
export function readData(parsed, opts = {}) {
  const cols = profileColumns(parsed);
  const oc = pick(cols, opts.outcomeColumn, "the outcome") || cols.find((c) => outcomeCandidate(c) && OUTCOME_NAME.test(c.name)) || [...cols].reverse().find(outcomeCandidate);
  if (!oc) throw new Error("No outcome column found: it needs 3 to 15 ordered values, such as ratings 1 to 5, Likert answers or stages.");
  const wanted = listOf(opts.predictorColumns);
  let pcs = wanted.length ? wanted.map((w) => pick(cols, w, "a predictor")) : cols.filter((c) => c !== oc && usable(c));
  if (!pcs.length) throw new Error("No predictor column found: add columns of numbers or of a few categories (a group, a treatment arm).");
  if (pcs.includes(oc)) throw new Error(`"${oc.name}" is the outcome, so it cannot also be a predictor.`);
  if (new Set(pcs).size !== pcs.length) throw new Error("Each predictor column can be chosen once.");
  const forceCat = new Set(listOf(opts.categorical).map((s) => s.toLowerCase()));
  const refs = opts.reference && typeof opts.reference === "object" ? opts.reference : {};
  const warnings = [];
  const preds = [];
  for (const c of pcs) {
    const cat = forceCat.has(c.name.toLowerCase()) || c.kind === "text";
    if (!cat) {
      preds.push({ column: c.name, index: c.index, kind: "numeric" });
      continue;
    }
    if (c.distinct > MAX_CAT_LEVELS) throw new Error(`"${c.name}" has ${c.distinct} different values; a categorical predictor can have up to ${MAX_CAT_LEVELS}. Leave it out or group its values.`);
    if (c.distinct < 2) throw new Error(`"${c.name}" has only one value, so it cannot explain anything.`);
    preds.push({ column: c.name, index: c.index, kind: "categorical", values: c.values, counts: c.counts });
  }
  // Rows usable for every chosen column.
  const rows = [];
  let skipped = 0;
  for (const r of parsed.rows) {
    const o = String(r[oc.index] ?? "").trim();
    let ok = o !== "";
    for (const p of preds) {
      const v = String(r[p.index] ?? "").trim();
      if (v === "" || (p.kind === "numeric" && !Number.isFinite(toNumber(v)))) ok = false;
    }
    if (ok) rows.push(r);
    else skipped++;
  }
  if (rows.length > MAX_ROWS) throw new Error(`Up to ${MAX_ROWS.toLocaleString("en-US")} rows; this table has ${rows.length.toLocaleString("en-US")}.`);
  const present = [...new Set(rows.map((r) => String(r[oc.index]).trim()))];
  // Outcome values as profiled may include ones only on skipped rows; order what is used.
  const order = orderLevels(present, opts.levels);
  const levels = order.levels;
  if (levels.length < 3) throw new Error(`The outcome "${oc.name}" has ${levels.length} value${levels.length === 1 ? "" : "s"} on usable rows; ordinal regression needs at least 3 (for two, use logistic regression).`);
  if (levels.length > MAX_LEVELS) throw new Error(`The outcome "${oc.name}" has ${levels.length} values; up to ${MAX_LEVELS} ordered levels are supported. Is it a measurement rather than a rating?`);
  if (order.how === "appearance") warnings.push(`The order of ${oc.name}'s values was not recognised, so they are taken in the order they first appear: ${levels.join(" < ")}. Set the order (lowest first) if that is wrong.`);
  const code = new Map(levels.map((v, i) => [v, i]));
  const y = rows.map((r) => code.get(String(r[oc.index]).trim()));
  // Design matrix.
  const names = [];
  const X = rows.map(() => []);
  for (const p of preds) {
    if (p.kind === "numeric") {
      p.coefs = [names.length];
      names.push(p.column);
      rows.forEach((r, i) => X[i].push(toNumber(r[p.index])));
      const v = X.map((x) => x[x.length - 1]);
      p.min = Math.min(...v);
      p.max = Math.max(...v);
      p.mean = v.reduce((s, a) => s + a, 0) / v.length;
      continue;
    }
    const counts = new Map();
    for (const r of rows) {
      const v = String(r[p.index]).trim();
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    const vals = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || (a < b ? -1 : a > b ? 1 : 0));
    if (vals.length < 2) throw new Error(`"${p.column}" has only one value on the usable rows, so it cannot explain anything.`);
    const wantRef = refs[p.column];
    let ref = vals[0];
    if (wantRef != null && wantRef !== "") {
      ref = vals.find((v) => v === String(wantRef)) ?? vals.find((v) => v.toLowerCase() === String(wantRef).toLowerCase());
      if (ref == null) throw new Error(`"${wantRef}" is not a value of ${p.column}. Values: ${vals.join(", ")}.`);
    }
    p.reference = ref;
    p.levels = [ref, ...vals.filter((v) => v !== ref)];
    p.counts = Object.fromEntries(p.levels.map((v) => [v, counts.get(v)]));
    p.coefs = [];
    for (const v of p.levels.slice(1)) {
      p.coefs.push(names.length);
      names.push(`${p.column}: ${v}`);
      rows.forEach((r, i) => X[i].push(String(r[p.index]).trim() === v ? 1 : 0));
    }
    delete p.values;
  }
  if (names.length > MAX_COEFS) throw new Error(`The model would have ${names.length} coefficients; up to ${MAX_COEFS} are supported. Choose fewer predictors or group categories.`);
  for (const p of preds) delete p.index;
  return { y, X, names, levels, levelOrder: order.how, predictors: preds, skipped, warnings, columns: { outcome: oc.name, predictors: preds.map((p) => p.column) } };
}

// ---------- special functions ----------

// erfc(x) for x >= 0: the all-positive series for erf below 2, Lentz's
// continued fraction above. Relative error near 1e-14 over the range used.
function erfcPos(x) {
  if (x < 2) {
    let term = x;
    let sum = x;
    const x2 = x * x;
    for (let n = 1; n < 200; n++) {
      term *= (2 * x2) / (2 * n + 1);
      sum += term;
      if (term < sum * 1e-17) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * Math.exp(-x2) * sum;
  }
  // erfc(x) = exp(-x^2)/sqrt(pi) * 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + ...))))
  const tiny = 1e-300;
  let f = x;
  let C = x;
  let D = 0;
  for (let n = 1; n < 300; n++) {
    const a = n / 2;
    D = x + a * D;
    if (Math.abs(D) < tiny) D = tiny;
    C = x + a / C;
    if (Math.abs(C) < tiny) C = tiny;
    D = 1 / D;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
}
// Standard normal lower and upper tail probabilities.
export const normCdf = (z) => (z >= 0 ? 1 - 0.5 * erfcPos(z / Math.SQRT2) : 0.5 * erfcPos(-z / Math.SQRT2));
export const normSf = (z) => normCdf(-z);
const normPdf = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

// Inverse normal CDF (Acklam's rational approximation, relative error < 1.2e-9),
// polished by one Newton step on normCdf.
export function normInv(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q, r, x;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    q = p - 0.5;
    r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const e = normCdf(x) - p;
  return x - e / normPdf(x);
}

// Upper regularised incomplete gamma Q(a, x) (Numerical Recipes gser/gcf).
function gammaln(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp0 = x + 5.5;
  const tmp = tmp0 - (x + 0.5) * Math.log(tmp0);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}


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

// ---------- links ----------

const logistic = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
export const LINKS = {
  logit: {
    cdf: logistic,
    sf: (z) => logistic(-z),
    pdf: (z) => {
      const e = Math.exp(-Math.abs(z));
      return e / ((1 + e) * (1 + e));
    },
    dpdf: (z) => {
      const e = Math.exp(-Math.abs(z));
      const f = e / ((1 + e) * (1 + e));
      return f * (1 - 2 * logistic(z));
    },
    inv: (p) => Math.log(p / (1 - p)),
  },
  probit: {
    cdf: normCdf,
    sf: normSf,
    pdf: normPdf,
    dpdf: (z) => -z * normPdf(z),
    inv: normInv,
  },
};

function linkOf(name) {
  const L = LINKS[name];
  if (!L) throw new Error(`The link must be "logit" or "probit", got "${name}".`);
  return L;
}

// P(lower < latent <= upper) with upper = theta_j - eta (Infinity for the top
// category) and lower = theta_{j-1} - eta (-Infinity for the bottom one),
// taken from whichever tail keeps the subtraction accurate.
function cellProb(L, a, b) {
  if (a === Infinity) return L.sf(b);
  if (b === -Infinity) return L.cdf(a);
  return b > 0 ? L.sf(b) - L.sf(a) : L.cdf(a) - L.cdf(b);
}

// Probabilities of every category for a linear predictor eta.
export function categoryProbs(theta, eta, link = "logit") {
  const L = linkOf(link);
  const J = theta.length + 1;
  const out = [];
  for (let j = 0; j < J; j++) out.push(cellProb(L, j < J - 1 ? theta[j] - eta : Infinity, j > 0 ? theta[j - 1] - eta : -Infinity));
  return out;
}

// ---------- linear algebra (small dense) ----------

function cholesky(A) {
  const n = A.length;
  const Lm = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= Lm[i][k] * Lm[j][k];
      if (i === j) {
        if (!(s > 0)) return null;
        Lm[i][i] = Math.sqrt(s);
      } else Lm[i][j] = s / Lm[j][j];
    }
  }
  return Lm;
}

function cholSolve(Lm, b) {
  const n = Lm.length;
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= Lm[i][k] * z[k];
    z[i] = s / Lm[i][i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = z[i];
    for (let k = i + 1; k < n; k++) s -= Lm[k][i] * x[k];
    x[i] = s / Lm[i][i];
  }
  return x;
}

function invertPD(A) {
  const Lm = cholesky(A);
  if (!Lm) return null;
  const n = A.length;
  const out = Array.from({ length: n }, () => new Array(n));
  for (let j = 0; j < n; j++) {
    const e = new Float64Array(n);
    e[j] = 1;
    const col = cholSolve(Lm, e);
    for (let i = 0; i < n; i++) out[i][j] = col[i];
  }
  return out;
}

const matmul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));

// Mean and population standard deviation of each column.
function scaling(X, names) {
  const n = X.length;
  const K = names.length;
  const m = new Array(K).fill(0);
  const s = new Array(K).fill(0);
  for (const x of X) for (let k = 0; k < K; k++) m[k] += x[k];
  for (let k = 0; k < K; k++) m[k] /= n;
  for (const x of X) for (let k = 0; k < K; k++) s[k] += (x[k] - m[k]) ** 2;
  for (let k = 0; k < K; k++) {
    s[k] = Math.sqrt(s[k] / n);
    if (!(s[k] > 0)) throw new Error(`"${names[k]}" is the same on every usable row, so it cannot explain anything.`);
  }
  return { m, s, Z: X.map((x) => x.map((v, k) => (v - m[k]) / s[k])) };
}

// ---------- the cumulative-link fit ----------

// Log-likelihood, gradient and Hessian of the cumulative-link model at
// par = [theta_1..theta_{J-1}, gamma_1..gamma_K] on the scaled design Z.
function evaluate(par, y, Z, J, L, derivs = true) {
  const T = J - 1;
  const K = Z.length ? Z[0].length : 0;
  const P = T + K;
  let ll = 0;
  const g = derivs ? new Float64Array(P) : null;
  const H = derivs ? Array.from({ length: P }, () => new Float64Array(P)) : null;
  for (let i = 0; i < y.length; i++) {
    const z = Z[i];
    let eta = 0;
    for (let k = 0; k < K; k++) eta += par[T + k] * z[k];
    const j = y[i];
    const top = j === T;
    const bot = j === 0;
    const a = top ? Infinity : par[j] - eta;
    const b = bot ? -Infinity : par[j - 1] - eta;
    let p = cellProb(L, a, b);
    if (!(p > 0)) p = 1e-300;
    ll += Math.log(p);
    if (!derivs) continue;
    const fa = top ? 0 : L.pdf(a);
    const fb = bot ? 0 : L.pdf(b);
    const da = fa / p;
    const db = -fb / p;
    const daa = (top ? 0 : L.dpdf(a) / p) - da * da;
    const dbb = (bot ? 0 : -L.dpdf(b) / p) - db * db;
    const dab = (fa * fb) / (p * p);
    if (!top) g[j] += da;
    if (!bot) g[j - 1] += db;
    const dsum = da + db;
    const hsum = daa + 2 * dab + dbb;
    const ha = daa + dab;
    const hb = dab + dbb;
    for (let k = 0; k < K; k++) g[T + k] -= dsum * z[k];
    if (!top) H[j][j] += daa;
    if (!bot) H[j - 1][j - 1] += dbb;
    if (!top && !bot) {
      H[j][j - 1] += dab;
      H[j - 1][j] += dab;
    }
    for (let k = 0; k < K; k++) {
      const zk = z[k];
      if (!top) {
        H[j][T + k] -= ha * zk;
        H[T + k][j] -= ha * zk;
      }
      if (!bot) {
        H[j - 1][T + k] -= hb * zk;
        H[T + k][j - 1] -= hb * zk;
      }
      for (let l = 0; l <= k; l++) {
        const v = hsum * zk * z[l];
        H[T + k][T + l] += v;
        if (l !== k) H[T + l][T + k] += v;
      }
    }
  }
  return { ll, g, H };
}

const increasing = (par, T) => {
  for (let j = 1; j < T; j++) if (!(par[j] > par[j - 1])) return false;
  return true;
};

// Newton-Raphson with step halving; returns the scaled-parameter solution.
function newton(start, f, ok, maxIter = 200) {
  let par = Float64Array.from(start);
  let e = f(par, true);
  let iterations = 0;
  let converged = false;
  for (; iterations < maxIter; iterations++) {
    const negH = Array.from(e.H, (row) => Array.from(row, (v) => -v));
    let Lm = cholesky(negH);
    for (let ridge = 1e-8; !Lm && ridge < 1e6; ridge *= 10) {
      const R = negH.map((row, i) => row.map((v, j) => v + (i === j ? ridge * Math.max(1, Math.abs(negH[i][i])) : 0)));
      Lm = cholesky(R);
    }
    if (!Lm) break;
    const step = cholSolve(Lm, e.g);
    const dec = step.reduce((s, v, i) => s + v * e.g[i], 0);
    if (dec < 1e-20) {
      converged = true;
      break;
    }
    let t = 1;
    let next = null;
    for (let h = 0; h < 60; h++, t /= 2) {
      const cand = par.map((v, i) => v + t * step[i]);
      if (!ok(cand)) continue;
      const c = f(cand, false);
      if (Number.isFinite(c.ll) && c.ll >= e.ll - 1e-12 * Math.abs(e.ll)) {
        next = cand;
        break;
      }
    }
    if (!next) {
      converged = dec < 1e-8;
      break;
    }
    par = next;
    e = f(par, true);
    if (dec < 1e-14) {
      converged = true;
      iterations++;
      break;
    }
  }
  return { par, e, iterations, converged };
}

// Fit the cumulative-link model. y: codes 0..J-1, X: n x K numbers.
// Returns thresholds theta, slopes beta, their joint covariance (thresholds
// first) and the log-likelihood.
export function fitOrdinal(y, X, J, link = "logit", names = null) {
  const L = linkOf(link);
  const n = y.length;
  const K = X.length ? X[0].length : 0;
  const nm = names || Array.from({ length: K }, (_, k) => `x${k + 1}`);
  const T = J - 1;
  const counts = new Array(J).fill(0);
  for (const v of y) counts[v]++;
  if (counts.some((c) => c === 0)) throw new Error("Every level of the outcome needs at least one row.");
  const sc = K ? scaling(X, nm) : { m: [], s: [], Z: X.map(() => []) };
  const start = [];
  let cum = 0;
  for (let j = 0; j < T; j++) {
    cum += counts[j];
    start.push(L.inv(cum / n));
  }
  for (let k = 0; k < K; k++) start.push(0);
  const f = (par, d) => evaluate(par, y, sc.Z, J, L, d);
  const { par, e, iterations, converged } = newton(start, f, (p) => increasing(p, T));
  const negH = Array.from(e.H, (row) => Array.from(row, (v) => -v));
  const covS = invertPD(negH);
  const gamma = Array.from(par.slice(T));
  const shift = gamma.reduce((s, g, k) => s + (g * sc.m[k]) / sc.s[k], 0);
  const theta = Array.from(par.slice(0, T), (t) => t + shift);
  const beta = gamma.map((g, k) => g / sc.s[k]);
  let cov = null;
  if (covS) {
    // Jacobian of [theta, beta] with respect to [theta*, gamma].
    const P = T + K;
    const A = Array.from({ length: P }, () => new Array(P).fill(0));
    for (let j = 0; j < T; j++) {
      A[j][j] = 1;
      for (let k = 0; k < K; k++) A[j][T + k] = sc.m[k] / sc.s[k];
    }
    for (let k = 0; k < K; k++) A[T + k][T + k] = 1 / sc.s[k];
    cov = matmul(matmul(A, covS), transpose(A));
  }
  const separated = gamma.some((g) => Math.abs(g) > 25) || !covS;
  let ll0 = 0;
  for (const c of counts) ll0 += c * Math.log(c / n);
  return { theta, beta, cov, loglik: e.ll, nullLoglik: ll0, iterations, converged, separated, maxGradient: Math.max(0, ...Array.from(e.g, Math.abs)), counts, scaling: { mean: sc.m, sd: sc.s } };
}

// ---------- Brant's test ----------

// A binary logit on [1, Z] by Newton; returns coefficients, fitted
// probabilities and the inverse information.
function binaryLogit(yb, Z) {
  const n = yb.length;
  const K = Z[0].length;
  const P = K + 1;
  const f = (par, d) => {
    let ll = 0;
    const g = d ? new Float64Array(P) : null;
    const H = d ? Array.from({ length: P }, () => new Float64Array(P)) : null;
    for (let i = 0; i < n; i++) {
      let eta = par[0];
      for (let k = 0; k < K; k++) eta += par[k + 1] * Z[i][k];
      const p = logistic(eta);
      ll += yb[i] ? Math.log(Math.max(p, 1e-300)) : Math.log(Math.max(1 - p, 1e-300));
      if (!d) continue;
      const r = yb[i] - p;
      const w = p * (1 - p);
      g[0] += r;
      H[0][0] -= w;
      for (let k = 0; k < K; k++) {
        const zk = Z[i][k];
        g[k + 1] += r * zk;
        H[0][k + 1] -= w * zk;
        H[k + 1][0] -= w * zk;
        for (let l = 0; l <= k; l++) {
          const v = w * zk * Z[i][l];
          H[k + 1][l + 1] -= v;
          if (l !== k) H[l + 1][k + 1] -= v;
        }
      }
    }
    return { ll, g, H };
  };
  const share = yb.reduce((s, v) => s + v, 0) / n;
  const start = [Math.log(share / (1 - share)), ...new Array(K).fill(0)];
  const { par, e, converged } = newton(start, f, () => true, 100);
  const inv = invertPD(Array.from(e.H, (row) => Array.from(row, (v) => -v)));
  const pi = Z.map((z) => logistic(par[0] + z.reduce((s, v, k) => s + par[k + 1] * v, 0)));
  return { coef: Array.from(par), pi, inv, converged, separated: !inv || Array.from(par).some((v) => Math.abs(v) > 25) };
}

function wald(b, V) {
  const Lm = cholesky(V);
  if (!Lm) return null;
  const x = cholSolve(Lm, b);
  return x.reduce((s, v, i) => s + v * b[i], 0);
}

// Brant's (1990) test of proportional odds: are the slopes of the J - 1
// binary logits for "above level j" equal? Overall and per coefficient.
export function brantTest(y, X, J, names) {
  const K = X[0].length;
  const M = J - 1;
  const sc = scaling(X, names);
  const fits = [];
  for (let j = 0; j < M; j++) {
    const yb = y.map((v) => (v > j ? 1 : 0));
    const above = yb.reduce((s, v) => s + v, 0);
    const fit = binaryLogit(yb, sc.Z);
    if (fit.separated || !fit.converged) return { ok: false, reason: `the binary logit for "above level ${j + 1}" (${above} of ${y.length} rows above) does not converge, usually because a predictor separates the rows above that cut from those below it`, cut: j };
    fits.push({ ...fit, above });
  }
  const Z1 = sc.Z.map((z) => [1, ...z]);
  const block = (a, b) => {
    if (a === b) return fits[a].inv;
    const j = Math.min(a, b);
    const l = Math.max(a, b);
    const P = K + 1;
    const mid = Array.from({ length: P }, () => new Array(P).fill(0));
    const pj = fits[j].pi;
    const pl = fits[l].pi;
    for (let i = 0; i < Z1.length; i++) {
      const w = pl[i] - pj[i] * pl[i];
      const z = Z1[i];
      for (let r = 0; r < P; r++) for (let c = 0; c < P; c++) mid[r][c] += w * z[r] * z[c];
    }
    const V = matmul(matmul(fits[j].inv, mid), fits[l].inv);
    return a < b ? V : transpose(V);
  };
  // Slope blocks (rows/cols 1..K of each binary fit), on the scaled design.
  const big = Array.from({ length: M * K }, () => new Array(M * K).fill(0));
  for (let a = 0; a < M; a++)
    for (let b = 0; b < M; b++) {
      const V = block(a, b);
      for (let r = 0; r < K; r++) for (let c = 0; c < K; c++) big[a * K + r][b * K + c] = V[r + 1][c + 1];
    }
  const bstar = fits.flatMap((f) => f.coef.slice(1));
  // D: slopes at cut 1 minus slopes at cut i+1, for i = 1..M-1.
  const contrast = (cols) => {
    const rows = [];
    for (let i = 1; i < M; i++)
      for (const k of cols) {
        const row = new Array(M * K).fill(0);
        row[k] = 1;
        row[i * K + k] = -1;
        rows.push(row);
      }
    const Db = rows.map((row) => row.reduce((s, v, c) => s + v * bstar[c], 0));
    const DVD = rows.map((ra) => rows.map((rb) => {
      let s = 0;
      for (let r = 0; r < ra.length; r++) {
        if (!ra[r]) continue;
        for (let c = 0; c < rb.length; c++) if (rb[c]) s += ra[r] * big[r][c] * rb[c];
      }
      return s;
    }));
    const chi2 = wald(Db, DVD);
    const df = rows.length;
    return { chi2, df, p: chi2 == null ? NaN : chi2Sf(chi2, df) };
  };
  const all = contrast(Array.from({ length: K }, (_, k) => k));
  const by = names.map((name, k) => ({ name, ...contrast([k]) }));
  const slopes = names.map((name, k) => ({
    name,
    byCut: fits.map((f, j) => ({ estimate: f.coef[k + 1] / sc.s[k], se: Math.sqrt(big[j * K + k][j * K + k]) / sc.s[k] })),
  }));
  return { ok: true, overall: all, by, slopes, above: fits.map((f) => f.above) };
}

// ---------- the analysis ----------

function tableFrom(input) {
  if (input.csv != null) return parseCsv(input.csv);
  if (input.columns && typeof input.columns === "object" && !Array.isArray(input.columns)) {
    const header = Object.keys(input.columns);
    const len = Math.max(0, ...header.map((h) => (Array.isArray(input.columns[h]) ? input.columns[h].length : 0)));
    for (const h of header) if (!Array.isArray(input.columns[h]) || input.columns[h].length !== len) throw new Error(`Column "${h}" needs ${len} values, one per row.`);
    return { header, rows: Array.from({ length: len }, (_, i) => header.map((h) => (input.columns[h][i] == null ? "" : String(input.columns[h][i])))) };
  }
  if (Array.isArray(input.rows) && input.rows.length && typeof input.rows[0] === "object" && !Array.isArray(input.rows[0])) {
    const header = [...new Set(input.rows.flatMap((r) => Object.keys(r)))];
    return { header, rows: input.rows.map((r) => header.map((h) => (r[h] == null ? "" : String(r[h])))) };
  }
  throw new Error('Give the data as {"csv": "..."}, {"columns": {"rating": [...], "x": [...]}} or {"rows": [{...}, ...]}.');
}

function profileVector(d, at) {
  const K = d.names.length;
  const x = new Array(K).fill(0);
  const shown = {};
  for (const p of d.predictors) {
    const want = at && Object.prototype.hasOwnProperty.call(at, p.column) ? at[p.column] : undefined;
    if (p.kind === "numeric") {
      let v = p.mean;
      if (want != null && want !== "") {
        v = typeof want === "number" ? want : toNumber(want);
        if (!Number.isFinite(v)) throw new Error(`The profile value for ${p.column} must be a number, got "${want}".`);
      }
      x[p.coefs[0]] = v;
      shown[p.column] = v;
    } else {
      let lev = p.reference;
      if (want != null && want !== "") {
        lev = p.levels.find((l) => l === String(want)) ?? p.levels.find((l) => l.toLowerCase() === String(want).toLowerCase());
        if (lev == null) throw new Error(`"${want}" is not a value of ${p.column}. Values: ${p.levels.join(", ")}.`);
      }
      p.levels.slice(1).forEach((l, i) => (x[p.coefs[i]] = l === lev ? 1 : 0));
      shown[p.column] = lev;
    }
  }
  return { x, shown };
}

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

function setTo(x0, p, value) {
  const x = x0.slice();
  if (p.kind === "numeric") x[p.coefs[0]] = value;
  else p.levels.slice(1).forEach((l, i) => (x[p.coefs[i]] = l === value ? 1 : 0));
  return x;
}

export function analyze(input = {}) {
  const opts = { ...DEFAULTS, ...input };
  const link = String(opts.link || "logit").toLowerCase();
  linkOf(link);
  const level = Number(opts.level);
  const alpha = Number(opts.alpha);
  if (!(level > 0.5 && level < 1)) throw new Error("The confidence level must be between 0.5 and 1, such as 0.95.");
  if (!(alpha > 0 && alpha < 0.5)) throw new Error("Alpha must be between 0 and 0.5, such as 0.05.");
  const d = readData(tableFrom(opts), opts);
  const { y, X, names, levels } = d;
  const n = y.length;
  const J = levels.length;
  const K = names.length;
  const warnings = [...d.warnings];
  if (n < J - 1 + K + 10) throw new Error(`${n} usable rows are too few for ${J - 1} cut-points and ${K} coefficient${K === 1 ? "" : "s"}; give at least ${J - 1 + K + 10}.`);
  const fit = fitOrdinal(y, X, J, link, names);
  const counts = fit.counts;
  const sparse = levels.filter((_, j) => counts[j] < 5);
  if (sparse.length) warnings.push(`${sparse.length === 1 ? "The level" : "The levels"} ${sparse.map((v) => `"${v}"`).join(", ")} ${sparse.length === 1 ? "has" : "have"} fewer than 5 rows; the cut-points next to ${sparse.length === 1 ? "it are" : "them are"} poorly estimated. Merging ${sparse.length === 1 ? "it" : "them"} with a neighbour is often wiser.`);
  if (fit.separated) warnings.push("At least one coefficient ran off towards infinity: a predictor (or a category of one) separates the outcome levels perfectly, so its estimate and interval are not meaningful. Drop it, merge sparse categories or collect more data.");
  else if (!fit.converged) warnings.push("The fit did not fully converge; treat the numbers as approximate.");
  const T = J - 1;
  const z = normInv(1 - (1 - level) / 2);
  const se = (i) => (fit.cov ? Math.sqrt(Math.max(0, fit.cov[i][i])) : NaN);
  const sdOf = (k) => fit.scaling.sd[k];
  const coefficients = names.map((name, k) => {
    const est = fit.beta[k];
    const s = se(T + k);
    const zz = est / s;
    const p = 2 * normSf(Math.abs(zz));
    const lower = est - z * s;
    const upper = est + z * s;
    const pred = d.predictors.find((q) => q.coefs.includes(k));
    const row = { name, column: pred.column, kind: pred.kind, estimate: est, se: s, z: zz, p, lower, upper };
    if (pred.kind === "numeric") row.sd = sdOf(k);
    if (link === "logit") {
      row.oddsRatio = Math.exp(est);
      row.orLower = Math.exp(lower);
      row.orUpper = Math.exp(upper);
      if (pred.kind === "numeric") {
        row.orPerSd = Math.exp(est * row.sd);
        row.orPerSdLower = Math.exp(lower * row.sd);
        row.orPerSdUpper = Math.exp(upper * row.sd);
      }
    }
    return row;
  });
  const thresholds = fit.theta.map((t, j) => ({ name: `${levels[j]} | ${levels[j + 1]}`, estimate: t, se: se(j) }));
  const lr = 2 * (fit.loglik - fit.nullLoglik);
  const npar = T + K;
  const test = { chi2: lr, df: K, p: chi2Sf(Math.max(0, lr), K) };
  const fitStats = {
    loglik: fit.loglik,
    nullLoglik: fit.nullLoglik,
    mcfaddenR2: 1 - fit.loglik / fit.nullLoglik,
    aic: -2 * fit.loglik + 2 * npar,
    bic: -2 * fit.loglik + Math.log(n) * npar,
    parameters: npar,
    iterations: fit.iterations,
    converged: fit.converged,
    maxGradient: fit.maxGradient,
  };
  // Brant's test (logit only).
  let brant = null;
  if (link === "logit") {
    brant = brantTest(y, X, J, names);
    if (!brant.ok) warnings.push(`Brant's test of proportional odds could not be computed: ${brant.reason}. Merging sparse levels usually fixes it.`);
    else {
      const thin = levels.slice(0, -1).map((_, j) => Math.min(brant.above[j], n - brant.above[j])).filter((c) => c < 10).length;
      if (thin) warnings.push(`Brant's test leans on ${thin} binary logit${thin === 1 ? "" : "s"} with fewer than 10 rows on one side of the cut, where its chi-square approximation is rough.`);
    }
  } else brant = { ok: false, reason: "Brant's test is defined for the logit link; switch the link to logit to run it" };
  // Predictions.
  const prof = profileVector(d, opts.at);
  const probsAt = (x) => categoryProbs(fit.theta, dot(fit.beta, x), link);
  const profile = { values: prof.shown, probs: probsAt(prof.x) };
  const effects = {};
  for (const p of d.predictors) {
    if (p.kind === "numeric") {
      const pts = [];
      for (let i = 0; i < CURVE_POINTS; i++) {
        const v = p.min + ((p.max - p.min) * i) / (CURVE_POINTS - 1);
        pts.push({ x: v, probs: probsAt(setTo(prof.x, p, v)) });
      }
      effects[p.column] = { kind: "numeric", points: pts };
    } else effects[p.column] = { kind: "categorical", points: p.levels.map((l) => ({ x: l, probs: probsAt(setTo(prof.x, p, l)) })) };
  }
  // How often the most likely level is the observed one.
  let hit = 0;
  let near = 0;
  const confusion = levels.map(() => new Array(J).fill(0));
  for (let i = 0; i < n; i++) {
    const pr = probsAt(X[i]);
    let best = 0;
    for (let j = 1; j < J; j++) if (pr[j] > pr[best]) best = j;
    confusion[y[i]][best]++;
    if (best === y[i]) hit++;
    if (Math.abs(best - y[i]) <= 1) near++;
  }
  const modal = Math.max(...counts);
  const classification = { accuracy: hit / n, withinOne: near / n, baseline: modal / n, baselineLevel: levels[counts.indexOf(modal)], confusion };
  const r = {
    n,
    skipped: d.skipped,
    link,
    alpha,
    columns: d.columns,
    levels,
    levelOrder: d.levelOrder,
    counts,
    predictors: d.predictors.map((p) => (p.kind === "numeric" ? { column: p.column, kind: p.kind, min: p.min, max: p.max, mean: p.mean } : { column: p.column, kind: p.kind, reference: p.reference, levels: p.levels, counts: p.counts })),
    coefficients,
    thresholds,
    fit: fitStats,
    test,
    brant,
    profile,
    effects,
    classification,
    warnings,
    settings: { link, level, alpha, at: opts.at ?? null, levels: levels },
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
export const num = (v) => {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  return a !== 0 && (a < 0.001 || a >= 1e6) ? v.toPrecision(4) : String(Number(v.toPrecision(4)));
};
const pWords = (p) => (p < 0.0001 ? "p < 0.0001" : `p = ${fmtP(p)}`);

// One coefficient in words.
export function describeCoefficient(c, r) {
  const lv = Math.round(r.settings.level * 100);
  const unit = c.kind === "numeric" ? `each extra unit of ${c.column}` : `${c.name.slice(c.column.length + 2)} rather than ${r.predictors.find((p) => p.column === c.column).reference} (${c.column})`;
  if (r.link === "logit") {
    let s = `${unit[0].toUpperCase()}${unit.slice(1)} multiplies the odds of a higher ${r.columns.outcome} by ${num(c.oddsRatio)} (${lv}% CI ${num(c.orLower)} to ${num(c.orUpper)}, ${pWords(c.p)})`;
    if (c.kind === "numeric") s += `; per standard deviation (${num(c.sd)}), by ${num(c.orPerSd)}`;
    return s + ".";
  }
  return `${unit[0].toUpperCase()}${unit.slice(1)} moves the latent ${r.columns.outcome} scale by ${num(c.estimate)} standard deviations (${lv}% CI ${num(c.lower)} to ${num(c.upper)}, ${pWords(c.p)}).`;
}

export function summarize(r) {
  const parts = [];
  const model = r.link === "logit" ? "proportional-odds (ordered logit)" : "ordered probit";
  parts.push(`Across ${r.n.toLocaleString("en-US")} rows with ${r.columns.outcome} from ${r.levels[0]} to ${r.levels[r.levels.length - 1]} (${r.levels.length} levels), the ${model} model with ${r.coefficients.length} coefficient${r.coefficients.length === 1 ? "" : "s"} ${r.test.p < r.alpha ? "explains the ratings better than no predictors" : "does not explain the ratings better than no predictors"} (likelihood-ratio chi-square ${fmt(r.test.chi2, 1)} on ${r.test.df} df, ${pWords(r.test.p)}; McFadden's R² ${fmt(r.fit.mcfaddenR2, 3)}).`);
  const ranked = [...r.coefficients].sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const sig = ranked.filter((c) => c.p < r.alpha);
  if (sig.length) parts.push(`Strongest: ${describeCoefficient(sig[0], r).replace(/^./, (ch) => ch.toLowerCase())}`);
  if (sig.length > 1) parts.push(`${sig.length} of ${r.coefficients.length} coefficients differ from zero at p < ${r.alpha}${sig.length > 1 ? ` (the others: ${sig.slice(1, 5).map((c) => `${c.name} ${c.estimate > 0 ? "up" : "down"}`).join(", ")}${sig.length > 5 ? ", ..." : ""})` : ""}.`);
  else if (!sig.length) parts.push(`No coefficient differs from zero at p < ${r.alpha}.`);
  if (r.brant && r.brant.ok) {
    const b = r.brant;
    const bad = b.by.filter((x) => x.p < r.alpha).sort((a, c) => a.p - c.p);
    if (b.overall.p < r.alpha) parts.push(`Brant's test rejects proportional odds (chi-square ${fmt(b.overall.chi2, 1)} on ${b.overall.df} df, ${pWords(b.overall.p)})${bad.length ? `: ${bad.map((x) => x.name).slice(0, 4).join(", ")} act${bad.length === 1 ? "s" : ""} differently at different cuts of the scale, so ${bad.length === 1 ? "its odds ratio is" : "their odds ratios are"} an average over the cuts; see the per-cut slopes` : ""}.`);
    else parts.push(`Brant's test finds no evidence against proportional odds (chi-square ${fmt(b.overall.chi2, 1)} on ${b.overall.df} df, ${pWords(b.overall.p)}), so one odds ratio per predictor is a fair summary.`);
  }
  const c = r.classification;
  parts.push(`The most likely level is the observed one for ${pct(c.accuracy)} of rows (always guessing ${c.baselineLevel} gets ${pct(c.baseline)}), and within one level for ${pct(c.withinOne)}.`);
  return parts.join(" ");
}

export function report(r) {
  const lv = Math.round(r.settings.level * 100);
  const L = [];
  L.push(`Ordinal regression (${r.link === "logit" ? "proportional odds, logit link" : "ordered probit"})`);
  L.push("");
  L.push(r.summary);
  L.push("");
  L.push(`Outcome: ${r.columns.outcome}, ${r.levels.length} levels, low to high (${r.levelOrder === "given" ? "order given" : r.levelOrder === "numeric" ? "numeric order" : r.levelOrder === "scale" ? "recognised answer scale" : "order of appearance"}):`);
  r.levels.forEach((v, j) => L.push(`  ${String(v).padEnd(26)} ${String(r.counts[j]).padStart(6)} rows`));
  L.push(`${r.n} rows used${r.skipped ? `, ${r.skipped} skipped (missing or unreadable values)` : ""}.`);
  L.push("");
  L.push(`Coefficients (positive = higher ${r.columns.outcome} more likely; ${lv}% Wald intervals)`);
  for (const c of r.coefficients) {
    let s = `  ${c.name.padEnd(30)} ${fmt(c.estimate, 4).padStart(10)}  SE ${fmt(c.se, 4)}  z ${fmt(c.z, 2)}  p ${fmtP(c.p)}  CI ${fmt(c.lower, 4)} to ${fmt(c.upper, 4)}`;
    if (r.link === "logit") s += `  OR ${num(c.oddsRatio)} (${num(c.orLower)} to ${num(c.orUpper)})${c.orPerSd != null ? `  per SD ${num(c.orPerSd)}` : ""}`;
    L.push(s);
  }
  L.push("");
  L.push("Cut-points (thresholds on the latent scale)");
  for (const t of r.thresholds) L.push(`  ${t.name.padEnd(30)} ${fmt(t.estimate, 4).padStart(10)}  SE ${fmt(t.se, 4)}`);
  L.push("");
  L.push(`Fit: log-likelihood ${fmt(r.fit.loglik, 3)}, null ${fmt(r.fit.nullLoglik, 3)}; LR chi-square ${fmt(r.test.chi2, 3)} on ${r.test.df} df, p ${fmtP(r.test.p)}; McFadden R2 ${fmt(r.fit.mcfaddenR2, 4)}; AIC ${fmt(r.fit.aic, 2)}; BIC ${fmt(r.fit.bic, 2)}; ${r.fit.iterations} Newton iterations.`);
  if (r.brant && r.brant.ok) {
    L.push("");
    L.push("Brant test of proportional odds");
    L.push(`  ${"All coefficients".padEnd(30)} chi-square ${fmt(r.brant.overall.chi2, 3)}  df ${r.brant.overall.df}  p ${fmtP(r.brant.overall.p)}`);
    for (const b of r.brant.by) L.push(`  ${b.name.padEnd(30)} chi-square ${fmt(b.chi2, 3)}  df ${b.df}  p ${fmtP(b.p)}`);
    L.push("");
    L.push(`Slopes of the separate binary logits ("above" each cut)`);
    L.push(`  ${"".padEnd(30)} ${r.levels.slice(0, -1).map((v, j) => `> ${r.levels[j]}`.padStart(12)).join("")}`);
    for (const s of r.brant.slopes) L.push(`  ${s.name.padEnd(30)} ${s.byCut.map((q) => fmt(q.estimate, 4).padStart(12)).join("")}`);
  } else if (r.brant) L.push(`\nBrant test: not available (${r.brant.reason}).`);
  L.push("");
  L.push(`Predicted probabilities at ${Object.entries(r.profile.values).map(([k, v]) => `${k} = ${typeof v === "number" ? num(v) : v}`).join(", ")}`);
  r.levels.forEach((v, j) => L.push(`  ${String(v).padEnd(26)} ${pct(r.profile.probs[j])}`));
  L.push("");
  const c = r.classification;
  L.push(`Most likely level = observed level: ${pct(c.accuracy)} (within one level ${pct(c.withinOne)}; always "${c.baselineLevel}": ${pct(c.baseline)}).`);
  if (r.warnings.length) {
    L.push("");
    for (const w of r.warnings) L.push(`Note: ${w}`);
  }
  L.push("");
  L.push("Statistical output from the data supplied, not medical, legal, financial or professional advice. Methods: McCullagh 1980; Walker & Duncan 1967; Brant 1990; McFadden 1974; Agresti 2010.");
  return L.join("\n");
}

const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The coefficient and cut-point table.
export function toCsv(r) {
  const head = ["term", "type", "estimate", "se", "z", "p", "lower", "upper"];
  if (r.link === "logit") head.push("odds_ratio", "or_lower", "or_upper", "brant_chi2", "brant_df", "brant_p");
  const L = [head.join(",")];
  const g = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(10))) : "");
  for (const c of r.coefficients) {
    const row = [csvCell(c.name), "coefficient", g(c.estimate), g(c.se), g(c.z), g(c.p), g(c.lower), g(c.upper)];
    if (r.link === "logit") {
      const b = r.brant && r.brant.ok ? r.brant.by.find((x) => x.name === c.name) : null;
      row.push(g(c.oddsRatio), g(c.orLower), g(c.orUpper), b ? g(b.chi2) : "", b ? b.df : "", b ? g(b.p) : "");
    }
    L.push(row.join(","));
  }
  for (const t of r.thresholds) {
    const row = [csvCell(t.name), "cut-point", g(t.estimate), g(t.se), "", "", "", ""];
    if (r.link === "logit") row.push("", "", "", "", "", "");
    L.push(row.join(","));
  }
  return L.join("\n") + "\n";
}
