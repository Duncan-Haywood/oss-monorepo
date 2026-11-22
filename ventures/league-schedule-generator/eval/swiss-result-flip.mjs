// Was a round paired on a different result than the file shows? For each chess-results round whose
// boards the replay misses (condition "played", rounds 2+), change one earlier game's result at a time
// (each of the other two outcomes), replay the round, and list every change that gives the published
// boards exactly. A result entered or corrected after the round was paired leaves exactly this mark.
// The search is round-check.mjs checkRound, run to the end (every candidate, not the first hit).
//   node eval/swiss-result-flip.mjs <fixtures> [event-prefix round] [--radius R]
// Each try is one full replay (about a second on a 275-player event).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseTrf } from "../trf.mjs";
import { checkRound } from "../round-check.mjs";

const args = process.argv.slice(2);
const ri = args.indexOf("--radius");
const radius = ri >= 0 ? Number(args[ri + 1]) : 0.5;
const [dir, evPrefix, rStr] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--radius");
const cr = join(dir, "chess_results");
for (const ev of readdirSync(cr).sort()) {
  if (evPrefix && !ev.startsWith(evPrefix)) continue;
  const manifest = JSON.parse(readFileSync(join(cr, ev, "published_pairings.json"), "utf8"));
  for (const r of manifest.rounds) {
    const k = r.round_number;
    if (k < 2 || (rStr && k !== Number(rStr))) continue;
    // The file published after round k carries round k's games (the manifest's own file is the one
    // the round was paired from); fall back to that one with the published boards when there is none.
    const next = manifest.rounds.find((x) => x.round_number === k + 1) ?? manifest.rounds.at(-1);
    const trf = parseTrf(readFileSync(join(cr, ev, next.trf), "utf8"));
    if (trf.errors.length || !trf.players.some((p) => p.rounds[k - 1])) continue;
    const t0 = Date.now();
    const o = checkRound(trf, k, { radius, stopAfter: Infinity });
    if (o.error) { console.log(`${ev} r ${k}: ${o.error}`); continue; }
    if (o.matched === o.total && o.byeMatches) continue;
    console.log(`${ev} round ${k}: replay matches ${o.matched} of ${o.total} boards; first miss at ${o.firstMiss}; tried ${o.tried} result changes (games touching a player within ${radius} of it) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    for (const e of o.explanations) console.log(`  EXACT: round ${e.round} ${e.white}-${e.black} ${e.was} read as ${e.now}`);
    if (!o.explanations.length) console.log("  no single result change gives the published boards");
  }
}
