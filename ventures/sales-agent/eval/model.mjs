// Score a model's triage (merged under the rules, as the product runs it) on a labelled file, on your own key:
//   LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=... node eval/model.mjs eval/fresh-2026-10-21.jsonl
// Prints the same numbers as eval/run.mjs for the merged triage. Costs one short call per reply on your key.
import { readFileSync } from "node:fs";
import { triage, CATEGORIES } from "../engine.mjs";
import { modelTriage, mergeTriage } from "../ai.mjs";
import { configFromEnv, isConfigured } from "../byok.mjs";

const cfg = configFromEnv(process.env);
if (!isConfigured(cfg)) { console.error("Set LLM_PROVIDER/LLM_MODEL/LLM_API_KEY (or ANTHROPIC_API_KEY etc.) first."); process.exit(2); }
const file = process.argv.find((a) => a.endsWith(".jsonl")) || new URL("./fresh-2026-10-21.jsonl", import.meta.url);
const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const today = "2026-10-21";
let right = 0, overreach = 0, unsubMissed = 0, errors = 0;
for (const r of rows) {
  const reply = { from: r.from || "prospect@example.com", name: "", subject: r.subject, body: r.body };
  const rules = triage(reply, today);
  let t = rules;
  try { t = mergeTriage(rules, await modelTriage(cfg, reply, today), today); } catch (e) { errors++; console.error(`error: ${e.message}`); }
  if (t.category === r.label) right++;
  else {
    if (CATEGORIES[t.category].outbound && CATEGORIES[t.category].rank > CATEGORIES[r.label].rank) overreach++;
    if (r.label === "unsubscribe") unsubMissed++;
    console.log(`  ${r.label} -> ${t.category}: ${r.body}`);
  }
}
console.log(`model+rules (${cfg.provider} ${cfg.model || ""}): ${right}/${rows.length} correct, overreach ${overreach}, unsubscribes missed ${unsubMissed}, model errors ${errors}`);
