#!/usr/bin/env node
// node cli.mjs incidents.csv [--tz -5] [--json]   -- exit 1 when someone is overloaded, usable as a CI/cron check
import { readFileSync } from "node:fs";
import { parseCsv, normalizeRows, analyze, humanHours } from "./calc.mjs";

const args = process.argv.slice(2);
const usage = "usage: node cli.mjs incidents.csv [--tz <utc offset hours, -12 to 14>] [--json]";
const tzAt = args.findIndex((a) => a === "--tz" || a.startsWith("--tz="));
const file = args.find((a, i) => !a.startsWith("--") && (tzAt < 0 || args[tzAt] !== "--tz" || i !== tzAt + 1));
if (!file) { console.error(usage); process.exit(2); }
// A --tz the CLI cannot read is refused: falling back to UTC would move every night page silently.
let tz = 0;
if (tzAt >= 0) {
  const raw = args[tzAt] === "--tz" ? args[tzAt + 1] : args[tzAt].slice("--tz=".length);
  tz = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(tz) || tz < -12 || tz > 14) { console.error(`--tz needs a UTC offset in hours from -12 to 14, got ${JSON.stringify(raw ?? "")}\n${usage}`); process.exit(2); }
}
const n = normalizeRows(parseCsv(readFileSync(file, "utf8")));
if (n.error) { console.error(n.error); process.exit(2); }
const r = analyze(n.incidents, { tzOffsetHours: tz });
if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
else {
  const s = r.summary;
  console.log(`${s.pages} pages, ${s.people} people, ${s.from} to ${s.to}; ${(s.nightShare * 100).toFixed(0)}% at night; ${(s.avoidableShare * 100).toFixed(0)}% avoidable (~${humanHours(s.avoidableHours)} of ${humanHours(s.hours)} interrupted)\n`);
  for (const p of r.people) console.log(`${p.overloaded ? "!" : " "} ${p.person.padEnd(20)} ${String(p.pages).padStart(4)} pages  ${String(p.night).padStart(3)} night  ${(p.share * 100).toFixed(0).padStart(3)}% of load`);
  console.log();
  for (const a of r.advice) console.log(`- ${a.text}`);
}
process.exit(r.people.some((p) => p.overloaded) ? 1 : 0);
