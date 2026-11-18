// Negated feedback through the studio's command parser and the wardrobe chat.
// Sentences written by hand for this check (2026-11-17), not from a real
// designer; each lists what the parser should do and nothing else.
//   node eval/negated-feedback.mjs [dir]   (dir: a copy of the venture to test, default this one)
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const { parseCommand } = await import(pathToFileURL(path.join(dir, "commands.mjs")));
const { listen } = await import(pathToFileURL(path.join(dir, "guide.mjs")));

const sum = o => o.op + (o.value !== undefined ? ":" + o.value : o.factor !== undefined ? ":" + (o.factor > 1 ? "up" : "down") : o.op === "move" ? `:${Math.sign(o.dx)},${Math.sign(o.dy)}` : "");

// [sentence, expected ops (sorted summaries)]
export const STUDIO = [
  ["not black, make it cream", ["colour:cream"]],
  ["make it white not black", ["colour:white"]],
  ["no embroidery, screen print it", ["method:screen"]],
  ["don't make it bigger", []],
  ["don't make it bigger, make it smaller", ["scale:down"]],
  ["switch to a hoodie instead of a tee", ["garment:hoodie"]],
  ["no, make it white", ["colour:white"]],
  ["not black but cream", ["colour:cream"]],
  ["don't move it, just make it bigger", ["scale:up"]],
  ["not on the back, put it on the front", ["area:front"]],
  ["no puff print", []],
  ["I don't want it on the sleeve", []],
  ["use organic cotton, not polyester", ["fabric:organic-cotton"]],
  ["never use fleece", []],
  ["navy rather than black", ["colour:navy"]],
  ["don't rotate it", []],
  ["move it up, not down", ["move:0,-1"]],
  ["without embroidery", []],
  ["not a hoodie, a crewneck", ["garment:crewneck"]],
  ["it shouldn't be red", []],
  ["dtg not screen print", ["method:dtg"]],
  ["anything but white", []],
  ["make it bigger but not too much", ["scale:up"]],
  ["isn't navy better", ["colour:navy"]],
  // Controls: no negation, or words that only look negative.
  ["add the text \"No Fear\"", ["add"]],
  ["call it Not Today", ["name:not today"]],
  ["never mind", []],
  ["make it cream", ["colour:cream"]],
  ["move the print up a bit", ["move:0,-1"]],
  ["make 150 pieces and sell them for 55 euros", ["price:55", "quantity:150"]],
];
// isn't navy better: the reader reads "isn't" as a negation of "navy better"; listed as a known miss.
const KNOWN_HARD = new Set(["isn't navy better"]);

export const WARDROBE = [
  ["nothing cheap, good quality", { tier: "premium" }],
  ["not for men", { fit: "unisex" }],
  ["for women, not too formal", { fit: "womens", style: "statement" }],
  ["no harsh winters, mild", { climate: "temperate" }],
  ["not office, weekends", { occasions: ["casual"] }],
  ["not luxury", { tier: "premium" }],
  ["not streetwear, classic", { style: "classic" }],
  ["women, no evening wear", { fit: "womens", occasions: ["casual"] }],
  ["not for students, around 40", { ageBand: "35-44" }],
  ["not just for men, women too", { fit: "unisex" }],
  ["warm climate, never cold", { climate: "warm" }],
  ["minimal, nothing bold", { style: "minimal" }],
];

let ok = 0, n = 0;
const rows = [];
for (const [s, want] of STUDIO) {
  const r = parseCommand(s);
  const got = r.steps.flatMap(st => st.ops.map(sum)).map(x => x.toLowerCase()).sort();
  const pass = JSON.stringify(got) === JSON.stringify([...want].sort());
  n++; if (pass) ok++;
  rows.push(`${pass ? "ok  " : "MISS"} studio   ${JSON.stringify(s)} -> ${JSON.stringify(got)}${pass ? "" : ` (want ${JSON.stringify(want)})`}${KNOWN_HARD.has(s) ? " [hard]" : ""}`);
}
let okW = 0;
for (const [s, want] of WARDROBE) {
  const r = listen(s);
  const pass = Object.entries(want).every(([k, v]) => JSON.stringify(Array.isArray(v) ? [...r.profile[k]].sort() : r.profile[k]) === JSON.stringify(Array.isArray(v) ? [...v].sort() : v));
  if (pass) okW++;
  rows.push(`${pass ? "ok  " : "MISS"} wardrobe ${JSON.stringify(s)} -> ${JSON.stringify(Object.fromEntries(Object.keys(want).map(k => [k, r.profile[k]])))}`);
}
console.log(rows.join("\n"));
console.log(`\nstudio: ${ok} of ${n} read right; wardrobe chat: ${okW} of ${WARDROBE.length}`);
