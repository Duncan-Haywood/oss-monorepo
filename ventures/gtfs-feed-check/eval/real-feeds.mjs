#!/usr/bin/env node
// Runs the checker over real published GTFS feeds and prints a Markdown
// summary. The feeds are not committed (their licences differ); fetch them
// yourself and pass the paths, labelled:
//
//   node eval/real-feeds.mjs --today=2026-11-19 "BART=bart.zip" "TriMet=trimet.zip"
//
// Prints, per feed: size, counts, service window, and every finding with its
// count and first example.

import { readFileSync, statSync } from "node:fs";
import { checkFeed } from "../calc.mjs";
import { feedTextsFromZip } from "../zip.mjs";

const args = process.argv.slice(2);
const today = (args.find((a) => a.startsWith("--today=")) || "").slice(8).replace(/-/g, "") || undefined;
for (const a of args.filter((x) => !x.startsWith("--"))) {
  const [label, path] = a.includes("=") ? a.split(/=(.*)/s) : [a, a];
  const t0 = performance.now();
  const r = checkFeed(await feedTextsFromZip(new Uint8Array(readFileSync(path))), { today });
  const ms = Math.round(performance.now() - t0);
  const s = r.stats;
  console.log(`### ${label}\n`);
  console.log(`${(statSync(path).size / 1e6).toFixed(1)} MB zipped; ${s.agencies} agencies, ${s.routes} routes, ${s.trips.toLocaleString("en")} trips, ${s.stops.toLocaleString("en")} stops, ${s.stopTimes.toLocaleString("en")} stop times; service ${s.firstServiceDate} to ${s.lastServiceDate}, ${s.daysWithServiceNext30} of the next 30 days; checked in ${ms} ms.`);
  console.log(`\n${r.summary.errors} errors, ${r.summary.warnings} warnings, ${r.summary.infos} notes.\n`);
  console.log("| severity | code | file | count | first example |\n|---|---|---|---|---|");
  for (const f of r.findings) {
    const e = f.examples[0];
    const ex = e ? `${e.line ? `line ${e.line}` : ""}${e.line && e.detail ? ": " : ""}${e.detail ?? ""}` : "";
    console.log(`| ${f.severity} | \`${f.code}\` | ${f.file} | ${f.count.toLocaleString("en")} | ${ex.replace(/\|/g, "\\|")} |`);
  }
  console.log("");
}
