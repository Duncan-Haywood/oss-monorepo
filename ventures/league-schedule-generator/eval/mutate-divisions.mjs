// Validator mutation check for multi-division schedules: seed one fault at a time into a valid finished
// schedule and ask validateDivisions whether it notices. A miss is a hole in the validator.
// Usage: node eval/mutate-divisions.mjs [count] [seed]
import { mulberry32 } from "../calc.mjs";
import { readDivisionsSpec, buildDivisions, validateDivisions } from "../divisions.mjs";

const count = Number(process.argv[2] || 200);
const rnd = mulberry32(Number(process.argv[3] || 3));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function randomForm() {
  const nDiv = int(1, 3);
  const divs = Array.from({ length: nDiv }, (_, i) => `D${i + 1}: ${Array.from({ length: int(3, 8) }, (_, k) => `T${k + 1}`).join(", ")}${rnd() < 0.3 ? " (double)" : ""}`);
  const courts = Array.from({ length: int(2, 5) }, (_, i) => `C${i + 1}`);
  const start = new Date(Date.UTC(2026, 0, 1) + int(0, 300) * 864e5).toISOString().slice(0, 10);
  const wd = DAYS.filter(() => rnd() < 0.35); if (!wd.length) wd.push(pick(DAYS));
  return { divisions: divs.join("\n"), courts: courts.join(", "), times: ["18:00", "19:00"].slice(0, int(1, 2)).join(", "), start, weekdays: wd.join(", "), seed: int(1, 9999) };
}

const clone = (s) => structuredClone(s);
const allMatches = (s) => s.nights.flatMap((n) => n.matches.map((m) => ({ n, m })));
// Each mutator edits the schedule in place and returns false if it does not apply.
const MUTANTS = {
  "double-booked cell": (s) => { const n = pick(s.nights.filter((x) => x.matches.length > 1)); if (!n) return false; n.matches[1].court = n.matches[0].court; n.matches[1].time = n.matches[0].time; return true; },
  "unknown court": (s) => { const { m } = pick(allMatches(s)); m.court = "Nowhere"; return true; },
  "team plays twice a night": (s) => { const n = pick(s.nights.filter((x) => x.matches.length > 1)); if (!n) return false; const [a, b] = n.matches; b.div = a.div; b.division = a.division; b.home = a.home; return true; },
  "night listed twice": (s) => { s.nights.push(clone(s.nights[0])); return true; },
  "round-robin match dropped": (s) => { const d = pick(s.divisions.filter((x) => x.rounds.some((r) => r.matches.length))); if (!d) return false; const r = pick(d.rounds.filter((x) => x.matches.length)); r.matches.pop(); return true; },
  "round-robin match duplicated": (s) => { const d = pick(s.divisions.filter((x) => x.rounds.some((r) => r.matches.length))); if (!d) return false; const r = pick(d.rounds.filter((x) => x.matches.length)); r.matches.push(clone(r.matches[0])); return true; },
  "rounds out of order": (s) => { const d = pick(s.divisions.filter((x) => x.rounds.length > 1)); if (!d) return false; d.rounds[1].day = d.rounds[0].day; return true; },
  "all home games for one team": (s) => { const d = pick(s.divisions.filter((x) => x.rounds.some((r) => r.matches.length))); if (!d) return false; let hit = false; for (const r of d.rounds) for (const m of r.matches) if (m.away === 0 && m.home !== 0) { [m.home, m.away] = [m.away, m.home]; hit = true; } return hit; },
  "closed court used": (s) => { const { n, m } = pick(allMatches(s)); s.config.closures = { ...(s.config.closures || {}), [m.court]: [n.day] }; return true; },
};

const tally = {};
for (const k of Object.keys(MUTANTS)) tally[k] = { tried: 0, caught: 0 };
const missed = [];
let leagues = 0;
for (let i = 0; i < count; i++) {
  const form = randomForm();
  const { errors, spec } = readDivisionsSpec(form);
  if (errors.length) continue;
  let s; try { s = buildDivisions(spec); } catch { continue; }
  if (!validateDivisions(s).ok || !s.nights.length) continue;
  leagues++;
  for (const [name, fn] of Object.entries(MUTANTS)) {
    const c = clone(s);
    if (!fn(c)) continue;
    tally[name].tried++;
    if (!validateDivisions(c).ok) tally[name].caught++; else if (missed.length < 5) missed.push({ name, form });
  }
}
console.log(`${leagues} valid leagues`);
let tried = 0, caught = 0;
for (const [k, v] of Object.entries(tally)) { tried += v.tried; caught += v.caught; console.log(`${k.padEnd(32)} ${v.caught}/${v.tried}`); }
console.log(`total ${caught}/${tried} caught, ${tried - caught} missed`);
if (missed.length) console.log(JSON.stringify(missed.slice(0, 3), null, 1));
process.exit(tried === caught ? 0 : 1);
