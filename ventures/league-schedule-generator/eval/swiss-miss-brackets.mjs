// Where do the bracket pairer's misses start? For each chess-results round (condition "played")
// whose boards differ from the published ones, find the highest score bracket with a differing
// board and say whether the two pairings already disagree on WHO floats out of the brackets above
// and including it (stage A: C.5-C.7, downfloater choice) or only on who meets whom (stage B:
// colours, exchanges, Dutch order).
//   node eval/swiss-miss-brackets.mjs <swisspairing>/benchmarks/fixtures [--pairing bracket]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseTrf } from "../trf.mjs";
import { pairRound } from "./swiss-replay.mjs";

const dir = process.argv[2];
const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const cr = join(dir, "chess_results");
const tally = { rounds: 0, missed: 0, floaters: 0, partners: 0 };
const lines = [];
for (const ev of existsSync(cr) ? readdirSync(cr).sort() : []) {
  const manifest = JSON.parse(readFileSync(join(cr, ev, "published_pairings.json"), "utf8"));
  for (const r of manifest.rounds) {
    if (r.round_number < 2) continue;
    const trf = parseTrf(readFileSync(join(cr, ev, r.trf), "utf8"));
    if (trf.errors.length) continue;
    const games = r.published_pairings.filter(([, b]) => b != null).map(([w, b]) => [Number(w), Number(b)]);
    const seated = new Set(games.flat());
    const noBoard = trf.players.map((p) => p.id).filter((id) => !seated.has(id));
    const ours = pairRound(trf, r.round_number, noBoard, { withScores: true });
    tally.rounds++;
    const sc = ours.scores;
    const theirsK = new Set(games.map(([a, b]) => key(a, b)));
    const oursK = new Set(ours.boards.map(([a, b]) => key(a, b)));
    const top = (a, b) => Math.max(sc.get(a), sc.get(b));
    const diffTops = [...games.filter(([a, b]) => !oursK.has(key(a, b))), ...ours.boards.filter(([a, b]) => !theirsK.has(key(a, b)))].map(([a, b]) => top(a, b));
    if (!diffTops.length) continue;
    tally.missed++;
    const s0 = Math.max(...diffTops);
    // Who leaves each bracket at or above s0 downwards: players whose partner scores lower.
    const floats = (boards) => new Set(boards.filter(([a, b]) => sc.get(a) !== sc.get(b) && top(a, b) >= s0)
      .map(([a, b]) => (sc.get(a) > sc.get(b) ? a : b)).sort((x, y) => x - y));
    const fo = floats(ours.boards), ft = floats(games);
    const same = fo.size === ft.size && [...fo].every((x) => ft.has(x));
    if (same) tally.partners++; else tally.floaters++;
    const n = [...sc.keys()].filter((i) => seated.has(i) && sc.get(i) === s0).length;
    lines.push(`${ev.slice(0, 40).padEnd(40)} r${String(r.round_number).padStart(2)} ${ours.method === "bracket" ? "" : "[" + ours.method + "] "}first diff at score ${s0} (${n} there) ${same ? "partners" : "FLOATERS"}${same ? "" : `  ours down [${[...fo].join(",")}] theirs [${[...ft].join(",")}]`}`);
  }
}
console.log(lines.join("\n"));
console.log(`\nrounds 2+: ${tally.rounds}, with a differing board: ${tally.missed}; first difference is who floats: ${tally.floaters}, only who meets whom: ${tally.partners}`);
