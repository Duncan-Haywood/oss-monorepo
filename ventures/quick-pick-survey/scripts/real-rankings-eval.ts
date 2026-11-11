/**
 * Runs the survey's pair selector, Glicko-2 and pooled ranking on real
 * people's published rankings (src/lib/realRankings.ts) and prints the tables
 * in docs/REAL-RANKINGS.md.
 *
 *   npx tsx scripts/real-rankings-eval.ts [--seeds 40] [--lapse 0.1] [--rule overlap|difference] [--update-lapse 0.1] [--selectors shipped,staged]
 *
 * --update-lapse is the lapse share the Glicko update assumes (glicko2.ts;
 * 0, the default, is the published update the survey uses).
 *
 * The data are fetched from the PrefLib-Data repository at run time and pinned
 * by SHA-256; they are not committed here (that repository is GPL-3.0, and the
 * rankings belong to their collectors). Cached in $REAL_RANKINGS_CACHE or the
 * OS temp directory.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RANGE_RULES, type RangeRule } from "../src/lib/groupRanking";
import { parseSoc, summarise, type Selector } from "../src/lib/realRankings";

const BASE = "https://raw.githubusercontent.com/PrefLib/PrefLib-Data/main/datasets";
const DATASETS = [
  {
    key: "breakfast",
    title: "Breakfast items, overall preference (Green and Rao 1972; 42 people, 15 items)",
    path: "00035%20-%20breakfast/00035-00000002.soc",
    sha256: "f3043c0ccd971325ca1ebcfee43341583071b75a0cef912f0ea1cf44ba337d7c",
    respondents: [5, 10, 20, 30],
    budgets: [10, 20, 30, 45],
  },
  {
    key: "shirt",
    title: "T-shirt designs, a research group's vote (PrefLib 00012; 30 people, 11 designs)",
    path: "00012%20-%20shirt/00012-00000001.soc",
    sha256: "b1a8731e90a1c837f6f0c28749cc829b232f02209e3c9c14c3f96881dcf8cd77",
    respondents: [5, 10, 20],
    budgets: [10, 20, 30],
  },
];

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v) || v < 0) throw new Error(`${name} needs a number`);
  return v;
}

async function load(path: string, sha256: string): Promise<string> {
  const dir = process.env.REAL_RANKINGS_CACHE ?? join(tmpdir(), "quick-pick-real-rankings");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, sha256 + ".soc");
  let text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (!text) {
    const res = await fetch(`${BASE}/${path}`);
    if (!res.ok) throw new Error(`Fetch ${path}: HTTP ${res.status}`);
    text = await res.text();
  }
  const got = createHash("sha256").update(text).digest("hex");
  if (got !== sha256) throw new Error(`${path}: sha256 ${got}, expected ${sha256}`);
  writeFileSync(file, text);
  return text;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const f2 = (x: number) => x.toFixed(2);

async function main() {
  const seeds = arg("--seeds", 40);
  const lapse = arg("--lapse", 0);
  const updateLapse = arg("--update-lapse", 0);
  if (updateLapse >= 1) throw new Error("--update-lapse must be below 1");
  const ri = process.argv.indexOf("--rule");
  const rule = (ri < 0 ? "overlap" : process.argv[ri + 1]) as RangeRule;
  if (!RANGE_RULES.includes(rule)) throw new Error(`--rule must be one of ${RANGE_RULES.join(", ")}`);
  const ALL: Selector[] = ["shipped", "information", "staged", "random"];
  const si = process.argv.indexOf("--selectors");
  const selectors = si < 0 ? ALL : (process.argv[si + 1].split(",") as Selector[]);
  for (const s of selectors) if (!ALL.includes(s)) throw new Error(`--selectors takes ${ALL.join(", ")}`);
  console.log(`seeds ${seeds}, lapse ${lapse}, rule ${rule}${updateLapse ? `, update lapse ${updateLapse}` : ""}`);
  for (const d of DATASETS) {
    const panel = parseSoc(await load(d.path, d.sha256));
    console.log(`\n### ${d.title}\n`);
    console.log("| people | answers each | selector | Spearman vs others | vs sample | top pick right | rank range holds | range width | pairs ordered | ordered wrong |");
    console.log("|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const n of d.respondents) {
      for (const k of d.budgets) {
        for (const s of selectors) {
          const r = summarise(panel, n, k, s, seeds, lapse, rule, updateLapse);
          console.log(`| ${n} | ${k} | ${s} | ${f2(r.vsPanel)} | ${f2(r.vsSample)} | ${pct(r.top1)} | ${pct(r.rangeHolds)} | ${r.rangeWidth.toFixed(1)} of ${panel.names.length} | ${pct(r.ordered)} | ${pct(r.orderedWrong)} |`);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
