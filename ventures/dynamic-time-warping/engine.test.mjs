import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  dtw, dtwDistance, pathCost, subsequenceSearch, windowFn, lagProfile, analyze, parseCsv, columnSeries,
  profileColumns, smooth, znormalize, toCsv, csvCell, PAPERS, STEPS,
} from "./engine.mjs";
import { EXAMPLE_CSV } from "./example-data.mjs";

const REF = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32);
}
const randomSeries = (rand, n) => Array.from({ length: n }, () => Math.round((rand() * 4 - 2) * 1e4) / 1e4);

test("matches dtw-python on every step pattern, window and distance (120 cases): distance, normalised distance and path", () => {
  assert.match(REF.generator, /^dtw-python 1\.9\.0/);
  assert.equal(REF.pairs.length, 120);
  for (const c of REF.pairs) {
    const label = `${c.step} ${c.windowType}${c.window ?? ""} ${c.dist} ${c.x.length}x${c.y.length}`;
    const r = dtw(c.x, c.y, { step: c.step, windowType: c.windowType, window: c.window, dist: c.dist });
    assert.ok(close(r.distance, c.distance), `${label}: ${r.distance} vs ${c.distance}`);
    if (c.normalizedDistance === null) assert.equal(r.normalizedDistance, null, label);
    else assert.ok(close(r.normalizedDistance, c.normalizedDistance), label);
    assert.deepEqual(r.path, c.path, label);
  }
});

test("open-begin, open-end subsequence search matches dtw-python's best match", () => {
  assert.equal(REF.subsequence.length, 6);
  for (const c of REF.subsequence) {
    const s = subsequenceSearch(c.x, c.y, { dist: c.dist, matches: 3 });
    const best = s.matches[0];
    assert.ok(close(best.distance, c.distance), `${best.distance} vs ${c.distance}`);
    assert.ok(close(best.normalizedDistance, c.normalizedDistance));
    assert.equal(best.start, c.start);
    assert.equal(best.end, c.end);
  }
});

test("the returned path is valid for its step pattern and costs exactly the distance", () => {
  const rand = lcg(7);
  for (const step of Object.keys(STEPS)) {
    for (const [n, m] of [[9, 9], [14, 23], [30, 18]]) {
      const x = randomSeries(rand, n);
      const y = randomSeries(rand, m);
      for (const windowType of ["none", "band", "itakura"]) {
        const r = dtw(x, y, { step, windowType, window: 5 });
        if (!Number.isFinite(r.distance)) continue;
        assert.deepEqual(r.path[0], [0, 0]);
        assert.deepEqual(r.path.at(-1), [n - 1, m - 1]);
        const inWin = windowFn(n, m, windowType, 5);
        for (let k = 1; k < r.path.length; k++) {
          const di = r.path[k][0] - r.path[k - 1][0];
          const dj = r.path[k][1] - r.path[k - 1][1];
          const ok = step === "asymmetric" ? di === 1 && dj >= 0 && dj <= 2 : di >= 0 && dj >= 0 && di <= 1 && dj <= 1 && di + dj > 0;
          assert.ok(ok, `${step} illegal move ${di},${dj}`);
          assert.ok(inWin(...r.path[k]), "path leaves the window");
        }
        assert.ok(close(pathCost(x, y, r.path, step), r.distance), `${step} ${windowType} path cost`);
        assert.ok(close(dtwDistance(x, y, { step, windowType, window: 5 }).distance, r.distance), "two-row version agrees");
      }
    }
  }
});

test("brute force over every monotone path agrees on small series (symmetric1, symmetric2)", () => {
  const rand = lcg(11);
  for (let trial = 0; trial < 20; trial++) {
    const n = 2 + Math.floor(rand() * 4);
    const m = 2 + Math.floor(rand() * 4);
    const x = randomSeries(rand, n);
    const y = randomSeries(rand, m);
    for (const step of ["symmetric1", "symmetric2"]) {
      let best = Infinity;
      const walk = (path) => {
        const [i, j] = path.at(-1);
        if (i === n - 1 && j === m - 1) { best = Math.min(best, pathCost(x, y, path, step)); return; }
        if (i + 1 < n && j + 1 < m) walk([...path, [i + 1, j + 1]]);
        if (i + 1 < n) walk([...path, [i + 1, j]]);
        if (j + 1 < m) walk([...path, [i, j + 1]]);
      };
      walk([[0, 0]]);
      assert.ok(close(dtw(x, y, { step, windowType: "none" }).distance, best), `${step} ${n}x${m}`);
    }
  }
});

test("properties: zero for identical series, symmetric for symmetric patterns, no more than no warping, band 0 is no warping", () => {
  const rand = lcg(3);
  const x = randomSeries(rand, 40);
  const y = randomSeries(rand, 40);
  for (const step of Object.keys(STEPS)) assert.equal(dtw(x, x, { step }).distance, 0);
  for (const step of ["symmetric1", "symmetric2"]) {
    assert.ok(close(dtw(x, y, { step, windowType: "none" }).distance, dtw(y, x, { step, windowType: "none" }).distance));
  }
  const diag = x.map((_, i) => [i, i]);
  for (const step of Object.keys(STEPS)) {
    const lock = pathCost(x, y, diag, step);
    assert.ok(dtw(x, y, { step, windowType: "none" }).distance <= lock + 1e-12);
    assert.ok(close(dtw(x, y, { step, windowType: "band", window: 0 }).distance, lock), `${step} band 0`);
  }
  // A wider band can only lower the distance.
  let prev = Infinity;
  for (const w of [0, 1, 2, 4, 8, 40]) {
    const d = dtw(x, y, { windowType: "band", window: w }).distance;
    assert.ok(d <= prev + 1e-12);
    prev = d;
  }
});

test("a shifted copy is found: the lag profile reads the shift as timing", () => {
  const n = 120;
  const base = Array.from({ length: n + 20 }, (_, t) => Math.sin((2 * Math.PI * t) / 120) * 10);
  const x = base.slice(10, 10 + n);
  const y = base.slice(5, 5 + n); // y is x delayed by 5 steps
  const r = dtw(x, y, { windowType: "band", window: 15 });
  const prof = lagProfile(x, y, r.path);
  const timing = prof.filter((p) => p.reading === "timing");
  assert.ok(timing.length > 0.5 * n, `${timing.length} timing points`);
  // The path is pinned to both corners, so the first and last few rows are pulled toward zero lag.
  for (const p of timing) if (p.i >= 10 && p.i < n - 10) assert.ok(Math.abs(p.lag - 5) <= 1, `lag ${p.lag} at ${p.i}`);
  // Near the peaks and troughs of x the lag is a hop, not a delay.
  const turn = prof.filter((p) => p.reading === "turn").map((p) => p.i);
  assert.ok(turn.some((i) => Math.abs(i - 20) <= 6), "the peak near step 20 is flagged");
});

test("a pure level difference is read as level, not timing", () => {
  const x = Array.from({ length: 60 }, (_, t) => Math.sin(t / 5));
  const y = x.map((v) => v + 3);
  const prof = lagProfile(x, y, dtw(x, y, { windowType: "band", window: 6 }).path);
  assert.ok(prof.filter((p) => p.reading === "level").length > 50);
});

test("subsequence search finds a planted pattern and takes non-overlapping matches in order", () => {
  const rand = lcg(5);
  const y = randomSeries(rand, 300).map((v, i, a) => (i ? v : v));
  const pattern = [0, 4, 8, 4, 0, -4, -8, -4, 0];
  y.splice(50, pattern.length, ...pattern);
  const stretched = pattern.flatMap((v) => [v, v]);
  y.splice(200, stretched.length, ...stretched);
  const s = subsequenceSearch(pattern, y, { matches: 4 });
  const starts = s.matches.slice(0, 2).map((t) => t.start).sort((a, b) => a - b);
  assert.ok(Math.abs(starts[0] - 50) <= 1 && Math.abs(starts[1] - 200) <= 2, JSON.stringify(s.matches.slice(0, 2)));
  for (let k = 1; k < s.matches.length; k++) assert.ok(s.matches[k].distance >= s.matches[k - 1].distance);
  for (const a of s.matches) for (const b of s.matches) if (a !== b) assert.ok(a.end < b.start || b.end < a.start, "overlap");
  for (const t of s.matches) assert.ok(close(pathCost(pattern, y, t.path, "asymmetric"), t.distance), "match path cost");
});

test("windows: Itakura admits only slopes between 1/2 and 2; a too-narrow band admits no path", () => {
  const f = windowFn(20, 20, "itakura");
  assert.ok(f(0, 0) && f(19, 19) && f(10, 10));
  assert.ok(!f(2, 10) && !f(10, 2));
  const r = dtw([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2], { windowType: "band", window: 0, step: "asymmetric" });
  assert.equal(r.distance, 0 * 0 + Infinity);
  assert.throws(() => dtw([1], [1, 2]), /at least 2/);
  assert.throws(() => dtw([1, NaN], [1, 2]), /finite/);
  assert.throws(() => dtw([1, 2], [1, 2], { step: "nope" }), /unknown step/);
  assert.throws(() => dtw(new Array(6000).fill(0), new Array(6000).fill(0)), /over the limit/);
});

test("CSV reading: separators, quotes, blanks at the ends dropped and inside filled", () => {
  const p = parseCsv('when;"a";b\n"x;1";1;\n2;;5\n3;4;6\n4;;\n');
  assert.deepEqual(p.columns, ["when", "a", "b"]);
  assert.equal(p.rows[0][0], "x;1");
  const prof = profileColumns(p);
  assert.deepEqual(prof.numeric, ["a", "b"]);
  assert.equal(prof.label, "when");
  const a = columnSeries(p, "a");
  assert.deepEqual(a.values, [1, 2.5, 4]);
  assert.equal(a.filled, 1);
  const b = columnSeries(p, "b");
  assert.deepEqual(b.values, [5, 6]);
  assert.equal(b.offset, 1);
  assert.ok(parseCsv("a\n1").error);
  assert.deepEqual(smooth([1, 2, 3, 10], 1), [1.5, 2, 5, 6.5]);
  assert.deepEqual(znormalize([1, 3]), [-1, 1]);
  assert.throws(() => znormalize([2, 2]));
  assert.equal(csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
  assert.equal(csvCell("-3.5"), `"-3.5"`);
});

test("the Central Park example: spring normals arrive earlier and autumn ones linger later in 1991-2020 than in 1871-1900", () => {
  const r = analyze({ csv: EXAMPLE_CSV, a: "tmax_1871_1900", b: "tmax_1991_2020", smooth: 15 });
  assert.equal(r.error, undefined);
  assert.equal(r.label, "day");
  assert.equal(r.pair.n, 365);
  assert.equal(r.settings.window, 37);
  assert.ok(close(r.pair.distance, 227.542, 1e-5), String(r.pair.distance));
  assert.ok(close(r.pair.normalizedDistance, 0.3117, 1e-3));
  assert.ok(r.pair.saved > 0.84 && r.pair.saved < 0.85);
  const seg = Object.fromEntries(r.pair.segments.map((s) => [s.from, s]));
  assert.equal(seg["04-02"].to, "05-01");
  assert.ok(Math.abs(seg["04-02"].timingLag + 14.3) < 0.1, String(seg["04-02"].timingLag));
  assert.equal(seg["04-02"].timingShare, 1);
  assert.ok(Math.abs(seg["10-01"].timingLag - 7.5) < 0.1, String(seg["10-01"].timingLag));
  assert.ok(seg["07-02"].turnShare > 0.3, "the summer peak is flagged as a turn");
  assert.ok(seg["01-01"].levelShare === 1, "midwinter is a level difference");
  assert.match(r.summary, /furthest ahead of "tmax_1871_1900" over 03-02 to 04-01, by 23\.5 steps/);
  // The same reading with no smoothing and with less: April within two days.
  for (const sm of [0, 7]) {
    const s = analyze({ csv: EXAMPLE_CSV, a: "tmax_1871_1900", b: "tmax_1991_2020", smooth: sm }).pair.segments.find((g) => g.from === "04-02");
    assert.ok(s.timingLag < -13 && s.timingLag > -17, `smooth ${sm}: ${s.timingLag}`);
  }
  assert.deepEqual(r.matrix.columns, ["tmax_1871_1900", "tmax_1901_1930", "tmax_1931_1960", "tmax_1961_1990", "tmax_1991_2020"]);
  assert.equal(r.matrix.nearest[0].nearest, "tmax_1901_1930");
  const csv = toCsv(r).trim().split("\n");
  assert.equal(csv.length, r.pair.path.length + 1);
  assert.match(csv[0], /^step,index_a,index_b,label_a,label_b,/);
});

test("analyze: subsequence mode, settings checks and errors", () => {
  const rows = ["t,query,long"];
  const rand = lcg(9);
  const long = randomSeries(rand, 80);
  const q = long.slice(30, 40);
  long.forEach((v, i) => rows.push(`${i},${i < q.length ? q[i] : ""},${v}`));
  const r = analyze({ csv: rows.join("\n"), a: "query", b: "long", mode: "subsequence", matches: 2 });
  assert.equal(r.error, undefined);
  assert.equal(r.subsequence.matches[0].from, "row 31");
  assert.equal(r.subsequence.matches[0].distance, 0);
  assert.equal(r.settings.step, "asymmetric");
  assert.match(toCsv(r), /^rank,from,to,/);
  assert.match(analyze({ csv: rows.join("\n"), a: "long", b: "query", mode: "subsequence" }).error, /shorter/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4\n", step: "x" }).error, /Step pattern/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4\n", a: "a", b: "a" }).error, /two different/);
  assert.match(analyze({ csv: "a,t\n1,x\n3,y\n" }).error, /two numeric columns/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4\n5,6\n7,8\n", a: "zzz" }).error, /not a numeric column/);
  assert.match(analyze({ csv: "a,b\n1,2\n2,3\n3,4\n4,5\n", windowType: "itakura", b: "b", a: "a" }).error ?? "ok", /ok/);
});

test("PAPERS names what was used, with DOIs", () => {
  assert.equal(PAPERS.length, 5);
  for (const p of PAPERS) {
    assert.match(p.doi, /^10\.\d{4,}\//);
    assert.ok(p.used.length > 30);
  }
});
