// race-worker.mjs: the page's slow race tables asked again off the page thread (2026-11-23).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { playoffRace } from "./standings.mjs";
import { deepRace } from "./race-worker.mjs";
import { RACE_NODE_BUDGET, RACE_MAGIC_BUDGET, RACE_WORKER_PASSES, RACE_WORKER_MAGIC_BUDGET } from "./race-exact.mjs";
import { playoffRace as brute } from "./standings.mjs";

// a real table the page thread leaves unproved: Serie A 2023-24 (openfootball, CC0), safety race
const data = JSON.parse(readFileSync(new URL("./eval/data/openfootball-results.json", import.meta.url), "utf8"));
function tableAt(key, idx, spots) {
  const L = data.leagues[key];
  const matches = L.matches.slice().sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
  const dates = [...new Set(matches.map((m) => m[1]))];
  const d = dates[idx];
  return {
    teams: L.teams, spots,
    results: matches.filter((m) => m[1] <= d).map((m) => ({ a: m[2], b: m[3], ga: m[4], gb: m[5] })),
    remaining: matches.filter((m) => m[1] > d).map((m) => [m[2], m[3]]),
  };
}

test("worker budgets are larger than the page thread's", () => {
  assert.ok(RACE_WORKER_PASSES[0] > RACE_NODE_BUDGET);
  for (let j = 1; j < RACE_WORKER_PASSES.length; j++) assert.ok(RACE_WORKER_PASSES[j] > RACE_WORKER_PASSES[j - 1]);
  assert.ok(RACE_WORKER_MAGIC_BUDGET > RACE_MAGIC_BUDGET);
});

test("deepRace returns plain rows (structured-clone safe) with exact and proved", () => {
  const t = tableAt("it.1.2023-24", 70, 4);
  const updates = [];
  const d = deepRace({ ...t, passes: [20000], magicBudget: 100, onUpdate: (u) => updates.push(u) });
  assert.equal(updates.at(-1).final, true);
  assert.equal(updates.filter((u) => u.final).length, 1);
  assert.equal(d.rows.length, t.teams.length);
  assert.equal(typeof d.proved, "boolean");
  assert.equal(typeof d.exact, "boolean");
  assert.deepEqual(JSON.parse(JSON.stringify(d.rows)), d.rows);
  for (const r of d.rows) assert.ok(["clinched", "eliminated", "alive"].includes(r.status));
});

test("a bigger budget never undoes a call and never raises a magic number", () => {
  for (const [key, idx, spots] of [["it.1.2023-24", 70, 4], ["it.1.2023-24", 75, 17], ["it.1.2023-24", 100, 17]]) {
    const t = tableAt(key, idx, spots);
    const quick = playoffRace(t.teams, t.results, t.remaining, t.spots);
    const deep = deepRace({ ...t, passes: [200000], magicBudget: 5000, seconds: 20 });
    const q = new Map(quick.map((r) => [r.index, r]));
    for (const r of deep.rows) {
      const o = q.get(r.index);
      if (o.status !== "alive") assert.equal(r.status, o.status, `${key} ${r.name}`);
      assert.ok(r.bestRank >= o.bestRank && r.worstRank <= o.worstRank, `${key} ${r.name} ranks`);
      if (o.magic != null && r.magic != null) assert.ok(r.magic <= o.magic, `${key} ${r.name} magic`);
    }
    if (quick.proved) assert.equal(deep.proved, true);
  }
});

test("the page hands unproved tables to race-worker.mjs and drops stale answers", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /new Worker\("\.\/race-worker\.mjs", \{ type: "module" \}\)/);
  assert.match(html, /if \(!race\.ask \|\| race\.rows\.exact \|\| race\.rows\.proved\) return;/);
  assert.match(html, /if \(d\.id !== raceAsk \|\| !last \|\| last\.race !== race\) return;/);
  assert.match(html, /raceWorker\.terminate\(\)/);
  const worker = readFileSync(new URL("./race-worker.mjs", import.meta.url), "utf8");
  // the worker imports only sibling modules, never a package or URL
  for (const m of worker.matchAll(/^\s*import .* from "([^"]+)"/gm)) assert.ok(m[1].startsWith("./"), m[1]);
});

// random part-played leagues small enough to enumerate: the worker, forced onto the search route with a tiny
// page budget, must agree with every finish tried one by one wherever it says clinched or out
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
test("worker statuses never contradict the full enumeration (200 random leagues)", () => {
  const r = rng(20261123);
  let settled = 0;
  for (let t = 0; t < 200; t++) {
    const n = 4 + Math.floor(r() * 4);
    const teams = Array.from({ length: n }, (_, i) => `T${i}`);
    const all = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { all.push([a, b]); if (r() < 0.5) all.push([b, a]); }
    const cut = Math.max(0, all.length - 1 - Math.floor(r() * Math.min(10, all.length)));
    const results = all.slice(0, cut).map(([a, b]) => ({ a, b, ga: Math.floor(r() * 3), gb: Math.floor(r() * 3) }));
    const remaining = all.slice(cut).map(([a, b]) => [a, b]);
    const spots = 1 + Math.floor(r() * (n - 1));
    const truth = new Map(brute(teams, results, remaining, spots).map((x) => [x.index, x]));
    const d = deepRace({ teams, results, remaining, spots, options: { exactLimit: 0, nodeBudget: 1, magicBudget: 0 }, passes: [50, 5000], magicBudget: 0 });
    const page = new Map(brute(teams, results, remaining, spots, { exactLimit: 0, nodeBudget: 1, magicBudget: 0 }).map((x) => [x.index, x]));
    for (const row of d.rows) {
      const tr = truth.get(row.index);
      if (row.status !== "alive") assert.equal(row.status, tr.status, `league ${t} ${row.name}`);
      if (row.clinchedUnlessTied) assert.ok(tr.clinchedUnlessTied || tr.status === "clinched", `league ${t} ${row.name} tie`);
      if (page.get(row.index).status === "alive" && row.status !== "alive") settled++;
      // with the search allowed 5,000 nodes on leagues this small every status is proved: alive means alive
      if (d.open === 0 && row.status === "alive") assert.equal(tr.status, "alive", `league ${t} ${row.name} alive`);
    }
  }
  assert.ok(settled > 0, "the worker settled nothing the page left alive");
});
