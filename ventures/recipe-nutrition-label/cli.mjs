#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseRecipe, buildLabel, toText, toCsv, CSV_HEADER } from "./label.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!file || args.includes("--help")) {
  console.error(`usage: node cli.mjs recipe.csv --serving <grams> [--yield <finished grams>] [--serving-text "1 cookie"] [--name "..."] [--format text|csv|json]\n\nrecipe.csv columns (per 100 g): ${CSV_HEADER}\nPass - to read stdin. Not nutrition, legal or regulatory advice; verify before you print a label.`);
  process.exit(file ? 0 : 2);
}
try {
  const { ingredients, warnings } = parseRecipe(readFileSync(file === "-" ? 0 : file, "utf8"));
  const label = buildLabel(ingredients, { servingG: opt("serving"), yieldG: opt("yield"), servingText: opt("serving-text", ""), name: opt("name", "Recipe") });
  const all = [...warnings, ...label.warnings, ...label.allergenNotes];
  const fmt = opt("format", "text");
  if (!["text", "csv", "json"].includes(fmt)) throw new Error(`unknown format ${fmt}`);
  process.stdout.write(fmt === "json" ? JSON.stringify({ ...label, warnings: all }, null, 2) + "\n" : fmt === "csv" ? toCsv(label) : toText(label) + "\n");
  for (const w of all) console.error(`warning: ${w}`);
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
