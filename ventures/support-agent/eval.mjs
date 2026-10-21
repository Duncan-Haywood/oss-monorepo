// Measure an agent on a set of questions whose right outcome you know, and pick the confidence bar from the data.
//   cases = parseCases(csv)          // question,expect   expect = an article slug, several joined by |, or "handoff"
//   report = evaluate(agent, cases)  // every case scored at every bar, and the bar that answers most correctly
//                                    // while keeping wrong answers at or under maxWrong of the answers given
// A wrong answer (answering from the wrong article, or answering what should have gone to a person) costs more than
// a handoff, which costs a person a few minutes, so the bar is chosen under a cap on wrong answers, not for accuracy.
import { decide } from "./agent.mjs";

export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  const s = String(text ?? "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function parseCases(text) {
  const rows = parseCsv(text);
  if (rows.length && /^question$/i.test(rows[0][0].trim())) rows.shift();
  return rows.filter((r) => r[0]?.trim() && r[1]?.trim()).map(([question, expect]) => ({ question: question.trim(), expect: expect.trim().toLowerCase().split("|").map((x) => x.trim()).filter(Boolean) }));
}

// The outcome of one decision against what was expected.
//   correct: answered from an expected article    wrong: answered, but from another article or when a person was due
//   handoff_ok: handed off (or asked) when a person was due    missed: handed off (or asked) when an article had it
//   suggested: offered articles, one of them right    suggested_wrong: offered articles, none of them right
export function outcome(d, expect) {
  const wantsHuman = expect.includes("handoff");
  if (d.action === "answer") return expect.includes(d.citations[0]?.articleId) ? "correct" : "wrong";
  if (d.action === "suggest") return d.citations.some((c) => expect.includes(c.articleId)) ? "suggested" : "suggested_wrong";
  return wantsHuman ? "handoff_ok" : "missed";
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function tally(rows) {
  const t = { correct: 0, wrong: 0, handoff_ok: 0, missed: 0, suggested: 0, suggested_wrong: 0 };
  for (const r of rows) t[r.outcome]++;
  const answered = t.correct + t.wrong, n = rows.length;
  return { ...t, n, answered, resolved_pct: pct(t.correct, n), wrong_of_answered_pct: pct(t.wrong, answered), handoff_pct: pct(t.handoff_ok + t.missed, n) };
}

export function evaluate(agent, cases, { maxWrong = 0.05, threshold, suggestBar = agent.suggestBar } = {}) {
  // One pass at bar 0 gives each case's confidence; the decision at any other bar follows from it, except that rule
  // handoffs and clarifying questions do not depend on the bar.
  const raw = cases.map((c) => ({ ...c, d: decide(agent, c.question, { threshold: 0, suggestBar: 0 }), s: null }));
  const at = (bar) => raw.map((c) => {
    let d = c.d;
    if (d.action === "answer" && d.confidence < bar) {
      if (d.confidence >= suggestBar) d = (c.s ||= decide(agent, c.question, { threshold: 1.01, suggestBar }));
      else d = { ...d, action: "handoff", citations: [] };
    }
    return { question: c.question, expect: c.expect, action: d.action, article: d.action === "answer" ? d.citations[0].articleId : d.topArticle, confidence: d.confidence, reasons: d.reasons.map((r) => r.id), outcome: outcome(d, c.expect) };
  });
  const bars = [...new Set([0, ...raw.filter((c) => c.d.action === "answer").map((c) => c.d.confidence), 1.001])].sort((a, b) => a - b);
  const sweep = bars.map((bar) => ({ bar, ...tally(at(bar)) }));
  // Most correct answers with wrong answers at or under the cap; ties go to the higher bar (fewer risky answers).
  let best = null;
  for (const s of sweep) if (s.answered === 0 || s.wrong / s.answered <= maxWrong) if (!best || s.correct > best.correct || (s.correct === best.correct && s.bar > best.bar)) best = s;
  const chosen = threshold ?? best.bar;
  const rows = at(chosen);
  return { maxWrong, recommended: best.bar, threshold: chosen, summary: tally(rows), rows, sweep };
}

export function reportText(r) {
  const s = r.summary, out = [];
  out.push(`${s.n} questions at bar ${r.threshold.toFixed(3)}${r.threshold === r.recommended ? ` (recommended for wrong answers <= ${pct(r.maxWrong, 1)}% of answers)` : ` (recommended: ${r.recommended.toFixed(3)})`}`);
  out.push(`  answered correctly  ${s.correct} (${s.resolved_pct}% of all questions)`);
  out.push(`  answered wrongly    ${s.wrong} (${s.wrong_of_answered_pct}% of answers)`);
  out.push(`  handed off rightly  ${s.handoff_ok}`);
  out.push(`  handed off, but an article had it  ${s.missed}`);
  out.push(`  offered articles: ${s.suggested} with a right one, ${s.suggested_wrong} without`);
  const bad = r.rows.filter((x) => x.outcome === "wrong" || x.outcome === "missed" || x.outcome === "suggested_wrong");
  if (bad.length) { out.push("", "To look at:"); for (const b of bad) out.push(`  [${b.outcome}] ${b.question}  -> ${b.action}${b.article ? ` ${b.article}` : ""} (${b.confidence}), expected ${b.expect.join("|")}`); }
  out.push("", "bar     correct  wrong  wrong%ans  suggested(right)  handoff%");
  for (const x of r.sweep) out.push(`${x.bar.toFixed(3).padEnd(8)}${String(x.correct).padEnd(9)}${String(x.wrong).padEnd(7)}${String(x.wrong_of_answered_pct).padEnd(11)}${`${x.suggested + x.suggested_wrong}(${x.suggested})`.padEnd(18)}${x.handoff_pct}`);
  return out.join("\n");
}
