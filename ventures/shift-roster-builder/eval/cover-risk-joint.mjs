// How well does the cheap call-out risk (coverRisk) pick out the person-days a call-out really opens? (2026-11-13 later)
//
// --cover-price prices "risk hours": person-days where nobody else could take the caller's shifts with every hard rule
// holding and nobody else moved. The README ("Paying for call-out slack") found it over-counts badly: retail's posted
// roster has 54 risk hours over a measured exposure of 0, the café 188 over 92, and a priced move on the spare café cleared
// risk hours no call-out would have opened. Two changes are measured here against calloutExposure, person-day by person-day:
//   each     the first form: each of the day's shifts checked on its own (a stand-in may be counted for two shifts)
//   joint    every shift of the day handed out at once, so one stand-in is never counted twice
//   chainN   joint, plus hand-over chains: a stand-in may pass one of their own shifts (call-out day or later) to a third
//            person, who may pass one on, up to N passes per shift (calloutExposure tries chains of up to 3 moves); no budget
//   chain2cap  two passes with the default budget of 500 checks per person-day (a day past it counts at risk): the default
//              until 2026-11-14
//   takeN    chainN, but the caller, off for the call-out day only, may take a stand-in's shift on a later day (a swap);
//            take2cap (two passes, the budget) is the default since 2026-11-14
// For each mode: person-days flagged, of them how many calloutExposure also finds open (added > 0), and how many it misses
// (exposure > 0, mode says safe), the hours flagged, and the time. Exposure is the reference, not the truth: it rebuilds
// with the roster kept, 5pm notice, started shifts pinned (README "Which of the tied best rosters holds up to a call-out?").
// Invented teams (the five templates and the seeded 20-person weeks below); arithmetic, not a forecast.
//   node eval/cover-risk-joint.mjs           SETS=cafe,spare,salon,retail,clinic  SEEDED=3
import { parseStaff, parseShifts, buildContext, buildRoster, calloutExposure, coverRisk } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";
import { pathToFileURL } from "node:url";

const BASE = { minRestHours: 10 };
const NO = { callerTakes: false };
const MODES = { each: { joint: false, chain: 0 }, joint: { joint: true, chain: 0, ...NO }, chain1: { joint: true, chain: 1, budget: Infinity, ...NO }, chain2: { joint: true, chain: 2, budget: Infinity, ...NO }, chain2cap: { joint: true, chain: 2, ...NO }, chain3: { joint: true, chain: 3, budget: Infinity, ...NO },
  // 2026-11-14: the caller may take a stand-in's later shift (README "The caller can take a later shift"); take2cap is the default
  take1: { chain: 1, budget: Infinity }, take2: { chain: 2, budget: Infinity }, take2cap: { chain: 2 }, take3: { chain: 3, budget: Infinity } };

export function compare(staff, slots, opts = BASE) {
  const r = buildRoster(staff, slots, opts);
  const ctx = buildContext(staff, slots, opts);
  const x = calloutExposure(staff, slots, r, opts);
  const real = new Map(x.cases.map((c) => [c.person + "|" + c.day, c.added]));
  const out = { exposure: x.exposure, personDays: x.personDays, realOpen: x.cases.filter((c) => c.added > 0).length, modes: {} };
  for (const [m, cfg] of Object.entries(MODES)) {
    const t0 = performance.now();
    const risk = coverRisk(ctx, r.owner, cfg);
    const ms = performance.now() - t0;
    const flagged = new Set(risk.cases.map((c) => staff[c.person].name + "|" + c.day));
    let hit = 0, miss = 0;
    for (const k of flagged) if ((real.get(k) ?? 0) > 0) hit++;
    for (const [k, v] of real) if (v > 0 && !flagged.has(k)) miss++;
    out.modes[m] = { flagged: flagged.size, hit, miss, hours: risk.hours, chained: risk.chained, ms };
  }
  return out;
}

// A seeded 20-person week, as the reissue studies draw them (eval/reissue-scale.mjs's shape, kept small here).
function seeded(seed) {
  let s = seed >>> 0 || 1;
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; };
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const staff = ["name, wage, max hours, min hours, availability"];
  for (let p = 0; p < 20; p++) {
    const avail = days.filter(() => r() < 0.7).map((d) => `${d} ${r() < 0.5 ? "6-16" : "11-23"}`).join("; ") || "Mon 6-23";
    staff.push(`P${p + 1}, ${15 + Math.floor(r() * 10)}, ${24 + Math.floor(r() * 4) * 8}, 0, ${avail}`);
  }
  const shifts = [];
  for (const d of days) shifts.push(`${d}, 6:00, 14:00, ${2 + Math.floor(r() * 2)}`, `${d}, 14:00, 22:00, ${2 + Math.floor(r() * 2)}`, `${d}, 11:00, 15:00, 1`);
  return [staff.join("\n"), shifts.join("\n")];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = sets();
  const pick = (process.env.SETS || Object.keys(all).join(",")).split(",").filter(Boolean);
  const nSeeded = Number(process.env.SEEDED ?? 3);
  const cases = pick.map((n) => [n, all[n]]);
  for (let k = 0; k < nSeeded; k++) cases.push([`seeded20-${k}`, seeded(20261113 + k * 7919)]);
  const tot = Object.fromEntries(Object.keys(MODES).map((m) => [m, { flagged: 0, hit: 0, miss: 0, hours: 0, ms: 0 }]));
  let realOpen = 0, pd = 0;
  for (const [name, [stf, shf]] of cases) {
    const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
    const c = compare(staff, slots);
    realOpen += c.realOpen; pd += c.personDays;
    const line = Object.entries(c.modes).map(([m, v]) => `${m} ${v.flagged} flagged (${v.hit} open, ${v.miss} missed, ${v.hours} h${/^(chain|take)/.test(m) ? `, ${v.chained} by chain` : ""}, ${v.ms.toFixed(1)} ms)`).join("; ");
    console.log(`${name}: ${c.personDays} person-days, ${c.realOpen} open a call-out (exposure ${c.exposure} h); ${line}`);
    for (const m of Object.keys(MODES)) for (const f of ["flagged", "hit", "miss", "hours", "ms"]) tot[m][f] += c.modes[m][f];
  }
  console.log(`ALL: ${pd} person-days, ${realOpen} open a call-out; ` + Object.entries(tot).map(([m, v]) => `${m} ${v.flagged} flagged, precision ${v.flagged ? (v.hit / v.flagged * 100).toFixed(1) : "-"}%, ${v.miss} missed, ${v.hours} h, ${v.ms.toFixed(0)} ms`).join("; "));
}
