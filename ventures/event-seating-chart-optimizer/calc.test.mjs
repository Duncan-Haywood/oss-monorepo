import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGuests, parseRules, validateSpec, optimize, verifyPlan, weightMatrix, planScore,
  baselinePlan, sampleSpec, planCsv, tableSignsHtml, escortBoardHtml, reseat, parsePlanCsv, SAMPLE_GUESTS, SAMPLE_RULES, resolveTableCount, capacityPerTable, WEIGHTS,
} from "./calc.mjs";

function specFrom(guestText, ruleText, extra = {}) {
  const { guests, errors: ge } = parseGuests(guestText);
  const { rules, errors: re } = parseRules(ruleText, guests);
  assert.deepEqual([...ge, ...re], []);
  return { guests, rules, seatsPerTable: 4, tableCount: "", balance: true, seed: 1, ...extra };
}

test("parseGuests reads names and parties, skips blanks and comments, flags duplicates", () => {
  const r = parseGuests("Ann Lee | Lee family\n\n# note\nBob  Ray\nann lee\n");
  assert.deepEqual(r.guests, [{ name: "Ann Lee", party: "Lee family" }, { name: "Bob Ray", party: "" }]);
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
