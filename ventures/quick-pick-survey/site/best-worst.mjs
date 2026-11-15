// Best-worst screens ("MaxDiff") for the ranker (2026-11-15, docs/RANK-PAGE.md
// "Best and worst of four").
//
// A screen shows up to BW_SET_SIZE options; the person taps the one they like
// most, then the one they like least. The answer is read with the sequential
// best-worst model that extends the refit's own Bradley-Terry link: the best
// is a softmax choice over the screen, P(b) = e^{s_b} / sum_S e^{s}, and the
// worst a softmax choice of the lowest among the rest, P(w | b) =
// e^{-s_w} / sum_{S \ b} e^{-s}. On a screen of two this is exactly one
// Bradley-Terry pick, so pairs and screens share one likelihood and one
// refit. It is not decomposed into implied pairs: four options give five
// implied pairs, and counting them as five independent picks overstates
// what one screen says (the pairs share the same two taps), which would make
// the 90% ranges too narrow and the stop rule fire early.
//
// The log likelihood is a sum of log-softmax terms of linear functions, so it
// is concave and Newton under the Gaussian prior converges as the refit does.

import { cholesky, cholSolve, cholInverse } from "./engine/btRefit.mjs";

/** Options per screen. Four is the usual MaxDiff screen; measured against pairs in RANK-PAGE.md. */
export const BW_SET_SIZE = 4;

/** A best-worst answer is { set, best, worst }; a pick is a [winner, loser, tie] triple. */
export const isSetAnswer = (a) => !!a && !Array.isArray(a) && Array.isArray(a.set);

/** Checks a best-worst answer against a list of n options; returns an error string or null. */
export function setAnswerError(a, n) {
  if (!isSetAnswer(a)) return "not a best-worst answer";
  const { set, best, worst } = a;
  if (set.length < 2) return "a screen needs two options";
  if (!set.every((i) => Number.isInteger(i) && i >= 0 && i < n)) return "an option outside the list";
  if (new Set(set).size !== set.length) return "an option twice on one screen";
  if (!set.includes(best) || !set.includes(worst)) return "best or worst not on the screen";
  if (best === worst) return "best and worst are the same option";
  return null;
}

/**
 * Log likelihood, gradient and observed information (negative Hessian) of
 * picks and screens at mu. A tie (pairs only) counts half a win each way, as
 * in the refit. Returns { ll, grad, J } with J a flat n x n array.
 */
export function answerTerms(n, answers, mu) {
  const grad = new Array(n).fill(0);
  const J = new Float64Array(n * n);
  let ll = 0;
  const softmax = (S, k, sign) => {
    let mx = -Infinity;
    for (const i of S) mx = Math.max(mx, sign * mu[i]);
    let z = 0;
    for (const i of S) z += Math.exp(sign * mu[i] - mx);
    const lse = mx + Math.log(z);
    ll += sign * mu[k] - lse;
    const p = S.map((i) => Math.exp(sign * mu[i] - lse));
    S.forEach((i, a) => {
      grad[i] += sign * ((i === k ? 1 : 0) - p[a]);
      S.forEach((j, b) => (J[i * n + j] += (a === b ? p[a] : 0) - p[a] * p[b]));
    });
  };
  for (const a of answers) {
    if (isSetAnswer(a)) {
      softmax(a.set, a.best, 1);
      const rest = a.set.filter((i) => i !== a.best);
      if (rest.length >= 2) softmax(rest, a.worst, -1);
      continue;
    }
    const [w, l, t] = a;
    const d = mu[w] - mu[l], y = t ? 0.5 : 1;
    const p = 1 / (1 + Math.exp(-d));
    const logP = -Math.log1p(Math.exp(-d)), log1mP = -Math.log1p(Math.exp(d));
    ll += y * (Number.isFinite(logP) ? logP : d) + (1 - y) * (Number.isFinite(log1mP) ? log1mP : -d);
    grad[w] += y - p; grad[l] -= y - p;
    const v = p * (1 - p);
    J[w * n + w] += v; J[l * n + l] += v; J[w * n + l] -= v; J[l * n + w] -= v;
  }
  return { ll, grad, J };
}

/**
 * The refit over picks and screens together: posterior mode and Laplace
 * covariance under independent N(priorMean_i, priorScale_i^2) priors (the
 * plain prior is mean 0, sd phi). Returns { mu, cov, n, logPost }.
 */
export function setFitAt(n, answers, { phi, priorMean, priorScale, maxIterations = 60, tolerance = 1e-9 } = {}) {
  const m0 = priorMean || new Array(n).fill(0);
  const s2 = (priorScale || new Array(n).fill(phi)).map((s) => s * s);
  const logPost = (mu) => answerTerms(n, answers, mu).ll - mu.reduce((s, x, i) => s + ((x - m0[i]) ** 2) / (2 * s2[i]), 0);
  let mu = m0.slice();
  let current = logPost(mu);
  for (let it = 0; it < maxIterations; it++) {
    const { grad, J } = answerTerms(n, answers, mu);
    const H = Float64Array.from(J);
    for (let i = 0; i < n; i++) { H[i * n + i] += 1 / s2[i]; grad[i] -= (mu[i] - m0[i]) / s2[i]; }
    const step = cholSolve(cholesky(H, n), n, grad);
    let t = 1, next = mu.map((x, i) => x + step[i]), value = logPost(next);
    while (value < current - 1e-12 && t > 1e-6) { t /= 2; next = mu.map((x, i) => x + t * step[i]); value = logPost(next); }
    mu = next; current = value;
    if (Math.max(0, ...step.map((s) => Math.abs(t * s))) < tolerance) break;
  }
  const { J } = answerTerms(n, answers, mu);
  const H = Float64Array.from(J);
  for (let i = 0; i < n; i++) H[i * n + i] += 1 / s2[i];
  const L = cholesky(H, n);
  return { mu, cov: cholInverse(L, n), n, logPost: current, chol: L };
}

/**
 * Laplace log evidence of the answers at prior sd phi (prior centred on 0):
 * log p(answers | mu*) + log prior(mu*) + (n/2) log 2 pi - (1/2) log det H.
 * The person's own prior sd is the phi that maximises it (setPriorPhi).
 */
export function setEvidence(n, answers, phi, opts = {}) {
  const f = setFitAt(n, answers, { phi, ...opts });
  const s2 = (opts.priorScale || new Array(n).fill(phi)).map((s) => s * s);
  let logDetH = 0;
  for (let i = 0; i < n; i++) logDetH += 2 * Math.log(f.chol[i * n + i]);
  let normConst = 0;
  for (let i = 0; i < n; i++) normConst -= 0.5 * Math.log(2 * Math.PI * s2[i]);
  return f.logPost + normConst + 0.5 * n * Math.log(2 * Math.PI) - 0.5 * logDetH;
}

/** Golden-section search on log phi over [lo, hi]; the ends are candidates (a consistent person's best phi is the ceiling). */
export function setPriorPhi(n, answers, { lo, hi, steps = 8 } = {}) {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = Math.log(lo), b = Math.log(hi);
  const ev = (x) => setEvidence(n, answers, Math.exp(x));
  let c = b - g * (b - a), d = a + g * (b - a), fc = ev(c), fd = ev(d);
  for (let i = 0; i < steps; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = ev(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = ev(d); }
  }
  const cands = [[b, ev(b)], [(a + b) / 2, ev((a + b) / 2)], [Math.log(hi), ev(Math.log(hi))]];
  return Math.exp(cands.sort((x, y) => y[1] - x[1])[0][0]);
}

/** Expected information of one best-worst answer on screen S at mu, as an m x m matrix over S's positions. */
export function screenInfo(mu, S) {
  const m = S.length;
  const I = Array.from({ length: m }, () => new Array(m).fill(0));
  const soft = (idx, sign) => {
    const mx = Math.max(...idx.map((a) => sign * mu[S[a]]));
    const e = idx.map((a) => Math.exp(sign * mu[S[a]] - mx));
    const z = e.reduce((x, y) => x + y, 0);
    return e.map((x) => x / z);
  };
  const add = (idx, p, w) => idx.forEach((a, u) => idx.forEach((b, v) => (I[a][b] += w * ((u === v ? p[u] : 0) - p[u] * p[v]))));
  const all = S.map((_, a) => a);
  const pb = soft(all, 1);
  add(all, pb, 1);
  if (m >= 3) all.forEach((b) => { const rest = all.filter((a) => a !== b); add(rest, soft(rest, -1), pb[b]); });
  return I;
}

function det(M) {
  const A = M.map((r) => r.slice());
  const m = A.length;
  let d = 1;
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return 0;
    if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; d = -d; }
    d *= A[c][c];
    for (let r = c + 1; r < m; r++) { const k = A[r][c] / A[c][c]; for (let j = c; j < m; j++) A[r][j] -= k * A[c][j]; }
  }
  return d;
}

/**
 * Expected information gain of a screen under the Gaussian posterior,
 * (1/2) log det(I + I_S Cov_SS): the drop in posterior entropy one answer is
 * expected to bring if the model were linear. For a pair it is
 * (1/2) log(1 + p(1 - p) Var(s_i - s_j)), the pair picker's score made
 * monotone, and it credits a screen less for options the posterior already
 * ties together.
 */
export function screenGain(f, S) {
  const I = screenInfo(f.mu, S);
  const m = S.length, n = f.n;
  const M = Array.from({ length: m }, (_, a) => Array.from({ length: m }, (_, b) => {
    let s = a === b ? 1 : 0;
    for (let c = 0; c < m; c++) s += I[a][c] * f.cov[S[c] * n + S[b]];
    return s;
  }));
  return 0.5 * Math.log(Math.max(det(M), 1e-300));
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
 * The next screen: greedy on screenGain. Start from the most informative
 * pair, then add the option that raises the screen's gain most, up to
 * `size`. The same set as the last screen is never asked twice in a row (a
 * pair with the next-best start replaces it), and the options are shown in a
 * shuffled order so screen position cannot build up into the ranking.
 */
export function nextScreen(f, answers, { size = BW_SET_SIZE, seed = 1 } = {}) {
  const n = f.n;
  const rand = mulberry32(seed * 2654435761 + answers.length);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (n <= size) return shuffle(Array.from({ length: n }, (_, i) => i));
  const last = answers.at(-1);
  const lastKey = isSetAnswer(last) ? [...last.set].sort((a, b) => a - b).join(",") : null;
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([screenGain(f, [i, j]) * (1 + 1e-6 * rand()), i, j]);
  pairs.sort((a, b) => b[0] - a[0]);
  for (const [, i, j] of pairs.slice(0, 3)) {
    const S = [i, j];
    while (S.length < size) {
      let best = -1, bestGain = -Infinity;
      for (let k = 0; k < n; k++) {
        if (S.includes(k)) continue;
        const g = screenGain(f, [...S, k]);
        if (g > bestGain) { bestGain = g; best = k; }
      }
      S.push(best);
    }
    if ([...S].sort((a, b) => a - b).join(",") !== lastKey) return shuffle(S);
  }
  return shuffle([pairs[0][1], pairs[0][2], ...Array.from({ length: n }, (_, i) => i).filter((i) => i !== pairs[0][1] && i !== pairs[0][2]).slice(0, size - 2)]);
}

/** A simulated person's answer to screen S: best by Gumbel-max on s, worst by Gumbel-max on -s among the rest (the model's own process). */
export function simulateScreen(truth, S, rand) {
  const gumbel = () => -Math.log(-Math.log(rand() || 1e-12) || 1e-12);
  const pick = (idx, sign) => idx.map((i) => [sign * truth[i] + gumbel(), i]).sort((a, b) => b[0] - a[0])[0][1];
  const best = pick(S, 1);
  const worst = pick(S.filter((i) => i !== best), -1);
  return { set: S.slice(), best, worst };
}
