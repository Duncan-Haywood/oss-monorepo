// node --test site/pile-first.test.mjs
// "Sort into piles first" (docs/RANK-PAGE.md, "Sort into piles first").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  pilePrior, pileTerms, pilePriorPhi, pilePriorFit, PILE_TAU_GRID, normalQuantile, PILE_NOISE, PILE_MIN_ITEMS, fit, fitAt, order, encodeAnswers, decodeAnswers,
  pairFit, PILE_AUDIT_EVERY, modeAround, groupFit, personInfo, teamRanges, stopCheck, orderConfidence, nextPair, suggestedMax,
} from "./rank-core.mjs";
import { refitRatings, REFIT_PRIOR_PHI, empiricalPriorPhi } from "./engine/btRefit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ids = (n) => Array.from({ length: n }, (_, i) => String(i));
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
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

test("normalQuantile inverts the normal CDF", () => {
  assert.ok(Math.abs(normalQuantile(0.5)) < 1e-9);
  assert.ok(Math.abs(normalQuantile(0.975) - 1.959964) < 1e-5);
  assert.ok(Math.abs(normalQuantile(0.01) + 2.326348) < 1e-5);
});

test("the engine's priorMean and priorScale default to the plain prior, and reject a wrong length", () => {
  const answers = [{ winner: "0", loser: "1" }, { winner: "1", loser: "2" }, { winner: "0", loser: "2", tie: true }];
  const a = refitRatings(ids(3), answers);
  const b = refitRatings(ids(3), answers, { priorMean: [0, 0, 0], priorScale: [REFIT_PRIOR_PHI, REFIT_PRIOR_PHI, REFIT_PRIOR_PHI] });
  a.mu.forEach((m, i) => assert.ok(Math.abs(m - b.mu[i]) < 1e-12));
  assert.throws(() => refitRatings(ids(3), answers, { priorMean: [0, 0] }), RangeError);
  assert.throws(() => refitRatings(ids(3), answers, { priorScale: [1, 1, 0] }), RangeError);
  // With no answers the refit sits at the prior means.
  const c = refitRatings(ids(3), [], { priorMean: [1, 0, -2], priorScale: [1, 1, 1] });
  assert.deepEqual(c.mu.map((x) => +x.toFixed(9)), [1, 0, -2]);
});

test("pilePrior: nothing sorted is no prior; unsorted options keep the plain one; equal piles are symmetric and narrower", () => {
  assert.equal(pilePrior(undefined), null);
  assert.equal(pilePrior([null, null, null]), null);
  const pp = pilePrior([0, 0, 1, 1, 2, 2, null]);
  assert.ok(pp.mean[0] > 0 && Math.abs(pp.mean[2]) < 1e-9 && pp.mean[4] < 0);
  assert.ok(Math.abs(pp.mean[0] + pp.mean[4]) < 1e-9 && Math.abs(pp.scale[0] - pp.scale[4]) < 1e-9);
  assert.equal(pp.mean[6], 0);
  assert.equal(pp.scale[6], REFIT_PRIOR_PHI);
  for (let i = 0; i < 6; i++) assert.ok(pp.scale[i] < REFIT_PRIOR_PHI);
});

test("pilePrior's moments are the model's: Monte Carlo of s ~ N(0, phi^2) placed by s + e at the same cuts", () => {
  // 40 sorted options: 10 top, 20 middle, 10 bottom.
  const piles = [...Array(10).fill(0), ...Array(20).fill(1), ...Array(10).fill(2)];
  const pp = pilePrior(piles);
  const phi = REFIT_PRIOR_PHI, so = Math.hypot(phi, PILE_NOISE);
  const share = [10.5 / 41.5, 20.5 / 41.5, 10.5 / 41.5];
  const hi = so * normalQuantile(1 - share[0]), lo = so * normalQuantile(share[2]);
  const r = mulberry32(7);
  const acc = [[], [], []];
  for (let k = 0; k < 400000; k++) {
    const s = phi * gauss(r), o = s + PILE_NOISE * gauss(r);
    acc[o > hi ? 0 : o < lo ? 2 : 1].push(s);
  }
  for (const p of [0, 1, 2]) {
    const xs = acc[p], m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    const i = piles.indexOf(p);
    assert.ok(Math.abs(pp.mean[i] - m) < 0.02, `pile ${p} mean ${pp.mean[i]} vs ${m}`);
    assert.ok(Math.abs(pp.scale[i] - sd) < 0.02, `pile ${p} sd ${pp.scale[i]} vs ${sd}`);
  }
});

test("pileTerms on top of the plain prior is the pile prior: the team models' mode equals fit with piles", () => {
  const n = 8, piles = [0, 0, 1, 1, 1, 2, 2, null];
  const answers = [[0, 1, false], [2, 3, false], [3, 4, true], [5, 6, false], [7, 2, false]];
  const direct = fit(n, answers, piles).mu;
  const viaTerms = modeAround(n, answers, new Array(n).fill(0), REFIT_PRIOR_PHI ** 2, undefined, pileTerms(piles));
  direct.forEach((m, i) => assert.ok(Math.abs(m - viaTerms[i]) < 1e-6, `${i}: ${m} vs ${viaTerms[i]}`));
});

test("result codes carry the piles; a damaged pile string is refused; an older code has none", () => {
  const items = ["a", "b", "c", "d"];
  const answers = [[0, 1, false]];
  const code = encodeAnswers({ items, answers, name: "Ana", piles: [0, null, 1, 2] });
  assert.deepEqual(decodeAnswers(code, items), { name: "Ana", answers, piles: [0, null, 1, 2] });
  const plain = decodeAnswers(encodeAnswers({ items, answers }), items);
  assert.equal(plain.piles, undefined);
  assert.equal(encodeAnswers({ items, answers, piles: [null, null, null, null] }), encodeAnswers({ items, answers }));
  const raw = JSON.parse(Buffer.from(code.slice(4), "base64url").toString());
  for (const p of ["012", "0123", "01x2", 12]) {
    const bad = "QP1." + Buffer.from(JSON.stringify({ ...raw, p })).toString("base64url");
    assert.match(decodeAnswers(bad, items).error, /damaged/, String(p));
  }
});

test("a team member who only sorted piles still moves the group order the way their piles say", () => {
  const items = ["a", "b", "c", "d", "e", "f"];
  const people = [{ answers: [], piles: [2, 2, 1, 1, 0, 0] }, { answers: [], piles: [2, 1, 2, 1, 0, 0] }];
  const g = groupFit(items.length, people.map((p) => personInfo(items.length, p.answers, p.piles)));
  const o = order(g);
  assert.ok(o.indexOf(4) < 2 && o.indexOf(5) < 2, `top two should be e, f: ${o}`);
  const t = teamRanges(items, people);
  assert.ok([4, 5].includes(t.rows[0].item));
});

// One simulated consistent-ish person (6 logits over 15 options) through the page's loop.
function run(piles, truth, seed) {
  const n = truth.length, coin = mulberry32(seed), answers = [];
  let f = fit(n, answers, piles);
  while (answers.length < suggestedMax(n)) {
    const [a, b] = nextPair(pairFit(n, answers, piles, f), answers, { seed });
    answers.push(coin() < 1 / (1 + Math.exp(-(truth[a] - truth[b]))) ? [a, b, false] : [b, a, false]);
    f = fit(n, answers, piles);
    if (stopCheck(n, answers, { fixedFit: f, fixedConfidence: orderConfidence(f), piles }).done) break;
  }
  return answers;
}

test("with right piles the stop rule's own-prior check is not fooled into a floor: fewer picks, phi near the person's spread", () => {
  const n = 15, truth = Array.from({ length: n }, (_, i) => 3 - (6 * i) / (n - 1));
  const piles = truth.map((_, i) => Math.min(2, Math.floor((3 * i) / n)));
  let withPiles = 0, without = 0;
  for (const seed of [11, 12, 13]) {
    const a = run(piles, truth, seed);
    withPiles += a.length;
    without += run(undefined, truth, seed).length;
    // Picks after right piles fall inside piles; read alone they look like close calls.
    const plainPhi = empiricalPriorPhi(ids(n), a.map(([w, l, t]) => ({ winner: String(w), loser: String(l), tie: t })));
    const ownPhi = pilePriorPhi(n, a, piles);
    assert.ok(ownPhi > plainPhi, `seed ${seed}: pile-aware phi ${ownPhi} should beat picks-only ${plainPhi}`);
  }
  assert.ok(withPiles < 0.7 * without, `picks with piles ${withPiles} vs without ${without}`);
});

test("the person's own picks read their pile noise: right piles read careful, reversed piles read near no information", () => {
  const n = 15, truth = Array.from({ length: n }, (_, i) => 3 - (6 * i) / (n - 1));
  const right = truth.map((_, i) => Math.min(2, Math.floor((3 * i) / n)));
  const reversed = right.map((p) => 2 - p);
  const answers = run(right, truth, 21);
  assert.ok(pilePriorFit(n, answers, right).tau <= PILE_TAU_GRID[1], "right piles");
  assert.equal(pilePriorFit(n, answers, reversed).tau, PILE_TAU_GRID.at(-1), "reversed piles");
});

test("every PILE_AUDIT_EVERY-th pair is chosen without the piles, and only when there are piles", () => {
  const n = 6, piles = [0, 0, 1, 1, 2, 2], f = fit(n, [], piles);
  const answers = [];
  for (let k = 0; k < 2 * PILE_AUDIT_EVERY; k++) {
    const g = pairFit(n, answers, piles, f);
    assert.equal(g === f, k % PILE_AUDIT_EVERY !== PILE_AUDIT_EVERY - 1, `turn ${k}`);
    assert.equal(pairFit(n, answers, undefined, f), f);
    answers.push([0, 1, false]);
  }
});

test("fitAt passes the piles through at another prior sd", () => {
  const piles = [0, 1, 2, null];
  const a = fitAt(4, [], 1, piles), pp = pilePrior(piles, { phi: 1 });
  a.mu.forEach((m, i) => assert.ok(Math.abs(m - pp.mean[i]) < 1e-9));
});

test("the rank page offers the pile step on long lists, passes piles to the stop rule and the code, and says how to skip", () => {
  const html = readFileSync(join(here, "rank.html"), "utf8");
  assert.ok(PILE_MIN_ITEMS >= 8 && PILE_MIN_ITEMS <= 20);
  for (const s of ['id="piles"', 'id="pile-skip"', "PILE_MIN_ITEMS", "piles: myPiles()", "fitNow()", "pairFit(n, state.answers, myPiles(), f)", "piles_started", "piles_skipped"]) assert.ok(html.includes(s), s);
  assert.ok(!/fit\(state\.items\.length, state\.answers\)/.test(html), "every fit on the page goes through fitNow");
});
