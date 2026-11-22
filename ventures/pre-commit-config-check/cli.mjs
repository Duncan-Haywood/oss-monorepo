#!/usr/bin/env node
// Zero-dependency CLI for check.mjs. Reads .pre-commit-config.yaml (or the
// files named), prints findings. No network calls, nothing written.
//
//   node cli.mjs                          # ./.pre-commit-config.yaml
//   node cli.mjs path/to/config.yaml ...  # specific files
//   node cli.mjs --format json            # machine-readable
//   node cli.mjs --strict                 # exit 1 on warnings too, not only errors
//   node cli.mjs --pre-commit-version 3.8.0   # judge minimum_pre_commit_version against this
//
// Exit codes: 0 pre-commit accepts the file (and, with --strict, no
// warnings); 1 it would not; 2 usage error or unreadable file.
import { readFileSync, existsSync } from "node:fs";
import { checkConfigText, formatLikePreCommit, summarize, PRE_COMMIT_VERSION } from "./check.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const valued = new Set(["--format", "--pre-commit-version"]);
const files = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));

if (flag("--help") || flag("-h")) {
  console.log(`usage: pre-commit-config-check [file ...] [--format json] [--strict] [--pre-commit-version X.Y.Z]
Checks .pre-commit-config.yaml the way pre-commit ${PRE_COMMIT_VERSION} validates it, plus mistakes pre-commit accepts silently.`);
  process.exit(0);
}

const targets = files.length ? files : [".pre-commit-config.yaml"];
const installed = opt("--pre-commit-version") || PRE_COMMIT_VERSION;
let worst = 0;
const json = [];
for (const path of targets) {
  if (!existsSync(path)) { console.error(`${path}: not found`); worst = 2; continue; }
  let text;
  try { text = readFileSync(path, "utf8"); } catch (e) { console.error(`${path}: ${e.message}`); worst = 2; continue; }
  const r = checkConfigText(text, { filename: path, installed });
  const s = summarize(r);
  if (!r.ok) worst = Math.max(worst, 1);
  if (flag("--strict") && s.warnings) worst = Math.max(worst, 1);
  if (opt("--format") === "json") {
    json.push({ file: path, ...s, findings: r.findings.map(({ seq, ...f }) => ({ ...f, context: f.context.filter(Boolean) })) });
    continue;
  }
  for (const f of [...r.findings].sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.seq - b.seq)) {
    const tag = f.source === "pre-commit" ? "" : " (beyond pre-commit)";
    console.log(`${path}:${f.line ?? "?"}  ${f.level.toUpperCase().padEnd(7)} ${f.rule}${tag}\n    ${f.message}${f.detail ? `\n    python says: ${f.detail}` : ""}${f.fix ? `\n    fix: ${f.fix}` : ""}`);
  }
  if (r.firstError) console.log(`\npre-commit stops at the first error and prints:\n${formatLikePreCommit(r.firstError)}\n`);
  console.log(`${path}: ${r.ok ? "pre-commit accepts this file" : "pre-commit rejects this file"} — ${s.errors} error(s), ${s.warnings} warning(s), ${s.info} note(s)`);
}
if (opt("--format") === "json") console.log(JSON.stringify(json, null, 2));
process.exit(worst);
