import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, shapley, nucleolus, airportGame, airportShapley, bankruptcyGame, talmud, cea, cel,
  separableCosts, coreCheck, completeGame, parseCoalitionTable, simplex, toCsv, csvCell, PAPERS, num,
} from "./engine.mjs";
import { EXAMPLES } from "./example-data.mjs";

const close = (a, b, tol = 1e-9) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tol, `${i}: ${v} vs ${b[i]}`));
const REF = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));

test("the Mishnah's three estates (Ketubot 10:4) are the Talmud rule and the nucleolus (Aumann & Maschler 1985)", () => {
  const claims = [100, 200, 300];
  const mishnah = { 100: [100 / 3, 100 / 3, 100 / 3], 200: [50, 75, 75], 300: [50, 100, 150] };
  for (const [E, want] of Object.entries(mishnah)) {
    close(talmud(claims, Number(E)), want, 1e-9);
    const v = bankruptcyGame(claims, Number(E));
    const nu = nucleolus(Float64Array.from(v, (a) => -a), 3);
    close(nu.x.map((a) => -a), want, 1e-9);
    const r = analyze({ mode: "claims", csv: "a,100\nb,200\nc,300", estate: Number(E) });
    assert.equal(r.nucleolusMatchesTalmud, true);
  }
});

test("random arrival equals the Shapley value of the claims game, and the rules divide the whole estate", () => {
  const claims = [30, 70, 120, 15];
  const E = 140;
  const r = analyze({ mode: "claims", csv: claims.map((d, i) => `p${i},${d}`).join("\n"), estate: E });
  for (const m of r.methods) {
    assert.ok(Math.abs(m.x.reduce((a, b) => a + b, 0) - E) < 1e-6, m.id);
    m.x.forEach((v, i) => assert.ok(v >= -1e-9 && v <= claims[i] + 1e-9, `${m.id} ${i}`));
  }
  // O'Neill's random arrival by brute force over the 24 orders
  const perm = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  const got = new Array(4).fill(0);
  for (const order of perm([0, 1, 2, 3])) {
    let left = E;
    for (const i of order) { const pay = Math.min(claims[i], left); got[i] += pay / 24; left -= pay; }
  }
  close(r.methods.find((m) => m.id === "random-arrival").x, got, 1e-9);
  close(cel(claims, E), claims.map((d, i) => d - cea(claims, claims.reduce((a, b) => a + b) - E)[i]), 1e-9);
});

test("the glove game: Shapley (2/3, 1/6, 1/6), nucleolus (1, 0, 0)", () => {
  const r = analyze({ mode: "coalitions", game: "value", csv: "L,0\nR1,0\nR2,0\nL+R1,1\nL+R2,1\nR1+R2,0\nL+R1+R2,1" });
  close(r.methods.find((m) => m.id === "shapley").x, [2 / 3, 1 / 6, 1 / 6], 1e-12);
  close(r.methods.find((m) => m.id === "nucleolus").x, [1, 0, 0], 1e-9);
  assert.equal(r.methods.find((m) => m.id === "shapley").inCore, false);
  assert.equal(r.methods.find((m) => m.id === "nucleolus").inCore, true);
});

test("matches the independent Python reference (permutation Shapley, scipy HiGHS nucleolus) on 40 games", () => {
  assert.equal(REF.cases.length, 40);
  for (const k of REF.cases) {
    const c = Float64Array.from(k.c);
    close(shapley(c, k.n), k.shapley, 1e-8);
    const nu = nucleolus(c, k.n);
    assert.equal(nu.error, undefined);
    close(nu.x, k.nucleolus, 1e-6);
    assert.ok(Math.abs(nu.leastCore - k.leastCore) < 1e-6);
  }
});

test("Littlechild & Owen's closed form equals the enumerated Shapley value of the airport game", () => {
  for (const needs of [[3, 1, 4, 1, 5, 9, 2, 6], [10, 10, 10], [0, 5], [7.5, 2.25, 7.5, 100, 0.1, 33, 33, 12, 64, 5, 1]]) {
    close(airportShapley(needs), shapley(airportGame(needs), needs.length), 1e-9);
  }
});

test("Shapley axioms: efficiency, symmetry, null player, additivity", () => {
  const n = 5;
  const g1 = new Float64Array(1 << n);
  const g2 = new Float64Array(1 << n);
  for (let m = 1; m < 1 << n; m++) {
    const k = m.toString(2).split("1").length - 1;
    g1[m] = (m & 0b00011 ? 10 : 0) + 3 * k * k - (m & 1 ? 2 : 0) - (m & 2 ? 2 : 0);
    g2[m] = (m & 0b11100) ? Math.sqrt(m & 0b11100) : 0;
  }
  // player 4 (bit 16) is null in g1? make it so: copy value of m without bit 16
  for (let m = 1; m < 1 << n; m++) if (m & 16) g1[m] = g1[m ^ 16];
  const s1 = shapley(g1, n);
  assert.ok(Math.abs(s1.reduce((a, b) => a + b) - g1[(1 << n) - 1]) < 1e-9);
  assert.ok(Math.abs(s1[4]) < 1e-12, "null player gets 0");
  assert.ok(Math.abs(s1[0] - s1[1]) < 1e-12, "symmetric players 0 and 1 get the same");
  const sum = Float64Array.from(g1, (v, m) => v + g2[m]);
  close(shapley(sum, n), s1.map((v, i) => v + shapley(g2, n)[i]), 1e-9);
});

test("nucleolus: efficient, individually rational, in the core when the core is not empty, invariant to relabelling", () => {
  for (const k of REF.cases.slice(0, 15)) {
    const c = Float64Array.from(k.c);
    const nu = nucleolus(c, k.n);
    const full = (1 << k.n) - 1;
    assert.ok(Math.abs(nu.x.reduce((a, b) => a + b) - c[full]) < 1e-7);
    nu.x.forEach((v, i) => assert.ok(v <= c[1 << i] + 1e-7));
    if (nu.leastCore <= 1e-9) assert.equal(coreCheck(c, k.n, nu.x).inCore, true);
    // reverse the players
    const rev = (m) => { let r = 0; for (let i = 0; i < k.n; i++) if (m & (1 << i)) r |= 1 << (k.n - 1 - i); return r; };
    const c2 = Float64Array.from(c, (_, m) => c[rev(m)]);
    close(nucleolus(c2, k.n).x, [...nu.x].reverse(), 1e-6);
  }
});

test("nucleolus at 10 members runs fast and refuses 11; undefined when there is no imputation", () => {
  const n = 10;
  const needs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const t0 = Date.now();
  const nu = nucleolus(airportGame(needs), n);
  assert.ok(Date.now() - t0 < 5000);
  assert.ok(Math.abs(nu.x.reduce((a, b) => a + b) - 10) < 1e-7);
  assert.match(nucleolus(airportGame([...needs, 11]), 11).error, /up to 10/);
  const bad = Float64Array.from([0, 1, 1, 5]);
  assert.match(nucleolus(bad, 2).error, /no imputation/);
});

test("the simplex: a textbook LP with its duals", () => {
  // max 3x + 5y s.t. x <= 4, 2y <= 12, 3x + 2y <= 18  (optimum 36 at (2, 6); duals 0, 3/2, 1)
  const r = simplex([-3, -5], [[1, 0], [0, 2], [3, 2]], [4, 12, 18], ["<=", "<=", "<="]);
  assert.equal(r.status, "optimal");
  close(r.z, [2, 6], 1e-9);
  assert.ok(Math.abs(r.value + 36) < 1e-9);
  close(r.duals, [0, -1.5, -1], 1e-9);
  assert.equal(simplex([1], [[1], [1]], [1, 3], ["<=", ">="]).status, "infeasible");
});

test("SCRB and ENSC on a three-member game, by hand", () => {
  // c: A 100, B 120, C 140, AB 170, AC 190, BC 200, ABC 250
  const c = Float64Array.from([0, 100, 120, 170, 140, 190, 200, 250]);
  const s = separableCosts(c, 3);
  close(s.separable, [50, 60, 80]); // 250-200, 250-190, 250-170
  assert.equal(s.nonSeparable, 60);
  close(s.ensc, [70, 80, 100]);
  // remaining: 50, 60, 60 -> shares of 60: 60*50/170, 60*60/170, 60*60/170
  close(s.scrb, [50 + 60 * 50 / 170, 60 + 60 * 60 / 170, 80 + 60 * 60 / 170], 1e-9);
});

test("a coalition table with gaps is completed by the cheapest split, and dearer groups are flagged", () => {
  const p = parseCoalitionTable("group,cost\nA,10\nB,12\nC,9\nA+B,15\nA+B+C,30");
  const g = completeGame(p.players.length, p.given);
  assert.equal(g.c[0b101], 19); // A + C unpriced: 10 + 9
  assert.equal(g.c[0b110], 21);
  assert.equal(g.filled.length, 2);
  assert.equal(g.dearer.length, 1); // A+B+C at 30, but A+B then C costs 24
  const r = analyze({ csv: "A,10\nB,12\nC,9\nA+B,15\nA+B+C,30" });
  assert.match(r.warnings.join(" "), /2 of 4 groups were not priced/);
  assert.match(r.warnings.join(" "), /A \+ B \+ C is priced at 30.00 but splitting it costs 24.00/);
  assert.equal(analyze({ csv: "A,10\nB,12\nC,9\nA+B,15\nA+B+C,22" }).warnings.length, 1);
  const dear = analyze({ csv: "A,10\nB,12\nA+B,25" });
  assert.match(dear.warnings.join(" "), /A \+ B is priced at 25.00 but splitting it costs 22.00/);
  assert.match(dear.methods.find((m) => m.id === "nucleolus").note, /no imputation/);
});

test("member names: separators, case, quoting, and errors in plain words", () => {
  const r = analyze({ csv: '"North & Mill",8.9\nnorth,6.5\nMILL,4.2' });
  assert.deepEqual(r.players, ["North", "Mill"]);
  assert.equal(analyze({ csv: "A and B,5\nA,3\nB,3" }).total, 5);
  assert.match(analyze({ csv: "A,3\nA+B,5" }).error, /missing: B/);
  assert.match(analyze({ csv: "A,3\nB,4" }).error, /whole group/);
  assert.match(analyze({ csv: "A,3\nB,x" }).error, /line 2: "x" is not a number/);
  assert.match(analyze({ csv: "A,x" }).error, /at least two/); // a lone non-numeric first row reads as a header
  assert.match(analyze({ csv: "" }).error, /No rows/);
  assert.match(analyze({ csv: Array.from({ length: 15 }, (_, i) => `p${i},1`).join("\n") }).error, /more than 14/);
  assert.equal(num("$1,200.50"), 1200.5);
  assert.equal(num("abc"), null);
  assert.match(analyze({ mode: "nope" }).error, /unknown mode/);
});

test("road mode: stretches, a proportional split that overcharges the near members, and the closed form past 10 members", () => {
  const r = analyze({ mode: "road", csv: "house,m\nAda,200\nBen,450\nCal,450\nDee,900", total: 12000, unit: "$" });
  // 0-200 m: 2,666.67 over 4; 200-450: 3,333.33 over 3; 450-900: 6,000 over 1
  close(r.methods[0].x, [666.6666666666666, 1777.7777777777778, 1777.7777777777778, 7777.777777777778], 1e-6);
  const prop = r.methods.find((m) => m.id === "proportional");
  assert.equal(prop.inCore, false);
  assert.equal(prop.worst[0].group, "the 3 nearest");
  assert.ok(Math.abs(prop.worst[0].overpay - 600) < 1e-6);
  assert.equal(r.segments.length, 3);
  assert.match(r.summary, /overcharges the near members/);
  const big = analyze({ mode: "road", csv: Array.from({ length: 50 }, (_, i) => `h${i},${(i + 1) * 10}`).join("\n"), total: 5000 });
  assert.equal(big.methods.some((m) => m.id === "nucleolus"), false);
  assert.ok(Math.abs(big.methods[0].x.reduce((a, b) => a + b) - 5000) < 1e-6);
  assert.match(big.warnings[0], /closed form/);
  assert.match(analyze({ mode: "road", csv: "a,0\nb,0" }).error, /nothing to share/);
});

test("road mode's prefix core check agrees with the full enumeration", () => {
  const reach = [200, 450, 450, 900, 1200, 50];
  const r = analyze({ mode: "road", csv: reach.map((d, i) => `h${i},${d}`).join("\n"), total: 18000 });
  const g = airportGame(reach.map((d) => (d * 18000) / 1200));
  for (const m of r.methods) assert.equal(coreCheck(g, reach.length, m.x).inCore, m.inCore, m.id);
});

test("claims mode refuses an estate that covers every claim", () => {
  assert.match(analyze({ mode: "claims", csv: "a,10\nb,20", estate: 30 }).error, /paid in full/);
  assert.match(analyze({ mode: "claims", csv: "a,10\nb,20" }).error, /estate/);
});

test("every example runs, and the CSV has one row per member", () => {
  for (const [k, ex] of Object.entries(EXAMPLES)) {
    const r = analyze(ex);
    assert.equal(r.error, undefined, k);
    assert.ok(r.summary.length > 80, k);
    const csv = toCsv(r).trim().split("\n");
    assert.equal(csv.length, r.players.length + 1);
  }
  const w = analyze(EXAMPLES.coalitions);
  close(w.methods.find((m) => m.id === "nucleolus").x, [5.9, 2.4, 3.1], 1e-9);
});

test("every paper has a verified DOI, what was implemented, and deviations", () => {
  assert.equal(PAPERS.length, 7);
  for (const p of PAPERS) {
    assert.match(p.doi, /^10\./);
    assert.equal(p.url, `https://doi.org/${p.doi}`);
    assert.ok(p.implemented.length > 40 && p.deviations.length >= 4, p.title);
  }
});

test("the CSV export defuses spreadsheet formulas in names but keeps negative numbers", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("@sum"), "'@sum");
  assert.equal(csvCell(-12.5), "-12.5");
  assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
  const r = analyze({ mode: "road", csv: "=cmd,100\nB,200" });
  assert.match(toCsv(r), /\n'=cmd,/);
});
