import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJobs, parseCrews, optimize, makeProblem, solve, normalizeOptions, dispatchCsv, sampleJobs, sampleCrews, fmtTime, money, looksLikeGrid } from "./calc.mjs";

function lcg(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

function randomCase(seed, n, m, withValue = false) {
  const r = lcg(seed);
  const skillsPool = ["a", "b"];
  const jobs = Array.from({ length: n }, (_, i) => ({
    name: `J${i}`, a: r() * 20, b: r() * 20, hours: 0.5 + Math.floor(r() * 4) / 2,
    skills: r() < 0.3 ? [skillsPool[Math.floor(r() * 2)]] : [], value: withValue ? 30 + Math.floor(r() * 300) : null,
  }));
  const crews = Array.from({ length: m }, (_, i) => ({
    name: `C${i}`, a: r() * 20, b: r() * 20, hours: 4 + Math.floor(r() * 5), rate: 30 + Math.floor(r() * 30),
    skills: r() < 0.6 ? skillsPool.slice() : [skillsPool[Math.floor(r() * 2)]],
  }));
  return { jobs, crews };
}

const GRID = { coords: "grid", speedMph: 25, circuity: 1.2, mileCost: 0.6 };

// Independent brute force: every assignment of jobs to a crew or nobody, every visiting order.
const BIG = 1e7;
const objectiveOf = (r, jobs) => r.total + BIG * r.unassigned.filter((u) => jobs[u.job].value === null).length;

function bruteForce(jobs, crews, opts) {
  const P = makeProblem(jobs, crews, normalizeOptions(opts));
  const n = jobs.length, m = crews.length;
  const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
  const cache = new Map();
  const best = (c, list) => {
    if (!list.length) return 0;
    const key = c + ":" + list.join(",");
    if (cache.has(key)) return cache.get(key);
    let b = Infinity;
    for (const p of perms(list)) {
      if (p.some((j) => !P.ok[c][j])) return (cache.set(key, Infinity), Infinity);
      let dist = 0, work = 0, prev = -1;
      for (const j of p) { dist += prev < 0 ? P.dS[c][j] : P.dJ[prev][j]; work += jobs[j].hours; prev = j; }
      if (P.opt.returnToStart) dist += P.dS[c][prev];
      const time = work + dist / P.opt.speedMph;
      if (time <= crews[c].hours + 1e-9) b = Math.min(b, P.rate[c] * time + P.opt.mileCost * dist);
    }
    cache.set(key, b);
    return b;
  };
  let bestTotal = Infinity;
  const assign = new Array(n);
  (function rec(j) {
    if (j === n) {
      const lists = Array.from({ length: m }, () => []);
      let pen = 0;
      assign.forEach((c, k) => (c < 0 ? (pen += P.pen[k]) : lists[c].push(k)));
      let t = pen;
      for (let c = 0; c < m; c++) { t += best(c, lists[c]); if (t === Infinity) return; }
      bestTotal = Math.min(bestTotal, t);
      return;
    }
    for (let c = -1; c < m; c++) { assign[j] = c; rec(j + 1); }
  })(0);
  return bestTotal;
}

test("exact solver matches brute force on random small problems", () => {
  for (let s = 1; s <= 25; s++) {
    const { jobs, crews } = randomCase(s, 5, 2, s % 2 === 0);
    const r = optimize({ jobs, crews }, GRID);
    const bf = bruteForce(jobs, crews, GRID);
    assert.equal(r.method, "exact");
    assert.ok(Math.abs(objectiveOf(r, jobs) - bf) < 1e-6, `seed ${s}: solver ${objectiveOf(r, jobs)} vs brute force ${bf}`);
  }
});

test("exact solver matches brute force with one-way routes and three crews", () => {
  for (let s = 40; s < 48; s++) {
    const { jobs, crews } = randomCase(s, 5, 3, true);
    const o = { ...GRID, returnToStart: false };
    const r = optimize({ jobs, crews }, o);
    assert.ok(Math.abs(objectiveOf(r, jobs) - bruteForce(jobs, crews, o)) < 1e-6, `seed ${s}`);
  }
});

test("heuristic (more than 12 jobs) is deterministic, feasible, and never worse than the nearest-crew baseline", () => {
  const { jobs, crews } = randomCase(7, 24, 4, false);
  crews.forEach((c) => { c.hours = 12; c.skills = ["a", "b"]; });
  const r1 = optimize({ jobs, crews }, GRID), r2 = optimize({ jobs, crews }, GRID);
  assert.equal(r1.method, "heuristic");
  assert.equal(r1.total, r2.total);
  assert.equal(r1.unserved, 0);
  for (const c of r1.crews) assert.ok(c.totalHours <= c.capacity + 1e-6, `${c.name} over capacity`);
  assert.ok(r1.total <= r1.naiveBest.cost + 1e-6);
  assert.ok(r1.saveVsNaive >= -1e-6);
});

test("the heuristic agrees with the exact solver on instances just past the exact limit scaled down", () => {
  // Same instance solved by the heuristic (forced via a large restart count on n=9) vs exact.
  let gap = 0;
  for (let s = 200; s < 210; s++) {
    const { jobs, crews } = randomCase(s, 9, 3, true);
    const exact = optimize({ jobs, crews }, GRID).total;
    const P = makeProblem(jobs, crews, normalizeOptions({ ...GRID, restarts: 60 }));
    // solveHeuristic is internal; emulate by temporarily treating as oversize through optimize on duplicated-free input:
    const heur = heuristicTotal(P);
    gap = Math.max(gap, (heur - exact) / exact);
    assert.ok(heur >= exact - 1e-6, "heuristic cannot beat the exact optimum");
  }
  assert.ok(gap < 0.03, `worst gap ${gap}`);
});

function heuristicTotal(P) {
  // Use the exported solve() on a copy whose n exceeds the exact limit by adding 4 jobs no crew can serve.
  const ghost = Array.from({ length: 4 }, (_, i) => ({ name: `ghost${i}`, a: 0, b: 0, hours: 1, skills: ["nobody-has-this"], value: 0 }));
  const r = optimize({ jobs: [...P.jobs, ...ghost], crews: P.crews }, { ...P.opt, restarts: 60 });
  assert.equal(r.method, "heuristic");
  return r.total;
}

test("a job needing a skill nobody has is reported, not silently dropped", () => {
  const jobs = [{ name: "A", a: 1, b: 1, hours: 1, skills: ["gas"], value: null }, { name: "B", a: 2, b: 2, hours: 1, skills: [], value: null }];
  const crews = [{ name: "C", a: 0, b: 0, hours: 8, rate: 40, skills: ["hvac"] }];
  const r = optimize({ jobs, crews }, GRID);
  assert.equal(r.unserved, 1);
  assert.match(r.unassigned[0].reason, /no crew has gas/);
  assert.ok(r.warnings.some((w) => /skill no crew has/.test(w)));
});

test("a job that does not fit anywhere says so, and one that costs more than it earns is skipped", () => {
  const crews = [{ name: "C", a: 0, b: 0, hours: 4, rate: 40, skills: [] }];
  const jobs = [
    { name: "Long", a: 1, b: 0, hours: 6, skills: [], value: null },
    { name: "Cheap", a: 30, b: 0, hours: 1, skills: [], value: 20 },
    { name: "Good", a: 1, b: 1, hours: 1, skills: [], value: 200 },
  ];
  const r = optimize({ jobs, crews }, GRID);
  const reasons = Object.fromEntries(r.unassigned.map((u) => [u.name, u.reason]));
  assert.match(reasons.Long, /too long for any single crew/);
  assert.match(reasons.Cheap, /costs more to serve/);
  assert.equal(r.served, 1);
  assert.equal(r.crews[0].stops[0].name, "Good");
});

test("no crew is ever planned past its available hours", () => {
  for (let s = 300; s < 315; s++) {
    const { jobs, crews } = randomCase(s, 8, 3, false);
    const r = optimize({ jobs, crews }, GRID);
    for (const c of r.crews) assert.ok(c.totalHours <= c.capacity + 1e-6);
    const served = r.crews.flatMap((c) => c.stops.map((x) => x.job));
    assert.equal(new Set(served).size, served.length, "a job is planned twice");
  }
});

test("skills are respected in every route", () => {
  const { jobs, crews } = randomCase(11, 9, 3, false);
  const r = optimize({ jobs, crews }, GRID);
  for (const c of r.crews) for (const s of c.stops) for (const need of jobs[s.job].skills) assert.ok(crews[c.crew].skills.includes(need));
});

test("stop times add up: arrival = previous departure + drive time at the set speed", () => {
  const jobs = [{ name: "A", a: 0, b: 10, hours: 1, skills: [], value: null }, { name: "B", a: 0, b: 20, hours: 2, skills: [], value: null }];
  const crews = [{ name: "C", a: 0, b: 0, hours: 12, rate: 40, skills: [] }];
  const r = optimize({ jobs, crews }, { coords: "grid", circuity: 1, speedMph: 20, startMinute: 480, mileCost: 0, returnToStart: false });
  const stops = r.crews[0].stops;
  assert.equal(stops[0].name, "A");
  assert.equal(Math.round(stops[0].arriveMinute), 480 + 30);
  assert.equal(Math.round(stops[0].departMinute), 480 + 90);
  assert.equal(Math.round(stops[1].arriveMinute), 480 + 90 + 30);
  assert.ok(Math.abs(r.miles - 20) < 1e-9); // out 20, no return
  assert.ok(Math.abs(r.cost - 40 * (3 + 1)) < 1e-6); // 3h on site + 1h driving
});

test("lat/lon distances use the great circle: one degree of latitude is about 69 miles", () => {
  const jobs = [{ name: "A", a: 40, b: -100, hours: 1, skills: [], value: null }];
  const crews = [{ name: "C", a: 41, b: -100, hours: 24, rate: 0, skills: [] }];
  const r = optimize({ jobs, crews }, { circuity: 1, returnToStart: false, coords: "latlon" });
  assert.ok(Math.abs(r.miles - 69.1) < 0.3, String(r.miles));
  assert.equal(looksLikeGrid(jobs, crews), false);
  assert.equal(looksLikeGrid([{ a: 120, b: 5 }], []), true);
});

test("parsers accept headers, tab separation, quoted names, h:mm hours and $ values", () => {
  const j = parseJobs('name\tx\ty\thours\tskill\tvalue\n"Smith, A"\t1\t2\t1:30\thvac|gas\t$1,200\nB\t3\t4\t2\t\t');
  assert.equal(j.jobs.length, 2);
  assert.equal(j.jobs[0].name, "Smith, A");
  assert.equal(j.jobs[0].hours, 1.5);
  assert.deepEqual(j.jobs[0].skills, ["hvac", "gas"]);
  assert.equal(j.jobs[0].value, 1200);
  assert.equal(j.jobs[1].value, null);
  const c = parseCrews("Van A,1,2,8\nVan B,3,4,6,55,hvac/plumb");
  assert.equal(c.crews.length, 2);
  assert.equal(c.crews[0].rate, null);
  assert.deepEqual(c.crews[1].skills, ["hvac", "plumb"]);
  assert.equal(c.crews[1].rate, 55);
});

test("parsers explain what is wrong instead of guessing", () => {
  assert.match(parseJobs("").error, /Add your jobs/);
  assert.match(parseJobs("a,1,x,2").error, /must be numbers/);
  assert.match(parseJobs("a,1,2,0").error, /hours on site/);
  assert.match(parseJobs("a,1,2,1,,abc").error, /value/);
  assert.match(parseCrews("v,1,2,-3").error, /hours available/);
  const many = Array.from({ length: 81 }, (_, i) => `j${i},1,2,1`).join("\n");
  assert.match(parseJobs(many).error, /up to 80/);
  assert.match(optimize({ jobs: [], crews: [{}] }).error, /at least one job/);
  assert.match(optimize({ jobs: [{}], crews: [] }).error, /at least one crew/);
});

test("the sample day parses, solves exactly, and beats sending each job to the nearest crew", () => {
  const j = parseJobs(sampleJobs()), c = parseCrews(sampleCrews());
  assert.ok(j.jobs && c.crews);
  const r = optimize({ jobs: j.jobs, crews: c.crews });
  assert.equal(r.method, "exact");
  assert.ok(r.saveVsNaive > 50, String(r.saveVsNaive));
  assert.ok(r.saveVsNaiveBest >= -1e-6);
  assert.equal(r.unserved, 1);
  assert.match(r.unassigned[0].name, /Ruiz/);
  assert.equal(r.crewOut.length, 3);
  assert.ok(r.crewOut.every((x) => x.delta > 0), "losing any crew should cost money on the sample day");
  assert.ok(r.longRows[2].cost >= r.longRows[0].cost);
  assert.ok(r.extraCrew.delta <= 1e-6, "an extra crew can never make the optimum worse");
});

test("CSV export lists every stop and every unplanned job", () => {
  const r = optimize({ jobs: parseJobs(sampleJobs()).jobs, crews: parseCrews(sampleCrews()).crews });
  const csv = dispatchCsv(r);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "crew,stop,job,arrive,depart,miles_from_previous,hours_on_site");
  assert.equal(lines.length, 1 + r.served + r.unserved);
  assert.match(csv, /UNASSIGNED/);
});

test("formatters", () => {
  assert.equal(fmtTime(8 * 60), "8:00 am");
  assert.equal(fmtTime(12 * 60 + 5), "12:05 pm");
  assert.equal(fmtTime(0), "12:00 am");
  assert.equal(money(1234.4), "$1,234");
  assert.equal(money(-50), "−$50");
});
