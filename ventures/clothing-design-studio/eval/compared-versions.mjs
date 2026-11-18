// A whole earlier version picked out by how it compared with this one:
// "the one where the halo was bigger", "when it was more expensive", "the
// version with the heavier fabric", "the cheapest one". Sentences written by
// hand for this check (2026-11-18), not from a real designer. The held-out set
// was written before the reader (refer.mjs, comparedVersion) existed and was
// not tuned on.
//
// One scripted session, versions oldest first:
//   0 black tee, sunburst halo on the front, 12 cm wide, 45 (price), 260 gsm
//   1 halo 20 cm wide
//   2 cream
//   3 the text "Ave Maria" added on the back
//   4 the halo moved up 4 cm
//   5 price 55
//   6 the halo 9 cm wide
//   7 fabric 180 gsm
//   8 price 39                             <- the present
//   node eval/compared-versions.mjs [dir]  (dir: a copy of the venture, default this one)
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const { parseCommand } = await import(pathToFileURL(path.join(dir, "commands.mjs")));
const { newDesign, applyOp, History } = await import(pathToFileURL(path.join(dir, "design.mjs")));

export function session() {
  let d = newDesign({ name: "Halo tee" });
  d = applyOp(d, { op: "add", kind: "motif", motif: "halo", label: "Sunburst halo", method: "high-density", colours: 1, w: 12 });
  const h = new History(d);
  for (const ops of [
    [{ op: "width", value: 20 }],
    [{ op: "colour", value: "cream" }],
    [{ op: "add", kind: "text", text: "Ave Maria", area: "back" }],
    [{ op: "select", id: 1 }, { op: "move", dy: -4 }],
    [{ op: "price", value: 55 }],
    [{ op: "select", id: 1 }, { op: "width", value: 9 }],
    [{ op: "gsm", value: 180 }],
    [{ op: "price", value: 39 }],
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
const unchanged = is(8);
const halo = d => d.placements.find(p => p.motif === "halo");

// [sentence, check, what is wanted]
const S = [
  ["the one where the halo was bigger", is(5), "version 5 (latest with the halo wider than 9 cm)"],
  ["the version with the bigger halo", is(5), "version 5"],
  ["when the halo was larger", is(5), "version 5"],
  ["the one where the halo was biggest", is(5), "version 5 (20 cm, latest of 1-5)"],
  ["the one where the halo was smaller", unchanged, "nothing (9 cm is the smallest)"],
  ["the one where the halo was lower", is(3), "version 3 (before the move up)"],
  ["the version where the print was higher", unchanged, "nothing (it is at its highest)"],
  ["when it was more expensive", is(7), "version 7 (55)"],
  ["the one where the price was higher", is(7), "version 7"],
  ["the most expensive version", is(7), "version 7"],
  ["the cheaper one", unchanged, "nothing (39 is the lowest)"],
  ["the one where the fabric was heavier", is(6), "version 6 (260 gsm)"],
  ["the version with the lighter fabric", unchanged, "nothing (180 is the lightest)"],
  ["the one where the text was smaller", unchanged, "nothing (the text never changed size)"],
  ["the one where the wings were bigger", unchanged, "nothing (never had wings)"],
  // Controls: edits and earlier readers must not change.
  ["make the halo bigger", ({ d }) => halo(d).w > 9 && d.price === 39, "an edit, not history"],
  ["make it cheaper", unchanged, "not understood before; still not a history reference"],
  ["the one with the text", unchanged, "nothing (this one has it)"],
  ["the previous size", ({ d }) => halo(d).w === 20 && d.price === 39, "size back only"],
  ["the one without the text", is(2), "version 2"],
];
// Held out: written before comparedVersion existed; not tuned on.
const HELD = [
  ["I liked it when the halo was bigger", is(5), "version 5"],
  ["go back to the version with the larger halo", is(5), "version 5"],
  ["the design where the halo sat lower", is(3), "version 3"],
  ["back to when the shirt cost more", is(7), "version 7"],
  ["the one where the fabric was thicker", is(6), "version 6"],
  ["can we go back to the version with the biggest halo", is(5), "version 5"],
  ["the one where the halo was a bit smaller", unchanged, "nothing (9 cm is the smallest)"],
  ["the version where the halo was further down", is(3), "version 3"],
  ["the cheapest one", unchanged, "nothing (this one is the cheapest)"],
  ["the one with the heavier fabric", is(6), "version 6"],
  ["when the text was bigger", unchanged, "nothing (the text never changed size)"],
  ["the one where the price was higher was better", is(7), "version 7"],
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
