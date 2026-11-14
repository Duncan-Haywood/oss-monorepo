// Runs checkNfeEvent() over the public reform-event XMLs listed in
// eval/nfe-rtc-events-corpus-list.txt (downloaded from raw.githubusercontent.com, not copied
// here) and prints each file's findings: node eval/nfe-rtc-events-corpus.mjs [--json]
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkNfeEvent, looksLikeNfeEvent } from "../nfe-event.mjs";

const here = new URL("..", import.meta.url).pathname;
const list = readFileSync(here + "eval/nfe-rtc-events-corpus-list.txt", "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));
const seen = new Map();
const rows = [];
for (const [repo, path] of list) {
  const url = `https://raw.githubusercontent.com/${repo}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url);
  if (!res.ok) { rows.push({ repo, path, error: `HTTP ${res.status}` }); continue; }
  let text = Buffer.from(await res.arrayBuffer()).toString("utf8").replace(/^﻿/, "");
  const sha = createHash("sha256").update(text).digest("hex").slice(0, 12);
  const dup = seen.get(sha);
  if (!dup) seen.set(sha, `${repo}/${path}`);
  if (!looksLikeNfeEvent(text)) { rows.push({ repo, path, sha, dup, error: "not read as an NF-e event" }); continue; }
  const r = checkNfeEvent(text);
  rows.push({ repo, path, sha, dup, types: r.meta.types, findings: r.findings.map((f) => `${f.rule}${f.severity ? " (w)" : ""} ${f.message}`), skipped: r.skipped.length });
}
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) {
  console.log(`\n${r.repo} ${r.path}${r.dup ? `  [same bytes as ${r.dup}]` : ""}`);
  if (r.error) { console.log("  " + r.error); continue; }
  console.log(`  types ${r.types?.join(",")}; ${r.findings.length} finding(s)`);
  for (const f of r.findings) console.log("   - " + f);
}
const distinct = rows.filter((r) => !r.error && !r.dup);
console.log(`\nfiles: ${rows.length}, read: ${rows.filter((r) => !r.error).length}, distinct: ${distinct.length}, distinct with a finding: ${distinct.filter((r) => r.findings.length).length}`);
