#!/usr/bin/env node
// What if a model's held-back close acted alone? Offline, from a committed answer cache (eval/README.md, "A 14B local
// model on the same replies": the pre-registered test). mergeTriage turns a model's not_interested or left_company on a
// reply the rules read as unclear, question or objection into a flag for a person; this counts, for each of those flags,
// whether the model or the rules had the label, split by the rules' category, and lists the live replies a close would
// have lost silently (a close ends the cadence with no draft and no task).
//   node eval/model-closes.mjs eval/model-answers/qwen2.5-14b-q4km.json eval/fresh-*.jsonl [--json]
import { readFileSync } from "node:fs";
import { triage, stripQuoted } from "../engine.mjs";
import { mergeTriage } from "../ai.mjs";
import { replyKey } from "./model.mjs";

const CLOSES = new Set(["not_interested", "left_company"]);
const NOT_LIVE = new Set(["not_interested", "left_company", "unsubscribe", "bounce", "out_of_office"]);

export function closeFlags(rows, answers, today = "2026-10-21") {
  const t = { replies: 0, flags: 0, modelRight: 0, rulesRight: 0, neither: 0, byRules: {}, lostSilently: [] };
  for (const r of rows) {
    const a = answers[replyKey(r)];
    if (!a || a.error) continue;
    t.replies++;
    const rules = triage({ from: "prospect@example.com", name: "", subject: r.subject, body: stripQuoted(r.body) }, today);
    const m = mergeTriage(rules, a, today);
    if (!CLOSES.has(m.modelSaid)) continue;
    t.flags++;
    const ok = m.modelSaid === r.label;
    if (ok) t.modelRight++; else if (rules.category === r.label) t.rulesRight++; else t.neither++;
    const b = (t.byRules[rules.category] ||= { right: 0, wrong: 0, lost: 0 });
    if (ok) b.right++; else b.wrong++;
    if (!ok && !NOT_LIVE.has(r.label)) { b.lost++; t.lostSilently.push({ label: r.label, rules: rules.category, model: m.modelSaid, body: r.body.slice(0, 140) }); }
  }
  return t;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const [cache, ...rest] = args.filter((a) => !a.startsWith("--"));
  const rows = rest.flatMap((f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  const t = closeFlags(rows, JSON.parse(readFileSync(cache, "utf8")));
  if (args.includes("--json")) { console.log(JSON.stringify(t, null, 1)); process.exit(0); }
  console.log(`${t.replies} replies with an answer; ${t.flags} closes held for a person: model right ${t.modelRight}, rules right ${t.rulesRight}, neither ${t.neither}`);
  for (const [k, b] of Object.entries(t.byRules)) console.log(`  rules ${k}: model right ${b.right}, wrong ${b.wrong}, would be lost silently ${b.lost}`);
  for (const x of t.lostSilently) console.log(`    ${x.label} <- ${x.model} (rules ${x.rules}): ${x.body}`);
}
