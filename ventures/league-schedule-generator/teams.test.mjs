import test from "node:test";
import assert from "node:assert/strict";
import { parsePlayers, balanceTeams, checkTeams, exactLeastSpread, teamsCsv, teamsText } from "./teams.mjs";

const COED = `Name,Rating,Gender
Ana,5,F
Ben,4,M
Cy,3,M
Dee,5,F
Eli,2,M
Fay,1,F
Gus,4,M
Hal,3,M
Ivy,2,F
Jo,4,F
Kai,5,M
Lu,1,M
together: Ana, Ben
apart: Kai, Gus`;

test("parses a pasted sheet: header skipped, requests read, tags upper-cased", () => {
  const p = parsePlayers(COED);
  assert.deepEqual(p.errors, []);
  assert.equal(p.players.length, 12);
  assert.deepEqual(p.players[0], { name: "Ana", rating: 5, tag: "F" });
  assert.deepEqual(p.together, [["Ana", "Ben"]]);
  assert.deepEqual(p.apart, [["Kai", "Gus"]]);
});

test("names a duplicate and a bad rating; fills a missing rating with the median", () => {
  const p = parsePlayers("Ana,5\nBen,x\nAna,3\nCy\nDee,1");
  assert.equal(p.errors.length, 2);
  assert.match(p.errors.join(" "), /not a number/);
  assert.match(p.errors.join(" "), /listed twice/);
  const cy = p.players.find((x) => x.name === "Cy");
  assert.equal(cy.rating, 3);
  assert.match(p.warnings[0], /middle rating/);
});

test("coed example: sizes, tags, requests kept and the spread proved least", () => {
  const p = parsePlayers(COED);
  const r = balanceTeams(p, 3);
  assert.deepEqual(checkTeams(p, r), []);
  assert.deepEqual(r.broken, []);
  assert.equal(r.spread, exactLeastSpread(p, 3));
  assert.equal(r.proved, true);
  for (const T of r.teams) assert.ok(T.tags.F >= 1 && T.tags.F <= 2);
});

test("same seed, same teams", () => {
  const p = parsePlayers(COED);
  assert.equal(teamsCsv(balanceTeams(p, 3, { seed: 7 })), teamsCsv(balanceTeams(p, 3, { seed: 7 })));
});

test("random lists: never worse than the exhaustive search, never a broken rule", () => {
  let a = 99;
  const r = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let c = 0; c < 40; c++) {
    const n = 8 + Math.floor(r() * 5), k = 2 + Math.floor(r() * 2);
    const lines = Array.from({ length: n }, (_, i) => `P${i},${1 + Math.floor(r() * 5)},${r() < 0.4 ? "F" : "M"}`);
    if (r() < 0.5) lines.push(`apart: P0, P1`);
    if (r() < 0.5) lines.push(`together: P2, P3`);
    const p = parsePlayers(lines.join("\n"));
    const exact = exactLeastSpread(p, k);
    const res = balanceTeams(p, k, { seed: c + 1 });
    if (exact === null) continue;
    assert.deepEqual(checkTeams(p, res), [], `case ${c}`);
    assert.equal(res.spread, exact, `case ${c}`);
  }
});

test("a big list runs fast and stays inside the rules", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `P${i},${1 + (i * 7) % 10},${i % 3 === 0 ? "F" : "M"}`);
  const p = parsePlayers(lines.join("\n"));
  const t0 = Date.now();
  const r = balanceTeams(p, 16);
  assert.ok(Date.now() - t0 < 5000);
  assert.deepEqual(checkTeams(p, r), []);
  assert.ok(r.spread >= r.lowerBound);
});

test("a together group too big for a team is reported, not hidden", () => {
  const p = parsePlayers("A,1\nB,1\nC,1\nD,1\ntogether: A, B, C");
  const r = balanceTeams(p, 2);
  assert.ok(r.broken.some((m) => /bigger than a team/.test(m)));
  assert.equal(r.proved, false);
});

test("a single star stronger than the rest: the bound says so", () => {
  const p = parsePlayers("Star,10\nA,1\nB,1\nC,1");
  const r = balanceTeams(p, 2);
  assert.equal(r.spread, exactLeastSpread(p, 2));
  assert.equal(r.proved, true);
});

test("CSV and text outputs carry every player once", () => {
  const p = parsePlayers(COED);
  const r = balanceTeams(p, 3);
  assert.equal(teamsCsv(r).trim().split("\n").length, 13);
  const txt = teamsText(r);
  for (const pl of p.players) assert.equal(txt.split(`  ${pl.name}\n`).length, 2, pl.name);
  assert.match(txt, /most even possible/);
});

test("CSV cells a spreadsheet would run as a formula are defused; negative ratings stay numbers", () => {
  const p = parsePlayers("=HYPERLINK(x),3\nBen,-1\n@cmd,2\nDee,2");
  const csv = teamsCsv(balanceTeams(p, 2));
  assert.match(csv, /'=HYPERLINK\(x\)/);
  assert.match(csv, /'@cmd/);
  assert.match(csv, /Ben,-1,/);
});
