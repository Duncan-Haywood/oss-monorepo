#!/usr/bin/env node
// @ts-check
// Wall framing takeoff from the terminal: a plan JSON in, an order, a cut
// list and per-wall layout marks out.
import { readFileSync } from "node:fs";
import { sheathe, defaultSheathing, sheathingText, nailerCuts } from "./sheathing.mjs";
import { drawingSetHtml } from "./drawings.mjs";
import { takeoff, samplePlan, toCsv, formatLength, formatInches, parseLength } from "./engine.mjs";

const HELP = `wall-framing-takeoff: stud layout, cut list and the cheapest lumber order for a set of walls

Usage:
  node cli.mjs plan.json            print the order, the cut list and the layout marks
  node cli.mjs plan.json --json     the full result as JSON
  node cli.mjs plan.json --csv      order, cut list and board-by-board cuts as CSV
  node cli.mjs plan.json --sheathing  add panel layout per wall and the sheet order
  node cli.mjs plan.json --overhang   run sheathing past corners to cover the next wall's end stud (vertical sheets)
  node cli.mjs plan.json --rim-lap=9.25  run sheathing that many inches below the bottom plate to cover the rim board (vertical sheets)
  node cli.mjs plan.json --horizontal sheets long side along the wall (implies --sheathing)
  node cli.mjs plan.json --panel-max=12ft  shop drawings with each wall split into panels no longer than that
  node cli.mjs plan.json --panel-max=12ft --sheathing-psf=1.5  also weigh the sheathing on each panel (lb per sq ft)
  node cli.mjs plan.json --drawings   printable HTML shop drawings, one sheet per wall (marked members, dimensions, parts table)
  node cli.mjs --example            print the example plan (an invented 40 x 28 ft ranch) to start from
  cat plan.json | node cli.mjs -    read the plan from stdin

Lengths in the plan are inches, or text such as "12' 6-1/2\\"".

No warranty. This tool is provided free and as-is, without warranty of any kind,
express or implied. It is not engineering, construction or building-code advice,
and it does not replace a qualified professional. Header sizes, jack counts and
stud spacing are your inputs; nothing here checks them against a span table or a
code. You are responsible for reviewing and verifying its output before relying
on it. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.`;

/** Accept "12' 6\\"" strings anywhere a length goes. */
function normalise(plan) {
  const L = (v) => (typeof v === "string" ? parseLength(v) : v);
  for (const k of ["studSpacing", "studLength", "kerf", "topPlateLap", "defaultHeaderHeight"]) if (k in plan) plan[k] = L(plan[k]);
  for (const s of plan.stock || []) s.length = L(s.length);
  for (const w of plan.walls || []) {
    w.length = L(w.length);
    w.tees = (w.tees || []).map(L);
    if (w.tee && "at" in w.tee) w.tee.at = L(w.tee.at);
    for (const o of w.openings || []) for (const k of ["offset", "width", "height", "headerHeight"]) if (k in o) o[k] = L(o[k]);
  }
  const base = samplePlan();
  for (const k of ["studSpacing", "studLength", "kerf", "topPlateLap", "cornerExtraStuds", "teeExtraStuds", "defaultHeaderHeight", "stock"]) if (!(k in plan)) plan[k] = base[k];
  return plan;
}

export function main(argv, readInput = (p) => readFileSync(p === "-" ? 0 : p, "utf8")) {
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const rimLap = Math.max(0, parseLength(argv.find((a) => a.startsWith("--rim-lap="))?.slice(10) ?? "0") || 0);
  if (flags.has("--help") || flags.has("-h")) return { code: 0, out: HELP };
  if (flags.has("--example")) return { code: 0, out: JSON.stringify(samplePlan(), null, 2) };
  if (!args.length) return { code: 2, out: HELP };
  let plan;
  try {
    plan = normalise(JSON.parse(readInput(args[0])));
  } catch (e) {
    return { code: 2, out: `Could not read the plan: ${e instanceof Error ? e.message : e}` };
  }
  let r = takeoff(plan);
  if (!r.ok) return { code: 1, out: `The plan has problems:\n${r.errors.map((e) => `  - ${e}`).join("\n")}` };
  if (flags.has("--sheathing") || flags.has("--horizontal") || flags.has("--overhang") || rimLap > 0 || plan.sheathing) {
    const sheathing = sheathe({ ...plan, sheathing: { ...defaultSheathing(), ...(plan.sheathing || {}), ...(flags.has("--horizontal") ? { orientation: "horizontal" } : {}), ...(flags.has("--overhang") ? { overhang: true } : {}), ...(rimLap > 0 ? { rimLap } : {}) } }, r);
    const extra = nailerCuts(sheathing);
    if (extra.length) r = takeoff(plan, extra); // nailers join the cut list and the lumber order
    r.sheathing = sheathing;
  }
  const sheathPsf = Math.max(0, parseFloat(argv.find((a) => a.startsWith("--sheathing-psf="))?.slice(16) ?? "0") || 0);
  const panelMax = Math.max(0, parseLength(argv.find((a) => a.startsWith("--panel-max="))?.slice(12) ?? "0") || 0);
  if (flags.has("--drawings") || panelMax > 0) return { code: 0, out: drawingSetHtml(r, plan, { panelMax, sheathPsf }).trimEnd() };
  if (flags.has("--json")) return { code: 0, out: JSON.stringify(r, null, 2) };
  if (flags.has("--csv")) return { code: 0, out: toCsv(r).trimEnd() };
  const s = r.summary;
  const lines = [];
  lines.push(`${s.walls} walls, ${s.wallFeet.toFixed(1)} ft of wall, ${s.pieces} pieces from ${s.boards} boards`);
  lines.push(`Order cost ${s.cost.toFixed(2)} (lower bound ${s.bound.toFixed(2)}, gap ${(100 * s.gap).toFixed(2)}%); every piece on its own board would cost ${s.naiveCost.toFixed(2)}`);
  lines.push(`Bought ${s.boughtFeet.toFixed(1)} ft for ${s.neededFeet.toFixed(1)} ft of pieces: ${(100 * s.waste).toFixed(1)}% offcut and kerf`);
  lines.push("", "ORDER");
  for (const o of r.orders) {
    for (const l of o.lines) lines.push(`  ${String(l.qty).padStart(4)}  ${o.size.padEnd(7)} ${formatLength(l.length).padEnd(10)} ${l.label}`);
    lines.push(`        ${o.size}: ${o.method}, cost ${o.cost.toFixed(2)}${o.proven ? ", proven cheapest" : ""}`);
  }
  lines.push("", "CUT LIST");
  for (const c of r.cuts) lines.push(`  ${String(c.qty).padStart(4)}  ${c.size.padEnd(7)} ${formatInches(c.length).padEnd(10)} ${c.kind}`);
  lines.push("", "LAYOUT MARKS (left edge of each member, from the wall start)");
  for (const w of r.walls) {
    const marks = w.members.filter((m) => m.orient === "v" && m.kind !== "cripple" && m.kind !== "jack").sort((a, b) => a.x - b.x);
    lines.push(`  ${w.id} (${formatLength(w.length)}): ${marks.map((m) => `${formatInches(m.x)}${m.kind === "stud" ? "" : ` ${m.kind[0].toUpperCase()}`}`).join(", ")}`);
  }
  lines.push("  K = king, C = corner backing, T = tee backing; jacks sit inside the kings.");
  if (r.sheathing) lines.push("", `SHEATHING (panels run ${r.sheathing.orientation === "horizontal" ? "horizontally, course by course from the floor" : "vertically from the wall start"}; lengths left to right)`, ...sheathingText(r.sheathing));
  if (r.notes.length) lines.push("", "NOTES", ...r.notes.map((n) => `  - ${n}`));
  lines.push("", "Header sizes and jack counts are your inputs and are not checked against a span table or code.");
  return { code: 0, out: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code, out } = main(process.argv.slice(2));
  (code ? process.stderr : process.stdout).write(out + "\n");
  process.exitCode = code;
}
