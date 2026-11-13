#!/usr/bin/env node
// Control charts from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.txt [--type xbar-r] [--rules 1,2,5,6] [--lsl 24.9 --usl 25.1] [--csv out.csv] [--json]
import { readFileSync, writeFileSync } from "node:fs";
import { analyze, toCsv, PAPERS, CHART_TYPES, RULES } from "./engine.mjs";

export const HELP = `spc-control-charts: Shewhart control charts with the eight Nelson run rules
and process capability (Cp, Cpk, Pp, Ppk)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: one line per point. Measurements: one value a line (individuals) or a
subgroup a line ("10.1, 10.3, 9.9"). Attributes: "count, sample size" (p, np, u)
or "count" (c). An optional label ends with a colon: "Mon 3 Nov: 10.1, 10.3".
Lines starting with # are skipped.

Options:
  --type T        ${CHART_TYPES.join(", ")} (default: guessed from the data)
  --rules 1,2,5   which Nelson rules to apply (default all eight)
  --exclude 4,17  points (1-based) left out of the limits but still plotted
  --revise        drop points beyond 3 sigma and recompute until none remain
  --n 200         sample size for an np chart whose lines hold only counts
  --lsl X --usl Y specification limits for Cp, Cpk, Pp, Ppk
  --csv FILE      write every point with its limits and rules
  --json          print the full JSON result
  --help          this text

Rules:
${RULES.map((r) => `  ${r.id}. ${r.text}`).join("\n")}

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. ${p.url}`).join("\n")}

Statistics on your data; not engineering, safety or quality-system advice. No warranty. MIT licence.
Web version: https://marisstella.app/spc-control-charts/`;

const list = (v) => v.split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));

export function parseArgs(argv) {
  const o = { json: false, help: false, file: null, csv: null, opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--revise") o.opts.revise = true;
    else if (a === "--type") {
      const t = next();
      if (!CHART_TYPES.includes(t)) throw new Error(`--type must be one of ${CHART_TYPES.join(", ")}`);
      o.opts.type = t;
    } else if (a === "--rules") {
      const r = list(next());
      if (!r.length || r.some((x) => !Number.isInteger(x) || x < 1 || x > 8)) throw new Error("--rules takes numbers 1 to 8, comma separated");
      o.opts.rules = r;
    } else if (a === "--exclude") o.opts.exclude = list(next());
    else if (a === "--n") o.opts.n = Number(next());
    else if (a === "--lsl" || a === "--usl") {
      const v = Number(next());
      if (!Number.isFinite(v)) throw new Error(`${a} needs a number`);
      o.opts[a.slice(2)] = v;
    } else if (a === "--csv") o.csv = next();
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.file = a;
  }
  return o;
}

export function run(argv, readStdin = () => readFileSync(0, "utf8")) {
  const o = parseArgs(argv);
  if (o.help) return { out: HELP, code: 0 };
  const text = !o.file || o.file === "-" ? readStdin() : readFileSync(o.file, "utf8");
  const res = analyze({ ...o.opts, text });
  if (o.csv) writeFileSync(o.csv, toCsv(res));
  if (o.json) return { out: JSON.stringify(res, null, 2), code: 0 };
  const lines = [res.summary, ""];
  for (const s of res.signals) lines.push(`  ${s.label}  ${s.chart}  rule ${s.rule}  value ${+s.value.toPrecision(6)}`);
  for (const w of [...res.warnings, ...(res.capability?.warnings || [])]) lines.push(`Note: ${w}`);
  return { out: lines.join("\n"), code: res.signals.length ? 1 : 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { out, code } = run(process.argv.slice(2));
    console.log(out);
    process.exitCode = code;
  } catch (e) {
    console.error(`spc-control-charts: ${e.message}`);
    process.exitCode = 2;
  }
}
