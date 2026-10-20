#!/usr/bin/env node
// Command-line wrapper around calc.mjs: check a redirect map in CI or before a deploy.
// The file is read from disk (or stdin) and nothing is sent anywhere.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validate, render, decodeBuffer, FORMATS, findingsCsv } from "./calc.mjs";

const USAGE = `Usage: node cli.mjs <map-file | -> [options]

Checks a site-migration redirect map (CSV, TSV or "old new" per line) for loops, chains,
conflicts, soft-404 patterns and more. Exit 1 if any finding is at or above --fail-on.

Options:
  --new-urls <file>   the new site's URL list; flags redirects that end on a 404
  --old-urls <file>   the old site's URL list; flags old URLs with no rule
  --site <host>       your site's host, so absolute URLs on it count as internal
  --case-sensitive    treat /About and /about as different URLs
  --fail-on <level>   error (default), warning, or never
  --format <name>     write the flattened map as ${FORMATS.join(", ")}
  --out <file>        where to write it (default: stdout, after the report)
  --json              print the result as JSON instead of the text report
  --csv               print the findings as CSV instead of the text report
  -h, --help          show this help
`;

export function parseArgs(argv) {
  const o = { file: null, failOn: "error", caseSensitive: false };
  const takes = new Set(["--new-urls", "--old-urls", "--site", "--fail-on", "--format", "--out"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--case-sensitive") o.caseSensitive = true;
    else if (takes.has(a)) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      const key = a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase());
      o[key] = argv[++i];
    } else if (a === "-" || !a.startsWith("-")) {
      if (o.file) throw new Error(`more than one input file: ${o.file} and ${a}`);
      o.file = a;
    } else throw new Error(`unknown option ${a}`);
  }
  if (!["error", "warning", "never"].includes(o.failOn)) throw new Error("--fail-on must be error, warning or never");
  if (o.format && !FORMATS.includes(o.format)) throw new Error(`--format must be one of ${FORMATS.join(", ")}`);
  return o;
}

const readText = (path) => decodeBuffer(readFileSync(path === "-" ? 0 : path));

export function run(argv, io = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }) {
  let o;
  try { o = parseArgs(argv); } catch (e) { io.err(`${e.message}\n\n${USAGE}`); return 2; }
  if (o.help) { io.out(USAGE); return 0; }
  if (!o.file) { io.err(USAGE); return 2; }
  let result, text;
  try {
    text = readText(o.file);
    result = validate(text, {
      caseSensitive: o.caseSensitive,
      site: o.site || "",
      newUrls: o.newUrls ? readText(o.newUrls) : "",
      oldUrls: o.oldUrls ? readText(o.oldUrls) : "",
    });
  } catch (e) { io.err(`cannot read input: ${e.message}\n`); return 2; }

  if (o.json) io.out(JSON.stringify({ summary: result.summary, findings: result.findings }, null, 2) + "\n");
  else if (o.csv) io.out(findingsCsv(result));
  else {
    for (const f of result.findings) io.out(`${f.severity.toUpperCase().padEnd(7)} ${f.line ? `line ${f.line}`.padEnd(9) : "".padEnd(9)} ${f.title}${f.detail ? ` -- ${f.detail}` : ""}\n`);
    const s = result.summary;
    io.out(`${s.redirects} redirect(s) read, ${s.errors ?? 0} error(s), ${s.warnings ?? 0} warning(s)\n`);
  }

  if (o.format) {
    const body = render(result.flat, o.format);
    if (o.out) writeFileSync(o.out, body);
    else if (!o.json && !o.csv) io.out("\n" + body);
    else io.err("--format with --json/--csv needs --out\n");
  }

  const bad = result.findings.some((f) => f.severity === "error" || (o.failOn === "warning" && f.severity === "warning"));
  return o.failOn === "never" ? 0 : bad ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = run(process.argv.slice(2));
