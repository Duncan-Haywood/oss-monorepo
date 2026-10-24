// Score the triage rules against eval/replies.jsonl (hand-written, labelled replies; see eval/README.md).
//   node eval/run.mjs            -> summary + every miss
//   node eval/run.mjs --json     -> machine-readable result
import { readFileSync } from "node:fs";
import { triage, CATEGORIES } from "../engine.mjs";
import { guess } from "../learn.mjs";

export function score(rows, { fn = triage, today = "2026-10-21", useGuess = true } = {}) {
  const misses = [], confusion = {};
  let right = 0, sub = 0, subRight = 0, overreach = 0, unsubMissed = 0, acted = 0, actedRight = 0, guessed = 0, guessRight = 0, guessOverreach = 0;
  for (const r of rows) {
    const t = fn({ from: r.from || "prospect@example.com", name: "", subject: r.subject, body: r.body }, today);
    confusion[r.label] ??= {};
    confusion[r.label][t.category] = (confusion[r.label][t.category] || 0) + 1;
    // The rules "act" when they name a category; otherwise the reply goes to a person with the word model's guess.
    if (t.category !== "unclear") { acted++; if (t.category === r.label) actedRight++; }
    else if (useGuess) {
      const g = guess({ subject: r.subject, body: r.body });
      if (g && g.category !== "unclear") { guessed++; if (g.category === r.label) guessRight++; else if (CATEGORIES[g.category].outbound && CATEGORIES[g.category].rank > CATEGORIES[r.label].rank) guessOverreach++; }
      else if (r.label === "unclear") guessRight++;
    }
    if (t.category === r.label) right++;
    else {
      misses.push({ label: r.label, got: t.category, body: r.body });
      // "Overreach": the agent picked a category that leads to more contact than the true one.
      // "Overreach": the rules picked a category that drafts a message where the true one would contact less.
      if (CATEGORIES[t.category].outbound && CATEGORIES[t.category].rank > CATEGORIES[r.label].rank) overreach++;
      if (r.label === "unsubscribe") unsubMissed++;
    }
    if (r.subtype) { sub++; if (t.subtype === r.subtype) subRight++; }
  }
  return { n: rows.length, accuracy: right / rows.length, right, acted, actedRight, precision: acted ? actedRight / acted : null, guessed, guessRight, guessOverreach, subtypeAccuracy: sub ? subRight / sub : null, overreach, unsubMissed, misses, confusion };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv.find((a) => a.endsWith(".jsonl")) || new URL("./replies.jsonl", import.meta.url);
  const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const s = score(rows);
  if (process.argv.includes("--json")) console.log(JSON.stringify(s, null, 2));
  else {
    console.log(`rules: ${s.right}/${s.n} correct (${(100 * s.accuracy).toFixed(1)}%); acted on ${s.acted}, right ${s.actedRight} (precision ${(100 * s.precision).toFixed(1)}%); overreach ${s.overreach}; unsubscribes not caught ${s.unsubMissed}; objection subtype ${s.subtypeAccuracy == null ? "n/a" : (100 * s.subtypeAccuracy).toFixed(0) + "%"}`);
    console.log(`guesses on the rest: ${s.guessRight} right of ${s.n - s.acted} handed to a person; ${s.guessOverreach} guesses would draft where the truth contacts less`);
    for (const m of s.misses) console.log(`  ${m.label} -> ${m.got}: ${m.body}`);
  }
}
