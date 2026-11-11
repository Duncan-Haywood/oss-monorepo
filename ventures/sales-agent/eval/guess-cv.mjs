// How good is the word model's guess, measured fairly? Leave-one-set-out: each labelled reply file is scored by a
// model trained on every other file, so no reply is ever guessed by a model that saw it.
//   node eval/guess-cv.mjs          -> table per file and totals
//   node eval/guess-cv.mjs --json   -> machine-readable
// Scored on the replies the rules hand to a person (category "unclear"): that is where the product shows the guess.
import { readFileSync, readdirSync } from "node:fs";
import { triage, CATEGORIES, stripQuoted } from "../engine.mjs";
import { train, guess, TRAINING_FILE } from "../learn.mjs";

const dir = new URL("./", import.meta.url);
export const REPLY_FILES = readdirSync(dir).filter((f) => TRAINING_FILE.test(f)).sort();
export const load = (f) => readFileSync(new URL(f, dir), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const over = (got, truth) => CATEGORIES[got].outbound && CATEGORIES[got].rank > CATEGORIES[truth].rank;

/** Score guesses on one file's hand-offs. minMargin: below it the guess is withheld (the person sees "could not tell"). */
export function scoreHandoffs(rows, model, { minMargin = 0, today = "2026-10-21" } = {}) {
  const s = { rows: rows.length, handoffs: 0, shown: 0, right: 0, wrong: 0, overreach: 0, unsubAsOutbound: 0 };
  for (const r of rows) {
    const t = triage({ from: "prospect@example.com", name: "", subject: r.subject, body: stripQuoted(r.body) }, today);
    if (t.category !== "unclear") continue;
    s.handoffs++;
    const g = guess({ subject: r.subject, body: r.body }, model);
    if (!g || g.category === "unclear" || g.margin < minMargin) continue;
    s.shown++;
    if (g.category === r.label) s.right++;
    else { s.wrong++; if (over(g.category, r.label)) s.overreach++; if (r.label === "unsubscribe" && CATEGORIES[g.category].outbound) s.unsubAsOutbound++; }
  }
  return s;
}

export function crossValidate({ minMargin = 0, files = REPLY_FILES } = {}) {
  const data = Object.fromEntries(files.map((f) => [f, load(f)]));
  // Baseline: the model as shipped before 2026-11-11, trained on replies + heldout only (fair on the fresh files).
  const baseline = train(["replies.jsonl", "heldout.jsonl"].flatMap((g) => data[g] || load(g)));
  const per = [];
  for (const f of files) {
    const model = train(files.filter((g) => g !== f).flatMap((g) => data[g]));
    const cv = scoreHandoffs(data[f], model, { minMargin });
    const shipped = /^fresh-/.test(f) ? scoreHandoffs(data[f], baseline, { minMargin }) : null;
    per.push({ file: f, cv, shipped });
  }
  const sum = (key, pick) => per.reduce((a, p) => { const s = pick(p); if (s) for (const k of Object.keys(s)) a[k] = (a[k] || 0) + s[k]; return a; }, {});
  const fresh = per.filter((p) => p.shipped);
  return { minMargin, per, totals: { cv: sum("cv", (p) => p.cv), cvFresh: sum("cv", (p) => (p.shipped ? p.cv : null)), shippedFresh: sum("shipped", (p) => p.shipped) }, freshFiles: fresh.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = Number((process.argv.find((a) => a.startsWith("--min-margin=")) || "=0").split("=")[1]);
  const r = crossValidate({ minMargin: m });
  if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    const fmt = (s) => `${s.right}/${s.shown} right of ${s.handoffs} hand-offs, overreach ${s.overreach}, unsubscribe-as-draft ${s.unsubAsOutbound}`;
    for (const p of r.per) console.log(`${p.file.padEnd(26)} cv: ${fmt(p.cv)}${p.shipped ? `   | old 120-reply model: ${fmt(p.shipped)}` : ""}`);
    console.log(`\nall files, leave-one-set-out: ${fmt(r.totals.cv)}`);
    console.log(`fresh files only (${r.freshFiles}), leave-one-set-out: ${fmt(r.totals.cvFresh)}`);
    console.log(`fresh files only, old 120-reply model:      ${fmt(r.totals.shippedFresh)}`);
  }
}
