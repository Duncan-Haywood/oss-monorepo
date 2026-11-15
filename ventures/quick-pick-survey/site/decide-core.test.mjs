// node --test site/decide-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSetup, setupError, encodeDecision, decodeDecision, encodeAnswers, decodeAnswers,
  decisionFit, overallOrder, nextQuestion, decisionTable, decisionDone, decisionMax, decisionHardMax, DECIDE_EXTEND, decisionCsv, combineDecisions, bestPerCriterion,
  whatWouldChange, DECIDE_MARGIN,
} from "./decide-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OPTIONS = ["Elm Street", "Station", "Garden house", "Mill loft"];
const CRITERIA = ["Rent", "Commute", "Space"];

test("setup parsing drops bullets and repeats, and refuses too few options or criteria", () => {
  const s = parseSetup("- A\n* B\nb\n\nC", "1. Price\nprice\nSpeed");
  assert.deepEqual(s, { options: ["A", "B", "C"], criteria: ["Price", "Speed"] });
  assert.equal(setupError(s), "");
  assert.match(setupError(parseSetup("A", "x\ny")), /at least 2 different options/);
  assert.match(setupError(parseSetup("A\nB", "x")), /at least 2 different criteria/);
});

test("a decision link round-trips and a broken one is refused", () => {
  const frag = encodeDecision({ title: "Flat?", options: OPTIONS, criteria: CRITERIA });
  assert.ok(frag.startsWith("d="));
  assert.deepEqual(decodeDecision("#" + frag), { title: "Flat?", options: OPTIONS, criteria: CRITERIA, mode: "winner" });
  assert.equal(decodeDecision("#d=nonsense"), null);
  assert.equal(decodeDecision(encodeDecision({ options: OPTIONS, criteria: ["only one"] })), null);
});

test("a rank-them-all link carries its mode, a winner link is unchanged, and an unknown mode is refused", () => {
  const order = encodeDecision({ title: "Flat?", options: OPTIONS, criteria: CRITERIA, mode: "order" });
  assert.equal(decodeDecision(order).mode, "order");
  // A winner link is byte for byte the link made before the switch existed.
  const before = "d=" + Buffer.from(JSON.stringify({ v: 1, t: "Flat?", o: OPTIONS, c: CRITERIA })).toString("base64url");
  assert.equal(encodeDecision({ title: "Flat?", options: OPTIONS, criteria: CRITERIA }), before);
  assert.equal(decodeDecision(before).mode, "winner");
  const bad = "d=" + Buffer.from(JSON.stringify({ v: 1, t: "", o: OPTIONS, c: CRITERIA, m: "all" })).toString("base64url");
  assert.equal(decodeDecision(bad), null);
  assert.throws(() => encodeDecision({ options: OPTIONS, criteria: CRITERIA, mode: "all" }), /unknown mode/);
});

test("the cap is a checkpoint and keeping going runs to DECIDE_EXTEND times it", () => {
  assert.equal(DECIDE_EXTEND, 3);
  assert.equal(decisionHardMax(5, 3), 123);
  assert.equal(decisionHardMax(8, 4), 3 * decisionMax(8, 4));
});

test("decision codes round-trip, and a code for another decision or a damaged one is refused", () => {
  const answers = { crit: [[0, 1, false], [2, 0, true]], opt: [[1, 3, 0, false], [0, 2, 1, true]] };
  const code = encodeAnswers({ options: OPTIONS, criteria: CRITERIA, answers, name: "Sam" });
  assert.deepEqual(decodeAnswers(code, OPTIONS, CRITERIA), { name: "Sam", answers });
  assert.match(decodeAnswers(code, OPTIONS, [...CRITERIA, "Light"]).error, /different decision/);
  assert.match(decodeAnswers(code.slice(0, -6), OPTIONS, CRITERIA).error, /damaged|different/);
  assert.match(decodeAnswers("QP1.abc", OPTIONS, CRITERIA).error, /not a Quick Pick decision code/);
});

test("weights follow 'which matters more' answers, and the overall order follows the heavy criterion", () => {
  // Rent matters more than both others, every time. Option 0 is best on Rent, option 3 best on Space.
  const answers = { crit: [], opt: [] };
  for (let k = 0; k < 6; k++) answers.crit.push([0, 1, false], [0, 2, false]);
  for (let k = 0; k < 3; k++) {
    for (let x = 1; x < 4; x++) answers.opt.push([0, 0, x, false]);
    for (let x = 0; x < 3; x++) answers.opt.push([2, 3, x, false]);
  }
  const df = decisionFit(4, 3, answers);
  assert.ok(df.weights[0] > 0.6 && df.weights[0] > 3 * df.weights[1], `weights ${df.weights}`);
  assert.equal(overallOrder(df)[0], 0);
  assert.deepEqual([bestPerCriterion(df)[0], bestPerCriterion(df)[2]], [0, 3]);
  // Flip the weights: Space matters most, so option 3 wins.
  const flipped = { crit: answers.crit.map(([w, l]) => (w === 0 && l === 2 ? [2, 0, false] : [w, l, false])).concat(Array.from({ length: 6 }, () => [2, 1, false])), opt: answers.opt };
  assert.equal(overallOrder(decisionFit(4, 3, flipped))[0], 3);
  const t = decisionTable(df, { draws: 400 });
  assert.equal(t.rows[0].item, 0);
  assert.equal(t.crit[0].item, 0);
  assert.ok(t.crit[0].low <= t.crit[0].weight && t.crit[0].weight <= t.crit[0].high);
  assert.ok(Math.abs(t.crit.reduce((a, c) => a + c.weight, 0) - 1) < 1e-9);
});

test("with no answers nothing is settled and the stop rule waits for both kinds of answer", () => {
  const df = decisionFit(4, 3, { crit: [], opt: [] });
  const t = decisionTable(df, { draws: 300 });
  assert.ok(t.confidence < 0.3, `confidence ${t.confidence}`);
  assert.equal(decisionDone({ confidence: 0.99 }, { crit: [], opt: [[0, 0, 1, false]] }), false);
  assert.equal(decisionDone({ confidence: 0.99 }, { crit: [[0, 1, false]], opt: [[0, 0, 1, false]] }), true);
  assert.equal(decisionMax(5, 3), 41);
  // One answer on a criterion is not a clear best there (the page would have named one before the bar).
  assert.deepEqual(bestPerCriterion(decisionFit(4, 3, { crit: [], opt: [[1, 2, 0, false]] })), [-1, -1, -1]);
});

test("the winner stop: a settled leader ends the questions even while the order below it is not", () => {
  // Both kinds answered; the order is far from settled but nothing threatens the leader.
  const both = { crit: [[0, 1, false]], opt: [[0, 0, 1, false]] };
  assert.equal(decisionDone({ confidence: 0.5, safe: 0.95 }, both), true);
  assert.equal(decisionDone({ confidence: 0.5, safe: 0.95 }, both, { rule: "order" }), false);
  assert.equal(decisionDone({ confidence: 0.5, safe: 0.85 }, both), false);
  // An option far ahead on every criterion: the leader is safe long before the rest is ordered.
  const answers = { crit: [[0, 1, true], [1, 2, true]], opt: [] };
  for (let c = 0; c < 3; c++) for (let k = 0; k < 5; k++) for (let x = 1; x < 4; x++) answers.opt.push([c, 0, x, false]);
  const t = decisionTable(decisionFit(4, 3, answers), { draws: 600 });
  assert.equal(t.rows[0].item, 0);
  assert.ok(t.safe >= 0.9, `safe ${t.safe}`);
  assert.ok(t.confidence < 0.9, `the order below is not settled (${t.confidence})`);
  assert.ok(decisionDone(t, answers));
  // With no answers anyone could be ahead: the read must be low, not a default 1.
  assert.ok(decisionTable(decisionFit(4, 3, { crit: [], opt: [] }), { draws: 400 }).safe < 0.5);
  // A wider margin can only read safer.
  const df = decisionFit(4, 3, { crit: [[0, 1, false]], opt: [[0, 0, 1, false], [1, 1, 0, false]] });
  assert.ok(decisionTable(df, { draws: 400, margin: 0.4 }).safe >= decisionTable(df, { draws: 400, margin: 0.1 }).safe);
  assert.equal(DECIDE_MARGIN, 0.25);
});

test("whatWouldChange: at the weight it names, the named rival really overtakes", () => {
  // Option 0 best on Rent, option 2 best on Space, Rent weighted higher.
  const answers = { crit: [], opt: [] };
  for (let k = 0; k < 3; k++) {
    answers.crit.push([0, 2, false], [0, 1, false], [2, 1, false]);
    answers.opt.push([0, 0, 1, false], [0, 0, 2, false], [0, 1, 2, false], [2, 2, 1, false], [2, 2, 0, false], [2, 1, 0, false], [1, 1, 0, false]);
  }
  const df = decisionFit(3, 3, answers);
  const leader = overallOrder(df)[0];
  assert.equal(leader, 0);
  const ch = whatWouldChange(df);
  assert.equal(ch.length, 3);
  const at = (c, x) => {
    const w = df.weights.map((wk, k) => (k === c.item ? x : (wk * (1 - x)) / (1 - c.weight)));
    return (o) => w.reduce((acc, wk, k) => acc + wk * df.centred[k][o], 0);
  };
  // More weight on Space (where option 0 is worst) is what could unseat it.
  const space = ch[2];
  assert.ok(space.rival !== null && space.rival !== leader && space.needed > space.weight, JSON.stringify(ch));
  for (const c of ch.filter((x) => x.needed !== null)) {
    const dir = c.needed > c.weight ? 1 : -1;
    const before = at(c, c.needed - dir * 1e-4), after = at(c, c.needed + dir * 1e-4);
    assert.ok(before(leader) > before(c.rival), "the leader still leads just short of the named weight");
    assert.ok(after(c.rival) > after(leader), "the rival leads just past it");
  }
});

test("the picker never repeats the last question and asks about criteria once options have spread", () => {
  const answers = { crit: [], opt: [] };
  let df = decisionFit(4, 3, answers);
  const q0 = nextQuestion(df, answers, { seed: 3 });
  assert.equal(q0.kind, "opt"); // with every option at 0 a weight cannot move any gap yet
  answers.opt.push([q0.c, q0.pair[0], q0.pair[1], false]);
  answers.lastKind = "opt";
  df = decisionFit(4, 3, answers);
  const q1 = nextQuestion(df, answers, { seed: 3 });
  assert.ok(!(q1.kind === "opt" && q1.c === q0.c && new Set(q1.pair).has(q0.pair[0]) && new Set(q1.pair).has(q0.pair[1])));
  // Options disagree across criteria: option 0 best on Rent, worst on Space. Now a weight question pays.
  for (let k = 0; k < 4; k++) answers.opt.push([0, 0, 1, false], [2, 1, 0, false]);
  df = decisionFit(4, 3, answers);
  const kinds = new Set();
  const a2 = { ...answers, crit: [], opt: answers.opt.slice() };
  for (let k = 0; k < 12; k++) { const q = nextQuestion(df, a2, { seed: k + 1 }); kinds.add(q.kind); }
  assert.ok(kinds.has("crit"), "a weight question once criteria disagree");
});

// Simulated people (the docs/DECIDE-PAGE.md model): adaptive questions beat
// random ones at the same budget (0.773 vs 0.661 when written). Red with the adaptive picker swapped for
// random (checked when written).
test("the adaptive picker beats random questions on simulated people", () => {
  const softmax = (s) => { const m = Math.max(...s); const e = s.map((x) => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z); };
  const mul = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const n = 8, C = 3, B = 50, R = 20;
  const run = (strategy) => {
    let sp = 0;
    for (let r = 0; r < R; r++) {
      const rnd = mul(500 + r);
      const g = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
      const s = Array.from({ length: C }, g), x = Array.from({ length: C }, () => Array.from({ length: n }, () => g() * 2));
      const w = softmax(s);
      const tot = Array.from({ length: n }, (_, i) => x.reduce((a, xc, c) => a + w[c] * (xc[i] - xc.reduce((p, q) => p + q, 0) / n), 0));
      const truth = tot.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
      const ans = { crit: [], opt: [] };
      let df = decisionFit(n, C, ans);
      for (let t = 0; t < B; t++) {
        const q = nextQuestion(df, ans, { seed: r + 1, strategy });
        const [a, b] = q.pair, d = q.kind === "crit" ? s[a] - s[b] : x[q.c][a] - x[q.c][b];
        const [W, L] = rnd() < 1 / (1 + Math.exp(-d)) ? [a, b] : [b, a];
        if (q.kind === "crit") ans.crit.push([W, L, false]); else ans.opt.push([q.c, W, L, false]);
        ans.lastKind = q.kind;
        df = decisionFit(n, C, ans);
      }
      const o = overallOrder(df), rs = [], rt = [];
      o.forEach((it, k) => (rs[it] = k)); truth.forEach((it, k) => (rt[it] = k));
      sp += 1 - (6 * rs.reduce((a, v, i) => a + (v - rt[i]) ** 2, 0)) / (n * (n * n - 1));
    }
    return sp / R;
  };
  const adaptive = run("adaptive"), random = run("random");
  assert.ok(adaptive > random + 0.05, `adaptive ${adaptive.toFixed(3)} vs random ${random.toFixed(3)}`);
});

test("CSV guards formula cells and lists the weights", () => {
  const answers = { crit: [[0, 1, false]], opt: [[0, 0, 1, false]] };
  const opts = ["=HYPERLINK(1)", "B"], crits = ["Rent", "Space"];
  const df = decisionFit(2, 2, answers);
  const csv = decisionCsv(opts, crits, decisionTable(df, { draws: 200 }), df);
  assert.match(csv, /"'=HYPERLINK\(1\)"/);
  assert.match(csv, /^criterion,weight,weight_range_90$/m);
  assert.match(csv, /"best_on_Rent"/);
});

test("team combine: identical people agree at 1, opposite people below 0", () => {
  const a = { crit: [[0, 1, false], [0, 1, false]], opt: [[0, 0, 1, false], [0, 1, 2, false], [0, 0, 2, false], [1, 0, 1, false]] };
  const b = { crit: a.crit, opt: a.opt.map(([c, w, l, t]) => [c, l, w, t]) };
  assert.equal(combineDecisions(3, 2, [{ answers: a }, { answers: a }]).agreement, 1);
  const t = combineDecisions(3, 2, [{ answers: a }, { answers: b }]);
  assert.ok(t.agreement < 0, `agreement ${t.agreement}`);
  assert.equal(t.people, 2);
});

test("the page loads the engine it is tested against, and carries the disclaimer and usage opt-out", () => {
  const html = readFileSync(join(here, "decide.html"), "utf8");
  assert.match(html, /from "\.\/decide-core\.mjs"/);
  assert.match(html, /from "\.\/usage\.mjs"/);
  assert.match(html, /<strong>Disclaimer\.<\/strong>/);
  assert.match(html, /id="optout"/);
  // The rank-them-all switch reaches the picker and the stop, and the cap is a checkpoint.
  assert.match(html, /id="rank-all"/);
  assert.match(html, /nextQuestion\(df, state\.answers, \{ seed: state\.seed, focus: rule \}\)/);
  assert.match(html, /decisionDoneGraded\(n, C, state\.answers, table, \{ rule \}\)/);
  assert.match(html, /Keep going until it is settled/);
  assert.match(html, /decisionHardMax/);
  assert.match(html, /rel="canonical" href="https:\/\/marisstella\.app\/quick-pick-survey\/decide\.html"/);
});
