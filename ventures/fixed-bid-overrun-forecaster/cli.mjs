#!/usr/bin/env node
// node cli.mjs --price 80000 --budget 62000 --complete 45 --spent 55500 [--planned 50] [--json]
// exit 1 when the likely forecast is a loss
import { forecast, money } from "./calc.mjs";

const a = process.argv.slice(2);
const get = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? Number(a[i + 1]) : NaN; };
const planned = get("planned");
const f = forecast({ price: get("price"), budget: get("budget"), percentComplete: get("complete"), actualCost: get("spent"), plannedPercent: Number.isNaN(planned) ? null : planned });
if (f.error) { console.error(f.error); console.error("usage: node cli.mjs --price N --budget N --complete PCT --spent N [--planned PCT] [--json]"); process.exit(2); }
if (a.includes("--json")) console.log(JSON.stringify(f, null, 2));
else {
  for (const s of f.scenarios) console.log(`${s.label.padEnd(40)} finish ${money(s.eac).padStart(10)}  margin ${money(s.margin).padStart(10)}`);
  console.log();
  for (const x of f.advice) console.log(`- ${x}`);
  for (const w of f.warnings) console.log(`! ${w}`);
}
process.exit(f.status === "losing" ? 1 : 0);
