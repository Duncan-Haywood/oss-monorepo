import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGuests, parseRules, validateSpec, optimize, verifyPlan, weightMatrix, planScore,
  setupJson, parseSetup, baselinePlan, sampleSpec, planCsv, tableSignsHtml, floorPlanHtml, escortBoardHtml, placeCardsHtml, catererSheetHtml, mealTally, reseat, parsePlanCsv, importGuestSheet, SAMPLE_GUESTS, SAMPLE_RULES, resolveTableCount, capacityPerTable, capacitiesOf, parseTableSizes, WEIGHTS, orderTable, parseAccessTables, checkMove, suggestFixes, compareTableCounts,
} from "./calc.mjs";

function specFrom(guestText, ruleText, extra = {}) {
  const { guests, errors: ge } = parseGuests(guestText);
  const { rules, errors: re } = parseRules(ruleText, guests);
  assert.deepEqual([...ge, ...re], []);
  return { guests, rules, seatsPerTable: 4, tableCount: "", balance: true, seed: 1, ...extra };
}

test("parseGuests reads names and parties, skips blanks and comments, flags duplicates", () => {
  const r = parseGuests("Ann Lee | Lee family\n\n# note\nBob  Ray\nann lee\n");
  assert.deepEqual(r.guests, [{ name: "Ann Lee", party: "Lee family", group: "", meal: "" }, { name: "Bob Ray", party: "", group: "", meal: "" }]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /listed twice/);
});

test("parseRules understands + ++ ! !! @ and rejects unknown names", () => {
  const { guests } = parseGuests("A\nB\nC D");
  const r = parseRules("A + B\nA ++ C D\nB ! C D\nA !! B\nC D @ 2\nZ + A\nA @ x\nnonsense", guests);
  assert.deepEqual(r.rules.map((x) => x.kind), ["want", "must", "avoid", "never", "pin"]);
  assert.equal(r.rules[4].table, 1);
  assert.equal(r.errors.length, 3);
});

test("validateSpec catches too few seats, bad pins and an overfull pinned table", () => {
  const s = specFrom("A\nB\nC\nD\nE", "", { seatsPerTable: 2, tableCount: 2 });
  assert.match(validateSpec(s)[0], /2 tables of 2 seat 4/);
  const p = specFrom("A\nB\nC", "A @ 5", { seatsPerTable: 2, tableCount: 2 });
  assert.ok(validateSpec(p).some((e) => /only 2 tables/.test(e)));
  const q = specFrom("A\nB\nC\nD", "A @ 1\nB @ 1\nC @ 1", { seatsPerTable: 2, tableCount: 2 });
  assert.ok(validateSpec(q).some((e) => /3 pinned guests but holds 2/.test(e)));
});

test("table count defaults to the fewest that fit; balance evens out the tables", () => {
  const s = specFrom("A\nB\nC\nD\nE\nF\nG", "", { seatsPerTable: 4 });
  assert.equal(resolveTableCount(s), 2);
  assert.equal(capacityPerTable(s), 4);
  const b = specFrom("A\nB\nC\nD\nE\nF\nG\nH", "", { seatsPerTable: 8, tableCount: 4 });
  assert.equal(capacityPerTable(b), 2);
  assert.equal(capacityPerTable({ ...b, balance: false }), 8);
});

test("weights: parties pair up, rules add, pins add nothing", () => {
  const s = specFrom("A | P\nB | P\nC | P\nD", "A + D\nB ! D\nD @ 1");
  const W = weightMatrix(s);
  assert.equal(W[0 * 4 + 1], WEIGHTS.party);
  assert.equal(W[0 * 4 + 3], WEIGHTS.want);
  assert.equal(W[3 * 4 + 1], WEIGHTS.avoid);
  assert.equal(W[2 * 4 + 3], 0);
});

// exhaustive optimum for tiny instances: every assignment respecting capacity and pins
function bruteBest(spec) {
  const n = spec.guests.length, T = resolveTableCount(spec), cap = capacityPerTable(spec, T);
  const W = weightMatrix(spec);
  const pin = new Map(spec.rules.filter((r) => r.kind === "pin").map((r) => [r.a, r.table]));
  let best = -Infinity;
  const table = new Array(n).fill(0), load = new Array(T).fill(0);
  (function go(g) {
    if (g === n) { best = Math.max(best, planScore(W, n, table)); return; }
    for (let t = 0; t < T; t++) {
      if ((pin.has(g) && pin.get(g) !== t) || load[t] >= cap) continue;
      table[g] = t; load[t]++; go(g + 1); load[t]--;
    }
  })(0);
  return best;
}

test("matches the exhaustive optimum on 60 random small instances", () => {
  let seed = 12345;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < 60; k++) {
    const n = 5 + Math.floor(rnd() * 4);
    const names = Array.from({ length: n }, (_, i) => `G${i}`);
    const guestText = names.map((x, i) => (rnd() < 0.3 ? `${x} | party${i % 3}` : x)).join("\n");
    const lines = [];
    for (let r = 0; r < n; r++) {
      const a = Math.floor(rnd() * n); let b = Math.floor(rnd() * n); if (a === b) b = (b + 1) % n;
      lines.push(`G${a} ${["+", "++", "!", "!!"][Math.floor(rnd() * 4)]} G${b}`);
    }
    if (rnd() < 0.5) lines.push(`G${Math.floor(rnd() * n)} @ 1`);
    const spec = specFrom(guestText, lines.join("\n"), { seatsPerTable: 4, tableCount: 2 });
    const res = optimize(spec);
    assert.deepEqual(res.errors, []);
    assert.deepEqual(verifyPlan(spec, res), []);
    assert.ok(Math.abs(res.score - bruteBest(spec)) < 1e-9, `instance ${k}: got ${res.score}, best ${bruteBest(spec)}`);
  }
});

test("the example is valid, honours pins, keeps every rule and beats list order", () => {
  const spec = sampleSpec();
  assert.deepEqual(validateSpec(spec), []);
  const res = optimize(spec);
  assert.deepEqual(verifyPlan(spec, res), []);
  assert.equal(res.rulesMet, res.rulesTotal);
  assert.equal(res.neverBroken.length, 0);
  assert.deepEqual(res.partySplits, []);
  assert.ok(res.score > res.baseScore);
  assert.ok(res.tables[0].guests.includes("Maya Okafor") && res.tables[0].guests.includes("Priest Anselm"));
  assert.ok(res.tables[1].guests.includes("Liam Brandt"));
  assert.deepEqual(res.tables.map((t) => t.size), [8, 8, 8]);
});

test("deterministic for a seed", () => {
  const a = optimize(sampleSpec()), b = optimize(sampleSpec());
  assert.deepEqual(a.table, b.table);
});

test("never-together pair is separated even when a want pulls them together", () => {
  const spec = specFrom("A\nB\nC\nD", "A + B\nA !! B", { seatsPerTable: 2, tableCount: 2 });
  const res = optimize(spec);
  assert.notEqual(res.table[0], res.table[1]);
  assert.equal(res.neverBroken.length, 0);
});

test("a party bigger than a table is reported as split rather than hidden", () => {
  const spec = specFrom("A | P\nB | P\nC | P\nD", "", { seatsPerTable: 2, tableCount: 2 });
  const res = optimize(spec);
  assert.equal(res.partySplits.length, 1);
  assert.equal(res.partySplits[0].size, 3);
  assert.deepEqual(verifyPlan(spec, res), []);
});

test("baseline fills in list order and honours pins", () => {
  const spec = specFrom("A\nB\nC\nD\nE\nF", "F @ 1", { seatsPerTable: 3, tableCount: 2 });
  const t = baselinePlan(spec);
  assert.equal(t[5], 0);
  assert.equal(t.filter((x) => x === 0).length, 3);
});

test("a 200-guest wedding finishes quickly, fits and verifies", () => {
  const n = 200;
  const guestText = Array.from({ length: n }, (_, i) => `Guest ${i}${i % 5 === 0 ? ` | fam${Math.floor(i / 5)}` : ""}`).join("\n");
  const rules = Array.from({ length: 150 }, (_, i) => `Guest ${(i * 7) % n} ${i % 3 ? "+" : "!"} Guest ${(i * 13 + 5) % n}`).filter((l) => { const [a, b] = l.split(/ [+!] /); return a !== b; }).join("\n");
  const spec = specFrom(guestText, rules, { seatsPerTable: 10 });
  const t0 = Date.now();
  const res = optimize(spec);
  assert.ok(Date.now() - t0 < 20000);
  assert.deepEqual(verifyPlan(spec, res), []);
  assert.ok(res.score >= res.baseScore);
});

test("verifyPlan detects tampering", () => {
  const spec = sampleSpec();
  const res = optimize(spec);
  const bad = JSON.parse(JSON.stringify(res));
  bad.tables[0].guests.push(bad.tables[1].guests.pop());
  assert.notDeepEqual(verifyPlan(spec, bad), []);
  const bad2 = JSON.parse(JSON.stringify(res)); bad2.score += 3;
  assert.match(verifyPlan(spec, bad2).join(" "), /recomputed/);
});

test("CSV has one row per guest and quotes commas", () => {
  const spec = specFrom("Lee, Ann | Lee family\nBob", "", { seatsPerTable: 2 });
  const csv = planCsv(spec, optimize(spec)).split("\n");
  assert.equal(csv.length, 3);
  assert.ok(csv.some((l) => l.includes('"Lee, Ann"')));
});

function changedSpec() {
  const gt = SAMPLE_GUESTS.split("\n").filter((l) => !/Cousin Ben|Hannah Cole/.test(l)).concat(["New One", "New Two | Brandt family"]).join("\n");
  const rt = SAMPLE_RULES.split("\n").filter((l) => !/Cousin Ben|Hannah Cole/.test(l)).concat(["New One !! Uncle Ray"]).join("\n");
  const { guests } = parseGuests(gt);
  return { ...sampleSpec(), guests, rules: parseRules(rt, guests).rules };
}

test("parsePlanCsv round-trips planCsv, quotes included, and rejects junk rows", () => {
  const spec = sampleSpec();
  const csv = planCsv(spec, optimize(spec));
  const { prev, errors } = parsePlanCsv(csv);
  assert.deepEqual(errors, []);
  assert.equal(prev.size, spec.guests.length);
  assert.equal(parsePlanCsv('Table,Guest,Party\n2,"Smith, Jo",\n').prev.get("smith, jo"), 1);
  assert.ok(parsePlanCsv("x,y").errors.length);
  assert.ok(parsePlanCsv("").errors.length);
});

test("reseat keeps returning guests put, seats new ones legally, and moves far fewer than a fresh run", () => {
  const spec = sampleSpec();
  const { prev } = parsePlanCsv(planCsv(spec, optimize(spec)));
  const s2 = changedSpec();
  const fresh = optimize(s2);
  let freshMoves = 0;
  s2.guests.forEach((g, i) => { const o = prev.get(g.name.toLowerCase()); if (o !== undefined && fresh.table[i] !== o) freshMoves++; });
  const res = reseat(s2, prev, "medium");
  assert.deepEqual(res.errors, []);
  assert.deepEqual(verifyPlan(s2, res), []);
  assert.equal(res.retained, 22);
  assert.deepEqual(res.added.sort(), ["New One", "New Two"]);
  assert.deepEqual(res.dropped.sort(), ["cousin ben", "hannah cole"]);
  assert.ok(res.moved.length < freshMoves, `${res.moved.length} vs fresh ${freshMoves}`);
  assert.equal(res.neverBroken.length, 0);
  assert.equal(res.kept + res.moved.length, res.retained);
});

test("reseat still moves a guest when a never-together rule demands it", () => {
  const spec = sampleSpec();
  const { prev } = parsePlanCsv(planCsv(spec, optimize(spec)));
  const rayTable = prev.get("uncle ray");
  const other = spec.guests.find((g) => prev.get(g.name.toLowerCase()) === rayTable && g.name !== "Uncle Ray" && !spec.rules.some((r) => r.kind === "pin" && spec.guests[r.a].name === g.name));
  const { guests } = parseGuests(SAMPLE_GUESTS);
  const rules = parseRules(SAMPLE_RULES + `\nUncle Ray !! ${other.name}`, guests).rules;
  const res = reseat({ ...spec, guests, rules }, prev, "high");
  assert.equal(res.neverBroken.length, 0);
  assert.ok(res.moved.length >= 1);
  assert.deepEqual(verifyPlan({ ...spec, guests, rules }, res), []);
});

test("reseat is deterministic and honours pins", () => {
  const spec = sampleSpec();
  const { prev } = parsePlanCsv(planCsv(spec, optimize(spec)));
  const s2 = changedSpec();
  assert.deepEqual(reseat(s2, prev).table, reseat(s2, prev).table);
  const res = reseat(s2, prev);
  assert.ok(res.tables[0].guests.includes("Maya Okafor"));
  assert.ok(res.tables[0].guests.includes("Priest Anselm"));
});

test("table signs: one page per table, every guest once, names escaped, no script", () => {
  const spec = specFrom("Lee <b>Ann</b> | Lee & Co\nBob\nCy\nDee", "", { seatsPerTable: 2 });
  const res = optimize(spec);
  const html = tableSignsHtml(spec, res, "Gala <x>");
  assert.equal((html.match(/<section>/g) || []).length, res.tables.length);
  assert.equal((html.match(/<li>/g) || []).length, spec.guests.length);
  assert.ok(html.includes("Lee &lt;b&gt;Ann&lt;/b&gt;") && html.includes("Lee &amp; Co"));
  assert.ok(html.includes("<title>Gala &lt;x&gt;</title>"));
  assert.ok(!/<script|<b>/i.test(html));
});

test("escort board: every guest once, sorted by last name, right table, names escaped", () => {
  const spec = specFrom("Zed Adams\nAnn Zhu\nBob <i> Lee\nCy Baker", "", { seatsPerTable: 2 });
  const res = optimize(spec);
  const html = escortBoardHtml(spec, res, "Find <us>");
  assert.equal((html.match(/<li>/g) || []).length, spec.guests.length);
  const order = [...html.matchAll(/<li><span>([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(order, ["Zed Adams", "Cy Baker", "Bob &lt;i&gt; Lee", "Ann Zhu"]);
  for (const t of res.tables) for (const g of t.guests) assert.ok(html.includes(`<span>${g.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span><b>${t.number}</b>`), g);
  assert.ok(html.includes("<title>Find &lt;us&gt;</title>") && !/<script|<i>/i.test(html));
});

test("floorPlanHtml draws one svg per table with every guest once, escaped, no meals", () => {
  const spec = specFrom("Zed <b> Adams | | | vegetarian\nAnn Zhu\nBob Lee\nCy Baker\nDee Fox", "", { seatsPerTable: 3 });
  const res = optimize(spec);
  const html = floorPlanHtml(spec, res, "Plan <1>");
  assert.equal((html.match(/<svg /g) || []).length, res.tables.length);
  assert.equal((html.match(/<circle cx=/g) || []).length, spec.guests.length);
  for (const t of res.tables) for (const g of t.guests) assert.ok(html.includes(`>${g.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`), g);
  assert.ok(html.includes("<title>Plan &lt;1&gt;</title>") && !/<script|<b>|vegetarian/i.test(html));
});

test("group column: spread mixes a group across tables, cluster seats it together", () => {
  const names = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
  const text = names.map((n) => `${n} | | ${n[0] === "A" ? "Bride side" : "Groom side"}`).join("\n");
  const base = (mix) => ({ ...sampleSpec(), guests: parseGuests(text).guests, rules: [], seatsPerTable: 4, tableCount: 2, mix });
  const spread = optimize(base("spread"));
  assert.deepEqual(verifyPlan(base("spread"), spread), []);
  for (const m of spread.groupMix) assert.deepEqual(m.perTable, [2, 2]);
  const cluster = optimize(base("cluster"));
  assert.deepEqual(verifyPlan(base("cluster"), cluster), []);
  for (const m of cluster.groupMix) assert.ok(m.perTable.includes(4));
  assert.deepEqual(optimize(base("off")).groupMix.map((m) => m.group), ["Bride side", "Groom side"]);
});

test("group is parsed from the third column and exported", () => {
  const { guests } = parseGuests("Ann | Lee family | Bride side\nBob | | Groom side\nCy");
  assert.deepEqual(guests.map((g) => g.group), ["Bride side", "Groom side", ""]);
  const spec = { ...sampleSpec(), guests, rules: [], seatsPerTable: 3, tableCount: 1 };
  assert.match(planCsv(spec, optimize(spec)), /Table,Guest,Party,Group\n.*Ann,Lee family,Bride side/s);
});

test("meal column is tallied per table, exported, and kept off the room-facing sheets", () => {
  const { guests } = parseGuests("Ann | Lee | Bride | vegetarian\nBob | Lee | Bride | Vegetarian\nCy | | | gluten <free>\nDee");
  assert.deepEqual(guests.map((g) => g.meal), ["vegetarian", "Vegetarian", "gluten <free>", ""]);
  const spec = { ...sampleSpec(), guests, rules: [], seatsPerTable: 2, tableCount: 2 };
  const res = optimize(spec);
  assert.deepEqual(verifyPlan(spec, res), []);
  const meals = res.meals;
  assert.equal(meals.reduce((a, m) => a + m.total, 0), 4);
  assert.equal(meals[0].total, 2); // vegetarian, case-insensitive
  for (const m of meals) assert.equal(m.perTable.reduce((a, b) => a + b, 0), m.total);
  assert.ok(meals.some((m) => m.meal === "No choice given" && m.total === 1));
  assert.match(planCsv(spec, res), /Table,Guest,Party,Group,Meal\n/);
  const sheet = catererSheetHtml(spec, res);
  assert.match(sheet, /gluten &lt;free&gt;/);
  assert.ok(!sheet.includes("<free>"));
  assert.ok(!tableSignsHtml(spec, res).includes("vegetarian"));
  assert.ok(!escortBoardHtml(spec, res).includes("vegetarian"));
});

test("a list with no meals has no tally and an unchanged CSV header", () => {
  const spec = sampleSpec();
  assert.deepEqual(mealTally(spec, optimize(spec).table), []);
  assert.match(planCsv(spec, optimize(spec)), /^Table,Guest,Party,Group\n/);
  assert.match(catererSheetHtml(spec, optimize(spec)), /No meal choices were typed/);
});

test("setup round-trips and unknown or mistyped fields are dropped", () => {
  const state = { guests: "Ana | Lee family\nBen", rules: "Ana + Ben", seats: "8", tcount: "", balance: false, mix: "spread", prevplan: "Table,Guest\n1,Ana" };
  const { state: back, error } = parseSetup(setupJson(state));
  assert.equal(error, null);
  assert.deepEqual(back, state);
  const hostile = JSON.stringify({ app: "event-seating-chart-optimizer", guests: 5, mix: "<script>", balance: "yes", seats: 12, extra: "x" });
  assert.deepEqual(parseSetup(hostile).state, { seats: "12" });
});

test("setup parser rejects other JSON and non-JSON", () => {
  assert.match(parseSetup("not json").error, /not valid JSON/);
  assert.match(parseSetup("[]").error, /not a seating setup/);
  assert.match(parseSetup('{"app":"shift-roster-builder"}').error, /not a seating setup/);
});

test("parseTableSizes reads table: seats pairs and flags bad or conflicting ones", () => {
  assert.deepEqual(parseTableSizes("1: 12, Table 5 = 6\n3:10").sizes, { 0: 12, 4: 6, 2: 10 });
  assert.deepEqual(parseTableSizes("").sizes, {});
  const bad = parseTableSizes("x, 0: 4, 2: 0, 1: 5, 1: 6");
  assert.equal(bad.errors.length, 4);
  assert.match(bad.errors[3], /two different sizes/);
});

test("custom table sizes: head table and kids table are honoured, everyone is seated", () => {
  const names = Array.from({ length: 24 }, (_, i) => `Guest ${i + 1}`).join("\n");
  const spec = specFrom(names, "", { seatsPerTable: 8, tableSizes: parseTableSizes("1: 12, 3: 4").sizes });
  assert.equal(resolveTableCount(spec), 3);
  assert.deepEqual(capacitiesOf(spec), [12, 8, 4]);
  const res = optimize(spec);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(verifyPlan(spec, res), []);
  assert.deepEqual(res.tables.map((t) => t.size), [12, 8, 4]);
  assert.deepEqual(res.tables.map((t) => t.seats), [12, 8, 4]);
});

test("custom sizes add default tables when the sized ones cannot hold everyone", () => {
  const names = Array.from({ length: 20 }, (_, i) => `G${i + 1}`).join("\n");
  const spec = specFrom(names, "", { seatsPerTable: 6, tableSizes: { 0: 4 } });
  assert.equal(resolveTableCount(spec), 4);
  assert.deepEqual(validateSpec(spec), []);
});

test("custom sizes: wished pairs land together at the big table; pins and overflow are checked", () => {
  const names = Array.from({ length: 14 }, (_, i) => `P${i + 1}`).join("\n");
  const spec = specFrom(names, "P1 ++ P2\nP1 ++ P3\nP2 ++ P3\nP4 ++ P5", { seatsPerTable: 4, tableSizes: { 0: 6 }, balance: false });
  const res = optimize(spec);
  assert.deepEqual(verifyPlan(spec, res), []);
  assert.equal(res.wantsMet, res.wantsTotal);
  const over = specFrom(names, "P1 @ 2\nP2 @ 2\nP3 @ 2\nP4 @ 2\nP5 @ 2", { seatsPerTable: 4, tableSizes: { 0: 6 }, tableCount: 4, balance: false });
  assert.match(validateSpec(over).join(" "), /Table 2 has 5 pinned guests but holds 4/);
  const tooMany = specFrom(names, "", { seatsPerTable: 2, tableSizes: { 0: 3, 5: 3 }, tableCount: 3 });
  assert.match(validateSpec(tooMany).join(" "), /Table 6 is given a size, but there are only 3 tables/);
});

test("custom sizes: fill-evenly shares what the custom tables leave over; reseat keeps sizes", () => {
  const names = Array.from({ length: 22 }, (_, i) => `G${i + 1}`).join("\n");
  const spec = specFrom(names, "", { seatsPerTable: 10, tableCount: 3, tableSizes: { 0: 12 } });
  assert.deepEqual(capacitiesOf(spec), [12, 5, 5]);
  const first = optimize(spec);
  const prev = new Map(first.tables.flatMap((t) => t.guests.map((g) => [g.toLowerCase(), t.number - 1])));
  const more = specFrom(names + "\nLate Guest", "", { seatsPerTable: 10, tableCount: 3, tableSizes: { 0: 12 } });
  const re = reseat(more, prev, "high");
  assert.deepEqual(re.errors, []);
  assert.deepEqual(verifyPlan(more, re), []);
  assert.ok(re.tables[0].size <= 12);
});

test("setup file carries the table sizes box", () => {
  const out = parseSetup(setupJson({ guests: "A\nB", rules: "", seats: "8", tcount: "", sizes: "1: 12", balance: true, mix: "off", prevplan: "" }));
  assert.equal(out.state.sizes, "1: 12");
});

test("importGuestSheet converts a tab-separated RSVP export with a header", () => {
  const sheet = "First Name\tLast Name\tHousehold\tSide\tEntree\tRSVP\nMaya\tOkafor\tOkafor family\tBride\tvegetarian\tYes\nDaniel\tOkafor\tOkafor family\tBride\t\tYes\nSam\tVoss\t\t\t\tDeclined\nPriya\tNair\t\t\t\tyes";
  const r = importGuestSheet(sheet);
  assert.equal(r.converted, true);
  assert.equal(r.text, "Maya Okafor | Okafor family | Bride | vegetarian\nDaniel Okafor | Okafor family | Bride\nPriya Nair");
  assert.match(r.notes.join(" "), /1 declined/);
  const g = parseGuests(r.text);
  assert.deepEqual(g.errors, []);
  assert.equal(g.guests.length, 3);
});

test("importGuestSheet handles quoted CSV, a plus-one name, and leaves bar format alone", () => {
  const csv = 'Name,Plus One,Group\n"Lee, Ann",Bob Ray,Work\nCy Dune,yes,Work\n';
  const r = importGuestSheet(csv);
  assert.equal(r.text, "Lee, Ann | Lee, Ann party | Work\nBob Ray | Lee, Ann party\nCy Dune |  | Work");
  const bars = "Ann | Lee\nBob";
  assert.equal(importGuestSheet(bars).converted, false);
  assert.equal(importGuestSheet(bars).text, bars);
  assert.equal(importGuestSheet("Ann Lee\nBob Ray").converted, false);
});

test("importGuestSheet without a header reads Name, Party, Group, Meal", () => {
  const r = importGuestSheet("Ann Lee;Lee family;Bride;fish\nBob Ray;;Groom;");
  assert.equal(r.text, "Ann Lee | Lee family | Bride | fish\nBob Ray |  | Groom");
});

test("orderTable seats a party side by side and keeps an avoided pair apart on a ring", () => {
  const spec = specFrom("A | x\nB\nC | x\nD\nE | x\nF", "B ! D", { seatsPerTable: 6 });
  const W = weightMatrix(spec);
  const n = spec.guests.length;
  const order = orderTable([0, 1, 2, 3, 4, 5], W, n);
  assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4, 5]);
  const adj = (a, b) => { const i = order.indexOf(a), j = order.indexOf(b); const d = Math.abs(i - j); return d === 1 || d === order.length - 1; };
  assert.ok(adj(0, 2) && adj(2, 4) || adj(0, 4) && adj(4, 2) || adj(0, 2) && adj(0, 4) || adj(2, 4) && adj(0, 4), "the party of three sits in a row");
  assert.ok(!adj(1, 3), "the avoided pair does not touch");
});

test("orderTable beats list order on a larger table and is deterministic", () => {
  const names = Array.from({ length: 12 }, (_, i) => `G${i}`);
  const guests = names.map((n, i) => `${n} | p${i % 3}`).join("\n");
  const spec = specFrom(guests, "", { seatsPerTable: 12 });
  const W = weightMatrix(spec), n = 12, all = names.map((_, i) => i);
  const ring = (p) => p.reduce((s, g, i) => s + W[g * n + p[(i + 1) % p.length]], 0);
  const o1 = orderTable(all, W, n), o2 = orderTable(all, W, n);
  assert.deepEqual(o1, o2);
  assert.deepEqual([...o1].sort((a, b) => a - b), all);
  assert.ok(ring(o1) > ring(all));
});

test("optimize lists each table's guests in seat order with all guests present once", () => {
  const spec = sampleSpec();
  const res = optimize(spec);
  assert.deepEqual(verifyPlan(spec, res), []);
  const seen = res.tables.flatMap((t) => t.guests);
  assert.equal(new Set(seen).size, spec.guests.length);
});

test("parseAccessTables reads table numbers and flags junk", () => {
  assert.deepEqual(parseAccessTables("1, Table 3; 3").tables, [0, 2]);
  assert.equal(parseAccessTables("one").errors.length, 1);
});

test("a guest marked accessible is always seated at an accessible table, even when a wish pulls elsewhere", () => {
  const names = Array.from({ length: 12 }, (_, i) => `G${i + 1}`);
  const g = names.join("\n");
  // G1 wants to sit with G12 and G11, who are free; table 3 is the only non-accessible one.
  for (let seed = 1; seed <= 15; seed++) {
    const spec = specFrom(g, "G1 @ accessible\nG1 ++ G12\nG1 + G11\nG5 ! G6", { seatsPerTable: 4, accessTables: [0, 1], seed });
    assert.deepEqual(validateSpec(spec), []);
    const res = optimize(spec);
    assert.deepEqual(verifyPlan(spec, res), []);
    assert.ok(res.table[0] === 0 || res.table[0] === 1, `seed ${seed}: G1 at table ${res.table[0] + 1}`);
    assert.deepEqual(res.accessSeated, [{ name: "G1", table: res.table[0] + 1 }]);
  }
});

test("accessible rule: validation names the problem", () => {
  const g = "A\nB\nC\nD\nE\nF";
  assert.match(validateSpec(specFrom(g, "A @ accessible"))[0], /no accessible tables are listed/);
  assert.match(validateSpec(specFrom(g, "A @ accessible\nB @ wheelchair\nC @ step-free", { seatsPerTable: 2, accessTables: [0] })).join(" "), /room for 2/);
  assert.match(validateSpec(specFrom(g, "A @ accessible\nA @ 2", { seatsPerTable: 3, accessTables: [0] })).join(" "), /pinned to table 2/);
  assert.match(validateSpec(specFrom(g, "A @ accessible", { seatsPerTable: 3, accessTables: [5] })).join(" "), /only 2 tables/);
});

test("accessible guests still honour pins of others and capacity under reseat", () => {
  const g = "A\nB\nC\nD\nE\nF\nG\nH";
  const spec = specFrom(g, "A @ accessible\nB @ accessible\nC @ 1", { seatsPerTable: 3, accessTables: [0, 1] });
  const first = optimize(spec);
  assert.deepEqual(verifyPlan(spec, first), []);
  const { prev } = parsePlanCsv(planCsv(spec, first));
  const again = reseat(spec, prev, "high");
  assert.deepEqual(verifyPlan(spec, again), []);
  assert.ok([0, 1].includes(again.table[0]) && [0, 1].includes(again.table[1]));
});

test("place cards: one per guest, 8 to a page, name twice, table number, escaped, no meals", () => {
  const names = Array.from({ length: 10 }, (_, i) => `Guest${i} | | | vegan`);
  names[0] = "Ann <b>X | | | vegan";
  const spec = specFrom(names.join("\n"), "", { seatsPerTable: 5 });
  const res = optimize(spec);
  const html = placeCardsHtml(spec, res, "Cards <1>");
  assert.equal((html.match(/class="c"/g) || []).length, 10);
  assert.equal((html.match(/<section>/g) || []).length, 2);
  for (const t of res.tables) assert.ok(html.includes(`Table ${t.number}</em>`));
  assert.ok(html.includes("Ann &lt;b&gt;X") && !/<script|<b>|vegan/i.test(html));
  assert.ok(html.includes("<title>Cards &lt;1&gt;</title>"));
  assert.ok(placeCardsHtml(spec, { tables: [] }).includes("No guests"));
});

test("checkMove reports capacity, pins, broken and fixed wishes without changing the plan", () => {
  const spec = specFrom("A\nB\nC\nD\nE\nF", "A + B\nC ! D\nE @ 1", { seatsPerTable: 3, tableCount: 2 });
  const res = optimize(spec);
  const before = res.table.slice();
  const ix = (n) => spec.guests.findIndex((g) => g.name === n);
  assert.match(checkMove(spec, res, "Zed", 1).errors[0], /No guest/);
  assert.match(checkMove(spec, res, "A", 9).errors[0], /1 to 2/);
  assert.equal(checkMove(spec, res, "a", res.table[ix("A")] + 1).same, true);
  const other = res.table[ix("A")] === 0 ? 2 : 1;
  const m = checkMove(spec, res, "A", other);
  assert.ok(m.broke.some((x) => x.aName === "A" && x.bName === "B"));
  assert.ok(m.blocked.some((x) => /full/.test(x)));
  assert.ok(m.scoreDelta < 0);
  const p = checkMove(spec, res, "E", 2);
  assert.ok(p.blocked.some((x) => /pinned to table 1/.test(x)));
  assert.deepEqual(res.table, before);
});

test("suggestFixes offers a score-raising move or swap for an unmet wish and applies nothing", () => {
  const spec = specFrom("A\nB\nC\nD\nE\nF\nG\nH", "A + B\nA + C\nA + D\nA + E\nA ++ F\nG ! H", { seatsPerTable: 4, tableCount: 2 });
  const res = optimize(spec);
  const before = res.table.slice();
  const fixes = suggestFixes(spec, res);
  assert.deepEqual(res.table, before);
  for (const f of fixes) {
    assert.ok(f.scoreDelta > 0);
    assert.match(f.action, /^(Move|Swap) /);
  }
  // A deliberately bad plan: A+B apart in a roomy two-table event has a one-move fix.
  const bad = { ...res, table: [0, 1, 0, 0, 1, 1, 0, 1], broken: [{ kind: "want", a: 0, b: 1, aName: "A", bName: "B" }] };
  const fix = suggestFixes(specFrom("A\nB\nC\nD\nE\nF\nG\nH", "A + B", { seatsPerTable: 5, tableCount: 2 }), bad);
  assert.equal(fix.length, 1);
  assert.match(fix[0].action, /^(Move|Swap) .*\b[AB]\b/);
  assert.deepEqual(fix[0].broke, []);
});

test("compareTableCounts runs the optimiser at each table count and applies nothing", () => {
  const spec = specFrom("A\nB\nC\nD\nE\nF\nG\nH\nI\nJ", "A + B\nC + D\nE + F\nG ! H\nA ++ I", { seatsPerTable: 4, tableCount: "" });
  const before = JSON.stringify(spec);
  const rows = compareTableCounts(spec);
  assert.equal(JSON.stringify(spec), before);
  assert.deepEqual(rows.map((r) => r.tables), [3, 4, 5, 6]);
  for (const r of rows) {
    assert.equal(r.rulesTotal, 5);
    assert.ok(r.maxPerTable <= 4);
    assert.ok(r.rulesMet >= 0 && r.rulesMet <= 5);
  }
  assert.ok(rows.some((r) => r.best));
  // Each row matches a direct run at that count.
  const direct = optimize({ ...spec, tableCount: 4 });
  assert.equal(rows[1].score, direct.score);
  // A pin to table 5 rules out smaller counts.
  const pinned = specFrom("A\nB\nC\nD\nE\nF", "A @ 5", { seatsPerTable: 3, tableCount: "" });
  assert.deepEqual(compareTableCounts(pinned, 4).map((r) => r.tables), [5, 6]);
});
