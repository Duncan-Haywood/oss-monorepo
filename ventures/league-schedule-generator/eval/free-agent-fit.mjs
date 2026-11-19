// Free agents on the self-hosted league page (freeagents.mjs suggestPlacements), 2026-11-19: the
// least-filled rule it used before (each group, most experienced first, to the smallest roster, ties to
// the least free-agent experience) against the late-sign-up search from teams.mjs that now picks.
// Invented leagues: k teams with uneven rosters (6-11 players), 3-30 free agents with experience 1-3,
// some in friend pairs; the organiser asks "Woman=F, Goalie=G" on /join (about 40% and 10% tick them).
// "sheet" = the organiser pasted the balanced-teams CSV for rostered players (ratings 1-10, same tags);
// "no sheet" = rostered players count as 2 and carry no tags, so only free agents' tags are spread.
// Measured on each case, on the same ratings: the gap (strongest minus weakest team total), tag excess
// (sum over tags of how far each tag's per-team count spread goes past one), roster-size cap kept,
// friends kept together, and the time one suggestion takes (the /admin page computes it on every load).
// Run: node eval/free-agent-fit.mjs > eval/free-agent-fit.txt
import { suggestPlacements, faTagQuestions, readSheet } from "../freeagents.mjs";

function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(20261119);
const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

function measure(teams, rosterPlayers, add) {
  const total = new Map(teams.map((t) => [t, 0])), size = new Map(teams.map((t) => [t, 0])), tc = new Map();
  const put = (t, p) => { total.set(t, total.get(t) + p.rating); size.set(t, size.get(t) + 1); for (const g of p.tags) { if (!tc.has(g)) tc.set(g, new Map(teams.map((x) => [x, 0]))); tc.get(g).set(t, tc.get(g).get(t) + 1); } };
  teams.forEach((t, i) => rosterPlayers[i].forEach((p) => put(t, p)));
  for (const [p, t] of add) put(t, p);
  const v = [...total.values()];
  let ex = 0;
  for (const m of tc.values()) { const c = [...m.values()]; ex += Math.max(0, Math.max(...c) - Math.min(...c) - 1); }
  return { spread: Math.max(...v) - Math.min(...v), ex, size };
}

console.log("Free agents placed on a league page: the least-filled rule (before) vs the late-sign-up search (now).");
console.log("Gap = strongest minus weakest team total after placing; tagX = tag excess (0 = every tag split within one);");
console.log("tagX>0 = cases with any excess, tagX = mean excess; min-size = mean size of the smallest roster after placing.");
console.log("Both measured on the ratings the search used. 'search kept' = cases where the search's answer was kept;");
console.log("in the rest suggestPlacements returned the least-filled picks because the search was not better.");
console.log("");
console.log("k   FAs     sheet  cases  lf-gap  now-gap  lf-tagX>0  now-tagX>0  lf-tagX  now-tagX  lf-min-size  now-min-size  search-kept  cap-broken  friends-split  ms(max)");
const T0 = Date.now();
for (const [k, faLo, faHi, cases] of [[4, 3, 8, 60], [6, 4, 12, 60], [8, 6, 16, 40], [12, 8, 24, 30], [16, 10, 30, 20]]) {
  for (const sheetOn of [false, true]) {
    let lfGap = 0, nowGap = 0, lfTag = 0, nowTag = 0, lfEx = 0, nowEx = 0, lfMin = 0, nowMin = 0, kept = 0, capBroken = 0, split = 0, msMax = 0;
    for (let c = 0; c < cases; c++) {
      const teams = Array.from({ length: k }, (_, i) => `Team ${String.fromCharCode(65 + i)}${i}`);
      const sizes = teams.map(() => int(6, 11));
      const target = r() < 0.5 ? 12 : 0;
      const roster = teams.map((t, i) => Array.from({ length: sizes[i] }, (_, j) => `${t.replace(/ /g, "")}p${j}`));
      const sheetLines = ["Team,Player,Rating,Tag"];
      teams.forEach((t, i) => roster[i].forEach((nm) => sheetLines.push(`${t},${nm},${int(1, 10)},${[r() < 0.4 ? "F" : "", r() < 0.1 ? "G" : ""].filter(Boolean).join(" ")}`)));
      const fields = { rosters: teams.map((t, i) => `${t}: ${roster[i].join(", ")}`).join("\n"), faTags: "Woman=F, Goalie=G", faTarget: target, faSheet: sheetOn ? sheetLines.join("\n") : "" };
      const nFa = int(faLo, faHi);
      const freeAgents = [];
      for (let i = 0; i < nFa; i++) {
        const tags = [r() < 0.4 ? "F" : "", r() < 0.1 ? "G" : ""].filter(Boolean);
        freeAgents.push({ id: i + 1, name: `Free${i}`, email: `f${i}@example.org`, level: int(1, 3), tags, with: "", at: i, note: "", phone: "" });
      }
      for (let i = 0; i + 1 < nFa; i += 2) if (r() < 0.2) freeAgents[i].with = `Free${i + 1}`;
      const state = { fields, freeAgents, placedAgents: [] };
      const t0 = performance.now();
      const s = suggestPlacements(state, teams);
      msMax = Math.max(msMax, performance.now() - t0);
      // the same ratings the search used
      const sh = readSheet(fields.faSheet);
      const fromLevel = (lv) => (sh.byName.size ? sh.lo + ((lv - 1) / 2) * (sh.hi - sh.lo) : lv);
      const rp = roster.map((names) => names.map((nm) => { const x = sh.byName.get(nm.toLowerCase()); return x ? { rating: x.rating, tags: x.tags } : { rating: 2, tags: [] }; }));
      const fa = new Map(freeAgents.map((a) => [a.id, { rating: fromLevel(a.level), tags: a.tags }]));
      // the rule freeagents.mjs used before, rebuilt below
      const old = leastFilledPicks(state, teams, roster, target);
      const mOld = measure(teams, rp, [...old].map(([id, t]) => [fa.get(id), t]));
      const mNow = measure(teams, rp, [...s.picks].map(([id, t]) => [fa.get(id), t]));
      lfGap += mOld.spread; nowGap += mNow.spread;
      lfEx += mOld.ex; nowEx += mNow.ex; lfMin += Math.min(...mOld.size.values()); nowMin += Math.min(...mNow.size.values());
      if (mOld.ex > 0) lfTag++;
      if (mNow.ex > 0) nowTag++;
      if (s.fit.by === "balanced") kept++;
      if (target && teams.some((t, i) => mNow.size.get(t) > Math.max(target, sizes[i]))) capBroken++;
      for (const a of freeAgents) if (a.with) { const b = freeAgents.find((x) => x.name === a.with); if (s.picks.has(a.id) && s.picks.get(a.id) !== s.picks.get(b.id)) split++; }
    }
    console.log(`${String(k).padEnd(3)} ${`${faLo}-${faHi}`.padEnd(7)} ${(sheetOn ? "yes" : "no").padEnd(6)} ${String(cases).padEnd(6)} ${(lfGap / cases).toFixed(2).padEnd(7)} ${(nowGap / cases).toFixed(2).padEnd(8)} ${String(lfTag).padEnd(10)} ${String(nowTag).padEnd(11)} ${(lfEx / cases).toFixed(2).padEnd(8)} ${(nowEx / cases).toFixed(2).padEnd(9)} ${(lfMin / cases).toFixed(2).padEnd(12)} ${(nowMin / cases).toFixed(2).padEnd(13)} ${String(kept).padEnd(12)} ${String(capBroken).padEnd(11)} ${String(split).padEnd(14)} ${msMax.toFixed(0)}`);
  }
}
console.log("");
console.log(`tag questions read from "Woman=F, Goalie=G": ${JSON.stringify(faTagQuestions("Woman=F, Goalie=G"))}`);
console.log(`total ${((Date.now() - T0) / 1000).toFixed(1)} s`);

// The least-filled rule as freeagents.mjs had it before 2026-11-19 (friend pairs as groups).
function leastFilledPicks(state, teams, roster, target) {
  const count = new Map(teams.map((t, i) => [t, roster[i].length]));
  const xp = new Map(teams.map((t) => [t, 0]));
  const agents = state.freeAgents;
  const byName = new Map(agents.map((a) => [a.name, a]));
  const used = new Set(), groups = [];
  for (const a of agents) {
    if (used.has(a.id)) continue;
    const g = [a]; used.add(a.id);
    const b = a.with && byName.get(a.with);
    if (b && !used.has(b.id)) { g.push(b); used.add(b.id); }
    groups.push(g);
  }
  const weight = (g) => g.reduce((s, a) => s + a.level, 0) / g.length;
  groups.sort((a, b) => weight(b) - weight(a) || b.length - a.length || a[0].at - b[0].at);
  const picks = new Map();
  for (const g of groups) {
    const fits = teams.filter((t) => count.get(t) + g.length <= (target || 40));
    if (!fits.length) continue;
    let best = fits[0];
    for (const t of fits) if (count.get(t) < count.get(best) || (count.get(t) === count.get(best) && xp.get(t) < xp.get(best))) best = t;
    for (const a of g) picks.set(a.id, best);
    count.set(best, count.get(best) + g.length);
    xp.set(best, xp.get(best) + g.reduce((s, a) => s + a.level, 0));
  }
  return picks;
}
