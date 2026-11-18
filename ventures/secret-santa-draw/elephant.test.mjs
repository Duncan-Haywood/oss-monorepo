import { test } from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "./calc.mjs";
import { newGame, apply, moves, stealBlock, checkState, drawOrder, maxMoves, simulate, results, resultsCsv, frozen, holding } from "./elephant.mjs";

const start = (n, rules, order) => newGame({ names: Array.from({ length: n }, (_, i) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i] ?? `P${i}`), rules, order }).state;
const play = (s, ...acts) => acts.reduce((st, a) => { const r = apply(st, a); assert.ok(r.ok, r.message); return r.state; }, s);
const open = (label = "") => ({ type: "open", label });
const steal = (gift) => ({ type: "steal", gift });

test("drawOrder is a permutation and replays from its seed", () => {
  const a = drawOrder(12, mulberry32(7));
  assert.deepEqual([...a].sort((x, y) => x - y), [...Array(12).keys()]);
  assert.deepEqual(a, drawOrder(12, mulberry32(7)));
});

test("newGame refuses bad input", () => {
  assert.equal(newGame({ names: ["A"] }).ok, false);
  assert.equal(newGame({ names: ["A", "B"], order: [0, 0] }).ok, false);
});

test("a steal hands the turn to the victim, who cannot steal straight back", () => {
  let s = play(start(4), open("Socks"), open("Mug")); // A has Socks, B has Mug, C's turn
  s = play(s, steal(0)); // C takes Socks from A
  assert.equal(s.active, 0);
  assert.match(stealBlock(s, 0), /straight back/);
  assert.deepEqual(moves(s).steal, [1]);
  s = play(s, steal(1)); // A takes Mug from B
  assert.equal(s.active, 1);
  s = play(s, open("Candle")); // B opens, turn passes to D
  assert.equal(s.active, 3);
  assert.equal(stealBlock(s, 0), ""); // blocks reset each turn
});

test("a gift freezes after its last allowed steal", () => {
  let s = start(5, { maxSteals: 2, noStealBack: false });
  s = play(s, open("Gold"), open(), steal(0)); // C steals Gold from A (1)
  s = play(s, steal(0)); // A steals it back (2) -> frozen
  assert.ok(frozen(s, 0));
  assert.match(stealBlock(s, 0), /Frozen/);
});

test("a per-turn steal cap forces an open", () => {
  let s = play(start(4, { perTurn: 1 }), open(), open(), steal(0));
  assert.match(stealBlock(s, 1), /No more steals/);
  assert.equal(moves(s).steal.length, 0);
});

test("final swap: first player trades once, then the game ends", () => {
  let s = start(3, { maxSteals: 3, finalSwap: true }, [2, 0, 1]);
  s = play(s, open("X"), open("Y"), open("Z"));
  assert.equal(s.phase, "final");
  assert.equal(s.active, 2);
  s = play(s, steal(2)); // C swaps X for Z with B
  assert.equal(s.phase, "done");
  assert.equal(s.gifts[2].holder, 2);
  assert.equal(s.gifts[0].holder, 1);
  assert.equal(apply(s, open()).ok, false);
  const t = play(start(3, { finalSwap: false }), open(), open(), open());
  assert.equal(t.phase, "done");
});

test("thousands of random games keep every rule", () => {
  const rng = mulberry32(2026);
  for (let k = 0; k < 3000; k++) {
    const n = 2 + Math.floor(rng() * 14);
    const rules = { maxSteals: Math.floor(rng() * 4), perTurn: Math.floor(rng() * 3), noStealBack: rng() < 0.5, finalSwap: rng() < 0.5 };
    if (rules.maxSteals === 0 && rules.perTurn === 0) rules.maxSteals = 1;
    let s = start(n, rules, drawOrder(n, rng));
    let count = 0;
    while (s.phase !== "done") {
      const m = moves(s);
      const a = m.steal.length && rng() < 0.6 ? steal(m.steal[Math.floor(rng() * m.steal.length)]) : s.phase === "final" ? { type: "keep" } : open();
      // An illegal steal is always refused with a reason.
      const bad = s.gifts.findIndex((_, g) => !m.steal.includes(g));
      if (bad !== -1) assert.equal(apply(s, steal(bad)).ok, false);
      s = apply(s, a).state;
      if (a.type !== "keep") count++;
      assert.deepEqual(checkState(s), []);
    }
    assert.ok(count <= maxMoves(n, rules), `${count} > ${maxMoves(n, rules)}`);
    assert.equal(s.gifts.length, n);
    for (let p = 0; p < n; p++) assert.notEqual(holding(s, p), -1);
  }
});

test("maxMoves", () => {
  assert.equal(maxMoves(10, { maxSteals: 3, perTurn: 0, finalSwap: true }), 10 + 27 + 1);
  assert.equal(maxMoves(10, { maxSteals: 0, perTurn: 0 }), null);
});

test("simulate finishes and results export safely", () => {
  const { state } = simulate(8, { maxSteals: 3 }, 0.5, mulberry32(3));
  assert.equal(state.phase, "done");
  state.names[0] = "=cmd()";
  const csv = resultsCsv(state);
  assert.match(csv, /^Player,Gift,Times stolen/);
  assert.match(csv, /'=cmd\(\)/);
  assert.equal(results(state).length, 8);
});
