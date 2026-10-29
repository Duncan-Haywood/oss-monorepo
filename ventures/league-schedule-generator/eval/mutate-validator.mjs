// Mutation test of validateSchedule: seed one fault into a valid random schedule and check the
// validator reports it. A fault that slips through is a hole in the independent checker.
// Usage: node eval/mutate-validator.mjs [count] [seed]
import { readSpec, buildSchedule, validateSchedule, mulberry32 } from "../calc.mjs";
import { makeRandomForm } from "./random-league.mjs";

const count = Number(process.argv[2] || 200);
const rnd = mulberry32(Number(process.argv[3] || 3));
const randomForm = makeRandomForm(rnd);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const MUTATIONS = {
  dropMatch: (s) => { const r = s.rounds.find((x) => x.matches.length); if (!r) return false; r.matches.pop(); return true; },
  duplicateMatch: (s) => {
    const r = s.rounds.find((x) => x.matches.length); if (!r) return false;
    const other = s.rounds.find((x) => x !== r && x.matches.length); if (!other) return false;
    other.matches.push({ ...r.matches[0], court: "ZZ" }); return true;
  },
  // One swapped venue in a single round robin stays inside the +-1 home/away tolerance, so the
  // validator rightly accepts it (an equivalent mutant); it is counted separately below.
  flipHome: (s) => { const m = s.rounds.flatMap((r) => r.matches)[0]; if (!m) return false; [m.home, m.away] = [m.away, m.home]; return true; },
  // Every match of one team made a home game: imbalance beyond the tolerance whenever it plays 4+ games.
  allHomeForTeam: (s) => {
    const ms = s.rounds.flatMap((r) => r.matches).filter((m) => m.home === 0 || m.away === 0);
    if (ms.length < 4) return false;
    for (const m of ms) if (m.away === 0) [m.home, m.away] = [m.away, m.home];
    return true;
  },
  teamPlaysTwice: (s) => {
    const r = s.rounds.find((x) => x.matches.length >= 2); if (!r) return false;
    r.matches[1].home = r.matches[0].home; return true;
  },
  selfMatch: (s) => { const m = s.rounds.flatMap((r) => r.matches)[0]; if (!m) return false; m.away = m.home; return true; },
  badTeamIndex: (s) => { const m = s.rounds.flatMap((r) => r.matches)[0]; if (!m) return false; m.away = s.teams.length; return true; },
  doubleBookCell: (s) => {
    const r = s.rounds.find((x) => x.matches.length >= 2); if (!r) return false;
    r.matches[1].court = r.matches[0].court; r.matches[1].time = r.matches[0].time; return true;
  },
  unknownCourt: (s) => { const m = s.rounds.flatMap((r) => r.matches)[0]; if (!m) return false; m.court = "Nowhere"; return true; },
  unknownTime: (s) => { const m = s.rounds.flatMap((r) => r.matches)[0]; if (!m) return false; m.time = "03:33"; return true; },
  wrongWeekday: (s) => {
    const r = s.rounds.find((x) => !x.chosenDay); if (!r) return false;
    for (let d = 1; d < 7; d++) if (!s.config.weekdays.includes(new Date((r.day + d) * 86400000).getUTCDay()) && !seen(s, r.day + d)) { r.day += d; return true; }
    return false;
  },
  sameDayTwoRounds: (s) => { if (s.rounds.length < 2) return false; s.rounds[1].day = s.rounds[0].day; return true; },
  outOfOrder: (s) => { if (s.rounds.length < 2) return false; const t = s.rounds[0].day; s.rounds[0].day = s.rounds[1].day + 7; s.rounds[1].day = t; return true; },
  undated: (s) => { if (!s.rounds.length) return false; s.rounds[0].day = NaN; return true; },
  blackoutHit: (s) => {
    const r = s.rounds.find((x) => x.matches.length); if (!r) return false;
    const t = r.matches[0].home; s.config.blackouts = { ...s.config.blackouts, [t]: [...(s.config.blackouts[t] || []), r.day] }; return true;
  },
  skipDateHit: (s) => { const r = s.rounds.find((x) => !x.chosenDay); if (!r) return false; s.config.skipDays = [...s.config.skipDays, r.day]; return true; },
  courtClosedHit: (s) => {
    const m = s.rounds.flatMap((r) => r.matches)[0]; const r = s.rounds.find((x) => x.matches.includes(m)); if (!m) return false;
    s.config.courtClosures = { ...(s.config.courtClosures || {}), [m.court]: [...(((s.config.courtClosures || {})[m.court]) || []), r.day] };
    return true;
  },
};
function seen(s, day) { return s.rounds.some((r) => r.day === day); }

const results = {};
for (const k of Object.keys(MUTATIONS)) results[k] = { applied: 0, caught: 0, equivalent: 0, missed: [] };
let built = 0;
for (let i = 0; i < count; i++) {
  const { errors, spec } = readSpec(randomForm());
  if (errors.length) continue;
  let base; try { base = buildSchedule(spec); } catch { continue; }
  if (!validateSchedule(base).ok) continue;
  built++;
  for (const [name, fn] of Object.entries(MUTATIONS)) {
    const s = structuredClone(base);
    if (!fn(s)) continue;
    results[name].applied++;
    if (!validateSchedule(s).ok) results[name].caught++;
    else if (name === "flipHome" && !s.config.double) results[name].equivalent = (results[name].equivalent || 0) + 1;
    else results[name].missed.push(i);
  }
}
let applied = 0, caught = 0, equivalent = 0;
console.log(`schedules ${built}`);
for (const [k, v] of Object.entries(results)) {
  applied += v.applied; caught += v.caught; equivalent += v.equivalent;
  console.log(`${k.padEnd(18)} applied ${String(v.applied).padStart(4)} caught ${String(v.caught).padStart(4)}${v.equivalent ? ` equivalent ${v.equivalent}` : ""}${v.missed.length ? "  MISSED at " + v.missed.slice(0, 5).join(",") : ""}`);
}
const missed = applied - caught - equivalent;
console.log(`mutants ${applied}, caught ${caught}, equivalent ${equivalent}, missed ${missed}`);
process.exit(missed === 0 ? 0 : 1);
