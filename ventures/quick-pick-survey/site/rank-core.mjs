// The rank page's logic, pure and DOM-free so node --test can run it
// (rank-core.test.mjs). The model is the app's own: site/engine/ is generated
// from src/lib/btRefit.ts and favouriteSet.ts by scripts/build-rank-engine.mjs.
import { refitRatings, cholesky, cholSolve, cholInverse, empiricalPriorPhi, REFIT_PRIOR_PHI, EB_PHI_MIN } from "./engine/btRefit.mjs";
import { favouriteSet } from "./engine/favouriteSet.mjs";
import { isSetAnswer, setAnswerError, setFitAt, setPriorPhi, answerTerms } from "./best-worst.mjs";
import { timeToken, parseTimes, alignedTimes } from "./answer-time.mjs";

export const MAX_ITEMS = 60;
export const MIN_ITEMS = 3;
export const MAX_ITEM_LENGTH = 120;
/**
 * Stop asking once orderConfidence reaches this. Measured on simulated
 * respondents (docs/RANK-PAGE.md): at 0.9 the shown order's true Spearman
 * with the respondent's real order was about 0.94 for ordinary noise.
 */
export const STOP_CONFIDENCE = 0.9;
export const RANK_DRAWS = 1500;

/**
 * One option per line; blank lines, list bullets and repeats dropped.
 * Idempotent (parseList(parseList(x).join("\n")) is parseList(x)): a shared
 * link is parsed again on the respondent's side, and any change there gives
 * a different listId, so the creator would refuse every respondent's code.
 * Hence every leading bullet goes, the cut is by code point (no half emoji)
 * and the trim comes after the cut.
 */
export function parseList(text) {
  const seen = new Set();
  const items = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const stripped = raw.replace(/^\s*(?:(?:[-*•]|\d+[.)])\s+)+/, "").trim();
    const line = Array.from(stripped).slice(0, MAX_ITEM_LENGTH).join("").trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(line);
    if (items.length === MAX_ITEMS) break;
  }
  return items;
}

/** Short, stable fingerprint of a list (FNV-1a over the items), so codes from different lists are never merged. */
export function listId(items) {
  let h = 0x811c9dc5;
  for (const ch of items.join("\n")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
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

/** Modes a shared link may carry besides the default full order. */
export const LINK_MODES = ["favourite", "top", "screens"];

/**
 * The list (and an optional question) as a URL fragment: the fragment never
 * reaches a server. A link can also carry the mode the sender picked
 * ("favourite", "screens" for best-worst screens of four, or "top" with its
 * shortlist size k), so the people it is sent
 * to answer the same question; a full-order link stays as it always was.
 */
export function encodeList({ title = "", items, mode, k, images = false }) {
  const d = { v: 1, t: title, i: items };
  // A picture list (site/image-items.mjs): the items are file names and each
  // person attaches the files on their own device; the pictures never travel.
  if (images) d.g = 1;
  if (LINK_MODES.includes(mode)) d.m = mode;
  if (mode === "top") d.k = k;
  return toBase64Url(JSON.stringify(d));
}
export function decodeList(fragment) {
  try {
    // An optional "l=" prefix is accepted so a static page can link with a
    // fragment that reads as state, not as a section id (the Pages link
    // checker skips fragments containing "="; site/use-*.html link this way).
    const d = JSON.parse(fromBase64Url(String(fragment).replace(/^#/, "").replace(/^l=/, "")));
    if (!d || d.v !== 1 || !Array.isArray(d.i)) return null;
    const items = parseList(d.i.map(String).join("\n"));
    if (items.length < MIN_ITEMS) return null;
    const out = { title: Array.from(String(d.t || "")).slice(0, 200).join(""), items };
    if (d.g === 1) out.images = true;
    // A mode the page does not know, or a shortlist size that does not fit the
    // list (it needs 2 to n-1, so some options are left out), is not guessed
    // at: the list opens in the full order and `modeIgnored` says why, so the
    // page can tell the person rather than silently asking a different question.
    if (d.m === "favourite") out.mode = "favourite";
    else if (d.m === "screens") out.mode = "screens";
    else if (d.m === "top" && Number.isInteger(d.k) && d.k >= 2 && d.k < items.length) Object.assign(out, { mode: "top", k: d.k });
    else if (d.m !== undefined) out.modeIgnored = d.m === "top" ? `a shortlist of ${String(d.k).slice(0, 12)} does not fit a list of ${items.length}` : "the link asks for a mode this page does not know";
    return out;
  } catch {
    return null;
  }
}

/**
 * Answers are [winnerIndex, loserIndex, tie] triples, or best-worst screens
 * { set, best, worst } (site/best-worst.mjs). A result code carries them with
 * the list's fingerprint and an optional name: "QP1." + base64url. A screen
 * is written "s" + best.worst.rest... in base 36.
 */
function answerToken(a) {
  if (isSetAnswer(a)) {
    // Best and worst lead; the rest follow with one copy of each removed, so a damaged screen stays damaged.
    const rest = a.set.slice();
    for (const x of [a.best, a.worst]) { const k = rest.indexOf(x); if (k >= 0) rest.splice(k, 1); }
    return "s" + [a.best, a.worst, ...rest].map((i) => i.toString(36)).join(".");
  }
  const [w, l, t] = a;
  return `${w.toString(36)}.${l.toString(36)}${t ? "=" : ""}`;
}
export function encodeAnswers({ items, answers, name = "", piles, times }) {
  const a = answers.map(answerToken).join(",");
  const d = { l: listId(items), n: Array.from(String(name)).slice(0, 60).join(""), a };
  // Answer times (site/answer-time.mjs), one per answer in tenths of a second, "-" where unknown; only when they line up.
  const t = alignedTimes(answers, times);
  if (t) d.t = t.map(timeToken).join(",");
  // Pile placements (sort into piles first), one character per option: 0 top, 1 middle, 2 bottom, - not sorted.
  if (pilePrior(piles)) d.p = piles.map((x) => (x === 0 || x === 1 || x === 2 ? String(x) : "-")).join("");
  return "QP1." + toBase64Url(JSON.stringify(d));
}
export function decodeAnswers(code, items) {
  const m = /^QP1\.([A-Za-z0-9_-]+)$/.exec(String(code).trim());
  if (!m) return { error: "not a Quick Pick result code" };
  let d;
  try {
    d = JSON.parse(fromBase64Url(m[1]));
  } catch {
    return { error: "the code is damaged (copy it again in full)" };
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return { error: "the code is damaged (copy it again in full)" };
  if (d.l !== listId(items)) return { error: "this code is for a different list" };
  const answers = [];
  for (const part of String(d.a || "").split(",").filter(Boolean)) {
    const sm = /^s([0-9a-z]+(?:\.[0-9a-z]+)+)$/.exec(part);
    if (sm) {
      const set = sm[1].split(".").map((x) => parseInt(x, 36));
      const screen = { set, best: set[0], worst: set[1] };
      if (setAnswerError(screen, items.length)) return { error: "the code is damaged (copy it again in full)" };
      answers.push(screen);
      continue;
    }
    const pm = /^([0-9a-z]+)\.([0-9a-z]+)(=?)$/.exec(part);
    if (!pm) return { error: "the code is damaged (copy it again in full)" };
    const w = parseInt(pm[1], 36), l = parseInt(pm[2], 36);
    if (w >= items.length || l >= items.length || w === l) return { error: "the code is damaged (copy it again in full)" };
    answers.push([w, l, pm[3] === "="]);
  }
  const out = { name: Array.from(String(d.n || "")).slice(0, 60).join(""), answers };
  if (d.p !== undefined) {
    // Rejected, not guessed at: a pile string of the wrong length would shift every placement onto the wrong option.
    if (typeof d.p !== "string" || d.p.length !== items.length || !/^[012-]+$/.test(d.p)) return { error: "the code is damaged (copy it again in full)" };
    out.piles = Array.from(d.p, (c) => (c === "-" ? null : Number(c)));
  }
  if (d.t !== undefined) {
    const t = parseTimes(d.t, answers.length);
    if (t.error) return { error: "the code is damaged (copy it again in full)" };
    out.times = t.times;
  }
  return out;
}

const ids = (n) => Array.from({ length: n }, (_, i) => String(i));

/**
 * The refit over the answers: posterior mode and covariance on the logit
 * scale. `piles` (optional; see pilePrior) are the person's "sort into piles
 * first" placements, which move each item's prior to what its pile says.
 */
export function fit(n, answers, piles) {
  return fitAt(n, answers, REFIT_PRIOR_PHI, piles);
}

/** The same refit at another prior sd (internal logit scale; the fixed one is REFIT_PRIOR_PHI, 2.01). */
export function fitAt(n, answers, priorPhi, piles, tau = PILE_NOISE) {
  const opts = { priorPhi };
  const pp = piles ? pilePrior(piles, { phi: priorPhi, tau }) : null;
  if (pp) Object.assign(opts, { priorMean: pp.mean, priorScale: pp.scale });
  // Best-worst screens use the same link extended to a softmax (best-worst.mjs); pairs alone keep the engine's refit.
  if (answers.some(isSetAnswer)) {
    const r = setFitAt(n, answers, { phi: priorPhi, ...opts });
    return { mu: r.mu, cov: r.cov, n };
  }
  const r = refitRatings(ids(n), answers.map(([w, l, t]) => ({ winner: String(w), loser: String(l), tie: !!t })), opts);
  return { mu: r.mu, cov: r.cov, n };
}

// ---- Sort into piles first ------------------------------------------------
//
// Before any pairs, a person can drop each option into one of three piles
// (top, middle, bottom) with one tap each. A pile is weaker evidence than a
// pick, and the person can misplace an option, so it enters the refit as a
// prior, not as answers: an option's prior is what its pile says about its
// score under the refit's own prior, allowing for misplacement.
//
// Model: score s ~ N(0, phi^2); the person sees s + e, e ~ N(0, tau^2), and
// cuts that at two thresholds placed so the piles come out the sizes they did
// (a person who puts most options on top gets a higher top cut). Then s given
// the pile is the truncated-normal regression E[s | o in (a, b)] =
// (phi^2/so^2) E[o | o in (a, b)] with variance phi^2 tau^2 / so^2 +
// (phi^2/so^2)^2 Var[o | o in (a, b)], so^2 = phi^2 + tau^2. Measured:
// docs/RANK-PAGE.md, "Sort into piles first".

/** Pile codes: 0 top, 1 middle, 2 bottom; null or undefined is "not sorted". */
export const PILES = ["top", "middle", "bottom"];
/**
 * Misplacement noise tau (logits) the prior allows for. 1.28 is the sd of one
 * option's share of a pick's logistic noise (pi / sqrt 6): a pile is read as
 * no more reliable than half a pick. Simulated people three times as careless
 * (tau 3.85) are in the doc's table.
 */
export const PILE_NOISE = Math.PI / Math.sqrt(6);
/**
 * The piles as a Gaussian pseudo-likelihood on top of the refit's plain
 * N(0, phi^2) prior: N(0, phi^2) times exp(-lam b^2 / 2 + eta b) is the pile
 * prior N(m, s^2) when lam = 1/s^2 - 1/phi^2 and eta = m/s^2 (s < phi always:
 * a pile narrows the prior). The team models take it in this form (linearize),
 * since their prior is the group's, not the plain one. Null when nothing is sorted.
 */
export function pileTerms(piles, { phi = REFIT_PRIOR_PHI } = {}) {
  const pp = pilePrior(piles, { phi });
  if (!pp) return null;
  return {
    lam: pp.scale.map((s) => Math.max(0, 1 / (s * s) - 1 / (phi * phi))),
    eta: pp.mean.map((m, i) => m / (pp.scale[i] * pp.scale[i])),
  };
}

/**
 * Every PILE_AUDIT_EVERY-th pair is chosen as if there were no piles. The
 * pile prior is self-confirming otherwise: it calls pairs from different
 * piles settled, so the picker never asks one and nothing tests a misplaced
 * option. On 24 simulated close-call people (20 options, piles at the
 * assumed noise) the order shown at the stop had a true Spearman of 0.79
 * while the stop claimed 0.90 (0.86 with no piles); with a check pair every
 * 4th pick it was 0.86, claimed 0.88, for 122 picks instead of 99
 * (docs/RANK-PAGE.md, "Sort into piles first").
 */
export const PILE_AUDIT_EVERY = 4;

/** The fit nextPair should read: the piles' fit `f`, or on a check turn the fit without them. */
export function pairFit(n, answers, piles, f) {
  return pilePrior(piles) && answers.length % PILE_AUDIT_EVERY === PILE_AUDIT_EVERY - 1 ? fit(n, answers) : f;
}

/** Lists shorter than this skip the pile step: three piles of two or three say little, and lists under 8 were not measured (doc table: 8 options already save a fifth of the actions). */
export const PILE_MIN_ITEMS = 8;

const stdPdf = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
/** Inverse standard normal CDF (Acklam's rational approximation, relative error under 1.2e-9). */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normalQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Mean and variance of a standard normal truncated to (lo, hi). */
function truncMoments(lo, hi) {
  const P = normalCdf(hi) - normalCdf(lo);
  const plo = Number.isFinite(lo) ? stdPdf(lo) : 0, phi_ = Number.isFinite(hi) ? stdPdf(hi) : 0;
  const lot = Number.isFinite(lo) ? lo * plo : 0, hit = Number.isFinite(hi) ? hi * phi_ : 0;
  const m = (plo - phi_) / P;
  const v = 1 + (lot - hit) / P - m * m;
  return { m, v: Math.max(v, 1e-9) };
}

/**
 * The per-option prior the piles imply: { mean, scale } arrays for
 * refitRatings, or null when nothing is sorted. Unsorted options keep the
 * plain prior (mean 0, sd phi). A pile's share is counted with half an option
 * added to each pile, so an empty pile or a single sorted option never sets
 * a cut at infinity.
 */
export function pilePrior(piles, { phi = REFIT_PRIOR_PHI, tau = PILE_NOISE } = {}) {
  if (!Array.isArray(piles)) return null;
  const counts = [0, 0, 0];
  for (const p of piles) if (p === 0 || p === 1 || p === 2) counts[p]++;
  const sorted = counts[0] + counts[1] + counts[2];
  if (!sorted) return null;
  const share = counts.map((c) => (c + 0.5) / (sorted + 1.5));
  const so = Math.sqrt(phi * phi + tau * tau);
  // Cuts on the standardised observed scale: top is above `hiCut`, bottom below `loCut`.
  const hiCut = normalQuantile(1 - share[0]), loCut = normalQuantile(share[2]);
  const bounds = [[hiCut, Infinity], [loCut, hiCut], [-Infinity, loCut]];
  const beta = (phi * phi) / (so * so);
  const per = bounds.map(([lo, hi]) => {
    const { m, v } = truncMoments(lo, hi);
    return { mean: beta * so * m, sd: Math.sqrt((phi * phi * tau * tau) / (so * so) + beta * beta * so * so * v) };
  });
  return {
    mean: piles.map((p) => (p === 0 || p === 1 || p === 2 ? per[p].mean : 0)),
    scale: piles.map((p) => (p === 0 || p === 1 || p === 2 ? per[p].sd : phi)),
  };
}

/**
 * Laplace evidence of the answers at prior sd `phi` with the piles' prior:
 * log p(answers | mu*) + log prior(mu*) + (n/2) log 2 pi + (1/2) log det cov.
 * The engine's own empirical-Bayes search assumes every prior is centred on
 * 0; after a pile step the picks fall mostly inside a pile, so read alone they
 * look like close calls and that search would put phi at its floor (measured:
 * half of perfectly sorted 15-option runs hit the cap). This one scores the
 * piles and the picks together.
 */
export function pileEvidence(n, answers, piles, phi, tau = PILE_NOISE) {
  const pp = pilePrior(piles, { phi, tau });
  const f = fitAt(n, answers, phi, piles, tau);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const z = (f.mu[i] - pp.mean[i]) / pp.scale[i];
    s += -0.5 * z * z - Math.log(pp.scale[i]) - 0.5 * Math.log(2 * Math.PI);
  }
  s += answerTerms(n, answers, f.mu).ll;
  const L = cholesky(Float64Array.from(f.cov), n);
  let logDetCov = 0;
  for (let i = 0; i < n; i++) logDetCov += 2 * Math.log(L[i * n + i]);
  return s + 0.5 * n * Math.log(2 * Math.PI) + 0.5 * logDetCov;
}

/**
 * Misplacement noise values the stop rule's second read tries for a person's
 * piles (logits): careful, the assumed PILE_NOISE, careless, and close to
 * no information. Their own picks pick one, by the same evidence.
 */
export const PILE_TAU_GRID = [0.5, PILE_NOISE, 3, 8];

/** The person's own prior sd and pile noise: for each tau in the grid, golden-section on log phi; the best evidence wins. */
export function pilePriorFit(n, answers, piles, { steps = STOP_EB_STEPS, taus = PILE_TAU_GRID } = {}) {
  let best = null;
  for (const tau of taus) {
    const phi = pilePriorPhi(n, answers, piles, { steps, tau });
    const ev = pileEvidence(n, answers, piles, phi, tau);
    if (!best || ev > best.ev) best = { phi, tau, ev };
  }
  return { phi: best.phi, tau: best.tau };
}

/** The person's own prior sd with their piles in the model: golden-section on log phi over [EB_PHI_MIN, REFIT_PRIOR_PHI]. */
export function pilePriorPhi(n, answers, piles, { steps = STOP_EB_STEPS, tau = PILE_NOISE } = {}) {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = Math.log(EB_PHI_MIN), b = Math.log(REFIT_PRIOR_PHI);
  const ev = (x) => pileEvidence(n, answers, piles, Math.exp(x), tau);
  let c = b - g * (b - a), d = a + g * (b - a), fc = ev(c), fd = ev(d);
  for (let i = 0; i < steps; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = ev(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = ev(d); }
  }
  // The ends are candidates too: a consistent person's best phi is the ceiling.
  const cands = [[Math.log(REFIT_PRIOR_PHI), ev(Math.log(REFIT_PRIOR_PHI))], [(a + b) / 2, ev((a + b) / 2)]];
  return Math.exp(cands.sort((x, y) => y[1] - x[1])[0][0]);
}

/** The stop rules' second read: the person's own prior sd, and with piles their own pile noise too. */
function ownPrior(n, answers, piles, steps) {
  if (pilePrior(piles)) return pilePriorFit(n, answers, piles, { steps });
  if (answers.some(isSetAnswer)) return { phi: setPriorPhi(n, answers, { lo: EB_PHI_MIN, hi: REFIT_PRIOR_PHI, steps }), tau: PILE_NOISE };
  return { phi: empiricalPriorPhi(ids(n), answers.map(([w, l, t]) => ({ winner: String(w), loser: String(l), tie: !!t })), { steps }), tau: PILE_NOISE };
}

/** Golden-section steps for the stop rule's prior search; 8 is the insights route's (phi within about 4.5%). */
export const STOP_EB_STEPS = 8;

/**
 * The stop rule. The fixed prior (sd 2.0 logits) is wider than a noisy
 * person's real spread of likes, so on its own orderConfidence read 0.77
 * where the shown order's true Spearman was 0.66 (8 options, spread 3).
 * Once the fixed-prior confidence passes STOP_CONFIDENCE, the answers are
 * refit at the person's own empirical-Bayes prior sd (empiricalPriorPhi,
 * the insights route's favourite-set prior, never wider than the fixed one)
 * and the page stops only if that refit's confidence passes too. The
 * narrower prior shrinks noisy scores together, so the order reads less
 * settled; a consistent person's estimate sits at the ceiling and nothing
 * changes. Measured in docs/RANK-PAGE.md, "Noisy answerers".
 *
 * Returns { done, confidence, phi }: `confidence` is the lower of the two
 * reads once the second has run (else the fixed one), `phi` the prior sd used
 * (null when the search did not run). The search runs only after the fixed
 * check passes, so most picks cost nothing extra. `force` runs it anyway.
 */
export function stopCheck(n, answers, { fixedFit, fixedConfidence, force = false, steps = STOP_EB_STEPS, piles } = {}) {
  const f = fixedFit || fit(n, answers, piles);
  const cf = fixedConfidence ?? (answers.length ? orderConfidence(f) : 0);
  if (!answers.length || (!force && cf < STOP_CONFIDENCE)) return { done: false, confidence: cf, phi: null };
  const { phi, tau } = ownPrior(n, answers, piles, steps);
  const ce = phi >= REFIT_PRIOR_PHI * 0.999 && tau === PILE_NOISE ? cf : orderConfidence(fitAt(n, answers, phi, piles, tau));
  const confidence = Math.min(cf, ce);
  return { done: confidence >= STOP_CONFIDENCE, confidence, phi, tau: pilePrior(piles) ? tau : null };
}

const normalCdf = (z) => {
  // Abramowitz-Stegun 7.1.26 on erf; error under 1.5e-7, plenty for a progress bar.
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
};

export function diffVar({ cov, n }, i, j) {
  return Math.max(cov[i * n + i] + cov[j * n + j] - 2 * cov[i * n + j], 1e-12);
}

/** Chance item i is above item j under the posterior. */
export function chanceAbove(f, i, j) {
  return normalCdf((f.mu[i] - f.mu[j]) / Math.sqrt(diffVar(f, i, j)));
}

/** Items in posterior-mode order, best first (index breaks ties so the order is stable). */
export function order(f) {
  return f.mu.map((m, i) => [m, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
}

/** A soft cap on questions, about 2 n log2 n, so a list with near-ties still ends. */
export function suggestedMax(n) {
  return Math.max(6, Math.ceil(2 * n * Math.log2(n)));
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
 * The next pair to ask: the one whose answer is expected to tell the most
 * about the order, scored as p(1 - p) times the posterior variance of the
 * difference (the expected drop in that variance from one logistic answer,
 * to first order). In "favourite" mode only items that could still be the
 * favourite (99% set) are paired. The last pair asked is never repeated, and
 * which option sits on the left is a coin flip, so screen position cannot
 * build up into the ranking. Returns [left, right] indices.
 */
export function nextPair(f, answers, { mode = "order", seed = 1, k = 3, topPool = TOP_POOL } = {}) {
  const n = f.n;
  let pool = Array.from({ length: n }, (_, i) => i);
  if (mode === "favourite") {
    const fav = favouriteSet(f.mu, f.cov, { level: 0.99, draws: 1000, seed: 0x5eed + answers.length });
    if (fav.members.length >= 2) pool = fav.members;
  } else if (mode === "top" && k >= 1 && k < n) {
    const pIn = topKChances(f, k, { draws: TOP_DRAWS, seed: 0x70b + answers.length });
    const lo = 0.01, hi = topPool === "boundary" ? 0.99 : Infinity;
    const live = pool.filter((i) => pIn[i] >= lo && pIn[i] <= hi);
    if (live.length >= 2) pool = live;
  }
  const last = answers.at(-1);
  const asked = new Map();
  for (const a of answers) {
    if (isSetAnswer(a)) continue;
    const [w, l] = a;
    const k = w < l ? `${w},${l}` : `${l},${w}`;
    asked.set(k, (asked.get(k) || 0) + 1);
  }
  const rand = mulberry32(seed * 2654435761 + answers.length);
  let best = null, bestScore = -Infinity;
  for (let a = 0; a < pool.length; a++) {
    for (let b = a + 1; b < pool.length; b++) {
      const i = pool[a], j = pool[b];
      if (last && ((last[0] === i && last[1] === j) || (last[0] === j && last[1] === i)) && pool.length > 2) continue;
      const v = diffVar(f, i, j);
      const p = 1 / (1 + Math.exp(-(f.mu[i] - f.mu[j])));
      // A small penalty per repeat spreads questions; jitter breaks exact ties without bias.
      const score = (p * (1 - p) * v) / (1 + 0.5 * (asked.get(`${i},${j}`) || 0)) * (1 + 1e-6 * rand());
      if (score > bestScore) { bestScore = score; best = [i, j]; }
    }
  }
  return rand() < 0.5 ? best : [best[1], best[0]];
}

/** Posterior draws behind the top-k mode's pair picker and stop rule. */
export const TOP_DRAWS = 600;
/** Which options the top-k mode pairs: "boundary" (could be in or out) or "live" (could still be in). */
export const TOP_POOL = "boundary";
/** What the shortlist stop reads: "overlap" (mean share of the shown k in a draw's top k) or "exact" (the whole set). */
export const TOP_MEASURE = "overlap";

/** Each item's chance of being in the top k under the posterior (draws from sampleRanks). */
export function topKChances(f, k, { draws = TOP_DRAWS, seed = 0x70b } = {}) {
  const { ranks } = sampleRanks(f, { draws, seed });
  return ranks.map((r) => { let c = 0; for (const x of r) if (x <= k) c++; return c / draws; });
}

/** The top k in posterior-mode order (the shortlist the page shows). */
export function topK(f, k) {
  return order(f).slice(0, k);
}

/**
 * How settled the shortlist is: the posterior chance that the top k, as a
 * set, is exactly the set shown. Order inside the shortlist does not count.
 */
export function topSetConfidence(f, k, { draws = TOP_DRAWS, seed = 0x5e7, measure = TOP_MEASURE } = {}) {
  const shown = topK(f, k);
  const { ranks } = sampleRanks(f, { draws, seed });
  let sum = 0;
  for (let d = 0; d < draws; d++) {
    let in_ = 0;
    for (const i of shown) if (ranks[i][d] <= k) in_++;
    sum += measure === "exact" ? (in_ === k ? 1 : 0) : in_ / k;
  }
  return sum / draws;
}

/**
 * The top-k mode's stop rule, built like stopCheck: the shortlist must read
 * STOP_CONFIDENCE at the fixed prior and, once it does, again at the
 * person's own empirical-Bayes prior, so a run of close calls is not read as
 * a settled shortlist. Returns { done, confidence, phi }.
 */
export function topStopCheck(n, answers, k, { fixedFit, force = false, steps = STOP_EB_STEPS, measure = TOP_MEASURE, level = STOP_CONFIDENCE, piles } = {}) {
  const f = fixedFit || fit(n, answers, piles);
  const cf = answers.length ? topSetConfidence(f, k, { measure }) : 0;
  if (!answers.length || (!force && cf < level)) return { done: false, confidence: cf, phi: null };
  const { phi, tau } = ownPrior(n, answers, piles, steps);
  const ce = phi >= REFIT_PRIOR_PHI * 0.999 && tau === PILE_NOISE ? cf : topSetConfidence(fitAt(n, answers, phi, piles, tau), k, { measure });
  const confidence = Math.min(cf, ce);
  return { done: confidence >= level, confidence, phi };
}

/**
 * Draws orders from the Gaussian posterior: ranks[item][draw] (1 = top) and
 * how often each item came first. Fixed seed, so the same answers always
 * give the same table.
 */
export function sampleRanks(f, { draws = RANK_DRAWS, seed = 0x51ce } = {}) {
  const n = f.n;
  const l = cholesky(Float64Array.from(f.cov, (x, k) => x + (k % (n + 1) === 0 ? 1e-9 : 0)), n);
  const rand = mulberry32(seed);
  const ranks = Array.from({ length: n }, () => new Uint16Array(draws));
  const top = new Array(n).fill(0);
  const z = new Float64Array(n), s = new Float64Array(n);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let d = 0; d < draws; d++) {
    for (let a = 0; a < n; a += 2) {
      const u = 1 - rand(), v = rand();
      const r = Math.sqrt(-2 * Math.log(u));
      z[a] = r * Math.cos(2 * Math.PI * v);
      if (a + 1 < n) z[a + 1] = r * Math.sin(2 * Math.PI * v);
    }
    for (let a = 0; a < n; a++) {
      let x = f.mu[a];
      for (let b = 0; b <= a; b++) x += l[a * n + b] * z[b];
      s[a] = x;
    }
    idx.sort((p, q) => s[q] - s[p]);
    idx.forEach((item, r) => (ranks[item][d] = r + 1));
    top[idx[0]]++;
  }
  return { ranks, top, draws };
}

/**
 * Rank ranges: for each item, the middle 90% of its rank over the posterior
 * draws, and its chance of being the favourite, in posterior-mode order.
 */
export function rankTable(f, options = {}) {
  return tableFromDraws(f, sampleRanks(f, options), options.shownOrder);
}

function tableFromDraws(f, { ranks, top, draws }, shownOrder) {
  const lo = Math.floor(0.05 * draws), hi = Math.min(draws - 1, Math.ceil(0.95 * draws) - 1);
  return (shownOrder || order(f)).map((i, k) => {
    const sorted = Array.from(ranks[i]).sort((a, b) => a - b);
    return { item: i, rank: k + 1, low: sorted[lo], high: sorted[hi], favourite: top[i] / draws, score: f.mu[i] };
  });
}

/**
 * The fit the results table is drawn from: the answers refit at the person's
 * own prior sd (and pile noise), the stop rule's second read, so the 90% rank
 * ranges and favourite chances stop reading answer noise as real separation.
 * At the fixed prior the table told simulated near-coin-flip answerers (8
 * options) their top pick had a 61% chance of being the true favourite when
 * it was 25% of the time, and its 90% ranges held the true rank 80% of the
 * time; a consistent person's prior sits at the ceiling and nothing changes
 * (docs/RANK-PAGE.md, "Honest results for close calls"). Returns the fit and
 * the fixed fit's order, which the page keeps showing (the own-prior order
 * can differ by a swap of near-ties, and the stop rule measured that order).
 */
export function resultsFit(n, answers, { fixedFit, piles, steps = STOP_EB_STEPS } = {}) {
  const f = fixedFit || fit(n, answers, piles);
  if (!answers.length) return { fit: f, shownOrder: order(f), phi: REFIT_PRIOR_PHI, tau: null };
  const { phi, tau } = ownPrior(n, answers, piles, steps);
  const same = phi >= REFIT_PRIOR_PHI * 0.999 && tau === PILE_NOISE;
  return { fit: same ? f : fitAt(n, answers, phi, piles, tau), shownOrder: order(f), phi, tau: pilePrior(piles) ? tau : null };
}

/** The results table at the person's own prior (resultsFit), rows in the order shown. */
export function resultsTable(n, answers, options = {}) {
  const r = resultsFit(n, answers, options);
  return { table: rankTable(r.fit, { shownOrder: r.shownOrder }), ...r };
}

/** The person's own prior sd for their answers (the stop rule's second read; REFIT_PRIOR_PHI at most). */
export function ownPriorPhi(n, answers, piles, steps = STOP_EB_STEPS) {
  return answers.length ? ownPrior(n, answers, piles, steps).phi : REFIT_PRIOR_PHI;
}

/**
 * How settled the order is: the posterior mean of the Spearman correlation
 * between a plausible order (a draw) and the order shown (the mode). 1 means
 * every order the answers allow is the one shown; an unseen list reads near 0.
 * Two options a person genuinely finds close cost little here (one swapped
 * neighbour is a small Spearman loss), so unlike a "every neighbour settled"
 * rule it can be reached by a respondent who answers with ordinary noise.
 */
export function orderConfidence(f, { draws = 400, seed = 0xc0f1, shownOrder } = {}) {
  const n = f.n;
  if (n < 2) return 1;
  const { ranks } = sampleRanks(f, { draws, seed });
  const shown = new Array(n);
  (shownOrder || order(f)).forEach((item, k) => (shown[item] = k + 1));
  let sum = 0;
  for (let d = 0; d < draws; d++) {
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (ranks[i][d] - shown[i]) ** 2;
    sum += 1 - (6 * d2) / (n * (n * n - 1));
  }
  return sum / draws;
}

/** Scores on a 0-100 scale for display: the chance the item beats an average item on the list. */
export function displayScore(f, i) {
  const mean = f.mu.reduce((a, b) => a + b, 0) / f.n;
  return Math.round(100 / (1 + Math.exp(-(f.mu[i] - mean))));
}

/** The results as CSV, for a spreadsheet. */
/**
 * One quoted CSV cell. An option typed as "=HYPERLINK(...)" or "+1 call" would
 * run as a formula when the file is opened in a spreadsheet, so a cell that
 * starts with =, +, -, @, tab or CR (and is not a plain number) gets a leading
 * apostrophe, the usual guard against formula injection.
 */
export function csvCell(c) {
  let s = String(c);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function resultsCsv(items, f, table) {
  const q = csvCell;
  const rows = [["rank", "option", "rank_range_90", "chance_favourite", "score_0_100"].join(",")];
  for (const r of table) rows.push([r.rank, q(items[r.item]), q(r.low === r.high ? `${r.low}` : `${r.low}-${r.high}`), r.favourite.toFixed(3), displayScore(f, r.item)].join(","));
  return rows.join("\n") + "\n";
}

/**
 * A team's combined order from several people's codes. Each person's answers
 * are refit alone, then the team score of an item is the mean of the
 * people's centred scores, so a person who answered more does not count more
 * than one who answered less. `agreement` is the mean pairwise Spearman
 * correlation between people's orders (1 = everyone agrees).
 */
export function combine(items, people) {
  const n = items.length;
  const fits = people.map((p) => fit(n, p.answers, p.piles));
  const centred = fits.map((f) => {
    const m = f.mu.reduce((a, b) => a + b, 0) / n;
    return f.mu.map((x) => x - m);
  });
  const team = Array.from({ length: n }, (_, i) => centred.reduce((a, c) => a + c[i], 0) / Math.max(1, centred.length));
  const teamOrder = team.map((m, i) => [m, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
  const rankOf = (f) => {
    const r = new Array(n);
    order(f).forEach((item, k) => (r[item] = k));
    return r;
  };
  const ranks = fits.map(rankOf);
  let sum = 0, pairs = 0;
  for (let a = 0; a < ranks.length; a++) for (let b = a + 1; b < ranks.length; b++) {
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (ranks[a][i] - ranks[b][i]) ** 2;
    sum += 1 - (6 * d2) / (n * (n * n - 1));
    pairs++;
  }
  // Where people disagree most: the spread of each item's rank across people.
  const spread = Array.from({ length: n }, (_, i) => {
    const r = ranks.map((x) => x[i] + 1);
    return { item: i, best: Math.min(...r), worst: Math.max(...r) };
  });
  return {
    order: teamOrder.map((i, k) => ({ item: i, rank: k + 1, score: team[i], best: spread[i].best, worst: spread[i].worst, firsts: ranks.filter((r) => r[i] === 0).length })),
    agreement: pairs ? sum / pairs : null,
    people: people.length,
  };
}

/*
 * Team rank ranges (2026-11-14, docs/RANK-PAGE.md "Team ranges").
 *
 * `combine` gives a team order but no uncertainty. Two different questions
 * have different answers here:
 *
 * - "this group": the order of the members' own average likes. People's
 *   differences are part of the answer, not noise, so the only uncertainty is
 *   each person's own (few picks). Under the refit's independent priors the
 *   mean of the members' scores has posterior mean = mean of their refits and
 *   covariance = sum of their covariances / m^2. `groupFit`.
 * - "people like these": the order for the wider group they were drawn from
 *   (the customers five interviews stand for). Then disagreement is sampling
 *   noise and must widen the ranges. Each person's scores are the group's
 *   plus their own N(0, tau^2) deviation per option; tau is fitted to the
 *   codes by marginal likelihood (`populationFit`). This is the pooled model
 *   the app's survey ranking uses (random effects, groupRanking.ts pool), done
 *   jointly over the options on the refit's Gaussian approximation.
 */

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * One person's Bradley-Terry log likelihood as a quadratic around a point c:
 * curvature J (p(1 - p) per answer, at c) and linear term h = grad + J c, so
 * the likelihood is about exp(-b'Jb/2 + h'b). J is singular for options they
 * never saw, which the Woodbury form below handles without inverting it.
 */
export function linearize(n, answers, c, terms = null) {
  const J = new Float64Array(n * n);
  const grad = new Array(n).fill(0);
  let ll = 0;
  // Best-worst screens: their exact terms (observed information) from best-worst.mjs.
  const screens = answers.filter(isSetAnswer);
  if (screens.length) {
    const t = answerTerms(n, screens, c);
    ll += t.ll;
    for (let i = 0; i < n; i++) grad[i] += t.grad[i];
    for (let k = 0; k < n * n; k++) J[k] += t.J[k];
  }
  for (const a of answers) {
    if (isSetAnswer(a)) continue;
    const [w, l, t] = a;
    const p = sigmoid(c[w] - c[l]);
    const v = p * (1 - p), score = t ? 0.5 : 1;
    // log p and log(1 - p) without overflow for large gaps.
    const d = c[w] - c[l], logP = -Math.log1p(Math.exp(-d)), log1mP = -Math.log1p(Math.exp(d));
    ll += score * (Number.isFinite(logP) ? logP : d) + (1 - score) * (Number.isFinite(log1mP) ? log1mP : -d);
    grad[w] += score - p; grad[l] -= score - p;
    J[w * n + w] += v; J[l * n + l] += v; J[w * n + l] -= v; J[l * n + w] -= v;
  }
  // Pile terms (pileTerms; a list of them when several people's are pooled): exactly quadratic,
  // so they add lam to J and eta to h and nothing to k.
  for (const t of [terms].flat()) {
    if (!t) continue;
    for (let i = 0; i < n; i++) { J[i * n + i] += t.lam[i]; ll += -0.5 * t.lam[i] * c[i] * c[i] + t.eta[i] * c[i]; grad[i] += t.eta[i] - t.lam[i] * c[i]; }
  }
  const h = grad.map((g, i) => {
    let s = g;
    for (let j = 0; j < n; j++) s += J[i * n + j] * c[j];
    return s;
  });
  // The quadratic is q(b) = k + h'b - b'Jb/2 with k = l(c) - grad'c - c'Jc/2.
  // k moves with the expansion point, so the marginal likelihood must keep it
  // whenever c depends on tau (dropping it is PQL, not Laplace; see
  // docs/RANK-PAGE.md "Team ranges").
  let k = ll;
  for (let i = 0; i < n; i++) {
    k -= grad[i] * c[i];
    let jc = 0;
    for (let j = 0; j < n; j++) jc += J[i * n + j] * c[j];
    k -= 0.5 * c[i] * jc;
  }
  return { J, h, k };
}

/** One person's refit and their likelihood linearised at it (the starting point of populationAt). */
export function personInfo(n, answers, piles) {
  const f = fit(n, answers, piles);
  const terms = pileTerms(piles);
  return { f, answers, terms, ...linearize(n, answers, f.mu, terms) };
}

/** A person's posterior mode under the prior N(m0, s2 I): Newton, which the Gaussian prior keeps concave. */
export function modeAround(n, answers, m0, s2, start = m0, terms = null) {
  let b = start.slice();
  for (let it = 0; it < 50; it++) {
    const { J, h } = linearize(n, answers, b, terms);
    // Newton: (J + I/s2) b_new = h + m0/s2 (h already holds grad + J b).
    const H = Float64Array.from(J, (x, k) => x + (k % (n + 1) === 0 ? 1 / s2 : 0));
    const next = cholSolve(cholesky(H, n), n, h.map((x, i) => x + m0[i] / s2));
    const moved = Math.max(...next.map((x, i) => Math.abs(x - b[i])));
    b = next;
    if (moved < 1e-8) break;
  }
  return b;
}

/** "This group": the posterior of the members' mean scores. */
export function groupFit(n, people) {
  const fits = people.map((p) => (p.f ? p.f : fit(n, p.answers, p.piles)));
  const m = Math.max(1, fits.length);
  const mu = Array.from({ length: n }, (_, i) => fits.reduce((a, f) => a + f.mu[i], 0) / m);
  const cov = new Float64Array(n * n);
  for (const f of fits) for (let k = 0; k < n * n; k++) cov[k] += f.cov[k] / (m * m);
  return { mu, cov, n };
}

function solveColumns(l, n, M) {
  const out = new Float64Array(n * n);
  for (let c = 0; c < n; c++) {
    const col = cholSolve(l, n, Array.from({ length: n }, (_, r) => M[r * n + c]));
    for (let r = 0; r < n; r++) out[r * n + c] = col[r];
  }
  return out;
}

/**
 * The population posterior at a given tau (logits) and its log marginal
 * likelihood (up to a constant that does not depend on tau). With
 * B_p = I + tau^2 J_p: precision P = sum B_p^-1 J_p + I / phi^2, mean
 * P^-1 sum B_p^-1 h_p, and
 * log L = sum_p (-log|B_p| / 2 + tau^2 h_p' B_p^-1 h_p / 2) - log|P| / 2 + g' P^-1 g / 2.
 * tau = 0 is every answer in one fit (no disagreement allowed).
 */
function populationFromInfos(n, infos, tau, phi, laplace = true) {
  const t2 = tau * tau;
  const P = new Float64Array(n * n);
  const g = new Array(n).fill(0);
  let ll = 0;
  for (const { J, h, k = 0 } of infos) {
    if (laplace) ll += k;
    const B = Float64Array.from(J, (x, k) => t2 * x + (k % (n + 1) === 0 ? 1 : 0));
    const L = cholesky(B, n);
    for (let i = 0; i < n; i++) ll -= Math.log(L[i * n + i]);
    const Ah = cholSolve(L, n, h);
    for (let i = 0; i < n; i++) { g[i] += Ah[i]; ll += 0.5 * t2 * h[i] * Ah[i]; }
    const M = t2 === 0 ? J : solveColumns(L, n, J);
    for (let k = 0; k < n * n; k++) P[k] += M[k];
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) { const s = (P[i * n + j] + P[j * n + i]) / 2; P[i * n + j] = s; P[j * n + i] = s; }
  for (let i = 0; i < n; i++) P[i * n + i] += 1 / (phi * phi);
  const LP = cholesky(P, n);
  for (let i = 0; i < n; i++) ll -= Math.log(LP[i * n + i]);
  const mu = cholSolve(LP, n, g);
  for (let i = 0; i < n; i++) ll += 0.5 * g[i] * mu[i];
  return { mu, cov: cholInverse(LP, n), n, tau, logLik: ll };
}

/**
 * The Laplace read: each person's likelihood is linearised at their mode
 * given the current group estimate and tau (modeAround), not at their own
 * refit. Linearised at the refit alone (its prior pulls every score toward 0,
 * so p(1 - p) and the curvature come out too high), the marginal likelihood
 * put tau near 0 for 10 people who truly differed by 2 logits; the same
 * formula on Gaussian data with the same J recovered it (docs/RANK-PAGE.md,
 * "Team ranges"). tau = 0 is every answer read as one person's.
 */
export function populationAt(n, people, tau, { phi = REFIT_PRIOR_PHI, passes = TEAM_PASSES, laplace = true } = {}) {
  let infos = people.map((p) => (p.J ? p : personInfo(n, p.answers, p.piles)));
  if (tau === 0) {
    const all = infos.flatMap((p) => p.answers);
    const terms = infos.map((p) => p.terms).filter(Boolean);
    const m = modeAround(n, all, new Array(n).fill(0), phi * phi, undefined, terms);
    return populationFromInfos(n, [linearize(n, all, m, terms)], 0, phi, laplace);
  }
  let r = populationFromInfos(n, infos, tau, phi, laplace);
  let modes = infos.map((p) => (p.f ? p.f.mu : r.mu));
  for (let k = 0; k < passes; k++) {
    modes = infos.map((p, i) => modeAround(n, p.answers, r.mu, tau * tau, modes[i], p.terms));
    infos = infos.map((p, i) => ({ answers: p.answers, terms: p.terms, ...linearize(n, p.answers, modes[i], p.terms) }));
    r = populationFromInfos(n, infos, tau, phi, laplace);
  }
  return r;
}

/** Relinearisation passes in populationAt. */
export const TEAM_PASSES = 4;

/** tau = 0 is tried, then golden-section steps on log tau over [TEAM_TAU_MIN, TEAM_TAU_MAX] logits. */
export const TEAM_TAU_MIN = 0.05;
export const TEAM_TAU_MAX = 5;
export const TEAM_TAU_STEPS = 10;

/** "People like these": the population posterior at the tau that best explains the codes. */
export function populationFit(n, people, { steps = TEAM_TAU_STEPS, laplace = true } = {}) {
  const infos = people.map((p) => (p.J ? p : personInfo(n, p.answers, p.piles)));
  const memo = new Map();
  const at = (tau) => {
    if (!memo.has(tau)) memo.set(tau, populationAt(n, infos, tau, { laplace }));
    return memo.get(tau);
  };
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = Math.log(TEAM_TAU_MIN), b = Math.log(TEAM_TAU_MAX);
  let c = b - gr * (b - a), d = a + gr * (b - a);
  for (let k = 0; k < steps; k++) {
    if (at(Math.exp(c)).logLik >= at(Math.exp(d)).logLik) { b = d; d = c; c = b - gr * (b - a); }
    else { a = c; c = d; d = a + gr * (b - a); }
  }
  let best = at(0);
  for (const r of memo.values()) if (r.logLik > best.logLik) best = r;
  return best;
}

/**
 * Both team reads with 90% rank ranges, in the group's order. `tau` is the
 * fitted spread of people's likes around the group's (logits; 0 = the codes
 * are consistent with everyone wanting the same).
 */
export function teamRanges(items, people, options = {}) {
  const n = items.length;
  const { k, ...rankOptions } = options;
  const infos = people.map((p) => personInfo(n, p.answers, p.piles));
  const g = groupFit(n, infos);
  const pop = populationFit(n, infos);
  const gt = rankTable(g, rankOptions), pt = rankTable(pop, rankOptions);
  const popBy = new Map(pt.map((r) => [r.item, r]));
  return {
    tau: pop.tau,
    rows: gt.map((r) => ({ item: r.item, rank: r.rank, low: r.low, high: r.high, favourite: r.favourite, popLow: popBy.get(r.item).low, popHigh: popBy.get(r.item).high, popFavourite: popBy.get(r.item).favourite })),
    ...(k ? { shortlist: shortlistFrom(n, infos, g, pop, k) } : {}),
  };
}

/*
 * A team's top k (2026-11-14, docs/RANK-PAGE.md "A team's shortlist").
 * The shortlist is the group order's top k (the same order as the team
 * table). Each option gets two chances of really being in the top k: for
 * this group (groupFit) and for the wider group these people stand for
 * (populationFit, which widens when people disagree). `votes` counts the
 * people whose own top k includes the option, the tally a team would make by
 * hand; scripts/team-shortlist-sweep.mjs measures it against the model.
 */
function shortlistFrom(n, infos, g, pop, k, { draws = TOP_DRAWS } = {}) {
  const shown = topK(g, k);
  const votes = new Array(n).fill(0);
  for (const p of infos) for (const i of topK(p.f, k)) votes[i]++;
  return {
    k,
    items: shown,
    next: order(g)[k],
    group: topKChances(g, k, { draws }),
    wider: topKChances(pop, k, { draws }),
    votes,
    groupSettled: topSetConfidence(g, k, { draws }),
  };
}

/** The team shortlist alone (teamRanges with k returns it alongside the ranges). */
export function teamShortlist(items, people, k, options = {}) {
  const n = items.length;
  const infos = people.map((p) => personInfo(n, p.answers, p.piles));
  return shortlistFrom(n, infos, groupFit(n, infos), populationFit(n, infos), k, options);
}

/** A tally by hand: the k options most people put in their own top k, ties broken by the group order. */
export function approvalShortlist(n, people, k) {
  const infos = people.map((p) => (p.f ? p : { f: fit(n, p.answers, p.piles) }));
  const votes = new Array(n).fill(0);
  for (const p of infos) for (const i of topK(p.f, k)) votes[i]++;
  const g = groupFit(n, infos);
  const place = new Array(n);
  order(g).forEach((i, r) => (place[i] = r));
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => votes[b] - votes[a] || place[a] - place[b]).slice(0, k);
}
