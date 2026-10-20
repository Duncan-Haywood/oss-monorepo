#!/usr/bin/env node
// Container load plan from a cargo file, in a terminal.
//
//   node cli.mjs cargo.csv                         # 40 ft container: containers needed, fit, balance
//   node cli.mjs --container 20ft cargo.csv        # 20ft, 40ft, 40hc, 53ft, truck26
//   node cli.mjs --container 589x235x239@28200 cargo.csv   # your own L x W x H (cm) @ payload (kg)
//   node cli.mjs --compare cargo.csv               # every standard size, loose and on pallets
//   node cli.mjs --csv cargo.csv > loading.csv     # loading list, one row per unit
//   node cli.mjs --html cargo.csv > plan.html      # printable to-scale plan
//   node cli.mjs --json cargo.csv                  # machine-readable
//   node cli.mjs --example                         # run on the built-in invented cargo
//
// Cargo file: one line per cargo type, as on the web page:
//   name, length, width, height, weight, quantity, rotation, highest layer, weight allowed on top, delivery stop
// (only the first five columns are required). Zero dependencies, no network.
// Same packer as the web page (calc.mjs); a planning aid, not a load-securing certificate.

import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  SYSTEMS, PRESETS, parseCargo, planLoad, verifyPacking, balanceReport, stopReport, compareOptions, priceOptions, parseRates, fmtInt,
  suggestRestarts, reportCsv, planReportHtml, sampleCargo, pct, fmtNum, wtText, lenText, dimsText,
} from "./calc.mjs";

const USAGE = `Plan a container, trailer or truck load from a cargo list.

Usage:
  node cli.mjs [options] <cargo.csv | ->

Options:
  --container <id|LxWxH@payload>  ${PRESETS.map((p) => p.id).join(", ")} (default 40ft),
                       or your own inside size and payload, e.g. 589x235x239@28200
  --imperial           sizes in inches and weights in pounds (default cm and kg)
  --compare            also run every standard size, loose and on pallets
  --rates <id=cost,...>  what one container of each size costs, e.g. 20ft=2400,40ft=3800;
                       adds total and cost per unit to the comparison (implies --compare)
  --restarts <n>       packing attempts per container (default scales with unit count)
  --csv                print the loading list as CSV (one row per unit)
  --html               print a self-contained printable plan
  --json               print the plan as JSON
  --example            use the built-in invented cargo instead of a file
  -h, --help           this message

Cargo lines: name, length, width, height, weight, quantity[, rotation (upright|any|fixed),
highest layer, weight allowed on top, delivery stop]. Container sizes are nominal; override them.
A heuristic packing for planning, not a load-securing, axle-weight or compliance certificate.
`;

export function parseArgs(argv) {
  const opts = { file: null, container: "40ft", imperial: false, compare: false, rates: null, restarts: null, csv: false, json: false, html: false, example: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--imperial") opts.imperial = true;
    else if (arg === "--compare") opts.compare = true;
    else if (arg === "--csv") opts.csv = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--html") opts.html = true;
    else if (arg === "--example") opts.example = true;
    else if (arg === "--rates") {
      const v = argv[++i];
      if (!v) throw new Error("--rates needs id=cost pairs, e.g. 20ft=2400,40ft=3800");
      opts.rates = parseRates(v);
      opts.compare = true;
    } else if (arg === "--container") {
      const v = argv[++i];
      if (!v) throw new Error("--container needs a preset id or LxWxH@payload");
      opts.container = v;
    } else if (arg === "--restarts") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 1) throw new Error("--restarts needs a number of at least 1");
      opts.restarts = Math.floor(v);
    } else if (arg.startsWith("-") && arg !== "-") throw new Error(`unknown option: ${arg}`);
    else opts.file = arg;
  }
  if ([opts.csv, opts.json, opts.html].filter(Boolean).length > 1) throw new Error("choose one of --csv, --json and --html");
  return opts;
}

// "20ft" -> preset; "589x235x239@28200" -> custom, in the chosen units (cm/kg or in/lb).
export function resolveContainerArg(text, sys) {
  const preset = PRESETS.find((p) => p.id === String(text).toLowerCase());
  if (preset) return { container: { ...preset } };
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)@(\d+(?:\.\d+)?)$/i.exec(String(text).trim());
  if (!m) return { error: `--container must be one of ${PRESETS.map((p) => p.id).join(", ")} or LxWxH@payload (e.g. 589x235x239@28200).` };
  const [l, w, h, payload] = m.slice(1).map(Number);
  const mm = (v) => Math.max(1, Math.round(v * sys.mm));
  return { container: { id: "custom", name: "Custom", l: mm(l), w: mm(w), h: mm(h), payload: payload * sys.kg } };
}

export function run(text, opts = {}) {
  const sys = opts.imperial ? SYSTEMS.imperial : SYSTEMS.metric;
  const parsed = parseCargo(text, sys);
  if (parsed.error) return { error: parsed.error };
  const cr = resolveContainerArg(opts.container ?? "40ft", sys);
  if (cr.error) return { error: cr.error };
  const lines = parsed.lines;
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const restarts = opts.restarts ?? suggestRestarts(units);
  const plan = planLoad(lines, cr.container, { restarts });
  const notices = [...parsed.warnings];
  plan.containers.forEach((c, i) => {
    const v = verifyPacking(plan.container, lines, c.placements);
    if (!v.ok) notices.push(`Internal self-check failed for container ${i + 1}: ${v.errors[0]}. Do not rely on that plan.`);
  });
  for (const u of plan.unfit) notices.push(`${lines[u.line].name}: ${u.qty} unit${u.qty === 1 ? "" : "s"} cannot go in this container (${u.reason === "weight" ? "one unit is heavier than the payload" : "it does not fit inside in any allowed rotation"}).`);
  if (plan.containers.length >= 200) notices.push("Stopped at 200 containers.");
  const comparison = opts.compare
    ? compareOptions(lines, { restarts: Math.max(2, Math.floor(restarts / 3)), custom: cr.container.id === "custom" ? cr.container : null })
    : null;
  const pricing = comparison && opts.rates ? priceOptions(comparison.options, opts.rates, plan.totalUnits) : null;
  if (opts.rates && !pricing.length) notices.push(`No rate matched a size (${comparison.options.map((o) => o.id).join(", ")}).`);
  return { sys, lines, plan, notices, comparison, pricing };
}

export function render(res) {
  const { sys, lines, plan, notices, comparison, pricing } = res, cont = plan.container, out = [];
  out.push(`Container load plan   ${cont.name}: ${dimsText([cont.l, cont.w, cont.h], sys)} ${sys.len}, payload ${wtText(cont.payload, sys)} ${sys.wt}`, "=".repeat(72), "");
  out.push(`  Containers needed   ${plan.containersNeeded}   (volume and weight lower bound ${plan.lowerBound})`);
  out.push(`  Units packed        ${plan.packedUnits} of ${plan.totalUnits}`);
  if (plan.containersNeeded) out.push(`  Average fill        ${pct(plan.avgUtil)} of volume; last container ${pct(plan.lastUtil)}`);
  out.push("", "By cargo line", "-".repeat(72), "Line".padEnd(34) + "Ordered".padStart(9) + "Packed".padStart(9) + "Left out".padStart(10));
  lines.forEach((l, k) => {
    const packed = plan.containers.reduce((s, c) => s + c.counts[k], 0);
    out.push(l.name.slice(0, 32).padEnd(34) + String(l.qty).padStart(9) + String(packed).padStart(9) + String(l.qty - packed).padStart(10));
  });
  out.push("", "Containers", "-".repeat(72));
  plan.containers.forEach((c, i) => {
    const bal = balanceReport(cont, lines, c.placements);
    out.push(`  ${String(i + 1).padStart(3)}.  ${String(c.count).padStart(5)} units  ${pct(c.util, 1).padStart(6)} volume  ${wtText(c.weight, sys).padStart(7)} ${sys.wt} (${pct(c.payloadPct)} of payload)`);
    if (!bal.ok) for (const w of bal.warnings) out.push(`         balance: ${w}`);
    const st = stopReport(lines, c.placements);
    if (st.used && !st.ok) out.push(`         stops: ${st.blockedUnits} unit${st.blockedUnits === 1 ? "" : "s"} for an earlier stop sit behind cargo for a later one; they cannot come out first.`);
  });
  if (comparison) {
    out.push("", "Other sizes, same cargo", "-".repeat(72), "Option".padEnd(46) + "Containers".padStart(11) + "Avg fill".padStart(9) + "Left out".padStart(10));
    for (const o of comparison.options) {
      const unfit = o.plan.unfit.reduce((s, u) => s + u.qty, 0);
      out.push(o.label.slice(0, 44).padEnd(46) + String(o.plan.containersNeeded).padStart(11) + pct(o.plan.avgUtil).padStart(9) + String(unfit).padStart(10));
    }
  }
  if (pricing && pricing.length) {
    out.push("", "Freight cost at your rates (cheapest complete option marked *)", "-".repeat(72), "Option".padEnd(40) + "Containers".padStart(11) + "Total".padStart(10) + "Per unit".padStart(11));
    for (const p of pricing) {
      const tag = p.cheapest ? "*" : p.complete ? " " : "!";
      out.push(`${tag} ${p.label.slice(0, 37)}`.padEnd(40) + String(p.containers).padStart(11) + fmtInt(p.total).padStart(10) + (p.perUnit == null ? "—" : p.perUnit.toFixed(2)).padStart(11) + (p.complete ? "" : `   (${p.unitsLeftOut} left out)`));
    }
  }
  if (notices.length) { out.push("", "Notices", "-".repeat(72)); for (const n of notices) out.push(`  ${n}`); }
  out.push("", "A heuristic packing on the sizes you typed; not a load-securing, axle-weight or compliance certificate. Confirm with your carrier or forwarder.");
  return out.join("\n");
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(e.message); return 2; }
  if (opts.help || (!opts.file && !opts.example)) { console.log(USAGE); return opts.help ? 0 : 2; }
  let text;
  try { text = opts.example ? sampleCargo(opts.imperial ? SYSTEMS.imperial : SYSTEMS.metric) : opts.file === "-" ? await readStdin() : await readFile(opts.file, "utf8"); }
  catch (e) { console.error(`cannot read ${opts.file}: ${e.message}`); return 2; }
  const res = run(text, opts);
  if (res.error) { console.error(res.error); return 2; }
  if (opts.csv) process.stdout.write(reportCsv(res.plan, res.lines, res.sys));
  else if (opts.html) process.stdout.write(planReportHtml(res.plan, res.lines, res.sys, { notes: res.notices, when: new Date().toISOString().slice(0, 10) }));
  else if (opts.json) {
    const { plan, lines, sys, notices, comparison, pricing } = res;
    console.log(JSON.stringify({
      units: sys.id,
      container: plan.container,
      containersNeeded: plan.containersNeeded,
      lowerBound: plan.lowerBound,
      packedUnits: plan.packedUnits,
      totalUnits: plan.totalUnits,
      lines: lines.map((l, k) => ({ name: l.name, ordered: l.qty, packed: plan.containers.reduce((s, c) => s + c.counts[k], 0) })),
      containers: plan.containers.map((c) => ({ units: c.count, utilisation: c.util, weightKg: c.weight, payloadShare: c.payloadPct, balance: balanceReport(plan.container, lines, c.placements), stops: stopReport(lines, c.placements).used ? { blockedUnits: stopReport(lines, c.placements).blockedUnits } : null, placements: c.placements })),
      notices,
      pricing,
      comparison: comparison && comparison.options.map((o) => ({ option: o.label, containers: o.plan.containersNeeded, avgUtilisation: o.plan.avgUtil, unitsLeftOut: o.plan.unfit.reduce((s, u) => s + u.qty, 0) })),
    }, null, 2));
  } else console.log(render(res));
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = await main(process.argv.slice(2));
}
