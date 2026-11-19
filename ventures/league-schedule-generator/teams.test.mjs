import test from "node:test";
import assert from "node:assert/strict";
import { parsePlayers, balanceTeams, checkTeams, exactLeastSpread, teamsCsv, teamsText, parseTeamsCsv, addLateSignups, splitTags } from "./teams.mjs";

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
  assert.deepEqual(p.players[0], { name: "Ana", rating: 5, tag: "F", tags: ["F"] });
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

// Two tags per player (a woman who keeps goal): every tag spread on its own.
test("two tags in one cell: each tag split evenly, proved against the exhaustive search", () => {
  assert.deepEqual(splitTags("f g"), ["F", "G"]);
  assert.deepEqual(splitTags("F/G"), ["F", "G"]);
  assert.deepEqual(splitTags("F+G+F"), ["F", "G"]);
  const p = parsePlayers(`Ana,5,F G\nBen,4,M G\nCy,3,M\nDee,5,F\nEli,2,M\nFay,1,F\nGus,4,M\nHal,3,M G\nIvy,2,F\nJo,4,F\nKai,5,M\nLu,1,M`);
  assert.equal(p.players[0].tag, "F G");
  const r = balanceTeams(p, 3);
  assert.deepEqual(checkTeams(p, r), []);
  assert.deepEqual(r.broken, []);
  for (const T of r.teams) { assert.equal(T.tags.G, 1); assert.ok(T.tags.F >= 1 && T.tags.F <= 2); }
  assert.equal(r.spread, exactLeastSpread(p, 3));
  // The CSV keeps both tags and reads back.
  const back = parseTeamsCsv(teamsCsv(r));
  assert.deepEqual(back.teams.find((T) => T.players.some((x) => x.name === "Ana")).players.find((x) => x.name === "Ana").tags, ["F", "G"]);
});

test("random two-tag lists: never worse than the exhaustive search, never a broken rule", () => {
  let a = 7;
  const r = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  let compared = 0;
  for (let c = 0; c < 40; c++) {
    const n = 8 + Math.floor(r() * 5), k = 2 + Math.floor(r() * 2);
    const lines = Array.from({ length: n }, (_, i) => `P${i},${1 + Math.floor(r() * 5)},${r() < 0.4 ? "F" : "M"}${r() < 0.3 ? " G" : ""}`);
    if (r() < 0.5) lines.push("apart: P0, P1");
    const p = parsePlayers(lines.join("\n"));
    const exact = exactLeastSpread(p, k);
    if (exact === null) continue;
    compared++;
    const res = balanceTeams(p, k, { seed: c + 1 });
    assert.deepEqual(checkTeams(p, res), [], `case ${c}`);
    assert.equal(res.spread, exact, `case ${c}`);
  }
  assert.ok(compared >= 20);
});

const ANNOUNCED = `Team,Player,Rating,Tag
Hawks,Ana,5,F
Hawks,Eli,2,M
Hawks,Hal,3,M
Hawks,Ivy,2,F
Owls,Ben,4,M
Owls,Dee,5,F
Owls,Lu,1,M
Owls,Fay,1,F
Lynx,Cy,3,M
Lynx,Gus,4,M
Lynx,Jo,4,F
Lynx,Kai,5,M`;

test("reads announced teams back from the page's own CSV, quotes and defused cells included", () => {
  const t = parseTeamsCsv('Team,Player,Rating,Tag\n"Hawks, North",Ana,5,F\nOwls,\'=X,3,\n');
  assert.deepEqual(t.errors, []);
  assert.equal(t.teams[0].name, "Hawks, North");
  assert.equal(t.teams[1].players[0].name, "=X");
  assert.match(parseTeamsCsv("A,Ana,1\nB,Ana,2").errors[0], /two teams/);
});

test("late sign-ups: nobody announced moves, names and order kept, new players placed evenly", () => {
  const before = parseTeamsCsv(ANNOUNCED);
  const box = parsePlayers("Max,3,M\nNia,4,F\nOz,2,M");
  const r = addLateSignups(box, before);
  assert.deepEqual(r.teams.map((T) => T.name), ["Hawks", "Owls", "Lynx"]);
  assert.deepEqual(r.moved, []);
  assert.equal(r.late.length, 3);
  assert.deepEqual(checkTeams(r.parsed, r, r.before), []);
  for (const T of before.teams) for (const p of T.players) assert.ok(r.teams.find((x) => x.name === T.name).players.some((q) => q.name === p.name));
  // Totals before: Hawks 12, Owls 11, Lynx 16. Lynx can take nobody stronger: 3 newcomers, one each.
  const sizes = r.teams.map((T) => T.players.length);
  assert.deepEqual(sizes, [5, 5, 5]);
  // 15 players: small enough that every placement of the three was tried.
  assert.ok(r.exhaustive);
  assert.equal(r.lowerBound, r.spread);
});

test("late sign-ups against the exhaustive search with pins, with and without moves allowed", () => {
  let a = 31;
  const rnd = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let c = 0; c < 30; c++) {
    const k = 2 + Math.floor(rnd() * 2), per = 3 + Math.floor(rnd() * 2), late = 1 + Math.floor(rnd() * 3);
    const lines = ["Team,Player,Rating,Tag"];
    for (let t = 0; t < k; t++) for (let j = 0; j < per; j++) lines.push(`T${t},A${t}${j},${1 + Math.floor(rnd() * 5)},${rnd() < 0.4 ? "F" : "M"}`);
    const before = parseTeamsCsv(lines.join("\n"));
    const box = parsePlayers(Array.from({ length: late }, (_, i) => `L${i},${1 + Math.floor(rnd() * 5)},${rnd() < 0.4 ? "F" : "M"}`).join("\n"));
    for (const maxMoves of [0, 2]) {
      const r = addLateSignups(box, before, { maxMoves, seed: c + 1, exactUpTo: 0 });
      const shipped = addLateSignups(box, before, { maxMoves, seed: c + 1 });
      const faults = checkTeams(shipped.parsed, shipped, shipped.before);
      // A tag split the announced teams already make uneven is reported in broken; nothing else may fail.
      assert.deepEqual(faults.filter((f) => !(shipped.broken.length && /^Tag |differ/.test(f))), [], `case ${c}`);
      assert.ok(shipped.moved.length <= maxMoves);
      assert.ok(shipped.spread <= r.spread + 1e-9, `case ${c}: exhaustive fallback never worse`);
    }
    const free = addLateSignups(box, before, { maxMoves: 0 });
    const loose = addLateSignups(box, before, { maxMoves: 2 });
    if (!free.broken.length && !loose.broken.length) assert.ok(loose.spread <= free.spread + 1e-9, `case ${c}: allowing moves never hurts`);
  }
});

test("a drop line removes a player; a re-listed announced player updates the rating; moves are named", () => {
  const before = parseTeamsCsv(ANNOUNCED);
  const box = parsePlayers("drop: Kai\nGus,6,M\nZed,1,M");
  const r = addLateSignups(box, before, { maxMoves: 1 });
  assert.deepEqual(r.dropped, [{ name: "Kai", team: "Lynx" }]);
  assert.ok(!r.teams.some((T) => T.players.some((p) => p.name === "Kai")));
  assert.equal(r.parsed.players.find((p) => p.name === "Gus").rating, 6);
  assert.deepEqual(checkTeams(r.parsed, r, r.before), []);
  for (const m of r.moved) assert.notEqual(m.from, m.to);
  assert.ok(r.moved.length <= 1);
  assert.match(addLateSignups(parsePlayers("drop: Nobody\nZed,1"), before).warnings.join(" "), /not on a team/);
});
