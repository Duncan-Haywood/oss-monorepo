// node --test site/best-worst.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerTerms, setFitAt, screenGain, screenInfo, nextScreen, simulateScreen, setAnswerError, BW_SET_SIZE } from "./best-worst.mjs";
import { fit, encodeAnswers, decodeAnswers, order, diffVar, stopCheck, teamRanges, combine, linearize, orderConfidence } from "./rank-core.mjs";
import { REFIT_PRIOR_PHI } from "./engine/btRefit.mjs";

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
const spearman = (shown, truth) => {
  const n = truth.length, tr = new Array(n), sr = new Array(n);
  truth.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).forEach(([, i], k) => (tr[i] = k));
  shown.forEach((i, k) => (sr[i] = k));
  return 1 - (6 * tr.reduce((s, r, i) => s + (r - sr[i]) ** 2, 0)) / (n * (n * n - 1));
};

test("a two-option screen is exactly one Bradley-Terry pick", () => {
  const picks = [[0, 1, false], [2, 1, false], [0, 2, false], [1, 3, false]];
  const screens = picks.map(([w, l]) => ({ set: [l, w], best: w, worst: l }));
  const a = fit(4, picks), b = fit(4, screens);
  a.mu.forEach((m, i) => assert.ok(Math.abs(m - b.mu[i]) < 1e-6, `mu ${i}`));
  for (let k = 0; k < 16; k++) assert.ok(Math.abs(a.cov[k] - b.cov[k]) < 1e-6, `cov ${k}`);
});

test("answerTerms' gradient and information match finite differences", () => {
  const n = 6, mu = [0.3, -1.2, 0.8, 0.1, -0.4, 1.5];
  const answers = [{ set: [0, 2, 4, 5], best: 5, worst: 4 }, { set: [1, 3, 2], best: 2, worst: 1 }, [0, 3, true], [2, 1, false]];
  const { grad, J } = answerTerms(n, answers, mu);
  const h = 1e-5;
  for (let i = 0; i < n; i++) {
    const up = mu.slice(), dn = mu.slice();
    up[i] += h; dn[i] -= h;
    const num = (answerTerms(n, answers, up).ll - answerTerms(n, answers, dn).ll) / (2 * h);
    assert.ok(Math.abs(num - grad[i]) < 1e-6, `grad ${i}`);
    const gu = answerTerms(n, answers, up).grad, gd = answerTerms(n, answers, dn).grad;
    for (let j = 0; j < n; j++) assert.ok(Math.abs(-(gu[j] - gd[j]) / (2 * h) - J[j * n + i]) < 1e-5, `J ${j},${i}`);
  }
});

test("one screen is weaker evidence than its five implied pairs read as independent picks", () => {
  // Best 0, worst 3 of {0,1,2,3} implies 0>1, 0>2, 0>3, 1>3, 2>3. Counted as five picks they
  // claim more certainty than the two taps hold; the exact read keeps the wider covariance.
  const screens = [{ set: [0, 1, 2, 3], best: 0, worst: 3 }];
  const implied = [[0, 1, false], [0, 2, false], [0, 3, false], [1, 3, false], [2, 3, false]];
  const a = fit(4, screens), b = fit(4, implied);
  assert.ok(diffVar(a, 0, 3) > diffVar(b, 0, 3));
  assert.ok(Math.abs(a.mu[0] - a.mu[3]) < Math.abs(b.mu[0] - b.mu[3]));
});

test("screenGain on a pair is the pair picker's p(1 - p) Var score, made a log", () => {
  const f = fit(5, [[0, 1, false], [2, 3, false], [1, 4, false]]);
  for (const [i, j] of [[0, 1], [2, 4], [3, 0]]) {
    const p = 1 / (1 + Math.exp(-(f.mu[i] - f.mu[j])));
    assert.ok(Math.abs(screenGain(f, [i, j]) - 0.5 * Math.log(1 + p * (1 - p) * diffVar(f, i, j))) < 1e-9);
  }
  const I = screenInfo([0, 0, 0, 0], [0, 1, 2, 3]);
  I.forEach((row) => assert.ok(Math.abs(row.reduce((a, b) => a + b, 0)) < 1e-12, "information rows sum to zero (shift invariance)"));
});

test("nextScreen shows distinct options, never the same set twice in a row, and all of a short list", () => {
  const n = 12;
  let answers = [];
  const truth = Array.from({ length: n }, (_, i) => i / 3);
  const rand = mulberry32(5);
  let lastKey = null;
  for (let q = 0; q < 15; q++) {
    const S = nextScreen(fit(n, answers), answers, { seed: 3 });
    assert.equal(S.length, BW_SET_SIZE);
    assert.equal(new Set(S).size, S.length);
    const key = [...S].sort((a, b) => a - b).join(",");
    assert.notEqual(key, lastKey);
    lastKey = key;
    answers = [...answers, simulateScreen(truth, S, rand)];
  }
  assert.deepEqual([...nextScreen(fit(3, []), [], {})].sort(), [0, 1, 2]);
});

test("screens recover a person's order on the model's own answers", () => {
  const n = 10, rand = mulberry32(42);
  const truth = Array.from({ length: n }, (_, i) => -2 + (4 * i) / (n - 1));
  const answers = [];
  for (let q = 0; q < 25; q++) answers.push(simulateScreen(truth, nextScreen(fit(n, answers), answers, { seed: 7 }), rand));
  assert.ok(spearman(order(fit(n, answers)), truth) > 0.85);
  const s = stopCheck(n, answers, { force: true });
  assert.ok(s.phi > 0 && s.phi <= REFIT_PRIOR_PHI + 1e-9);
  assert.ok(orderConfidence(fit(n, answers)) > 0.5);
});

test("result codes carry screens, mixed with picks, and reject damaged ones", () => {
  const items = ["A", "B", "C", "D", "E"];
  const answers = [{ set: [3, 0, 4, 1], best: 4, worst: 0 }, [2, 1, false], { set: [1, 2], best: 2, worst: 1 }];
  const back = decodeAnswers(encodeAnswers({ items, answers, name: "Kim" }), items);
  assert.equal(back.error, undefined);
  assert.equal(back.name, "Kim");
  assert.deepEqual(back.answers[0].best, 4);
  assert.deepEqual(back.answers[0].worst, 0);
  assert.deepEqual([...back.answers[0].set].sort(), [0, 1, 3, 4]);
  assert.deepEqual(back.answers[1], [2, 1, false]);
  const f1 = fit(5, answers), f2 = fit(5, back.answers);
  f1.mu.forEach((m, i) => assert.ok(Math.abs(m - f2.mu[i]) < 1e-9));
  const bad = (a) => decodeAnswers(encodeAnswers({ items, answers: [a] }), items).error;
  assert.ok(bad({ set: [0, 0, 1], best: 0, worst: 1 }));
  assert.ok(bad({ set: [0, 9, 1], best: 0, worst: 1 }));
  assert.ok(bad({ set: [0, 2, 1], best: 2, worst: 2 }));
  assert.equal(setAnswerError({ set: [0, 1], best: 0, worst: 3 }, 5), "best or worst not on the screen");
});

test("team reads take codes made of screens", () => {
  const items = ["A", "B", "C", "D", "E", "F"], n = items.length;
  const people = [0, 1, 2].map((p) => {
    const rand = mulberry32(100 + p), truth = [3, 2, 1, 0, -1, -2].map((x) => x + 0.3 * p * (rand() - 0.5));
    const answers = [];
    for (let q = 0; q < 12; q++) answers.push(simulateScreen(truth, nextScreen(fit(n, answers), answers, { seed: p }), rand));
    return decodeAnswers(encodeAnswers({ items, answers }), items);
  });
  const t = teamRanges(items, people);
  assert.equal(t.rows.length, n);
  assert.equal(t.rows[0].item, 0);
  assert.ok(t.tau >= 0);
  assert.equal(combine(items, people).order[0].item, 0);
  const lin = linearize(n, people[0].answers, new Array(n).fill(0));
  for (let i = 0; i < n; i++) assert.ok(Math.abs(lin.J.slice(i * n, i * n + n).reduce((a, b) => a + b, 0)) < 1e-9);
});

test("the page offers the mode, links carry it, and the MaxDiff page is wired with its disclaimer", async () => {
  const { readFileSync } = await import("node:fs");
  const { encodeList, decodeList } = await import("./rank-core.mjs");
  const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  const rank = read("rank.html");
  assert.match(rank, /name="mode" value="screens"/);
  assert.match(rank, /nextScreen\(f, state\.answers/);
  assert.ok(!rank.includes("__SCREENS__"), "measured screens table filled in");
  const d = decodeList(encodeList({ items: ["a", "b", "c"], mode: "screens" }));
  assert.equal(d.mode, "screens");
  const page = read("maxdiff-best-worst.html");
  assert.match(page, /rel="canonical" href="https:\/\/marisstella.app\/quick-pick-survey\/maxdiff-best-worst.html"/);
  assert.match(page, /<strong>Disclaimer\.<\/strong>/);
  assert.match(page, /href="rank.html\?mode=screens"/);
  assert.ok(!page.includes("<!--N30-->"), "30-option rows filled in");
  for (const f of ["rank.html", "index.html"]) assert.ok(read(f).includes('href="maxdiff-best-worst.html"'), f);
});

// Quality round 86 (portfolio/quality/audits/2026-11-19-quick-pick-survey.json):
// reading the worst tap over the whole screen, and a tie weight of 0.6, both
// passed every test. Pin the likelihood to the sequential best-worst formula
// (Marley & Louviere 2005) and the tie as half a win each way, written out by hand.
test("answerTerms' log likelihood is the sequential best-worst formula, with a tie as half a win", () => {
  const mu = [0.9, 0.2, -0.3, -1.1];
  const lse = (xs) => Math.log(xs.reduce((s, x) => s + Math.exp(x), 0));
  const screen = { set: [0, 1, 2, 3], best: 0, worst: 3 };
  // best over all four, then worst among the three left (not the four)
  const expected = mu[0] - lse(mu) + (-mu[3]) - lse([-mu[1], -mu[2], -mu[3]]);
  assert.ok(Math.abs(answerTerms(4, [screen], mu).ll - expected) < 1e-12);
  const p = 1 / (1 + Math.exp(-(mu[1] - mu[2])));
  const tie = 0.5 * Math.log(p) + 0.5 * Math.log(1 - p);
  assert.ok(Math.abs(answerTerms(4, [[1, 2, true]], mu).ll - tie) < 1e-12);
});
