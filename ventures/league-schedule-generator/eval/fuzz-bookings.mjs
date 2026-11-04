// Random multi-division leagues through divisionsBookings: every game is counted once, each booked court exists at its venue,
// spans run from the earliest start to the latest finish, and no (venue, night) pair is listed twice.
// Usage: node eval/fuzz-bookings.mjs [count] [seed]
import { mulberry32, dayIso } from "../calc.mjs";
import { readDivisionsSpec, buildDivisions, divisionsBookings } from "../divisions.mjs";

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

const stats = { leagues: 0, rejected: 0, matches: 0, venueNights: 0 };
const bad = [];
for (let i = 0; i < count; i++) {
  const form = randomForm();
  const { errors, spec } = readDivisionsSpec(form);
  if (errors.length) { stats.rejected++; continue; }
  let s;
  try { s = buildDivisions(spec); } catch (e) { if (/court slots/.test(String(e))) { stats.rejected++; continue; } bad.push({ kind: "build-throw", error: String(e) }); continue; }
  stats.leagues++;
  const minutes = int(30, 120);
  const b = divisionsBookings(s, { minutes });
  const total = s.nights.reduce((n, x) => n + x.matches.length, 0);
  stats.matches += total;
  const games = b.venues.reduce((n, v) => n + v.games, 0);
  if (games !== total) bad.push({ kind: "count", games, total, form });
  const seen = new Set();
  for (const v of b.venues) for (const d of v.dates) {
    stats.venueNights++;
    const key = `${v.venue}|${d.date}`;
    if (seen.has(key)) bad.push({ kind: "dup", key, form });
    seen.add(key);
    const night = s.nights.find((n) => dayIso(n.day) === d.date);
    const ms = night ? night.matches.filter((m) => m.venue === v.venue) : [];
    if (!ms.length || ms.length !== d.games) bad.push({ kind: "games", key, form });
    const courts = new Set(ms.map((m) => m.court));
    if (d.courts.join() !== [...courts].sort().join()) bad.push({ kind: "courts", key, form });
    const mins = ms.map((m) => m.time.split(":").reduce((h, x) => h * 60 + Number(x), 0));
    const hh = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    if (d.from !== hh(Math.min(...mins)) || d.to !== hh(Math.max(...mins) + minutes)) bad.push({ kind: "span", key, from: d.from, to: d.to, form });
  }
}
console.log(JSON.stringify(stats));
console.log(`invalid ${bad.length}`);
for (const x of bad.slice(0, 3)) console.log(JSON.stringify(x, null, 1).slice(0, 1500));
process.exit(bad.length ? 1 : 0);
