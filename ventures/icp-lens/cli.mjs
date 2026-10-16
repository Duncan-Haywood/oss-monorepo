#!/usr/bin/env node
// Rank a prospect list from a terminal: node cli.mjs leads.csv [--rules rules.txt] > ranked.json
// CSV in, JSON out. Nothing is uploaded; no key is needed.
import fs from "node:fs";
import { analyze, applyRules } from "./engine.mjs";

const args = process.argv.slice(2), file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--rules");
const ri = args.indexOf("--rules");
if (!file) { console.error("usage: node cli.mjs leads.csv [--rules rules.txt]"); process.exit(2); }
const text = fs.readFileSync(file, "utf8");
try {
  const r = ri >= 0 ? applyRules(text, fs.readFileSync(args[ri + 1], "utf8")) : analyze(text);
  if (r.note) console.error(r.note);
  for (const e of r.errors || []) console.error(e);
  console.log(JSON.stringify(r, (k, v) => (k === "raw" ? undefined : v), 2));
} catch (e) { console.error(e.message); process.exit(1); }
