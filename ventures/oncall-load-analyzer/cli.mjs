#!/usr/bin/env node
// node cli.mjs incidents.csv [--tz -5] [--json]   -- exit 1 when someone is overloaded, usable as a CI/cron check
import { readFileSync } from "node:fs";
import { parseCsv, normalizeRows, analyze, humanHours } from "./calc.mjs";

const args = process.argv.slice(2);
const tzAt = args.indexOf("--tz");
const file = args.find((a, i) => !a.startsWith("--") && (tzAt < 0 || i !== tzAt + 1));
if (!file) { console.error("usage: node cli.mjs incidents.csv [--tz <utc offset hours>] [--json]"); process.exit(2); }
const n = normalizeRows(parseCsv(readFileSync(file, "utf8")));
if (n.error) { console.error(n.error); process.exit(2); }
const tz = tzAt >= 0 ? Number(args[tzAt + 1]) : 0;
const r = analyze(n.incidents, { tzOffsetHours: Number.isFinite(tz) ? tz : 0 });
if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
else {
  const s = r.summary;
  console.log(`${s.pages} pages, ${s.people} people, ${s.from} to ${s.to}; ${(s.nightShare * 100).toFixed(0)}% at night; ${(s.avoidableShare * 100).toFixed(0)}% avoidable (~${humanHours(s.avoidableHours)} of ${humanHours(s.hours)} interrupted)\n`);
  for (const p of r.people) console.log(`${p.overloaded ? "!" : " "} ${p.person.padEnd(20)} ${String(p.pages).padStart(4)} pages  ${String(p.night).padStart(3)} night  ${(p.share * 100).toFixed(0).padStart(3)}% of load`);
  console.log();
  for (const a of r.advice) console.log(`- ${a.text}`);
}
process.exit(r.people.some((p) => p.overloaded) ? 1 : 0);
