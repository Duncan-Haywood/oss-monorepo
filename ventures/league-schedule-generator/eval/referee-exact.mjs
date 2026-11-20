// Random weekend tournaments with random referee lists, for eval/referee-exact.py.
//   node eval/referee-exact.mjs [count] [seed] [staffed] > /tmp/ref-cases.json
// Each case carries the slots, which official may take which slot on its own (hours, divisions,
// roles, own club, own team playing: the checks that do not depend on other assignments), the
// officials' caps, and what assignReferees made of it with 1 pass and with 80, each re-checked by
// validateReferees. The Python side finds the true least number of empty slots with CP-SAT under
// the same rules (no overlap, walking time between fields, caps a day and in all, games in a row).
import { tournamentFromText } from "../tournament.mjs";
import { parseReferees, parseCrews, assignReferees, validateReferees } from "../tournament-referees.mjs";
import { mulberry32 } from "../calc.mjs";

const count = Number(process.argv[2] || 60), seed0 = Number(process.argv[3] || 1);
// "staffed": 2 to 3.5 slots an official (a well-staffed weekend); default 3 to 6 (short-handed).
const staffed = process.argv[4] === "staffed";
const CLUBS = ["Hawks", "Rapids", "Otters", "Comets", "Eagles", "Lions", "Wolves", "Bears", "Sharks", "Foxes", "Owls", "Tigers"];
const NAMES = ["Ana", "Ben", "Cai", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kit", "Lou", "Max", "Ned", "Ola", "Pat", "Quin", "Ray", "Sam", "Tia", "Uma", "Vic", "Wes", "Xan", "Yuri", "Zoe"];
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const cases = [];
for (let c = 0; c < count; c++) {
  const rng = mulberry32(seed0 * 1000 + c);
  const nDiv = 2 + Math.floor(rng() * 3), nFields = 3 + Math.floor(rng() * 3);
  const divs = [];
  for (let d = 0; d < nDiv; d++) {
    const n = 5 + Math.floor(rng() * 5);
    const teams = [...CLUBS].sort(() => rng() - 0.5).slice(0, n);
    divs.push(`U${8 + 2 * d}: ${[50, 60, 70][d % 3]} min, pools of ${rng() < 0.5 ? 3 : 4}, top ${rng() < 0.5 ? 2 : 4}\n${teams.join("\n")}`);
  }
  const spec = { days: "Sat 2027-05-15 08:00-18:00\nSun 2027-05-16 08:00-15:00", fields: Array.from({ length: nFields }, (_, i) => `Field ${i + 1}`).join("\n"), divisions: divs.join("\n\n"), seed: 1, tries: 40 };
  const t = tournamentFromText(spec);
  if (t.errors) continue;
  const crewsText = rng() < 0.6 ? `${t.divisions[t.divisions.length - 1].name}: 3` : "";
  const crewN = parseCrews(crewsText, t.divisions).crews;
  const nSlots = t.games.reduce((n, g) => n + crewN[g.division], 0);
  // About 3 to 6 slots an official: from short-handed to comfortable.
  const nRef = Math.min(NAMES.length, Math.max(3, Math.round(nSlots / (staffed ? 2 + 1.5 * rng() : 3 + 3 * rng()))));
  const lines = [];
  for (let i = 0; i < nRef; i++) {
    const parts = [];
    const club = rng() < 0.5 ? ` (${pick(rng, CLUBS.filter((k) => t.divisions.some((d) => d.teams.includes(k))))})` : "";
    const h = rng();
    parts.push(h < 0.5 ? "Sat, Sun" : h < 0.7 ? "Sat 08:00-13:00, Sun" : h < 0.85 ? "Sat 12:00-18:00" : "Sun");
    if (rng() < 0.4) parts.push(`max ${2 + Math.floor(rng() * 4)} a day`);
    if (rng() < 0.3) parts.push(`max ${1 + Math.floor(rng() * 3)} in a row`);
    if (rng() < 0.2) parts.push("assistant only");
    else if (rng() < 0.3) parts.push(t.divisions.slice(0, 2).map((d) => d.name).join(", "));
    if (rng() < 0.15) { const d = pick(rng, t.divisions); parts.push(`plays ${d.name}/${pick(rng, d.teams)}`); }
    lines.push(`${NAMES[i]}${club}: ${parts.join("; ")}`);
  }
  const r = parseReferees(lines.join("\n"), t.days, t.divisions);
  const cr = parseCrews(crewsText, t.divisions);
  if (r.errors.length || cr.errors.length) { console.error(r.errors, cr.errors); continue; }
  const opts = { crews: cr.crews, breakMinutes: 30, maxRun: 3 };
  const one = assignReferees(t, r.officials, { ...opts, tries: 1 });
  const many = assignReferees(t, r.officials, { ...opts, tries: 80 });
  const games = [...t.games].sort((a, b) => a.startAbs - b.startAbs || a.id - b.id);
  const slots = [];
  for (const g of games) for (let k = 0; k < (cr.crews[g.division] ?? 1); k++) slots.push({ game: g.id, role: k, start: g.startAbs, end: g.endAbs, day: g.dayIndex, field: g.field });
  // Static eligibility: run the validator on a one-game, one-official assignment (no interaction).
  const ok = r.officials.map((o) => slots.map((s) => {
    const g = t.games.find((x) => x.id === s.game);
    const crew = Array.from({ length: s.role + 1 }, (_, k) => ({ role: "", name: k === s.role ? o.name : "" }));
    const v = validateReferees(t, [{ ...g, crew, knockout: false, teams: g.knockout ? [] : g.teams }], [o], opts);
    return v.length === 0 ? 1 : 0;
  }));
  cases.push({
    case: c, games: games.length, officials: r.officials.length, slots, ok, buffer: t.buffer, breakMinutes: 30,
    caps: r.officials.map((o) => ({ day: Number.isFinite(o.maxDay) ? o.maxDay : null, total: Number.isFinite(o.maxTotal) ? o.maxTotal : null, run: o.maxRun ?? 3 })),
    one: { empty: one.unfilled.length, check: validateReferees(t, one.games, r.officials, opts).length },
    many: { empty: many.unfilled.length, check: validateReferees(t, many.games, r.officials, opts).length, koRisk: many.koRisk.length },
  });
}
process.stdout.write(JSON.stringify(cases));
