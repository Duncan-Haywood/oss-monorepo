#!/usr/bin/env node
// Zero-dependency CLI: check whether one or more local HTML files' JSON-LD
// (FAQPage, HowTo, Article/BlogPosting/NewsArticle, Product,
// LocalBusiness/Organization, Review) says, word for word, what the same
// file's own visible text says. No network call -- reads only the files
// named on the command line.
//
//   node cli.mjs check page.html
//   node cli.mjs check page.html --json
//   node cli.mjs check page.html --strict          # also fail on a malformed JSON-LD block
//   node cli.mjs check site/**/*.html               # shell-expanded, or pipe from find/xargs
//   find dist -name '*.html' | xargs node cli.mjs check

import fs from "node:fs/promises";
import { checkPage, summarize } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, strict: false, positional: [] };
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-")) args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

function renderFileReport(file, report) {
  const { status, text } = summarize(report);
  const lines = [`${file}: ${text}`];
  const failed = report.results.filter((r) => !r.pass);
  for (const r of failed) {
    lines.push(`  FAIL  ${r.label}`);
    lines.push(`    JSON-LD: …${r.divergence.authored}…`);
    lines.push(`    on page: …${r.divergence.onPage || "(no matching text found)"}…`);
  }
  for (const err of report.errors) {
    lines.push(`  WARN  ${err}`);
  }
  return { status, lines };
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8") } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check <page.html> [<page2.html> ...] [--json] [--strict]",
        "",
        "Checks whether each page's JSON-LD (FAQPage, HowTo, Article/BlogPosting/",
        "NewsArticle, Product, LocalBusiness/Organization, Review) matches its own",
        "visible text, word for word. No network call -- reads only the files named.",
        "Exit 1 if any claim on any file diverges (or, with --strict, if any JSON-LD",
        "block fails to parse). Exit 0 if every claim matches or no checkable",
        "structured data was found.",
      ].join("\n"),
    };
  }

  if (args.sub !== "check") {
    return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  }
  if (args.positional.length === 0) {
    return { exitCode: 2, output: "Usage: node cli.mjs check <page.html> [<page2.html> ...]" };
  }

  const perFile = [];
  let readError = false;
  for (const file of args.positional) {
    let html;
    try {
      html = await readFile(file);
    } catch (err) {
      perFile.push({ file, error: `Error: ${err.message}` });
      readError = true;
      continue;
    }
    perFile.push({ file, report: checkPage(html) });
  }

  const anyDrift = perFile.some((f) => f.report && f.report.results.some((r) => !r.pass));
  const anyParseError = perFile.some((f) => f.report && f.report.errors.length > 0);
  const exitCode = readError || anyDrift || (args.strict && anyParseError) ? 1 : 0;

  if (args.json) {
    return {
      exitCode,
      output: JSON.stringify(
        perFile.map((f) => (f.error ? { file: f.file, error: f.error } : { file: f.file, ...f.report })),
        null,
        2,
      ),
    };
  }

  const lines = [];
  for (const f of perFile) {
    if (f.error) {
      lines.push(`${f.file}: ${f.error}`);
      continue;
    }
    const { lines: fileLines } = renderFileReport(f.file, f.report);
    lines.push(...fileLines);
  }
  if (perFile.length > 1) {
    const totalFailed = perFile.reduce((n, f) => n + (f.report ? f.report.results.filter((r) => !r.pass).length : 0), 0);
    lines.push("", `${perFile.length} file(s) checked, ${totalFailed} claim(s) diverging.`);
  }
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
