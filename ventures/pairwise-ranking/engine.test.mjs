import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, fit, fitMM, readGames, parseCsv, predict, predictFromResult, strongComponents, normQuantile, normCdf, erfc, toCsv, PAPERS } from "./engine.mjs";

const file = (p) => readFileSync(new URL(`./${p}`, import.meta.url), "utf8");
const PL = file("data/premier-league-2023-24.csv");
const REF = JSON.parse(file("eval/reference.json"));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

test("every reference fit (statsmodels GLM or scipy on Davidson's likelihood) is reproduced", () => {
  assert.ok(REF.cases.length >= 30);
  for (const c of REF.cases) {
    const games = c.games.map(([a, b, outcome]) => ({ a, b, outcome, w: 1 }));
    const r = analyze({ games, ties: c.ties, home: c.home ? "yes" : "no", priorSd: c.priorSd, draws: 0 });
    assert.ok(!r.error, `${c.name}: ${r.error}`);
    const glm = c.method.startsWith("statsmodels");
    const tolL = glm ? 1e-7 : 2e-5, tolSe = glm ? 1e-6 : 1e-3;
    const byName = new Map(r.players.map((p) => [p.player, p]));
    c.players.forEach((name, k) => {
      const p = byName.get(name);
      close(p.strength, c.lambda[k], tolL, `${c.name} ${name} strength`);
      close(p.se, c.se[k], tolSe * Math.max(1, c.se[k]), `${c.name} ${name} se`);
    });
    if (c.alpha != null) {
      close(r.home.alpha, c.alpha, tolL, `${c.name} alpha`);
      close(r.home.se, c.alpha_se, tolSe, `${c.name} alpha se`);
    }
    if (c.delta != null) {
      close(r.ties.delta, c.delta, tolL, `${c.name} delta`);
      close(r.ties.se, c.delta_se, tolSe, `${c.name} delta se`);
    }
    // statsmodels' binomial log-likelihood adds a log binomial coefficient
    // that is not zero for half-win responses, so only compare 0/1 fits.
    if (c.ties !== "half") close(r.fit.loglik, c.loglik, 1e-6, `${c.name} loglik`);
  }
});

test("Newton's method and Hunter's MM algorithm reach the same maximum", () => {
  const games = readGames(parseCsv(PL)).games.filter((g) => g.outcome !== "tie");
  const mm = fitMM(games);
  const nw = fit(games, { ties: "drop", home: false });
  const mean = mm.lambda.reduce((s, v) => s + v, 0) / mm.lambda.length;
  mm.lambda.forEach((v, k) => close(v - mean, nw.lambda[k], 1e-9, mm.players[k]));
  assert.ok(nw.iterations < 15, `Newton took ${nw.iterations} iterations`);
});

test("at the maximum each player's expected score equals their actual score", () => {
  for (const opts of [{}, { home: "no" }, { ties: "half" }, { ties: "drop", home: "no" }]) {
    const r = analyze({ csv: PL, draws: 0, ...opts });
    for (const p of r.players) close(p.expectedScore, p.actualScore, 1e-7, `${JSON.stringify(opts)} ${p.player}`);
  }
});

test("the Premier League example: what the page and the post say", () => {
  const r = analyze({ csv: PL });
  assert.equal(r.fit.games, 380);
  assert.equal(r.players.length, 20);
  assert.deepEqual(r.players.slice(0, 3).map((p) => p.player), ["Manchester City", "Arsenal", "Liverpool"]);
  assert.equal(r.players.at(-1).player, "Sheffield United");
  assert.ok(r.settings.home && r.settings.ties === "davidson");
  assert.ok(r.home.p < 0.001 && r.home.factor > 1.5 && r.home.factor < 1.8, `home factor ${r.home.factor}`);
  assert.ok(r.aheadTopTwo > 0.6 && r.aheadTopTwo < 0.7, `P(City ahead of Arsenal) ${r.aheadTopTwo}`);
  assert.ok(r.players[0].pTop > 0.5 && r.players[0].pTop < 0.65);
  assert.deepEqual([r.players[0].rankLow, r.players[0].rankHigh], [1, 3]);
  close(r.ties.evenTie, 0.267, 0.005, "tie share between equals");
});

test("rank ranges are reproducible from the seed and change with it", () => {
  const a = analyze({ csv: PL, draws: 1000 });
  const b = analyze({ csv: PL, draws: 1000 });
  const c = analyze({ csv: PL, draws: 1000, seed: 7 });
  assert.deepEqual(a.players.map((p) => p.pTop), b.players.map((p) => p.pTop));
  assert.notDeepEqual(a.players.map((p) => p.pTop), c.players.map((p) => p.pTop));
  const s = a.players.reduce((t, p) => t + p.pTop, 0);
  close(s, 1, 1e-12, "P(top) sums to one");
  for (const p of a.players) assert.ok(p.rankLow <= p.rank + 1 && p.rankHigh >= p.rank - 1 && p.rankLow <= p.rankHigh);
});

test("invariances: row order, side order (without home), and names do not change the fit", () => {
  const games = readGames(parseCsv(PL)).games;
  const base = fit(games, { ties: "davidson", home: false });
  const shuffled = [...games].reverse();
  const swapped = games.map((g) => ({ a: g.b, b: g.a, w: g.w, outcome: g.outcome === "i" ? "j" : g.outcome === "j" ? "i" : "tie" }));
  const renamed = games.map((g) => ({ ...g, a: `zz ${g.a}`, b: `zz ${g.b}` }));
  for (const other of [fit(shuffled, { ties: "davidson" }), fit(swapped, { ties: "davidson" }), fit(renamed, { ties: "davidson" })]) {
    base.lambda.forEach((v, k) => close(other.lambda[k], v, 1e-9, base.players[k]));
    close(other.delta.est, base.delta.est, 1e-9, "delta");
  }
});

test("a count column is the same as repeating the row", () => {
  const counted = analyze({ csv: "a,b,result,count\nx,y,1,3\ny,x,1,2\ny,z,1,4\nz,y,1,1\nz,x,1,2\nx,z,1,2\n", draws: 0 });
  let rows = "a,b,result\n";
  for (const [a, b, n] of [["x", "y", 3], ["y", "x", 2], ["y", "z", 4], ["z", "y", 1], ["z", "x", 2], ["x", "z", 2]]) rows += `${a},${b},1\n`.repeat(n);
  const repeated = analyze({ csv: rows, draws: 0 });
  assert.equal(counted.fit.games, 14);
  counted.players.forEach((p, k) => { assert.equal(p.player, repeated.players[k].player); close(p.strength, repeated.players[k].strength, 1e-10, p.player); close(p.se, repeated.players[k].se, 1e-10, p.player); });
});

test("input shapes: winner,loser; result codes; scores; quoted names; semicolons; tabs", () => {
  const cases = [
    ["A,B\nB,C\nC,A\nA,C\n", "winner-loser", 4, 0],
    ["p1,p2,result\nA,B,1\nB,C,0\nC,A,0.5\nA,C,W\nB,A,L\nC,B,D\n", "result", 6, 2],
    ["HomeTeam,AwayTeam,FTR\nA,B,H\nB,C,A\nC,A,D\nA,C,H\nB,A,A\n", "result", 5, 1],
    ["first,second,winner\nA,B,A\nB,C,C\nC,A,C\nA,C,A\nB,A,draw\n", "result", 5, 1],
    ["home,away,hg,ag\nA,B,2,1\nB,C,0,0\nC,A,1,3\nA,C,,\nC,B,2,0\n", "scores", 4, 1],
    ['winner,loser\n"Smith, J",B\nB,"Smith, J"\nB,C\nC,"Smith, J"\n', "winner-loser", 4, 0],
    ["team1;team2;score1;score2\nA;B;1;0\nB;A;2;2\nB;C;3;1\nC;A;1;0\n", "scores", 4, 1],
    ["winner\tloser\nA\tB\nB\tA\nB\tC\nC\tB\n", "winner-loser", 4, 0],
  ];
  for (const [csv, type, n, ties] of cases) {
    const { games, layout } = readGames(parseCsv(csv));
    assert.equal(layout.type, type, csv);
    assert.equal(games.length, n, csv);
    assert.equal(games.filter((g) => g.outcome === "tie").length, ties, csv);
  }
  const named = readGames(parseCsv('winner,loser\n"Smith, J",B\n')).games[0];
  assert.equal(named.a, "Smith, J");
  const r = readGames(parseCsv("HomeTeam,AwayTeam,FTR\nA,B,H\nB,C,A\n"));
  assert.deepEqual(r.games.map((g) => g.outcome), ["i", "j"]);
  assert.ok(r.homeHint);
  assert.ok(!readGames(parseCsv("winner,loser\nA,B\n")).homeHint);
  const date = readGames(parseCsv("date,home,away,hg,ag\n2024-01-02,A,B,1,0\n"));
  assert.deepEqual(date.layout.a, 1);
  const bad = readGames(parseCsv("a,b,result\nA,B,maybe\nA,A,1\nB,A,1\n"));
  assert.equal(bad.games.length, 1);
  assert.match(bad.problems.join(" "), /"maybe" is not one of/);
  assert.match(bad.problems.join(" "), /same name on both sides/);
});

test("home advantage is switched on by home/away headers, off otherwise, and can be forced", () => {
  assert.equal(analyze({ csv: PL, draws: 0 }).settings.home, true);
  assert.equal(analyze({ csv: PL, draws: 0, home: "no" }).settings.home, false);
  const wl = "winner,loser\nA,B\nB,A\nB,C\nC,B\nA,C\nC,A\nA,B\n";
  assert.equal(analyze({ csv: wl, draws: 0 }).settings.home, false);
  assert.equal(analyze({ csv: wl, draws: 0, home: "yes" }).settings.home, true);
});

test("Ford's condition: an unbeaten group triggers the prior; separate groups are flagged", () => {
  const r = analyze({ csv: "winner,loser\nA,B\nA,C\nB,C\nC,B\n", draws: 0 });
  assert.equal(r.existence.exists, false);
  assert.equal(r.settings.priorSd, 1.5);
  assert.match(r.warnings.join(" "), /No finite ranking exists .*A never lost to anyone outside their group/);
  assert.ok(Number.isFinite(r.players[0].strength) && r.players[0].player === "A");
  const g = analyze({ csv: "winner,loser\nA,B\nB,A\nC,D\nD,C\n", draws: 0 });
  assert.equal(g.existence.disconnected, true);
  assert.match(g.warnings.join(" "), /2 groups that never played each other/);
  const ok = analyze({ csv: "winner,loser\nA,B\nB,C\nC,A\n", draws: 0 });
  assert.equal(ok.existence.exists, true);
  assert.equal(ok.settings.priorSd, 0);
  // A tie links two players both ways in the graph, but under Davidson's
  // model one win and one tie still has its maximum at infinity (the tie
  // parameter grows with the gap): the graph check passes and the runaway
  // check catches it.
  const tie = analyze({ csv: "a,b,result\nA,B,1\nB,A,0.5\n", draws: 0 });
  assert.equal(tie.existence.components, 1);
  assert.equal(tie.existence.exists, false);
  assert.equal(tie.settings.priorOnAll, true);
  const tie2 = analyze({ csv: "a,b,result\nA,B,1\nB,A,0.5\nB,A,1\n", draws: 0 });
  assert.equal(tie2.existence.exists, true);
  // Tarjan on a known graph: 0<->1, 1->2, 2<->3.
  const comps = strongComponents(4, [[0, 1], [1, 0], [1, 2], [2, 3], [3, 2]]).map((c) => c.sort().join("")).sort();
  assert.deepEqual(comps, ["01", "23"]);
});

test("predictions are probabilities, symmetric between equals, and the home side gains", () => {
  const r = analyze({ csv: PL, draws: 0 });
  for (const [a, b] of [["Arsenal", "Manchester City"], ["Luton Town", "Liverpool"], ["Everton", "Bournemouth"]]) {
    const p = predictFromResult(r, a, b, { home: true });
    const q = predictFromResult(r, a, b);
    close(p.win + p.tie + p.loss, 1, 1e-12, "sums to one");
    assert.ok(p.win > q.win, "home helps");
    const s = predictFromResult(r, b, a);
    close(q.win, s.loss, 1e-12, "neutral symmetry");
  }
  assert.equal(predictFromResult(r, "Arsenal", "Nobody FC"), null);
  const m = fit([{ a: "x", b: "y", outcome: "i", w: 1 }, { a: "y", b: "x", outcome: "i", w: 1 }], { ties: "drop" });
  const p = predict(m, "x", "y");
  close(p.win, 0.5, 1e-12, "equals");
  close(r.home.evenGame.win + r.home.evenGame.tie + r.home.evenGame.loss, 1, 1e-12, "even game");
});

test("the tie options behave as documented", () => {
  const half = analyze({ csv: PL, ties: "half", draws: 0 });
  const drop = analyze({ csv: PL, ties: "drop", draws: 0 });
  assert.equal(half.ties, null);
  assert.equal(drop.ties, null);
  assert.equal(half.fit.games, 380);
  assert.equal(drop.fit.games, 298);
  assert.match(half.summary, /half a win/);
  assert.match(drop.summary, /82 ties left out/);
  const noTies = analyze({ csv: "winner,loser\nA,B\nB,A\nB,C\nC,A\n", draws: 0 });
  assert.equal(noTies.settings.ties, "none");
});

test("errors are plain sentences, never throws", () => {
  for (const input of [{ csv: "" }, { csv: "just one column\nx\n" }, { csv: "a,b,result\nA,B,D\nB,A,D\n" }, { csv: PL, level: 2 }, { csv: PL, ties: "maybe" }, { csv: PL, home: "sometimes" }, { csv: PL, priorSd: -1 }, { games: [{ a: "x", b: "x", outcome: "i" }] }, { csv: "winner,loser\nA,B\n".repeat(1), maxRows: 1 }]) {
    const r = analyze(input);
    assert.equal(typeof r.error, "string", JSON.stringify(input).slice(0, 80));
    assert.ok(r.error.length > 10);
  }
});

test("numerics: normal quantile and erfc", () => {
  close(normQuantile(0.975), 1.959963984540054, 1e-9, "z 0.975");
  close(normQuantile(0.5), 0, 1e-12, "z 0.5");
  close(normQuantile(0.001), -3.090232306167813, 1e-8, "z 0.001");
  close(normCdf(1.959963984540054), 0.975, 2e-7, "cdf");
  close(erfc(0), 1, 1e-7, "erfc 0");
  close(erfc(1), 0.157299207050285, 2e-7, "erfc 1");
});

test("CSV export guards formulas and has one row per player", () => {
  const r = analyze({ csv: "winner,loser\n=cmd,B\nB,=cmd\nB,C\nC,=cmd\n", draws: 0 });
  const lines = toCsv(r).trim().split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines.some((l) => l.includes(",'=cmd,")));
  assert.ok(!lines.some((l) => /,=cmd/.test(l)));
});

test("PAPERS carry what the agent registry needs", () => {
  assert.ok(PAPERS.length >= 6);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
});

test("a home side that won every game: no finite home advantage, so a prior on every parameter", () => {
  const csv = "home,away,hg,ag\nA,B,1,0\nB,A,1,0\nB,C,1,0\nC,B,1,0\nA,C,1,0\nC,A,1,0\nA,B,2,0\n";
  const r = analyze({ csv, draws: 0 });
  assert.ok(!r.error, r.error);
  assert.equal(r.existence.exists, false);
  assert.equal(r.settings.priorOnAll, true);
  assert.match(r.warnings.join(" "), /No finite estimate exists .*home advantage is unbounded/);
  assert.ok(Number.isFinite(r.home.alpha) && r.home.alpha > 0 && r.home.alpha < 6, `alpha ${r.home.alpha}`);
  const off = analyze({ csv, draws: 0, home: "no" });
  assert.equal(off.existence.exists, true);
  assert.equal(off.settings.priorOnAll, false);
});
