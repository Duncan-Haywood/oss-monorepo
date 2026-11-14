#!/usr/bin/env node
// RRULE Explainer CLI. No network, no dependencies.
//
//   node cli.mjs 'FREQ=MONTHLY;BYDAY=-1FR' --start 2026-01-30T17:00 [--tz Europe/London]
//   node cli.mjs event.ics                 the first event's DTSTART/RRULE/RDATE/EXDATE
//   pbpaste | node cli.mjs -               the same from stdin
//   --count N       dates to list (default 25)
//   --from DATE     list dates on or after DATE (COUNT still counts from DTSTART)
//   --dateutil      read the rule as python-dateutil 4.0 does (DTSTART only if the rule makes it)
//   --json          machine-readable output
//   --strict        exit 1 on warnings as well as errors
// Exit codes: 0 no errors, 1 errors (or warnings with --strict), 2 usage or read error.
import { readFileSync, existsSync, statSync } from "node:fs";
import { analyze } from "./rrule.mjs";

export function run(argv, { stdin = () => readFileSync(0, "utf8") } = {}) {
  const takes = new Set(["--start", "--tz", "--count", "--from"]);
  const opts = {};
  const pos = [];
  const flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (takes.has(a)) opts[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) flags.add(a);
    else pos.push(a);
  }
  const unknown = [...flags].filter((f) => !["--json", "--strict", "--dateutil", "--help"].includes(f));
  if (flags.has("--help") || unknown.length || pos.length !== 1) {
    return { code: flags.has("--help") ? 0 : 2, out: usage(unknown) };
  }
  let text = pos[0];
  try {
    if (text === "-") text = stdin();
    else if (!/^FREQ=|^RRULE|^DTSTART/i.test(text) && existsSync(text) && statSync(text).isFile()) text = readFileSync(text, "utf8");
  } catch (e) {
    return { code: 2, out: `cannot read input: ${e.message}` };
  }
  const r = analyze({ text, dtstart: opts.start ?? "", tzid: opts.tz ?? "", limit: opts.count ? Number(opts.count) : 25, after: opts.from ?? "", dtstartMode: flags.has("--dateutil") ? "rule" : "rfc" });
  const errors = r.findings.filter((f) => f.level === "error").length;
  const warnings = r.findings.filter((f) => f.level === "warning").length;
  const code = errors || (flags.has("--strict") && warnings) ? 1 : 0;
  if (flags.has("--json")) return { code, out: JSON.stringify(r, null, 2) };
  const lines = [];
  for (const d of r.description) lines.push(d, "");
  for (const f of r.findings) lines.push(`${f.level.toUpperCase().padEnd(7)} ${f.title}`, `        ${f.detail}`, ...(f.fix ? [`        fix: ${f.fix}`] : []));
  if (r.findings.length) lines.push("");
  r.occurrences.forEach((o, i) => {
    const n = String(i + 1 + (r.skippedBefore || 0)).padStart(4);
    const utc = o.utc ? `  ${o.utc}` : "";
    const note = o.zone === "gap" ? `  clocks skip this time: happens at ${o.actualLocal}` : o.zone === "overlap" ? "  happens twice: the first" : o.source !== "rule" ? `  (${o.source})` : "";
    lines.push(`${n}  ${o.date}  ${o.weekday.slice(0, 3)}${utc}${note}`);
  });
  if (r.truncated) lines.push("      ... more follow (--count, --from)");
  return { code, out: lines.join("\n") };
}

function usage(unknown) {
  return [
    ...(unknown.length ? [`unknown option ${unknown.join(", ")}`] : []),
    "usage: node cli.mjs '<RRULE or event text>' | <file.ics> | - [--start 2026-01-05T09:00] [--tz Zone/Name]",
    "                    [--count N] [--from 2027-01-01] [--dateutil] [--json] [--strict]",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { code, out } = run(process.argv.slice(2));
  (code === 2 ? console.error : console.log)(out);
  process.exitCode = code;
}
