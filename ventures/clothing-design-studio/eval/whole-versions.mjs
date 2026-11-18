// A whole earlier version picked out by what it had, through the studio's
// command parser: "the one with the halo", "the version without the text",
// "before I added the wings". Sentences written by hand for this check
// (2026-11-18), not from a real designer. The held-out set was written before
// the resolver (refer.mjs, describedVersion) existed and was not tuned on.
//
// One scripted session, versions oldest first:
//   0 black tee, sunburst halo on the front (raised print)
//   1 cream
//   2 the text "Ave Maria" added on the back
//   3 the halo removed
//   4 angel wings added on the front
//   5 hoodie
//   6 navy
//   7 the wings in puff print            <- the present
//   node eval/whole-versions.mjs [dir]   (dir: a copy of the venture, default this one)
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
    [{ op: "colour", value: "cream" }],
    [{ op: "add", kind: "text", text: "Ave Maria", area: "back" }],
    [{ op: "select", id: 1 }, { op: "remove" }],
    [{ op: "add", kind: "motif", motif: "wings", label: "Angel wings", area: "front" }],
    [{ op: "garment", value: "hoodie" }],
    [{ op: "colour", value: "navy" }],
    [{ op: "method", value: "puff" }],
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
const unchanged = is(7);
const has = (d, motif) => d.placements.some(p => p.motif === motif);

// [sentence, check, what is wanted]
const S = [
  ["the one with the halo", is(2), "version 2 (last with the halo)"],
  ["go back to the version with the halo", is(2), "version 2"],
  ["when it still had the halo", is(2), "version 2"],
  ["the one with the halo and the text", is(2), "version 2"],
  ["the one with the raised print", is(2), "version 2 (the halo was raised)"],
  ["the one without the text", is(1), "version 1"],
  ["the one without the wings", is(3), "version 3"],
  ["back to the version before the wings", is(3), "version 3"],
  ["before I added the wings", is(3), "version 3"],
  // Expected version 4 when first written; version 5 (cream hoodie, wings) is the later match, so the sentence was wrong, not the reader.
  ["the cream one with the wings", is(5), "version 5 (latest cream with the wings)"],
  ["the tee with the wings", is(4), "version 4"],
  ["the one where it was a tee with the wings", is(4), "version 4"],
  ["the one on the cream tee", is(4), "version 4"],
  ["the version before it was navy", is(5), "version 5"],
  ["the one before the hoodie", is(4), "version 4"],
  ["the one with the text on the back", unchanged, "nothing (this one has it)"],
  ["the one with the crown", unchanged, "nothing (never had one)"],
  // Controls: what refer.mjs and the parser already did must not change.
  ["go back to the cream", ({ d }) => d.colourName === "cream" && d.garment === "hoodie" && has(d, "wings"), "cream, rest kept"],
  ["add a halo", ({ d }) => has(d, "halo") && d.colourName === "navy", "a halo added"],
  ["the other one", ({ d }) => d.placements.find(p => p.motif === "wings").method !== "puff" && d.colourName === "navy", "method back only"],
  ["undo the last two", is(5), "two steps back"],
  ["start over", is(0), "first version"],
  ["the previous colour", ({ d }) => d.colourName === "cream" && d.garment === "hoodie", "cream, rest kept"],
];
// Held out: written before describedVersion existed; not tuned on.
const HELD = [
  ["can we go back to the one that had the halo", is(2), "version 2"],
  ["I liked the version with the sunburst better", is(2), "version 2"],
  ["the design without the wings was nicer", is(3), "version 3"],
  ["show me the one without any text", is(1), "version 1"],
  ["back to before we added the wings", is(3), "version 3"],
  ["the version where it was still a t-shirt", is(4), "version 4"],
  ["go back to when it had the halo", is(2), "version 2"],
  ["the one before we made it navy", is(5), "version 5"],
  ["revert to the version with the halo on the front", is(2), "version 2"],
  ["the one with the cross", unchanged, "nothing (never had one)"],
  ["the one with the wings", unchanged, "nothing (this one has them)"],
  ["the version without the halo", unchanged, "nothing (this one has none)"],
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
