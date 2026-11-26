import { test } from "node:test";
import assert from "node:assert/strict";
import { compare } from "./allowance-bench.mjs";

test("one plain 20 ft wall: allowance rules match hand arithmetic", () => {
  const plan = { studSpacing: 16, studLength: 96, kerf: 0.125, topPlateLap: 24, cornerExtraStuds: 2, teeExtraStuds: 2, defaultHeaderHeight: 82.5,
    stock: [8, 10, 12, 14, 16].map((f) => ({ size: "2x4", length: f * 12, price: f })), walls: [{ id: "A", length: 240, stud: "2x4" }] };
  const c = compare(plan);
  assert.ok(c.ok);
  // per-foot: (20 studs * 8 ft + 3 * 20 ft) * 1.1 = 242
  assert.ok(Math.abs(c.perFoot - 242) < 1e-9);
  // on-centre: (ceil(240/16)+1 = 16 studs * 8 + 60) * 1.1 = 206.8
  assert.ok(Math.abs(c.onCentre - 206.8) < 1e-9);
  assert.ok(c.counted > 0);
});

import { samplePlan } from "./engine.mjs";
test("the example house lays out and the on-centre rule overshoots the count", () => {
  const c = compare(samplePlan());
  assert.ok(c.ok);
  assert.ok(c.onCentre > c.counted);
});

import { spacingSweep } from "./allowance-bench.mjs";
test("wider spacing lowers the counted order and the on-centre rule, not the per-foot rule", () => {
  const [a, b] = spacingSweep(samplePlan());
  assert.ok(a.ok && b.ok);
  assert.ok(b.counted < a.counted);
  assert.ok(b.onCentre < a.onCentre);
  assert.equal(a.perFoot, b.perFoot);
});

test("two windows too close to share kings: refused plain, laid out when ganged", () => {
  const plan = { ...samplePlan(), walls: [{ id: "A", length: 240, stud: "2x4", openings: [
    { kind: "window", offset: 60, width: 36, height: 48, sill: 36, header: "2x8" }, { kind: "window", offset: 99, width: 36, height: 48, sill: 36, header: "2x8" }] }] };
  const plain = compare(plan);
  assert.equal(plain.ok, false);
  const g = compare(plan, { gang: true });
  assert.ok(g.ok && g.ganged);
});

test("at 12 in o.c. the per-foot rule under-orders; at 16 in and wider it over-orders", () => {
  const [s12, s16, s192, s24] = spacingSweep(samplePlan(), [12, 16, 19.2, 24]);
  assert.ok(s12.perFootOff < 0);
  assert.ok(s16.perFootOff > 0 && s192.perFootOff > s16.perFootOff && s24.perFootOff > s192.perFootOff);
});

test("a 16 ft opening in a 20 ft wall: refused as drawn, laid out with the bench's 24 ft stock retry", () => {
  const plan = { ...samplePlan(), walls: [{ id: "A", length: 240, stud: "2x4", openings: [
    { kind: "door", offset: 24, width: 192, height: 82, header: "2x10" }] }] };
  assert.equal(compare(plan).ok, false);
  const g = compare(plan, { gang: true });
  assert.ok(g.ok && g.longHeaders, JSON.stringify(g.errors));
});

import { breakEvenWaste } from "./allowance-bench.mjs";
test("break-even waste: the rule's own 10% waste is the break-even when it already equals the count", () => {
  const b = breakEvenWaste({ counted: 100, perFoot: 110, onCentre: 220 });
  assert.ok(Math.abs(b.perFoot - 0) < 1e-12);   // 110 / 1.1 = 100: zero waste matches
  assert.ok(Math.abs(b.onCentre - (-0.5)) < 1e-12); // 200 raw vs 100 counted: -50%
});

test("the rules size studs from each wall's own studLength when it has one", () => {
  const base = { ...samplePlan(), studLength: 96 };
  const wall = (studLength) => ({ id: "A", length: 192, stud: "2x4", ...(studLength ? { studLength } : {}) });
  const flat = compare({ ...base, walls: [wall()] });
  const tall = compare({ ...base, walls: [wall(120)] });
  assert.ok(flat.ok && tall.ok);
  // per-foot rule by hand: 16 ft wall, one stud per foot at 8 ft (or 10 ft) plus three plates, +10% waste
  assert.ok(Math.abs(flat.perFoot - 1.1 * (16 * 8 + 48)) < 1e-9);
  assert.ok(Math.abs(tall.perFoot - 1.1 * (16 * 10 + 48)) < 1e-9);
});

// Red-team guards (2026-11-26): each test below fails on a seeded mutant that the suite above let through.
import { takeoff } from "./engine.mjs";
const FRAMING_SIZES = new Set(["2x4", "2x4 PT", "2x6", "2x6 PT"]);

test("counted is exactly the framing lineal feet the takeoff buys, and a plan that lays out plain is not reported as ganged", () => {
  const plan = samplePlan();
  const c = compare(plan, { gang: true });
  assert.ok(c.ok);
  assert.equal(c.ganged, false);
  assert.equal(c.longHeaders, false);
  const r = takeoff(plan);
  const ft = r.orders.filter((o) => FRAMING_SIZES.has(o.size)).reduce((s, o) => s + o.bought, 0) / 12;
  assert.ok(Math.abs(c.counted - ft) < 1e-9, `${c.counted} vs ${ft}`);
});

test("24 ft retry stock is priced at 1.6x that size's own 16 ft board, or 1.6 x $10 when the size has none", () => {
  const stock = samplePlan().stock.map((s) => (s.size === "2x10" && s.length === 192 ? { ...s, price: 30 } : s)).filter((s) => !(s.size === "2x12" && s.length === 192));
  const plan = { ...samplePlan(), stock, walls: [{ id: "A", length: 240, stud: "2x4", openings: [
    { kind: "door", offset: 24, width: 192, height: 82, header: "2x10" }] }] };
  const g = compare(plan, { gang: true });
  assert.ok(g.ok && g.longHeaders, JSON.stringify(g.errors));
  const price = (size) => g.laidOut.stock.find((x) => x.size === size && x.length === 288)?.price;
  assert.ok(Math.abs(price("2x10") - 48) < 1e-9, String(price("2x10")));
  assert.ok(Math.abs(price("2x4") - 25.6) < 1e-9, String(price("2x4")));
  assert.ok(Math.abs(price("2x12") - 16) < 1e-9, String(price("2x12")));
});

test("the default spacing sweep is 12, 16, 19.2 and 24 in, the four the README and the comparison page quote", () => {
  assert.deepEqual(spacingSweep(samplePlan()).map((s) => s.spacing), [12, 16, 19.2, 24]);
});

// The README "Counted order against allowances" tables and vs-stud-per-foot-rule.html quote this bench's
// output; on 2026-11-26 both had drifted from it (2321 vs 2316, +17.8% vs +17.7%, 2176 vs 2177). Each quoted
// row's last three cells (counted, per-foot, on-centre) must match what `node allowance-bench.mjs` prints now.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
test("every figure the README tables and the comparison page quote matches what the bench prints", () => {
  const out = execFileSync(process.execPath, [new URL("./allowance-bench.mjs", import.meta.url).pathname], { encoding: "utf8" });
  const [main, sweep] = out.split("\n\n").map((b) => b.trim().split("\n").slice(1).map((l) => l.split(" | ")));
  assert.equal(main.length, 3, out);
  assert.ok(main.every((r) => r.length === 5), "every house lays out (Open House Plans 2 needs the ganged retry):\n" + out);
  const house = (name) => (/example house/i.test(name) ? "ex" : (name.match(/Open House Plans (\d)/) ?? [])[1]);
  /** @type {Map<string, string[]>} */
  const bySpacing = new Map(sweep.map((r) => [`${house(r[0])}@${r[1]}`, r.slice(-3)]));
  const tail = (r) => r.slice(-3);
  // README: the 16 in table quotes `main` in order; the sweep tables are keyed by house and spacing.
  const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
  const section = readme.slice(readme.indexOf("## Counted order against allowances"), readme.indexOf("**A real house (2026-11-08, `allowance-bench.mjs"));
  const rows = (text) => text.split("\n").filter((l) => /^\| (example house|Open House Plans)/i.test(l)).map((l) => l.slice(2, -2).split(" | "));
  assert.deepEqual(rows(section).map((r) => r.slice(1)), main.map((r) => r.slice(1)));
  const sweeps = readme.slice(readme.indexOf("**Spacing sweep (2026-11-01"), readme.indexOf("**Break-even waste (2026-11-07"));
  const quoted = rows(sweeps);
  assert.ok(quoted.length >= 10, String(quoted.length));
  for (const r of quoted) assert.deepEqual(tail(r), bySpacing.get(`${house(r[0])}@${r[1]}`), r.join(" | "));
  // The page: first table is the 16 in figures per house in bench order, second is the example house by spacing.
  const html = readFileSync(new URL("./vs-stud-per-foot-rule.html", import.meta.url), "utf8");
  const tables = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((m) => [...m[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((t) => [...t[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((c) => c[1])));
  assert.deepEqual(tables[0].map(tail), main.map(tail));
  assert.deepEqual(tables[1].map(tail), ["12 in", "16 in", "19.2 in", "24 in"].map((sp) => bySpacing.get(`ex@${sp}`)));
});
