import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePlayerLines, roundResultLines, pairNext, standingsNow, RESULTS } from "./swiss-page.mjs";
import { parseSwissResults } from "./calc.mjs";
import { parseTrf, trfToResults, swissToTrf } from "./trf.mjs";
import { swissStandings } from "./swiss.mjs";

test("player lines: ratings sort strongest first, unrated after in typed order", () => {
  const r = parsePlayerLines("Ana, 1500\nBen\nCy\t1890\nDee  1700\n# a note\n\nEve, 1500");
  assert.deepEqual(r.players, ["Cy", "Dee", "Ana", "Eve", "Ben"]);
  assert.deepEqual(r.ratings, [1890, 1700, 1500, 1500, null]);
  assert.deepEqual(r.errors, []);
  // No ratings: the typed order is the seed order, and a name with digits inside is kept whole.
  assert.deepEqual(parsePlayerLines("Board 7 Club\nAna\nBen").players, ["Board 7 Club", "Ana", "Ben"]);
  assert.match(parsePlayerLines("Ana\nana").errors.join(" "), /listed twice/);
  assert.match(parsePlayerLines("Ana").errors.join(" "), /at least two/);
});

test("a board's results become lines the pairer reads back as the same games", () => {
  const players = ["Ana", "Ben", "Cy", "Dee", "Eve"];
  const round = { pairs: [{ white: 0, black: 3 }, { white: 4, black: 1 }], bye: 2 };
  const { text, missing } = roundResultLines(players, round, ["d", "-+"], 1);
  assert.deepEqual(missing, []);
  assert.equal(text, "# Round 1\nAna 1 - 1 Dee\nEve forfeits to Ben\nCy bye");
  const parsed = parseSwissResults(text, players);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rounds, 1);
  assert.deepEqual(parsed.games, [{ a: 0, b: 3, ga: 1, gb: 1 }]);
  assert.deepEqual(parsed.byes, [2]);
  const table = swissStandings(players, parsed.games, parsed.byes, { extra: parsed.extra });
  const score = Object.fromEntries(table.map((r) => [r.name, r.score]));
  assert.deepEqual(score, { Ana: 0.5, Ben: 1, Cy: 1, Dee: 0.5, Eve: 0 });
  assert.deepEqual(roundResultLines(players, round, ["1-0"], 1).missing, [2]);
  assert.equal(RESULTS.length, 6);
});

test("a 15-player club night runs five rounds with no rematch and one bye each", () => {
  const { players } = parsePlayerLines(Array.from({ length: 15 }, (_, i) => `Player ${String.fromCharCode(65 + i)}, ${2000 - i * 37}`).join("\n"));
  let results = "";
  const met = new Set();
  const byes = new Set();
  const choices = ["1-0", "0-1", "d", "1-0", "0-1"];
  for (let r = 1; r <= 5; r++) {
    const out = pairNext(players, results);
    assert.ok(!out.error, out.error);
    assert.equal(out.roundNumber, r);
    assert.equal(out.totalRounds, 4);
    assert.equal(out.round.pairs.length, 7);
    for (const p of out.round.pairs) {
      const key = [p.white, p.black].sort((a, b) => a - b).join("-");
      assert.ok(!met.has(key), `rematch ${key} in round ${r}`);
      met.add(key);
    }
    assert.ok(!byes.has(out.round.bye), "second bye");
    byes.add(out.round.bye);
    const lines = roundResultLines(players, out.round, out.round.pairs.map((_, k) => choices[(k + r) % choices.length]), r);
    results += (results ? "\n" : "") + lines.text;
  }
  // Round 1 pairs the rating list top half against bottom half, top seed white on board 1.
  const first = pairNext(players, "").round.pairs[0];
  assert.deepEqual([first.white, first.black], [0, 7]);
  const table = standingsNow(players, results);
  assert.equal(table.rounds, 5);
  assert.equal(table.rows.reduce((s, r) => s + r.score, 0), 7 * 5 + 5);
});

test("a TRF written from the page's results reads back to the same event", () => {
  const players = ["Ana", "Ben", "Cy", "Dee"];
  let results = "";
  for (let r = 1; r <= 2; r++) {
    const out = pairNext(players, results);
    results += (results ? "\n" : "") + roundResultLines(players, out.round, ["1-0", "d"], r).text;
  }
  const parsed = parseSwissResults(results, players);
  const trf = swissToTrf(players, parsed, { name: "Club night", totalRounds: 3, standings: swissStandings(players, parsed.games, parsed.byes, { extra: parsed.extra }) });
  const back = trfToResults(parseTrf(trf));
  assert.equal(back.rounds, 2);
  const again = parseSwissResults(back.results, back.players);
  assert.equal(again.games.length, parsed.games.length);
  const next = pairNext(back.players, back.results);
  assert.ok(!next.error, next.error);
  assert.equal(next.roundNumber, 3);
});

test("errors come back as text, not exceptions", () => {
  assert.match(pairNext(["Ana", "Ben"], "Ana 1 - 0 Zed").error, /not one of the players/);
  assert.match(standingsNow(["Ana", "Ben"], "Zed bye").error, /not one of the players/);
});

test("swiss-pairing.html: disclaimer, usage events, honest measured claims, linked from the site", () => {
  const html = readFileSync(new URL("./swiss-pairing.html", import.meta.url), "utf8");
  assert.match(html, /<link rel="canonical" href="\.\/swiss-pairing\.html">/);
  assert.match(html, /from "\.\/swiss-page\.mjs"/);
  assert.match(html, /record\("swiss_page_paired"\)/);
  assert.match(html, /No warranty/);
  assert.match(html, /Not FIDE-endorsed/i);
  assert.match(html, /Turn usage counting off/);
  assert.match(html, /FSL-1.1-MIT licence/);
  // The accuracy figures must be the ones the replay file records.
  const replay = readFileSync(new URL("./eval/swiss-big-brackets.txt", import.meta.url), "utf8");
  assert.match(replay, /ALL chess-results\s+rounds\s+54 \(err 0\)\s+exact\s+51/);
  assert.match(html, /51 of 54/);
  for (const f of ["index.html", "sitemap.xml", "llms.txt", "how-to-run-a-swiss-tournament.html"]) {
    assert.match(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /swiss-pairing\.html/, f);
  }
});

test("pairNext passes the drawn colour: round 1 with 'B' puts the top seed on black", () => {
  const ps = ["Ana", "Ben", "Cy", "Dee"];
  const w = pairNext(ps, "", {});
  const b = pairNext(ps, "", { initialColour: "B" });
  assert.equal(w.round.pairs[0].white, 0);
  assert.equal(b.round.pairs[0].black, 0);
});
