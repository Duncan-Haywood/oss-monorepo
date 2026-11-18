#!/usr/bin/env node
// node cli.mjs --meter usage.csv --plans plans.txt [--kwh 13.5 --kw 5 --round-trip 90 --reserve 20
//              --grid-charge --grid-export --sizes "5/3.8,10/5,13.5/5" --cost-fixed 3000 --cost-per-kwh 700 --json]
// node cli.mjs --example      (the synthetic placeholder year and the invented example plans)
import { readFileSync } from "node:fs";
import { analyze, MODE_NAMES } from "./report.mjs";
import { exampleCsv } from "./example.mjs";
import { EXAMPLE_TARIFFS } from "./tariff.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const number = (n, d) => { const v = val(n); if (v == null) return d; const x = Number(v); if (!Number.isFinite(x)) { console.error(`${n} needs a number, got "${v}"`); process.exit(2); } return x; };
if (flag("--help") || (!flag("--example") && !val("--meter"))) {
  console.log("Usage: node cli.mjs --meter FILE --plans FILE [--kwh N --kw N --round-trip PCT --reserve PCT --grid-charge --grid-export --sizes LIST --cost-fixed $ --cost-per-kwh $ --json]\n       node cli.mjs --example");
  process.exit(flag("--help") ? 0 : 2);
}
const ex = flag("--example");
const r = analyze({
  meter: ex ? exampleCsv() : readFileSync(val("--meter"), "utf8"),
  tariffs: ex && !val("--plans") ? EXAMPLE_TARIFFS : readFileSync(val("--plans"), "utf8"),
  battery: { kwh: number("--kwh", 13.5), kw: number("--kw", 5), roundTrip: number("--round-trip", 90) / 100, reserve: number("--reserve", 20) / 100, gridCharge: flag("--grid-charge"), gridExport: flag("--grid-export") },
  sizes: val("--sizes", "5/3.8,10/5,13.5/5,20/7.6,27/10"),
  costFixed: number("--cost-fixed", 0),
  costPerKwh: number("--cost-per-kwh", 0),
});
if (flag("--json")) {
  const { meter, ...rest } = r;
  console.log(JSON.stringify({ ...rest, meter: meter && { start: new Date(meter.start).toISOString().slice(0, 16), hours: meter.net.length, notes: meter.notes } }, null, 2));
  process.exit(r.ok ? 0 : 1);
}
if (!r.ok) { console.error(r.errors.join("\n")); process.exit(1); }
const $ = (x) => (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
for (const n of r.meter.notes) console.log("- " + n);
console.log(`\nBattery: ${r.battery.kwh} kWh usable, ${r.battery.kw} kW, ${Math.round(r.battery.roundTrip * 100)}% round trip, ${Math.round(r.battery.reserve * 100)}% reserve${r.battery.gridCharge ? ", may charge from the grid" : ""}${r.battery.gridExport ? ", may export" : ""}.`);
for (const p of r.plans) {
  console.log(`\n${p.name}\n  Bill without a battery: ${$(p.none.total * r.scale)} a year`);
  for (const m of p.modes) console.log(`  ${MODE_NAMES[m.mode].padEnd(60)} saves ${$(m.perYear).padStart(7)} a year${m.years ? `, payback ${m.years.toFixed(1)} years` : ""}, ${Math.round(m.cycles)} cycles`);
  if (p.sweep.length) {
    console.log("  Size        self-powered   ceiling" + (r.hasCost ? "   payback (self)" : ""));
    for (const s of p.sweep) console.log(`  ${(s.kwh + "/" + s.kw).padEnd(10)} ${$(s.self.perYear).padStart(12)} ${$(s.optimal.perYear).padStart(9)}` + (r.hasCost ? `   ${s.self.years ? s.self.years.toFixed(1) + " years" : "never"}` : ""));
  }
}
console.log(`\nCheapest plan without a battery: ${r.cheapestWithout}. With the battery self-powered: ${r.cheapestWithSelf}. At the ceiling: ${r.cheapestWithOptimal}.`);
console.log("Estimates from your data and the plans you typed; not financial advice. The perfect-foresight figure is a ceiling no controller reaches.");
