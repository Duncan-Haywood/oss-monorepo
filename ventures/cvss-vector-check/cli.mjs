#!/usr/bin/env node
// CVSS Vector Check CLI. No network, no dependencies.
//
//   node cli.mjs 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'   score and explain one vector
//   node cli.mjs '<vector A>' --diff '<vector B>'                  which metrics differ and what each costs
//   node cli.mjs --audit advisories.json                           every vector in a file, stated scores checked
//   trivy image -f json app | node cli.mjs --audit -               read from stdin
//   --json      machine-readable output
//   --strict    exit 1 when an audit finds a mismatched or invalid vector
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { explain, sensitivity, diffVectors, audit } from "./cvss.mjs";

const USAGE = `usage: cvss-vector-check <vector> [--diff <vector>] [--json]
       cvss-vector-check --audit <file | -> [--json] [--strict]`;

const fmt = (n) => (n == null ? "-" : n.toFixed(1));

export function run(argv, { stdin = () => readFileSync(0, "utf8"), readFile = (f) => readFileSync(f, "utf8") } = {}) {
  const args = [...argv];
  const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
  const opt = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v ?? ""; };
  const json = flag("--json");
  const strict = flag("--strict");
  if (flag("--help") || flag("-h")) return { code: 0, out: USAGE };
  const auditPath = opt("--audit");
  const other = opt("--diff");
  const lines = [];
  if (auditPath !== null) {
    if (!auditPath) return { code: 2, out: USAGE };
    const text = auditPath === "-" ? stdin() : readFile(auditPath);
    const r = audit(text);
    if (json) return { code: strict && (r.totals.mismatch || r.totals.invalid) ? 1 : 0, out: JSON.stringify(r, null, 2) };
    const t = r.totals;
    lines.push(`${t.vectors} CVSS v3 vector${t.vectors === 1 ? "" : "s"} (${r.format}); ${t.withStatedScore} with a stated score. ok ${t.ok}, mismatch ${t.mismatch}, explained ${t.explained}, invalid ${t.invalid}.`);
    for (const row of r.rows) {
      if (row.status === "ok") continue;
      lines.push(`${row.status.toUpperCase().padEnd(9)} ${row.where}  ${row.vector}`);
      for (const p of row.problems) lines.push(`          ${p}`);
    }
    return { code: strict && (t.mismatch || t.invalid) ? 1 : 0, out: lines.join("\n") };
  }
  const vector = args[0];
  if (!vector) return { code: 2, out: USAGE };
  if (other !== null) {
    const d = diffVectors(vector, other);
    if (json) return { code: d.valid ? 0 : 2, out: JSON.stringify(d, null, 2) };
    if (!d.valid) return { code: 2, out: d.errors.join("\n") };
    lines.push(`A ${fmt(d.a.scores.base)} ${d.a.scores.baseSeverity}  ${d.a.vector}`, `B ${fmt(d.b.scores.base)} ${d.b.scores.baseSeverity}  ${d.b.vector}`);
    if (d.same) lines.push("The two vectors are the same.");
    for (const x of d.differences) lines.push(`  ${x.metric.padEnd(3)} ${x.aWords} -> ${x.bWords}: alone, A's base score becomes ${fmt(x.alone.base)} (${x.baseDelta >= 0 ? "+" : ""}${x.baseDelta.toFixed(1)})`);
    for (const n of d.notes) lines.push(n);
    return { code: 0, out: lines.join("\n") };
  }
  const x = explain(vector);
  if (json) return { code: x.valid ? 0 : 2, out: JSON.stringify({ ...x, sensitivity: x.valid ? sensitivity(vector) : null }, null, 2) };
  if (!x.valid) return { code: 2, out: x.errors.join("\n") };
  const s = x.scores;
  lines.push(`CVSS ${x.version}  base ${fmt(s.base)} ${s.baseSeverity}` + (x.hasTemporal ? `  temporal ${fmt(s.temporal)} ${s.temporalSeverity}` : "") + (x.hasEnvironmental ? `  environmental ${fmt(s.environmental)} ${s.environmentalSeverity}` : ""));
  lines.push(`impact ${fmt(s.impact)}  exploitability ${fmt(s.exploitability)}`);
  for (const m of x.metrics) if (m.group === "base" || m.given) lines.push(`  ${m.key.padEnd(4)}${m.name}: ${m.words}`);
  for (const f of x.findings) lines.push(`${f.severity}: ${f.message}`);
  return { code: 0, out: lines.join("\n") };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { code, out } = run(process.argv.slice(2));
    (code === 2 ? process.stderr : process.stdout).write(out + "\n");
    process.exitCode = code;
  } catch (e) {
    process.stderr.write(`cvss-vector-check: ${e.message}\n`);
    process.exitCode = 2;
  }
}
