// Score runFollowUp's line sorting (ours / theirs / next / recap) on labelled one-line call notes
// (eval/followup-notes-*.jsonl, hand-written by an agent; see eval/README.md).
//   node eval/followup.mjs [file.jsonl]
import { readFileSync } from "node:fs";
import { runFollowUp } from "../followup.mjs";

const PROSPECTS = "email,first_name,company,status\ndana@brightline.example,Dana,Brightline,replied";

export function sort(line, today = "2026-10-24") {
  const r = runFollowUp({ email: "dana@brightline.example", prospects: PROSPECTS, notes: `- ${line}`, offer: {}, today });
  if (r.ours.length) return "ours";
  if (r.theirs.length) return "theirs";
  if (r.next) return "next";
  return "recap";
}

export function score(rows) {
  const misses = []; const confusion = {};
  for (const r of rows) {
    const got = sort(r.line);
    (confusion[r.label] ??= {})[got] = (confusion[r.label][got] || 0) + 1;
    if (got !== r.label) misses.push({ label: r.label, got, line: r.line });
  }
  return { n: rows.length, right: rows.length - misses.length, accuracy: (rows.length - misses.length) / rows.length, misses, confusion };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv.find((a) => a.endsWith(".jsonl")) || new URL("./followup-notes-2026-10-24.jsonl", import.meta.url);
  const s = score(readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  console.log(`${s.right}/${s.n} right (${(s.accuracy * 100).toFixed(0)}%)`);
  console.log(JSON.stringify(s.confusion));
  for (const m of s.misses) console.log(`MISS ${m.label} -> ${m.got}: ${m.line}`);
}
