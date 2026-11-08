import test from "node:test";
import assert from "node:assert/strict";
import { stackFloors } from "./stackfloors.mjs";
import { main } from "./cli.mjs";

const stock = [{ size: "2x4", length: 96, price: 4 }, { size: "2x4", length: 192, price: 9 }];
const floor = (len, n = 2) => ({ studSpacing: 16, studLength: 92.625, kerf: 0.125, topPlateLap: 24, stock,
  walls: Array.from({ length: n }, (_, i) => ({ id: `W${i + 1}`, length: len, ...(i ? { tee: { wall: "W1", at: 48 } } : {}) })) });

test("ids get the floor name, tee laps follow, stock is not doubled, input untouched", () => {
  const a = floor(120), b = floor(100), before = JSON.stringify([a, b]);
  const r = stackFloors([{ name: "1st", plan: a }, { name: "2nd", plan: b }]);
  assert.ok(r.ok);
  assert.deepEqual(r.plan.walls.map((w) => w.id), ["1st W1", "1st W2", "2nd W1", "2nd W2"]);
  assert.equal(r.plan.walls[3].tee.wall, "2nd W1");
  assert.equal(r.plan.stock.length, 2);
  assert.equal(JSON.stringify([a, b]), before);
});

test("refuses clashing names, empty floors and different spacing", () => {
  assert.ok(!stackFloors([{ name: "x", plan: floor(96) }, { name: "x", plan: floor(96) }]).ok);
  assert.ok(!stackFloors([{ name: "x", plan: { walls: [] } }]).ok);
  const c = floor(96); c.studSpacing = 24;
  assert.match(stackFloors([{ name: "a", plan: floor(96) }, { name: "b", plan: c }]).errors[0], /studSpacing/);
  assert.ok(!stackFloors(null).ok);
});

test("a floor with taller studs keeps its own length per wall", () => {
  const b = floor(96, 1); b.studLength = 104.625;
  const r = stackFloors([{ name: "a", plan: floor(96, 1) }, { name: "b", plan: b }]);
  assert.equal(r.plan.walls[0].studLength, undefined);
  assert.equal(r.plan.walls[1].studLength, 104.625);
});

test("--stack: one order for two floors costs no more than two orders, and ids carry the floor name", () => {
  const files = { "a.json": JSON.stringify(floor(130, 3)), "b.json": JSON.stringify(floor(110, 3)) };
  const rd = (p) => files[p];
  const total = (r) => JSON.parse(r.out).summary.cost;
  const A = main(["a.json", "--json"], rd), B = main(["b.json", "--json"], rd), S = main(["a.json", "--stack=b.json", "--json"], rd);
  assert.equal(S.code, 0, S.out);
  assert.deepEqual(JSON.parse(S.out).walls.map((w) => w.id), ["a W1", "a W2", "a W3", "b W1", "b W2", "b W3"]);
  assert.ok(total(S) <= total(A) + total(B) + 1e-6, `${total(S)} vs ${total(A)} + ${total(B)}`);
});

test("--stack with a bad file or clashing names is refused with a reason", () => {
  const rd = (p) => (p === "a.json" ? JSON.stringify(floor(100)) : "not json");
  assert.equal(main(["a.json", "--stack=zzz.json"], rd).code, 2);
  assert.equal(main(["a.json", "--stack=a.json"], rd).code, 1);
  assert.equal(main(["a.json", "--stack="], rd).code, 1);
});

test("--stack takes DXF reads: two drawings ordered together keep every wall, ids carry the file name", async () => {
  const { readFileSync } = await import("node:fs");
  const dxf = readFileSync(new URL("./fixtures/open-house-plans-1.dxf", import.meta.url), "utf8");
  const rd = (p) => dxf;
  const one = main(["a.dxf", "--json", "--skip-refused"], rd);
  const two = main(["a.dxf", "--stack=b.dxf", "--json", "--skip-refused"], rd);
  assert.equal(two.code, 0, two.out);
  const n = JSON.parse(one.out).walls.length;
  const ids = JSON.parse(two.out).walls.map((w) => w.id);
  assert.equal(ids.length, 2 * n);
  assert.ok(ids.some((i) => i.startsWith("b ")));
});
