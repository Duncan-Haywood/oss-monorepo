// Random leagues through readSpec -> buildSchedule -> validateSchedule.
// Usage: node eval/fuzz-build.mjs [count] [seed]
import { readSpec, buildSchedule, validateSchedule, mulberry32, dayIso } from "../calc.mjs";

const count = Number(process.argv[2] || 500);
const rnd = mulberry32(Number(process.argv[3] || 7));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function randomForm() {
  const n = int(2, 20);
  const teams = Array.from({ length: n }, (_, i) => `Team${i + 1}`);
  const nTimes = int(1, 3);
  const times = ["18:00", "19:00", "20:00"].slice(0, nTimes);
  const perRound = Math.floor(n / 2);
  const nCourts = Math.ceil(perRound / nTimes) + int(0, 1);
  const wd = DAYS.filter(() => rnd() < 0.35);
  if (!wd.length) wd.push(pick(DAYS));
  const base = 20400 + int(0, 365); // days from a fixed epoch the parser also accepts as ISO below
  const start = new Date(Date.UTC(2026, 0, 1) + int(0, 300) * 864e5);
  const iso = (d) => d.toISOString().slice(0, 10);
  const skip = Array.from({ length: int(0, 4) }, () => iso(new Date(start.getTime() + int(0, 120) * 864e5)));
  const blackouts = Array.from({ length: int(0, 3) }, () => `${pick(teams)}: ${iso(new Date(start.getTime() + int(0, 90) * 864e5))}`);
  const courtNames = Array.from({ length: nCourts }, (_, i) => `C${i + 1}`);
  const closures = rnd() < 0.5 ? [`${pick(courtNames)}: ${iso(new Date(start.getTime() + int(0, 60) * 864e5))}`] : [];
  const timeLimits = nTimes > 1 && rnd() < 0.5 ? [`${pick(teams)}: ${times[0]}`] : [];
  const courtLimits = nCourts > 1 && rnd() < 0.4 ? [`${pick(teams)}: ${courtNames.slice(0, 2).join(", ")}`] : [];
  return {
    courtClosures: closures.join("\n"), timeLimits: timeLimits.join("\n"), courtLimits: courtLimits.join("\n"),
    teams: teams.join("\n"), start: iso(start), weekdays: wd.join(","), skip: skip.join(", "),
    blackouts: blackouts.join("\n"), times: times.join(", "), courts: Array.from({ length: nCourts }, (_, i) => `C${i + 1}`).join(", "),
    double: rnd() < 0.4, seed: int(1, 9999), minutes: 60,
  };
}

let built = 0, rejected = 0, bad = [];
for (let i = 0; i < count; i++) {
  const form = randomForm();
  const { errors, spec } = readSpec(form);
  if (errors.length) { rejected++; continue; }
  let s; const t0 = Date.now();
  try { s = buildSchedule(spec); } catch (e) { rejected++; continue; }
  built++;
  const dt = Date.now() - t0; if (dt > 3000) console.log("slow", dt, "ms", JSON.stringify(form));
  const v = validateSchedule(s);
  if (v.length) bad.push({ form, v });
}
console.log(`built ${built}, rejected ${rejected}, invalid ${bad.length}`);
for (const b of bad.slice(0, 3)) console.log(JSON.stringify(b, null, 1).slice(0, 1500));
process.exit(bad.length ? 1 : 0);
