#!/usr/bin/env node
// Survey: run the checker over every Content-Security-Policy header this
// repository's own venture and platform code sends (string literals next to a
// "content-security-policy" key, tests excluded). Template holes `${...}` are
// read as 'none'. Python adjacent string literals are joined.
//
//   node ventures/csp-policy-check/eval/survey-repo-csps.mjs [repo root]
//
// Result for 2026-11-18: eval/repo-csp-survey-2026-11-18.md.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyze } from "../csp.mjs";

const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
const grep = execFileSync("grep", ["-rnoiE", "[\"']content-security-policy[\"']\\s*[:,]\\s*[\"'`]", "ventures", "platform",
  "--include=*.mjs", "--include=*.js", "--include=*.ts", "--include=*.py", "--exclude-dir=node_modules"], { cwd: root, encoding: "utf8" })
  .trim().split("\n").filter((l) => l && !/\.test\.|test_/.test(l.split(":")[0]) && !l.startsWith("ventures/csp-policy-check/"));

const tally = {};
let high = 0, clean = 0;
const rows = [];
for (const l of grep) {
  const [file, ln] = l.split(":");
  const src = fs.readFileSync(path.join(root, file), "utf8").split("\n").slice(Number(ln) - 1, Number(ln) + 3).join("\n");
  const m = src.match(/content-security-policy["']\s*[:,]\s*(["'`])/i);
  const q = m[1];
  let i = m.index + m[0].length, out = "";
  while (i < src.length) {
    const c = src[i];
    if (c === q) {
      const rest = src.slice(i + 1).match(/^\s*\n?\s*(["'`])/);
      if (file.endsWith(".py") && rest) { i += 1 + rest[0].length; continue; }
      break;
    }
    out += c; i++;
  }
  const policy = out.replace(/\$\{[^}]*\}/g, "'none'");
  const r = analyze(policy);
  if (r.findings.some((f) => f.severity === "high")) high++;
  if (!r.findings.some((f) => f.severity === "high" || f.severity === "medium")) clean++;
  for (const f of r.findings) tally[`${f.severity} ${f.id}`] = (tally[`${f.severity} ${f.id}`] || 0) + 1;
  rows.push(`| \`${file}:${ln}\` | \`${policy}\` | ${r.findings.filter((f) => f.severity === "high" || f.severity === "medium").map((f) => `${f.severity} ${f.id}`).join(", ") || "none"} |`);
}
console.log(`${grep.length} policies; ${high} with a high finding; ${clean} with no high or medium finding\n`);
console.log("| Where | Policy | High / medium findings |\n|---|---|---|\n" + rows.join("\n"));
console.log("\n| Finding | Policies |\n|---|---|\n" + Object.entries(tally).sort().map(([k, v]) => `| ${k} | ${v} |`).join("\n"));
