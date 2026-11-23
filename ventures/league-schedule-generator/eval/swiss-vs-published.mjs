// Replays real Swiss events round by round through the page's pairer (`swissPairings`) and compares
// each round with the pairing that was actually used: the published pairings of six over-the-board
// events from chess-results.com (paired there by the arbiters' FIDE-endorsed programs; Aeroflot's
// regulations name Swiss-Manager), and three lichess.org Swiss events (lichess pairs with
// bbpPairings, a FIDE-endorsed Dutch engine).
//
// Data: github.com/gbtami/swisspairing (MIT, Bajusz Tamás), benchmarks/fixtures/, read as data and
// not copied into this repository. Fetch it with eval/swiss-vs-published-fetch.sh, then:
//
//   node eval/swiss-vs-published.mjs <fixtures-dir> [--json rows.jsonl] [--order legacy|lex|lex2]
//                                    [--pairing matching|bracket] [--exchange dutch|boundary]
//                                    [--no-mdp-first] [--no-transpose] (the 2026-11-22 changes off)
//                                    [--no-initial-colour] (ignore the manifest's drawn colour)
//
// Two conditions per round:
//   open   - the pre-round state as the file gives it; everyone not withdrawn is paired.
//   played - the players who had no board in the actual round (absent, not paired, or the
//            pairing-allocated bye) are entered as absent first, so the pairer pairs exactly the
//            players who played. This isolates the pairing rule from the arbiter's attendance list.
// Metrics: a round matches when every board is the same pair of players (colours aside); board
// recall is the share of actual boards the pairer reproduces; colour agreement is the share of
// reproduced boards where it gives the same player white (for chess-results, who had white is read
// from the next round's TRF, since 2026-11-23: the published lists are not in white-black order).
// A third condition, bye, scores who gets the pairing-allocated bye (eval/swiss-colour-truth.txt).

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseTrf } from "../trf.mjs";
import { pairRound } from "./swiss-replay.mjs";

const args = process.argv.slice(2);
const dir = args.find((a, i) => !a.startsWith("--") && !["--json", "--order", "--pairing", "--exchange"].includes(args[i - 1]));
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const orderAt = args.indexOf("--order");
const dutchOrder = orderAt >= 0 ? args[orderAt + 1] : undefined;
const pairingAt = args.indexOf("--pairing");
const pairing = pairingAt >= 0 ? args[pairingAt + 1] : undefined;
const exchangeAt = args.indexOf("--exchange");
const exchange = exchangeAt >= 0 ? args[exchangeAt + 1] : undefined;
const noInitial = args.includes("--no-initial-colour");
const pairOpts = { ...(args.includes("--no-mdp-first") ? { mdpFirst: false } : {}), ...(args.includes("--no-transpose") ? { transpose: false } : {}), ...(dutchOrder ? { dutchOrder } : {}), ...(pairing ? { pairing } : {}), ...(exchange ? { exchange } : {}) };
if (!dir || !existsSync(dir)) {
  console.error("usage: node eval/swiss-vs-published.mjs <swisspairing>/benchmarks/fixtures [--json out.jsonl]");
  process.exit(2);
}

const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function compare(ours, actualBoards, actualBye, colourTruth) {
  // colourTruth (chess-results): who had white on each board, read from the next round's TRF; the
  // published pairing lists are not in white-black order (they agree with the TRFs on 2,283 of
  // 4,549 boards, eval/swiss-colour-truth.txt), so without it colour is not scored.
  const theirs = new Map(actualBoards.map(([w, b]) => [key(w, b), colourTruth ? colourTruth.get(key(w, b)) : w]));
  let hit = 0, sameColour = 0, colourKnown = 0;
  for (const [w, b] of ours.boards) {
    const k = key(w, b);
    if (!theirs.has(k)) continue;
    hit++;
    if (theirs.get(k) === undefined) continue;
    colourKnown++;
    if (theirs.get(k) === w) sameColour++;
  }
  const exact = hit === actualBoards.length && ours.boards.length === actualBoards.length;
  return { boards: actualBoards.length, hit, sameColour, colourKnown, exact, byeMatch: actualBye === undefined ? null : ours.bye === actualBye };
}

const rows = [];
// Conditions: open and played as above; bye (rounds with one known pairing-allocated bye only) is
// played with the bye recipient left in, so the pairer must choose who sits out among exactly the
// players who played plus the one who got the bye.
function run(event, source, k, trf, actualBoards, noBoard, actualBye, colourTruth, initialColour) {
  const conditions = ["open", "played", ...(actualBye !== undefined ? ["bye"] : [])];
  for (const condition of conditions) {
    const row = { event, source, round: k, condition, players: trf.players.length };
    try {
      const t0 = performance.now();
      const absent = condition === "played" ? noBoard : condition === "bye" ? noBoard.filter((id) => id !== actualBye) : [];
      const ours = pairRound(trf, k, absent, { ...(initialColour ? { initialColour } : {}), ...pairOpts });
      row.ms = Math.round(performance.now() - t0);
      Object.assign(row, compare(ours, actualBoards, condition === "played" ? undefined : actualBye, colourTruth));
      if (condition === "bye") { row.byeOurs = ours.bye ?? null; row.byeActual = actualBye; }
      row.absentGiven = absent.length;
    } catch (e) {
      row.error = String(e.message).slice(0, 200);
    }
    rows.push(row);
  }
}

// 1. chess-results events: one pre-round TRF per round plus the published pairings.
const cr = join(dir, "chess_results");
for (const ev of existsSync(cr) ? readdirSync(cr).sort() : []) {
  const manifest = JSON.parse(readFileSync(join(cr, ev, "published_pairings.json"), "utf8"));
  // The event's drawn initial colour ("white1"/"black1"), which a pre-round-1 TRF does not carry.
  const initialColour = noInitial ? undefined : /^black/i.test(manifest.first_round_color ?? "") ? "B" : /^white/i.test(manifest.first_round_color ?? "") ? "W" : undefined;
  for (const [ri, r] of manifest.rounds.entries()) {
    const trf = parseTrf(readFileSync(join(cr, ev, r.trf), "utf8"));
    // Who had white in round k: the next round's pre-round TRF records it. After the last round
    // there is no next file, so the map stays empty and that round's colours are not scored.
    let colourTruth = new Map(), trfBye;
    const nextR = manifest.rounds[ri + 1];
    if (nextR) {
      const nxt = parseTrf(readFileSync(join(cr, ev, nextR.trf), "utf8"));
      for (const p of nxt.players) {
        const g = p.rounds[r.round_number - 1];
        if (g && g.opponent != null && g.colour === "W") colourTruth.set(key(p.id, nxt.players[g.opponent].id), p.id);
        if (g && g.opponent == null && g.result === "U") trfBye = p.id;
      }
    }
    if (trf.errors.length) { rows.push({ event: ev, round: r.round_number, error: trf.errors[0] }); continue; }
    const games = r.published_pairings.filter(([, b]) => b != null).map(([w, b]) => [Number(w), Number(b)]);
    const seated = new Set(games.flat());
    const noBoard = trf.players.map((p) => p.id).filter((id) => !seated.has(id));
    // The pairing-allocated bye: the next round's TRF records it (result U); for the last round, a
    // single null seat in an odd field is taken as the bye. With several nulls and no next file,
    // which one is the bye is not recorded, so no bye is scored then.
    const nulls = r.published_pairings.filter(([, b]) => b == null).map(([a]) => Number(a));
    const bye = nextR ? (trfBye !== undefined && nulls.includes(trfBye) ? trfBye : undefined) : nulls.length === 1 ? nulls[0] : undefined;
    run(ev, "chess-results", r.round_number, trf, games, noBoard, bye, colourTruth, initialColour);
  }
}

// 2. lichess events: the finished TRF; round k's actual pairing is read from the file itself.
const li = join(dir, "lichess");
for (const f of existsSync(li) ? readdirSync(li).filter((x) => x.endsWith(".trf")).sort() : []) {
  const trf = parseTrf(readFileSync(join(li, f), "utf8"));
  if (trf.errors.length) { rows.push({ event: f, error: trf.errors[0] }); continue; }
  const rounds = Math.max(...trf.players.map((p) => p.rounds.length));
  for (let k = 1; k <= rounds; k++) {
    const games = [];
    let bye;
    for (const p of trf.players) {
      const b = p.rounds[k - 1];
      if (!b) continue;
      if (b.opponent != null && b.colour === "W" && !/[+\-]/.test(b.result)) games.push([p.id, trf.players[b.opponent].id]);
      if (b.opponent == null && b.result === "U") bye = p.id;
    }
    if (!games.length) continue;
    const seated = new Set(games.flat());
    const noBoard = trf.players.map((p) => p.id).filter((id) => !seated.has(id));
    // Round 1 has no history; its colours follow the file's XXC line (lichess writes black1) since
    // 2026-11-23, and it is scored like any other round.
    run(f.replace(/^lichess_swiss_|\.trf$/g, ""), "lichess", k, trf, games, noBoard, bye ?? undefined);
  }
}

if (jsonOut) writeFileSync(jsonOut, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

// Summary
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(3) : "-");
function summary(label, rs) {
  const ok = rs.filter((r) => !r.error);
  const boards = ok.reduce((s, r) => s + r.boards, 0);
  const hit = ok.reduce((s, r) => s + r.hit, 0);
  const col = ok.reduce((s, r) => s + r.sameColour, 0);
  const known = ok.reduce((s, r) => s + (r.colourKnown ?? r.hit), 0);
  const exact = ok.filter((r) => r.exact).length;
  const later = ok.filter((r) => r.round > 1);
  const lb = later.reduce((s, r) => s + r.boards, 0), lh = later.reduce((s, r) => s + r.hit, 0), lc = later.reduce((s, r) => s + r.sameColour, 0), lk = later.reduce((s, r) => s + (r.colourKnown ?? r.hit), 0);
  console.log(`${label.padEnd(52)} rounds ${String(ok.length).padStart(3)} (err ${rs.length - ok.length})  exact ${String(exact).padStart(3)}  board recall ${fmt(hit / boards)} (${hit}/${boards})  rounds 2+: recall ${fmt(lh / lb)}, colour ${fmt(lc / lk)} (${lc}/${lk})  all colour ${fmt(col / known)}`);
}
for (const condition of ["open", "played"]) {
  console.log(`\n== condition: ${condition}`);
  const cs = rows.filter((r) => r.condition === condition);
  for (const ev of [...new Set(cs.map((r) => r.event))]) summary(ev, cs.filter((r) => r.event === ev));
  summary("ALL chess-results", cs.filter((r) => r.source === "chess-results"));
  summary("ALL lichess", cs.filter((r) => r.source === "lichess"));
}
const byes = rows.filter((r) => r.condition === "bye" && !r.error);
console.log(`\n== pairing bye, condition bye (played + the bye recipient): same bye ${byes.filter((r) => r.byeMatch).length} of ${byes.length}, exact ${byes.filter((r) => r.exact).length}`);
for (const r of byes) if (!r.byeMatch) console.log(`  ${r.event} r${r.round}: published bye ${r.byeActual}, pairer ${r.byeOurs}`);
console.log("\n== per round, condition played (exact? recall)");
for (const ev of [...new Set(rows.map((r) => r.event))]) {
  const cs = rows.filter((r) => r.event === ev && r.condition === "played");
  console.log(`${ev.slice(0, 44).padEnd(44)} ${cs.map((r) => (r.error ? "E" : `${r.exact ? "=" : "x"}${(r.hit / r.boards).toFixed(2)}`)).join(" ")}`);
}
const errs = rows.filter((r) => r.error);
if (errs.length) { console.log("\n== errors"); for (const r of errs.slice(0, 10)) console.log(r.event, r.round, r.condition, r.error); }
