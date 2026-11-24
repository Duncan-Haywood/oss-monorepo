import test from "node:test";
import assert from "node:assert/strict";
import { haversineKm, parseTeamLocations, parseKeepApart, divisionSizes, splitByLocation, splitCost, compassNames, describeSplit, divisionsText, multiDivisionFragment } from "./regions.mjs";
import { decodeDivisionFields } from "./divisions.mjs";
import { mulberry32 } from "./rng.mjs";

// every split of n items into groups of the given sizes (groups of equal size unordered), cheapest cost and the
// cost when keep-apart pairs must be honoured
function exhaustive(cost, sizes, apartPairs = new Set()) {
  const n = cost.length;
  let best = Infinity;
  const used = new Array(n).fill(false);
  const groups = [];
  const rec = (gi, cur) => {
    if (gi === sizes.length) { best = Math.min(best, splitCost(groups, cost)); return; }
    const first = used.indexOf(false); // each group starts with the lowest unused item: no permutations of equal groups
    const pick = [first]; used[first] = true;
    const grow = (from) => {
      if (pick.length === sizes[gi]) {
        for (const a of pick) for (const b of pick) if (a < b && apartPairs.has(a + "," + b)) return;
        groups.push(pick.slice()); rec(gi + 1, cur); groups.pop(); return;
      }
      for (let j = from; j < n; j++) if (!used[j]) { used[j] = true; pick.push(j); grow(j + 1); pick.pop(); used[j] = false; }
    };
    grow(first + 1);
    used[first] = false;
  };
  // sizes larger first and each group led by the lowest unused item only removes duplicates when equal sizes are adjacent;
  // with uneven sizes (e.g. 4,3,3) a lowest-led group of size 3 placed first is still reached by the ordering below
  const perms = new Set();
  const permute = (arr, k = 0) => { if (k === arr.length) { perms.add(arr.join(",")); return; } for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; permute(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; } };
  permute(sizes.slice());
  for (const p of perms) { sizes = p.split(",").map(Number); rec(0, 0); }
  return best;
}

const randomPoints = (n, seed) => { const r = mulberry32(seed); return Array.from({ length: n }, () => [40 + r() * 2, -75 + r() * 3]); };
const matrix = (pts) => pts.map((p) => pts.map((q) => haversineKm(p, q)));

test("haversine: New York to Los Angeles about 3,936 km", () => {
  assert.ok(Math.abs(haversineKm([40.7128, -74.006], [34.0522, -118.2437]) - 3936) < 5);
});

test("divisionSizes even, larger first", () => {
  assert.deepEqual(divisionSizes(10, 3), [4, 3, 3]);
  assert.deepEqual(divisionSizes(32, 8), Array(8).fill(4));
});

test("parseTeamLocations reads lines and names bad ones", () => {
  const r = parseTeamLocations("Hawks @ 40.7, -74.0\n# comment\nOwls @ 41; -73.5\nbad line\nHawks @ 1, 2\nFar @ 95, 0");
  assert.deepEqual(r.teams.map((t) => t.name), ["Hawks", "Owls"]);
  assert.equal(r.errors.length, 3);
});

test("parseKeepApart", () => {
  const r = parseKeepApart("A, B\nC, Z\nA, a", ["A", "B", "C"]);
  assert.deepEqual(r.groups, [[0, 1]]);
  assert.equal(r.errors.length, 2);
});

test("the search reaches the exhaustive best on 60 small random leagues", () => {
  const shapes = [[8, 2], [9, 3], [10, 2], [10, 3], [12, 3], [12, 4], [11, 3], [12, 2]];
  let checked = 0;
  for (let s = 1; checked < 60; s++) {
    const [n, k] = shapes[s % shapes.length];
    const pts = randomPoints(n, s);
    const want = exhaustive(matrix(pts), divisionSizes(n, k));
    const got = splitByLocation(pts, { divisions: k, seed: s, starts: 16, kicks: 10 });
    assert.ok(Math.abs(got.km - want) < 1e-6, `n=${n} k=${k} seed=${s}: ${got.km} vs best ${want}`);
    assert.deepEqual(got.groups.map((g) => g.length).sort(), divisionSizes(n, k).slice().sort());
    checked++;
  }
});

test("keep-apart groups are honoured and the result is the best split that honours them", () => {
  for (let s = 1; s <= 15; s++) {
    const pts = randomPoints(10, 100 + s);
    const apart = [[0, 1], [2, 3, 4]];
    const pairs = new Set(["0,1", "2,3", "2,4", "3,4"]);
    const want = exhaustive(matrix(pts), divisionSizes(10, 3), pairs);
    const got = splitByLocation(pts, { divisions: 3, apart, seed: s, starts: 16, kicks: 10 });
    assert.equal(got.apartBroken, 0);
    for (const g of got.groups) { assert.ok(!(g.includes(0) && g.includes(1))); assert.ok(g.filter((i) => i >= 2 && i <= 4).length <= 1); }
    assert.ok(Math.abs(got.km - want) < 1e-6, `seed ${s}: ${got.km} vs ${want}`);
  }
});

test("a keep-apart group larger than the number of divisions throws", () => {
  assert.throws(() => splitByLocation(randomPoints(6, 1), { divisions: 2, apart: [[0, 1, 2]] }), /at least 3 divisions/);
});

test("two obvious clusters split cleanly and are named by compass", () => {
  const teams = [
    ...["N1", "N2", "N3"].map((name, i) => ({ name, lat: 45 + i * 0.01, lon: -75 })),
    ...["S1", "S2", "S3"].map((name, i) => ({ name, lat: 40 + i * 0.01, lon: -75 })),
  ];
  const r = splitByLocation(teams.map((t) => [t.lat, t.lon]), { divisions: 2 });
  assert.deepEqual(r.groups, [[0, 1, 2], [3, 4, 5]]);
  const d = describeSplit(r.groups, teams);
  assert.deepEqual(d.map((x) => x.name), ["North", "South"]);
  assert.equal(divisionsText(d, { double: true }), "North: N1, N2, N3 (double)\nSouth: S1, S2, S3 (double)");
});

test("compass names number repeats and call a centre division Central", () => {
  const pts = [[0, -10], [0, 10], [0, 0.01], [0, 0]];
  assert.deepEqual(compassNames([[0], [1], [2, 3]], pts), ["West", "East", "Central"]);
  assert.deepEqual(compassNames([[0], [1], [2]], [[10, 0], [10.5, 0], [-30, 0]]), ["North 1", "North 2", "South"]);
});

test("the multi-division link decodes with the multi-division page's own reader", () => {
  const text = "North: Hawks, Owls\nSouth: Lynx, Otters ü";
  assert.equal(decodeDivisionFields(multiDivisionFragment(text)).divisions, text);
});

test("same seed, same split", () => {
  const pts = randomPoints(20, 7);
  assert.deepEqual(splitByLocation(pts, { divisions: 4, seed: 3 }).groups, splitByLocation(pts, { divisions: 4, seed: 3 }).groups);
});

test("page wires the module, carries the disclaimer, tracking and links", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./divisions-by-location.html", import.meta.url), "utf8");
  assert.match(html, /from "\.\/regions\.mjs"/);
  assert.match(html, /from "\.\/usage\.mjs"/);
  assert.match(html, /No warranty/);
  assert.match(html, /<link rel="canonical" href="\.\/divisions-by-location\.html">/);
  for (const f of ["index.html", "sitemap.xml", "llms.txt", "multi-division-league-schedule.html"]) {
    assert.match(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /divisions-by-location\.html/, f);
  }
});

test("the NFL check in eval/nfl-divisions.txt is what the module computes now", async () => {
  const { readFileSync } = await import("node:fs");
  const rows = readFileSync(new URL("./eval/nfl-stadium-towns.txt", import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("|")[0].trim().match(/@ (-?[\d.]+), (-?[\d.]+)$/).slice(1).map(Number));
  assert.equal(rows.length, 32);
  const r = splitByLocation(rows, { divisions: 8, starts: 400, kicks: 60, seed: 1 });
  const txt = readFileSync(new URL("./eval/nfl-divisions.txt", import.meta.url), "utf8");
  assert.match(txt, new RegExp(`rival pairs ${Math.round(r.km).toLocaleString("en-US")} km`));
});
