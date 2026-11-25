#!/usr/bin/env node
// Stable matching from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs prefs.txt [--proposer A|B] [--check matching.txt] [--json|--csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, PAPERS } from "./engine.mjs";

export const HELP = `stable-matching: pair applicants with programmes so no pair would rather have each other (deferred acceptance; Gale & Shapley 1962)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: two sections, each opened by a [header] naming the side, one line per
member with its ranking, best first (">" or "," between names). Capacities go
on the second side, after the name:
  [residents]
  ana: city > mercy > general
  ben: city > general
  [programmes]
  city (2): ben > ana
  mercy: ana
A pair can match only if each lists the other.

Options:
  --proposer A|B      which side proposes (default A, the first section). The
                      proposing side gets its best stable outcome, and only it
                      can never gain by ranking dishonestly (Roth 1982).
  --check FILE        test a matching you already have ("ana: city" lines,
                      "-" for no place) and list its blocking pairs
  --no-enumerate      skip listing every stable matching
  --limit N           stop the listing after N matchings (default 5000)
  --csv               one row per applicant: its place and rank under each matching
  --json              the full JSON result
  --help              this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Arithmetic on the lists you give. Not legal or professional advice; a real
admissions or hiring process has rules of its own. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/stable-matching/`;

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null, proposer: "A", enumerate: true, limit: undefined, check: null };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    const need = () => {
      if (val === undefined) val = argv[++i];
      if (val === undefined) throw new Error(`${a} needs a value`);
      return val;
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--no-enumerate") o.enumerate = false;
    else if (a === "--proposer") {
      const v = need().toUpperCase();
      if (v !== "A" && v !== "B") throw new Error(`--proposer is A or B, got "${val}"`);
      o.proposer = v;
    } else if (a === "--limit") {
      const v = Number(need());
      if (!(Number.isInteger(v) && v >= 1)) throw new Error(`--limit needs a whole number of at least 1, got "${val}"`);
      o.limit = v;
    } else if (a === "--check") o.check = need();
    else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

export function formatText(r) {
  const out = [r.summary, ""];
  for (const w of r.warnings) out.push(`Note: ${w}`);
  if (r.warnings.length) out.push("");
  const A = r.sides.A.label;
  const names = Object.keys(r.matching.assignment);
  const w = Math.max(8, ...names.map((n) => n.length));
  out.push(`${r.proposerLabel}-proposing matching:`);
  names.forEach((n, i) => out.push(`  ${n.padEnd(w)}  ${(r.matching.assignment[n] ?? "(none)").padEnd(14)} ${r.matching.rankA[i] ? `choice ${r.matching.rankA[i]}` : ""}`));
  if (r.stableMatchings) {
    const S = r.stableMatchings;
    out.push("", `Stable matchings: ${S.count}${S.complete ? "" : " (listing stopped at the limit)"}`);
    const row = (label, m) => out.push(`  ${label.padEnd(18)} total rank ${String(m.total).padStart(5)}  ${A} ${String(m.sumA).padStart(5)}  ${r.sides.B.label} ${String(m.sumB).padStart(5)}  worst ${m.regret}`);
    row(`${A}-optimal`, r.optimalA);
    row(`${r.sides.B.label}-optimal`, r.optimalB);
    row("egalitarian", S.egalitarian);
    row("minimum regret", S.minimumRegret);
    row("balanced", S.balanced);
  }
  if (r.check) {
    out.push("", r.check.stable ? "Your matching is stable." : "Your matching is not stable:");
    for (const p of r.check.problems) out.push(`  problem: ${p}`);
    for (const b of r.check.blocking) out.push(`  blocking pair: ${b.why}`);
  }
  return out.join("\n");
}

export function run(argv, stdinText = "") {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: `Error: ${e.message}\n\n${HELP}` };
  }
  if (o.help) return { code: 0, out: HELP };
  let text = stdinText;
  let check = null;
  try {
    if (o.file && o.file !== "-") text = readFileSync(o.file, "utf8");
    if (o.check) check = readFileSync(o.check, "utf8");
  } catch (e) {
    return { code: 2, out: `Error: cannot read ${e.path ?? o.file}: ${e.message}` };
  }
  if (!text || !text.trim()) return { code: 2, out: `Error: no input given (pass a file or pipe one in).\n\n${HELP}` };
  const r = analyze({ text, proposer: o.proposer, enumerate: o.enumerate, limit: o.limit, check });
  if (r.error) return { code: 1, out: `Error: ${r.error}` };
  if (o.json) return { code: 0, out: JSON.stringify(r, null, 2) };
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  return { code: 0, out: formatText(r) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const withValue = new Set(["--proposer", "--limit", "--check"]);
  const hasFile = argv.some((a, i) => !a.startsWith("-") && !withValue.has(argv[i - 1]));
  const needsStdin = !argv.includes("--help") && !argv.includes("-h") && !hasFile;
  const finish = (text) => {
    const { code, out } = run(argv, text);
    process.stdout.write(out + "\n");
    process.exitCode = code;
  };
  if (needsStdin && !process.stdin.isTTY) {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => finish(buf));
  } else finish("");
}
