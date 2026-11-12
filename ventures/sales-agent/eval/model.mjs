// Score a model's triage on labelled reply sets, on your own key or a local model:
//   LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=... node eval/model.mjs eval/fresh-2026-10-21.jsonl
//   LLM_PROVIDER=llamacpp LLM_MODEL=qwen node eval/model.mjs eval/fresh-*.jsonl --cache eval/model-answers/qwen.json
// For each file it prints three scores on the same replies: the rules alone (as eval/run.mjs), the model alone, and the
// merged triage the product runs (mergeTriage: the model may only keep or lower how much contact follows), with the
// same overreach and missed-opt-out counts. Replies are stripped of quoted history first, as parseReplies does.
// --cache FILE keeps every answer (category, subtype, return date; no reply text) keyed by a hash of the reply, so a
// run can stop and resume and a later run can re-score without calling the model. --json prints the totals as JSON.
// Costs one short call per reply on a hosted key; nothing on a local server.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, basename } from "node:path";
import { createHash } from "node:crypto";
import { triage, CATEGORIES, stripQuoted } from "../engine.mjs";
import { modelTriage, mergeTriage } from "../ai.mjs";
import { configFromEnv, isConfigured } from "../byok.mjs";

const TODAY = "2026-10-21";
export const replyKey = (r) => createHash("sha256").update(`${r.subject || ""}\n${r.body}`).digest("hex").slice(0, 16);
const overreaches = (got, label) => CATEGORIES[got].outbound && CATEGORIES[got].rank > CATEGORIES[label].rank;

/** Score one set given the model's answers (a Map or object keyed by replyKey; a missing or bad answer falls back to the rules). */
export function scoreSet(rows, answers, today = TODAY) {
  const get = (k) => (answers instanceof Map ? answers.get(k) : answers[k]);
  const blank = () => ({ right: 0, overreach: 0, unsubMissed: 0 });
  const s = { n: rows.length, rules: blank(), model: blank(), merged: blank(), modelErrors: 0, blocked: 0, misses: [] };
  for (const r of rows) {
    const reply = { from: r.from || "prospect@example.com", name: "", subject: r.subject, body: stripQuoted(r.body) };
    const rules = triage(reply, today);
    const a = get(replyKey(r));
    const ok = a && !a.error && CATEGORIES[a.category];
    if (!ok) s.modelErrors++;
    const model = ok ? a.category : rules.category;
    const merged = ok ? mergeTriage(rules, a, today) : { ...rules, source: "rules" };
    if (merged.modelSaid) s.blocked++;
    for (const [k, got] of [["rules", rules.category], ["model", model], ["merged", merged.category]]) {
      if (got === r.label) s[k].right++;
      else { if (overreaches(got, r.label)) s[k].overreach++; if (r.label === "unsubscribe") s[k].unsubMissed++; }
    }
    if (model !== r.label || merged.category !== r.label) s.misses.push({ label: r.label, rules: rules.category, model, merged: merged.category, body: r.body });
  }
  return s;
}

const loadRows = (f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const cachePath = opt("--cache");
  const files = args.filter((a) => a.endsWith(".jsonl"));
  if (!files.length) files.push(new URL("./fresh-2026-10-21.jsonl", import.meta.url).pathname);
  const answers = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
  const cfg = configFromEnv(process.env);
  const offline = args.includes("--offline");
  if (!offline && !isConfigured(cfg)) { console.error("Set LLM_PROVIDER/LLM_MODEL/LLM_API_KEY (or ANTHROPIC_API_KEY etc.), or pass --offline with a --cache."); process.exit(2); }
  const save = () => { if (cachePath) { mkdirSync(dirname(cachePath), { recursive: true }); writeFileSync(cachePath, JSON.stringify(answers, null, 0).replace(/},"/g, '},\n"') + "\n"); } };
  const totals = { n: 0, rules: { right: 0, overreach: 0, unsubMissed: 0 }, model: { right: 0, overreach: 0, unsubMissed: 0 }, merged: { right: 0, overreach: 0, unsubMissed: 0 }, modelErrors: 0, blocked: 0, seconds: 0, calls: 0 };
  const perFile = {};
  for (const f of files) {
    const rows = loadRows(f);
    for (const r of rows) {
      const k = replyKey(r);
      if (answers[k] || offline) continue;
      const reply = { from: r.from || "prospect@example.com", name: "", subject: r.subject, body: stripQuoted(r.body) };
      const t0 = Date.now();
      try {
        const a = await modelTriage(cfg, reply, TODAY);
        answers[k] = { category: a.category, subtype: a.subtype ?? null, return_date: a.return_date ?? null };
      } catch (e) { answers[k] = { error: String(e.message).slice(0, 120) }; }
      totals.seconds += (Date.now() - t0) / 1000; totals.calls++;
      save();
    }
    const s = scoreSet(rows, answers);
    perFile[basename(f)] = { n: s.n, rules: s.rules, model: s.model, merged: s.merged, modelErrors: s.modelErrors, blocked: s.blocked };
    totals.n += s.n; totals.modelErrors += s.modelErrors; totals.blocked += s.blocked;
    for (const k of ["rules", "model", "merged"]) for (const m of ["right", "overreach", "unsubMissed"]) totals[k][m] += s[k][m];
    if (!args.includes("--json")) {
      const line = (k) => `${k} ${s[k].right}/${s.n} (overreach ${s[k].overreach}, opt-outs missed ${s[k].unsubMissed})`;
      console.log(`${basename(f)}: ${line("rules")}; ${line("model")}; ${line("merged")}; model errors ${s.modelErrors}, blocked by the merge ${s.blocked}`);
      if (args.includes("--misses")) for (const m of s.misses) console.log(`    ${m.label}: rules ${m.rules}, model ${m.model}, merged ${m.merged}: ${m.body.slice(0, 140).replace(/\s+/g, " ")}`);
    }
  }
  const who = offline ? `cache ${cachePath}` : `${cfg.provider} ${cfg.model || ""}`;
  if (args.includes("--json")) console.log(JSON.stringify({ who, totals, perFile }, null, 2));
  else {
    const pct = (x) => `${x}/${totals.n} (${((100 * x) / totals.n).toFixed(1)}%)`;
    console.log(`\nall (${who}): rules ${pct(totals.rules.right)}, model ${pct(totals.model.right)}, merged ${pct(totals.merged.right)}`);
    console.log(`overreach rules/model/merged ${totals.rules.overreach}/${totals.model.overreach}/${totals.merged.overreach}; opt-outs missed ${totals.rules.unsubMissed}/${totals.model.unsubMissed}/${totals.merged.unsubMissed}; model errors ${totals.modelErrors}; blocked ${totals.blocked}`);
    if (totals.calls) console.log(`${totals.calls} model calls, ${(totals.seconds / totals.calls).toFixed(1)} s each`);
  }
}
