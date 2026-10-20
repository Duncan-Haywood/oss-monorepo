#!/usr/bin/env node
// Zero-dependency CLI: explain why an AWS bill moved between two periods from
// the CSV Cost Explorer lets you download. No network call -- it reads only
// the file(s) you name.
//
//   node cli.mjs compare export.csv                       # last two period columns
//   node cli.mjs compare export.csv --before 2026-07-01 --after 2026-08-01
//   node cli.mjs compare july.csv august.csv              # one period each
//   node cli.mjs compare export.csv --after-days 12 --before-days 31   # partial month
//   node cli.mjs compare export.csv --max-increase-usd 500 --max-increase-pct 15
//
// Exit codes: 0 ok (or no gate set), 1 a --max-increase gate was exceeded,
// 2 a file or option could not be used.

import fs from "node:fs/promises";
import {
  parseCostExport, pickSides, compareBills, checkGate, summarize, periodDays,
  formatUsd, formatDelta, formatPct, HINTS_DATE,
} from "./engine.mjs";

export const DISCLAIMER =
  "Ranks and normalises the numbers in the file you gave it; it cannot see why a line moved. " +
  "Causes listed are a checklist, not a diagnosis. Not billing, financial or professional advice.";

const VALUE_OPTS = ["--before", "--after", "--before-days", "--after-days", "--min-delta", "--max-increase-usd", "--max-increase-pct", "--top"];

export function parseArgs(argv) {
  const args = { json: false, positional: [], errors: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") { args.json = true; continue; }
    if (a === "--help" || a === "-h") { args.help = true; continue; }
    const name = VALUE_OPTS.find((o) => a === o || a.startsWith(`${o}=`));
    if (name) {
      let v;
      if (a === name) {
        i += 1;
        if (i >= argv.length) { args.errors.push(`${name} needs a value`); continue; }
        v = argv[i];
      } else v = a.slice(name.length + 1);
      args.opts[name.slice(2)] = v;
    } else if (a.startsWith("--")) args.errors.push(`unknown option ${a}`);
    else if (!args.sub) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

const pad = (s, n) => String(s).padEnd(n);

export function renderHuman(report, sides, top = 10) {
  const t = report.totals;
  const lines = [summarize(report, sides), ""];
  lines.push(`  Before ${formatUsd(t.before)}   After ${formatUsd(t.after)}   Net ${formatDelta(t.delta)} (${formatPct(t.pct)})`);
  lines.push(`  Increases ${formatDelta(t.grossUp)}   Decreases ${formatDelta(t.grossDown)}`);
  lines.push("");
  const movers = report.lines.filter((l) => l.status !== "flat").slice(0, top);
  if (movers.length) {
    lines.push("Biggest movers:");
    for (const l of movers) {
      lines.push(`  ${pad(formatDelta(l.delta), 13)} ${pad(formatPct(l.pct), 9)} ${l.name}  [${l.status}]  ${formatUsd(l.before)} -> ${formatUsd(l.after)}`);
    }
    lines.push("");
  }
  const withHints = report.drivers.filter((d) => d.hint).slice(0, 5);
  if (withHints.length) {
    lines.push(`Things to check (checklist of common causes, ${HINTS_DATE}; not a diagnosis):`);
    for (const d of withHints) {
      lines.push(`  ${d.name}`);
      if (d.hint.note) lines.push(`    - ${d.hint.note}`);
      for (const c of d.hint.checks) lines.push(`    - ${c}`);
    }
    lines.push("");
  }
  const flat = report.lines.filter((l) => l.status === "flat").length;
  if (flat) lines.push(`${flat} line(s) moved less than ${formatUsd(report.minDelta)} and are not shown.`, "");
  return lines.join("\n");
}

const USAGE = `Usage:
  node cli.mjs compare <export.csv> [--before LABEL] [--after LABEL]
  node cli.mjs compare <before.csv> <after.csv>

Options:
  --before-days N / --after-days N   compare per-day rates (partial months)
  --min-delta USD                    treat smaller moves as flat (default 0.5)
  --top N                            how many movers to print (default 10)
  --max-increase-usd N               exit 1 if the net rise is above N
  --max-increase-pct N               exit 1 if the net rise is above N percent
  --json                             machine-readable output
`;

export async function run(argv, io = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) { io.out(USAGE); return args.help ? 0 : 2; }
  if (args.errors.length) { io.err(`${args.errors.join("; ")}\n`); return 2; }
  if (args.sub !== "compare" || args.positional.length < 1 || args.positional.length > 2) {
    io.err(USAGE); return 2;
  }
  try {
    const [a, b] = await Promise.all(args.positional.map((p) => fs.readFile(p, "utf8")));
    const expA = parseCostExport(a);
    const expB = b === undefined ? null : parseCostExport(b);
    const notes = [];
    for (const e of [expA, expB]) {
      for (const m of e ? e.mismatches : []) {
        notes.push(`Period ${m.period}: the rows add up to ${formatUsd(m.sum)} but the file's own total says ${formatUsd(m.stated)}. A row may have been cropped or filtered out.`);
      }
    }
    const sides = pickSides(expA, expB, { before: args.opts.before, after: args.opts.after });
    const beforeDays = args.opts["before-days"] ?? periodDays(sides.beforeLabel);
    const afterDays = args.opts["after-days"] ?? periodDays(sides.afterLabel);
    const report = compareBills(sides.before, sides.after, {
      beforeDays, afterDays, minDelta: args.opts["min-delta"],
    });
    const gate = checkGate(report, {
      maxIncreaseUsd: args.opts["max-increase-usd"] ?? null,
      maxIncreasePct: args.opts["max-increase-pct"] ?? null,
    });
    if (args.json) {
      io.out(`${JSON.stringify({ sides: { before: sides.beforeLabel, after: sides.afterLabel }, warnings: notes, report, gate, disclaimer: DISCLAIMER }, null, 2)}\n`);
    } else {
      io.out(renderHuman(report, sides, Number(args.opts.top) || 10));
      for (const n of notes) io.out(`WARNING: ${n}\n`);
      if (gate.exceeded) io.out(`GATE FAILED: ${gate.reasons.join("; ")}\n`);
      io.out(`${DISCLAIMER}\n`);
    }
    return gate.exceeded ? 1 : 0;
  } catch (err) {
    io.err(`${err.message}\n`);
    return 2;
  }
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
