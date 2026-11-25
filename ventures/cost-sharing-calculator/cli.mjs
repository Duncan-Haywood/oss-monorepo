#!/usr/bin/env node
// Fair cost sharing from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs groups.csv [--game cost|value]
//   node cli.mjs road.csv --mode road [--total 18000]
//   node cli.mjs claims.csv --mode claims --estate 200
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, PAPERS, fmt } from "./engine.mjs";

export const HELP = `cost-sharing-calculator: who should pay what for something shared (Shapley value, nucleolus, core; Shapley 1953, Schmeidler 1969)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Modes:
  --mode coalitions   (default) one row per group: members joined with +, then its cost
                        A,100
                        A+B,170
                        A+B+C,250
                      Every member needs a row of their own and the whole group needs one;
                      a group left out is priced as the cheapest way to split it.
                      --game value  the numbers are gains (profits, savings) instead of costs
  --mode road         one row per member: name, how far along the shared road (pipe,
                      runway, trench) they need it. --total is the cost of the full length
                      (default: the distances are costs). Each stretch is split among those
                      who use it (Littlechild & Owen 1973).
  --mode claims       one row per claimant: name, amount claimed. --estate is what there is
                      to divide (less than the claims). Talmud rule = nucleolus (Aumann &
                      Maschler 1985), random arrival = Shapley value (O'Neill 1982).

Options:
  --unit '$'          prefix for amounts in the text output
  --csv               one row per member, one column per method
  --json              the full JSON result
  --help              this text

Core: a division is in the core when no subgroup would pay less (or get more) on
its own. The output names the subgroup a division overcharges most.

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. doi:${p.doi}`).join("\n")}

Arithmetic on the numbers you give, not legal, tax or financial advice; a court,
contract or statute may require a different division. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/cost-sharing-calculator/`;

const FLAGS = { "--mode": "mode", "--game": "game", "--total": "total", "--estate": "estate", "--unit": "unit" };

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (FLAGS[a]) {
      if (val === undefined) {
        val = argv[++i];
        if (val === undefined) throw new Error(`${a} needs a value`);
      }
      const key = FLAGS[a];
      if (key === "total" || key === "estate") {
        const v = Number(String(val).replace(/[$,]/g, ""));
        if (!Number.isFinite(v)) throw new Error(`${a} needs a number, got "${val}"`);
        o[key] = v;
      } else if (key === "mode" && !["coalitions", "road", "claims"].includes(val)) throw new Error(`--mode is coalitions, road or claims, got "${val}"`);
      else if (key === "game" && !["cost", "value"].includes(val)) throw new Error(`--game is cost or value, got "${val}"`);
      else o[key] = val;
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

export function formatText(r) {
  const u = r.unit || "";
  const out = [r.summary, ""];
  for (const w of r.warnings) out.push(`Note: ${w}`);
  if (r.warnings.length) out.push("");
  const shown = r.methods.filter((m) => m.x);
  const w = Math.max(8, ...r.players.map((p) => p.length));
  const own = r.mode === "claims" ? "claim" : "alone";
  out.push(["member".padEnd(w), own.padStart(12), ...shown.map((m) => m.id.padStart(14))].join(" "));
  r.players.forEach((p, i) => {
    const sa = r.mode === "claims" ? r.claims[i] : r.standalone[i];
    out.push([p.padEnd(w), fmt(sa).padStart(12), ...shown.map((m) => fmt(m.x[i]).padStart(14))].join(" "));
  });
  out.push("");
  for (const m of r.methods) {
    const core = m.inCore === undefined ? "" : m.inCore ? "in the core" : `not in the core: ${m.worst[0].group} ${r.game === "value" || r.mode === "claims" ? "would get" : "would save"} ${u}${fmt(m.worst[0].overpay)} on their own${m.blocking > 1 ? ` (${m.blocking} subgroups do better alone)` : ""}`;
    out.push(`${m.name}: ${m.x ? core : `not shown: ${m.note}`}`);
  }
  if (r.segments) {
    out.push("", "Stretches (each split equally among the members who use it):");
    for (const s of r.segments) out.push(`  ${fmt(s.from, 0)} to ${fmt(s.to, 0)}: ${u}${fmt(s.cost)} over ${s.users} = ${u}${fmt(s.each)} each`);
  }
  return out.join("\n");
}

export function run(argv, stdinText = "") {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: `Error: ${e.message}\n\n${HELP}` };
  }
  if (o.help) return { code: 0, out: HELP };
  let csv = stdinText;
  try {
    if (o.file && o.file !== "-") csv = readFileSync(o.file, "utf8");
  } catch (e) {
    return { code: 2, out: `Error: cannot read ${o.file}: ${e.message}` };
  }
  if (!csv || !csv.trim()) return { code: 2, out: `Error: no input given (pass a file or pipe one in).\n\n${HELP}` };
  const input = { csv };
  for (const k of Object.values(FLAGS)) if (o[k] !== undefined) input[k] = o[k];
  const r = analyze(input);
  if (r.error) return { code: 1, out: `Error: ${r.error}` };
  if (o.json) return { code: 0, out: JSON.stringify(r, null, 2) };
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  return { code: 0, out: formatText(r) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const flagWithValue = new Set(Object.keys(FLAGS));
  const hasFile = argv.some((a, i) => !a.startsWith("-") && !flagWithValue.has(argv[i - 1]));
  const needsStdin = !argv.includes("--help") && !argv.includes("-h") && !hasFile;
  const finish = (text) => {
    const { code, out } = run(argv, text);
    process.stdout.write(out + "\n");
    process.exitCode = code;
  };
  if (needsStdin && !process.stdin.isTTY) {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => finish(buf));
  } else finish("");
}
