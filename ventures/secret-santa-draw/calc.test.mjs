import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNames, parseGroups, parsePrevious, buildAllowed, validateDraw, draw, countDraws, mulberry32,
  encodeGroup, decodeGroup, resolveGroup, pairsCsv, pairsText, exchangeIcs, EXAMPLE, MAX_PEOPLE,
} from "./calc.mjs";

const run = (n, groups, previous, mode, seed = 1) => {
  const names = Array.from({ length: n }, (_, i) => `P${i}`);
  return { names, allowed: buildAllowed(n, groups, previous), res: draw({ names, allowed: buildAllowed(n, groups, previous), mode, rng: mulberry32(seed) }) };
};

test("parseNames trims, splits on commas and lines, and rejects repeats", () => {
  const r = parseNames("  Ann ,Ben\n\nCara;  Dee   Lee ");
  assert.deepEqual(r.names, ["Ann", "Ben", "Cara", "Dee Lee"]);
  assert.deepEqual(r.errors, []);
  const dup = parseNames("Sam\nsam\nTom");
  assert.deepEqual(dup.names, ["Sam", "Tom"]);
  assert.match(dup.errors[0], /different/);
  assert.match(parseNames("x".repeat(61)).errors[0], /60 characters/);
});

test("parseGroups and parsePrevious resolve names case-insensitively and report strangers", () => {
  const names = ["Ann", "Ben", "Cara"];
  assert.deepEqual(parseGroups("ann, BEN", names).groups, [[0, 1]]);
  assert.match(parseGroups("Ann, Zed", names).errors[0], /Zed/);
  assert.deepEqual(parsePrevious("Ann > Cara\nben -> ann", names).pairs, [[0, 2], [1, 0]]);
  assert.equal(parsePrevious("Ann Ben", names).errors.length, 1);
});

test("two couples: 4 draws if swaps are allowed, only 2 without swaps, and both are single loops", () => {
  const al = buildAllowed(4, [[0, 1], [2, 3]]);
  assert.equal(countDraws(al, "any"), 4);
  assert.equal(countDraws(al, "noswap"), 2);
  assert.equal(countDraws(al, "loop"), 2);
});

test("a draw always satisfies every rule across many seeds, sizes and modes", () => {
  for (const mode of ["any", "noswap", "loop"]) {
    for (const n of [3, 4, 5, 8, 13, 30]) {
      for (let seed = 1; seed <= 40; seed++) {
        const couples = [];
        for (let i = 0; n >= 5 && i + 1 < n && couples.length < n / 3; i += 3) couples.push([i, i + 1]);
        const prev = n > 4 ? [[0, 2], [2, 4 % n]] : [];
        const { allowed, res } = run(n, couples, prev, mode, seed);
        assert.ok(res.ok, `${mode} n=${n} seed=${seed}: ${res.message}`);
        assert.ok(validateDraw(res.assign, allowed, mode), `${mode} n=${n} seed=${seed}`);
      }
    }
  }
});

test("the same seed gives the same draw, different seeds give different ones", () => {
  const a = run(12, [], [], "loop", 99).res.assign;
  const b = run(12, [], [], "loop", 99).res.assign;
  assert.deepEqual(a, b);
  const seen = new Set();
  for (let s = 1; s <= 30; s++) seen.add(run(12, [], [], "loop", s).res.assign.join());
  assert.ok(seen.size > 25);
});

test("nobody ever draws themselves, even with no other rule", () => {
  for (let s = 1; s <= 200; s++) {
    const { res } = run(5, [], [], "any", s);
    assert.ok(res.assign.every((r, i) => r !== i));
  }
});

test("every valid two-couple draw eventually appears (the shuffle does not skip any)", () => {
  const seen = new Set();
  for (let s = 1; s <= 300; s++) seen.add(run(4, [[0, 1], [2, 3]], [], "noswap", s).res.assign.join());
  assert.equal(seen.size, 2);
});

test("an impossible draw is explained by naming the people who are stuck", () => {
  const names = ["Ann", "Ben", "Cara"];
  const r = draw({ names, allowed: buildAllowed(3, [[0, 1]]), mode: "any", rng: mulberry32(1) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "impossible");
  assert.match(r.message, /Ann and Ben can only give to Cara/);
});

test("a person with nobody left is named", () => {
  const names = ["Ann", "Ben", "Cara"];
  const r = draw({ names, allowed: buildAllowed(3, [[0, 1, 2]]), mode: "any", rng: mulberry32(1) });
  assert.match(r.message, /Ann has nobody left/);
});

test("when only the swap or loop rule blocks the draw, the message says which rule to relax", () => {
  // Ann and Ben can only give to each other and to nobody else.
  const names = ["Ann", "Ben", "Cara", "Dee"];
  const allowed = buildAllowed(4, [[0, 2], [0, 3], [1, 2], [1, 3]]);
  const noswap = draw({ names, allowed, mode: "noswap", rng: mulberry32(3) });
  assert.equal(noswap.ok, false);
  assert.match(noswap.message, /allow two people to swap/);
  assert.equal(draw({ names, allowed, mode: "any", rng: mulberry32(3) }).ok, true);
  const loop = draw({ names, allowed, mode: "loop", rng: mulberry32(3) });
  assert.equal(loop.ok, false);
});

test("two people can only swap; one person cannot draw", () => {
  assert.equal(draw({ names: ["A", "B"], allowed: buildAllowed(2), mode: "any", rng: mulberry32(1) }).ok, true);
  assert.match(draw({ names: ["A", "B"], allowed: buildAllowed(2), mode: "noswap", rng: mulberry32(1) }).message, /swap/);
  assert.match(draw({ names: ["A"], allowed: buildAllowed(1), mode: "any", rng: mulberry32(1) }).message, /two names/);
});

test("last year's pairs are never repeated", () => {
  const prev = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]];
  for (let s = 1; s <= 80; s++) {
    const { res } = run(5, [], prev, "noswap", s);
    assert.ok(res.ok);
    for (const [a, b] of prev) assert.notEqual(res.assign[a], b);
  }
});

test("a tightly constrained 200-person group still draws quickly", () => {
  const groups = [];
  for (let i = 0; i < 200; i += 2) groups.push([i, i + 1]);
  const t = Date.now();
  const { res, allowed } = run(200, groups, [], "loop", 7);
  assert.ok(res.ok && validateDraw(res.assign, allowed, "loop"));
  assert.ok(Date.now() - t < 3000);
  assert.equal(MAX_PEOPLE, 200);
});

test("a hard loop (path-like constraints) is found by search, not luck", () => {
  // Each person may only give to the next two people around a ring: few loops exist.
  const n = 14;
  const allowed = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => j === (i + 1) % n || j === (i + 2) % n));
  const names = Array.from({ length: n }, (_, i) => `P${i}`);
  const r = draw({ names, allowed, mode: "loop", rng: mulberry32(11) });
  assert.ok(r.ok, r.message);
  assert.ok(validateDraw(r.assign, allowed, "loop"));
});

test("group links round-trip, including non-ASCII names, and reject damage", () => {
  const g = { title: "Fête 🎁", names: ["Zoë", "Ünal", "李雷", "Ann"], groups: [[0, 1]], previous: [[2, 3]], mode: "noswap", seed: 4000000000, budget: "$20", date: "2026-12-20", note: "Wrap it!" };
  const back = decodeGroup(encodeGroup(g));
  assert.deepEqual(back.group, g);
  assert.deepEqual(decodeGroup("#d=" + encodeGroup(g)).group, g);
  assert.ok(decodeGroup("not-a-link!!").error);
  assert.ok(decodeGroup(encodeGroup({ ...g, names: ["only"] })).error);
  assert.ok(decodeGroup(Buffer.from(JSON.stringify({ v: 1, n: ["a", "b"], g: [[0, 9]], p: [], m: "any", s: 1 })).toString("base64url")).error);
  assert.ok(decodeGroup(Buffer.from(JSON.stringify({ v: 1, n: ["a", "b"], g: [], p: [], m: "bogus", s: 1 })).toString("base64url")).error);
});

test("a group link resolves to the same valid draw every time", () => {
  const g = { title: "", names: ["A", "B", "C", "D", "E", "F"], groups: [[0, 1], [2, 3]], previous: [[4, 5]], mode: "loop", seed: 123456, budget: "", date: "", note: "" };
  const link = encodeGroup(g);
  const one = resolveGroup(decodeGroup(link).group);
  const two = resolveGroup(decodeGroup(link).group);
  assert.ok(one.ok);
  assert.deepEqual(one.assign, two.assign);
  assert.ok(validateDraw(one.assign, buildAllowed(6, g.groups, g.previous), "loop"));
});

test("the built-in example is drawable under its own rules", () => {
  const { names } = parseNames(EXAMPLE.names);
  const { groups } = parseGroups(EXAMPLE.groups, names);
  const { pairs } = parsePrevious(EXAMPLE.previous, names);
  const r = draw({ names, allowed: buildAllowed(names.length, groups, pairs), mode: EXAMPLE.mode, rng: mulberry32(5) });
  assert.ok(r.ok);
});

test("exports quote correctly and the calendar event ends the day after it starts", () => {
  assert.equal(pairsCsv(['A "x"', "B, C"], [1, 0]), 'giver,receiver\n"A ""x""","B, C"\n"B, C","A ""x"""\n');
  assert.equal(pairsText(["A", "B"], [1, 0]), "A > B\nB > A");
  const ics = exchangeIcs({ title: "Swap, 2026", date: "2026-12-31", stamp: "20261001T000000Z", giftee: "Ann" });
  assert.match(ics, /DTSTART;VALUE=DATE:20261231/);
  assert.match(ics, /DTEND;VALUE=DATE:20270101/);
  assert.match(ics, /SUMMARY:Swap\\, 2026/);
  assert.match(ics, /Your person: Ann/);
});
