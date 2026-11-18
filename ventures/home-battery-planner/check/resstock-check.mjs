// Runs the forty ResStock homes (check/resstock_ca.py) through the tool: reader, the example plans, three
// modes for a 13.5 kWh / 5 kW battery, and the size sweep. Prints markdown (check/resstock-results.md).
// node check/resstock-check.mjs DIR
import { readFileSync, readdirSync } from "node:fs";
import { readMeter } from "../meter.mjs";
import { parseTariffs, hourlyPrices, EXAMPLE_TARIFFS } from "../tariff.mjs";
import { compare } from "../dispatch.mjs";
import { SIZES } from "../example.mjs";

const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => /^ca-\d+\.csv$/.test(f)).sort((a, b) => parseInt(a.slice(3)) - parseInt(b.slice(3)));
const plans = parseTariffs(EXAMPLE_TARIFFS).map((t) => t.plan).slice(0, 2);
const BAT = { kwh: 13.5, kw: 5, roundTrip: 0.9, reserve: 0.2, gridExport: true };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
const f0 = (x) => Math.round(x).toLocaleString("en-US");
const pct = (x) => (100 * x).toFixed(0) + "%";
const rows = { A: [], B: [] };
const sweep = { A: SIZES.map(() => []), B: SIZES.map(() => []) };
const selfSweep = { A: SIZES.map(() => []), B: SIZES.map(() => []) };
let notes = 0;
for (const f of files) {
  const m = readMeter(readFileSync(`${dir}/${f}`, "utf8"));
  if (!m.ok) throw new Error(f + ": " + m.notes.join(" "));
  notes += m.filled;
  plans.forEach((plan, pi) => {
    const key = "AB"[pi];
    const p = hourlyPrices(plan, m.start, m.net.length);
    const c = compare(m.net, BAT, p, plan.fixed);
    rows[key].push({ f, none: c.none.bill.total, self: c.self.saving, peak: c.peak.saving, opt: c.optimal.saving, exported: c.none.bill.byMonth.reduce((a, x) => a + x.exported, 0) });
    SIZES.forEach((s, i) => {
      const r = compare(m.net, { ...BAT, ...s }, p, plan.fixed);
      sweep[key][i].push(r.optimal.saving);
      selfSweep[key][i].push(r.self.saving);
    });
  });
}
const out = [];
out.push(`# Forty California homes with solar (ResStock AMY2018 release 2), run through home-battery-planner`);
out.push("");
out.push(`Written by \`node check/resstock-check.mjs DIR\` from the CSVs \`check/resstock_ca.py\` writes. Building simulations on real 2018 weather, not meters; the rate plans are the page's invented examples (A: 4-9 pm peak with a low export credit, B: the same import prices with export at import minus $0.03). Battery: 13.5 kWh usable, 5 kW, 90% round trip, 20% backup reserve, no grid charging. ${files.length} homes; ${notes} hour(s) filled by the reader in total (the spring-forward hours).`);
for (const key of ["A", "B"]) {
  const r = rows[key];
  out.push("", `## Plan ${key}: ${plans["AB".indexOf(key)].name}`, "");
  out.push("| | 25th pct | median | 75th pct |", "|---|---:|---:|---:|");
  for (const [label, xs] of [["Yearly bill, no battery ($)", r.map((x) => x.none)], ["Saving, self-powered ($/yr)", r.map((x) => x.self)], ["Saving, time-based ($/yr)", r.map((x) => x.peak)], ["Saving, perfect-foresight ceiling ($/yr)", r.map((x) => x.opt)], ["Self-powered as a share of the ceiling", r.map((x) => x.self / x.opt)], ["Time-based as a share of the ceiling", r.map((x) => x.peak / x.opt)]])
    out.push(`| ${label} | ${/share/.test(label) ? pct(q(xs, 0.25)) : f0(q(xs, 0.25))} | ${/share/.test(label) ? pct(q(xs, 0.5)) : f0(q(xs, 0.5))} | ${/share/.test(label) ? pct(q(xs, 0.75)) : f0(q(xs, 0.75))} |`);
  const selfWins = r.filter((x) => x.self > x.peak).length;
  out.push("", `Self-powered saved more than time-based in ${selfWins} of ${r.length} homes.`);
  out.push("", "Size sweep, median saving across the homes ($/yr), and the median extra saving per extra usable kWh over the next smaller size:", "");
  out.push("| usable kWh / kW | ceiling | self-powered | extra $/yr per extra kWh (ceiling) |", "|---|---:|---:|---:|");
  SIZES.forEach((s, i) => {
    const marg = i === 0 ? sweep[key][0].map((x) => x / s.kwh) : sweep[key][i].map((x, h) => (x - sweep[key][i - 1][h]) / (s.kwh - SIZES[i - 1].kwh));
    out.push(`| ${s.kwh} / ${s.kw} | ${f0(q(sweep[key][i], 0.5))} | ${f0(q(selfSweep[key][i], 0.5))} | ${q(marg, 0.5).toFixed(1)} |`);
  });
}
console.log(out.join("\n"));
