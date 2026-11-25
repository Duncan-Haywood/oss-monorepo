// League schedule generator, regions.mjs: divisions drawn by location.
//
// A regional league (youth soccer across towns, a county darts league, a high-school conference) has to split its
// teams into divisions before anything is scheduled, and the split decides most of a season's driving: every team
// visits every division rival. This module takes each team's home ground as "Name @ lat, lon", a number of
// divisions, and optional "keep apart" groups (a club's A and B teams in different divisions), and returns
// divisions of even size (sizes differ by at most one) with the least total distance between division rivals.
//
// The problem is balanced min-sum k-clustering, NP-hard in general. The search is iterated local search on swaps:
// many seeded starts (farthest-point seeds grown greedily, plus random ones), each improved by best swaps of two teams
// between divisions (and, when sizes are uneven, moves from a larger division to a smaller one) until none helps,
// then kicked by a few random swaps and improved again. It reports how many of its starts reached the best split,
// which is evidence, not a proof, that the best split was found; regions.test.mjs checks it against an exhaustive
// search on every split of small leagues.

import { mulberry32 } from "./rng.mjs";

/** Great-circle distance in km between two [lat, lon] points. */
export function haversineKm([la1, lo1], [la2, lo2]) {
  const r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "Hawks @ 40.71, -74.00" one team per line. Returns { teams: [{ name, lat, lon }], errors }. */
export function parseTeamLocations(text) {
  const teams = [], errors = [], seen = new Set();
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(.+?)\s*@\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) { errors.push(`"${line}": write a team as "Hawks @ 40.7128, -74.0060" (its home ground's latitude, longitude).`); continue; }
    const name = m[1].trim(), lat = Number(m[2]), lon = Number(m[3]);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) { errors.push(`"${line}": latitude is -90 to 90 and longitude -180 to 180.`); continue; }
    if (seen.has(name.toLowerCase())) { errors.push(`"${line}": ${name} is listed twice.`); continue; }
    seen.add(name.toLowerCase());
    teams.push({ name, lat, lon });
  }
  return { teams, errors };
}

/** "Hawks A, Hawks B" one group per line: teams that must each be in a different division. Returns { groups: [[index]], errors }. */
export function parseKeepApart(text, names) {
  const idx = new Map(names.map((n, i) => [n.toLowerCase(), i]));
  const groups = [], errors = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(",").map((s) => s.trim()).filter(Boolean);
    const missing = parts.filter((p) => !idx.has(p.toLowerCase()));
    if (missing.length) { errors.push(`"${line}": ${missing.join(", ")} not in the team list.`); continue; }
    const g = [...new Set(parts.map((p) => idx.get(p.toLowerCase())))];
    if (g.length < 2) { errors.push(`"${line}": name at least two different teams to keep apart.`); continue; }
    groups.push(g);
  }
  return { groups, errors };
}

/** Division sizes for n teams in k divisions, as even as possible, larger first: 10 in 3 is [4, 3, 3]. */
export function divisionSizes(n, k) {
  const base = Math.floor(n / k), extra = n % k;
  return Array.from({ length: k }, (_, c) => base + (c < extra ? 1 : 0));
}

/** Total of the cost matrix over pairs inside the same division. */
export function splitCost(groups, cost) {
  let s = 0;
  for (const g of groups) for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) s += cost[g[a]][g[b]];
  return s;
}

/**
 * Split teams into k divisions of even size with the least total distance between division rivals.
 * points: [[lat, lon]] (or pass `dist`, an n x n matrix of any travel measure). apart: [[i, j, ...]] groups whose
 * members must be in different divisions (a group larger than k cannot be kept apart and throws).
 * Returns { groups: [[index]] (each sorted, divisions ordered by their first member), km (sum over rival pairs),
 * apartBroken (pairs left together; 0 unless impossible), starts, startsAtBest, sizes }.
 */
export function splitByLocation(points, { divisions: k, apart = [], dist = null, starts = 64, kicks = 30, seed = 1 } = {}) {
  const n = dist ? dist.length : points.length;
  if (!(k >= 1) || k > n) throw new Error(`Divisions must be between 1 and the number of teams (${n}).`);
  for (const g of apart) if (g.length > k) throw new Error(`A keep-apart group of ${g.length} teams needs at least ${g.length} divisions.`);
  const d = dist || points.map((p) => points.map((q) => haversineKm(p, q)));
  // a broken keep-apart pair costs more than any split's whole travel, so it is only kept when no split avoids it
  let total = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) total += d[i][j];
  const M = total + 1;
  const w = d.map((row) => row.slice());
  const apartPair = Array.from({ length: n }, () => new Uint8Array(n));
  for (const g of apart) for (const i of g) for (const j of g) if (i !== j && !apartPair[i][j]) { apartPair[i][j] = 1; w[i][j] += M; }
  const sizes = divisionSizes(n, k);
  const rand = mulberry32(seed);

  let best = null, bestCost = Infinity, atBest = 0;
  for (let s = 0; s < starts; s++) {
    const assign = s % 2 === 0 ? greedyStart(w, sizes, rand) : randomStart(n, sizes, rand);
    let cur = improve(assign, w, k, rand);
    let curCost = costOf(cur, w);
    for (let t = 0; t < kicks; t++) {
      const next = cur.slice();
      const swaps = 2 + Math.floor(rand() * 3);
      for (let q = 0; q < swaps; q++) {
        const i = Math.floor(rand() * n), j = Math.floor(rand() * n);
        if (next[i] !== next[j]) [next[i], next[j]] = [next[j], next[i]];
      }
      const got = improve(next, w, k, rand);
      const c = costOf(got, w);
      if (c < curCost - 1e-9) { cur = got; curCost = c; }
    }
    if (curCost < bestCost - 1e-6) { best = cur; bestCost = curCost; atBest = 1; }
    else if (Math.abs(curCost - bestCost) <= 1e-6) atBest++;
  }

  const groups = Array.from({ length: k }, () => []);
  best.forEach((c, i) => groups[c].push(i));
  groups.forEach((g) => g.sort((a, b) => a - b));
  groups.sort((a, b) => a[0] - b[0]);
  let apartBroken = 0;
  for (const g of groups) for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) if (apartPair[g[a]][g[b]]) apartBroken++;
  return { groups, km: splitCost(groups, d), apartBroken, starts, startsAtBest: atBest, sizes };
}

function costOf(assign, w) {
  let s = 0;
  for (let i = 0; i < assign.length; i++) for (let j = i + 1; j < assign.length; j++) if (assign[i] === assign[j]) s += w[i][j];
  return s;
}

function randomStart(n, sizes, rand) {
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const assign = new Array(n);
  let p = 0;
  sizes.forEach((sz, c) => { for (let t = 0; t < sz; t++) assign[order[p++]] = c; });
  return assign;
}

// k seeds spread far apart (the first at random, each next one the team farthest from every seed so far), then each
// remaining team, farthest-from-any-seed first, joins the cheapest division with room
function greedyStart(w, sizes, rand) {
  const n = w.length, k = sizes.length;
  const seeds = [Math.floor(rand() * n)];
  while (seeds.length < k) {
    let far = -1, farD = -1;
    for (let i = 0; i < n; i++) {
      if (seeds.includes(i)) continue;
      const m = Math.min(...seeds.map((s) => w[i][s]));
      if (m > farD) { farD = m; far = i; }
    }
    seeds.push(far);
  }
  const room = sizes.slice(), assign = new Array(n).fill(-1), sum = Array.from({ length: n }, () => new Float64Array(k));
  seeds.forEach((s, c) => { assign[s] = c; room[c]--; for (let i = 0; i < n; i++) sum[i][c] += w[i][s]; });
  const rest = [...Array(n).keys()].filter((i) => assign[i] < 0);
  rest.sort((a, b) => Math.min(...seeds.map((s) => w[b][s])) - Math.min(...seeds.map((s) => w[a][s])));
  for (const i of rest) {
    let bc = -1, bv = Infinity;
    for (let c = 0; c < k; c++) if (room[c] > 0 && sum[i][c] < bv) { bv = sum[i][c]; bc = c; }
    assign[i] = bc; room[bc]--;
    for (let j = 0; j < n; j++) sum[j][bc] += w[j][i];
  }
  return assign;
}

// best-improvement local search: swap two teams in different divisions, or move a team from a division one larger to
// one smaller (sizes stay even); S[i][c] is the cost from team i to every member of division c
function improve(start, w, k, rand) {
  const n = w.length, assign = start.slice();
  const S = Array.from({ length: n }, () => new Float64Array(k));
  const size = new Array(k).fill(0);
  for (let i = 0; i < n; i++) { size[assign[i]]++; for (let j = 0; j < n; j++) if (j !== i) S[i][assign[j]] += w[i][j]; }
  const place = (i, from, to) => {
    for (let j = 0; j < n; j++) if (j !== i) { S[j][from] -= w[j][i]; S[j][to] += w[j][i]; }
    assign[i] = to; size[from]--; size[to]++;
  };
  for (let guard = 0; guard < 100000; guard++) {
    let bd = -1e-9, bi = -1, bj = -1, bt = -1;
    for (let i = 0; i < n; i++) {
      const a = assign[i];
      for (let j = i + 1; j < n; j++) {
        const b = assign[j];
        if (a === b) continue;
        const delta = S[i][b] - w[i][j] - S[i][a] + S[j][a] - w[i][j] - S[j][b];
        if (delta < bd) { bd = delta; bi = i; bj = j; bt = -1; }
      }
      for (let c = 0; c < k; c++) {
        if (c === a || size[a] !== size[c] + 1) continue;
        const delta = S[i][c] - S[i][a];
        if (delta < bd) { bd = delta; bi = i; bj = -1; bt = c; }
      }
    }
    if (bi < 0) break;
    if (bj >= 0) { const a = assign[bi], b = assign[bj]; place(bi, a, b); place(bj, b, a); }
    else place(bi, assign[bi], bt);
  }
  void rand;
  return assign;
}

const COMPASS = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];

/**
 * Name each division by where its centre lies from the whole league's centre ("North", "South-West"), with "Central"
 * for one sitting on it; repeated names get a number. points: [[lat, lon]].
 */
export function compassNames(groups, points) {
  const centre = (idx) => {
    // mean of unit vectors, so a league across the antimeridian is not averaged to the far side of the globe
    let x = 0, y = 0, z = 0;
    for (const i of idx) {
      const [la, lo] = points[i].map((v) => v * Math.PI / 180);
      x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
    }
    return [Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, Math.atan2(y, x) * 180 / Math.PI];
  };
  const all = centre(points.map((_, i) => i));
  const spread = Math.max(...points.map((p) => haversineKm(p, all)), 1);
  const raw = groups.map((g) => {
    const c = centre(g);
    if (haversineKm(c, all) < spread * 0.15) return "Central";
    const dy = c[0] - all[0], dx = (c[1] - all[1]) * Math.cos(all[0] * Math.PI / 180);
    const ang = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    return COMPASS[Math.round(ang / 45) % 8];
  });
  const count = {}, seen = {};
  raw.forEach((r) => { count[r] = (count[r] || 0) + 1; });
  return raw.map((r) => (count[r] > 1 ? `${r} ${(seen[r] = (seen[r] || 0) + 1)}` : r));
}

/**
 * Per-division read-out: names, each team's average and longest distance to its rivals, and the division's longest trip.
 * Returns [{ name, teams: [{ name, avgKm, maxKm }], km, longest: { a, b, km } }].
 */
export function describeSplit(groups, teams, names = null) {
  const pts = teams.map((t) => [t.lat, t.lon]);
  const labels = names || compassNames(groups, pts);
  return groups.map((g, c) => {
    let km = 0, longest = { a: "", b: "", km: 0 };
    const rows = g.map((i) => {
      const ds = g.filter((j) => j !== i).map((j) => haversineKm(pts[i], pts[j]));
      return { name: teams[i].name, avgKm: ds.length ? ds.reduce((s, x) => s + x, 0) / ds.length : 0, maxKm: ds.length ? Math.max(...ds) : 0 };
    });
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) {
      const x = haversineKm(pts[g[a]], pts[g[b]]);
      km += x;
      if (x > longest.km) longest = { a: teams[g[a]].name, b: teams[g[b]].name, km: x };
    }
    return { name: labels[c], teams: rows, km, longest };
  });
}

/** The divisions as the multi-division page's box reads them: "North: Hawks, Owls, Lynx". */
export function divisionsText(described, { double = false } = {}) {
  return described.map((d) => `${d.name}: ${d.teams.map((t) => t.name).join(", ")}${double ? " (double)" : ""}`).join("\n");
}

/**
 * A link fragment that opens the multi-division page with these divisions filled in. Same encoding as
 * divisions.mjs encodeDivisionFields (regions.test.mjs decodes it with decodeDivisionFields), kept here so this page
 * does not load the whole season builder.
 */
export function multiDivisionFragment(text) {
  const bytes = new TextEncoder().encode(JSON.stringify({ divisions: text }));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "#d=" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// CLI: node regions.mjs teams.txt --divisions 4 [--apart apart.txt] [--seed 1] [--starts 64]
if (typeof process !== "undefined" && process.argv && process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const { readFileSync } = await import("node:fs");
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (!file) { console.error("usage: node regions.mjs teams.txt --divisions K [--apart apart.txt] [--seed N] [--starts N]"); process.exit(2); }
  const { teams, errors } = parseTeamLocations(readFileSync(file, "utf8"));
  const ap = opt("--apart") ? parseKeepApart(readFileSync(opt("--apart"), "utf8"), teams.map((t) => t.name)) : { groups: [], errors: [] };
  for (const e of [...errors, ...ap.errors]) console.error("Error: " + e);
  if (errors.length || ap.errors.length) process.exit(1);
  const r = splitByLocation(teams.map((t) => [t.lat, t.lon]), { divisions: Number(opt("--divisions", 2)), apart: ap.groups, seed: Number(opt("--seed", 1)), starts: Number(opt("--starts", 64)) });
  const desc = describeSplit(r.groups, teams);
  for (const d of desc) console.log(`${d.name} (${d.teams.length}): ${d.teams.map((t) => t.name).join(", ")}  -- rivals ${d.km.toFixed(0)} km apart in all, longest ${d.longest.a}-${d.longest.b} ${d.longest.km.toFixed(0)} km`);
  console.log(`Total distance between division rivals: ${r.km.toFixed(0)} km (each team visiting each rival once drives twice that). ${r.startsAtBest} of ${r.starts} starts reached this split.${r.apartBroken ? ` ${r.apartBroken} keep-apart pair(s) could not be kept apart.` : ""}`);
}
