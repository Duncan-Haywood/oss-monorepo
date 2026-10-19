import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SYSTEMS, PRESETS, DEFAULTS, buildLine, parseCargo, parseRotation, orientations, resolveContainer,
  packPass, bestPack, planLoad, verifyPacking, palletise, compareOptions, viewRects, loadingOrder,
  mulberry32, balanceReport, lineFits, suggestRestarts, reportCsv, planReportHtml, sampleCargo, toMm, fromMm, MAX_UNITS,
} from "./calc.mjs";

const M = SYSTEMS.metric, IMP = SYSTEMS.imperial;
// Helper: a line from cm / kg figures.
const mk = (name, l, w, h, weight, qty, rotation = "upright", maxLayers = "", maxTop = "") =>
  buildLine({ name, l, w, h, weight, qty, rotation, maxLayers, maxTop }, M).line;
const box = (l, w, h, payload = 1e9) => resolveContainer({ l, w, h, payload }); // mm, kg

// ----- parsing and units --------------------------------------------------

test("units: centimetres and inches convert to whole millimetres", () => {
  assert.equal(toMm(40, M), 400);
  assert.equal(toMm(48, IMP), 1219); // 1219.2
  assert.equal(toMm(40, IMP), 1016);
  assert.equal(fromMm(1016, IMP), 40);
  const a = buildLine({ name: "p", l: 48, w: 40, h: 60, weight: 100, qty: 2 }, IMP).line;
  assert.deepEqual(a.dims, [1219, 1016, 1524]);
  assert.ok(Math.abs(a.weight - 45.359237) < 1e-9);
});

test("rotation words", () => {
  assert.equal(parseRotation(""), "upright");
  assert.equal(parseRotation("Upright only"), "upright");
  assert.equal(parseRotation("this side up"), "upright");
  assert.equal(parseRotation("can rotate"), "any");
  assert.equal(parseRotation("any"), "any");
  assert.equal(parseRotation("fixed"), "fixed");
  assert.equal(parseRotation("sideways maybe"), null);
});

test("orientations: counts per rotation rule, duplicates removed", () => {
  const l = (dims, rotation) => ({ dims, rotation });
  assert.equal(orientations(l([3, 2, 1], "any")).length, 6);
  assert.equal(orientations(l([3, 3, 1], "any")).length, 3);
  assert.equal(orientations(l([3, 3, 3], "any")).length, 1);
  assert.equal(orientations(l([3, 2, 1], "upright")).length, 2);
  assert.equal(orientations(l([3, 3, 1], "upright")).length, 1);
  assert.equal(orientations(l([3, 2, 1], "fixed")).length, 1);
  for (const o of orientations(l([3, 2, 1], "upright"))) assert.equal(o[2], 1);
});

test("parseCargo reads rows, a header, blanks as no limit, and rejects nonsense", () => {
  const r = parseCargo("name,l,w,h,weight,qty,rotation,layers,top\nBox,60,40,40,18,90,upright,,\nGlass,45,35,35,9,40,any,2,5\n\nbad,x,1,1,1,1", M);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].maxLayers, Infinity);
  assert.equal(r.lines[0].maxTop, Infinity);
  assert.equal(r.lines[1].maxLayers, 2);
  assert.equal(r.lines[1].maxTop, 5);
  assert.equal(r.lines[1].rotation, "any");
  assert.ok(r.warnings.length);
  assert.match(parseCargo("", M).error, /at least one/);
  assert.match(parseCargo("a,1,1,1,1,0", M).warnings.join(" "), /quantity/);
  assert.match(buildLine({ name: "x", l: 1, w: 1, h: 1, weight: -1, qty: 1 }, M).error, /weight/);
  assert.match(buildLine({ name: "x", l: 1, w: 1, h: 1, weight: 1, qty: 1.5 }, M).error, /quantity/);
  assert.match(buildLine({ name: "x", l: 1, w: 1, h: 1, weight: 1, qty: 1, maxLayers: 0 }, M).error, /layer/);
  assert.match(buildLine({ name: "x", l: 1, w: 1, h: 1, weight: 1, qty: 1, rotation: "bogus" }, M).error, /rotation/);
});

test("parseCargo caps the total unit count", () => {
  const r = parseCargo(`a,10,10,10,1,${MAX_UNITS + 1}`, M);
  assert.match(r.error, /units/);
});

test("imperial input is converted: the same cargo in inches plans identically", () => {
  const cm = parseCargo(sampleCargo(M), M);
  const inch = parseCargo(sampleCargo(IMP), IMP);
  assert.equal(cm.lines.length, inch.lines.length);
  cm.lines.forEach((l, i) => {
    l.dims.forEach((d, k) => assert.ok(Math.abs(d - inch.lines[i].dims[k]) <= 1, `${l.name} dim ${k}: ${d} vs ${inch.lines[i].dims[k]}`));
    assert.ok(Math.abs(l.weight - inch.lines[i].weight) < 0.1);
  });
});

// ----- hand-computed packings ----------------------------------------------

test("8 half-metre cubes fill a 1 m cube; the ninth does not fit", () => {
  const r = planLoad([mk("cube", 50, 50, 50, 1, 20)], { l: 1000, w: 1000, h: 1000, payload: 1e6 });
  assert.equal(r.firstPacked, 8);
  assert.equal(r.containers[0].util, 1);
  assert.equal(r.containersNeeded, 3); // 8 + 8 + 4
  assert.deepEqual(r.containers.map((c) => c.count), [8, 8, 4]);
  assert.equal(r.leftoverFirst, 12);
});

test("27 cartons of 40 x 30 x 20 tile a 120 x 90 x 60 space exactly (3 x 3 x 3)", () => {
  const r = planLoad([mk("c", 40, 30, 20, 1, 40)], { l: 1200, w: 900, h: 600, payload: 1e6 });
  assert.equal(r.firstPacked, 27);
  assert.equal(r.containers[0].volume, 1200 * 900 * 600);
  assert.equal(r.containers[0].util, 1);
});

test("a 40 ft container takes 30 Euro pallets on the floor (10 x 3), and 60 when they stack two high", () => {
  const c40 = { l: 12000, w: 2400, h: 2400, payload: 1e6 };
  const tall = planLoad([mk("pallet", 120, 80, 150, 300, 80, "upright", 1, 0)], c40);
  assert.equal(tall.firstPacked, 30); // floor only: 150 cm high, no stacking permitted
  const low = planLoad([mk("pallet", 120, 80, 100, 300, 80, "upright", "", "")], c40);
  assert.equal(low.firstPacked, 60); // 2 x 100 cm fits under 240 cm; a third layer does not
  assert.equal(low.containersNeeded, 2);
});

test("weight limit stops the load before the space does", () => {
  const r = planLoad([mk("heavy", 50, 50, 50, 100, 8)], { l: 1000, w: 1000, h: 1000, payload: 350 });
  assert.equal(r.firstPacked, 3);
  assert.ok(r.containers[0].weight <= 350);
  assert.equal(r.containers[0].weight, 300);
  assert.equal(r.containersNeeded, 3); // 3 + 3 + 2
});

test("a single unit heavier than the payload, or bigger than the container, is reported, not looped", () => {
  const c = { l: 1000, w: 1000, h: 1000, payload: 50 };
  const r = planLoad([mk("anvil", 10, 10, 10, 60, 2), mk("beam", 300, 10, 10, 1, 2, "any"), mk("ok", 10, 10, 10, 1, 3)], c);
  assert.deepEqual(r.unfit.map((u) => [u.line, u.reason, u.qty]), [[0, "weight", 2], [1, "size", 2]]);
  assert.equal(r.packedUnits, 3);
  assert.equal(r.containersNeeded, 1);
  assert.equal(lineFits(mk("a", 10, 10, 10, 1, 1), box(100, 100, 100)), null);
  assert.equal(lineFits(mk("a", 10, 10, 10, 1, 1), box(99, 100, 100)), "size");
});

test("orientation: a 3 m pole fits a 3 m tall space only if it may stand on end", () => {
  const c = { l: 1000, w: 1000, h: 3000, payload: 1e6 };
  assert.equal(planLoad([mk("pole", 300, 20, 20, 1, 1, "upright")], c).firstPacked, 0);
  assert.equal(planLoad([mk("pole", 300, 20, 20, 1, 1, "fixed")], c).firstPacked, 0);
  assert.equal(planLoad([mk("pole", 300, 20, 20, 1, 1, "any")], c).firstPacked, 1);
  // upright keeps the third dimension vertical in every placement
  const r = planLoad([mk("plank", 60, 30, 10, 1, 40, "upright")], { l: 600, w: 300, h: 400, payload: 1e6 });
  for (const p of r.containers[0].placements) assert.equal(p.h, 100);
});

test("a fixed-orientation line is never turned", () => {
  const r = planLoad([mk("fixed", 80, 30, 20, 1, 6, "fixed")], { l: 1000, w: 1000, h: 1000, payload: 1e6 });
  for (const p of r.containers[0].placements) assert.deepEqual([p.l, p.w, p.h], [800, 300, 200]);
});

test("highest-layer limit: floor-only units stay on the floor", () => {
  const c = { l: 1000, w: 500, h: 1000, payload: 1e6 }; // floor holds 2 cubes of 50 cm, stacks would hold 4
  const free = planLoad([mk("c", 50, 50, 50, 1, 4)], c);
  assert.equal(free.firstPacked, 4);
  const floorOnly = planLoad([mk("c", 50, 50, 50, 1, 4, "upright", 1)], c);
  assert.equal(floorOnly.containers[0].count, 2);
  assert.ok(floorOnly.containers[0].placements.every((p) => p.z === 0));
  const two = planLoad([mk("c", 50, 50, 50, 1, 6, "upright", 2)], { ...c, h: 2000 });
  assert.ok(two.containers[0].placements.every((p) => p.z <= 500));
  assert.equal(two.containers[0].count, 4);
});

test("weight allowed on top: a fragile unit with a 5 kg limit carries at most 5 kg", () => {
  const c = { l: 500, w: 500, h: 2500, payload: 1e6 }; // one column, five cubes of 50 cm high
  const lines = [mk("fragile", 50, 50, 50, 1, 1, "upright", "", 5), mk("heavy", 50, 50, 50, 20, 3), mk("light", 50, 50, 50, 4, 1)];
  const r = planLoad(lines, c);
  assert.equal(r.firstPacked, 5);
  assert.deepEqual(verifyPacking(r.container, lines, r.containers[0].placements), { ok: true, errors: [] });
  // fragile alone, then 20 kg units: nothing heavier than its limit may sit on it
  const f = [mk("fragile", 50, 50, 50, 1, 1, "upright", "", 5), mk("heavy", 50, 50, 50, 20, 4)];
  const r2 = planLoad(f, c);
  assert.deepEqual(verifyPacking(r2.container, f, r2.containers[0].placements), { ok: true, errors: [] });
  const fr = r2.containers[0].placements.find((p) => p.line === 0);
  const onTop = r2.containers[0].placements.filter((p) => p.z === fr.z + fr.h && p.x === fr.x && p.y === fr.y);
  assert.equal(onTop.length, 0);
  assert.equal(r2.containers[0].count, 5); // everything fits when fragile is on top
  const stuck = planLoad([mk("fragile", 50, 50, 50, 1, 1, "upright", "", 0)], c);
  assert.equal(stuck.firstPacked, 1);
});

test("multi-container plans count containers by greedy fill; the sliver is not merged when it cannot be", () => {
  const r = planLoad([mk("c", 50, 50, 50, 5, 25)], { l: 1000, w: 1000, h: 1000, payload: 1e6 });
  assert.deepEqual(r.containers.map((c) => c.count), [8, 8, 8, 1]);
  assert.equal(r.containersNeeded, 4);
  assert.equal(r.packedUnits, 25);
  assert.equal(r.lowerBound, 4); // 25 x 0.125 m3 = 3.125 m3 into 1 m3 containers
});

test("a sliver last container is merged into the one before it when the full search can do it", () => {
  // 17 cubes of 1/8 m3 against a 2 m3 container: 16 fit; the 17th would sit alone, but 2 containers are unavoidable
  const r = planLoad([mk("c", 50, 50, 50, 5, 17)], { l: 2000, w: 1000, h: 1000, payload: 1e6 });
  assert.deepEqual(r.containers.map((c) => c.count), [16, 1]);
});

test("lower bound is the larger of the volume and weight ratios", () => {
  const r = planLoad([mk("c", 100, 100, 100, 600, 10)], { l: 2000, w: 1000, h: 1000, payload: 1000 });
  assert.equal(r.lowerBound, 6); // 6000 kg / 1000 kg; volume alone would say 5
  assert.equal(r.containersNeeded, 10); // one 600 kg unit per container
});

test("support rule: a unit may not hang over an edge; a wide plank needs the base under it", () => {
  const lines = [mk("base", 50, 50, 50, 1, 1), mk("plank", 100, 50, 10, 1, 1)];
  const r = planLoad(lines, { l: 1000, w: 500, h: 1000, payload: 1e6 });
  assert.deepEqual(verifyPacking(r.container, lines, r.containers[0].placements), { ok: true, errors: [] });
  assert.equal(r.firstPacked, 2);
  // a 100 x 50 plank on a 50 x 50 base would be only half supported (< 75%), so it never sits on it
  for (const p of r.containers[0].placements) if (p.line === 1) assert.equal(p.z, 0);
});

test("best of the restarts is never worse than a single pass, and results are reproducible", () => {
  const lines = parseCargo(sampleCargo(M), M).lines;
  const cont = resolveContainer(PRESETS[1]);
  const remaining = lines.map((l) => l.qty);
  const one = bestPack(cont, lines, remaining, { restarts: 1, seed: 7 });
  const many = bestPack(cont, lines, remaining, { restarts: 24, seed: 7 });
  assert.ok(many.volume >= one.volume);
  const again = bestPack(cont, lines, remaining, { restarts: 24, seed: 7 });
  assert.deepEqual(again.placements, many.placements);
});

// ----- the verifier catches what it should ---------------------------------

const verifyCase = () => {
  const lines = [mk("a", 50, 50, 50, 10, 2), mk("b", 30, 30, 30, 5, 2, "fixed", 1, 0)];
  const cont = box(1000, 1000, 1000, 100);
  const good = [
    { line: 0, x: 0, y: 0, z: 0, l: 500, w: 500, h: 500 },
    { line: 0, x: 500, y: 0, z: 0, l: 500, w: 500, h: 500 },
    { line: 1, x: 0, y: 500, z: 0, l: 300, w: 300, h: 300 },
  ];
  return { lines, cont, good };
};

test("verifier accepts a valid packing and rejects each kind of fault", () => {
  const { lines, cont, good } = verifyCase();
  assert.equal(verifyPacking(cont, lines, good).ok, true);
  const has = (placements, re, c = cont) => verifyPacking(c, lines, placements).errors.some((e) => re.test(e));
  assert.ok(has([...good, { line: 0, x: 400, y: 0, z: 0, l: 500, w: 500, h: 500 }], /overlap/));
  assert.ok(has([{ line: 0, x: 600, y: 0, z: 0, l: 500, w: 500, h: 500 }], /outside/));
  assert.ok(has([{ line: 0, x: -1, y: 0, z: 0, l: 500, w: 500, h: 500 }], /outside/));
  assert.ok(has(good, /exceeds payload/, box(1000, 1000, 1000, 24)));
  assert.ok(has([{ line: 1, x: 0, y: 0, z: 0, l: 300, w: 300, h: 300 }, { line: 1, x: 300, y: 0, z: 0, l: 300, w: 300, h: 300 }, { line: 1, x: 600, y: 0, z: 0, l: 300, w: 300, h: 300 }], /ordered/));
  assert.ok(has([{ line: 0, x: 0, y: 0, z: 0, l: 500, w: 250, h: 500 }], /orientation/));
  assert.ok(has([{ line: 0, x: 0, y: 0, z: 100, l: 500, w: 500, h: 500 }], /supported/)); // floating
  // a fixed line placed in a different orientation (non-cube) is rejected
  const fixedLines = [mk("f", 30, 20, 10, 1, 1, "fixed")];
  assert.ok(verifyPacking(cont, fixedLines, [{ line: 0, x: 0, y: 0, z: 0, l: 200, w: 300, h: 100 }]).errors.some((e) => /orientation/.test(e)));
  assert.ok(verifyPacking(cont, fixedLines, [{ line: 0, x: 0, y: 0, z: 0, l: 300, w: 200, h: 100 }]).ok);
  // a floor-only line stacked, and a no-load line carrying weight
  const stacked = [{ line: 1, x: 0, y: 0, z: 0, l: 300, w: 300, h: 300 }, { line: 1, x: 0, y: 0, z: 300, l: 300, w: 300, h: 300 }];
  assert.ok(has(stacked, /layer 2 above the limit 1/));
  assert.ok(has(stacked, /carries/));
  // partial support
  const partial = [{ line: 0, x: 0, y: 0, z: 0, l: 500, w: 500, h: 500 }, { line: 0, x: 400, y: 0, z: 500, l: 500, w: 500, h: 500 }];
  assert.ok(has(partial, /supported/));
});

// ----- property tests ------------------------------------------------------

function randomCase(rng) {
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const nLines = ri(1, 5);
  const lines = [];
  for (let i = 0; i < nLines; i++) {
    const rot = ["upright", "any", "fixed"][ri(0, 2)];
    const layers = rng() < 0.3 ? ri(1, 3) : "";
    const top = rng() < 0.3 ? ri(0, 60) : "";
    lines.push(mk(`L${i}`, ri(10, 90), ri(10, 90), ri(10, 90), ri(1, 40), ri(1, 25), rot, layers, top));
  }
  const cont = { l: ri(800, 3000), w: ri(500, 1500), h: ri(500, 1800), payload: rng() < 0.5 ? ri(200, 1500) : 1e9 };
  return { lines, cont };
}

test("property: 150 random cases, every container validates and counts add up", () => {
  const rng = mulberry32(424242);
  let packedAny = 0;
  for (let t = 0; t < 150; t++) {
    const { lines, cont } = randomCase(rng);
    const plan = planLoad(lines, cont, { restarts: 6, seed: t + 1 });
    const placedPerLine = new Array(lines.length).fill(0);
    for (const c of plan.containers) {
      const v = verifyPacking(plan.container, lines, c.placements);
      assert.deepEqual(v.errors, [], `case ${t}`);
      c.counts.forEach((n, i) => { placedPerLine[i] += n; });
      assert.equal(c.count, c.placements.length);
      assert.ok(c.weight <= plan.container.payload + 1e-6);
      assert.ok(c.util <= 1 + 1e-9);
      packedAny += c.count;
    }
    const unfitUnits = plan.unfit.reduce((s, u) => s + u.qty, 0);
    assert.equal(plan.packedUnits + unfitUnits + plan.unplaced.reduce((s, n) => s + n, 0), plan.totalUnits, `case ${t}`);
    assert.equal(placedPerLine.reduce((s, n) => s + n, 0), plan.packedUnits);
    lines.forEach((l, i) => assert.ok(placedPerLine[i] <= l.qty));
    // every unit that fits an empty container individually is eventually placed
    assert.equal(plan.unplaced.reduce((s, n) => s + n, 0), 0, `case ${t}`);
  }
  assert.ok(packedAny > 500);
});

test("property: the packer's own volume is always a subset of the container and below the total ordered", () => {
  const rng = mulberry32(99);
  for (let t = 0; t < 40; t++) {
    const { lines, cont } = randomCase(rng);
    const c = resolveContainer(cont);
    const r = bestPack(c, lines, lines.map((l) => l.qty), { restarts: 4, seed: t });
    assert.ok(r.volume <= c.volume);
    assert.ok(r.volume <= lines.reduce((s, l) => s + l.qty * l.dims[0] * l.dims[1] * l.dims[2], 0));
    assert.equal(r.count, r.placements.length);
  }
});

test("a larger container never packs less of the first container than a smaller one that it contains (monotone on a fixed search)", () => {
  const lines = [mk("a", 40, 30, 30, 5, 120), mk("b", 25, 25, 20, 3, 120)];
  const small = planLoad(lines, PRESETS[0], { restarts: 6 });
  const big = planLoad(lines, PRESETS[1], { restarts: 6 });
  assert.ok(big.firstPacked >= small.firstPacked);
});

// ----- pallets and comparison ----------------------------------------------

test("palletise: 48 cartons of 40 x 30 x 30 cm on a 120 x 100 pallet with a 1.5 m cap", () => {
  const lines = [mk("c", 40, 30, 30, 10, 120)];
  const p = { l: 1200, w: 1000, deck: 150, tare: 20, heightCap: 1500, payload: 1000, doubleStack: false };
  const r = palletise(lines, p, { restarts: 8 });
  // 120 x 100 floor: 3 x 3 cartons of 40 x 30 + a strip; layers 30 cm, height room 135 cm -> 4 layers
  assert.ok(r.pallets >= 1);
  for (const c of r.plan.containers) assert.ok(c.usedHeight <= 1350);
  const total = r.palletLines.reduce((s, l) => s + l.qty, 0);
  assert.equal(total, r.pallets);
  const goods = r.palletLines.reduce((s, l) => s + l.qty * (l.weight - 20), 0);
  assert.equal(Math.round(goods), 1200); // all 120 cartons x 10 kg
  for (const l of r.palletLines) { assert.equal(l.maxLayers, 1); assert.equal(l.maxTop, 0); assert.ok(l.dims[2] <= 1500); }
  const dbl = palletise(lines, { ...p, doubleStack: true }, { restarts: 4 });
  assert.equal(dbl.palletLines[0].maxLayers, 2);
});

test("palletise leaves cargo that cannot go on a pallet loose", () => {
  const lines = [mk("c", 40, 30, 30, 10, 10), mk("long", 400, 20, 20, 5, 2, "any")];
  const r = palletise(lines, { l: 1200, w: 1000, deck: 150, tare: 20, heightCap: 1500, payload: 1000 }, { restarts: 4 });
  assert.equal(r.loose.length, 1);
  assert.equal(r.loose[0].name, "long");
  assert.equal(r.lines.length, r.palletLines.length + 1);
});

test("compareOptions covers every preset loose and on pallets, and each plan validates", () => {
  const lines = parseCargo(sampleCargo(M), M).lines;
  const cmpr = compareOptions(lines, { restarts: 4 });
  assert.equal(cmpr.options.length, PRESETS.length * 2);
  for (const o of cmpr.options) {
    assert.ok(o.plan.containersNeeded >= 1, o.label);
    const ls = o.mode === "pallets" ? cmpr.pallet.lines : lines;
    for (const c of o.plan.containers) assert.deepEqual(verifyPacking(o.plan.container, ls, c.placements).errors, [], o.label);
  }
  const loose = cmpr.options.filter((o) => o.mode === "loose");
  const hc = loose.find((o) => o.id === "40hc"), f40 = loose.find((o) => o.id === "40ft");
  assert.ok(hc.plan.containersNeeded <= f40.plan.containersNeeded);
  const custom = compareOptions(lines, { restarts: 2, custom: { name: "mine", l: 5000, w: 2300, h: 2300, payload: 20000 } });
  assert.equal(custom.options.length, (PRESETS.length + 1) * 2);
});

test("a standard 48 x 40 pallet container: cartons in inches", () => {
  const lines = [buildLine({ name: "case", l: 16, w: 12, h: 10, weight: 20, qty: 60 }, IMP).line];
  const r = planLoad(lines, DEFAULTS.pallet && { l: 1219, w: 1016, h: 1800 - 145, payload: 1000 * 1 }, { restarts: 8 });
  // 48 x 40 floor: 3 x 3 cartons of 16 x 12 in (48 x 36) plus a 4 in strip; 10 in layers into 65 in -> 6 layers
  assert.ok(r.firstPacked >= 3 * 3 * 6);
  assert.equal(verifyPacking(r.container, lines, r.containers[0].placements).ok, true);
});

// ----- views, order, csv, search size -------------------------------------

test("view rectangles are in painter's order and match the placements", () => {
  const placements = [
    { line: 0, x: 0, y: 0, z: 500, l: 500, w: 500, h: 500 },
    { line: 1, x: 0, y: 0, z: 0, l: 500, w: 500, h: 500 },
    { line: 1, x: 500, y: 500, z: 0, l: 500, w: 500, h: 500 },
  ];
  const top = viewRects(placements, "top");
  assert.equal(top.length, 3);
  assert.equal(top[top.length - 1].line, 0); // the one on top is drawn last
  assert.deepEqual(top[2], { line: 0, a: 0, b: 0, da: 500, db: 500 });
  const side = viewRects(placements, "side");
  assert.ok(side.some((r) => r.b === 500 && r.db === 500));
  const order = loadingOrder(placements);
  assert.deepEqual(order.map((p) => p.step), [1, 2, 3]);
  assert.equal(order[0].x, 0);
  assert.equal(order[2].x, 500);
});

test("csv lists every unit once, in loading order", () => {
  const lines = [mk("a, with comma", 50, 50, 50, 1, 10)];
  const plan = planLoad(lines, { l: 1000, w: 1000, h: 1000, payload: 1e6 });
  const csv = reportCsv(plan, lines, M);
  const rows = csv.trim().split("\n");
  assert.equal(rows.length, 1 + 10);
  assert.match(rows[1], /"a, with comma"/);
  assert.match(rows[0], /x from back wall \(cm\)/);
});

test("restarts shrink as the load grows", () => {
  assert.ok(suggestRestarts(100) > suggestRestarts(1000));
  assert.ok(suggestRestarts(1000) > suggestRestarts(5000));
  assert.ok(suggestRestarts(6000) >= 1);
});

test("a thousand-plus units plan in a reasonable time and validate", () => {
  const lines = [mk("x", 40, 30, 30, 10, 900), mk("y", 50, 40, 20, 8, 700)];
  const t = Date.now();
  const plan = planLoad(lines, PRESETS[1], { restarts: suggestRestarts(1600) });
  assert.ok(Date.now() - t < 20000);
  for (const c of plan.containers) assert.equal(verifyPacking(plan.container, lines, c.placements).ok, true);
  assert.equal(plan.packedUnits, 1600);
});

// ----- balance --------------------------------------------------------------

test("balance: a single centred box sits at 0.5, 0.5 and half its height", () => {
  const c = box(1000, 400, 400);
  const ln = [mk("a", 20, 20, 20, 100, 1)];
  const r = balanceReport(c, ln, [{ line: 0, x: 400, y: 100, z: 0, l: 200, w: 200, h: 200 }]);
  assert.equal(r.x, 0.5); assert.equal(r.y, 0.5); assert.equal(r.z, 0.25);
  assert.equal(r.backShare, 0); assert.ok(r.ok);
});

test("balance: weight weighs the average, and a back-heavy load warns", () => {
  const c = box(1000, 400, 400);
  const ln = [mk("heavy", 20, 20, 20, 900, 1), mk("light", 20, 20, 20, 100, 1)];
  const r = balanceReport(c, ln, [
    { line: 0, x: 0, y: 100, z: 0, l: 200, w: 200, h: 200 },
    { line: 1, x: 800, y: 100, z: 0, l: 200, w: 200, h: 200 },
  ]);
  assert.ok(Math.abs(r.x - 0.18) < 1e-9); // (900*100 + 100*900)/1000 mm of a 1000 mm length
  assert.ok(Math.abs(r.backShare - 0.9) < 1e-9);
  assert.equal(r.ok, false);
  assert.match(r.warnings[0], /back wall/);
});

test("balance: side-heavy and top-heavy loads each warn; empty load is fine", () => {
  const c = box(1000, 400, 400);
  const ln = [mk("a", 20, 20, 20, 100, 1)];
  const side = balanceReport(c, ln, [{ line: 0, x: 400, y: 0, z: 0, l: 200, w: 200, h: 200 }]);
  assert.match(side.warnings.join(" "), /left wall/);
  const high = balanceReport(c, ln, [{ line: 0, x: 400, y: 100, z: 200, l: 200, w: 200, h: 200 }]);
  assert.match(high.warnings.join(" "), /floor/);
  assert.equal(balanceReport(c, ln, []).ok, true);
});

test("balance: a planned load's weight matches the container weight", () => {
  const ln = [mk("carton", 40, 30, 30, 20, 60)];
  const plan = planLoad(ln, PRESETS.find((p) => p.id === "20ft"));
  const c = plan.containers[0];
  const r = balanceReport(plan.container, ln, c.placements);
  assert.equal(r.weight, c.weight);
  assert.ok(r.x > 0 && r.x < 1);
});

test("printable load plan: one section per container, escaped names, disclaimer, no script", () => {
  const lines = [mk("<b>a</b> & co", 50, 50, 50, 1, 30), mk("b", 40, 40, 40, 2, 5)];
  const plan = planLoad(lines, { l: 2000, w: 1000, h: 1000, payload: 1e6 });
  const html = planReportHtml(plan, lines, M, { notes: ["A note <x>"], when: "2026-10-18" });
  assert.equal((html.match(/<h2>Container \d+ of/g) || []).length, plan.containers.length);
  assert.ok(plan.containers.length >= 1);
  assert.match(html, /&lt;b&gt;a&lt;\/b&gt; &amp; co/);
  assert.match(html, /A note &lt;x&gt;/);
  assert.match(html, /No warranty/);
  assert.doesNotMatch(html, /<script/i);
  const total = plan.containers.reduce((s, c) => s + c.count, 0);
  assert.equal((html.match(/<tr><td>\d+<\/td><td>[AB] ·/g) || []).length, total);
  assert.equal((html.match(/<svg /g) || []).length, 2 * plan.containers.length);
});

import { encodeShare, decodeShare } from "./calc.mjs";

test("share link round-trips the form, including non-ASCII names", () => {
  const state = { units: "imperial", preset: "40ft", container: { l: "473", w: "92.5", h: "93.8", payload: "58,000" }, rows: [{ name: "Gläser «A»", l: "24", w: "16", h: "16", weight: "40", qty: "90", rotation: "upright", maxLayers: "", maxTop: "" }, { name: "Tiles", l: "20", w: "20", h: "10", weight: "55", qty: "30", rotation: "fixed", maxLayers: "3", maxTop: "200" }] };
  const { token, error } = encodeShare(state);
  assert.ok(!error);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare("#plan=" + token), state);
});

test("share link rejects garbage and falls back on unknown values", () => {
  for (const t of ["", "not base64!!", "e30", btoa("[1,2]"), btoa(JSON.stringify({ v: 2 }))]) assert.ok(decodeShare(t).error, t);
  const { token } = encodeShare({ units: "metric", preset: "nope", container: { l: "1", w: "1", h: "1", payload: "1" }, rows: [{ name: "x", l: "1", w: "1", h: "1", weight: "1", qty: "1", rotation: "sideways" }] });
  const d = decodeShare(token);
  assert.equal(d.preset, "custom");
  assert.equal(d.rows[0].rotation, "upright");
});

test("share link refuses a plan too long for a URL", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ name: "n".repeat(190) + i, l: "1", w: "1", h: "1", weight: "1", qty: "1", rotation: "any" }));
  assert.ok(encodeShare({ units: "metric", preset: "40hc", container: { l: "1", w: "1", h: "1", payload: "1" }, rows }).error);
});

test("priceOptions totals freight, divides by ordered units and never names an incomplete option cheapest", async () => {
  const { priceOptions, parseRates, compareOptions, parseCargo } = await import("./calc.mjs");
  const { lines } = parseCargo("Carton,60,40,40,15,300");
  const cmp = compareOptions(lines, { restarts: 2 });
  const priced = priceOptions(cmp.options, { "20ft": 2400, "40ft": 3800 }, 300);
  const forty = priced.find((p) => p.id === "40ft");
  assert.equal(forty.total, 3800 * forty.containers);
  assert.equal(forty.perUnit, forty.total / 300);
  assert.equal(priced.filter((p) => p.cheapest).length, 1);
  assert.ok(priced.find((p) => p.cheapest).complete);
  assert.ok(priced.every((p) => !p.id.startsWith("53ft")));
  const none = priceOptions([{ id: "20ft", label: "x", plan: { containersNeeded: 1, packedUnits: 5, unfit: [{ qty: 2 }], unplaced: [0] } }], { "20ft": 100 }, 7);
  assert.equal(none[0].complete, false);
  assert.equal(none[0].cheapest, false);
  assert.deepEqual(parseRates("20ft=2400, 40HC=4000.5"), { "20ft": 2400, "40hc": 4000.5 });
  assert.throws(() => parseRates("40ft"), /40ft=3800/);
});
