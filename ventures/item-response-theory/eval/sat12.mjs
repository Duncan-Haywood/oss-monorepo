// Analyse SAT12 (eval/sat12.py makes the CSV) with the documented key and
// with item 32 rescored to the answer the distractor table points at, and
// save what the post and the page quote.
import { readFileSync, writeFileSync } from "node:fs";
import { analyze } from "../engine.mjs";

const text = readFileSync(process.argv[2], "utf8");
const pick = (r) => ({
  model: r.model,
  n: r.n,
  lr: r.comparison.lr, lrDf: r.comparison.df,
  marginalReliability: r.marginalReliability,
  flaggedItems: r.itemTable.filter((i) => i.flags.length).map((i) => ({ item: i.item, flags: i.flags, a: i.a, b: i.b, itemRest: i.itemRest })),
  distractorFlags: r.distractors.filter((d) => d.flagged.length).map((d) => ({ item: d.item, key: d.key, flagged: d.flagged, strongest: d.strongest, options: d.options })),
  item32: r.itemTable[31],
});
const original = analyze({ text });
const key = text.split("\n")[1].split(",").slice(1);
key[31] = original.distractors[31].strongest;
const rescored = analyze({ text, key });
const out = { source: "mirt SAT12 via eval/sat12.py", original: pick(original), rescoredItem32To: key[31], rescored: pick(rescored) };
writeFileSync(new URL("./sat12.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify({ o: out.original.item32, r: out.rescored.item32, oRel: out.original.marginalReliability, rRel: out.rescored.marginalReliability, dflags: out.original.distractorFlags.map((d) => [d.item, d.flagged, d.strongest]) }, null, 1));
