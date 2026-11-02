// Officials assigned first, then a rainout or unavailable-date pass moves matches. Does the official list stay valid?
// Usage: node eval/fuzz-officials-moves.mjs [count] [seed]
import { mulberry32, dayIso } from "../calc.mjs";
import { readDivisionsSpec, buildDivisions, applyDivisionRainouts, parseDivisionOfficials, assignDivisionOfficials, validateDivisionOfficials } from "../divisions.mjs";

const count = Number(process.argv[2] || 300);
const rnd = mulberry32(Number(process.argv[3] || 5));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const st = { leagues: 0, shippedInvalid: 0, shippedUnfilled: 0, moved: 0, staleInvalid: 0, bad: 0 };
const examples = [];
for (let i = 0; i < count; i++) {
  const nDiv = int(1, 3);
  const divs = Array.from({ length: nDiv }, (_, k) => `D${k + 1}: ${Array.from({ length: int(3, 8) }, (_, j) => `T${j + 1}`).join(", ")}`);
  const wd = DAYS.filter(() => rnd() < 0.4); if (!wd.length) wd.push("Tue");
  const form = { divisions: divs.join("\n"), courts: "C1, C2, C3", times: "18:00, 19:00", start: "2027-01-04", weekdays: wd.join(", "), seed: int(1, 999) };
  const { errors, spec } = readDivisionsSpec(form);
  if (errors.length) continue;
  let s; try { s = buildDivisions(spec); } catch { continue; }
  const { officials } = parseDivisionOfficials(Array.from({ length: int(2, 6) }, (_, k) => `Ref${k + 1}: ${wd.join(", ")} max ${int(5, 40)}`).join("\n"), s.divisions);
  const a = assignDivisionOfficials(s, officials);
  if (validateDivisionOfficials(a.schedule, officials).length) { st.bad++; continue; }
  st.leagues++;
  const days = a.schedule.nights.map((n) => n.day);
  const r = applyDivisionRainouts(a.schedule, dayIso(pick(days)));
  st.moved += r.moves.length;
  const b = assignDivisionOfficials(r.schedule, officials); // the shipped order: move first, assign after
  st.shippedUnfilled += b.unfilled.length;
  if (validateDivisionOfficials(b.schedule, officials).length) st.shippedInvalid++;
  const errs = validateDivisionOfficials(r.schedule, officials);
  if (errs.length) { st.staleInvalid++; if (examples.length < 3) examples.push(errs.slice(0, 2)); }
}
console.log(JSON.stringify(st), JSON.stringify(examples, null, 1));
