import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, readChoices, buildSets, llGradHess, fitLogit, parameters, normQuantile, normP2, parseAttributes,
  generateDesign, designCsv, designText, mergeResponses, information, logDetPD, rng, shares, utility, respondentsFor, expectedSe, report,
} from "./engine.mjs";

const MEAL = readFileSync(new URL("./data/meal-kit-simulated.csv", import.meta.url), "utf8");
const LEVELS = readFileSync(new URL("./data/meal-kit-levels.txt", import.meta.url), "utf8");

test("normal quantile and p-value", () => {
  assert.ok(Math.abs(normQuantile(0.975) - 1.959963984540054) < 1e-8);
  assert.ok(Math.abs(normQuantile(0.001) + 3.090232306167813) < 1e-8);
  assert.ok(Math.abs(normP2(1.959963984540054) - 0.05) < 1e-8);
  assert.ok(Math.abs(normP2(0) - 1) < 1e-7);
});

test("a hand-worked two-task study: the MLE is the log odds", () => {
  // Two concepts, one binary attribute; B chosen 3 times of 4 when shown against A.
  const text = "respondent,task,Colour,chosen\n" + [1, 2, 3, 4].map((r) => `${r},1,A,${r === 4 ? 1 : 0}\n${r},1,B,${r === 4 ? 0 : 1}`).join("\n");
  const r = analyze({ text, bootstrap: 0 });
  assert.equal(r.coefficients.length, 1);
  assert.ok(Math.abs(r.coefficients[0].estimate - Math.log(3)) < 1e-9);
  // Fisher information: n p (1 - p) = 4 * 0.75 * 0.25.
  assert.ok(Math.abs(r.coefficients[0].se - 1 / Math.sqrt(0.75)) < 1e-9);
  assert.ok(Math.abs(r.fit.nullLogLik - 4 * Math.log(0.5)) < 1e-12);
});

test("the gradient and Hessian agree with finite differences", () => {
  const data = readChoices(MEAL, { levels: LEVELS });
  const sets = buildSets(data).slice(0, 400);
  const p = parameters(data.attributes, data.hasNone).length;
  const beta = Float64Array.from({ length: p }, (_, i) => 0.1 * Math.sin(i + 1));
  const { g, H } = llGradHess(sets, beta);
  const h = 1e-6;
  for (let k = 0; k < p; k++) {
    const up = Float64Array.from(beta), dn = Float64Array.from(beta);
    up[k] += h; dn[k] -= h;
    const a = llGradHess(sets, up), b = llGradHess(sets, dn);
    assert.ok(Math.abs((a.ll - b.ll) / (2 * h) - g[k]) < 1e-4, `gradient ${k}`);
    for (let j = 0; j < p; j++) assert.ok(Math.abs(-(a.g[j] - b.g[j]) / (2 * h) - H[j][k]) < 1e-3, `hessian ${j},${k}`);
  }
});

test("reads levels in the order given, with the first as reference, and finds the none rows", () => {
  const d = readChoices(MEAL, { levels: LEVELS });
  assert.equal(d.hasNone, true);
  assert.deepEqual(d.attributes.map((a) => a.name), ["Price per serving", "Recipes per week", "Menu", "Delivery", "Packaging"]);
  assert.deepEqual(d.attributes[3].levels, ["Fixed weekly day", "Pick any day"]);
  assert.equal(d.attributes[0].numeric, true);
  assert.equal(d.sets.length, 3600);
  // Without a list: numbers sorted, words by first appearance.
  const e = readChoices(MEAL, {});
  assert.deepEqual(e.attributes[1].levels, ["2", "3", "4", "5"]);
  assert.equal(e.attributes[0].numeric, false);
});

test("rejects malformed data with a message that says where", () => {
  assert.throws(() => readChoices("respondent,task,chosen\n1,1,1"), /No attribute columns/);
  assert.throws(() => readChoices("respondent,task,Colour,chosen\n1,1,Red,2\n1,1,Blue,0"), /Row 2: chosen must be 1 or 0/);
  assert.throws(() => readChoices("respondent,task,Colour,chosen\n1,1,Red,1\n1,1,Red,0"), /only one level/);
  assert.throws(() => readChoices("respondent,task,Colour,chosen\n1,1,Red,1\n1,1,Blue,0", { numeric: ["Size"] }), /not an attribute column/);
  assert.throws(() => readChoices("respondent,task,Colour,chosen\n1,1,Red,1\n1,1,Blue,0\n2,1,Red,1\n2,1,Green,0", { levels: "Colour: Red, Blue" }), /"Green"/);
  assert.throws(() => analyze({ text: MEAL, levels: LEVELS, price: "Menu" }), /must be one of the attributes marked numeric/);
});

test("drops tasks with no choice or two choices and says so", () => {
  const text = "respondent,task,Colour,chosen\n1,1,Red,1\n1,1,Blue,0\n1,2,Red,0\n1,2,Blue,0\n1,3,Red,1\n1,3,Blue,1\n2,1,Red,0\n2,1,Blue,1\n2,2,Blue,1\n2,2,Red,0";
  const d = readChoices(text);
  assert.equal(d.sets.length, 3);
  assert.ok(d.warnings.some((w) => /no concept chosen/.test(w)));
  assert.ok(d.warnings.some((w) => /more than one concept chosen/.test(w)));
});

test("a level that is always chosen is flagged, not reported as a precise estimate", () => {
  const rows = ["respondent,task,Colour,Size,chosen"];
  for (let r = 1; r <= 10; r++) for (let t = 1; t <= 3; t++) rows.push(`${r},${t},Red,${t % 2 ? "S" : "L"},1`, `${r},${t},Blue,${t % 2 ? "L" : "S"},0`);
  const r = analyze({ text: rows.join("\n"), bootstrap: 0 });
  assert.ok(r.warnings.some((w) => /could not be fitted to finite values/.test(w)));
  assert.equal(r.fit.converged, false);
});

test("the meal-kit example: numbers the page quotes", () => {
  const r = analyze({ text: MEAL, levels: LEVELS, price: "Price per serving", bootstrap: 200 });
  assert.equal(r.counts.respondents, 300);
  assert.equal(r.counts.tasks, 3600);
  const c = Object.fromEntries(r.coefficients.map((x) => [x.label, x]));
  assert.equal(c["Price per serving (per unit)"].estimate.toFixed(3), "-0.392");
  assert.equal(c["Menu: Chef's premium"].estimate.toFixed(3), "0.336");
  assert.equal((100 * r.fit.hitRate).toFixed(1), "55.1");
  assert.equal(r.fit.mcfaddenR2.toFixed(3), "0.205");
  const imp = Object.fromEntries(r.importance.map((x) => [x.attr, x]));
  assert.equal(imp["Price per serving"].importance.toFixed(1), "60.0");
  assert.equal(imp.Packaging.importance.toFixed(1), "3.6");
  const w = Object.fromEntries(r.wtp.map((x) => [`${x.attr}: ${x.level}`, x]));
  assert.equal(w["Delivery: Pick any day"].value.toFixed(2), "1.09");
  assert.equal(w["Menu: Chef's premium"].value.toFixed(2), "0.86");
  assert.ok(w["Delivery: Pick any day"].lower < 1.09 && w["Delivery: Pick any day"].upper > 1.09);
  assert.ok(r.importance.reduce((t, x) => t + x.importance, 0) - 100 < 1e-9);
  // Same seed, same intervals.
  const again = analyze({ text: MEAL, levels: LEVELS, price: "Price per serving", bootstrap: 200 });
  assert.deepEqual(again.importance, r.importance);
  assert.match(report(r), /coefficient,estimate,se,se_cluster_robust/);
});

test("simulator shares add to 100 and a better product gains share", () => {
  const r = analyze({ text: MEAL, levels: LEVELS, price: "Price per serving", bootstrap: 0 });
  const base = { "Price per serving": 10, "Recipes per week": "3", Menu: "Classic", Delivery: "Fixed weekly day", Packaging: "Standard" };
  const s = shares(r.attributes, r.hasNone, r.beta, [base, { ...base, Delivery: "Pick any day" }]);
  assert.equal(s.length, 3);
  assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 100) < 1e-9);
  assert.ok(s[1] > s[0]);
  // A price between tested levels is allowed for a numeric attribute.
  assert.ok(Number.isFinite(utility(r.attributes, r.hasNone, r.beta, { ...base, "Price per serving": 9.5 })));
  assert.throws(() => utility(r.attributes, r.hasNone, r.beta, { ...base, Menu: "Keto" }), /not a level of Menu/);
  const sim = analyze({ text: MEAL, levels: LEVELS, bootstrap: 50, products: [base, { ...base, Menu: "Chef's premium" }] }).simulator;
  assert.equal(sim.products.length, 3);
  assert.equal(sim.products[2].name, "None");
  for (const p of sim.products) assert.ok(p.lower <= p.share && p.share <= p.upper);
});

test("attribute lists parse, numeric marked with #", () => {
  const a = parseAttributes("Price#: 5, 10\nColour: Red | Blue, green\n\n// comment");
  assert.deepEqual(a, [{ name: "Price", numeric: true, levels: ["5", "10"] }, { name: "Colour", numeric: false, levels: ["Red", "Blue, green"] }]);
  assert.throws(() => parseAttributes("Colour: Red"), /at least two levels/);
  assert.throws(() => parseAttributes("Price#: cheap, dear"), /not a number/);
  assert.throws(() => parseAttributes("Colour Red, Blue"), /Name: level/);
});

test("the design is balanced, has minimal overlap, no repeated concepts, and beats a pure random design", () => {
  const atts = parseAttributes(LEVELS);
  const d = generateDesign({ attributes: atts, versions: 10, tasks: 12, concepts: 3, none: true, seed: 3 });
  assert.equal(d.design.length, 10);
  for (const v of d.design) {
    assert.equal(v.length, 12);
    for (const t of v) assert.equal(new Set(t.map((c) => c.join("|"))).size, 3);
  }
  for (const f of d.frequencies) {
    const n = f.counts.map((c) => c.n);
    assert.ok(Math.max(...n) - Math.min(...n) <= 10, `${f.attr} ${n}`);
  }
  // Attributes with at least 3 levels never repeat a level within a task.
  for (const o of d.overlap) if (atts.find((a) => a.name === o.attr).levels.length >= 3) assert.equal(o.tasksWithRepeat, 0, o.attr);
  assert.ok(d.identified);
  // Pure random draws of the same size.
  const rand = rng(99);
  const randomTasks = [];
  for (let i = 0; i < 120; i++) randomTasks.push([...Array.from({ length: 3 }, () => atts.map((a) => a.levels[Math.floor(rand() * a.levels.length)])), null]);
  const p = d.parameters.length;
  const dRandom = Math.exp(-logDetPD(information(atts, true, randomTasks).map((r) => r.map((x) => x / 10))) / p);
  assert.ok(d.dError < dRandom, `${d.dError} vs ${dRandom}`);
  assert.equal(expectedSe(d, 100).length, p);
  const n = respondentsFor(d, 0.1);
  assert.ok(n > 10 && n < 2000, String(n));
  assert.ok(Math.max(...expectedSe(d, n)) <= 0.1 + 1e-12);
});

test("design CSV and questionnaire text carry every task", () => {
  const d = generateDesign({ attributes: parseAttributes("A: x, y\nB: p, q, r"), versions: 2, tasks: 3, concepts: 2, none: true, seed: 1 });
  const lines = designCsv(d).split("\n");
  assert.equal(lines[0], "version,task,concept,A,B");
  assert.equal(lines.length, 1 + 2 * 3 * 3);
  assert.match(lines[3], /^1,1,3,None,None$/);
  assert.equal((designText(d).match(/^Task /gm) || []).length, 6);
  assert.throws(() => generateDesign({ attributes: parseAttributes("A: x, y"), concepts: 3 }), /Only 2 distinct concepts/);
});

test("answers in wide format merge with the design into analysable long data", () => {
  const d = generateDesign({ attributes: parseAttributes("A: x, y, z\nPrice#: 1, 2, 3"), versions: 2, tasks: 4, concepts: 3, none: true, seed: 5 });
  const csv = designCsv(d);
  const answers = "respondent,version,Q1,Q2,Q3,Q4\nann,1,1,2,4,3\nbob,2,3,,1,2\n";
  const m = mergeResponses(csv, answers);
  assert.equal(m.missing, 1);
  const rows = m.csv.trim().split("\n");
  assert.equal(rows[0], "respondent,task,concept,A,Price,chosen");
  assert.equal(rows.length, 1 + 7 * 4);
  const data = readChoices(m.csv, { levels: "A: x, y, z\nPrice#: 1, 2, 3" });
  assert.equal(data.sets.length, 7);
  assert.equal(data.sets.filter((s) => s.alts[3].chosen === 1).length, 1);
  assert.throws(() => mergeResponses(csv, "respondent,version,Q1\nann,3,1"), /no version 3/);
  assert.throws(() => mergeResponses(csv, "respondent,version,Q1\nann,1,9"), /no concept "9"/);
});

test("weights reproduce a duplicated dataset", () => {
  const data = readChoices(MEAL, { levels: LEVELS });
  const sets = buildSets(data).slice(0, 300);
  const p = parameters(data.attributes, data.hasNone).length;
  const w = Float64Array.from(sets, (_, i) => (i % 3 === 0 ? 2 : 1));
  const dup = sets.flatMap((s, i) => (i % 3 === 0 ? [s, s] : [s]));
  const a = fitLogit(sets, p, { weights: w }), b = fitLogit(dup, p);
  a.beta.forEach((x, i) => assert.ok(Math.abs(x - b.beta[i]) < 1e-9));
});

test("simulateShares on a finished analysis matches the built-in simulator", async () => {
  const { simulateShares } = await import("./engine.mjs");
  const base = { "Price per serving": 10, "Recipes per week": "3", Menu: "Classic", Delivery: "Fixed weekly day", Packaging: "Standard" };
  const products = [{ name: "A", ...base }, { name: "B", ...base, Packaging: "Compostable" }];
  const r = analyze({ text: MEAL, levels: LEVELS, bootstrap: 40, products });
  assert.equal(r.replicates.length, 40);
  const s = simulateShares(r, products);
  s.forEach((x, i) => {
    assert.equal(x.name, r.simulator.products[i].name);
    assert.ok(Math.abs(x.share - r.simulator.products[i].share) < 1e-9);
    assert.ok(Math.abs(x.lower - r.simulator.products[i].lower) < 1e-9);
  });
  assert.equal(simulateShares(r, products, { includeNone: false }).length, 2);
});
