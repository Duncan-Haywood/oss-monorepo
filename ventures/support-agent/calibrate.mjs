// Fit the confidence model to labelled questions: for every question the agent would answer, did the best match name
// the right article? A logistic regression on the signals in agent.mjs FEATURES (standardised, L2-penalised, fitted
// by gradient descent; a few thousand rows take well under a second). No dependencies; runs in a browser too.
//   const cal = calibrate(agent, cases);   buildAgent(articles, { calibration: cal })
import { decide, features, rankArticles, FEATURES } from "./agent.mjs";

export function trainingRows(agent, cases) {
  const rows = [];
  for (const c of cases) {
    const d = decide(agent, c.question, { threshold: 0 });
    if (d.action !== "answer") continue; // rules and clarifying questions do not depend on confidence
    rows.push({ f: d.features, y: c.expect.includes(d.citations[0].articleId) ? 1 : 0 });
  }
  return rows;
}

export function fitLogistic(rows, { l2 = 1, iters = 3000, rate = 0.5 } = {}) {
  const mean = {}, sd = {};
  for (const k of FEATURES) {
    const xs = rows.map((r) => r.f[k]); mean[k] = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    sd[k] = Math.sqrt(xs.reduce((a, b) => a + (b - mean[k]) ** 2, 0) / (xs.length || 1)) || 1;
  }
  const X = rows.map((r) => FEATURES.map((k) => (r.f[k] - mean[k]) / sd[k])), y = rows.map((r) => r.y), n = rows.length || 1;
  const w = FEATURES.map(() => 0); let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = w.map((wi) => (l2 * wi) / n); let gb = 0;
    for (let i = 0; i < X.length; i++) {
      let z = b; for (let j = 0; j < w.length; j++) z += w[j] * X[i][j];
      const e = 1 / (1 + Math.exp(-z)) - y[i]; gb += e / n;
      for (let j = 0; j < w.length; j++) gw[j] += (e * X[i][j]) / n;
    }
    b -= rate * gb; for (let j = 0; j < w.length; j++) w[j] -= rate * gw[j];
  }
  const round = (x) => Math.round(x * 1e4) / 1e4;
  return { weights: Object.fromEntries(FEATURES.map((k, j) => [k, round(w[j])])), bias: round(b),
    mean: Object.fromEntries(FEATURES.map((k) => [k, round(mean[k])])), sd: Object.fromEntries(FEATURES.map((k) => [k, round(sd[k])])), rows: rows.length };
}

export function calibrate(agent, cases, opts) { return fitLogistic(trainingRows(agent, cases), opts); }
