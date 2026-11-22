import { test } from "node:test";
import assert from "node:assert/strict";
import { pairNext } from "./swiss-page.mjs";
import { parseSwissResults } from "./calc.mjs";
import { parseTrf, swissToTrf } from "./trf.mjs";
import { checkRound, recordedRound, replayRound, withResult } from "./round-check.mjs";

const players = Array.from({ length: 14 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`);

// A deterministic result for each board: the higher seed wins, except every third board is drawn.
const resultLines = (round, n) => [`# Round ${n}`, ...round.pairs.map((p, k) => {
  const w = players[p.white], b = players[p.black];
  if (k % 3 === 2) return `${w} 1 - 1 ${b}`;
  return p.white < p.black ? `${w} 1 - 0 ${b}` : `${w} 0 - 1 ${b}`;
}), ...(round.bye == null ? [] : [`${players[round.bye]} bye`])].join("\n");

/** Pair `rounds` rounds from scratch; returns the results text. */
function play(rounds, edit = null) {
  let text = "";
  for (let n = 1; n <= rounds; n++) {
    const out = pairNext(players, text);
    assert.ok(!out.error, out.error);
    text += (text ? "\n" : "") + resultLines(out.round, n);
    if (edit && n === edit.after) text = edit.fn(text);
  }
  return text;
}

const toTrf = (text) => parseTrf(swissToTrf(players, parseSwissResults(text, players), { name: "Test" }));

test("a round the pairer made checks clean: every board, colour and the bye", () => {
  const trf = toTrf(play(4));
  for (const k of [2, 3, 4]) {
    const o = checkRound(trf, k);
    assert.equal(o.error, undefined);
    assert.equal(o.matched, o.total, `round ${k}`);
    assert.equal(o.sameColours, o.total);
    assert.ok(o.byeMatches);
    assert.equal(o.tried, 0);
  }
});

test("recordedRound reads a round's boards white first, the pairing bye, and who sat out", () => {
  const trf = toTrf(play(2));
  const r = recordedRound(trf, 2);
  assert.equal(r.boards.length, 7);
  for (const [w, b] of r.boards) {
    const p = trf.players.find((x) => x.id === w);
    assert.equal(p.rounds[1].colour, "W");
    assert.equal(trf.players[p.rounds[1].opponent].id, b);
  }
  assert.equal(r.bye, null);
  assert.deepEqual(r.absent, []);
  // The replay of a round from its own file gives the same boards.
  const again = replayRound(trf, 2, r.absent);
  assert.deepEqual(again.boards.map((b) => b.join("-")).sort(), r.boards.map((b) => b.join("-")).sort());
});

test("a result corrected after the next round was paired is named as the explanation", () => {
  // Round 3 is paired on the original round-2 results; afterwards one round-2 game is corrected.
  // Find a game whose correction changes round 3, so the file's round 3 no longer replays.
  const base = play(2);
  const lines = base.split("\n");
  const r2 = lines.findIndex((l) => l === "# Round 2");
  let found = null;
  for (let i = r2 + 1; i < lines.length && !found; i++) {
    const m = lines[i].match(/^(\S+) (\d) - (\d) (\S+)$/);
    if (!m) continue;
    for (const alt of ["1 - 0", "0 - 1", "1 - 1"]) {
      if (alt === `${m[2]} - ${m[3]}`) continue;
      const corrected = lines.map((l, j) => (j === i ? `${m[1]} ${alt} ${m[4]}` : l)).join("\n");
      const paired = pairNext(players, base).round;
      const file = toTrf(corrected + "\n" + resultLines(paired, 3));
      const o = checkRound(file, 3, { stopAfter: Infinity });
      if (o.matched < o.total) { found = { o, white: m[1], black: m[4], was: `${m[2]} - ${m[3]}`, alt }; break; }
    }
  }
  assert.ok(found, "some round-2 correction changes round 3");
  const { o, white, black } = found;
  assert.ok(o.firstMiss != null);
  assert.ok(o.explanations.length >= 1, "the corrected game is found");
  const ids = (name) => players.indexOf(name) + 1;
  const hit = o.explanations.find((e) => e.round === 2 && [e.white, e.black].sort().join() === [ids(white), ids(black)].sort().join());
  assert.ok(hit, `explanations ${JSON.stringify(o.explanations)} include ${white}-${black}`);
  assert.equal(hit.matched, o.total);
});

test("withResult changes both players' result blocks and nothing else", () => {
  const trf = toTrf(play(2));
  const p = trf.players.find((x) => x.rounds[0]?.colour === "W");
  const q = trf.players[p.rounds[0].opponent];
  const t = withResult(trf, 1, p.id, q.id, "=");
  assert.equal(t.players.find((x) => x.id === p.id).rounds[0].result, "=");
  assert.equal(t.players.find((x) => x.id === q.id).rounds[0].result, "=");
  const t2 = withResult(trf, 1, p.id, q.id, "0");
  assert.equal(t2.players.find((x) => x.id === q.id).rounds[0].result, "1");
  // The original is untouched.
  assert.notEqual(trf.players.find((x) => x.id === p.id).rounds[0], t.players.find((x) => x.id === p.id).rounds[0]);
});

test("a round with no games in the file is an error, not a check", () => {
  const trf = toTrf(play(2));
  assert.match(checkRound(trf, 3).error, /no games/);
});
