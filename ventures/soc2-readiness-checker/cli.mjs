#!/usr/bin/env node
// node cli.mjs answers.csv [--availability] [--confidentiality] [--privacy] [--days-per-week 3] [--window 6] [--json]
// answers.csv is "control-id,yes|partial|no|na" per line (or a JSON object). Exit 1 when blockers remain.
import { readFileSync } from "node:fs";
import { CONTROLS, assess, parseAnswers } from "./calc.mjs";

const args = process.argv.slice(2);
const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes("--list")) { for (const c of CONTROLS) console.log(`${c.id}\t${c.title}`); process.exit(0); }
const skip = new Set(["--days-per-week", "--window"].map((f) => args.indexOf(f) + 1).filter((i) => i > 0));
const file = args.find((a, i) => !a.startsWith("--") && !skip.has(i));
if (!file) { console.error("usage: node cli.mjs answers.csv [--availability] [--confidentiality] [--privacy] [--days-per-week N] [--window 3|6|9|12] [--json] | --list"); process.exit(2); }
const p = parseAnswers(readFileSync(file, "utf8"));
if (p.error) { console.error(p.error); process.exit(2); }
const scopes = ["availability", "confidentiality", "privacy"].filter((s) => args.includes(`--${s}`));
const r = assess(p.answers, { scopes, daysPerWeek: val("--days-per-week"), windowMonths: val("--window") });
if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`Readiness ${r.readiness}%  (${r.summary.done} done, ${r.summary.partial} partial, ${r.summary.missing} missing)`);
  for (const a of r.areas) console.log(`  ${a.name.padEnd(28)} ${String(a.readiness).padStart(5)}%`);
  console.log();
  r.gaps.forEach((g, i) => console.log(`${String(i + 1).padStart(2)}. [w${g.w}] ${g.title} -- ${Math.round(g.remaining * 10) / 10}d, done by week ${g.finishWeek}`));
  console.log();
  for (const a of r.advice) console.log(`- ${a}`);
  for (const u of p.unknown) console.log(`! unknown control id: ${u}`);
  for (const b of p.bad) console.log(`! unreadable answer: ${b}`);
}
process.exit(r.blockers.length ? 1 : 0);
