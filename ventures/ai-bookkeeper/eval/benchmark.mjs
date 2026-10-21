// Learning-curve benchmark on SYNTHETIC data (eval/synth.mjs): a year of lines
// for a made-up studio, imported a month at a time. Before each month, every
// earlier line is confirmed with its true account, as a person correcting the
// review queue would. For the month just imported it counts:
//   auto      lines posted with no review, and how many of those were wrong
//   suggested lines in review with a suggestion, and how many were right
//   blank     lines in review with no suggestion
// Transfers paired across accounts are counted as their own row.
//
//   node ventures/ai-bookkeeper/eval/benchmark.mjs [--seeds 5] [--auto 0.85] [--json]
import { generateYear, toCsv } from "./synth.mjs";
import { newBooks, importStatement, confirm } from "../engine.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const SEEDS = +arg("--seeds", 5), AUTO = +arg("--auto", 0.85);
const where = { checking: "1000", card: "2000" };

export function runSeed(seed, autoPost = AUTO, extra = {}) {
  const lines = generateYear({ seed });
  let books = newBooks();
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const these = lines.filter((l) => l.date.slice(5, 7) === mm);
    for (const w of ["checking", "card"]) books = importStatement(books, toCsv(these, w), where[w], { autoPost, invert: w === "card", ...extra }).books;
    const truth = new Map();
    // Ids are assigned by import; recover each line's truth by matching on fields.
    const key = (t) => `${t.account}|${t.date}|${t.cents}|${t.desc}`;
    const pool = new Map();
    for (const l of these) { const k = `${where[l.account]}|${l.date}|${l.cents}|${l.desc.trim().replace(/\s+/g, " ")}`; pool.set(k, [...(pool.get(k) ?? []), l.truth]); }
    const row = { month: mm, lines: 0, auto: 0, autoWrong: 0, transfer: 0, transferWrong: 0, suggested: 0, suggestedRight: 0, blank: 0, bySource: {} };
    const choices = {};
    for (const t of books.transactions) {
      if (t.date.slice(5, 7) !== mm || t.status === "confirmed") continue;
      const list = pool.get(key(t));
      const tr = list.shift();
      truth.set(t.id, tr);
      row.lines++;
      choices[t.id] = tr;
      if (t.status === "auto") { row.auto++; if (t.posted !== tr) row.autoWrong++; }
      else if (t.status === "transfer") { row.transfer++; if (t.posted !== tr) row.transferWrong++; }
      else if (t.suggestion?.account) {
        row.suggested++;
        const src = (row.bySource[t.suggestion.source] ??= { n: 0, right: 0 });
        src.n++;
        if (t.suggestion.account === tr) { row.suggestedRight++; src.right++; }
      } else row.blank++;
    }
    books = confirm(books, choices);
    months.push(row);
  }
  return months;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = Array.from({ length: SEEDS }, (_, i) => runSeed(i + 1));
  const sum = (m, k) => all.reduce((a, s) => a + s[m][k], 0);
  const table = all[0].map((_, m) => ({ month: all[0][m].month, lines: sum(m, "lines"), auto: sum(m, "auto"), autoWrong: sum(m, "autoWrong"), transfer: sum(m, "transfer"), transferWrong: sum(m, "transferWrong"), suggested: sum(m, "suggested"), suggestedRight: sum(m, "suggestedRight"), blank: sum(m, "blank") }));
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ seeds: SEEDS, autoPost: AUTO, table }, null, 2)); process.exit(0); }
  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
  console.log(`Synthetic studio, ${SEEDS} seeds, auto-post at ${AUTO}. Each month is categorised with every earlier month confirmed.\n`);
  console.log("month | lines | posted alone | wrong of those | transfers | suggested right | no suggestion");
  for (const r of table) console.log(`${r.month} | ${r.lines} | ${pct(r.auto, r.lines)} | ${r.autoWrong} (${pct(r.autoWrong, r.auto)}) | ${r.transfer} (${r.transferWrong} wrong) | ${r.suggestedRight}/${r.suggested} (${pct(r.suggestedRight, r.suggested)}) | ${pct(r.blank, r.lines)}`);
  const late = table.slice(3);
  const L = late.reduce((a, r) => a + r.lines, 0), A = late.reduce((a, r) => a + r.auto, 0), W = late.reduce((a, r) => a + r.autoWrong, 0), T = late.reduce((a, r) => a + r.transfer, 0);
  const S = late.reduce((a, r) => a + r.suggested, 0), SR = late.reduce((a, r) => a + r.suggestedRight, 0), B = late.reduce((a, r) => a + r.blank, 0);
  console.log(`\nMonths 4-12: ${pct(A, L)} posted alone (${pct(W, A)} of them wrong), ${pct(T, L)} paired transfers, review suggestions right ${pct(SR, S)}, no suggestion ${pct(B, L)}.`);
}
