#!/usr/bin/env node
// node cli.mjs bids.csv [--unknown 0.5] [--json]   -- exit 1 when the lowest base bid is not the lowest leveled bid
import { readFileSync } from "node:fs";
import { parseBids, level, money } from "./calc.mjs";

const args = process.argv.slice(2);
const uAt = args.indexOf("--unknown");
const file = args.find((a, i) => !a.startsWith("--") && (uAt < 0 || i !== uAt + 1));
if (!file) { console.error("usage: node cli.mjs bids.csv [--unknown <weight 0-1>] [--json]"); process.exit(2); }
const parsed = parseBids(readFileSync(file, "utf8"));
if (parsed.error) { console.error(parsed.error); process.exit(2); }
const r = level(parsed, { unknownWeight: uAt >= 0 ? Number(args[uAt + 1]) : 1 });
if (r.error) { console.error(r.error); process.exit(2); }
if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
else {
  for (const b of r.ranked) console.log(`${b.rank}. ${b.name.padEnd(24)} base ${money(b.base).padStart(10)}  adds ${money(b.addTotal).padStart(9)}  leveled ${money(b.leveled).padStart(10)}`);
  console.log();
  for (const a of r.advice) console.log(`- ${a}`);
  for (const w of r.warnings) console.log(`! ${w}`);
}
process.exit(r.summary.rankChanged ? 1 : 0);
