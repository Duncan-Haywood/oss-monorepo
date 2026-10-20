#!/usr/bin/env node
// Replay recorded GPX files through the drive detector and print what it found.
//   node replay-gpx.mjs day1.gpx [day2.gpx ...] [--stopDwellMs=300000] [--startSpeed=4.5] ...
// Any DEFAULTS key can be overridden as --key=value, so thresholds can be
// compared on the same recording. Reads local files only; nothing is sent.
import { readFileSync } from "node:fs";
import { parseGpx } from "./src/gpx.mjs";
import { detectTrips, DEFAULTS } from "./src/tripdetect.mjs";

const files = [], options = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--(\w+)=(.+)$/);
  if (!m) { files.push(a); continue; }
  if (!(m[1] in DEFAULTS) || !Number.isFinite(Number(m[2]))) { console.error(`unknown option ${a}; keys: ${Object.keys(DEFAULTS).join(", ")}`); process.exit(2); }
  options[m[1]] = Number(m[2]);
}
if (!files.length) { console.error("usage: node replay-gpx.mjs file.gpx [...] [--key=value]"); process.exit(2); }

let total = 0;
for (const f of files) {
  const fixes = parseGpx(readFileSync(f, "utf8"));
  const trips = detectTrips(fixes, options);
  console.log(`${f}: ${fixes.length} fixes, ${trips.length} drive(s)`);
  for (const t of trips) {
    const mins = Math.round((t.endedAt - t.startedAt) / 60e3);
    console.log(`  ${new Date(t.startedAt).toISOString()}  ${t.miles.toFixed(1)} mi  ${mins} min`);
    total += t.miles;
  }
}
console.log(`total ${total.toFixed(2)} mi (options: ${JSON.stringify(options)})`);
