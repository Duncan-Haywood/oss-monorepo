// Inter-rater agreement: do your raters, coders or annotators agree beyond
// chance, by how much, with what interval, and where do they disagree?
//
// Krippendorff's alpha (nominal, ordinal, interval or ratio; any number of
// raters; missing ratings allowed) is the headline coefficient. Beside it:
// Cohen's kappa for two raters, weighted for ordered categories, with the
// Fleiss-Cohen-Everitt standard error; Fleiss' kappa and Gwet's AC1/AC2 for
// many raters (Gwet's generalised forms, so missing ratings are allowed);
// pairwise kappas and "alpha without this rater" to find the rater who
// disagrees; per-category kappa to find the category that is confused; and,
// for numeric ratings by the same raters, the six intraclass correlations of
// Shrout & Fleiss (1979) with McGraw & Wong's (1996) F-based intervals.
// Multi-rater intervals come from a seeded bootstrap over subjects. Pure
// functions, no DOM, no network.

export const PAPERS = [
  {
    authors: "Klaus Krippendorff",
    title: "Content Analysis: An Introduction to Its Methodology (2nd edition), chapter 11; and Computing Krippendorff's alpha-reliability (2011)",
    venue: "Sage, Thousand Oaks; University of Pennsylvania ScholarlyCommons, Departmental Papers (ASC) 43",
    year: 2004,
    url: "https://repository.upenn.edu/asc_papers/43/",
    implemented: "alpha = 1 - D_o / D_e from the coincidence matrix of pairable values: o_ck = sum over units u of (pairs of values c, k in u) / (m_u - 1), D_e from the marginals n_c; the nominal, ordinal, interval and ratio difference functions; units with fewer than two values dropped; the reliability standards alpha >= 0.800, and 0.667 <= alpha < 0.800 for tentative conclusions only.",
    deviations: "The interval is a percentile bootstrap that resamples units (subjects) with replacement, not the Hayes & Krippendorff (2007) bootstrap of the coincidence matrix; the two have not been compared here, and the unit bootstrap treats subjects, not ratings, as the sampled units. Interval alpha is computed from sums and sums of squares, which is algebraically the same as the coincidence-matrix form.",
  },
  {
    authors: "Andrew F. Hayes, Klaus Krippendorff",
    title: "Answering the call for a standard reliability measure for coding data",
    venue: "Communication Methods and Measures 1(1), 77-89",
    year: 2007,
    url: "https://doi.org/10.1080/19312450709336664",
    doi: "10.1080/19312450709336664",
    implemented: "The argument for alpha as the one coefficient that handles any number of coders, missing data and every level of measurement, and for reporting it with a bootstrap interval and the probability that it falls below the chosen minimum.",
    deviations: "Bootstrap over units rather than their coincidence-matrix resampling (see Krippendorff above). The share of bootstrap replicates below 0.667 and 0.800 is reported as that probability.",
  },
  {
    authors: "Jacob Cohen",
    title: "A coefficient of agreement for nominal scales",
    venue: "Educational and Psychological Measurement 20(1), 37-46",
    year: 1960,
    url: "https://doi.org/10.1177/001316446002000104",
    doi: "10.1177/001316446002000104",
    implemented: "kappa = (p_o - p_e) / (1 - p_e) for two raters, p_e from the product of the two raters' own marginal distributions.",
    deviations: "Only subjects both raters rated are used; with more than two raters the tool reports every pair (and their mean, Light's kappa).",
  },
  {
    authors: "Jacob Cohen",
    title: "Weighted kappa: nominal scale agreement with provision for scaled disagreement or partial credit",
    venue: "Psychological Bulletin 70(4), 213-220",
    year: 1968,
    url: "https://doi.org/10.1037/h0026256",
    doi: "10.1037/h0026256",
    implemented: "Weighted kappa with agreement weights w_ij; linear weights 1 - |i-j|/(q-1) and quadratic weights 1 - (i-j)^2/(q-1)^2 on the category ranks, both reported for ordered categories.",
    deviations: "For numeric categories the weights use the category ranks, as scikit-learn does, not the values.",
  },
  {
    authors: "Joseph L. Fleiss, Jacob Cohen, B. S. Everitt",
    title: "Large sample standard errors of kappa and weighted kappa",
    venue: "Psychological Bulletin 72(5), 323-327",
    year: 1969,
    url: "https://doi.org/10.1037/h0028106",
    doi: "10.1037/h0028106",
    implemented: "The large-sample variance of (weighted) kappa, var = [sum p_ij (w_ij - (wbar_i. + wbar_.j)(1 - kappa))^2 - (kappa - p_e(1 - kappa))^2] / (N (1 - p_e)^2), for the confidence interval, and its value under kappa = 0 for the z test.",
    deviations: "None; the normal-approximation interval is clipped to [-1, 1].",
  },
  {
    authors: "Joseph L. Fleiss",
    title: "Measuring nominal scale agreement among many raters",
    venue: "Psychological Bulletin 76(5), 378-382",
    year: 1971,
    url: "https://doi.org/10.1037/h0031619",
    doi: "10.1037/h0031619",
    implemented: "Fleiss' kappa for many raters, with chance agreement sum_k pi_k^2 from the pooled category shares, and the per-category kappa_j = 1 - sum_i r_ij (n - r_ij) / (N n (n - 1) p_j q_j).",
    deviations: "Computed in Gwet's (2014) generalised form, which allows a different number of ratings per subject; with complete data it equals Fleiss' 1971 value. Per-category kappa is the same coefficient on the data recoded as 'this category or not', which with complete data is Fleiss' kappa_j. The interval is the subject bootstrap.",
  },
  {
    authors: "Kilem Li Gwet",
    title: "Computing inter-rater reliability and its variance in the presence of high agreement",
    venue: "British Journal of Mathematical and Statistical Psychology 61(1), 29-48",
    year: 2008,
    url: "https://doi.org/10.1348/000711006X126600",
    doi: "10.1348/000711006X126600",
    implemented: "AC1 = (p_a - p_e) / (1 - p_e) with p_e = (1/(q - 1)) sum_k pi_k (1 - pi_k), for any number of raters and missing ratings, and the weighted form AC2 (Gwet 2014, Handbook of Inter-Rater Reliability, 4th ed.) with p_e = T_w / (q (q - 1)) sum_k pi_k (1 - pi_k) for ordered categories; p_a over subjects with at least two ratings, pi_k over subjects with at least one.",
    deviations: "q is the number of categories seen in the data unless you list the possible categories; AC1 depends on q, so list them when some were never used. Interval from the subject bootstrap, not Gwet's variance formula.",
  },
  {
    authors: "Patrick E. Shrout, Joseph L. Fleiss",
    title: "Intraclass correlations: uses in assessing rater reliability",
    venue: "Psychological Bulletin 86(2), 420-428",
    year: 1979,
    url: "https://doi.org/10.1037/0033-2909.86.2.420",
    doi: "10.1037/0033-2909.86.2.420",
    implemented: "The six intraclass correlations ICC(1,1), ICC(2,1), ICC(3,1) and their k-rater averages from the one-way and two-way ANOVA mean squares (between subjects, between raters, residual, within subjects).",
    deviations: "Subjects missing any rater's rating are left out, as the ANOVA needs a complete table; the tool says how many.",
  },
  {
    authors: "Kenneth O. McGraw, S. P. Wong",
    title: "Forming inferences about some intraclass correlation coefficients",
    venue: "Psychological Methods 1(1), 30-46",
    year: 1996,
    url: "https://doi.org/10.1037/1082-989X.1.1.30",
    doi: "10.1037/1082-989X.1.1.30",
    implemented: "Names (consistency vs absolute agreement), the F tests, and the exact F-based confidence intervals, including the Satterthwaite degrees of freedom for the two-way random, absolute-agreement ICC(2,1) and ICC(2,k).",
    deviations: "None.",
  },
  {
    authors: "J. Richard Landis, Gary G. Koch",
    title: "The measurement of observer agreement for categorical data",
    venue: "Biometrics 33(1), 159-174",
    year: 1977,
    url: "https://doi.org/10.2307/2529310",
    doi: "10.2307/2529310",
    implemented: "The verbal benchmarks for kappa (slight 0-0.20, fair 0.21-0.40, moderate 0.41-0.60, substantial 0.61-0.80, almost perfect 0.81-1), shown as labels only.",
    deviations: "Landis and Koch call them arbitrary; the page says so and leads with the interval.",
  },
  {
    authors: "Terry K. Koo, Mae Y. Li",
    title: "A guideline of selecting and reporting intraclass correlation coefficients for reliability research",
    venue: "Journal of Chiropractic Medicine 15(2), 155-163",
    year: 2016,
    url: "https://doi.org/10.1016/j.jcm.2016.02.012",
    doi: "10.1016/j.jcm.2016.02.012",
    implemented: "The ICC bands (poor < 0.5, moderate 0.5-0.75, good 0.75-0.9, excellent > 0.9) applied to the 95% interval, and the advice to report the model, type and definition of the ICC chosen.",
    deviations: "None.",
  },
  {
    authors: "Ted Byrt, Janet Bishop, John B. Carlin",
    title: "Bias, prevalence and kappa",
    venue: "Journal of Clinical Epidemiology 46(5), 423-429",
    year: 1993,
    url: "https://doi.org/10.1016/0895-4356(93)90018-V",
    doi: "10.1016/0895-4356(93)90018-V",
    implemented: "The prevalence-adjusted bias-adjusted kappa PABAK = (q p_o - 1)/(q - 1) and, for two categories, the prevalence index |a - d|/N and bias index |b - c|/N, to explain a low kappa beside high raw agreement.",
    deviations: "PABAK for more than two categories uses the q-category generalisation; it is reported, not recommended.",
  },
  {
    authors: "Richard J. Light",
    title: "Measures of response agreement for qualitative data: some generalizations and alternatives",
    venue: "Psychological Bulletin 76(5), 365-377",
    year: 1971,
    url: "https://doi.org/10.1037/h0031643",
    doi: "10.1037/h0031643",
    implemented: "The mean of Cohen's kappa over every pair of raters, as a many-rater summary beside the pairwise table.",
    deviations: "Pairs that share fewer than five subjects are left out of the mean.",
  },
];

export const DEFAULTS = {
  layout: "auto", // auto | wide | long | counts
  scale: "auto", // auto | nominal | ordinal | interval | ratio
  idColumn: "auto", // wide layout: a column of subject ids, "auto" (by name) or "none"
  categories: null, // ordered list of the possible categories, e.g. ["low","medium","high"]
  confidence: 0.95,
  bootstrap: 1000,
  seed: 1,
};

export const SCALES = ["nominal", "ordinal", "interval", "ratio"];
const MAX_SUBJECTS = 20000;
const MAX_RATERS = 500;
const MAX_KAPPA_CATEGORIES = 60;
const MISSING = new Set(["", "na", "n/a", "nan", "null", "none", ".", "-", "?", "missing", "#n/a"]);

// ---------- input ----------

function splitLine(line, delim) {
  if (delim === "ws") return line.trim().split(/\s+/);
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseCsv(text) {
  const lines = String(text ?? "")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && !/^\s*#/.test(l));
  if (lines.length < 2) throw new Error("Paste a header row and at least a few rows of ratings.");
  const head = lines[0];
  const counts = { ",": (head.match(/,/g) || []).length, "\t": (head.match(/\t/g) || []).length, ";": (head.match(/;/g) || []).length };
  let delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (counts[delim] === 0) delim = "ws";
  const header = splitLine(head, delim).map((h, i) => h || `column ${i + 1}`);
  const rows = lines.slice(1).map((l) => splitLine(l, delim));
  return { header, rows };
}

export function isMissing(v) {
  return v == null || (typeof v === "number" && !Number.isFinite(v)) || MISSING.has(String(v).trim().toLowerCase());
}

export function toNumber(s) {
  if (s == null) return NaN;
  if (typeof s === "number") return s;
  const t = String(s).trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

const ID_NAME = /^(id|ids|subject|subjects|subject_id|item|items|item_id|unit|units|case|case_id|participant|participant_id|patient|patient_id|sample|sample_id|target|text|comment|comment_id|doc|doc_id|document|row|record|image|image_id|question|response_id)$/i;
const RATER_NAME = /(rater|coder|annotator|judge|observer|worker|reader|assessor|reviewer|examiner|scorer|grader|labeller|labeler)/i;
const RATING_NAME = /(rating|label|score|code|category|grade|value|response|class|sentiment|diagnosis|answer)/i;

function guessLayout(header) {
  if (header.length === 3) {
    const rater = header.findIndex((h) => RATER_NAME.test(h) && !RATING_NAME.test(h.replace(RATER_NAME, "")));
    if (rater >= 0) return "long";
  }
  return "wide";
}

// Turn any accepted input into { subjects: [{id, values: [raw per rater]}], raters: [names] }
// or { counts: [[...]], categories, ids } for the counts layout.
export function readTable(input = {}) {
  const o = { ...DEFAULTS, ...input };
  if (o.csv != null) {
    const { header, rows } = parseCsv(o.csv);
    const layout = o.layout === "auto" ? guessLayout(header) : o.layout;
    if (layout === "long") return readLong(header, rows, o);
    if (layout === "counts") return readCounts(header, rows, o);
    if (layout !== "wide") throw new Error(`Unknown layout "${layout}": use auto, wide, long or counts.`);
    let idCol = -1;
    if (o.idColumn && o.idColumn !== "auto" && o.idColumn !== "none") {
      idCol = header.indexOf(o.idColumn);
      if (idCol < 0) throw new Error(`No column named "${o.idColumn}". Columns: ${header.join(", ")}.`);
    } else if (o.idColumn === "auto") idCol = header.findIndex((h) => ID_NAME.test(h.trim()));
    const raterCols = header.map((_, i) => i).filter((i) => i !== idCol);
    if (raterCols.length < 2) throw new Error("Need at least two rater columns (one column per rater, one row per subject).");
    const subjects = rows.map((r, i) => ({ id: idCol >= 0 ? r[idCol] ?? `row ${i + 1}` : `row ${i + 1}`, values: raterCols.map((c) => r[c] ?? "") }));
    return { layout: "wide", raters: raterCols.map((c) => header[c]), subjects, idColumn: idCol >= 0 ? header[idCol] : null, warnings: [] };
  }
  if (Array.isArray(o.counts)) {
    const categories = Array.isArray(o.categories) ? o.categories.map(String) : o.counts[0].map((_, j) => String(j + 1));
    return countsResult(o.counts.map((r) => r.map(Number)), categories, o.counts.map((_, i) => `row ${i + 1}`), []);
  }
  if (Array.isArray(o.long)) {
    const header = ["item", "rater", "rating"];
    return readLong(header, o.long.map((r) => (Array.isArray(r) ? r : [r.item ?? r.subject, r.rater, r.rating ?? r.value ?? r.label])), { ...o, itemColumn: "item", raterColumn: "rater", ratingColumn: "rating" });
  }
  const ratings = o.ratings ?? o.data;
  if (Array.isArray(ratings)) {
    const R = Math.max(0, ...ratings.map((r) => (Array.isArray(r) ? r.length : 0)));
    if (R < 2) throw new Error('"ratings" must be rows of subjects with one entry per rater (at least two raters).');
    const raters = Array.isArray(o.raters) ? o.raters.map(String) : Array.from({ length: R }, (_, j) => `rater ${j + 1}`);
    if (raters.length !== R) throw new Error(`"raters" names ${raters.length} raters but the rows have ${R} entries.`);
    const ids = Array.isArray(o.ids) ? o.ids : null;
    return { layout: "wide", raters, subjects: ratings.map((r, i) => ({ id: ids ? String(ids[i]) : `row ${i + 1}`, values: Array.from({ length: R }, (_, j) => (Array.isArray(r) ? r[j] ?? null : null)) })), idColumn: null, warnings: [] };
  }
  throw new Error('Give {"csv": "..."}, {"ratings": [[r1, r2, ...], ...]} (one row per subject, one entry per rater), {"long": [{"item","rater","rating"}, ...]} or {"counts": [[...]], "categories": [...]}.');
}

function readLong(header, rows, o) {
  const find = (name, fallback) => {
    if (name) {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`No column named "${name}". Columns: ${header.join(", ")}.`);
      return i;
    }
    return fallback;
  };
  if (header.length < 3) throw new Error("The long layout needs three columns: subject, rater, rating.");
  let rCol = header.findIndex((h) => RATER_NAME.test(h));
  if (rCol < 0) rCol = 1;
  const raterCol = find(o.raterColumn, rCol);
  const rest = header.map((_, i) => i).filter((i) => i !== raterCol);
  const itemCol = find(o.itemColumn, rest.find((i) => ID_NAME.test(header[i].trim())) ?? rest[0]);
  const ratingCol = find(o.ratingColumn, rest.find((i) => i !== itemCol));
  const raterIndex = new Map();
  const itemIndex = new Map();
  const cells = [];
  let dup = 0;
  for (const r of rows) {
    const item = r[itemCol] ?? "";
    const rater = r[raterCol] ?? "";
    if (item === "" || rater === "") continue;
    if (!raterIndex.has(rater)) raterIndex.set(rater, raterIndex.size);
    if (!itemIndex.has(item)) itemIndex.set(item, itemIndex.size);
    cells.push([itemIndex.get(item), raterIndex.get(rater), r[ratingCol] ?? ""]);
  }
  const R = raterIndex.size;
  if (R > MAX_RATERS) throw new Error(`Up to ${MAX_RATERS} raters; found ${R}.`);
  const subjects = [...itemIndex.keys()].map((id) => ({ id, values: new Array(R).fill("") }));
  const filled = subjects.map(() => new Set());
  for (const [i, j, v] of cells) {
    if (filled[i].has(j)) {
      dup++;
      continue;
    }
    filled[i].add(j);
    subjects[i].values[j] = v;
  }
  const warnings = dup ? [`${dup} repeated subject-rater pair${dup === 1 ? " was" : "s were"} found; the first rating of each was kept.`] : [];
  return { layout: "long", raters: [...raterIndex.keys()], subjects, idColumn: header[itemCol], columns: { item: header[itemCol], rater: header[raterCol], rating: header[ratingCol] }, warnings };
}

function readCounts(header, rows, o) {
  let idCol = o.idColumn && o.idColumn !== "auto" && o.idColumn !== "none" ? header.indexOf(o.idColumn) : o.idColumn === "auto" ? header.findIndex((h) => ID_NAME.test(h.trim())) : -1;
  if (idCol < 0 && rows.length && rows.every((r) => !Number.isFinite(toNumber(r[0])))) idCol = 0;
  const catCols = header.map((_, i) => i).filter((i) => i !== idCol);
  const counts = rows.map((r) => catCols.map((c) => (isMissing(r[c]) ? 0 : toNumber(r[c]))));
  return countsResult(counts, catCols.map((c) => header[c]), rows.map((r, i) => (idCol >= 0 ? r[idCol] : `row ${i + 1}`)), []);
}

function countsResult(counts, categories, ids, warnings) {
  for (const row of counts) {
    if (row.length !== categories.length) throw new Error("Every row of the counts table needs one count per category.");
    for (const v of row) if (!(Number.isInteger(v) && v >= 0)) throw new Error(`Counts must be whole numbers of raters, 0 or more; found "${v}".`);
  }
  return { layout: "counts", categories, counts, ids, raters: null, warnings };
}

// ---------- maths helpers ----------

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularised incomplete beta I_x(a, b) by its continued fraction (modified
// Lentz), using the symmetry I_x(a,b) = 1 - I_(1-x)(b,a) where it converges faster.
function betaCf(a, b, x) {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 3000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
export function betaInc(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lbt) * betaCf(a, b, x)) / a;
  return 1 - (Math.exp(lbt) * betaCf(b, a, 1 - x)) / b;
}
export function fCdf(f, d1, d2) {
  if (!(f > 0)) return 0;
  return betaInc((d1 * f) / (d1 * f + d2), d1 / 2, d2 / 2);
}
export function fSf(f, d1, d2) {
  if (!(f > 0)) return 1;
  return betaInc(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}
// F quantile by bisection on the CDF (monotone), in log space for range.
export function fPpf(p, d1, d2) {
  if (!(p > 0 && p < 1)) throw new Error("fPpf needs 0 < p < 1");
  let lo = -60;
  let hi = 60;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (fCdf(Math.exp(mid), d1, d2) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-13) break;
  }
  return Math.exp((lo + hi) / 2);
}

export function normSf(z) {
  // erfc via the incomplete beta is overkill; use a high-precision erfc series/continued fraction.
  const x = Math.abs(z) / Math.SQRT2;
  let erfc;
  if (x < 2.5) {
    // erf series
    let sum = x;
    let term = x;
    for (let n = 1; n < 200; n++) {
      term *= (-x * x) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    erfc = 1 - (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    // continued fraction for erfc
    let f = 0;
    for (let n = 60; n >= 1; n--) f = (n / 2) / (x + f);
    erfc = Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
  }
  const q = erfc / 2;
  return z >= 0 ? q : 1 - q;
}
export function normPpf(p) {
  if (!(p > 0 && p < 1)) throw new Error("normPpf needs 0 < p < 1");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - 0.02425) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = 1 - normSf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// Seeded generator (mulberry32), so every interval is reproducible.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantileSorted(a, p) {
  if (!a.length) return NaN;
  const h = (a.length - 1) * p;
  const lo = Math.floor(h);
  return a[lo] + (h - lo) * ((a[Math.min(lo + 1, a.length - 1)] ?? a[lo]) - a[lo]);
}

// ---------- coding: raw ratings to category indices ----------

// categories: sorted list of distinct values (numbers ascending when all
// numeric, the given order when `categories` is set, else first appearance).
export function codeRatings(table, o = {}) {
  const given = Array.isArray(o.categories) && o.categories.length ? o.categories.map((c) => String(c).trim()) : null;
  const raw = [];
  for (const s of table.subjects) for (const v of s.values) if (!isMissing(v)) raw.push(String(v).trim());
  const distinct = [...new Set(raw)];
  const numeric = distinct.length > 0 && distinct.every((v) => Number.isFinite(toNumber(v)));
  let categories;
  if (given) {
    const unknown = distinct.filter((v) => !given.includes(v));
    if (unknown.length) throw new Error(`Ratings not in the category list: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? ", ..." : ""}.`);
    categories = given;
  } else if (numeric) {
    const byNum = new Map();
    for (const v of distinct) {
      const n = toNumber(v);
      if (!byNum.has(n)) byNum.set(n, v);
    }
    categories = [...byNum.keys()].sort((a, b) => a - b).map((n) => byNum.get(n));
  } else categories = distinct;
  const index = new Map(categories.map((c, i) => [c, i]));
  if (numeric && !given) for (const v of distinct) index.set(v, categories.findIndex((c) => toNumber(c) === toNumber(v)));
  const values = categories.map((c) => toNumber(c));
  const codes = table.subjects.map((s) => s.values.map((v) => (isMissing(v) ? -1 : index.get(String(v).trim()))));
  return { categories, values, numeric: numeric || (given ? given.every((c) => Number.isFinite(toNumber(c))) : false), codes, given: Boolean(given) };
}

// Subject x category counts from codes (rows of rater codes, -1 missing).
function countsFromCodes(codes, q) {
  return codes.map((row) => {
    const c = new Array(q).fill(0);
    for (const k of row) if (k >= 0) c[k]++;
    return c;
  });
}

// ---------- Krippendorff's alpha ----------

// Precompute what each unit contributes, so bootstrap replicates are sums.
export function alphaPrep(counts, values, metric) {
  const q = values.length;
  const units = [];
  for (const row of counts) {
    let m = 0;
    const cats = [];
    const cnt = [];
    for (let k = 0; k < q; k++)
      if (row[k] > 0) {
        cats.push(k);
        cnt.push(row[k]);
        m += row[k];
      }
    if (m < 2) {
      units.push(null);
      continue;
    }
    let du = 0; // sum over unordered value pairs within the unit of delta, / (m - 1); fixed metrics only
    if (metric === "nominal") {
      let sq = 0;
      for (const c of cnt) sq += c * c;
      du = (m * m - sq) / 2 / (m - 1);
    } else if (metric === "interval") {
      let s1 = 0;
      let s2 = 0;
      for (let a = 0; a < cats.length; a++) {
        s1 += cnt[a] * values[cats[a]];
        s2 += cnt[a] * values[cats[a]] ** 2;
      }
      du = (m * s2 - s1 * s1) / (m - 1);
    } else if (metric === "ratio") {
      for (let a = 0; a < cats.length; a++)
        for (let b = a + 1; b < cats.length; b++) du += cnt[a] * cnt[b] * ratioDelta(values[cats[a]], values[cats[b]]);
      du /= m - 1;
    }
    units.push({ m, cats, cnt, du });
  }
  return { q, values, metric, units };
}

function ratioDelta(a, b) {
  const s = a + b;
  return s === 0 ? 0 : ((a - b) / s) ** 2;
}

// alpha for one weighting of the units (w[i] = how many times unit i is drawn; null = once each).
export function alphaFromPrep(prep, w = null) {
  const { q, values, metric, units } = prep;
  const nc = new Float64Array(q);
  let n = 0;
  let Do = 0;
  const ordPairs = metric === "ordinal" ? new Float64Array(q * q) : null;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const wi = w ? w[i] : 1;
    if (!u || !wi) continue;
    n += wi * u.m;
    for (let a = 0; a < u.cats.length; a++) nc[u.cats[a]] += wi * u.cnt[a];
    if (ordPairs) {
      for (let a = 0; a < u.cats.length; a++)
        for (let b = a + 1; b < u.cats.length; b++) ordPairs[u.cats[a] * q + u.cats[b]] += (wi * u.cnt[a] * u.cnt[b]) / (u.m - 1);
    } else Do += wi * u.du;
  }
  if (n < 2) return { alpha: NaN, n, Do: NaN, De: NaN };
  let De = 0;
  if (metric === "nominal") {
    let sq = 0;
    for (let k = 0; k < q; k++) sq += nc[k] * nc[k];
    De = (n * n - sq) / 2;
  } else if (metric === "interval") {
    let s1 = 0;
    let s2 = 0;
    for (let k = 0; k < q; k++) {
      s1 += nc[k] * values[k];
      s2 += nc[k] * values[k] ** 2;
    }
    De = n * s2 - s1 * s1;
  } else {
    const used = [];
    for (let k = 0; k < q; k++) if (nc[k] > 0) used.push(k);
    let delta;
    if (metric === "ordinal") {
      const cum = new Float64Array(q + 1);
      for (let k = 0; k < q; k++) cum[k + 1] = cum[k] + nc[k];
      delta = (c, k) => (cum[k + 1] - cum[c] - (nc[c] + nc[k]) / 2) ** 2;
      for (let c = 0; c < q; c++) for (let k = c + 1; k < q; k++) if (ordPairs[c * q + k]) Do += ordPairs[c * q + k] * delta(c, k);
    } else delta = (c, k) => ratioDelta(values[c], values[k]);
    for (let a = 0; a < used.length; a++) for (let b = a + 1; b < used.length; b++) De += nc[used[a]] * nc[used[b]] * delta(used[a], used[b]);
  }
  // alpha = 1 - D_o / D_e with D_o = (1/n) sum o_ck delta and D_e = sum n_c n_k delta / (n (n - 1)).
  return { alpha: De > 0 ? 1 - ((n - 1) * Do) / De : NaN, n, Do: Do / n, De: De / (n * (n - 1)) };
}

export function krippendorffAlpha(counts, values, metric = "nominal") {
  return alphaFromPrep(alphaPrep(counts, values, metric)).alpha;
}

// ---------- Fleiss' kappa and Gwet's AC1/AC2 (generalised, missing allowed) ----------

export function weightMatrix(q, kind = "identity", values = null) {
  const W = [];
  const pos = values && values.every(Number.isFinite) ? values : Array.from({ length: q }, (_, i) => i);
  const range = Math.max(...pos) - Math.min(...pos) || 1;
  for (let k = 0; k < q; k++) {
    W.push([]);
    for (let l = 0; l < q; l++) {
      if (kind === "identity") W[k].push(k === l ? 1 : 0);
      else if (kind === "linear") W[k].push(1 - Math.abs(pos[k] - pos[l]) / range);
      else if (kind === "quadratic") W[k].push(1 - ((pos[k] - pos[l]) / range) ** 2);
      else throw new Error(`Unknown weights "${kind}".`);
    }
  }
  return W;
}

export function chancePrep(counts, W) {
  const q = W.length;
  return counts.map((row) => {
    let r = 0;
    for (const v of row) r += v;
    if (r < 1) return null;
    const pi = row.map((v) => v / r);
    let pa = null;
    if (r >= 2) {
      pa = 0;
      for (let k = 0; k < q; k++) {
        if (!row[k]) continue;
        let rs = 0;
        for (let l = 0; l < q; l++) rs += W[k][l] * row[l];
        pa += (row[k] * (rs - 1)) / (r * (r - 1));
      }
    }
    return { pa, pi };
  });
}

export function chanceFromPrep(prep, W, w = null) {
  const q = W.length;
  let pa = 0;
  let n2 = 0;
  let n1 = 0;
  const pi = new Float64Array(q);
  for (let i = 0; i < prep.length; i++) {
    const s = prep[i];
    const wi = w ? w[i] : 1;
    if (!s || !wi) continue;
    n1 += wi;
    for (let k = 0; k < q; k++) pi[k] += wi * s.pi[k];
    if (s.pa != null) {
      pa += wi * s.pa;
      n2 += wi;
    }
  }
  if (!n2) return { pa: NaN, fleiss: NaN, gwet: NaN };
  pa /= n2;
  for (let k = 0; k < q; k++) pi[k] /= n1;
  let peF = 0;
  let tw = 0;
  let pq = 0;
  for (let k = 0; k < q; k++) {
    pq += pi[k] * (1 - pi[k]);
    for (let l = 0; l < q; l++) {
      peF += W[k][l] * pi[k] * pi[l];
      tw += W[k][l];
    }
  }
  const peG = q > 1 ? (tw / (q * (q - 1))) * pq : NaN;
  const k1 = (pa - peF) / (1 - peF);
  const k2 = (pa - peG) / (1 - peG);
  return { pa, peFleiss: peF, peGwet: peG, fleiss: Number.isFinite(k1) ? k1 : NaN, gwet: Number.isFinite(k2) ? k2 : NaN, pi: [...pi] };
}

export function fleissKappa(counts, W = null) {
  const q = counts[0].length;
  W = W || weightMatrix(q);
  return chanceFromPrep(chancePrep(counts, W), W).fleiss;
}
export function gwetAC(counts, W = null) {
  const q = counts[0].length;
  W = W || weightMatrix(q);
  return chanceFromPrep(chancePrep(counts, W), W).gwet;
}

// ---------- Cohen's kappa for two raters ----------

// a, b: category indices (>= 0) for the subjects both rated; W agreement weights.
export function cohenKappa(a, b, q, W = null, confidence = 0.95) {
  W = W || weightMatrix(q);
  const N = a.length;
  if (N < 2) return null;
  const p = Array.from({ length: q }, () => new Float64Array(q));
  for (let i = 0; i < N; i++) p[a[i]][b[i]] += 1 / N;
  const row = new Float64Array(q);
  const col = new Float64Array(q);
  for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) {
    row[i] += p[i][j];
    col[j] += p[i][j];
  }
  let po = 0;
  let pe = 0;
  for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) {
    po += W[i][j] * p[i][j];
    pe += W[i][j] * row[i] * col[j];
  }
  const kappa = pe < 1 ? (po - pe) / (1 - pe) : NaN;
  const wRow = new Float64Array(q); // wbar_i. = sum_j p_.j w_ij
  const wCol = new Float64Array(q); // wbar_.j = sum_i p_i. w_ij
  for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) {
    wRow[i] += col[j] * W[i][j];
    wCol[j] += row[i] * W[i][j];
  }
  let s = 0;
  let s0 = 0;
  for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) {
    s += p[i][j] * (W[i][j] - (wRow[i] + wCol[j]) * (1 - kappa)) ** 2;
    s0 += row[i] * col[j] * (W[i][j] - (wRow[i] + wCol[j])) ** 2;
  }
  const v = (s - (kappa - pe * (1 - kappa)) ** 2) / (N * (1 - pe) ** 2);
  const v0 = (s0 - pe * pe) / (N * (1 - pe) ** 2);
  const se = Math.sqrt(Math.max(v, 0));
  const se0 = Math.sqrt(Math.max(v0, 0));
  const z = normPpf(1 - (1 - confidence) / 2);
  const zstat = se0 > 0 ? kappa / se0 : NaN;
  return {
    n: N,
    kappa,
    po,
    pe,
    se,
    se0,
    low: Math.max(-1, kappa - z * se),
    high: Math.min(1, kappa + z * se),
    z: zstat,
    p: Number.isFinite(zstat) ? 2 * normSf(Math.abs(zstat)) : NaN,
  };
}

// ---------- intraclass correlations ----------

export function icc(matrix, confidence = 0.95) {
  const n = matrix.length;
  const k = matrix[0].length;
  if (n < 3 || k < 2) return null;
  let gm = 0;
  const rm = new Float64Array(n);
  const cm = new Float64Array(k);
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) {
    gm += matrix[i][j];
    rm[i] += matrix[i][j] / k;
    cm[j] += matrix[i][j] / n;
  }
  gm /= n * k;
  let sst = 0;
  let ssr = 0;
  let ssc = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) sst += (matrix[i][j] - gm) ** 2;
  for (let i = 0; i < n; i++) ssr += k * (rm[i] - gm) ** 2;
  for (let j = 0; j < k; j++) ssc += n * (cm[j] - gm) ** 2;
  const sse = Math.max(sst - ssr - ssc, 0);
  const ssw = Math.max(sst - ssr, 0);
  const msr = ssr / (n - 1);
  const msc = ssc / (k - 1);
  const mse = sse / ((n - 1) * (k - 1));
  const msw = ssw / (n * (k - 1));
  const a = 1 - confidence;
  const fq = (d1, d2) => fPpf(1 - a / 2, d1, d2);
  const out = [];
  // One-way random: ICC(1,1) and ICC(1,k).
  {
    const F = msr / msw;
    const d1 = n - 1;
    const d2 = n * (k - 1);
    const FL = F / fq(d1, d2);
    const FU = F * fq(d2, d1);
    out.push({ key: "ICC1", name: "ICC(1,1)", model: "one-way random", type: "single rater", value: (msr - msw) / (msr + (k - 1) * msw), F, df1: d1, df2: d2, p: fSf(F, d1, d2), low: (FL - 1) / (FL + k - 1), high: (FU - 1) / (FU + k - 1) });
    out.push({ key: "ICC1k", name: `ICC(1,${k})`, model: "one-way random", type: `mean of ${k} raters`, value: (msr - msw) / msr, F, df1: d1, df2: d2, p: fSf(F, d1, d2), low: 1 - 1 / FL, high: 1 - 1 / FU });
  }
  // Two-way random, absolute agreement: ICC(2,1) and ICC(2,k).
  const icc2 = (msr - mse) / (msr + (k - 1) * mse + (k * (msc - mse)) / n);
  {
    const F = msr / mse;
    const d1 = n - 1;
    const d2 = (n - 1) * (k - 1);
    const A = (k * icc2) / (n * (1 - icc2));
    const B = 1 + (k * icc2 * (n - 1)) / (n * (1 - icc2));
    const v = (A * msc + B * mse) ** 2 / ((A * msc) ** 2 / (k - 1) + (B * mse) ** 2 / ((n - 1) * (k - 1)));
    const F3 = fq(n - 1, v);
    const F4 = fq(v, n - 1);
    const L = (n * (msr - F3 * mse)) / (F3 * (k * msc + (k * n - k - n) * mse) + n * msr);
    const U = (n * (F4 * msr - mse)) / (k * msc + (k * n - k - n) * mse + n * F4 * msr);
    out.push({ key: "ICC2", name: "ICC(2,1)", model: "two-way random, absolute agreement", type: "single rater", value: icc2, F, df1: d1, df2: d2, p: fSf(F, d1, d2), low: L, high: U, dfSatterthwaite: v });
    out.push({ key: "ICC2k", name: `ICC(2,${k})`, model: "two-way random, absolute agreement", type: `mean of ${k} raters`, value: (msr - mse) / (msr + (msc - mse) / n), F, df1: d1, df2: d2, p: fSf(F, d1, d2), low: (L * k) / (1 + L * (k - 1)), high: (U * k) / (1 + U * (k - 1)) });
  }
  // Two-way mixed, consistency: ICC(3,1) and ICC(3,k).
  {
    const F = msr / mse;
    const d1 = n - 1;
    const d2 = (n - 1) * (k - 1);
    const FL = F / fq(d1, d2);
    const FU = F * fq(d2, d1);
    out.push({ key: "ICC3", name: "ICC(3,1)", model: "two-way mixed, consistency", type: "single rater", value: (msr - mse) / (msr + (k - 1) * mse), F, df1: d1, df2: d2, p: fSf(F, d1, d2), low: (FL - 1) / (FL + k - 1), high: (FU - 1) / (FU + k - 1) });
    out.push({ key: "ICC3k", name: `ICC(3,${k})`, model: "two-way mixed, consistency", type: `mean of ${k} raters`, value: (msr - mse) / msr, F, df1: d1, df2: d2, p: fSf(F, d1, d2), low: 1 - 1 / FL, high: 1 - 1 / FU });
  }
  return { n, k, ms: { rows: msr, raters: msc, error: mse, within: msw }, raterMeans: [...cm], forms: out };
}

// ---------- labels ----------

export function landisKoch(k) {
  if (!Number.isFinite(k)) return "undefined";
  if (k < 0) return "poor (less than chance)";
  if (k <= 0.2) return "slight";
  if (k <= 0.4) return "fair";
  if (k <= 0.6) return "moderate";
  if (k <= 0.8) return "substantial";
  return "almost perfect";
}
export function kooLi(v) {
  if (!Number.isFinite(v)) return "undefined";
  if (v < 0.5) return "poor";
  if (v < 0.75) return "moderate";
  if (v < 0.9) return "good";
  return "excellent";
}
export function krippendorffVerdict(a) {
  if (!Number.isFinite(a)) return "undefined";
  if (a >= 0.8) return "meets Krippendorff's 0.800 standard";
  if (a >= 0.667) return "tentative conclusions only (between 0.667 and 0.800)";
  return "below Krippendorff's 0.667 minimum";
}

// ---------- formatting ----------

export const fmt = (v, digits = 3) => {
  if (v == null || !Number.isFinite(v)) return "n/a";
  return v.toFixed(digits);
};
export function fmtP(p) {
  if (p == null || !Number.isFinite(p)) return "n/a";
  if (p < 1e-300) return "< 1e-300";
  if (p < 1e-4) return p.toExponential(1);
  if (p < 0.001) return p.toFixed(5).replace(/0+$/, "");
  return p < 0.01 ? p.toFixed(4) : p.toFixed(3);
}

// ---------- top level ----------

function bootstrapCI(nUnits, B, seed, stat, confidence) {
  const r = rng(seed);
  const vals = [];
  const w = new Float64Array(nUnits);
  for (let b = 0; b < B; b++) {
    w.fill(0);
    for (let i = 0; i < nUnits; i++) w[Math.floor(r() * nUnits)]++;
    const v = stat(w);
    if (Number.isFinite(v)) vals.push(v);
  }
  vals.sort((x, y) => x - y);
  const a = (1 - confidence) / 2;
  return { low: quantileSorted(vals, a), high: quantileSorted(vals, 1 - a), replicates: vals.length, below: (t) => vals.filter((v) => v < t).length / (vals.length || 1) };
}

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  if (o.scale !== "auto" && !SCALES.includes(o.scale)) throw new Error(`Unknown scale "${o.scale}": use auto, ${SCALES.join(", ")}.`);
  if (!(o.confidence > 0.5 && o.confidence < 1)) throw new Error("confidence must be between 0.5 and 1, for example 0.95.");
  const B = Math.floor(Number(o.bootstrap));
  if (!(B >= 0 && B <= 20000)) throw new Error("bootstrap must be a whole number from 0 (off) to 20000.");
  if (typeof o.categories === "string") o.categories = o.categories.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  const table = readTable(o);
  const warnings = [...table.warnings];

  // Codes and counts.
  let categories, values, numeric, codes = null, counts;
  if (table.layout === "counts") {
    categories = table.categories;
    values = categories.map((c) => toNumber(c));
    numeric = values.every(Number.isFinite);
    counts = table.counts;
  } else {
    if (table.raters.length > MAX_RATERS) throw new Error(`Up to ${MAX_RATERS} raters; found ${table.raters.length}.`);
    const coded = codeRatings(table, o);
    ({ categories, values, numeric, codes } = coded);
    counts = countsFromCodes(codes, categories.length);
  }
  const nSubjects = counts.length;
  if (nSubjects > MAX_SUBJECTS) throw new Error(`Up to ${MAX_SUBJECTS.toLocaleString("en-US")} subjects; found ${nSubjects.toLocaleString("en-US")}.`);
  const q = categories.length;
  if (q < 1) throw new Error("No ratings found: every cell is empty or a missing-value marker.");
  const perSubject = counts.map((r) => r.reduce((s, v) => s + v, 0));
  const nRatings = perSubject.reduce((s, v) => s + v, 0);
  const pairable = perSubject.filter((m) => m >= 2).length;
  if (pairable < 2) throw new Error(`Agreement needs at least two subjects rated by two or more raters; found ${pairable}.`);

  // Scale.
  let scale = o.scale;
  let scaleReason = "as chosen";
  if (scale === "auto") {
    const allInt = numeric && values.every((v) => Number.isInteger(v));
    if (o.categories && o.categories.length) [scale, scaleReason] = ["ordinal", "a category order was given"];
    else if (!numeric) [scale, scaleReason] = ["nominal", "the ratings are labels, not numbers"];
    else if (allInt && q <= 10) [scale, scaleReason] = ["ordinal", `the ratings are ${q} whole-number levels`];
    else [scale, scaleReason] = ["interval", "the ratings are numbers with many levels"];
  }
  if ((scale === "interval" || scale === "ratio") && !numeric) throw new Error(`The ${scale} scale needs numeric ratings; these include labels such as "${categories.find((c) => !Number.isFinite(toNumber(c)))}". Use nominal or ordinal.`);
  if (scale === "ratio" && values.some((v) => v < 0)) throw new Error("The ratio scale needs ratings of 0 or more.");
  const categorical = scale === "nominal" || scale === "ordinal";

  const confidence = o.confidence;
  const coefficients = [];
  const prepA = alphaPrep(counts, values, scale);
  const alpha = alphaFromPrep(prepA);
  const bootCost = Math.max(1, nRatings + (scale === "ordinal" || scale === "ratio" ? q * q : q));
  const Beff = Math.min(B, Math.max(0, Math.floor(4e8 / bootCost / Math.max(1, nSubjects / 50))));
  if (Beff < B) warnings.push(`The bootstrap was cut from ${B} to ${Beff} replicates to keep the page responsive with ${q} distinct values.`);
  const bootA = Beff > 0 ? bootstrapCI(nSubjects, Beff, o.seed, (w) => alphaFromPrep(prepA, w).alpha, confidence) : null;
  coefficients.push({
    key: "alpha",
    name: `Krippendorff's alpha (${scale})`,
    value: alpha.alpha,
    low: bootA ? bootA.low : NaN,
    high: bootA ? bootA.high : NaN,
    interval: bootA ? `bootstrap over subjects, ${bootA.replicates} replicates` : "none",
    probBelow667: bootA ? bootA.below(0.667) : null,
    probBelow800: bootA ? bootA.below(0.8) : null,
    label: krippendorffVerdict(alpha.alpha),
    observedDisagreement: alpha.Do,
    expectedDisagreement: alpha.De,
    pairableValues: alpha.n,
  });

  // Kappa family (categorical, or numeric with few levels).
  const kappaOk = categorical && q >= 2 && q <= MAX_KAPPA_CATEGORIES;
  const weightsKind = scale === "nominal" ? "identity" : "quadratic";
  const Wkind = weightMatrix(q, weightsKind, scale === "ordinal" ? null : values);
  let percentAgreement = null;
  let perCategory = null;
  if (kappaOk) {
    const prepC = chancePrep(counts, Wkind);
    const base = chanceFromPrep(prepC, Wkind);
    const bootC = Beff > 0 ? (() => {
      const store = [];
      const ci = bootstrapCI(nSubjects, Beff, o.seed + 1, (w) => {
        const r = chanceFromPrep(prepC, Wkind, w);
        store.push(r.gwet);
        return r.fleiss;
      }, confidence);
      const g = store.filter(Number.isFinite).sort((x, y) => x - y);
      const a = (1 - confidence) / 2;
      return { fleiss: ci, gwet: { low: quantileSorted(g, a), high: quantileSorted(g, 1 - a), replicates: g.length } };
    })() : null;
    const wtxt = weightsKind === "identity" ? "" : ", quadratic weights";
    coefficients.push({ key: "fleiss", name: `Fleiss' kappa${wtxt}`, value: base.fleiss, low: bootC ? bootC.fleiss.low : NaN, high: bootC ? bootC.fleiss.high : NaN, interval: bootC ? `bootstrap over subjects, ${bootC.fleiss.replicates} replicates` : "none", label: landisKoch(base.fleiss), pa: base.pa, pe: base.peFleiss });
    coefficients.push({ key: "gwet", name: weightsKind === "identity" ? "Gwet's AC1" : "Gwet's AC2 (quadratic weights)", value: base.gwet, low: bootC ? bootC.gwet.low : NaN, high: bootC ? bootC.gwet.high : NaN, interval: bootC ? `bootstrap over subjects, ${bootC.gwet.replicates} replicates` : "none", label: landisKoch(base.gwet), pa: base.pa, pe: base.peGwet });
    const unweighted = weightsKind === "identity" ? base : chanceFromPrep(chancePrep(counts, weightMatrix(q)), weightMatrix(q));
    percentAgreement = unweighted.pa;
    // Per-category kappa: each category against the rest.
    if (q > 2 || scale === "nominal") {
      perCategory = categories.map((c, k) => {
        const bin = counts.map((row) => {
          const r = row.reduce((s, v) => s + v, 0);
          return [row[k], r - row[k]];
        });
        const used = bin.reduce((s, b) => s + b[0], 0);
        return { category: c, ratings: used, share: used / nRatings, kappa: used ? fleissKappa(bin) : NaN };
      });
    }
  }

  // Rater-level views need rater identity.
  let cohen = null;
  let pairwise = null;
  let dropOne = null;
  let iccResult = null;
  const R = table.raters ? table.raters.length : 0;
  if (codes && R >= 2) {
    const ratedBy = table.raters.map((_, j) => codes.filter((row) => row[j] >= 0).length);
    const Wc = weightMatrix(q, scale === "nominal" ? "identity" : "quadratic", scale === "ordinal" ? null : values);
    const pairKappa = (j, l, W) => {
      const a = [];
      const b = [];
      for (const row of codes) if (row[j] >= 0 && row[l] >= 0) {
        a.push(row[j]);
        b.push(row[l]);
      }
      return a.length >= 2 ? { ...cohenKappa(a, b, q, W, confidence), a, b } : { n: a.length };
    };
    if (R === 2 && kappaOk) {
      const un = pairKappa(0, 1, weightMatrix(q));
      if (un.n >= 2) {
        const confusion = Array.from({ length: q }, () => new Array(q).fill(0));
        for (let i = 0; i < un.a.length; i++) confusion[un.a[i]][un.b[i]]++;
        const po = un.po;
        cohen = {
          n: un.n,
          raters: [...table.raters],
          unweighted: strip(un),
          linear: scale !== "nominal" && q > 2 ? strip(pairKappa(0, 1, weightMatrix(q, "linear", scale === "ordinal" ? null : values))) : null,
          quadratic: scale !== "nominal" && q > 2 ? strip(pairKappa(0, 1, weightMatrix(q, "quadratic", scale === "ordinal" ? null : values))) : null,
          confusion,
          pabak: (q * po - 1) / (q - 1),
        };
        if (q === 2) {
          const N = un.n;
          cohen.prevalenceIndex = Math.abs(confusion[0][0] - confusion[1][1]) / N;
          cohen.biasIndex = Math.abs(confusion[0][1] - confusion[1][0]) / N;
        }
        const main = cohen.quadratic || cohen.unweighted;
        coefficients.push({ key: "cohen", name: cohen.quadratic ? "Cohen's kappa, quadratic weights" : "Cohen's kappa", value: main.kappa, low: main.low, high: main.high, interval: "Fleiss-Cohen-Everitt large-sample", p: main.p, label: landisKoch(main.kappa) });
      }
    }
    if (R >= 3 && R <= 15 && kappaOk) {
      const pairs = [];
      for (let j = 0; j < R; j++) for (let l = j + 1; l < R; l++) {
        const k = pairKappa(j, l, Wc);
        pairs.push({ a: table.raters[j], b: table.raters[l], n: k.n, kappa: k.n >= 5 ? k.kappa : NaN });
      }
      const ok = pairs.filter((p) => Number.isFinite(p.kappa));
      pairwise = { weights: scale === "nominal" ? "none" : "quadratic", pairs, light: ok.length ? ok.reduce((s, p) => s + p.kappa, 0) / ok.length : NaN };
      if (ok.length) coefficients.push({ key: "light", name: `Light's kappa (mean of ${ok.length} pairwise Cohen's kappas${scale === "nominal" ? "" : ", quadratic weights"})`, value: pairwise.light, low: NaN, high: NaN, interval: "none", label: landisKoch(pairwise.light) });
    }
    if (R >= 3) {
      dropOne = table.raters.map((name, j) => {
        const c = countsFromCodes(codes.map((row) => row.map((v, l) => (l === j ? -1 : v))), q);
        const a = krippendorffAlpha(c, values, scale);
        return { rater: name, ratings: ratedBy[j], alphaWithout: a, change: a - alpha.alpha };
      });
    }
    // ICC: numeric ratings with every rater on every subject.
    if (numeric && scale !== "nominal" && R <= 50) {
      const complete = codes.filter((row) => row.every((v) => v >= 0));
      if (complete.length >= 3) {
        iccResult = icc(complete.map((row) => row.map((v) => values[v])), confidence);
        if (iccResult) {
          iccResult.dropped = nSubjects - complete.length;
          if (iccResult.dropped) warnings.push(`The intraclass correlations use the ${complete.length} subjects every rater rated; ${iccResult.dropped} with a missing rating were left out.`);
          const pick = iccResult.forms.find((f) => f.key === "ICC2");
          coefficients.push({ key: "icc", name: "ICC(2,1), two-way random, absolute agreement, single rater", value: pick.value, low: pick.low, high: pick.high, interval: "McGraw-Wong F-based", p: pick.p, label: kooLi(pick.value) });
        }
      } else if (R <= 50 && scale !== "ordinal") warnings.push("No intraclass correlation: fewer than three subjects were rated by every rater.");
    }
  }

  // Where raters disagree most: subjects ranked by their own agreement.
  const subjectRows = counts.map((row, i) => {
    const m = perSubject[i];
    let agree = NaN;
    if (m >= 2) {
      let s = 0;
      for (const v of row) s += v * (v - 1);
      agree = s / (m * (m - 1));
    }
    let modal = -1;
    for (let k = 0; k < q; k++) if (modal < 0 || row[k] > row[modal]) modal = k;
    let mean = NaN;
    let sd = NaN;
    if (numeric && m >= 1) {
      mean = row.reduce((s, v, k) => s + v * values[k], 0) / m;
      sd = m >= 2 ? Math.sqrt(row.reduce((s, v, k) => s + v * (values[k] - mean) ** 2, 0) / (m - 1)) : NaN;
    }
    return { id: table.layout === "counts" ? table.ids[i] : table.subjects[i].id, ratings: m, agreement: agree, modal: m ? categories[modal] : "", modalShare: m ? row[modal] / m : NaN, mean, sd, counts: row };
  });
  const contested = subjectRows
    .filter((s) => s.ratings >= 2)
    .sort((a, b) => (numeric && !categorical ? b.sd - a.sd : a.agreement - b.agreement) || b.ratings - a.ratings)
    .slice(0, 10);

  if (perSubject.some((m) => m === 1)) warnings.push(`${perSubject.filter((m) => m === 1).length} subject${perSubject.filter((m) => m === 1).length === 1 ? " has" : "s have"} only one rating and add nothing to agreement (they count only toward the category shares in Gwet's and Fleiss' chance terms).`);
  if (perSubject.some((m) => m === 0)) warnings.push(`${perSubject.filter((m) => m === 0).length} row${perSubject.filter((m) => m === 0).length === 1 ? " has" : "s have"} no ratings and were ignored.`);
  if (pairable < 30) warnings.push(`Only ${pairable} subjects have two or more ratings; intervals this wide are expected, and the bootstrap is rough below about 30.`);
  if (!kappaOk && categorical && q > MAX_KAPPA_CATEGORIES) warnings.push(`Kappa-type coefficients are skipped with ${q} categories (more than ${MAX_KAPPA_CATEGORIES}); alpha is still reported.`);

  const result = {
    layout: table.layout,
    scale,
    scaleReason,
    nSubjects,
    nPairable: pairable,
    nRaters: R || null,
    nRatings,
    missing: R ? nSubjects * R - nRatings : null,
    ratingsPerSubject: { min: Math.min(...perSubject), max: Math.max(...perSubject), mean: nRatings / nSubjects },
    categories: categories.map((c, k) => ({ category: c, ratings: counts.reduce((s, r) => s + r[k], 0) })),
    confidence,
    bootstrap: Beff,
    seed: o.seed,
    percentAgreement,
    coefficients,
    cohen,
    pairwise,
    dropOne,
    icc: iccResult,
    perCategory,
    contested,
    subjects: subjectRows,
    raters: table.raters,
    columns: table.columns ?? null,
    warnings,
  };
  result.summary = summarize(result);
  return result;
}

function strip(k) {
  if (!k || k.n < 2) return null;
  const { a, b, ...rest } = k;
  return rest;
}

export function summarize(r) {
  const parts = [];
  const a = r.coefficients.find((c) => c.key === "alpha");
  const who = r.nRaters ? `${r.nRaters} raters` : "the raters";
  parts.push(`${r.nRatings.toLocaleString("en-US")} ratings of ${r.nSubjects.toLocaleString("en-US")} subjects by ${who}, read as ${r.scale} (${r.scaleReason}).`);
  parts.push(`Krippendorff's alpha is ${fmt(a.value)}${Number.isFinite(a.low) ? `, ${Math.round(r.confidence * 100)}% interval ${fmt(a.low)} to ${fmt(a.high)}` : ""}: ${a.label}.`);
  if (a.probBelow800 != null && Number.isFinite(a.value)) parts.push(`In ${Math.round(a.probBelow800 * 100)}% of bootstrap replicates alpha fell below 0.800, and in ${Math.round(a.probBelow667 * 100)}% below 0.667.`);
  const cohen = r.coefficients.find((c) => c.key === "cohen");
  if (cohen) parts.push(`${cohen.name} is ${fmt(cohen.value)} (interval ${fmt(cohen.low)} to ${fmt(cohen.high)}), "${cohen.label}" on Landis and Koch's scale.`);
  const f = r.coefficients.find((c) => c.key === "fleiss");
  const g = r.coefficients.find((c) => c.key === "gwet");
  if (f && !cohen) parts.push(`${f.name} is ${fmt(f.value)}; ${g.name} is ${fmt(g.value)}.`);
  if (r.percentAgreement != null) {
    parts.push(`Two ratings of the same subject match ${Math.round(r.percentAgreement * 1000) / 10}% of the time.`);
    const k = cohen ? cohen.value : f ? f.value : NaN;
    if (g && Number.isFinite(k) && g.value - k > 0.15 && r.percentAgreement > 0.7) parts.push(`High raw agreement with a much lower kappa is the kappa paradox: one category dominates, so chance agreement is high. Gwet's coefficient (${fmt(g.value)}) is less affected; report both.`);
  }
  const iccC = r.coefficients.find((c) => c.key === "icc");
  if (iccC) parts.push(`ICC(2,1) is ${fmt(iccC.value)} (interval ${fmt(iccC.low)} to ${fmt(iccC.high)}): ${kooLi(iccC.low)} to ${kooLi(iccC.high)} on Koo and Li's bands.`);
  if (r.perCategory && r.perCategory.length > 2) {
    const ok = r.perCategory.filter((c) => Number.isFinite(c.kappa) && c.ratings >= 5);
    if (ok.length >= 2) {
      const lo = ok.reduce((m, c) => (c.kappa < m.kappa ? c : m));
      const hi = ok.reduce((m, c) => (c.kappa > m.kappa ? c : m));
      parts.push(`Agreement is weakest on "${lo.category}" (per-category kappa ${fmt(lo.kappa)}) and strongest on "${hi.category}" (${fmt(hi.kappa)}).`);
    }
  }
  if (r.dropOne && r.dropOne.length >= 3) {
    const best = r.dropOne.filter((d) => Number.isFinite(d.change) && d.ratings >= 10).sort((x, y) => y.change - x.change)[0];
    if (best && best.change > 0.02) parts.push(`Leaving out rater "${best.rater}" (${best.ratings} ratings) would raise alpha to ${fmt(best.alphaWithout)}; check that rater's instructions before dropping anyone.`);
  }
  return parts.join(" ");
}

export function csvCell(c) {
  const s = String(c ?? "");
  const t = /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

// One row per subject: how many ratings, the modal rating and its share, the
// pairwise agreement within the subject, and (numeric) mean and SD.
export function toCsv(r) {
  const out = [["subject", "ratings", "modal_rating", "modal_share", "pairwise_agreement", "mean", "sd", ...r.categories.map((c) => `n_${c.category}`)].map(csvCell).join(",")];
  for (const s of r.subjects) out.push([s.id, s.ratings, s.modal, fmt(s.modalShare, 4), fmt(s.agreement, 4), fmt(s.mean, 4), fmt(s.sd, 4), ...s.counts].map((v) => csvCell(v === "n/a" ? "" : v)).join(","));
  return out.join("\n") + "\n";
}

export function report(r) {
  const lines = [r.summary, ""];
  lines.push(`Coefficients (${Math.round(r.confidence * 100)}% intervals):`);
  for (const c of r.coefficients) lines.push(`  ${c.name.padEnd(60)} ${fmt(c.value).padStart(7)}  [${fmt(c.low)}, ${fmt(c.high)}]  ${c.label}`);
  if (r.percentAgreement != null) lines.push(`  ${"Percent agreement (pairs of ratings of a subject)".padEnd(60)} ${fmt(r.percentAgreement).padStart(7)}`);
  if (r.cohen) {
    lines.push("", `Two raters (${r.cohen.raters.join(" vs ")}), ${r.cohen.n} subjects rated by both:`);
    for (const [k, v] of [["unweighted", r.cohen.unweighted], ["linear weights", r.cohen.linear], ["quadratic weights", r.cohen.quadratic]]) if (v) lines.push(`  kappa ${k.padEnd(18)} ${fmt(v.kappa)}  SE ${fmt(v.se, 4)}  [${fmt(v.low)}, ${fmt(v.high)}]  z = ${fmt(v.z, 2)}  p = ${fmtP(v.p)}`);
    lines.push(`  PABAK ${fmt(r.cohen.pabak)}${r.cohen.prevalenceIndex != null ? `, prevalence index ${fmt(r.cohen.prevalenceIndex)}, bias index ${fmt(r.cohen.biasIndex)}` : ""}`);
  }
  if (r.icc) {
    lines.push("", `Intraclass correlations (${r.icc.n} complete subjects, ${r.icc.k} raters):`);
    for (const f of r.icc.forms) lines.push(`  ${f.name.padEnd(9)} ${f.model.padEnd(36)} ${f.type.padEnd(18)} ${fmt(f.value).padStart(7)}  [${fmt(f.low)}, ${fmt(f.high)}]  F(${f.df1}, ${f.df2}) = ${fmt(f.F, 2)}  p = ${fmtP(f.p)}`);
  }
  if (r.perCategory) {
    lines.push("", "Per category (that category vs the rest):");
    for (const c of r.perCategory) lines.push(`  ${String(c.category).padEnd(20)} ${String(c.ratings).padStart(6)} ratings  kappa ${fmt(c.kappa)}`);
  }
  if (r.pairwise) {
    lines.push("", `Pairwise Cohen's kappa (${r.pairwise.weights === "none" ? "unweighted" : "quadratic weights"}):`);
    for (const p of r.pairwise.pairs) lines.push(`  ${`${p.a} vs ${p.b}`.padEnd(30)} n = ${String(p.n).padStart(5)}  kappa ${fmt(p.kappa)}`);
  }
  if (r.dropOne) {
    lines.push("", "Alpha with each rater left out (largest rise first):");
    for (const d of [...r.dropOne].sort((x, y) => (y.change || -9) - (x.change || -9)).slice(0, 10)) lines.push(`  ${String(d.rater).padEnd(20)} ${String(d.ratings).padStart(5)} ratings  alpha ${fmt(d.alphaWithout)}  (${d.change >= 0 ? "+" : ""}${fmt(d.change)})`);
  }
  if (r.contested.length) {
    lines.push("", "Subjects with the least agreement:");
    for (const s of r.contested.slice(0, 5)) lines.push(`  ${String(s.id).padEnd(20)} ${s.ratings} ratings  modal ${s.modal} (${Math.round(s.modalShare * 100)}%)${Number.isFinite(s.sd) ? `  sd ${fmt(s.sd)}` : ""}`);
  }
  if (r.warnings.length) lines.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return lines.join("\n");
}
