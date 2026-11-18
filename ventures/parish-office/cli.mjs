#!/usr/bin/env node
// Mass intentions book from the command line.
//
//   node cli.mjs book.json                 checks (default)
//   node cli.mjs book.json --csv           the c. 958 register as CSV
//   node cli.mjs book.json --book          book open intentions into free Masses (prints the new book JSON)
//   node cli.mjs book.json --summary 2026  year totals for the annual review
//   node cli.mjs --lump 10500 --offering 1000   c. 950: Masses from a lump sum (cents)
//   --today YYYY-MM-DD overrides the date; --json prints machine-readable output.
//
// Exit code: 0 no high findings, 1 at least one high finding, 2 bad input.
import { readFileSync } from "node:fs";
import { check, registerCsv, autoBook, yearSummary, massesFromLumpSum, money } from "./intentions.mjs";
import { pathToFileURL } from "node:url";

export const DISCLAIMER =
  "No warranty. Free and as-is. Not canonical, legal, tax, or financial advice; check your diocese's own rules and your pastor or chancery.";

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function run(argv, read = (p) => readFileSync(p, "utf8")) {
  const out = [];
  const today = arg(argv, "--today") || localToday();
  const json = argv.includes("--json");
  if (argv.includes("--help") || argv.length === 0) {
    return { code: 0, out: [readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"), DISCLAIMER].join("\n") };
  }
  try {
    if (argv.includes("--lump")) {
      const r = massesFromLumpSum(Number(arg(argv, "--lump")), Number(arg(argv, "--offering")));
      return { code: 0, out: json ? JSON.stringify(r) : `${r.masses} Masses, ${money(r.remainderCents)} left over (c. 950)` };
    }
    const file = argv.find((a, i) => !a.startsWith("--") && !(argv[i - 1] || "").match(/^--(today|summary|lump|offering)$/));
    if (!file) throw new Error("give a book JSON file");
    const book = JSON.parse(read(file));
    if (argv.includes("--csv")) return { code: 0, out: registerCsv(book, today).trimEnd() };
    if (argv.includes("--book")) {
      const r = autoBook(book, arg(argv, "--from") || today);
      if (!json) {
        for (const p of r.placed) out.push(`booked ${p.id} -> ${p.massId}`);
        for (const u of r.unplaced) out.push(`not booked ${u.id}: ${u.reason}`);
        out.push(JSON.stringify(r.book, null, 2));
        return { code: 0, out: out.join("\n") };
      }
      return { code: 0, out: JSON.stringify(r, null, 2) };
    }
    if (argv.includes("--summary")) {
      const s = yearSummary(book, arg(argv, "--summary"), today);
      if (json) return { code: 0, out: JSON.stringify(s, null, 2) };
      const line = (k) => `${k.padEnd(12)} ${String(s[k].count).padStart(4)}  ${money(s[k].cents)}`;
      return { code: 0, out: [`Intentions received in ${s.year} (as of ${today})`, ...["received", "celebrated", "transferred", "outstanding"].map(line), s.pastOneYear.length ? `past one year: ${s.pastOneYear.join(", ")}` : "none past one year"].join("\n") };
    }
    const fs = check(book, today);
    const code = fs.some((f) => f.severity === "high") ? 1 : 0;
    if (json) return { code, out: JSON.stringify(fs, null, 2) };
    if (!fs.length) out.push(`No findings as of ${today}.`);
    for (const f of fs) out.push(`[${f.severity}] c. ${String(f.canon).replace(".", " §")}: ${f.message}`);
    out.push("", DISCLAIMER);
    return { code, out: out.join("\n") };
  } catch (e) {
    return { code: 2, out: `error: ${e.message}` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = run(process.argv.slice(2));
  console.log(r.out);
  process.exitCode = r.code;
}
