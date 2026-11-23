// Clinch watch on real seasons: replay 18 top-flight seasons (openfootball, CC0) date by date and ask,
// after every match day, who has clinched or is out of three races: the title (1 place), the top four,
// and safety (the top n - 3, i.e. not relegated). Each table is asked twice: with the safe bounds alone
// (nodeBudget 0, how playoffRace answered past 12 fixtures until 2026-11-23) and with branch and bound
// (race-exact.mjs, the default budget). Checks and measures:
//   - never wrong: every "clinched" must finish inside the places and every "eliminated" outside them, on
//     the final points table from the same results (ties counted against the team, as the race does)
//   - how many match days earlier the search settles each team's race than the bounds did
//   - how many tables the search proved in full, and its time per table
// Not checked: the leagues' real point deductions (openfootball has none, so the "final table" here is
// the one the results give), and published clinch dates.
//
//   node eval/race-real.mjs            # summary table
//   node eval/race-real.mjs --json     # one row per season and race

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { playoffRace } from "../standings.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "data", "openfootball-results.json"), "utf8"));
const json = process.argv.includes("--json");

const rows = [];
let wrong = 0, tables = 0, provedTables = 0, ms = 0, slowest = 0;
for (const [key, L] of Object.entries(data.leagues)) {
  const n = L.teams.length;
  const matches = L.matches.slice().sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
  const dates = [...new Set(matches.map((m) => m[1]))];
  // final points, ties counted against: rank = 1 + teams with at least as many points
  const fin = Array(n).fill(0);
  for (const m of matches) {
    if (m[4] > m[5]) fin[m[2]] += 3; else if (m[4] < m[5]) fin[m[3]] += 3; else { fin[m[2]]++; fin[m[3]]++; }
  }
  const above = (i, strict) => fin.filter((p, j) => j !== i && (strict ? p > fin[i] : p >= fin[i])).length;
  const races = [["title", 1], ["top four", 4], ["safety", n - 3]];
  for (const [race, spots] of races) {
    // the first date each team's status is settled, by method
    const first = { bounds: Array(n).fill(null), search: Array(n).fill(null) };
    let unsettledDates = 0;
    dates.forEach((d, di) => {
      const played = matches.filter((m) => m[1] <= d);
      const left = matches.filter((m) => m[1] > d).map((m) => [m[2], m[3]]);
      if (!left.length) return;
      const results = played.map((m) => ({ a: m[2], b: m[3], ga: m[4], gb: m[5] }));
      const names = L.teams;
      const b = playoffRace(names, results, left, spots, { nodeBudget: 0 });
      const t0 = performance.now();
      const s = playoffRace(names, results, left, spots);
      const dt = performance.now() - t0;
      ms += dt; slowest = Math.max(slowest, dt); tables++;
      if (s.proved) provedTables++; else unsettledDates++;
      for (const [method, table] of [["bounds", b], ["search", s]]) {
        for (const r of table) {
          if (r.status === "clinched" && above(r.index, false) + 1 > spots) wrong++;
          if (r.status === "eliminated" && above(r.index, true) + 1 <= spots) wrong++;
          // the search must agree with the bounds wherever the bounds decided
          if (method === "search") {
            const br = b.find((x) => x.index === r.index);
            if (br.status !== "alive" && br.status !== r.status) wrong++;
          }
          if (r.status !== "alive" && first[method][r.index] == null) first[method][r.index] = di;
        }
      }
    });
    // match days gained: per team settled by both, bounds date minus search date (in match dates)
    let gained = 0, teamsEarlier = 0, settledBounds = 0, settledSearch = 0, maxGain = 0;
    for (let i = 0; i < n; i++) {
      const fb = first.bounds[i] ?? dates.length - 1, fs = first.search[i] ?? dates.length - 1;
      if (first.bounds[i] != null) settledBounds++;
      if (first.search[i] != null) settledSearch++;
      if (fs < fb) { teamsEarlier++; gained += fb - fs; maxGain = Math.max(maxGain, fb - fs); }
    }
    // the race decided: the date by which every team's status was settled
    const decided = (f) => (f.every((x) => x != null) ? Math.max(...f) : null);
    const decB = decided(first.bounds), decS = decided(first.search);
    rows.push({ season: key, race, teams: n, settledBounds, settledSearch, teamsEarlier, datesGained: gained, maxGain,
      decidedBounds: decB == null ? null : dates.length - 1 - decB, decidedSearch: decS == null ? null : dates.length - 1 - decS, unsettledDates });
  }
}

if (json) { console.log(JSON.stringify({ rows, wrong, tables, provedTables, msPerTable: ms / tables, slowest }, null, 1)); process.exit(wrong ? 1 : 0); }

const sum = (race, f) => rows.filter((r) => r.race === race).reduce((a, r) => a + f(r), 0);
console.log("Clinch watch on 18 real seasons (openfootball, CC0), every match date, three races per season");
console.log("race       team-races  settled by the last date: bounds  search  settled earlier  match dates earlier (total, most)  race decided, dates before the end: bounds / search (median)");
for (const race of ["title", "top four", "safety"]) {
  const rs = rows.filter((r) => r.race === race);
  const med = (k) => { const v = rs.map((r) => r[k] ?? 0).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  console.log(`${race.padEnd(10)} ${String(sum(race, (r) => r.teams)).padStart(10)}  ${String(sum(race, (r) => r.settledBounds)).padStart(30)}  ${String(sum(race, (r) => r.settledSearch)).padStart(6)}  ${String(sum(race, (r) => r.teamsEarlier)).padStart(15)}  ${String(sum(race, (r) => r.datesGained)).padStart(20)}, ${String(Math.max(...rs.map((r) => r.maxGain))).padStart(2)}           ${med("decidedBounds")} / ${med("decidedSearch")}`);
}
console.log(`\nWrong calls (a clinched team finishing outside, an eliminated one inside, or the search contradicting the bounds): ${wrong}`);
console.log(`Tables asked with the search: ${tables}; proved in full (every best and worst rank): ${provedTables} (${(100 * provedTables / tables).toFixed(1)}%)`);
console.log(`Search time: ${(ms / tables).toFixed(1)} ms per table on average, slowest ${slowest.toFixed(0)} ms`);
console.log("\nPer season (title / top four / safety: teams settled earlier by the search, match dates gained):");
for (const key of Object.keys(data.leagues)) {
  const rs = rows.filter((r) => r.season === key);
  console.log(`  ${key.padEnd(14)} ${rs.map((r) => `${r.teamsEarlier}/${r.datesGained}`).join("  ")}`);
}
process.exit(wrong ? 1 : 0);
