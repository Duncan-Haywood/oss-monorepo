// Print one missed bracket side by side: each player at the first differing score with their
// colour history and floats, then our boards and the published ones that touch that bracket.
//   node eval/swiss-bracket-dump.mjs <fixtures> <event-prefix> <round>
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseTrf } from "../trf.mjs";
import { pairRound } from "./swiss-replay.mjs";

const [dir, evPrefix, rStr] = process.argv.slice(2);
const k = Number(rStr);
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
const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const theirsK = new Set(games.map(([a, b]) => key(a, b)));
const oursK = new Set(ours.boards.map(([a, b]) => key(a, b)));
const top = (a, b) => Math.max(sc.get(a), sc.get(b));
const diff = [...games.filter(([a, b]) => !oursK.has(key(a, b))), ...ours.boards.filter(([a, b]) => !theirsK.has(key(a, b)))];
const s0 = process.argv[5] != null ? Number(process.argv[5]) : Math.max(...diff.map(([a, b]) => top(a, b)));
const byId = new Map(trf.players.map((p) => [p.id, p]));
const hist = (id) => {
  const p = byId.get(id);
  let col = "", fl = "";
  for (let i = 0; i < k - 1; i++) {
    const b = p.rounds[i];
    col += b?.colour ?? "-";
  }
  return col;
};
// Floats: compare pre-round scores; recompute scores per round from the file.
const pre = (id, upto) => {
  const p = byId.get(id); let s = 0;
  for (let i = 0; i < upto; i++) { const b = p.rounds[i]; if (!b) continue; s += /[1WF+U]/.test(b.result) ? 1 : /[=DH]/.test(b.result) ? 0.5 : 0; }
  return s;
};
const floats = (id) => {
  const p = byId.get(id); let f = "";
  for (let i = Math.max(0, k - 3); i < k - 1; i++) {
    const b = p.rounds[i];
    if (!b) { f += "."; continue; }
    if (b.opponent == null) { f += /[UF]/.test(b.result) ? "D" : "."; continue; }
    const o = trf.players[b.opponent].id;
    const a = pre(id, i), c = pre(o, i);
    f += a > c ? "D" : a < c ? "U" : "=";
  }
  return f;
};
const inB = [...sc.keys()].filter((i) => sc.get(i) === s0 && seated.has(i)).sort((a, b) => a - b);
console.log(`${ev} round ${k}, bracket ${s0}: ${inB.length} players`);
for (const id of inB) console.log(`  ${String(id).padStart(4)} ${byId.get(id).rating ?? ""} col ${hist(id).padEnd(k)} floats(r-2,r-1) ${floats(id)}`);
const touch = (bs) => bs.filter(([a, b]) => sc.get(a) === s0 || sc.get(b) === s0).map(([a, b]) => `${a}(${sc.get(a)})-${b}(${sc.get(b)})${oursK.has(key(a, b)) && theirsK.has(key(a, b)) ? "" : " *"}`);
console.log("ours:   " + touch(ours.boards).join("  "));
console.log("theirs: " + touch(games).join("  "));
