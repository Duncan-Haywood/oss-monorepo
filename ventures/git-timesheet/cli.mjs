#!/usr/bin/env node
// CLI: estimate hours from git history and print a client-ready report.
//   git log --since=2026-09-01 --pretty=format:'%H|%an|%aI|%s' | node cli.mjs --rate 90
//   node cli.mjs --repo . --since 2026-09-01 --author "Ada" --format csv
// Exit 0 ok, 1 over --max-hours/--max-amount, 2 bad input. No network.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { LOG_FORMAT, parseLog, summarize, toMarkdown, toCsv, gate } from "./engine.mjs";

const USAGE = `usage: git log --pretty=format:'${LOG_FORMAT}' | node cli.mjs [options]
       node cli.mjs --repo <dir> [--since <date>] [--until <date>] [--author <name>] [options]
options: --gap <min=120> --lead <min=30> --rate <per hour> --format md|csv|json
         --title <text> --client <text> --max-hours <n> --max-amount <n> --file <log.txt>`;

const fail = (m) => { console.error(m); process.exit(2); };
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) fail(`unexpected argument "${argv[i]}"\n${USAGE}`);
  if (argv[i + 1] === undefined) fail(`${argv[i]} needs a value\n${USAGE}`);
  opt[argv[i].slice(2)] = argv[++i];
}
const num = (k, d) => {
  if (opt[k] === undefined) return d;
  const n = Number(opt[k]);
  if (!Number.isFinite(n) || n < 0) fail(`--${k} needs a non-negative number, got "${opt[k]}"`);
  return n;
};

let text;
if (opt.repo) {
  const args = ["-C", opt.repo, "log", `--pretty=format:${LOG_FORMAT}`, "--no-merges"];
  for (const k of ["since", "until", "author"]) if (opt[k]) args.push(`--${k}=${opt[k]}`);
  try { text = execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 }); }
  catch (e) { fail(`git log failed: ${String(e.stderr || e.message).trim()}`); }
} else if (opt.file) {
  try { text = readFileSync(opt.file, "utf8"); } catch (e) { fail(`could not read ${opt.file}: ${e.message}`); }
} else {
  if (process.stdin.isTTY) fail(USAGE);
  text = readFileSync(0, "utf8");
}

const { commits, bad } = parseLog(text);
if (bad.length) console.error(`warning: skipped ${bad.length} line(s) not in the expected format (first: line ${bad[0].line})`);
if (!commits.length && bad.length) fail("no commits parsed — was the log produced with the --pretty format above?");
const sum = summarize(commits, { gap: num("gap", 120), lead: num("lead", 30), rate: num("rate", 0) });
const fmt = opt.format || "md";
if (fmt === "json") console.log(JSON.stringify({ ...sum, days: sum.days.map((d) => ({ ...d, commits: d.commits.map((c) => c.subject) })) }, null, 2));
else if (fmt === "csv") process.stdout.write(toCsv(sum));
else if (fmt === "md") process.stdout.write(toMarkdown(sum, { title: opt.title, client: opt.client }));
else fail(`--format must be md, csv or json, got "${fmt}"`);
const g = gate(sum, { maxHours: opt["max-hours"] === undefined ? null : num("max-hours"), maxAmount: opt["max-amount"] === undefined ? null : num("max-amount") });
if (!g.ok) { console.error(g.text); process.exit(1); }
