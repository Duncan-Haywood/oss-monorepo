#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseQuote, renderText, compareQuotes, range, money, EXAMPLE } from "./funeral.mjs";

const args = process.argv.slice(2);
const read = (p) => readFileSync(p === "-" ? 0 : p, "utf8");

try {
  if (args.includes("--example")) {
    console.log(renderText(parseQuote(EXAMPLE)));
  } else if (args[0] === "--compare" && args[1] && args[2]) {
    const c = compareQuotes(parseQuote(read(args[1])), parseQuote(read(args[2])));
    console.log(`A ${range(c.totalA)}   B ${range(c.totalB)}   A minus B ${money(c.diffLow)} (low ends)\n`);
    for (const r of c.rows) console.log(`${r.category.padEnd(26)} A ${(r.a ? range(r.a) : "not listed").padEnd(16)} B ${r.b ? range(r.b) : "not listed"}`);
  } else if (args[0]) {
    console.log(renderText(parseQuote(read(args[0]))));
  } else {
    throw new Error("Usage: node cli.mjs quote.txt | node cli.mjs --compare a.txt b.txt | node cli.mjs --example   (use - to read stdin)");
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
