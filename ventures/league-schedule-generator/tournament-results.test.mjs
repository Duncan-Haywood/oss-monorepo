import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE, tournamentFromText, validateTournament } from "./tournament.mjs";
import { playTournament, tournamentResultsText, tournamentResultsCsv } from "./tournament-results.mjs";
import { mulberry32 } from "./calc.mjs";

const sample = tournamentFromText(SAMPLE);

/** Pool lines for every pool game with random scores (draws allowed), division-prefixed. */
function poolLines(t, rng) {
  return t.games.filter((g) => !g.knockout).map((g) => `${g.division}: ${g.home} ${Math.floor(rng() * 4)} - ${Math.floor(rng() * 4)} ${g.away}`);
}

/** Play every knockout game due, round by round, until none is left. Returns the lines typed. */
function playOut(t, lines, rng, opts) {
  for (let guard = 0; guard < 20; guard++) {
    const r = playTournament(t, lines.join("\n"), opts);
    assert.deepEqual(r.errors, []);
    const due = r.next.filter((g) => g.knockout);
    if (!due.length) return { r, lines };
    for (const g of due) {
      const h = Math.floor(rng() * 4), a = Math.floor(rng() * 4);
      lines.push(h === a ? `${g.division}: ${g.home} ${h} - ${a} ${g.away} (${rng() < 0.5 ? g.home : g.away} on penalties)` : `${g.division}: ${g.home} ${h} - ${a} ${g.away}`);
    }
  }
  throw new Error("did not finish");
}

test("sample weekend played out: pools fill the seeds, the bracket reaches a champion", () => {
  for (let s = 1; s <= 30; s++) {
    const rng = mulberry32(s);
    const { r } = playOut(sample, poolLines(sample, rng), rng);
    assert.equal(r.played, r.total, `seed ${s}: every game has a result`);
    assert.equal(r.next.length, 0);
    for (const d of r.divisions) {
      assert.ok(d.pools.every((p) => p.complete));
      const teams = sample.divisions.find((x) => x.name === d.name).teams;
      // Each seed is the team at that place of its pool's final table.
      for (const s2 of d.seeds) {
        const m = s2.label.match(/^(\d)\w\w(?: Pool (\w))?$/);
        const pool = m[2] ? d.pools.find((p) => p.name === `Pool ${m[2]}`) : d.pools[0];
        assert.equal(s2.team, pool.rows[Number(m[1]) - 1].name);
      }
      assert.ok(teams.includes(d.champion));
      assert.notEqual(d.champion, d.runnerUp);
      if (d.name === "U12 Boys") assert.ok(d.third && d.third !== d.champion && d.third !== d.runnerUp);
    }
    // Knockout slots in the schedule now carry team names; times and fields are unchanged.
    for (const [i, g] of r.games.entries()) {
      assert.equal(g.startAbs, sample.games[i].startAbs);
      assert.equal(g.field, sample.games[i].field);
      const d = sample.divisions.find((x) => x.name === g.division);
      assert.ok(d.teams.includes(g.home) && d.teams.includes(g.away), `${g.stage}: ${g.home} v ${g.away}`);
    }
    // A team's knockout games follow its own path: the final's two teams won their semifinals.
    const u10 = r.games.filter((g) => g.division === "U10 Girls" && g.knockout);
    const final = u10.find((g) => g.stage === "Final");
    assert.deepEqual([final.home, final.away].sort(), u10.filter((g) => /^SF/.test(g.stage)).map((g) => g.winner).sort());
  }
});

test("pool lines in any order give the same tables and seeds", () => {
  const rng = mulberry32(7);
  const lines = poolLines(sample, rng);
  const a = playTournament(sample, lines.join("\n"));
  for (let k = 0; k < 10; k++) {
    const shuffled = [...lines].sort(() => rng() - 0.5);
    const b = playTournament(sample, shuffled.join("\n"));
    assert.deepEqual(b.divisions.map((d) => d.seeds), a.divisions.map((d) => d.seeds));
    assert.deepEqual(b.divisions.map((d) => d.pools.map((p) => p.rows.map((x) => [x.name, x.points, x.gd]))), a.divisions.map((d) => d.pools.map((p) => p.rows.map((x) => [x.name, x.points, x.gd]))));
  }
});

test("a division heading line, and a name that is in two divisions", () => {
  const amb = playTournament(sample, "Riverside Rapids 2-1 North Hills Hawks");
  assert.match(amb.errors[0], /^Result line 1: both teams are in U10 Girls and U12 Boys/);
  const ok = playTournament(sample, "U12 Boys\nRiverside Rapids 2-1 Valley United\n\nU14 Boys:\nvalley united 0-0 granite bay galaxy");
  assert.deepEqual(ok.errors, []);
  const u12 = ok.divisions.find((d) => d.name === "U12 Boys").pools[1];
  assert.equal(u12.rows[0].name, "Riverside Rapids");
  assert.equal(u12.played, 1);
  const g = ok.games.find((x) => x.division === "U14 Boys" && x.teams.includes("U14 Boys/Granite Bay Galaxy") && x.teams.includes("U14 Boys/Valley United"));
  assert.equal(g.result, "0 - 0");
  assert.equal(g.winner, null);
  // A unique name needs no prefix.
  assert.deepEqual(playTournament(sample, "Granite Bay Galaxy 2-0 Summit Strikers").errors, []);
});

test("errors name the line and the reason", () => {
  const r = playTournament(sample, [
    "U12 Boys: Valley United 3-0 Harbor City FC", // different pools, pools unfinished
    "U12 Boys: Hawks 3-0 Owls", // unknown names
    "nonsense",
  ].join("\n"));
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /^Result line 1 \(U12 Boys\): Valley United \(Pool B\) and Harbor City FC \(Pool A\) are in different pools.*not in the knockouts yet/);
  assert.match(r.errors[1], /^Result line 2 \(U12 Boys\): "Hawks" is not one of the teams/);
  assert.match(r.errors[2], /^Result line 3: no division has both teams/);
  // A second line for a pool pair once the pool is finished and neither went through.
  const rng = mulberry32(3);
  const lines = poolLines(sample, rng);
  const done = playTournament(sample, lines.join("\n"));
  const u14 = done.divisions.find((d) => d.name === "U14 Boys");
  const [x, y] = u14.pools[0].rows.slice(3).map((row) => row.name);
  const again = playTournament(sample, [...lines, `${x} 1-0 ${y}`].join("\n"));
  assert.match(again.errors[0], /already played their pool game.*did not go through to the knockouts/);
  // A level knockout score needs its winner.
  const final = done.next.find((g) => g.division === "U14 Boys");
  const level = playTournament(sample, [...lines, `${final.home} 1-1 ${final.away}`].join("\n"));
  assert.match(level.errors[0], /needs a winner/);
  // Bad options.
  assert.match(playTournament(sample, "", { points: "1-2-3" }).errors[0], /Points system/);
  assert.match(playTournament(sample, "", { gdCap: "2.5" }).errors[0], /cap/);
});

test("a goal-difference cap stops a big win deciding the table", () => {
  // U12 Pool A: Hawks beat Harbor 9-0, Lightning beat Harbor 3-0, Hawks and Lightning draw.
  const text = "U12 Boys\nNorth Hills Hawks 9-0 Harbor City FC\nLakeview Lightning 3-0 Harbor City FC\nNorth Hills Hawks 1-1 Lakeview Lightning";
  const open = playTournament(sample, text).divisions[1].pools[0];
  assert.equal(open.rows[0].name, "North Hills Hawks");
  const cappedPool = playTournament(sample, text, { gdCap: 3 }).divisions[1].pools[0];
  // Both now +3 on goal difference; goals for (capped) 4 v 4; head to head level; entry order: Hawks first, flagged.
  assert.equal(cappedPool.rows[0].gd, 3);
  assert.equal(cappedPool.rows[1].gd, 3);
  assert.ok(cappedPool.notes.some((n) => /Still level/.test(n)));
});

test("best runners-up across pools of different sizes, by points per game", () => {
  const spec = {
    days: "Sat 2027-05-15 08:00-20:00\nSun 2027-05-16 08:00-18:00",
    fields: "Field 1\nField 2\nField 3",
    divisions: "Open: 50 min, 3 pools, top 4\nA1\nB1\nC1\nC2\nB2\nA2\nA3\nB3\nC3\nC4",
    maxPerDay: 4,
  };
  const t = tournamentFromText(spec);
  assert.equal(t.unplaced.length, 0);
  assert.deepEqual(validateTournament(t), []);
  const pools = t.pools[0].pools;
  assert.deepEqual(pools.map((p) => p.teams.length).sort(), [3, 3, 4]);
  assert.ok(t.pools[0].seeds.includes("Best 2nd-placed"));
  // Every pool game: the listed-first team wins 2-0 except where noted, so ranks follow entry order.
  const lines = t.games.filter((g) => !g.knockout).map((g) => {
    const p = pools.find((x) => x.name === g.stage).teams;
    return p.indexOf(g.home) < p.indexOf(g.away) ? `${g.home} 2-0 ${g.away}` : `${g.away} 2-0 ${g.home}`;
  });
  const r = playTournament(t, lines.join("\n"));
  assert.deepEqual(r.errors, []);
  const d = r.divisions[0];
  const best = d.seeds.find((s) => s.label === "Best 2nd-placed").team;
  // A 2nd-placed team in a 3-pool won 1 of 2 (1.5 pts/game); in the 4-pool, 2 of 3 (2 pts/game) wins it.
  const big = pools.find((p) => p.teams.length === 4);
  assert.equal(best, d.pools.find((p) => p.name === big.name).rows[1].name);
  const { r: fin } = playOut(t, lines, mulberry32(5));
  assert.ok(fin.divisions[0].champion);
});

test("text and CSV exports carry names and scores", () => {
  const rng = mulberry32(11);
  const { r } = playOut(sample, poolLines(sample, rng), rng);
  const txt = tournamentResultsText(r);
  for (const d of r.divisions) assert.match(txt, new RegExp(`Champion: ${d.champion}\\.`));
  assert.match(txt, /Pool A \(6 of 6 played, final\)/);
  const csv = tournamentResultsCsv(r);
  assert.match(csv.split("\n")[0], /,Result$/);
  assert.equal(csv.trim().split("\n").length, sample.games.length + 1);
  const champ = r.divisions[0].champion;
  const mine = tournamentResultsCsv(r, `U10 Girls/${champ}`).trim().split("\n");
  assert.ok(mine.length >= 1 + 3 + 2, "pool games plus semifinal and final");
});
