#!/usr/bin/env node
// Does the mail file reader read your own sent mail right? (added 2026-11-11 with runDaily's `sent` input.) Every Enron
// message filed in a "sent" folder under <dir> (eval/README.md, "Real mail: the Enron corpus", says how to fetch them;
// nothing is committed) goes through createCollector with its own From address as --own, and the recipients and day it
// records are written as JSON lines { file, to, date, subject } for comparison with an independent reader
// (eval/sent-enron-reference.py, Python's email package).
//
//   node eval/sent-enron.mjs <dir> > ours.jsonl && python3 eval/sent-enron-reference.py <dir> > ref.jsonl
//   node eval/sent-enron.mjs --compare ours.jsonl ref.jsonl
import fs from "node:fs";
import path from "node:path";
import { createCollector, addressOf } from "../mailfile.mjs";
import { headerMap, splitHead } from "../mime.mjs";

if (process.argv[2] === "--compare") {
  const load = (f) => new Map(fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.file, r]));
  const ours = load(process.argv[3]), ref = load(process.argv[4]);
  let same = 0, date = 0, missing = 0, extra = 0, n = 0;
  const diffs = [];
  for (const [f, r] of ref) {
    n++;
    const o = ours.get(f);
    if (!o) { missing++; if (diffs.length < 10) diffs.push({ f, why: "not recorded", ref: r.to }); continue; }
    const a = [...o.to].sort().join(" "), b = [...r.to].sort().join(" ");
    if (a === b) same++; else if (diffs.length < 10) diffs.push({ f, ours: o.to, ref: r.to });
    if (o.date === r.date) date++;
  }
  for (const f of ours.keys()) if (!ref.has(f)) extra++;
  console.log(JSON.stringify({ messages: n, sameRecipients: same, sameDay: date, notRecorded: missing, recordedOnlyByUs: extra }, null, 1));
  for (const d of diffs) console.log(JSON.stringify(d));
  process.exit(0);
}
const dir = process.argv[2];
if (!dir) { console.error("usage: node eval/sent-enron.mjs <dir> | --compare ours.jsonl ref.jsonl"); process.exit(2); }
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!p.endsWith(".xz")) files.push(p); } })(dir);
files.sort();
for (const f of files) {
  const raw = fs.readFileSync(f, "latin1");
  const h = headerMap(splitHead(raw)[0]);
  if (!/sent/i.test(h["x-folder"] || "")) continue;
  const c = createCollector({ own: [addressOf(h.from)] });
  c.add(raw);
  const r = c.finish();
  for (const s of r.sent) console.log(JSON.stringify({ file: path.relative(dir, f), to: s.to, date: s.date, subject: s.subject }));
}
