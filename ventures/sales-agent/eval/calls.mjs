// Score call-prep field detection (prep.mjs FIELDS) and follow-up line sorting (followup.mjs) on hand-written labelled
// notes: eval/calls-prep.jsonl (which of the nine discovery fields a note mentions) and eval/calls-followup.jsonl
// (whether a line is ours, theirs, the dated next step, or recap). See eval/README.md.
//   node eval/calls.mjs [--json]
import { readFileSync } from "node:fs";
import { FIELDS } from "../prep.mjs";
import { runFollowUp } from "../followup.mjs";

const rows = (name) => readFileSync(new URL(name, import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const IDS = FIELDS.map((f) => f.id);

export function scorePrep(data = rows("./calls-prep.jsonl")) {
  let tp = 0, fp = 0, fn = 0, exact = 0; const misses = [];
  for (const r of data) {
    const got = FIELDS.filter((f) => f.re.test(r.text)).map((f) => f.id);
    const missed = r.fields.filter((x) => !got.includes(x)), extra = got.filter((x) => !r.fields.includes(x));
    tp += r.fields.length - missed.length; fn += missed.length; fp += extra.length;
    if (!missed.length && !extra.length) exact++; else misses.push({ text: r.text, missed, extra });
  }
  return { n: data.length, exact, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1), tp, fp, fn, misses };
}

export function scoreFollowUp(data = rows("./calls-followup.jsonl"), today = "2026-10-26") {
  let right = 0; const misses = [];
  for (const r of data) {
    const o = runFollowUp({ email: "x@example.com", prospects: "email,first_name\nx@example.com,Sam", notes: r.line, today });
    const got = o.ours.length ? "ours" : o.theirs.length ? "theirs" : o.next ? "next" : "recap";
    if (got === r.role) right++; else misses.push({ line: r.line, want: r.role, got });
  }
  return { n: data.length, right, accuracy: right / data.length, misses };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = scorePrep(), f = scoreFollowUp();
  if (process.argv.includes("--json")) console.log(JSON.stringify({ prep: p, followup: f }, null, 2));
  else {
    console.log(`prep fields: ${p.exact}/${p.n} notes exact; precision ${(100 * p.precision).toFixed(0)}%, recall ${(100 * p.recall).toFixed(0)}% (${p.tp} hit, ${p.fp} extra, ${p.fn} missed)`);
    for (const m of p.misses) console.log(`  missed [${m.missed}] extra [${m.extra}]: ${m.text}`);
    console.log(`follow-up lines: ${f.right}/${f.n} sorted right (${(100 * f.accuracy).toFixed(0)}%)`);
    for (const m of f.misses) console.log(`  want ${m.want}, got ${m.got}: ${m.line}`);
  }
}
