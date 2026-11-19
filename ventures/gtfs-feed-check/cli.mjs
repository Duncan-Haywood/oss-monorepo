#!/usr/bin/env node
// Zero-dependency CLI: check GTFS Schedule feeds in a terminal or CI job.
// Feeds are read from disk and never sent anywhere; this tool makes no network calls.
//
//   node cli.mjs feed.zip                  # a zipped feed
//   node cli.mjs gtfs/                     # a folder of .txt files
//   node cli.mjs feed.zip --json
//   node cli.mjs feed.zip --strict         # warnings fail the run too
//   node cli.mjs feed.zip --today=2026-12-01   # judge expiry against another date
//
// Exit codes: 0 no errors, 1 findings at the failing level, 2 usage or read error.

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkFeed, findingsCsv } from "./calc.mjs";
import { feedTextsFromZip, isZip } from "./zip.mjs";

const HELP = `gtfs-feed-check: check a GTFS Schedule feed (zip or folder)

  node cli.mjs <feed.zip|folder>... [--json] [--csv] [--strict] [--today=YYYY-MM-DD]

  --json      machine-readable report
  --csv       findings as CSV
  --strict    warnings fail the run as well as errors
  --today     the date expiry is judged against (default: today, local time)

Exit codes: 0 no errors, 1 findings at the failing level, 2 usage or read error.
No warranty: findings are checks against the GTFS reference, not a promise that any app accepts the feed.`;

export function parseArgs(argv) {
  const a = { json: false, csv: false, strict: false, today: null, positional: [] };
  for (const x of argv) {
    if (x === "--json") a.json = true;
    else if (x === "--csv") a.csv = true;
    else if (x === "--strict") a.strict = true;
    else if (x.startsWith("--today=")) { a.today = x.slice(8).replace(/-/g, ""); if (!/^\d{8}$/.test(a.today)) a.unknown = x; }
    else if (x === "-h" || x === "--help") a.help = true;
    else if (x.startsWith("-")) a.unknown = x;
    else a.positional.push(x);
  }
  return a;
}

const defaults = {
  readFile: (p) => fs.readFile(p),
  stat: (p) => fs.stat(p),
  readdir: (p) => fs.readdir(p),
  out: (s) => process.stdout.write(s + "\n"),
  err: (s) => process.stderr.write(s + "\n"),
};

async function load(target, deps) {
  const st = await deps.stat(target);
  if (st.isDirectory()) {
    const texts = {};
    for (const name of (await deps.readdir(target)).sort()) if (/\.(txt|geojson)$/i.test(name)) texts[name] = new TextDecoder().decode(await deps.readFile(path.join(target, name)));
    return texts;
  }
  const bytes = new Uint8Array(await deps.readFile(target));
  if (!isZip(bytes)) throw new Error("not a zip file; pass a GTFS .zip or a folder of .txt files");
  return feedTextsFromZip(bytes);
}

export async function main(argv, overrides = {}) {
  const deps = { ...defaults, ...overrides };
  const a = parseArgs(argv);
  if (a.help) { deps.out(HELP); return 0; }
  if (a.unknown) { deps.err(`unknown or malformed option ${a.unknown}`); return 2; }
  if (!a.positional.length) { deps.err(HELP); return 2; }
  const reports = [];
  let failed = false;
  for (const t of a.positional) {
    let texts;
    try { texts = await load(t, deps); } catch (e) { deps.err(`${t}: ${e.message}`); return 2; }
    const r = checkFeed(texts, a.today ? { today: a.today } : {});
    reports.push({ feed: t, ...r });
    if (r.summary.errors || (a.strict && r.summary.warnings)) failed = true;
  }
  if (a.json) deps.out(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  else if (a.csv) for (const r of reports) deps.out(findingsCsv(r).trimEnd());
  else for (const r of reports) {
    const s = r.stats;
    deps.out(`${r.feed}: ${r.summary.errors} errors, ${r.summary.warnings} warnings, ${r.summary.infos} notes`);
    deps.out(`  ${s.agencies} agencies, ${s.routes} routes, ${s.trips} trips, ${s.stops} stops, ${s.stopTimes} stop times; service ${s.firstServiceDate ?? "-"} to ${s.lastServiceDate ?? "-"}`);
    for (const f of r.findings) {
      deps.out(`  ${f.severity.padEnd(7)} ${f.code} (${f.file}, ${f.count}x): ${f.message}`);
      for (const e of f.examples.slice(0, 3)) deps.out(`           ${e.line ? `line ${e.line}` : ""}${e.line && e.detail ? ": " : ""}${e.detail ?? ""}`);
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // `| head` closes the pipe early; that is not an error worth a stack trace.
  process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(process.exitCode ?? 0); else throw e; });
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
