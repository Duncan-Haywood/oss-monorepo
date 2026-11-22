// Count colour claims left unmet (FIDE C.12 mild-or-stronger, C.13 strong) on the boards that touch
// one score bracket, ours against the published round, and who floats out of it with which claim.
//   node eval/swiss-bracket-colours.mjs <fixtures> <event-prefix> <round> <score>
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseTrf } from "../trf.mjs";
import { colourClaim } from "../swiss.mjs";
import { pairRound } from "./swiss-replay.mjs";

const [dir, evPrefix, rStr, sStr] = process.argv.slice(2);
const k = Number(rStr), s0 = Number(sStr);
const cr = join(dir, "chess_results");
const ev = readdirSync(cr).find((e) => e.startsWith(evPrefix));
const manifest = JSON.parse(readFileSync(join(cr, ev, "published_pairings.json"), "utf8"));
const r = manifest.rounds.find((x) => x.round_number === k);
const trf = parseTrf(readFileSync(join(cr, ev, r.trf), "utf8"));
const games = r.published_pairings.filter(([, b]) => b != null).map(([w, b]) => [Number(w), Number(b)]);
const seated = new Set(games.flat());
const noBoard = trf.players.map((p) => p.id).filter((id) => !seated.has(id));
const ours = pairRound(trf, k, noBoard, { withScores: true });
const sc = ours.scores;
const byId = new Map(trf.players.map((p) => [p.id, p]));
const claim = (id) => {
  const cols = byId.get(id).rounds.slice(0, k - 1).map((b) => b?.colour).filter((c) => c === "W" || c === "B");
  return colourClaim({ whites: cols.filter((c) => c === "W").length, blacks: cols.filter((c) => c === "B").length, last: cols });
};
const report = (name, boards) => {
  let mild = 0, strong = 0;
  const down = [];
  for (const [a, b] of boards) {
    if (sc.get(a) !== s0 && sc.get(b) !== s0) continue;
    if (sc.get(a) !== sc.get(b)) { const d = sc.get(a) > sc.get(b) ? a : b; if (sc.get(d) === s0) down.push(`${d}(${claim(d).colour}${claim(d).strength})`); continue; }
    const ca = claim(a), cb = claim(b);
    if (ca.colour && ca.colour === cb.colour) { mild++; if (Math.min(ca.strength, cb.strength) >= 2) strong++; }
  }
  console.log(`${name}: in-bracket boards with both claiming one colour ${mild} (strong ${strong}); down: ${down.join(" ")}`);
};
const due = { W: 0, B: 0 };
for (const [id, s] of sc) if (s === s0 && seated.has(id)) { const c = claim(id).colour; if (c) due[c]++; }
console.log(`${ev} round ${k}, bracket ${s0}: due white ${due.W}, due black ${due.B}`);
report("ours  ", ours.boards);
report("theirs", games);
