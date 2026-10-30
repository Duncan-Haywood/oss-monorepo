// Random leagues through applyPinnedMatches. After each pass: validateSchedule clean, no match lost or
// invented, every pin reported lands on its chosen date, and a refusal leaves the schedule unchanged.
// Usage: node eval/fuzz-pinned.mjs [count] [seed]
import { readSpec, buildSchedule, validateSchedule, applyPinnedMatches, dayIso, mulberry32 } from "../calc.mjs";
import { makeRandomForm } from "./random-league.mjs";

const count = Number(process.argv[2] || 300);
const rnd = mulberry32(Number(process.argv[3] || 5));
const randomForm = makeRandomForm(rnd);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const all = (s) => s.rounds.flatMap((r) => r.matches.map((m) => ({ day: r.day, m })));
function pairCounts(s) {
  const c = new Map();
  for (const { m } of all(s)) { const k = `${m.home}>${m.away}`; c.set(k, (c.get(k) || 0) + 1); }
  return c;
}
const strip = (r) => JSON.stringify(r, (k, v) => (k === "pinned" ? undefined : v));
const same = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

const stats = { leagues: 0, lines: 0, pins: 0, errors: 0 };
const bad = [];
for (let i = 0; i < count; i++) {
  const form = randomForm();
  const { errors, spec } = readSpec(form);
  if (errors.length) continue;
  let base;
  try { base = buildSchedule(spec); } catch { continue; }
  if (validateSchedule(base).errors.length || !base.rounds.length) continue;
  stats.leagues++;
  const days = base.rounds.map((r) => r.day);
  const lo = Math.min(...days), hi = Math.max(...days);
  const lines = [];
  for (let k = int(1, 4); k > 0; k--) {
    const { m } = pick(all(base));
    const to = k % 2 ? pick(days) : int(lo - 3, hi + 7);
    lines.push(`${base.teams[m.home]} v ${base.teams[m.away]} -> ${dayIso(to)}`);
  }
  stats.lines += lines.length;
  let res;
  try { res = applyPinnedMatches(base, lines.join("\n")); }
  catch (e) { bad.push({ kind: "threw", lines, msg: String(e) }); continue; }
  stats.pins += res.pins.length;
  stats.errors += res.errors.length;
  const v = validateSchedule(res.schedule);
  if (v.errors.length) bad.push({ kind: "invalid", lines, errors: v.errors.slice(0, 3) });
  if (!same(pairCounts(base), pairCounts(res.schedule))) bad.push({ kind: "match lost or invented", lines });
  for (const p of res.pins) {
    const r = res.schedule.rounds.find((x) => x.day === p.to);
    if (!r || !r.matches.some((m) => m.homeName === p.home && m.awayName === p.away && m.court === p.court && m.time === p.time)) bad.push({ kind: "pin not on its date", lines, pin: p });
  }
  if (res.errors.length && !res.pins.length && strip(res.schedule.rounds) !== strip(base.rounds)) {
    bad.push({ kind: "refused but changed", lines });
  }
}
console.log(JSON.stringify(stats), "bad:", bad.length);
for (const b of bad.slice(0, 5)) console.log(JSON.stringify(b));
process.exit(bad.length ? 1 : 0);
