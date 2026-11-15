// The "weigh criteria" page's logic (site/decide.html), pure and DOM-free so
// node --test can run it (decide-core.test.mjs).
//
// A weighted decision matrix built from pairwise picks instead of typed
// numbers. Two kinds of question:
//   - "Which matters more to you: Price or Location?" (criteria), and
//   - "On Location, which is better: Flat A or Flat B?" (options, per criterion).
// Each kind is fitted with the same Bradley-Terry refit the list ranker uses
// (rank-core.mjs `fit`, the app's src/lib/btRefit.ts). A criterion's weight is
// its Luce share, exp(s_c) / sum exp(s), so "Price beats Location 3 times in
// 4" reads as Price's weight being about 3 times Location's. An option's
// overall score is the weighted sum of its centred per-criterion scores.
// Uncertainty flows through by drawing from every fit's Gaussian posterior at
// once, so a rank range covers doubt about the weights as well as the scores.
//
// The next question is picked across both kinds by a linearised expected
// information score: how much the answer is expected to shrink the variance
// of the overall score gaps between neighbouring options, weighted by how
// likely each neighbouring pair is still the wrong way round. Measured on
// simulated people in docs/DECIDE-PAGE.md (scripts/decide-sim.mjs).
import { fit, parseList, listId, suggestedMax, csvCell, STOP_CONFIDENCE } from "./rank-core.mjs";
import { cholesky } from "./engine/btRefit.mjs";
import { gradedFit, hasGrades, estimateTau, GRADED_TAU, BIT, MUCH } from "./graded-fit.mjs";
export { GRADED_TAU, BIT, MUCH };

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 20;
export const MIN_CRITERIA = 2;
export const MAX_CRITERIA = 8;
export const DECIDE_DRAWS = 1500;
export { STOP_CONFIDENCE };

/** Options and criteria from two pasted lists (rank-core's parser: bullets, blanks, repeats dropped), capped. */
export function parseSetup(optionsText, criteriaText) {
  return {
    options: parseList(optionsText).slice(0, MAX_OPTIONS),
    criteria: parseList(criteriaText).slice(0, MAX_CRITERIA),
  };
}

/** What is wrong with a setup, in words, or "" when it can start. */
export function setupError({ options, criteria }) {
  if (options.length < MIN_OPTIONS) return `Add at least ${MIN_OPTIONS} different options, one per line.`;
  if (criteria.length < MIN_CRITERIA) return `Add at least ${MIN_CRITERIA} different criteria, one per line (with one criterion, the list ranker is the simpler tool).`;
  return "";
}

/** Fingerprint of a decision (options and criteria), so codes for another decision are refused. */
export function decisionId(options, criteria) {
  return listId([...options, "\u0000", ...criteria]);
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The decision as a URL fragment ("d=" + base64url JSON); fragments never reach a server. */
// What the questions aim at: "winner" (the default: find the best option and
// stop once it is safe) or "order" ("rank them all": the order picker and the
// whole-order stop). A link carries "order" as m: "order"; a winner link has
// no m, so links made before the switch read as they did.
export const DECIDE_MODES = ["winner", "order"];
export function encodeDecision({ title = "", options, criteria, mode = "winner" }) {
  if (!DECIDE_MODES.includes(mode)) throw new Error(`unknown mode ${mode}`);
  return "d=" + toBase64Url(JSON.stringify({ v: 1, t: title, o: options, c: criteria, ...(mode === "order" ? { m: "order" } : {}) }));
}
export function decodeDecision(fragment) {
  try {
    const d = JSON.parse(fromBase64Url(String(fragment).replace(/^#/, "").replace(/^d=/, "")));
    if (!d || d.v !== 1 || !Array.isArray(d.o) || !Array.isArray(d.c)) return null;
    const setup = parseSetup(d.o.map(String).join("\n"), d.c.map(String).join("\n"));
    if (setupError(setup)) return null;
    // An unknown mode is refused, not read as the default: a damaged link should say so.
    if (d.m !== undefined && d.m !== "order") return null;
    return { title: Array.from(String(d.t || "")).slice(0, 200).join(""), ...setup, mode: d.m === "order" ? "order" : "winner" };
  } catch {
    return null;
  }
}

/**
 * Answers: { crit: [[w, l, tie, grade]], opt: [[c, w, l, tie, grade]] },
 * indices into the criteria and options; `grade` is optional (BIT "a bit",
 * MUCH "much", absent for an ungraded pick, as in codes made before graded
 * answers). A result code is "QD1." + base64url JSON with the decision
 * fingerprint, an optional name and both answer lists; each answer ends in
 * "=" for a tie, "-" for "a bit", "+" for "much", nothing when ungraded.
 */
const GRADE_MARK = { [BIT]: "-", [MUCH]: "+" };
const MARK_GRADE = { "-": BIT, "+": MUCH };
export function encodeAnswers({ options, criteria, answers, name = "" }) {
  const t = (tie, g) => (tie ? "=" : GRADE_MARK[g] || "");
  const w = answers.crit.map(([a, b, tie, g]) => `${a.toString(36)}.${b.toString(36)}${t(tie, g)}`).join(",");
  const a = answers.opt.map(([c, x, y, tie, g]) => `${c.toString(36)}.${x.toString(36)}.${y.toString(36)}${t(tie, g)}`).join(",");
  return "QD1." + toBase64Url(JSON.stringify({ l: decisionId(options, criteria), n: Array.from(String(name)).slice(0, 60).join(""), w, a }));
}
export function decodeAnswers(code, options, criteria) {
  const m = /^QD1\.([A-Za-z0-9_-]+)$/.exec(String(code).trim());
  if (!m) return { error: "not a Quick Pick decision code" };
  const damaged = { error: "the code is damaged (copy it again in full)" };
  let d;
  try { d = JSON.parse(fromBase64Url(m[1])); } catch { return damaged; }
  if (!d || typeof d !== "object" || Array.isArray(d)) return damaged;
  if (d.l !== decisionId(options, criteria)) return { error: "this code is for a different decision" };
  const crit = [], opt = [];
  for (const part of String(d.w || "").split(",").filter(Boolean)) {
    const pm = /^([0-9a-z]+)\.([0-9a-z]+)([=+-]?)$/.exec(part);
    if (!pm) return damaged;
    const a = parseInt(pm[1], 36), b = parseInt(pm[2], 36);
    if (a >= criteria.length || b >= criteria.length || a === b) return damaged;
    crit.push(MARK_GRADE[pm[3]] ? [a, b, false, MARK_GRADE[pm[3]]] : [a, b, pm[3] === "="]);
  }
  for (const part of String(d.a || "").split(",").filter(Boolean)) {
    const pm = /^([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-z]+)([=+-]?)$/.exec(part);
    if (!pm) return damaged;
    const c = parseInt(pm[1], 36), x = parseInt(pm[2], 36), y = parseInt(pm[3], 36);
    if (c >= criteria.length || x >= options.length || y >= options.length || x === y) return damaged;
    opt.push(MARK_GRADE[pm[4]] ? [c, x, y, false, MARK_GRADE[pm[4]]] : [c, x, y, pm[4] === "="]);
  }
  return { name: Array.from(String(d.n || "")).slice(0, 60).join(""), answers: { crit, opt } };
}

const softmax = (s) => {
  const m = Math.max(...s);
  const e = s.map((x) => Math.exp(x - m));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / z);
};
const centre = (v) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return v.map((x) => x - m);
};

/**
 * The fits behind a decision: one over the criteria, one per criterion over
 * the options, plus the plug-in weights and overall scores at the posterior
 * mode (what the page shows as the order).
 */
/**
 * Graded answers ("a bit" / "much") go through the ordinal fit in
 * graded-fit.mjs; a list with no grades uses the plain refit, which the
 * ordinal fit equals on ungraded answers (graded-fit.test.mjs). `grades`
 * picks how grades are read, for the simulations: "ordinal" (the page),
 * "double" (a "much" pick counted as two plain wins) or "ignore".
 */
const fitAnswers = (n, list, { grades = "ordinal", tau = GRADED_TAU } = {}) => {
  if (!hasGrades(list) || grades === "ignore") return fit(n, list.map(([w, l, t]) => [w, l, t]));
  if (grades === "double") return fit(n, list.flatMap(([w, l, t, g]) => (!t && g === MUCH ? [[w, l, false], [w, l, false]] : [[w, l, t]])));
  return gradedFit(n, list, { tau });
};

export function decisionFit(nOptions, nCriteria, answers, fitOptions = {}) {
  const lists = [[nCriteria, answers.crit], ...Array.from({ length: nCriteria }, (_, c) => [nOptions, answers.opt.filter((a) => a[0] === c).map(([, x, y, t, g]) => [x, y, t, g])])];
  // Fixed GRADED_TAU by default: the per-person estimate ("auto") recovered
  // tau on simulated people but did no better on the decision (DECIDE-PAGE.md
  // "Graded answers") at about 15 times the fits per answer.
  let tau = fitOptions.tau ?? GRADED_TAU;
  if (tau === "auto") tau = (fitOptions.grades ?? "ordinal") === "ordinal" ? estimateTau(lists) : GRADED_TAU;
  const fo = { ...fitOptions, tau };
  const crit = fitAnswers(nCriteria, lists[0][1], fo);
  const opts = lists.slice(1).map(([n, a]) => fitAnswers(n, a, fo));
  const weights = softmax(crit.mu);
  const centred = opts.map((f) => centre(f.mu));
  const score = Array.from({ length: nOptions }, (_, i) => centred.reduce((a, mu, c) => a + weights[c] * mu[i], 0));
  return { n: nOptions, C: nCriteria, crit, opts, weights, centred, score, tau };
}

/** Options in overall order at the posterior mode, best first (index breaks ties). */
export function overallOrder(df) {
  return df.score.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
}

const dv = (f, i, j) => Math.max(f.cov[i * f.n + i] + f.cov[j * f.n + j] - 2 * f.cov[i * f.n + j], 1e-12);
const normalCdf = (z) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
};

/**
 * Linearised view of each neighbouring gap g = S_i - S_j in the overall
 * order: its value, its gradient with respect to the criterion logits
 * (dg/ds_a = w_a (D_a - g), D_a the gap on criterion a, from the softmax),
 * and its variance (option-score part plus weight part).
 */
function neighbourGaps(df, focus = "order") {
  const ord = overallOrder(df);
  const { C, crit, opts, weights, centred } = df;
  const gaps = [];
  // "winner": the leader against every rival instead of each neighbouring pair.
  const pairs = focus === "winner" ? ord.slice(1).map((j) => [ord[0], j]) : ord.slice(0, -1).map((i, k) => [i, ord[k + 1]]);
  for (const [i, j] of pairs) {
    const g = df.score[i] - df.score[j];
    const grad = weights.map((w, a) => w * (centred[a][i] - centred[a][j] - g));
    let v = 0;
    for (let c = 0; c < C; c++) v += weights[c] ** 2 * dv(opts[c], i, j);
    for (let a = 0; a < C; a++) for (let b = 0; b < C; b++) v += grad[a] * grad[b] * crit.cov[a * C + b];
    v = Math.max(v, 1e-12);
    gaps.push({ i, j, g, grad, v, wrong: normalCdf(-Math.abs(g) / Math.sqrt(v)) });
  }
  return gaps;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The next question: { kind: "crit", pair: [a, b] } or { kind: "opt", c,
 * pair: [x, y] }, sides by coin flip. Every candidate is scored by the sum,
 * over neighbouring pairs in the overall order, of the chance that pair is
 * the wrong way round times the share of its gap variance the answer is
 * expected to remove (cov(g, d)^2 I / (1 + I var d), I = p(1 - p), over var
 * g). A small penalty per repeat spreads the questions, and the last
 * question is never asked twice in a row. `strategy: "random"` picks a
 * uniformly random question instead (the baseline in the simulations).
 * `focus: "winner"` (the default since 2026-11-14) scores the gaps between
 * the leader and each rival instead of neighbouring pairs, the question the
 * winner stop asks; "order" is the first picker (docs/DECIDE-PAGE.md,
 * "The winner stop").
 */
export const DECIDE_FOCUS = "winner";

export function nextQuestion(df, answers, { seed = 1, strategy = "adaptive", focus = DECIDE_FOCUS } = {}) {
  const { n, C, crit, opts, weights } = df;
  const rand = mulberry32(seed * 2654435761 + answers.crit.length * 7919 + answers.opt.length);
  const flip = (p) => (rand() < 0.5 ? p : [p[1], p[0]]);
  if (strategy === "random") {
    const nCrit = (C * (C - 1)) / 2, nOpt = C * ((n * (n - 1)) / 2);
    let r = Math.floor(rand() * (nCrit + nOpt));
    if (r < nCrit) {
      for (let a = 0; a < C; a++) for (let b = a + 1; b < C; b++) if (r-- === 0) return { kind: "crit", pair: flip([a, b]) };
    }
    r -= nCrit;
    const c = Math.floor(r / ((n * (n - 1)) / 2));
    let q = r % ((n * (n - 1)) / 2);
    for (let x = 0; x < n; x++) for (let y = x + 1; y < n; y++) if (q-- === 0) return { kind: "opt", c, pair: flip([x, y]) };
  }
  const gaps = neighbourGaps(df, focus);
  const asked = new Map();
  for (const [a, b] of answers.crit) asked.set(`w${Math.min(a, b)},${Math.max(a, b)}`, (asked.get(`w${Math.min(a, b)},${Math.max(a, b)}`) || 0) + 1);
  for (const [c, x, y] of answers.opt) asked.set(`${c}:${Math.min(x, y)},${Math.max(x, y)}`, (asked.get(`${c}:${Math.min(x, y)},${Math.max(x, y)}`) || 0) + 1);
  const lastC = answers.lastKind === "crit" ? answers.crit.at(-1) : null;
  const lastO = answers.lastKind === "opt" ? answers.opt.at(-1) : null;
  let best = null, bestScore = -Infinity;
  const consider = (q, key, covs, v, p) => {
    const info = p * (1 - p);
    let s = 0;
    for (let k = 0; k < gaps.length; k++) s += gaps[k].wrong * (covs[k] * covs[k] * info) / (1 + info * v) / gaps[k].v;
    s = s / (1 + 0.5 * (asked.get(key) || 0)) * (1 + 1e-6 * rand());
    if (s > bestScore) { bestScore = s; best = q; }
  };
  // Criteria pairs: cov(g, s_a - s_b) = grad . (Sigma_s[:, a] - Sigma_s[:, b]).
  for (let a = 0; a < C; a++) for (let b = a + 1; b < C; b++) {
    if (lastC && Math.min(lastC[0], lastC[1]) === a && Math.max(lastC[0], lastC[1]) === b) continue;
    const covs = gaps.map(({ grad }) => { let x = 0; for (let k = 0; k < C; k++) x += grad[k] * (crit.cov[k * C + a] - crit.cov[k * C + b]); return x; });
    consider({ kind: "crit", pair: [a, b] }, `w${a},${b}`, covs, dv(crit, a, b), 1 / (1 + Math.exp(-(crit.mu[a] - crit.mu[b]))));
  }
  // Option pairs on criterion c: cov(g_ij, x_cx - x_cy) = w_c (S[i,x] - S[i,y] - S[j,x] + S[j,y]).
  for (let c = 0; c < C; c++) {
    const f = opts[c], cv = f.cov, w = weights[c];
    for (let x = 0; x < n; x++) for (let y = x + 1; y < n; y++) {
      if (lastO && lastO[0] === c && Math.min(lastO[1], lastO[2]) === x && Math.max(lastO[1], lastO[2]) === y) continue;
      const covs = gaps.map(({ i, j }) => w * (cv[i * n + x] - cv[i * n + y] - cv[j * n + x] + cv[j * n + y]));
      consider({ kind: "opt", c, pair: [x, y] }, `${c}:${x},${y}`, covs, dv(f, x, y), 1 / (1 + Math.exp(-(f.mu[x] - f.mu[y]))));
    }
  }
  return { ...best, pair: flip(best.pair) };
}

/** Joint draws from every fit's posterior: overall scores per draw, and weights per draw. */
export function sampleDecision(df, { draws = DECIDE_DRAWS, seed = 0xdec1 } = {}) {
  const { n, C } = df;
  const rand = mulberry32(seed);
  const gauss = () => { const u = 1 - rand(), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const chol = (f) => cholesky(Float64Array.from(f.cov, (x, k) => x + (k % (f.n + 1) === 0 ? 1e-9 : 0)), f.n);
  const lc = chol(df.crit), lo = df.opts.map(chol);
  const draw = (f, l) => {
    const z = Array.from({ length: f.n }, gauss);
    return f.mu.map((m, a) => { let x = m; for (let b = 0; b <= a; b++) x += l[a * f.n + b] * z[b]; return x; });
  };
  const scores = [], weights = [];
  for (let d = 0; d < draws; d++) {
    const w = softmax(draw(df.crit, lc));
    const s = new Float64Array(n);
    for (let c = 0; c < C; c++) {
      const x = centre(draw(df.opts[c], lo[c]));
      for (let i = 0; i < n; i++) s[i] += w[c] * x[i];
    }
    scores.push(s); weights.push(w);
  }
  return { scores, weights, draws };
}

const ranksOf = (s) => {
  const idx = Array.from(s.keys()).sort((p, q) => s[q] - s[p]);
  const r = new Array(s.length);
  idx.forEach((item, k) => (r[item] = k + 1));
  return r;
};

/**
 * The results: options in overall order with a 90% rank range and chance of
 * being best; criteria with their weight (plug-in) and a 90% range;
 * `confidence`, the posterior mean Spearman between a drawn order and the
 * one shown (rank-core's orderConfidence, over the joint draws); and `safe`,
 * the share of draws in which no option beats the option shown first by
 * more than `margin` (DECIDE_MARGIN) on the overall score.
 */
export function decisionTable(df, options = {}) {
  const { scores, weights, draws } = sampleDecision(df, options);
  const margin = options.margin ?? DECIDE_MARGIN;
  const { n, C } = df;
  const ord = overallOrder(df);
  const shown = new Array(n);
  ord.forEach((item, k) => (shown[item] = k + 1));
  const ranks = Array.from({ length: n }, () => []);
  const best = new Array(n).fill(0);
  let sp = 0, beaten = 0;
  const lead = ord[0];
  for (const s of scores) {
    const r = ranksOf(s);
    let top = -Infinity;
    for (let i = 0; i < n; i++) if (s[i] > top) top = s[i];
    if (top - s[lead] > margin) beaten++;
    let d2 = 0;
    for (let i = 0; i < n; i++) { ranks[i].push(r[i]); if (r[i] === 1) best[i]++; d2 += (r[i] - shown[i]) ** 2; }
    sp += n > 1 ? 1 - (6 * d2) / (n * (n * n - 1)) : 1;
  }
  const lo = Math.floor(0.05 * draws), hi = Math.min(draws - 1, Math.ceil(0.95 * draws) - 1);
  const rows = ord.map((i, k) => {
    const r = ranks[i].sort((a, b) => a - b);
    return { item: i, rank: k + 1, low: r[lo], high: r[hi], best: best[i] / draws, score: df.score[i] };
  });
  const crit = Array.from({ length: C }, (_, c) => {
    const w = weights.map((x) => x[c]).sort((a, b) => a - b);
    return { item: c, weight: df.weights[c], low: w[lo], high: w[hi] };
  }).sort((a, b) => b.weight - a.weight || a.item - b.item);
  return { rows, crit, confidence: sp / draws, safe: 1 - beaten / draws, margin };
}

/**
 * Per criterion, the option the person rates best there, or -1 when it is
 * not clear: the leader must beat the runner-up with at least `level`
 * posterior chance. Without the bar, a criterion the picker barely asked
 * about (because its weight is small) named a "best" from one answer; in
 * the browser check a scripted person's least-liked option was shown as
 * strongest on three criteria that way.
 */
export function bestPerCriterion(df, { level = 0.75 } = {}) {
  return df.opts.map((f) => {
    const ord = f.mu.map((m, i) => [m, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
    if (ord.length < 2) return ord[0] ?? -1;
    const [i, j] = ord;
    return normalCdf((f.mu[i] - f.mu[j]) / Math.sqrt(dv(f, i, j))) >= level ? i : -1;
  });
}

/**
 * A soft cap on questions: a full-order budget for the criteria plus one for
 * the options on each criterion, at 2 n log2 n per list (rank-core's
 * suggestedMax), halved, because the picker stops asking about parts of the
 * matrix that cannot change the overall order. Stop whenever you like.
 */
export function decisionMax(n, C) {
  return Math.ceil((suggestedMax(Math.max(C, 2)) + C * suggestedMax(Math.max(n, 2))) / 2);
}

/**
 * How far "Keep going until it is settled" goes: decisionMax is a checkpoint
 * where the page shows the results so far, and a person who keeps going is
 * asked until the stop passes or DECIDE_EXTEND x decisionMax. Chosen from
 * 1.5, 2, 3 and 4 on 1,500 simulated people (docs/DECIDE-PAGE.md, "A larger
 * cap"): at tau 2, 3x named the true best in 254 of 300 runs against 203 at
 * the checkpoint and left it more than 0.25 behind in 12 against 42, for
 * about 91% more picks; 4x added 3 right answers for another 8%.
 */
export const DECIDE_EXTEND = 3;
export function decisionHardMax(n, C) {
  return Math.ceil(DECIDE_EXTEND * decisionMax(n, C));
}

/**
 * The practical-tie margin for the winner stop, on the overall score's logit
 * scale: 0.25 is a weighted edge of about 56% to 44% in a head-to-head pick.
 * Chosen from 0.15, 0.25 and 0.4 on simulated people (docs/DECIDE-PAGE.md,
 * "The winner stop").
 */
export const DECIDE_MARGIN = 0.25;

/**
 * Stop, with at least one answer of each kind, once either the whole order
 * is STOP_CONFIDENCE settled or (rule "winner", the default) there is under
 * a 1 - STOP_CONFIDENCE chance that any option beats the leader by more than
 * DECIDE_MARGIN (`table.safe`). The order rule alone hit the cap in 58 of 60
 * simulated runs: a weighted average pulls options together, so neighbours
 * further down rarely separate, and the person came to choose one.
 */
export function decisionDone(table, answers, { rule = "winner", level = STOP_CONFIDENCE } = {}) {
  if (!(answers.crit.length > 0 && answers.opt.length > 0)) return false;
  return table.confidence >= level || (rule === "winner" && table.safe >= level);
}

/**
 * The stop's level after the checkpoint. Every answer is another look at the
 * results, and a stop that is checked after every answer for up to 3 x
 * decisionMax answers gets more chances to end on a lucky run of picks. So
 * past the checkpoint the allowed miss shrinks with the answer count:
 * level = 1 - (1 - STOP_CONFIDENCE) x (decisionMax / answers)^LONG_RUN_POWER,
 * 0.9 up to the checkpoint, then 0.929 at twice it and 0.942 at three times
 * (power 0.5). On simulated people who say "much" for 63% of picks (tau 1)
 * the runs that stopped on their own kept the 0.25 promise in 214 of 235
 * (0.91) against 233 of 263 (0.89) before, for 10% more picks; power 1
 * reached 0.92 for 16% more, and shrinking the guard's tau instead reached
 * 0.89 (docs/DECIDE-PAGE.md "The guard over long runs"). `longRun: "none"`
 * is the page before it.
 */
export const LONG_RUN_POWER = 0.5;
export function longRunLevel(nOptions, nCriteria, answerCount, { longRun = "level", power = LONG_RUN_POWER } = {}) {
  const base = decisionMax(nOptions, nCriteria);
  if (longRun === "none" || longRun === "tau" || answerCount <= base) return STOP_CONFIDENCE;
  return 1 - (1 - STOP_CONFIDENCE) * Math.pow(base / answerCount, power);
}

/**
 * The stop for graded answers. The ordinal fit trusts "much" by the tau it is
 * given, and a person who says "much" more freely than that tau assumes would
 * be read as surer than they are: on simulated people who said "much" for 63%
 * of picks, the winner stop at tau 2 kept its 90% promise in only 77% of the
 * runs that stopped (docs/DECIDE-PAGE.md "Graded answers"). So once the usual
 * check passes, the answers are refit at GUARD_TAU, a reading in which "much"
 * counts for little and "a bit" for close to a tie, and the page stops only
 * if that refit passes too (the list ranker's second check, the same shape).
 * With guardTau "auto" the guard reads at the lower of GUARD_TAU and the
 * person's own estimateTau. Ungraded answers skip the second fit. Returns
 * { done, table } with the table the decision rests on (the guard's, when it
 * ran).
 *
 * guardTau "switch" (the default since 2026-11-15, latest): when the person's
 * estimateTau is below PLAIN_GUARD_BELOW the guard ignores the grades and
 * reads the picks alone, otherwise it is "auto". estimateTau reads about a
 * quarter high (tau 0.5, 1 and 2 at medians 0.7-0.8, 1.2-1.3 and 2.5 at the
 * checkpoint), and a person at tau 0.5 kept the promise in only 193 of 225
 * self-stops (0.858) at 3 x the checkpoint under "auto". Reading their guard
 * at a scaled-down tau did not reach 0.9 (0.878 at 0.6 x the estimate); the
 * plain picks did. With the switch below 1.25 they keep it in 138 of 152
 * (0.908); tau 2, 3 and the inconsistent person stop exactly as before
 * (docs/DECIDE-PAGE.md "People who say much for most picks"). guardScale
 * multiplies the estimate under "auto" (measured, not shipped); "plain" always
 * ignores the grades (measured).
 */
export const GUARD_TAU = 1;
export const PLAIN_GUARD_BELOW = 1.25;
export function decisionDoneGraded(nOptions, nCriteria, answers, table, { rule = "winner", guardTau = "switch", switchBelow = PLAIN_GUARD_BELOW, guardScale = 1, draws = 400, longRun = "level", power = LONG_RUN_POWER } = {}) {
  const t = answers.crit.length + answers.opt.length;
  const level = longRunLevel(nOptions, nCriteria, t, { longRun, power });
  if (!decisionDone(table, answers, { rule, level })) return { done: false, table };
  const graded = [...answers.crit, ...answers.opt.map(([, x, y, t, g]) => [x, y, t, g])];
  if (!hasGrades(graded)) return { done: true, table };
  const lists = [[nCriteria, answers.crit], ...Array.from({ length: nCriteria }, (_, c) => [nOptions, answers.opt.filter((a) => a[0] === c).map(([, x, y, t, g]) => [x, y, t, g])])];
  const estimate = guardTau === "switch" || guardTau === "auto" ? estimateTau(lists) : null;
  if (guardTau === "plain" || (guardTau === "switch" && estimate < switchBelow)) {
    const guard = decisionTable(decisionFit(nOptions, nCriteria, answers, { grades: "ignore" }), { draws });
    return { done: decisionDone(guard, answers, { rule, level }), table: guard };
  }
  let tau = estimate !== null ? Math.min(GUARD_TAU, estimate * guardScale) : guardTau;
  // longRun "tau" (measured, not shipped): past the checkpoint the guard's tau shrinks with the answer count instead.
  const base = decisionMax(nOptions, nCriteria);
  if (longRun === "tau" && t > base) tau *= base / t;
  const guard = decisionTable(decisionFit(nOptions, nCriteria, answers, { tau }), { draws });
  return { done: decisionDone(guard, answers, { rule, level }), table: guard };
}

/**
 * What would change the winner, at the posterior mode: for each criterion,
 * the weight it would need (the others scaled to fill the rest in their
 * current proportions) for another option to overtake the leader. With the
 * others in proportion every overall score is linear in that one weight x,
 * S_o(x) = x D_o + (1 - x) R_o (D_o its centred score on the criterion, R_o
 * its weighted score on the rest), so each crossing is solved exactly.
 * Returns, per criterion, { item, weight, needed, rival }; needed and rival
 * are null when no weight from 0 to 1 changes the winner.
 */
export function whatWouldChange(df) {
  const { n, weights, centred } = df;
  const a = overallOrder(df)[0];
  return weights.map((wd, c) => {
    const rest = 1 - wd;
    const R = (o) => (rest < 1e-12 ? 0 : weights.reduce((acc, wk, k) => acc + (k === c ? 0 : wk * centred[k][o]), 0) / rest);
    const Ra = R(a), Da = centred[c][a];
    let best = null;
    for (let o = 0; o < n; o++) {
      if (o === a) continue;
      const Ro = R(o), Do = centred[c][o], den = (Da - Ra) - (Do - Ro);
      if (Math.abs(den) < 1e-12) continue;
      const x = (Ro - Ra) / den;
      if (!(x >= 0 && x <= 1)) continue;
      // Past the crossing, in the direction away from today's weight, o must really lead.
      const xs = Math.min(1, Math.max(0, x + (x > wd ? 1e-6 : -1e-6)));
      if (xs * Do + (1 - xs) * Ro <= xs * Da + (1 - xs) * Ra) continue;
      if (!best || Math.abs(x - wd) < Math.abs(best.needed - wd)) best = { needed: x, rival: o };
    }
    return { item: c, weight: wd, needed: best ? best.needed : null, rival: best ? best.rival : null };
  });
}

/** The results as CSV, with the weights below the order. Every text cell goes through rank-core's csvCell, its formula-injection guard. */
export function decisionCsv(options, criteria, table, df) {
  const q = csvCell;
  const best = bestPerCriterion(df);
  const rows = [["rank", "option", "rank_range_90", "chance_best", ...criteria.map((c) => `best_on_${c}`)].map(q).join(",")];
  for (const r of table.rows) rows.push([r.rank, q(options[r.item]), q(r.low === r.high ? `${r.low}` : `${r.low}-${r.high}`), r.best.toFixed(3), ...best.map((b) => (b === r.item ? "yes" : ""))].join(","));
  rows.push("");
  rows.push(["criterion", "weight", "weight_range_90"].join(","));
  for (const c of table.crit) rows.push([q(criteria[c.item]), c.weight.toFixed(3), q(`${c.low.toFixed(3)}-${c.high.toFixed(3)}`)].join(","));
  return rows.join("\n") + "\n";
}

/**
 * A team's decision from several people's codes: each person's overall
 * scores (posterior mode) are centred and averaged with equal weight per
 * person, their weights averaged the same way, and `agreement` is the mean
 * pairwise Spearman between people's overall orders.
 */
export function combineDecisions(nOptions, nCriteria, people) {
  const dfs = people.map((p) => decisionFit(nOptions, nCriteria, p.answers));
  const sc = dfs.map((d) => centre(d.score));
  const team = Array.from({ length: nOptions }, (_, i) => sc.reduce((a, s) => a + s[i], 0) / dfs.length);
  const weights = Array.from({ length: nCriteria }, (_, c) => dfs.reduce((a, d) => a + d.weights[c], 0) / dfs.length);
  const ranks = dfs.map((d) => { const r = new Array(nOptions); overallOrder(d).forEach((it, k) => (r[it] = k + 1)); return r; });
  let sum = 0, pairs = 0;
  for (let a = 0; a < ranks.length; a++) for (let b = a + 1; b < ranks.length; b++) {
    let d2 = 0;
    for (let i = 0; i < nOptions; i++) d2 += (ranks[a][i] - ranks[b][i]) ** 2;
    sum += nOptions > 1 ? 1 - (6 * d2) / (nOptions * (nOptions * nOptions - 1)) : 1; pairs++;
  }
  const order = team.map((s, i) => [s, i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]).map(([, i], k) => ({
    item: i, rank: k + 1,
    firsts: ranks.filter((r) => r[i] === 1).length,
    bestPlace: Math.min(...ranks.map((r) => r[i])),
    worstPlace: Math.max(...ranks.map((r) => r[i])),
  }));
  return { people: dfs.length, order, weights, agreement: pairs ? sum / pairs : 1 };
}
