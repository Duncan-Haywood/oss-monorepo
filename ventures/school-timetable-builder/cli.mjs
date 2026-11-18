#!/usr/bin/env node
// node cli.mjs school.txt [--seed N] [--iterations N] [--csv out.csv] [--json]
// Exit 0: every lesson placed with no clash; 1: hard problems remain; 2: input error.
import { readFileSync, writeFileSync } from "node:fs";
import { parseSchool, feasibility, solve, validate, toCsv } from "./timetable.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith("--") && !["--seed", "--iterations", "--csv"].includes(args[i - 1]));
if (!file) {
  console.error("usage: node cli.mjs school.txt [--seed N] [--iterations N] [--csv out.csv] [--json]");
  process.exit(2);
}
const { problem, errors, warnings } = parseSchool(readFileSync(file, "utf8"));
for (const w of warnings) console.error(`warning: ${w}`);
if (!problem) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(2);
}
const issues = feasibility(problem);
for (const i of issues) console.error(`${i.soft ? "note" : "cannot fit"}: ${i.text}`);
const result = solve(problem, {
  seed: Number(flag("--seed") ?? 1),
  iterations: flag("--iterations") ? Number(flag("--iterations")) : undefined,
});
const check = validate(problem, result.units, result.placements);
const csv = toCsv(problem, result.units, result.placements);
if (flag("--csv")) writeFileSync(flag("--csv"), csv);
if (args.includes("--json")) {
  console.log(JSON.stringify({ ok: check.ok, problems: check.problems, stats: check.stats, feasibility: issues }, null, 2));
} else {
  if (!flag("--csv")) process.stdout.write(csv);
  const s = check.stats;
  console.error(`${check.ok ? "OK" : `${check.problems.length} hard problem(s)`}; class gaps ${s.classGaps}, teacher gaps ${s.teacherGaps}, same subject twice in a day ${s.repeats}, over daily max ${s.overMax}, late starts ${s.lateStarts}`);
  for (const p of check.problems) console.error(`  ${p.text}`);
}
process.exit(check.ok ? 0 : 1);
