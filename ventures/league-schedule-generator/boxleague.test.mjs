// Box league (boxleague.mjs): box sizes, results, standings, promotion and relegation between rounds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parsePlayersList, boxSizes, splitIntoBoxes, newLeague, boxFixtures, setResult, getResult, parseResults,
  boxStandings, roundProgress, nextBoxes, advance, roundText, standingsText, leagueCsv, checkLeague,
  encodeLeague, decodeLeague, scoreProblem,
} from "./boxleague.mjs";

const names = (n) => Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, "0")}`);

// Play every match in every box; the player seeded higher in the box wins 3-1 unless `flip` says otherwise.
function playAll(league, r, flip = () => false) {
  let l = league;
  for (const box of l.rounds[r].boxes) for (const [a, b] of boxFixtures(box)) {
    const res = setResult(l, r, a, b, flip(a, b) ? [1, 3] : [3, 1]);
    assert.equal(res.error, undefined, res.error);
    l = res.league;
  }
  return l;
}

test("box sizes: fewest boxes at or under the target, sizes within one, larger boxes on top, none under 3", () => {
  assert.deepEqual(boxSizes(20, 5), [5, 5, 5, 5]);
  assert.deepEqual(boxSizes(17, 5), [5, 4, 4, 4]);
  assert.deepEqual(boxSizes(21, 5), [5, 4, 4, 4, 4]);
  assert.deepEqual(boxSizes(7, 6), [4, 3]);
  assert.deepEqual(boxSizes(4, 6), [4]);
  assert.deepEqual(boxSizes(13, 4), [4, 3, 3, 3]);
  for (let n = 3; n <= 200; n++) for (let s = 3; s <= 8; s++) {
    const z = boxSizes(n, s);
    assert.equal(z.reduce((a, b) => a + b, 0), n, `n=${n} s=${s}`);
    assert.ok(Math.max(...z) - Math.min(...z) <= 1, `n=${n} s=${s}`);
    assert.ok(z.every((x) => x >= 3), `n=${n} s=${s} ${z}`);
    assert.ok(z.every((x, i) => i === 0 || x <= z[i - 1]));
    // The target holds whenever ceil(n/s) boxes keep every box at 3 or more; otherwise one box fewer.
    if (Math.floor(n / Math.ceil(n / s)) >= 3) {
      assert.equal(z.length, Math.ceil(n / s), `n=${n} s=${s}: fewest boxes`);
      assert.ok(Math.max(...z) <= s);
    } else assert.equal(Math.floor(n / (z.length + 1)) < 3, true, `n=${n} s=${s}: as many boxes as keep 3 each`);
  }
});

test("fixtures: every pair once per box, sizes 3 to 8", () => {
  for (let n = 3; n <= 8; n++) {
    const f = boxFixtures(names(n));
    assert.equal(f.length, (n * (n - 1)) / 2);
    assert.equal(new Set(f.map(([a, b]) => `${a}|${b}`)).size, f.length);
    assert.ok(f.every(([a, b]) => a < b));
  }
});

test("players list: duplicates refused, at least 3", () => {
  assert.deepEqual(parsePlayersList("Ana\nBen\nCy").errors, []);
  assert.match(parsePlayersList("Ana\nana\nCy").errors.join(), /listed twice/);
  assert.match(parsePlayersList("Ana, Ben").errors.join(), /at least 3/);
});

test("scores: best of 5 needs a 3-game winner; points scoring any two different numbers", () => {
  const g = newLeague({ players: names(5) }).rules;
  assert.equal(scoreProblem(g, 3, 1), "");
  assert.equal(scoreProblem(g, 2, 3), "");
  assert.match(scoreProblem(g, 3, 3), /winner/);
  assert.match(scoreProblem(g, 4, 1), /3 games/);
  assert.match(scoreProblem(g, 2, 1), /3 games/);
  const p = newLeague({ players: names(5), scoring: "points" }).rules;
  assert.equal(scoreProblem(p, 21, 17), "");
  assert.equal(scoreProblem(p, 6, 4), "");
  const b3 = newLeague({ players: names(5), bestOf: 3 }).rules;
  assert.equal(scoreProblem(b3, 2, 0), "");
  assert.match(scoreProblem(b3, 3, 0), /2 games/);
});

test("results only between two players in the same box; stored oriented, read back either way", () => {
  const l = newLeague({ players: names(10), size: 5 });
  assert.match(setResult(l, 0, "P01", "P06", [3, 0]).error, /not in the same box/);
  const { league } = setResult(l, 0, "P03", "P01", [3, 2]);
  assert.deepEqual(getResult(league.rounds[0], "P03", "P01"), [3, 2]);
  assert.deepEqual(getResult(league.rounds[0], "P01", "P03"), [2, 3]);
  const cleared = setResult(league, 0, "P01", "P03", null).league;
  assert.equal(getResult(cleared.rounds[0], "P01", "P03"), null);
  assert.equal(l.rounds[0].results["P01|P03"], undefined, "setResult does not mutate its input");
});

test("standings: points (win 3, loss 1, walkover 3/0), head-to-head between two level players", () => {
  let l = newLeague({ players: ["Ana", "Ben", "Cy", "Dee"], size: 4 });
  const r = parseResults(l, 0, "Ana 3-1 Ben\nBen beat Cy 3-0\nCy 3-2 Ana\nDee w/o Ana\nBen 3-2 Dee\nCy 1-3 Dee");
  assert.deepEqual(r.errors, []);
  assert.equal(r.count, 6);
  l = r.league;
  const t = boxStandings(l, 0, 0);
  const pts = Object.fromEntries(t.rows.map((x) => [x.player, x.pts]));
  // Ana: W(Ben) 3 + L(Cy) 1 + walkover loss 0 = 4; Ben: L 1 + W 3 + W 3 = 7; Cy: L 1 + W 3 + L 1 = 5; Dee: wo W 3 + L 1 + W 3 = 7.
  assert.deepEqual(pts, { Ana: 4, Ben: 7, Cy: 5, Dee: 7 });
  // Ben and Dee level on 7: Ben beat Dee 3-2, so Ben is first.
  assert.deepEqual(t.rows.map((x) => x.player), ["Ben", "Dee", "Cy", "Ana"]);
  assert.equal(t.done, 6);
  assert.equal(t.total, 6);
  const dee = t.rows.find((x) => x.player === "Dee");
  assert.equal(dee.wo, 1);
  assert.equal(dee.played, 2, "a walkover is not a played match");
});

test("standings: three level on points fall to game difference, then games won, then seeding", () => {
  // A beats B, B beats C, C beats A, all 3-0: everyone level on 4 points and +0 games; seeding decides.
  let l = newLeague({ players: ["A", "B", "C"], size: 3 });
  l = parseResults(l, 0, "A 3-0 B\nB 3-0 C\nC 3-0 A").league;
  assert.deepEqual(boxStandings(l, 0, 0).rows.map((x) => x.player), ["A", "B", "C"]);
  // Now C wins 3-1 instead: C +2-? Compute: A gf 3+1=4 ga 0+3=3 (+1); B gf 0+3=3 ga 3+0=3 (0); C gf 0+3=3 ga 3+1=4 (-1).
  l = parseResults(l, 0, "C 3-1 A").league;
  assert.deepEqual(boxStandings(l, 0, 0).rows.map((x) => x.player), ["A", "B", "C"]);
  l = parseResults(l, 0, "B 3-2 C\nA 3-2 B").league;
  // A: gf 3+1=4? A v B 3-2, A v C 1-3: gf 4 ga 5 (-1). B: 2-3 v A, 3-2 v C: gf 5 ga 5 (0). C: 2-3 v B, 3-1 v A: gf 5 ga 4 (+1).
  assert.deepEqual(boxStandings(l, 0, 0).rows.map((x) => x.player), ["C", "B", "A"]);
});

test("a bonus point per game won, and points scoring", () => {
  let l = newLeague({ players: ["A", "B", "C"], size: 3, perGame: 1 });
  l = parseResults(l, 0, "A 3-2 B").league;
  const t = boxStandings(l, 0, 0);
  assert.deepEqual(t.rows.map((x) => [x.player, x.pts]), [["A", 6], ["B", 3], ["C", 0]]);
  let p = newLeague({ players: ["A", "B", "C"], size: 3, scoring: "points" });
  p = parseResults(p, 0, "A 21-19 B\nB 21-5 C\nC 21-18 A").league;
  // Everyone 4 points; differences A -1, B +14, C -13.
  assert.deepEqual(boxStandings(p, 0, 0).rows.map((x) => x.player), ["B", "A", "C"]);
});

test("pasted results: name typos and bad scores are named by line; other lines still land", () => {
  const l = newLeague({ players: ["Ana Ruiz", "Ben", "Cy", "Dee"], size: 4 });
  const r = parseResults(l, 0, "Ana Ruiz 3-1 Ben\nAnna 3-0 Cy\nBen 3-3 Cy\nhello\nCy walkover Dee");
  assert.equal(r.count, 2);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /Line 2: no player called "Anna"/);
  assert.match(r.errors[1], /Line 3: .*winner/);
  assert.match(r.errors[2], /Line 4/);
});

test("next boxes: one up and one down at each boundary, with the order within each new box", () => {
  let l = newLeague({ players: names(15), size: 5 });
  l = playAll(l, 0); // seeds hold: each box finishes in seeded order
  const nb = nextBoxes(l, 0);
  assert.deepEqual(nb.errors, []);
  assert.deepEqual(nb.warnings, []);
  assert.deepEqual(nb.boxes, [
    ["P01", "P02", "P03", "P04", "P06"],
    ["P05", "P07", "P08", "P09", "P11"],
    ["P10", "P12", "P13", "P14", "P15"],
  ]);
  assert.equal(nb.moves.length, 4);
  assert.match(nb.text, /P05: box 1 -> box 2 \(place 5 of 5, down\)/);
  assert.match(nb.text, /P11: box 3 -> box 2 \(place 1 of 5, up\)/);
});

test("two up, two down; upsets move the right players", () => {
  let l = newLeague({ players: names(12), size: 4, up: 2 });
  // In box 2 (P05-P08) the bottom seed P08 wins everything.
  l = playAll(l, 0, (a, b) => b === "P08");
  const nb = nextBoxes(l, 0);
  assert.deepEqual(nb.boxes[0], ["P01", "P02", "P08", "P05"]);
  assert.deepEqual(nb.boxes[1], ["P03", "P04", "P09", "P10"]);
  assert.deepEqual(nb.boxes[2], ["P06", "P07", "P11", "P12"]);
});

test("a player who played nothing goes down; a tie on a movement line is reported", () => {
  let l = newLeague({ players: names(15), size: 5 });
  // Box 2: P07 plays nobody (every match of theirs unplayed); everything else seeded wins.
  for (const box of l.rounds[0].boxes) for (const [a, b] of boxFixtures(box)) {
    if (a === "P07" || b === "P07") continue;
    l = setResult(l, 0, a, b, [3, 1]).league;
  }
  const nb = nextBoxes(l, 0);
  assert.ok(nb.moves.some((m) => m.player === "P07" && /no match played/.test(m.why)));
  assert.ok(nb.boxes[2].includes("P07"));
  assert.match(nb.warnings.join("\n"), /Box 2: 4 of 10 matches not played/);
  const stay = nextBoxes(l, 0, { inactive: "stay" });
  assert.ok(!stay.moves.some((m) => m.player === "P07" && /no match played/.test(m.why)));
});

test("a tie on points across the promotion line is named", () => {
  let l = newLeague({ players: ["A", "B", "C", "D", "E", "F"], size: 3 });
  // Box 2 (D, E, F): a cycle, all 3-0, so D/E/F level on 4 points and seeding decides who goes up.
  l = parseResults(l, 0, "A 3-0 B\nA 3-0 C\nB 3-0 C\nD 3-0 E\nE 3-0 F\nF 3-0 D").league;
  const nb = nextBoxes(l, 0);
  assert.match(nb.warnings.join("\n"), /Box 2: D and E are level on 4 points across a movement line; decided on seeding/);
});

test("joiners and leavers: boxes re-even, joiners land at the foot of the box asked for", () => {
  let l = newLeague({ players: names(15), size: 5 });
  l = playAll(l, 0);
  const nb = nextBoxes(l, 0, { leaving: ["P02", "P13"], joining: "Newbie: 1\nLate" });
  assert.deepEqual(nb.errors, []);
  const flat = nb.boxes.flat();
  assert.equal(flat.length, 15);
  assert.ok(!flat.includes("P02") && !flat.includes("P13"));
  assert.ok(nb.boxes[0].includes("Newbie"));
  assert.equal(nb.boxes[2].at(-1), "Late");
  assert.match(nb.text, /P02: leaves \(was box 1\)/);
  assert.match(nb.text, /Late: new, box 3/);
  assert.match(nextBoxes(l, 0, { joining: "P03" }).errors.join(), /already in the league/);
  // Shrinking to 12 players with size 5: 3 boxes of 4.
  const shrink = nextBoxes(l, 0, { leaving: ["P01", "P02", "P03"] });
  assert.deepEqual(shrink.boxes.map((b) => b.length), [4, 4, 4]);
  assert.ok(shrink.moves.some((m) => /keep the boxes even/.test(m.why)));
});

test("advance: closes the round, dates roll on, only the latest round", () => {
  let l = newLeague({ players: names(10), size: 5, weeks: 4, start: "2026-01-05" });
  assert.equal(l.rounds[0].end, "2026-02-01");
  l = playAll(l, 0);
  const a = advance(l, 0);
  assert.deepEqual(a.errors, []);
  assert.equal(a.league.rounds.length, 2);
  assert.equal(a.league.rounds[0].closed, true);
  assert.equal(a.league.rounds[1].start, "2026-02-02");
  assert.equal(a.league.rounds[1].end, "2026-03-01");
  assert.match(advance(a.league, 0).errors.join(), /latest round/);
  assert.deepEqual(checkLeague(a.league), []);
});

test("long run: 37 players, 12 rounds of random results keep every player once and boxes even", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let l = newLeague({ players: names(37), size: 5, up: 2, down: 1 });
  for (let r = 0; r < 12; r++) {
    for (const box of l.rounds[r].boxes) for (const [a, b] of boxFixtures(box)) {
      const u = rnd();
      if (u < 0.1) continue;
      l = setResult(l, r, a, b, u < 0.15 ? { wo: a } : u < 0.6 ? [3, Math.floor(rnd() * 3)] : [Math.floor(rnd() * 3), 3]).league;
    }
    const adv = advance(l, r);
    assert.deepEqual(adv.errors, []);
    l = adv.league;
    const z = l.rounds[r + 1].boxes.map((b) => b.length);
    assert.equal(z.reduce((a, b) => a + b, 0), 37);
    assert.ok(Math.max(...z) - Math.min(...z) <= 1);
    assert.equal(new Set(l.rounds[r + 1].boxes.flat()).size, 37);
  }
  assert.deepEqual(checkLeague(l), []);
});

test("text, CSV and links", () => {
  let l = newLeague({ players: ["Ana", "Ben", "=Cy", "Dee"], size: 4, name: "Club box league", start: "2026-03-02" });
  l = parseResults(l, 0, "Ana 3-1 Ben\nAna w/o Dee").league;
  const rt = roundText(l, 0);
  assert.match(rt, /^Club box league: Round 1 \(2026-03-02 to 2026-03-29\)/);
  assert.match(rt, /Ana 3-1 Ben/);
  assert.match(rt, /Ana wins by walkover/);
  assert.match(standingsText(l, 0), /1\. Ana  6 pts  W2 L0  games 3-1/);
  const csv = leagueCsv(l);
  assert.match(csv, /^round,box,player_a/);
  assert.match(csv, /,'=Cy,/, "a formula-looking name is defused in the CSV");
  assert.deepEqual(roundProgress(l, 0), { done: 2, total: 6 });
  const back = decodeLeague(encodeLeague(l));
  assert.deepEqual(back.league, l);
  assert.match(decodeLeague("not-a-link").error, /damaged|Not a box/);
  const bad = structuredClone(l);
  bad.rounds[0].results["Ana|Ben"] = [3, 3];
  assert.match(checkLeague(bad).join(), /winner/);
});

test("page wires the module, carries the disclaimer, tracking and links", () => {
  const html = readFileSync(new URL("./box-league.html", import.meta.url), "utf8");
  assert.match(html, /from "\.\/boxleague\.mjs"/);
  assert.match(html, /from "\.\/usage\.mjs"/);
  assert.match(html, /No warranty/);
  assert.match(html, /<link rel="canonical" href="\.\/box-league\.html">/);
  for (const f of ["index.html", "sitemap.xml", "llms.txt", "how-to-run-a-box-league.html"]) {
    assert.match(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /box-league\.html/, f);
  }
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /how-to-run-a-box-league\.html/);
});

test("the guide's worked example is what the module computes", () => {
  const html = readFileSync(new URL("./how-to-run-a-box-league.html", import.meta.url), "utf8");
  const players = ["Ana", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kai", "Lou", "Max", "Ned"];
  let l = newLeague({ players, size: 5 });
  assert.deepEqual(l.rounds[0].boxes.map((b) => b.length), [5, 5, 4]);
  // Seeds win every match except the upsets named in the guide.
  const upsets = new Set(["Ana|Cy", "Dee|Eli", "Fay|Jo", "Gus|Jo", "Hal|Jo", "Kai|Ned", "Lou|Ned", "Max|Ned"]);
  for (const box of l.rounds[0].boxes) for (const [a, b] of boxFixtures(box)) l = setResult(l, 0, a, b, upsets.has(`${a}|${b}`) ? [1, 3] : [3, 1]).league;
  const nb = nextBoxes(l, 0);
  const tables = l.rounds[0].boxes.map((_, b) => boxStandings(l, 0, b).rows.map((x) => x.player).join(", "));
  for (const t of tables) assert.ok(html.includes(t), `guide shows the box order ${t}`);
  for (const b of nb.boxes) assert.ok(html.includes(b.join(", ")), `guide shows the new box ${b.join(", ")}`);
  assert.ok(html.includes(nb.text), "guide shows the move list as the page prints it");
  for (const n of [14, 17, 20, 21]) assert.ok(html.includes(`<tr><td>${n}</td><td>${boxSizes(n, 5).join(", ")}</td><td>${boxSizes(n, 4).join(", ")}</td></tr>`), `size table row ${n}`);
  assert.match(nb.warnings.join(), /Jo and Fay .* head-to-head/);
});

test("a no-show above the relegation place still drops, and the box below sends one more up", () => {
  // loss = 0, so P10 (lost every match) and P07 (played none) are both on 0 points; seeding puts P07 above P10.
  let l = newLeague({ players: names(15), size: 5, loss: 0 });
  for (const box of l.rounds[0].boxes) for (const [a, b] of boxFixtures(box)) {
    if (a === "P07" || b === "P07") continue;
    l = setResult(l, 0, a, b, [3, 1]).league;
  }
  assert.deepEqual(boxStandings(l, 0, 1).rows.slice(-2).map((x) => x.player), ["P07", "P10"]);
  const nb = nextBoxes(l, 0);
  assert.deepEqual(nb.boxes[1], ["P05", "P08", "P09", "P11", "P12"]);
  assert.match(nb.text, /P12: box 3 -> box 2 \(place 2 of 5, up to fill a no-show's place\)/);
  assert.ok(nb.boxes[2].includes("P07") && nb.boxes[2].includes("P10"), "both drop");
  assert.ok(nb.boxes[1].includes("P11") && nb.boxes[1].includes("P12"), "the top two of box 3 go up");
  assert.equal(nb.boxes[2].at(-1), "P07", "the no-show is seeded last in the box it drops to");
});
