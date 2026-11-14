#!/usr/bin/env node
// Count ranked ballots from a file or stdin: instant runoff, STV and Schulze.
//   node cli.mjs ballots.csv [--seats N] [--seed N] [--json] [--csv]
//   cat ballots.txt | node cli.mjs - --seats 3
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyze, reportCsv, fmt, PAPERS } from "./ballots.mjs";

const USAGE = "usage: node cli.mjs <ballots file | -> [--seats N] [--seed N] [--json] [--csv]\n\nMethods: instant runoff; STV with the Droop quota and weighted inclusive Gregory transfers; Schulze.\n" +
  PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. doi:${p.doi}`).join("\n");

export function textReport(r) {
  if (r.error) return `${r.error}\n`;
  const out = [];
  const p = r.parsed;
  out.push(`${p.total} ballots (${p.distinct} distinct), ${p.candidates.length} candidates, read as ${p.format}.`);
  for (const w of r.warnings) out.push(`Note: ${w}`);
  out.push("", `Instant runoff winner: ${r.irv.winner ?? "none"}`);
  r.irv.rounds.forEach((x, i) => out.push(`  Round ${i + 1}: ${Object.entries(x.votes).map(([c, v]) => `${c} ${v}`).join(", ")}; exhausted ${x.exhausted}. ${x.action}`));
  out.push("", `STV, ${r.stv.seats} seat${r.stv.seats > 1 ? "s" : ""}, quota ${r.stv.quota}: elected ${r.stv.elected.join(", ")}`);
  r.stv.rounds.forEach((x, i) => out.push(`  Stage ${i + 1}: ${Object.entries(x.votes).map(([c, v]) => `${c} ${fmt(v)}`).join(", ")}; exhausted ${fmt(x.exhausted)}. ${x.action}`));
  out.push("", `Schulze ranking: ${r.schulze.ranking.map((g) => g.join(" = ")).join(" > ")}`);
  out.push(`Condorcet winner (beats every other head to head): ${r.schulze.condorcetWinner ?? "none, the head-to-head results form a cycle or tie"}`);
  out.push(`Most first preferences: ${r.plurality.join(", ")}`);
  return out.join("\n") + "\n";
}

export function main(argv, stdin = () => readFileSync(0, "utf8")) {
  const args = argv.slice();
  const flag = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
  const bool = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
  const seats = flag("--seats");
  const seed = flag("--seed");
  const json = bool("--json");
  const csv = bool("--csv");
  if (bool("--help") || bool("-h")) return { code: 0, out: USAGE + "\n" };
  if (args.length !== 1) return { code: 2, out: USAGE + "\n" };
  const text = args[0] === "-" ? stdin() : readFileSync(args[0], "utf8");
  const r = analyze({ ballots: text, seats: seats ?? 1, seed: seed === undefined ? 1 : Number(seed) });
  const out = json ? JSON.stringify(r, null, 2) + "\n" : csv && !r.error ? reportCsv(r) : textReport(r);
  return { code: r.error ? 1 : 0, out };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { code, out } = main(process.argv.slice(2));
    process.stdout.write(out);
    process.exitCode = code;
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    process.exitCode = 2;
  }
}
