// Random leagues through the passes that edit a built schedule: rainouts, late teams, officials.
// After each pass: validateSchedule is clean, no match is lost or invented, and every match the pass did
// not report as moved is exactly where it was. Officials: validateOfficials is clean and every match is
// either assigned or listed as unfilled.
// Usage: node eval/fuzz-passes.mjs [count] [seed]
import { readSpec, buildSchedule, validateSchedule, applyRainouts, applyLateTeams, parseOfficials, assignOfficials, validateOfficials, dayIso, mulberry32 } from "../calc.mjs";
import { makeRandomForm } from "./random-league.mjs";

const count = Number(process.argv[2] || 300);
const rnd = mulberry32(Number(process.argv[3] || 5));
const randomForm = makeRandomForm(rnd);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const key = (day, m) => `${day}|${m.court}|${m.time}|${m.home}|${m.away}`;
const all = (s) => s.rounds.flatMap((r) => r.matches.map((m) => ({ day: r.day, m })));
const pairKey = (m) => `${m.home}>${m.away}`;

// Match multiset by (home, away): a pass may move a match but never drops or duplicates one.
function pairCounts(s) {
  const c = new Map();
  for (const { m } of all(s)) c.set(pairKey(m), (c.get(pairKey(m)) || 0) + 1);
  return c;
}
function sameCounts(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

const stats = { leagues: 0, rainLines: 0, rainMoves: 0, rainErrors: 0, lateTeams: 0, lateMoves: 0, lateErrors: 0, officialMatches: 0, officialUnfilled: 0 };
const bad = [];
const fail = (kind, form, extra) => bad.push({ kind, form, ...extra });

for (let i = 0; i < count; i++) {
  const form = randomForm();
  const { errors, spec } = readSpec(form);
  if (errors.length) continue;
  let base;
  try { base = buildSchedule(spec); } catch { continue; }
  if (validateSchedule(base).errors.length || !base.rounds.length) continue;
  stats.leagues++;
  const days = base.rounds.map((r) => r.day);
  const names = base.teams;

  // ---- rainouts: a few whole nights and single-team lines, some with a named make-up date
  const lines = [];
  for (let k = int(1, 4); k > 0; k--) {
    const d = pick(days);
    let line = dayIso(d);
    if (rnd() < 0.6) line += ` ${pick(names)}`;
    if (rnd() < 0.3) line += ` -> ${dayIso(d + int(1, 21))}`;
    lines.push(line);
  }
  stats.rainLines += lines.length;
  const rain = applyRainouts(base, lines.join("\n"));
  stats.rainMoves += rain.moves.length; stats.rainErrors += rain.errors.length;
  const v1 = validateSchedule(rain.schedule);
  if (v1.errors.length) fail("rainout-invalid", form, { lines, errors: v1.errors.slice(0, 5) });
  if (!sameCounts(pairCounts(base), pairCounts(rain.schedule))) fail("rainout-count", form, { lines });
  // matches not cancelled keep their place: a placement that vanished must be a reported move (a match moved twice
  // shows one loss and two moves)
  const afterKeys = new Set(all(rain.schedule).map(({ day, m }) => key(day, m)));
  const lost = all(base).filter(({ day, m }) => !afterKeys.has(key(day, m)));
  if ((lost.length > rain.moves.length) || (!lost.length !== !rain.moves.length)) fail("rainout-unreported-change", form, { lines, lost: lost.length, moves: rain.moves.length });

  // ---- late teams: one or two teams join after a random night
  const late = [];
  for (const t of new Set([pick(names), pick(names)])) late.push(`${dayIso(pick(days))} ${t}`);
  stats.lateTeams += late.length;
  const lt = applyLateTeams(base, late.join("\n"));
  stats.lateMoves += lt.joins.reduce((a, j) => a + j.moved.length, 0); stats.lateErrors += lt.errors.length;
  const v2 = validateSchedule(lt.schedule);
  if (v2.errors.length) fail("late-invalid", form, { late, errors: v2.errors.slice(0, 5) });
  if (!sameCounts(pairCounts(base), pairCounts(lt.schedule))) fail("late-count", form, { late });
  // a late team never plays before its first night unless the pass said it could not place that match
  if (!lt.errors.length) {
    for (const line of late) {
      const [d, ...rest] = line.split(" ");
      const idx = names.indexOf(rest.join(" "));
      const first = Date.parse(d) / 864e5;
      for (const { day, m } of all(lt.schedule)) if ((m.home === idx || m.away === idx) && day < first) fail("late-too-early", form, { line, day: dayIso(day) });
    }
  }

  // ---- officials
  const cur = rnd() < 0.5 ? rain.schedule : base;
  const nOff = int(0, 6);
  const text = Array.from({ length: nOff }, (_, k) => {
    let l = `Ref${k + 1}`;
    if (rnd() < 0.5) l += ` (${pick(names)})`;
    if (rnd() < 0.4) l += `: ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].filter(() => rnd() < 0.5).join(", ") || "Sat"}`;
    if (rnd() < 0.4) l += ` max ${int(1, 8)}`;
    return l;
  }).join("\n");
  const po = parseOfficials(text, names);
  if (po.errors.length) continue;
  const as = assignOfficials(cur, po.officials);
  const total = all(cur).length;
  stats.officialMatches += total; stats.officialUnfilled += as.unfilled.length;
  const v3 = validateOfficials(as.schedule, po.officials);
  if (v3.length) fail("officials-invalid", form, { text, errors: v3.slice(0, 5) });
  if (as.total + as.unfilled.length !== total) fail("officials-count", form, { text, total, assigned: as.total, unfilled: as.unfilled.length });
  if (as.loads.reduce((a, l) => a + l.matches, 0) !== as.total) fail("officials-loads", form, { text });
  // an unfilled match must really have no eligible official (greedy never leaves a fillable one empty)
}

console.log(JSON.stringify(stats));
console.log(`invalid ${bad.length}`);
for (const b of bad.slice(0, 3)) console.log(JSON.stringify(b, null, 1).slice(0, 1800));
process.exit(bad.length ? 1 : 0);
