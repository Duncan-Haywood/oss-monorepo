// Every saved neighbourhood-search state in eval/lns-states/ (41 teams on 7 x 9, 47 on 8 x 9, ...;
// written by eval/odd-lns.py --save) is a whole round robin whose stored nights lay out wait-free.
// A later run resumes from it (--resume), so each file is checked here independently of the Python
// that wrote it. A state may be unfinished (good < nights): only its stored layouts are checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("./eval/lns-states/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

test("the 41-team state is stored", () => assert.ok(files.includes("41-7x9.json")));

for (const file of files) {
  const st = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  const [, fn, fc, ft] = file.match(/^(\d+)-(\d+)x(\d+)\.json$/).map(Number);

  test(`${file}: a round robin (every pair once, every team once a round)`, () => {
    const { n, rounds, courts, times } = st;
    assert.deepEqual([n, courts, times], [fn, fc, ft]);
    assert.equal(rounds.length, n);
    const seen = new Set();
    for (const r of rounds) {
      const teams = r.flat().sort((a, b) => a - b);
      assert.deepEqual(teams, [...Array(n + 1).keys()]);
      for (const [a, b] of r) {
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        assert.ok(!seen.has(k), `pair ${k} twice`);
        seen.add(k);
      }
    }
    assert.equal(seen.size, ((n + 1) * n) / 2);
  });

  test(`${file}: every stored night layout is wait-free on its courts x slots`, () => {
    const { n, courts, times, rounds, layouts, good } = st;
    const nights = [];
    for (let s = 0; s < n; s += 3) nights.push([...Array(Math.min(3, n - s)).keys()].map((i) => s + i));
    assert.equal(Object.keys(layouts).length, good);
    for (const [t, rows] of Object.entries(layouts)) {
      const g = nights[t].length;
      const matches = nights[t].flatMap((r) => rounds[r]);
      const real = matches.filter(([a, b]) => Math.max(a, b) < n);
      const sits = new Set(matches.filter(([a, b]) => Math.max(a, b) === n).map(([a, b]) => Math.min(a, b)));
      const row = new Map(rows.map(([a, b, h]) => [`${Math.min(a, b)},${Math.max(a, b)}`, h]));
      assert.equal(row.size, real.length, `night ${t}: one row per match`);
      const per = Array(times).fill(0);
      const byTeam = new Map();
      for (const [a, b] of real) {
        const h = row.get(`${Math.min(a, b)},${Math.max(a, b)}`);
        assert.ok(h >= 0 && h < times, `night ${t}: match ${a}-${b} has a row`);
        per[h]++;
        for (const v of [a, b]) byTeam.set(v, [...(byTeam.get(v) ?? []), h]);
      }
      assert.ok(per.every((c) => c <= courts), `night ${t}: at most ${courts} a row`);
      for (const [v, hs] of byTeam) {
        hs.sort((x, y) => x - y);
        assert.equal(hs.length, sits.has(v) ? g - 1 : g, `night ${t}: team ${v} games`);
        hs.forEach((h, i) => assert.equal(h, hs[0] + i, `night ${t}: team ${v} waits`));
      }
    }
  });
}
