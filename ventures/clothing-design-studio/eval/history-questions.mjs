// Questions and references to earlier versions through the studio's command
// parser. Sentences written by hand for this check (2026-11-17), not from a
// real designer. Each runs against one scripted session: a black tee with a
// halo, then cream, then a hoodie, then the halo moved down 3 cm, then 20% bigger,
// then navy, then screen print (so "the previous colour" is cream and "the
// original colour" is black).
//   node eval/history-questions.mjs [dir]   (dir: a copy of the venture, default this one)
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const { parseCommand } = await import(pathToFileURL(path.join(dir, "commands.mjs")));
const { newDesign, applyOp, History } = await import(pathToFileURL(path.join(dir, "design.mjs")));

function session() {
  let d = newDesign({ name: "Halo tee" });
  d = applyOp(d, { op: "add", kind: "motif", motif: "halo", label: "Sunburst halo", method: "high-density", colours: 1, w: 12 });
  const h = new History(d);
  for (const ops of [
    [{ op: "colour", value: "cream" }],
    [{ op: "garment", value: "hoodie" }],
    [{ op: "move", dx: 0, dy: 3 }],
    [{ op: "scale", factor: 1.2 }],
    [{ op: "colour", value: "navy" }],
    [{ op: "method", value: "screen" }],
  ]) h.apply(ops);
  return h;
}

// Run the utterance the way the page does and describe the end state.
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
  const d = h.present;
  const p = d.placements.find(q => q.id === d.selected) ?? d.placements.at(-1);
  return { d, p, r };
}

const base = run("").d;
const bp = base.placements.at(-1);
// [sentence, check(state) -> boolean, what is wanted]
const S = [
  // References to earlier versions.
  ["go back to the cream", ({ d }) => d.colourName === "cream" && d.garment === "hoodie" && d.placements[0].method === "screen", "cream, rest kept"],
  ["back to the cream one", ({ d }) => d.colourName === "cream" && d.garment === "hoodie", "cream, rest kept"],
  ["the cream was better", ({ d }) => d.colourName === "cream", "cream"],
  ["I preferred the cream", ({ d }) => d.colourName === "cream", "cream"],
  ["go back to the previous colour", ({ d }) => d.colourName === "cream" && d.placements[0].method === "screen", "cream, rest kept"],
  ["the previous colour was nicer", ({ d }) => d.colourName === "cream", "cream"],
  ["use the old colour", ({ d }) => d.colourName === "cream", "cream"],
  ["the original colour", ({ d }) => d.colourName === "black" && d.garment === "hoodie", "black, rest kept"],
  ["back to the tee", ({ d }) => d.garment === "tee" && d.colourName === "navy", "tee, rest kept"],
  ["switch back to a t-shirt", ({ d }) => d.garment === "tee", "tee"],
  ["go back to raised print", ({ p, d }) => p.method === "high-density" && d.colourName === "navy", "raised, rest kept"],
  ["the previous method", ({ p, d }) => p.method === "high-density" && d.colourName === "navy", "raised, rest kept"],
  ["back to the original size", ({ p, d }) => Math.abs(p.w - 12) < 0.01 && d.colourName === "navy", "12 cm, rest kept"],
  ["the old position was better", ({ p }) => p.y === bp.y - 3 && Math.abs(p.w - bp.w) < 0.01, "halo 3 cm higher again, size kept"],
  ["the other one", ({ p, d }) => p.method === "high-density" && d.colourName === "navy", "undo method only"],
  ["undo the last two", ({ d, p }) => d.colourName === "cream" && p.method === "high-density" && Math.abs(p.w - bp.w) < 0.01, "two steps back"],
  ["undo twice", ({ d }) => d.colourName === "cream", "two steps back"],
  ["go back three steps", ({ d, p }) => d.colourName === "cream" && Math.abs(p.w - 12) < 0.01, "three steps back"],
  ["back to the original", ({ d }) => d.colourName === "black" && d.garment === "tee", "first version"],
  ["start over", ({ d }) => d.colourName === "black" && d.garment === "tee", "first version"],
  // Suggestions asked as questions: tried.
  ["isn't navy better", ({ d }) => d.colourName === "navy", "navy (already)"],
  ["isn't cream better?", ({ d }) => d.colourName === "cream", "cream"],
  ["what about cream", ({ d }) => d.colourName === "cream", "cream"],
  ["how about a crewneck", ({ d }) => d.garment === "crewneck", "crewneck"],
  ["why not embroider it", ({ p }) => p.method === "embroidery", "embroidery"],
  ["could we try it in sage", ({ d }) => d.colourName === "sage", "sage"],
  ["wouldn't it look better in burgundy", ({ d }) => d.colourName === "burgundy", "burgundy"],
  ["would a tee be nicer", ({ d }) => d.garment === "tee", "tee"],
  ["maybe olive?", ({ d }) => d.colourName === "olive", "olive"],
  ["should we make it bigger", ({ p }) => p.w > bp.w + 0.1, "bigger"],
  // Questions for information: nothing changes, listed as questions.
  ["is embroidery more expensive?", ({ d, r }) => same(d) && r.questions.length === 1, "nothing changed"],
  ["how much does puff print cost", ({ d, r }) => same(d) && r.questions[0]?.topic === "cost", "nothing changed, cost"],
  ["what colours do you have", ({ d, r }) => same(d) && r.questions[0]?.topic === "colours", "nothing changed, colours"],
  ["does fleece work with embroidery?", ({ d, r }) => same(d) && r.questions.length === 1, "nothing changed"],
  ["which is cheaper, dtg or screen print?", ({ d }) => same(d), "nothing changed"],
  // Controls: orders that must still be obeyed as before.
  ["make it cream", ({ d }) => d.colourName === "cream", "cream"],
  ["can you make it cream", ({ d }) => d.colourName === "cream", "cream"],
  ["could you move it up a bit", ({ p }) => p.y === bp.y - 1, "up 1 cm"],
  ["undo", ({ p }) => p.method === "high-density", "one step back"],
  ["move it back to the front", ({ p }) => p.area === "front", "front"],
  ["do it in navy", ({ d }) => d.colourName === "navy", "navy"],
];
// Held out: written after refer.mjs was frozen for this run, not tuned on.
const HELD = [
  ["revert to the cream", ({ d }) => d.colourName === "cream" && d.garment === "hoodie", "cream, rest kept"],
  ["bring back the black", ({ d }) => d.colourName === "black" && d.garment === "hoodie", "black, rest kept"],
  ["change it back to cream please", ({ d }) => d.colourName === "cream", "cream"],
  ["the colour before was better", ({ d }) => d.colourName === "cream", "cream"],
  ["go back to the earlier size", ({ p }) => Math.abs(p.w - 12) < 0.01, "12 cm"],
  ["return to the first colour", ({ d }) => d.colourName === "black", "black"],
  ["undo the last 3 changes", ({ d, p }) => d.colourName === "cream" && Math.abs(p.w - 12) < 0.01, "three steps back"],
  ["take it back two steps", ({ d }) => d.colourName === "cream", "two steps back"],
  ["the hoodie looked better", ({ d }) => d.garment === "hoodie", "hoodie (already)"],
  ["what if we did it in white", ({ d }) => d.colourName === "white", "white"],
  ["how would it look in sand", ({ d }) => d.colourName === "sand", "sand"],
  ["wouldn't heavyweight cotton be better", ({ d }) => d.fabric === "heavyweight-cotton", "heavyweight (already)"],
  ["would linen work better", ({ d }) => d.fabric === "linen", "linen"],
  ["can we see it on the back", ({ p }) => p.area === "back", "back"],
  ["how about puff print", ({ p }) => p.method === "puff", "puff"],
  ["is linen more expensive than cotton?", ({ d }) => same(d), "nothing changed"],
  ["how long does embroidery take", ({ d }) => same(d), "nothing changed"],
  ["what does a hoodie cost to make", ({ d }) => same(d), "nothing changed"],
  ["are there other colours", ({ d }) => same(d), "nothing changed"],
  ["do you think it should be smaller", ({ p }) => p.w < bp.w - 0.1, "smaller"],
];
function same(d) {
  return JSON.stringify(d) === JSON.stringify(base);
}

function score(list, label) {
  let ok = 0;
  for (const [text, check, want] of list) {
    let pass = false; let note = "";
    try { const st = run(text); pass = !!check(st); note = st.r.steps.map(s => s.did).join(" | ") || (st.r.questions?.length ? `question (${st.r.questions[0].topic})` : st.r.unmatched.length ? "not understood" : "-"); }
    catch (e) { note = `error: ${e.message}`; }
    if (pass) ok++;
    console.log(`${pass ? "ok  " : "MISS"} ${label} ${JSON.stringify(text)} -> ${note}${pass ? "" : ` (want ${want})`}`);
  }
  return ok;
}
const a = score(S, "dev ");
const b = score(HELD, "held");
console.log(`\ndev set: ${a} of ${S.length} read right; held-out set: ${b} of ${HELD.length}`);
