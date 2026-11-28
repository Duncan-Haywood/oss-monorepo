// Learning-curve benchmark on SYNTHETIC data (eval/synth.mjs): a year of lines
// for a made-up studio, imported a month at a time. Before each month, every
// earlier line is confirmed with its true account, as a person correcting the
// review queue would. For the month just imported it counts:
//   auto      lines posted with no review, and how many of those were wrong
//   suggested lines in review with a suggestion, and how many were right
//   blank     lines in review with no suggestion
// Transfers paired across accounts are counted as their own row.
//
//   node ventures/ai-bookkeeper/eval/benchmark.mjs [--seeds 5] [--auto 0.85] [--json] [--readme]
// --readme rewrites the README's learning-curve table and its summary (between the
// benchmark:start and benchmark:end markers) from this run; benchmark-readme.test.mjs
// fails when the README no longer matches, so the table cannot drift again (it did
// for four quality audits, 2026-11-07 to 2026-11-28).
import { generateYear, toCsv } from "./synth.mjs";
import { newBooks, importStatement, confirm } from "../engine.mjs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

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

export function benchmarkTable(seeds = SEEDS, autoPost = AUTO) {
  const all = Array.from({ length: seeds }, (_, i) => runSeed(i + 1, autoPost));
  const sum = (m, k) => all.reduce((a, s) => a + s[m][k], 0);
  return all[0].map((_, m) => ({ month: all[0][m].month, lines: sum(m, "lines"), auto: sum(m, "auto"), autoWrong: sum(m, "autoWrong"), transfer: sum(m, "transfer"), transferWrong: sum(m, "transferWrong"), suggested: sum(m, "suggested"), suggestedRight: sum(m, "suggestedRight"), blank: sum(m, "blank") }));
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
const n = (x) => x.toLocaleString("en-US");

// The README's table and summary paragraph, as Markdown, from benchmarkTable().
export function readmeBlock(table, seeds = SEEDS) {
  const rows = table.map((r) => `| ${r.month} | ${r.lines} | ${pct(r.auto, r.lines)} | ${r.autoWrong ? `${r.autoWrong} (${pct(r.autoWrong, r.auto)})` : "0"} | ${r.transfer} (${r.transferWrong} wrong) | ${r.suggestedRight}/${r.suggested} (${pct(r.suggestedRight, r.suggested)}) | ${pct(r.blank, r.lines)} |`);
  const late = table.slice(3), tot = (k, t = late) => t.reduce((a, r) => a + r[k], 0);
  const L = tot("lines"), A = tot("auto"), W = tot("autoWrong"), T = tot("transfer"), TW = tot("transferWrong"), S = tot("suggested"), SR = tot("suggestedRight"), B = tot("blank");
  const m1 = table[0];
  return [
    "| month | lines | posted alone | wrong of those | transfers | review suggestions right | no suggestion |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    `Over months 4 to 12, ${n(A)} of ${n(L)} lines posted alone (${pct(A, L)}), and ${n(W)} of those`,
    `${n(A)} went to the wrong account. ${n(T)} transfer lines were paired, ${TW ? `${n(TW)} wrongly` : "none wrongly"}.`,
    `${n(SR)} of ${n(S)} review suggestions were right (${pct(SR, S)}), and ${n(B)} lines (${pct(B, L)}) had no`,
    `suggestion. Month 1, with nothing learned yet, had ${m1.suggestedRight} of ${m1.suggested} built-in suggestions right`,
    `(${pct(m1.suggestedRight, m1.suggested)}). In total: ${seeds} seeds, ${n(tot("lines", table))} lines, about one second.`,
  ].join("\n");
}

export const README = fileURLToPath(new URL("../README.md", import.meta.url));
export const START = "<!-- benchmark:start (generated: node eval/benchmark.mjs --readme) -->", END = "<!-- benchmark:end -->";
export function readmeSection(text = readFileSync(README, "utf8")) {
  const i = text.indexOf(START), j = text.indexOf(END);
  if (i < 0 || j < i) throw new Error("README has no benchmark:start/benchmark:end markers");
  return { before: text.slice(0, i + START.length), body: text.slice(i + START.length, j).trim(), after: text.slice(j) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const table = benchmarkTable();
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ seeds: SEEDS, autoPost: AUTO, table }, null, 2)); process.exit(0); }
  if (process.argv.includes("--readme")) {
    const sec = readmeSection();
    writeFileSync(README, `${sec.before}\n${readmeBlock(table)}\n${sec.after}`);
    console.log(`README benchmark table rewritten from ${SEEDS} seeds.`);
    process.exit(0);
  }
  console.log(`Synthetic studio, ${SEEDS} seeds, auto-post at ${AUTO}. Each month is categorised with every earlier month confirmed.\n`);
  console.log("month | lines | posted alone | wrong of those | transfers | suggested right | no suggestion");
  for (const r of table) console.log(`${r.month} | ${r.lines} | ${pct(r.auto, r.lines)} | ${r.autoWrong} (${pct(r.autoWrong, r.auto)}) | ${r.transfer} (${r.transferWrong} wrong) | ${r.suggestedRight}/${r.suggested} (${pct(r.suggestedRight, r.suggested)}) | ${pct(r.blank, r.lines)}`);
  const late = table.slice(3);
  const L = late.reduce((a, r) => a + r.lines, 0), A = late.reduce((a, r) => a + r.auto, 0), W = late.reduce((a, r) => a + r.autoWrong, 0), T = late.reduce((a, r) => a + r.transfer, 0);
  const S = late.reduce((a, r) => a + r.suggested, 0), SR = late.reduce((a, r) => a + r.suggestedRight, 0), B = late.reduce((a, r) => a + r.blank, 0);
  console.log(`\nMonths 4-12: ${pct(A, L)} posted alone (${pct(W, A)} of them wrong), ${pct(T, L)} paired transfers, review suggestions right ${pct(SR, S)}, no suggestion ${pct(B, L)}.`);
}
