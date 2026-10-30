// Random leagues through readSpec -> buildSchedule -> validateSchedule.
// Usage: node eval/fuzz-build.mjs [count] [seed]
import { readSpec, buildSchedule, validateSchedule, mulberry32 } from "../calc.mjs";
import { makeRandomForm } from "./random-league.mjs";

const count = Number(process.argv[2] || 500);
const rnd = mulberry32(Number(process.argv[3] || 7));
const randomForm = makeRandomForm(rnd);

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
