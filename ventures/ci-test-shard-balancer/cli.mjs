#!/usr/bin/env node
// Zero-dependency CLI: split a test suite into balanced CI shards from the
// per-test timings in JUnit XML reports. No network call, no model -- it reads
// only the file(s) you name and gives the same answer on every run.
//
//   node cli.mjs split junit.xml --shards 4 --setup-seconds 60
//   node cli.mjs split shard-*.xml --current-from-reports        # each file = today's shard
//   node cli.mjs split junit.xml --shards 6 --group test --matrix
//   node cli.mjs split junit.xml --shards 4 --max-imbalance-pct 20   # gate for CI
//
// Exit codes: 0 ok (or no gate set), 1 the --max-imbalance-pct gate was
// exceeded, 2 a file or option could not be used.

import fs from "node:fs/promises";
import {
  analyze, parseJUnit, matrixOf, formatSeconds, formatMinutes, formatPct, summarize,
  GROUPS, DIALECTS, DISCLAIMER,
} from "./engine.mjs";

export { DISCLAIMER };

const VALUE_OPTS = [
  "--shards", "--setup-seconds", "--group", "--format", "--target-seconds",
  "--max-shards", "--runs-per-month", "--max-imbalance-pct",
];
const FLAG_OPTS = ["--json", "--matrix", "--current-from-reports", "--help"];

export function parseArgs(argv) {
  const args = { json: false, matrix: false, currentFromReports: false, positional: [], errors: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "-h") { args.help = true; continue; }
    if (FLAG_OPTS.includes(a)) {
      if (a === "--json") args.json = true;
      else if (a === "--matrix") args.matrix = true;
      else if (a === "--help") args.help = true;
      else args.currentFromReports = true;
      continue;
    }
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

const num = (v, name, { int = false, min = 0 } = {}) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || (int && !Number.isInteger(n))) {
    throw new Error(`${name} must be ${int ? "a whole number" : "a number"} of ${min} or more`);
  }
  return n;
};

const pad = (s, n) => String(s).padEnd(n);
const bar = (frac, width = 24) => "#".repeat(Math.max(0, Math.min(width, Math.round(frac * width))));

export function renderHuman(r) {
  const out = [summarize(r), ""];
  out.push(`Dialect: ${r.dialect}   Group: ${r.group}   Shards: ${r.n}   Setup per shard: ${formatSeconds(r.setupSeconds)}`);
  out.push(`Ideal shard (total / N): ${formatSeconds(r.idealSeconds)}   Longest single unit: ${formatSeconds(r.floorSeconds)}`);
  out.push("");
  out.push(`Current split (${r.current.label}):`);
  const scale = Math.max(r.current.max, r.balanced.max) || 1;
  for (const s of r.current.shards) out.push(`  shard ${pad(s.index, 3)} ${pad(formatSeconds(s.seconds), 10)} ${bar(s.seconds / scale)}`);
  out.push(`  slowest ${formatSeconds(r.current.max)}  wall-clock ${formatSeconds(r.current.wall)}  billed ${formatMinutes(r.current.billedMinutes)}  imbalance ${formatPct(r.current.imbalancePct)}`);
  out.push("");
  out.push(`Balanced split (${r.balanced.method}${r.balanced.optimal ? "; optimal for this timing data" : "; heuristic, not proven optimal"}):`);
  for (const s of r.balanced.shards) out.push(`  shard ${pad(s.index, 3)} ${pad(formatSeconds(s.seconds), 10)} ${bar(s.seconds / scale)}  ${s.units.length} unit(s)`);
  out.push(`  slowest ${formatSeconds(r.balanced.max)}  wall-clock ${formatSeconds(r.balanced.wall)}  billed ${formatMinutes(r.balanced.billedMinutes)}  imbalance ${formatPct(r.balanced.imbalancePct)}`);
  out.push("");
  const sv = r.savings;
  out.push(`Projected saving per CI run: ${formatSeconds(sv.wallSeconds)} wall-clock (${formatPct(sv.wallPct)}), ${formatMinutes(sv.billedMinutes)} billed (${formatPct(sv.billedPct)}).`);
  if (sv.monthlyBilledMinutes !== null) out.push(`Over ${r.runsPerMonth ?? "the given number of"} runs a month: ${formatMinutes(sv.monthlyBilledMinutes)} billed.`);
  out.push("Billed minutes = shards x (slowest shard + setup), the conservative model: shards that finish early are billed less in practice.");
  out.push("");
  if (r.bottlenecks.length) {
    out.push("Indivisible bottlenecks (longer than the ideal shard):");
    for (const b of r.bottlenecks.slice(0, 5)) out.push(`  ${formatSeconds(b.seconds)}  ${formatPct(b.pctOfIdeal)} of ideal  ${b.key}${b.splittable ? `  (${b.tests} tests; try --group test)` : ""}`);
    out.push("");
  }
  out.push("Shard count sweep (balanced):");
  out.push(`  ${pad("N", 4)}${pad("slowest", 12)}${pad("wall-clock", 12)}${pad("billed", 12)}imbalance`);
  for (const row of r.sweep) {
    out.push(`  ${pad(row.n, 4)}${pad(formatSeconds(row.max), 12)}${pad(formatSeconds(row.wall), 12)}${pad(formatMinutes(row.billedMinutes), 12)}${formatPct(row.imbalancePct)}${r.recommendation && row.n === r.recommendation.n ? "   <- suggested" : ""}`);
  }
  if (r.recommendation) out.push(`  ${r.recommendation.n ? `Suggested N = ${r.recommendation.n}. ` : ""}${r.recommendation.note}`);
  out.push("");
  out.push("Shard commands:");
  for (const s of r.balanced.shards) {
    out.push(`  # shard ${s.index}: ${formatSeconds(s.seconds)}, ${s.units.length} unit(s)`);
    out.push(`  ${s.emit.command || "(empty shard)"}`);
    if (s.emit.altCommand) out.push(`  # gradle: ${s.emit.altCommand}`);
  }
  out.push("");
  for (const w of r.warnings) out.push(`WARNING: ${w}`);
  if (r.warnings.length) out.push("");
  return out.join("\n");
}

const USAGE = `Usage:
  node cli.mjs split <junit.xml> [more.xml ...] [options]

Reads per-test timings from JUnit XML (pytest, Jest via jest-junit, Go via
gotestsum, Maven/Gradle, RSpec) and splits them into balanced CI shards.

Options:
  --shards N                  number of shards to balance into (default 4)
  --setup-seconds S           fixed setup per shard job: checkout, install (default 0)
  --group file|class|test     what counts as one schedulable unit (default file)
  --format auto|pytest|jest|go|java|rspec   force the report dialect (default auto)
  --current-from-reports      treat each report file as one of today's shards
  --target-seconds S          suggest the cheapest N whose wall-clock fits S
  --max-shards N              largest N the sweep tries (default 32)
  --runs-per-month N          also print the monthly billed-minutes saving
  --max-imbalance-pct P       exit 1 if the CURRENT split's slowest shard is more
                              than P percent over the ideal shard
  --matrix                    print only a GitHub Actions matrix JSON
  --json                      machine-readable output
Exit codes: 0 ok, 1 gate exceeded, 2 unusable file or option.
`;

export async function run(argv, io = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) { io.out(USAGE); return args.help ? 0 : 2; }
  if (args.errors.length) { io.err(`${args.errors.join("; ")}\n`); return 2; }
  if (args.sub !== "split" || args.positional.length < 1) { io.err(USAGE); return 2; }
  try {
    const group = args.opts.group ?? "file";
    if (!GROUPS.includes(group)) throw new Error(`--group must be one of ${GROUPS.join(", ")}`);
    const format = args.opts.format ?? "auto";
    if (format !== "auto" && !DIALECTS.includes(format)) throw new Error(`--format must be auto or one of ${DIALECTS.join(", ")}`);
    const opts = {
      shards: num(args.opts.shards, "--shards", { int: true, min: 1 }) ?? 4,
      setupSeconds: num(args.opts["setup-seconds"], "--setup-seconds") ?? 0,
      group, dialect: format,
      currentFromReports: args.currentFromReports,
      targetSeconds: num(args.opts["target-seconds"], "--target-seconds") ?? null,
      maxShards: num(args.opts["max-shards"], "--max-shards", { int: true, min: 1 }) ?? 32,
      runsPerMonth: num(args.opts["runs-per-month"], "--runs-per-month") ?? null,
      maxImbalancePct: num(args.opts["max-imbalance-pct"], "--max-imbalance-pct") ?? null,
    };
    if (args.currentFromReports && args.opts.shards === undefined && args.positional.length > 1) opts.shards = args.positional.length;
    const texts = await Promise.all(args.positional.map((p) => fs.readFile(p, "utf8")));
    const reports = texts.map((t, i) => parseJUnit(t, i));
    const report = analyze(reports, opts);
    report.runsPerMonth = opts.runsPerMonth;
    if (args.matrix) io.out(`${JSON.stringify(matrixOf(report))}\n`);
    else if (args.json) io.out(`${JSON.stringify({ ...report, matrix: matrixOf(report) }, null, 2)}\n`);
    else {
      io.out(renderHuman(report));
      if (report.gate) io.out(report.gate.exceeded
        ? `GATE FAILED: the current split's slowest shard is ${formatPct(report.gate.imbalancePct)} over the ideal shard, above --max-imbalance-pct ${report.gate.maxImbalancePct}.\n`
        : `Gate ok: the current split is ${formatPct(report.gate.imbalancePct)} over the ideal shard (limit ${report.gate.maxImbalancePct}%).\n`);
      io.out(`${DISCLAIMER}\n`);
    }
    return report.gate && report.gate.exceeded ? 1 : 0;
  } catch (err) {
    io.err(`${err.message}\n`);
    return 2;
  }
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
