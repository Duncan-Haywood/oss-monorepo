#!/usr/bin/env node
// Ad spend saturation analysis from a file, in a terminal.
//
//   node cli.mjs spend.csv                    # where the next dollar still pays, per channel
//   node cli.mjs --margin 45 spend.csv        # gross margin in percent (default 60)
//   node cli.mjs --skip "2025-11-24..2025-12-07" spend.csv   # leave promotion weeks out of the fit
//   node cli.mjs --budget 12000 spend.csv     # best split of a different weekly total
//   node cli.mjs --csv spend.csv > report.csv # one row per channel
//   node cli.mjs --json spend.csv             # machine-readable
//   node cli.mjs --example                    # run on the built-in simulated data
//
// Same model as the web page (calc.mjs). Zero dependencies, no network: the
// figures never leave the machine. A decision aid, not financial advice.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseSpend, analyze, reportCsv, sampleText, money, pct, budgetPlan, budgetLadder } from "./calc.mjs";

const USAGE = `Find where the next advertising dollar still pays, from your own spend history.

Usage:
  node cli.mjs [options] <spend.csv | ->

Input: one row per date and channel with a date, a channel (or source,
platform, campaign), the spend and the revenue credited to it. Columns are
found by header name; daily rows are summed into Monday weeks.

Options:
  --margin <percent>   gross margin on revenue, 1-100 (default 60)
  --skip <ranges>      weeks to leave out of the fit, e.g. "2025-11-24..2025-12-07; 2025-12-26"
  --budget <amount>    also print the best split of this weekly total
  --csv                print one CSV row per channel
  --json               print the full result as JSON
  --example            use the built-in simulated data instead of a file
  -h, --help           this message

A decision aid, not financial advice. Curves are fitted to your own history;
check the back-test line before moving budget.
`;

export function parseArgs(argv) {
  const o = { file: null, margin: 60, skip: "", budget: null, csv: false, json: false, example: false, help: false };
  const value = (i, name) => { if (argv[i] === undefined) throw new Error(name + " needs a value"); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--json") o.json = true;
    else if (a === "--example") o.example = true;
    else if (a === "--margin") {
      o.margin = Number(value(++i, "--margin").replace(/%$/, ""));
      if (!(o.margin > 0 && o.margin <= 100)) throw new Error("--margin is a percent from 1 to 100");
    } else if (a === "--skip") o.skip = value(++i, "--skip");
    else if (a === "--budget") {
      o.budget = Number(value(++i, "--budget").replace(/[$,\s]/g, ""));
      if (!(o.budget > 0)) throw new Error("--budget must be a weekly amount above zero");
    } else if (a.startsWith("-") && a !== "-") throw new Error("unknown option " + a);
    else if (o.file === null) o.file = a;
    else throw new Error("one input file only");
  }
  if (o.csv && o.json) throw new Error("choose one of --csv, --json");
  return o;
}

function pad(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => r.map((x, i) => (i === 0 ? x.padEnd(w[i]) : x.padStart(w[i]))).join("  ")).join("\n");
}

export function render(opts, text) {
  const parsed = parseSpend(text);
  if (parsed.error) return { out: "", errors: [parsed.error] };
  const res = analyze(parsed.rows, { margin: opts.margin / 100, skipWeeks: opts.skip });
  if (res.error) return { out: "", errors: [res.error] };
  const errors = (res.summary.skipBad || []).map((b) => "could not read skip range: " + b);
  const plan = opts.budget ? budgetPlan(res, opts.budget) : null;
  if (opts.csv) return { out: reportCsv(res), errors };
  if (opts.json) {
    const { frontier, ...summary } = res.summary;
    const channels = res.channels.map(({ pts, ...c }) => c);
    return { out: JSON.stringify({ summary, channels, findings: res.findings, backtest: res.backtest, plan }, null, 2) + "\n", errors };
  }
  const s = res.summary;
  const head = ["channel", "weekly spend", "avg ROAS", "marginal ROAS", "of ceiling", "recommended", "change"];
  const body = res.channels.map((c) => c.modelled
    ? [c.name, money(c.current), c.roas.toFixed(2), c.mroas.toFixed(2), pct(c.saturation, 0), money(c.recommended), (c.recommended >= c.current ? "+" : "") + money(c.recommended - c.current)]
    : [c.name, money(c.current), Number.isFinite(c.roas) ? c.roas.toFixed(2) : "n/a", "-", "-", money(c.current), "not modelled: " + c.reason]);
  const lines = [pad([head, ...body]), "",
    `Moving to the recommended split adds about ${money(s.gain)} a week (${money(s.gainLo)} to ${money(s.gainHi)}); it helps in ${pct(s.pGain, 0)} of resamples.`,
    `Contribution at a ${opts.margin}% margin peaks near ${money(res.optimum.weeklySpend)} a week in total.`];
  const t = res.backtestTotal;
  if (t) lines.push(`Back-test, last ${t.holdout} weeks: predicted ${money(t.curve)}, actual ${money(t.actual)} (curve error ${pct(t.wapeCurve, 0)}, flat-ROAS error ${pct(t.wapeLinear, 0)}).`);
  for (const f of res.findings) lines.push(`[${f.severity}] ${f.title}: ${f.detail}`);
  if (opts.budget) {
    lines.push("");
    if (plan) lines.push(`At ${money(plan.total)} a week the best split earns ${money(plan.revenue)} (${money(plan.splitGain)} more than pro rata), last dollar returns ${plan.marginalRoas.toFixed(2)}: ` + plan.channels.map((c) => `${c.name} ${money(c.spend)}`).join(", "));
    else lines.push("That weekly total is outside what the per-channel limits allow (about 0.25x to 2x of today's spend per channel).");
  } else {
    lines.push("", "What-if totals (best split of each):", pad(budgetLadder(res).map((p) => [money(p.total), (p.mult >= 1 ? "+" : "") + ((p.mult - 1) * 100).toFixed(0) + "%", money(p.revenue), "last $ " + p.marginalRoas.toFixed(2)])));
  }
  return { out: lines.join("\n") + "\n", errors };
}

async function readInput(file) {
  if (file === "-") { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString("utf8"); }
  return readFile(file, "utf8");
}

export async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { process.stderr.write(e.message + "\n\n" + USAGE); return 2; }
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  let text;
  if (opts.example) text = sampleText();
  else if (!opts.file) { process.stderr.write("give an input file, - for stdin, or --example\n\n" + USAGE); return 2; }
  else { try { text = await readInput(opts.file); } catch (e) { process.stderr.write("cannot read " + opts.file + ": " + e.message + "\n"); return 2; } }
  const { out, errors } = render(opts, text);
  if (errors.length) process.stderr.write(errors.join("\n") + "\n");
  process.stdout.write(out);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main(process.argv.slice(2));
