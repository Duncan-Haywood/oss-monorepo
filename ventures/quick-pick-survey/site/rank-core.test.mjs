// node --test site/rank-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseList, listId, encodeList, decodeList, encodeAnswers, decodeAnswers, fit, order,
  nextPair, rankTable, sampleRanks, resultsCsv, combine, chanceAbove, suggestedMax, orderConfidence, MAX_ITEMS,
} from "./rank-core.mjs";
import { buildEngineFile, ENGINE_FILES } from "../scripts/build-rank-engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("site/engine is the current strip of src/lib (run node scripts/build-rank-engine.mjs)", () => {
  for (const name of ENGINE_FILES) {
    assert.equal(readFileSync(join(here, "engine", `${name}.mjs`), "utf8"), buildEngineFile(name), name);
  }
});

test("parseList trims bullets, drops blanks and case-insensitive repeats, caps the length", () => {
  assert.deepEqual(parseList("- A\n\n* b\n1. C\n a \n2) D\n• E"), ["A", "b", "C", "D", "E"]);
  const long = Array.from({ length: 80 }, (_, i) => `item ${i}`).join("\n");
  assert.equal(parseList(long).length, MAX_ITEMS);
});

test("list links round-trip unicode and reject junk", () => {
  const list = { title: "Qué café?", items: ["Café ☕", "Té", "Agua 💧"] };
  assert.deepEqual(decodeList("#" + encodeList(list)), list);
  assert.equal(decodeList("#nonsense"), null);
  assert.equal(decodeList(encodeList({ items: ["one", "two"] })), null, "fewer than 3 items");
});

test("result codes round-trip, and are refused for another list or when damaged", () => {
  const items = ["a", "b", "c", "d"];
  const answers = [[0, 1, false], [2, 3, true], [3, 0, false]];
  const code = encodeAnswers({ items, answers, name: "Sam" });
  assert.deepEqual(decodeAnswers(code, items), { name: "Sam", answers });
  assert.match(decodeAnswers(code, ["a", "b", "c", "e"]).error, /different list/);
  assert.match(decodeAnswers("hello", items).error, /not a Quick Pick/);
  assert.match(decodeAnswers(code.slice(0, -3), items).error, /damaged|different/);
  assert.notEqual(listId(["a", "b"]), listId(["b", "a"]));
});

test("an unseen list reads unsettled; consistent answers settle a chain", () => {
  assert.ok(Math.abs(orderConfidence(fit(4, []))) < 0.15);
  const chain = [];
  for (let r = 0; r < 4; r++) chain.push([0, 1, false], [1, 2, false], [2, 3, false]);
  const f = fit(4, chain);
  assert.deepEqual(order(f), [0, 1, 2, 3]);
  assert.ok(chanceAbove(f, 0, 3) > 0.99);
  assert.ok(orderConfidence(f) > 0.8);
});

test("nextPair never repeats the last pair and flips sides", () => {
  const f = fit(5, [[0, 1, false]]);
  let left = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const [a, b] = nextPair(f, [[0, 1, false]], { seed });
    assert.notDeepEqual([a, b].sort(), [0, 1]);
    if (a < b) left++;
  }
  assert.ok(left > 60 && left < 140, `lower index on the left ${left}/200`);
});

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A simulated respondent with true logit scores; picks by the Bradley-Terry chance. */
function simulate(n, picks, seed, mode = "order", picker = nextPair) {
  const rand = mulberry(seed);
  const truth = Array.from({ length: n }, (_, i) => 3 - (6 * i) / (n - 1)); // item 0 best, spread 6 logits
  const answers = [];
  for (let k = 0; k < picks; k++) {
    const [a, b] = picker(fit(n, answers), answers, { seed, mode, rand });
    const pa = 1 / (1 + Math.exp(-(truth[a] - truth[b])));
    answers.push(rand() < pa ? [a, b, false] : [b, a, false]);
  }
  return answers;
}

function spearman(o, n) {
  let d2 = 0;
  o.forEach((item, rank) => (d2 += (item - rank) ** 2));
  return 1 - (6 * d2) / (n * (n * n - 1));
}

test("on simulated respondents the adaptive picker recovers the order better than random pairs", () => {
  const n = 12, picks = suggestedMax(n) / 2; // half the soft cap
  const randomPicker = (_f, _answers, { rand }) => {
    const a = Math.floor(rand() * n);
    let b = Math.floor(rand() * (n - 1));
    if (b >= a) b++;
    return [a, b];
  };
  let adaptive = 0, random = 0;
  const runs = 12;
  for (let s = 1; s <= runs; s++) {
    adaptive += spearman(order(fit(n, simulate(n, picks, s))), n);
    random += spearman(order(fit(n, simulate(n, picks, s, "order", randomPicker))), n);
  }
  adaptive /= runs; random /= runs;
  assert.ok(adaptive > 0.9, `adaptive mean Spearman ${adaptive.toFixed(3)}`);
  assert.ok(adaptive > random, `adaptive ${adaptive.toFixed(3)} vs random ${random.toFixed(3)}`);
});

test("rank ranges hold the true rank about as often as they claim (90%)", () => {
  const n = 8;
  let held = 0, total = 0;
  for (let s = 1; s <= 25; s++) {
    const f = fit(n, simulate(n, 16, 100 + s));
    for (const r of rankTable(f, { draws: 800 })) {
      total++;
      if (r.low <= r.item + 1 && r.item + 1 <= r.high) held++;
    }
  }
  const cover = held / total;
  // The Laplace posterior is approximate and the prior is not the simulation's spread, so allow slack; it must not be badly overconfident.
  assert.ok(cover > 0.8, `coverage ${cover.toFixed(3)}`);
});

test("favourite mode spends its questions on the front-runners", () => {
  // Measured in docs/RANK-PAGE.md: favourite mode does not find the favourite
  // in fewer picks; it asks more but among contenders only, and (with its own
  // stop rule) named it 12/12 against 6-8/12 for the full-order stop. Here:
  // after 20 picks most of its questions involve the true top three.
  const n = 10, picks = 20;
  const topShare = (mode) => {
    let top = 0, all = 0;
    for (let s = 1; s <= 4; s++) for (const [w, l] of simulate(n, picks, 500 + s, mode).slice(8)) { all++; if (w < 3 && l < 3) top++; }
    return top / all;
  };
  const fav = topShare("favourite"), full = topShare("order");
  assert.ok(fav > full, `top-three pairs: favourite ${fav.toFixed(2)} vs order ${full.toFixed(2)}`);
});

test("results CSV quotes options and lists every item", () => {
  const items = ['Say "hi", then', "b", "c"];
  const f = fit(3, [[0, 1, false], [1, 2, false]]);
  const csv = resultsCsv(items, f, rankTable(f, { draws: 200 }));
  assert.equal(csv.trim().split("\n").length, 4);
  assert.match(csv, /"Say ""hi"", then"/);
  const risky = resultsCsv(["=HYPERLINK(\"x\")", "+1 call", "@sum", "-5 degrees"], fit(4, []), rankTable(fit(4, []), { draws: 50 }));
  for (const cell of ['"\'=HYPERLINK(""x"")"', '"\'+1 call"', '"\'@sum"', '"\'-5 degrees"']) assert.ok(risky.includes(cell), cell);
});

test("combine weighs people equally and reports agreement and splits", () => {
  const items = ["a", "b", "c", "d"];
  const lover = []; // prefers a > b > c > d, answered a lot
  for (let r = 0; r < 6; r++) lover.push([0, 1, false], [1, 2, false], [2, 3, false]);
  const hater = [[3, 2, false], [2, 1, false], [1, 0, false]]; // the reverse, answered little
  const same = combine(items, [{ answers: lover }, { answers: lover }]);
  assert.equal(same.agreement, 1);
  assert.deepEqual(same.order.map((r) => r.item), [0, 1, 2, 3]);
  const split = combine(items, [{ answers: lover }, { answers: hater }]);
  assert.equal(split.agreement, -1);
  assert.equal(split.order.find((r) => r.item === 0).best, 1);
  assert.equal(split.order.find((r) => r.item === 0).worst, 4);
});

// Red-team guards, 2026-11-14 (prompts/runs/2026-11-14-session_01E5sJKn8cM6ZR29gwutSEwY.json).

test("a shared link decodes to exactly the creator's list, so result codes match (parseList is idempotent)", () => {
  // The creator ranks parseList(typed); a respondent ranks decodeList(link), which
  // parses again. If the second parse changes an option, listId differs and the
  // creator's "combine" refuses every respondent's code as "for a different list".
  const typed = [
    "Tea",
    "- - Water", // a nested bullet
    "x".repeat(119) + " and more words after the 120-character cut", // cut lands after a space
    "y".repeat(119) + "💧 the cut lands inside an emoji",
    "1. 2) Juice",
  ].join("\n");
  const items = parseList(typed);
  assert.deepEqual(parseList(items.join("\n")), items);
  for (const item of items) {
    assert.equal(item, item.trim(), JSON.stringify(item));
    assert.ok(item.isWellFormed(), "no half emoji");
  }
  const back = decodeList(encodeList({ items }));
  assert.equal(listId(back.items), listId(items));
  const code = encodeAnswers({ items: back.items, answers: [[0, 1, false]] });
  assert.deepEqual(decodeAnswers(code, items).answers, [[0, 1, false]]);
});

test("listId is pinned: codes made by an earlier release still match", () => {
  assert.equal(listId(["Dark mode", "CSV export", "Faster search"]), "tebjp1");
});

test("a result code naming an option outside the list is refused", () => {
  const items = ["a", "b", "c", "d"];
  for (const answers of [[[0, 9, false]], [[9, 0, false]], [[2, 2, false]]]) {
    assert.match(decodeAnswers(encodeAnswers({ items, answers }), items).error, /damaged/, JSON.stringify(answers));
  }
});

test("chanceAbove is the normal CDF of the mean difference over its standard deviation", () => {
  const f = { n: 3, mu: [1, 0, 0], cov: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  // var(mu0 - mu1) = 2, z = 1/sqrt(2), Phi(z) = 0.76025
  assert.ok(Math.abs(chanceAbove(f, 0, 1) - 0.76025) < 1e-4, chanceAbove(f, 0, 1));
  assert.ok(Math.abs(chanceAbove(f, 1, 0) - 0.23975) < 1e-4, chanceAbove(f, 1, 0));
  assert.ok(Math.abs(chanceAbove(f, 1, 2) - 0.5) < 1e-6);
});

test("on a fresh list nextPair can ask any pair", () => {
  const f = fit(4, []);
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) seen.add(nextPair(f, [], { seed }).sort().join(","));
  assert.equal(seen.size, 6, [...seen].join(" "));
});

test("favourite mode with two contenders still asks them again after their last pair", () => {
  const answers = [];
  for (let r = 0; r < 6; r++) answers.push([0, 2, false], [1, 2, false]);
  answers.push([0, 1, true]);
  const pair = nextPair(fit(3, answers), answers, { mode: "favourite", seed: 3 });
  assert.deepEqual([...pair].sort(), [0, 1]);
});

test("favourite chances sum to one and an unseen list gives each option a fair share", () => {
  const n = 4;
  const table = rankTable(fit(n, []), { draws: 4000 });
  const total = table.reduce((a, r) => a + r.favourite, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `sum ${total}`);
  for (const r of table) assert.ok(Math.abs(r.favourite - 1 / n) < 0.04, `item ${r.item}: ${r.favourite}`);
});

test("the posterior sampler draws every option alike: three equal, independent options each come first and last a third of the time", () => {
  // A wrong Box-Muller angle shrinks the odd-index draws: item 1 then came last 14% of the time.
  const draws = 6000;
  const { ranks, top } = sampleRanks({ n: 3, mu: [0, 0, 0], cov: [1, 0, 0, 0, 1, 0, 0, 0, 1] }, { draws });
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(top[i] / draws - 1 / 3) < 0.04, `item ${i} first ${top[i] / draws}`);
    const last = ranks[i].filter((r) => r === 3).length / draws;
    assert.ok(Math.abs(last - 1 / 3) < 0.04, `item ${i} last ${last}`);
  }
});

test("combine: team scores are the mean of centred scores, ranks run 1..n, order follows scores not indexes", () => {
  const items = ["a", "b", "c", "d"];
  const reverse = [];
  for (let r = 0; r < 6; r++) reverse.push([3, 2, false], [2, 1, false], [1, 0, false]);
  const one = combine(items, [{ answers: reverse }]);
  const two = combine(items, [{ answers: reverse }, { answers: reverse }]);
  assert.deepEqual(two.order.map((r) => r.item), [3, 2, 1, 0]);
  assert.deepEqual(two.order.map((r) => r.rank), [1, 2, 3, 4]);
  assert.ok(Math.abs(two.order.reduce((a, r) => a + r.score, 0)) < 1e-9, "centred");
  for (const r of two.order) assert.ok(Math.abs(r.score - one.order.find((x) => x.item === r.item).score) < 1e-9, "a mean, not a sum");
  assert.equal(one.agreement, null);
});
