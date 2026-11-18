import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseBallots, parseRank, parseCsv, irv, stv, schulze, pairwise, reportCsv, fmt, UNIT, EXAMPLE } from "./ballots.mjs";

const lines = (...l) => l.join("\n");

// Worked examples whose answers do not come from this engine: the four-city
// and 45-voter profiles and their results are as Wikipedia's "Instant-runoff
// voting" and "Schulze method" articles give them (the pairwise counts and
// strongest paths below were recomputed by a separate Python count), and the
// 20-ballot STV election was counted by hand.

test("IRV and Condorcet disagree on the four-city example (Wikipedia, Instant-runoff voting / Condorcet method)", () => {
  const r = analyze(EXAMPLE);
  assert.equal(r.parsed.total, 100);
  assert.equal(r.irv.winner, "Knoxville");
  assert.deepEqual(r.irv.rounds.map((x) => x.eliminated).filter(Boolean), ["Chattanooga", "Nashville"]);
  assert.equal(r.irv.rounds.at(-1).votes.Knoxville, 58);
  assert.equal(r.schulze.condorcetWinner, "Nashville");
  assert.deepEqual(r.schulze.winners, ["Nashville"]);
  assert.deepEqual(r.plurality, ["Memphis"]);
  assert.deepEqual(r.warnings, []);
  assert.match(r.summary, /Instant runoff elects Knoxville after 3 rounds/);
  assert.match(r.summary, /Nashville beats every other candidate head to head, though instant runoff elects Knoxville/);
});

test("Schulze's 45-voter example ranks E > A > C > B > D (Schulze 2011; Wikipedia, Schulze method)", () => {
  const r = analyze({ ballots: lines("5: A>C>B>E>D", "5: A>D>E>C>B", "8: B>E>D>A>C", "3: C>A>B>E>D", "7: C>A>E>B>D", "2: C>B>A>D>E", "7: D>C>E>B>A", "8: E>B>A>D>C") });
  assert.deepEqual(r.schulze.ranking, [["E"], ["A"], ["C"], ["B"], ["D"]]);
  assert.equal(r.schulze.condorcetWinner, null);
  const names = r.parsed.candidates;
  const d = r.schulze.pairwise;
  const at = (a, b) => d[names.indexOf(a)][names.indexOf(b)];
  // Pairwise counts and strongest paths, recomputed outside this engine.
  assert.equal(at("A", "B"), 20); assert.equal(at("B", "A"), 25);
  assert.equal(at("A", "C"), 26); assert.equal(at("C", "A"), 19);
  assert.equal(at("E", "D"), 31); assert.equal(at("D", "E"), 14);
  const p = r.schulze.strongestPaths;
  const sp = (a, b) => p[names.indexOf(a)][names.indexOf(b)];
  assert.equal(sp("E", "A"), 25); assert.equal(sp("A", "E"), 24);
});

test("a 20-ballot, 3-seat STV food election counted by hand elects Chocolate, Orange, Strawberry", () => {
  // Quota floor(20/4)+1 = 6. Chocolate 12, surplus 6 at value 1/2: Strawberry
  // 1+4 = 5, Bonbon 1+2 = 3. Pear (2) out, Orange 4+2 = 6 elected. Bonbon (3)
  // out, its papers exhaust; Strawberry is the last hopeful for the last seat.
  const r = analyze({ ballots: lines("4: Orange", "2: Pear > Orange", "8: Chocolate > Strawberry", "4: Chocolate > Bonbon", "1: Strawberry", "1: Bonbon"), seats: 3 });
  assert.equal(r.stv.quota, 6);
  assert.deepEqual(r.stv.elected, ["Chocolate", "Orange", "Strawberry"]);
  const afterSurplus = r.stv.rounds.find((x) => x.transfer);
  assert.equal(afterSurplus.transfer.value, 0.5);
  assert.equal(fmt(afterSurplus.votes.Strawberry), "5");
  assert.equal(fmt(afterSurplus.votes.Bonbon), "3");
});

// Parsing.

test("ranks are read from numbers, ordinals and form headers", () => {
  for (const [s, n] of [["1", 1], ["2nd", 2], ["Rank 3", 3], ["3rd choice", 3], ["First preference", 1], ["Choice 4", 4], ["Rank the candidates [1st choice]", 1], ["tenth", 10]]) assert.equal(parseRank(s), n, s);
  for (const s of ["", "Alice", "0", "Timestamp", "2026-11-14"]) assert.equal(parseRank(s), null, s);
});

test("CSV reader handles quotes, embedded commas, CRLF and tabs", () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n'), [["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  assert.deepEqual(parseCsv("x\ty\n1\t2"), [["x", "y"], ["1", "2"]]);
});

test("preference lines: counts, ties with =, repeated and blank lines", () => {
  const p = parseBallots(lines("# comment", "3: A > B = C", "B > A > B", "", "2 * C"));
  assert.deepEqual(p.candidates, ["A", "B", "C"]);
  assert.equal(p.total, 6);
  assert.deepEqual(p.ballots[0], { ranking: [[0], [1, 2]], count: 3 });
  assert.deepEqual(p.ballots[1].ranking, [[1], [0]]);
  assert.ok(p.warnings.some((w) => /twice/.test(w)));
  assert.ok(p.warnings.some((w) => /same rank/.test(w)));
});

test("preference lines where most voters rank only one candidate are still preference lines", () => {
  const p = parseBallots(lines("A", "B", "C", "A > B"));
  assert.equal(p.format, "preference lines");
  assert.deepEqual(p.candidates, ["A", "B", "C"]);
});

test("Google Forms grid export: candidate columns hold ranks, timestamp ignored", () => {
  const csv = lines(
    "Timestamp,Rank the candidates [Ana],Rank the candidates [Ben],Rank the candidates [Cy]",
    "2026/11/01 10:00:00,1st choice,2nd choice,3rd choice",
    "2026/11/01 10:05:00,3rd choice,1st choice,",
    '2026/11/01 10:09:00,2,2,1',
  );
  const p = parseBallots(csv);
  assert.match(p.format, /grid/);
  assert.deepEqual(p.candidates, ["Ana", "Ben", "Cy"]);
  assert.deepEqual(p.ballots.map((b) => b.ranking), [[[0], [1], [2]], [[1], [0]], [[2], [0, 1]]]);
  assert.ok(p.warnings.some((w) => /Timestamp/.test(w)));
});

test("a numbered ID column is not read as a candidate", () => {
  const p = parseBallots(lines("ID,Vote [Ana],Vote [Ben]", "1,1,2", "2,2,1", "3,1,"));
  assert.deepEqual(p.candidates, ["Ana", "Ben"]);
  assert.equal(p.total, 3);
});

test("rank-column export: columns named by rank, read in rank order, skipped ranks close up", () => {
  const csv = lines("Timestamp,Choice [2nd],Choice [1st],Choice [3rd]", "t,Ben,Ana,Cy", "t,,Cy,Ana", "t,Ana,,");
  const p = parseBallots(csv);
  assert.match(p.format, /rank columns/);
  assert.deepEqual(p.ballots.map((b) => b.ranking.map((g) => p.candidates[g[0]])), [["Ana", "Ben", "Cy"], ["Cy", "Ana"], ["Ana"]]);
  assert.ok(p.warnings.some((w) => /skip/.test(w)));
});

test("plain CSV rows of names; names match case-insensitively and keep the first spelling", () => {
  const p = parseBallots(lines("Ana,Ben", "ben , ANA", "  ana  "));
  assert.deepEqual(p.candidates, ["Ana", "Ben"]);
  assert.equal(p.total, 3);
});

test("blank ballots are left out and reported", () => {
  const p = parseBallots(lines("Timestamp,Rank 1,Rank 2", "t,Ana,Ben", "t,,", "t,Ben,"));
  assert.equal(p.total, 2);
  assert.ok(p.warnings.some((w) => /blank/.test(w)));
});

test("empty and one-candidate inputs give an error, not a count", () => {
  assert.match(analyze({ ballots: "" }).error, /No ballots/);
  assert.match(analyze({ ballots: "Ana\nAna" }).error, /one candidate/);
});

// Counting rules.

test("IRV: a majority of live ballots, not of all ballots, wins once ballots exhaust", () => {
  const r = irv(parseBallots(lines("4: A", "3: B > A", "2: C", "2: D > C")));
  // Round 1: A4 B3 C2 D2; D (tie with C, broken by lot or history) goes; ...
  assert.equal(r.winner, "A");
  const last = r.rounds.at(-1);
  assert.ok(last.votes.A * 2 > last.active);
});

test("IRV: a tie for last uses earlier rounds before drawing lots", () => {
  // Round 1: A3 B2 C2 D1. D's ballot goes to B, so B3 C2: C is last. Then B and A.
  const r = irv(parseBallots(lines("3: A", "2: B", "2: C > B", "1: D > B")));
  assert.equal(r.rounds[0].eliminated, "D");
  assert.equal(r.rounds[1].eliminated, "C");
  // A tie in round 2 that round 1 separates: E and F both on 2 in round 2, E had fewer in round 1.
  const t = irv(parseBallots(lines("5: A", "4: B", "1: E", "1: G > E", "2: F")));
  assert.equal(t.rounds[0].eliminated, "G");
  assert.equal(t.rounds[1].eliminated, "E");
  assert.match(t.rounds[1].tie, /earlier-round/);
  assert.equal(t.rounds[1].byLot, false);
});

test("IRV: the lot is reproducible from its seed", () => {
  const p = parseBallots(lines("A > C", "B > C", "2: C"));
  const a = irv(p, { seed: 7 }), b = irv(p, { seed: 7 });
  assert.deepEqual(a, b);
  assert.equal(a.rounds[0].byLot, true);
  const outs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => irv(p, { seed }).rounds[0].eliminated));
  assert.deepEqual([...outs].sort(), ["A", "B"]);
});

test("IRV: an equal ranking at the next live choice exhausts the ballot", () => {
  const r = irv(parseBallots(lines("2: A", "2: B", "1: C > A = B")));
  assert.equal(r.rounds[1].exhausted, 1);
});

test("STV with one seat elects the IRV winner (examples)", () => {
  const p = parseBallots(EXAMPLE.ballots);
  assert.deepEqual(stv(p, 1).elected, ["Knoxville"]);
});

test("STV elects everyone left when hopefuls equal seats left, and caps seats at candidates", () => {
  const r = stv(parseBallots(lines("A", "B")), 5);
  assert.equal(r.seats, 2);
  assert.deepEqual(r.elected.sort(), ["A", "B"]);
});

test("STV surplus values are truncated to 5 decimals and the residue is reported", () => {
  // 3 seats, 10 ballots, quota 3. A has 7, surplus 4, transfer value 4/7.
  const r = stv(parseBallots(lines("7: A > B", "2: C", "1: D")), 3);
  const t = r.rounds.find((x) => x.transfer);
  assert.equal(t.transfer.value, 4 / 7);
  assert.equal(t.votes.B, 7 * Math.floor((UNIT * 4) / 7));
  assert.equal(t.transfer.lostToRounding, 4 * UNIT - 7 * Math.floor((UNIT * 4) / 7));
  assert.deepEqual(r.elected, ["A", "B", "C"]);
});

// Properties on random elections.

function randomElection(seed, nCand, nBallots) {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const names = Array.from({ length: nCand }, (_, i) => String.fromCharCode(65 + i));
  const out = [];
  for (let i = 0; i < nBallots; i++) {
    const order = names.slice().sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * nCand));
    out.push(`${1 + Math.floor(rand() * 4)}: ${order.join(rand() < 0.08 ? " = " : " > ")}`);
  }
  return out.join("\n");
}

test("properties: votes are conserved in every round, IRV = 1-seat STV winner, Schulze picks the Condorcet winner", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const nCand = 2 + (seed % 6);
    const text = randomElection(seed, nCand, 5 + (seed % 40));
    const p = parseBallots(text);
    if (p.candidates.length < 2) continue;
    const i = irv(p, { seed });
    for (const r of i.rounds) assert.equal(Object.values(r.votes).reduce((a, b) => a + b, 0) + r.exhausted, p.total, `irv seed ${seed}`);
    const seats = 1 + (seed % Math.min(3, p.candidates.length));
    const s = stv(p, seats, { seed });
    assert.equal(s.elected.length, seats, `stv seats seed ${seed}`);
    assert.equal(new Set(s.elected).size, seats);
    for (const r of s.rounds) assert.equal(Object.values(r.votes).reduce((a, b) => a + b, 0) + r.exhausted + r.lost, p.total * UNIT, `stv conservation seed ${seed}`);
    // Without lots, IRV and 1-seat STV must name the same winner.
    const one = stv(p, 1, { seed });
    if (!i.rounds.some((r) => r.byLot) && !one.rounds.some((r) => r.byLot)) assert.deepEqual(one.elected, [i.winner], `irv vs stv seed ${seed}`);
    const sc = schulze(p);
    if (sc.condorcetWinner) assert.deepEqual(sc.winners, [sc.condorcetWinner], `condorcet seed ${seed}`);
    const d = pairwise(p);
    for (let a = 0; a < d.length; a++) for (let b = 0; b < d.length; b++) if (a !== b) assert.ok(d[a][b] + d[b][a] <= p.total);
  }
});

test("CSV report has the three tables and guards spreadsheet formulas", () => {
  const r = analyze({ ballots: lines("2: @cmd > B", "B > @cmd") });
  const csv = reportCsv(r);
  assert.match(csv, /^Instant runoff round/m);
  assert.match(csv, /STV stage/);
  assert.match(csv, /^Ballots ranking row over column/m);
  assert.doesNotMatch(csv, /(^|,)@cmd/m);
});
