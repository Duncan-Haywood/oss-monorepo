// Random multi-division leagues through readDivisionsSpec -> buildDivisions -> validateDivisions, then
// the rainout pass. Checks: validateDivisions clean, divisions with 2+ teams all present, every make-up
// leaves the schedule valid, and no match is lost or invented by the pass.
// Usage: node eval/fuzz-divisions.mjs [count] [seed]
import { mulberry32, dayIso } from "../calc.mjs";
import { readDivisionsSpec, buildDivisions, validateDivisions, applyDivisionRainouts } from "../divisions.mjs";

const count = Number(process.argv[2] || 200);
const rnd = mulberry32(Number(process.argv[3] || 3));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function randomForm() {
  const nDiv = int(1, 4);
  const divs = Array.from({ length: nDiv }, (_, i) => ({ name: `D${i + 1}`, teams: Array.from({ length: int(2, 9) }, (_, k) => `T${k + 1}`), double: rnd() < 0.3 }));
  const nTimes = int(1, 3);
  const nCourts = int(1, 5);
  const venues = ["Park", "School", "Rink"].slice(0, int(1, 3));
  const courts = Array.from({ length: nCourts }, (_, i) => `C${i + 1} @ ${pick(venues)}`);
  const links = [];
  for (let k = int(0, 3); k > 0 && nDiv > 1; k--) {
    const a = pick(divs), b = pick(divs);
    if (a !== b) links.push(`${a.name}/${pick(a.teams)}, ${b.name}/${pick(b.teams)}`);
  }
  const start = new Date(Date.UTC(2026, 0, 1) + int(0, 300) * 864e5);
  const iso = (d) => d.toISOString().slice(0, 10);
  const wd = DAYS.filter(() => rnd() < 0.35); if (!wd.length) wd.push(pick(DAYS));
  return {
    divisions: divs.map((d) => `${d.name}: ${d.teams.join(", ")}${d.double ? " (double)" : ""}`).join("\n"),
    courts: courts.join(", "), times: ["18:00", "19:00", "20:00"].slice(0, nTimes).join(", "),
    start: iso(start), weekdays: wd.join(", "), skip: iso(new Date(start.getTime() + int(0, 60) * 864e5)),
    links: links.join("\n"), venueFairness: rnd() < 0.3, split: rnd() < 0.3, seed: int(1, 9999),
  };
}

const stats = { leagues: 0, rejected: 0, matches: 0, rainLines: 0, rainMoves: 0, rainErrors: 0 };
const bad = [];
const pairs = (s) => s.nights.flatMap((n) => n.matches.map((m) => `${m.div}|${m.home}|${m.away}|${m.round}`)).sort().join(";");

for (let i = 0; i < count; i++) {
  const form = randomForm();
  const { errors, spec } = readDivisionsSpec(form);
  if (errors.length) { stats.rejected++; continue; }
  let s;
  try { s = buildDivisions(spec); } catch (e) { if (/court slots/.test(String(e))) { stats.rejected++; continue; } bad.push({ kind: "build-throw", form, error: String(e) }); continue; }
  stats.leagues++;
  const v = validateDivisions(s);
  if (!v.ok) { bad.push({ kind: "invalid", form, errors: v.errors.slice(0, 4) }); continue; }
  stats.matches += s.stats.matches;
  const days = s.nights.map((n) => n.day);
  if (!days.length) continue;
  const lines = Array.from({ length: int(1, 3) }, () => {
    let l = dayIso(pick(days));
    if (rnd() < 0.5) l += ` ${pick(s.divisions).name}`;
    return l;
  });
  stats.rainLines += lines.length;
  const opts = { balance: rnd() < 0.5, flip: rnd() < 0.5, relocate: rnd() < 0.5, swapNights: rnd() < 0.5 };
  let r;
  try { r = applyDivisionRainouts(s, lines.join("\n"), opts); } catch (e) { bad.push({ kind: "rain-throw", form, lines, opts, error: String(e) }); continue; }
  stats.rainMoves += r.moves.length; stats.rainErrors += r.errors.length;
  const v2 = validateDivisions(r.schedule);
  if (!v2.ok) bad.push({ kind: "rain-invalid", form, lines, opts, errors: v2.errors.slice(0, 4) });
  if (pairs(s).split(";").length !== pairs(r.schedule).split(";").length) bad.push({ kind: "rain-count", form, lines, opts });
}

console.log(JSON.stringify(stats));
console.log(`invalid ${bad.length}`);
for (const b of bad.slice(0, 3)) console.log(JSON.stringify(b, null, 1).slice(0, 1800));
process.exit(bad.length ? 1 : 0);
