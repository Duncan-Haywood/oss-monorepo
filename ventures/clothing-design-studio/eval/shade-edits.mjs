// Relative colour edits in the command box: "make it darker", "a bit more
// muted", "warmer ink", "lighten the halo". Sentences written by hand for this
// check (2026-11-19), not from a real designer. The held-out set
// (shade-heldout-2026-11-19.txt) was written before shade.mjs existed and was
// not tuned on; its checks below are the expectations written there, coded.
//
// Session: royal blue tee (#2648a6), a sunburst halo (selected) in the
// default pale gold ink the studio gives artwork on a dark garment.
//   node eval/shade-edits.mjs [dir]  (dir: a copy of the venture, default this one)
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const { parseCommand } = await import(pathToFileURL(path.join(dir, "commands.mjs")));
const { newDesign, applyOp, History } = await import(pathToFileURL(path.join(dir, "design.mjs")));
const { COLOURS } = await import(pathToFileURL(path.join(dir, "catalogue.mjs")));
const { toLab } = await import(pathToFileURL(path.join(dir, "separation.mjs")));

function start() {
  let d = newDesign({ name: "Halo tee" });
  d = applyOp(d, { op: "colour", value: "royal blue" });
  d = applyOp(d, { op: "add", kind: "motif", motif: "halo", label: "Sunburst halo", w: 12 });
  return d;
}
const START = start();

function run(text, from = START) {
  const h = new History(from);
  const r = parseCommand(text, h.present, [...h.past, h.present]);
  for (const step of r.steps) {
    for (const u of step.ui) if (u.ui === "undo") h.undo();
    if (step.ops.length) h.apply(step.ops);
  }
  return { d: h.present, r };
}

const lab = hex => { const n = parseInt(hex.slice(1), 16); return toLab((n >> 16) & 255, (n >> 8) & 255, n & 255); };
const L = hex => lab(hex)[0];
const C = hex => Math.hypot(...lab(hex).slice(1));
const W = hex => lab(hex)[2] + lab(hex)[1] / 2;
const hue = hex => (Math.atan2(lab(hex)[2], lab(hex)[1]) * 180) / Math.PI;
const hueKept = (a, b) => { const g = Math.abs(hue(a) - hue(b)) % 360; return (g > 180 ? 360 - g : g) <= 30; };
const ink = d => d.placements.find(p => p.motif === "halo").ink;
const g0 = START.colour; const i0 = ink(START);
const garmentOnly = d => ink(d) === i0;
const inkOnly = d => d.colour === g0;
const unchanged = d => JSON.stringify(d) === JSON.stringify(START);
const said = re => ({ r }) => r.steps.some(s => re.test(s.did ?? ""));

// The pre-registered set, in the file's order; each check is that line's expectation.
export const HELD = [
  ["make it darker", ({ d }) => L(d.colour) < L(g0) - 2 && hueKept(d.colour, g0) && garmentOnly(d)],
  ["a bit lighter please", ({ d }) => L(d.colour) > L(g0) + 2 && garmentOnly(d) && L(d.colour) < L(run("make the colour a lot lighter").d.colour)],
  ["make the shirt more muted", ({ d }) => C(d.colour) < C(g0) - 2 && Math.abs(L(d.colour) - L(g0)) <= 8 && garmentOnly(d)],
  ["can you make the halo darker", ({ d }) => L(ink(d)) < L(i0) - 2 && inkOnly(d)],
  ["warmer ink", ({ d }) => W(ink(d)) > W(i0) + 2 && inkOnly(d)],
  ["make the colour a lot lighter", ({ d }) => L(d.colour) >= L(g0) + 10 && garmentOnly(d)],
  ["the tee should be more vivid", ({ d }) => C(d.colour) > C(g0) + 2 && garmentOnly(d)],
  ["make the print brighter", ({ d }) => (C(ink(d)) > C(i0) + 2 || L(ink(d)) > L(i0) + 2) && inkOnly(d)],
  ["use a lighter fabric", ({ d }) => d.fabric === "cotton-jersey" && d.colour === g0],
  ["make it cooler", ({ d }) => W(d.colour) < W(g0) - 2 && garmentOnly(d)],
  ["darken the shirt slightly", ({ d }) => L(d.colour) < L(g0) - 2 && L(d.colour) > L(g0) - 10 && garmentOnly(d)],
  ["lighten the halo", ({ d }) => L(ink(d)) > L(i0) + 2 && inkOnly(d)],
  ["make the text darker", st => unchanged(st.d) && said(/no text/i)(st)],
  ["make it black", ({ d }) => d.colour === COLOURS.black],
];

// Dev: written while building.
const BLACK = applyOp(START, { op: "colour", value: "black" });
const GREY = applyOp(START, { op: "colour", value: "grey" });
export const S = [
  ["make it a lot darker", ({ d }) => L(d.colour) < L(run("make it darker").d.colour) - 2],
  ["make it a darker green", ({ d }) => L(d.colour) < L(COLOURS.green) - 2 && hueKept(d.colour, COLOURS.green)],
  ["tone it down", ({ d }) => C(d.colour) < C(g0) - 2],
  ["warm it up a bit", ({ d }) => W(d.colour) > W(g0) + 2],
  ["make the sun more muted", ({ d }) => C(ink(d)) < C(i0) - 2 && inkOnly(d)],
  ["paler ink", ({ d }) => L(ink(d)) > L(i0) + 2 && inkOnly(d)],
  ["make the shirt two shades darker", ({ d }) => L(d.colour) < L(run("make it darker").d.colour)],
  ["make it richer", ({ d }) => C(d.colour) > C(g0) + 2],
  ["make the colour more saturated", ({ d }) => C(d.colour) > C(g0) + 2],
  ["make it lighter", ({ d }) => L(d.colour) > L(g0) + 2 && d.fabric === START.fabric],
  ["the lighter cotton", ({ d }) => d.colour === g0],
  ["make it darker", st => unchanged(st.d) || L(st.d.colour) < L(BLACK.colour), BLACK],
  ["make it more vivid", ({ d }) => C(d.colour) > C(GREY.colour) + 2, GREY],
  ["when it was darker", ({ d }) => d.colour === g0, null],
  ["go back to the one where the halo was lighter", ({ d }) => d.colour === g0 && ink(d) === i0],
];

function score(list, label) {
  let ok = 0;
  for (const [text, check, from] of list) {
    let pass = false; let note = "";
    try { const st = run(text, from ?? START); pass = !!check(st); note = st.r.steps.map(s => s.did).join(" | ") || (st.r.unmatched.length ? "not understood" : "-"); }
    catch (e) { note = `error: ${e.message}`; }
    if (pass) ok++;
    console.log(`${pass ? "ok  " : "MISS"} ${label} ${JSON.stringify(text)} -> ${note}`);
  }
  return ok;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = score(S, "dev ");
  const b = score(HELD, "held");
  console.log(`\ndev set: ${a} of ${S.length}; held-out set: ${b} of ${HELD.length}`);
}
