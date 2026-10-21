// Render the synthetic studio's checking lines the way a PDF statement pastes
// (MM/DD description amount balance, amounts unsigned) and read them back:
// does every cents value and every direction survive? Direction here comes only
// from the running balance, the hardest case. Synthetic text, not a real PDF.
import { generateYear } from "./synth.mjs";
import { readStatement } from "../bank.mjs";

const fmt = (c, signed = false) => (signed && c < 0 ? "-" : "") + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let rows = 0, wrong = 0, seeds = +(process.argv[2] ?? 5);
for (let seed = 1; seed <= seeds; seed++) {
  const lines = generateYear({ seed }).filter((l) => l.account === "checking").sort((a, b) => a.date.localeCompare(b.date));
  let bal = 100000;
  const out = ["Business checking", "Statement period: January 1, 2026 through December 31, 2026", `Beginning balance ${fmt(bal, true)}`];
  for (const l of lines) { bal += l.cents; const [, m, d] = l.date.split("-"); out.push(`${m}/${d} ${l.desc.padEnd(40)} ${fmt(l.cents).padStart(10)} ${fmt(bal, true).padStart(12)}`); }
  const r = readStatement(out.join("\n"));
  rows += lines.length;
  if (r.rows.length !== lines.length) { wrong += Math.abs(lines.length - r.rows.length); console.log(`seed ${seed}: ${lines.length} lines written, ${r.rows.length} read`); }
  if (w && (x.cents !== w.cents || x.date !== w.date || x.desc.replace(/\s+/g, " ") !== w.desc.replace(/\s+/g, " "))) wrong++; });
}
console.log(`${seeds} seeds, ${rows} rows, ${wrong} wrong (cents, date or description)`);
process.exitCode = wrong ? 1 : 0;
