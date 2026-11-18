// A whole earlier version picked out by how its colours compared with this
// one: "when it was darker", "the one where the halo was lighter", "when the
// print was more muted", "the warmest shirt". Sentences written by hand for
// this check (2026-11-18), not from a real designer. The held-out set was
// written before the reader (refer.mjs, colourComparison) existed and was not
// tuned on.
//
// One scripted session, versions oldest first (CIELAB of the screen hex):
//   0 black tee (L 10), sunburst halo in pale gold ink (L 84, C 35), 45, 260 gsm
//   1 cream garment (L 91)
//   2 halo ink navy (L 17, C 17)
//   3 sage garment (L 70)
//   4 halo ink red (L 40, C 61)
//   5 navy garment (L 17)
//   6 price 50                             <- the present
//   node eval/colour-versions.mjs [dir]  (dir: a copy of the venture, default this one)
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const { parseCommand } = await import(pathToFileURL(path.join(dir, "commands.mjs")));
const { newDesign, applyOp, History } = await import(pathToFileURL(path.join(dir, "design.mjs")));
const { COLOURS } = await import(pathToFileURL(path.join(dir, "catalogue.mjs")));

export function session() {
  let d = newDesign({ name: "Halo tee" });
  d = applyOp(d, { op: "add", kind: "motif", motif: "halo", label: "Sunburst halo", method: "high-density", colours: 1, w: 12 });
  const h = new History(d);
  for (const ops of [
    [{ op: "colour", value: "cream" }],
    [{ op: "select", id: 1 }, { op: "ink", value: "navy" }],
    [{ op: "colour", value: "sage" }],
    [{ op: "select", id: 1 }, { op: "ink", value: "red" }],
    [{ op: "colour", value: "navy" }],
    [{ op: "price", value: 50 }],
  ]) h.apply(ops);
  return h;
}
const LINE = (() => { const h = session(); return [...h.past, h.present]; })();

function run(text) {
  const h = session();
  const r = parseCommand(text, h.present, [...h.past, h.present]);
  for (const step of r.steps) {
    for (const u of step.ui) {
      if (u.ui === "undo") for (let i = 0; i < (u.count ?? 1); i++) h.undo();
      else if (u.ui === "redo") h.redo();
      else if (u.ui === "restore") h.replace(h.past.concat([h.present])[u.index]);
    }
    if (step.ops.length) h.apply(step.ops);
  }
  return { d: h.present, r, h };
}
const is = i => ({ d }) => JSON.stringify(d) === JSON.stringify(LINE[i]);
const PRESENT = LINE.length - 1;
const unchanged = is(PRESENT);
const halo = d => d.placements.find(p => p.motif === "halo");

// Held out: written before the reader existed; not tuned on.
export const HELD = [
  ["when it was darker", is(0), "version 0 (black, the only darker garment)"],
  ["the one where the shirt was lighter", is(4), "version 4 (sage, latest lighter garment)"],
  ["I liked it when the tee was lighter", is(4), "version 4"],
  ["the version with the lightest shirt", is(2), "version 2 (cream, latest of 1-2)"],
  ["the darkest one", is(0), "version 0"],
  ["when the halo was darker", is(3), "version 3 (navy ink)"],
  ["the one where the halo was lighter", is(1), "version 1 (pale gold ink, latest)"],
  ["go back to when the print was more muted", is(3), "version 3 (navy ink, less vivid than red)"],
  ["the one where the halo was brighter", unchanged, "nothing (red is the most vivid ink it had)"],
  ["when the colour was lighter", is(4), "version 4 (garment colour)"],
  ["the version with the darker print", is(3), "version 3"],
  ["the one with the lighter fabric", unchanged, "nothing: fabric weight, never lighter than 260"],
];
// Dev: written after, while building.
export const S = [
  ["the one where the shirt was darker", is(0), "version 0"],
  ["when the garment was paler", is(4), "version 4 (sage)"],
  ["the one with the palest shirt", is(2), "version 2 (cream)"],
  ["when the halo was more colourful", unchanged, "nothing (red is the most vivid)"],
  ["the one where the halo was duller", is(3), "version 3"],
  ["the version with the most muted print", is(3), "version 3 (navy ink, C 17; gold C 35)"],
  ["when the shirt was warmer", is(4), "version 4 (sage is warmer than navy)"],
  ["the coolest shirt", unchanged, "nothing (navy is the coolest)"],
  ["the one where the halo was cooler", is(3), "version 3 (navy ink)"],
  ["when the ink was lighter", is(1), "version 1"],
  ["the one where the text was darker", unchanged, "nothing (no text in this session)"],
  // Controls: edits and earlier readers must not change.
  ["make it darker", ({ d }) => !is(0)({ d }), "an edit or nothing, not a history jump"],
  ["make the halo lighter", ({ d }) => d.price === 50, "an edit on the present, not history"],
  ["the previous colour", ({ d }) => d.colour === COLOURS.sage && d.price === 50, "garment colour back only"],
  ["when it was more expensive", unchanged, "nothing (50 is the highest)"],
  ["the one with the heavier fabric", unchanged, "nothing (260 throughout)"],
];

function score(list, label) {
  let ok = 0;
  for (const [text, check, want] of list) {
    let pass = false; let note = "";
    try { const st = run(text); pass = !!check(st); note = st.r.steps.map(s => s.did).join(" | ") || (st.r.unmatched.length ? "not understood" : "-"); }
    catch (e) { note = `error: ${e.message}`; }
    if (pass) ok++;
    console.log(`${pass ? "ok  " : "MISS"} ${label} ${JSON.stringify(text)} -> ${note}${pass ? "" : ` (want ${want})`}`);
  }
  return ok;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = score(S, "dev ");
  const b = score(HELD, "held");
  console.log(`\ndev set: ${a} of ${S.length} read right; held-out set: ${b} of ${HELD.length}`);
}
