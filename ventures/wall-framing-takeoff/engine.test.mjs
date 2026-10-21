import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLength, formatLength, formatInches, layoutWall, verifyWall, validatePlan, takeoff, samplePlan,
  optimizeStock, exactStock, simplexMaxLE, boundedKnapsack, cutList, toCsv, PRECUT, defaultStock,
} from "./engine.mjs";

const base = () => ({ ...samplePlan(), walls: [] });
const count = (w, kind) => w.members.filter((m) => m.kind === kind).length;
const lengths = (w, kind) => w.members.filter((m) => m.kind === kind).map((m) => m.length);

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("lengths parse the way a framer writes them", () => {
  assert.equal(parseLength("12' 6-1/2\""), 150.5);
  assert.equal(parseLength("12ft 6in"), 150);
  assert.equal(parseLength("150 1/2"), 150.5);
  assert.equal(parseLength("92-5/8"), 92.625);
  assert.equal(parseLength("40'"), 480);
  assert.equal(parseLength("1/8"), 0.125);
  assert.equal(parseLength(96), 96);
  assert.ok(Number.isNaN(parseLength("abc")));
  assert.ok(Number.isNaN(parseLength("")));
  assert.ok(Number.isNaN(parseLength("3/0")));
  assert.equal(formatLength(150.5), "12' 6-1/2\"");
  assert.equal(formatLength(480), "40' 0\"");
  assert.equal(formatInches(92.625), "92-5/8\"");
  assert.equal(formatInches(0.375), "3/8\"");
  for (let x = 0; x < 600; x += 0.0625 * 7) assert.equal(parseLength(formatLength(x)), Math.round(x * 16) / 16);
});

test("a plain 10 ft wall at 16 on center has nine studs, the second centred on 16", () => {
  const plan = base();
  const w = layoutWall(plan, { id: "A", length: 120 });
  const studs = w.members.filter((m) => m.kind === "stud").map((m) => m.x);
  assert.deepEqual(studs, [0, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 118.5]);
  assert.equal(count(w, "plate"), 3);
  assert.deepEqual(lengths(w, "stud"), Array(9).fill(PRECUT["8ft"]));
  assert.equal(w.height, 97.125);
  assert.deepEqual(verifyWall(w, { id: "A", length: 120 }), []);
});

test("a window gets kings, jacks, a header, a sill and cripples on layout, all hand-checked", () => {
  const plan = base();
  const wall = { id: "A", length: 120, openings: [{ kind: "window", offset: 40, width: 36, height: 48, header: "2x10" }] };
  const w = layoutWall(plan, wall);
  assert.equal(count(w, "stud"), 7); // the two layout studs at 47-1/4 and 63-1/4 fall in the opening
  assert.deepEqual(w.members.filter((m) => m.kind === "king").map((m) => m.x).sort((a, b) => a - b), [37, 77.5]);
  assert.deepEqual(lengths(w, "jack"), [81, 81]); // header height 82-1/2 less the bottom plate
  assert.deepEqual(lengths(w, "header"), [39, 39]); // 36 + one jack each side, two plies
  assert.deepEqual(lengths(w, "sill"), [36]);
  const top = w.members.filter((m) => m.label.startsWith("top cripple"));
  assert.deepEqual(top.map((m) => [m.x, m.length]), [[47.25, 2.375], [63.25, 2.375]]); // 94-1/8 - 82-1/2 - 9-1/4
  const bottom = w.members.filter((m) => m.label.startsWith("bottom cripple"));
  assert.deepEqual(bottom.map((m) => m.x), [40, 47.25, 63.25, 74.5]);
  assert.deepEqual([...new Set(bottom.map((m) => m.length))], [31.5]); // sill at 34-1/2, one sill ply, one plate
  assert.deepEqual(verifyWall(w, wall), []);
});

test("a door cuts the bottom plate and has no sill", () => {
  const plan = base();
  const wall = { id: "A", length: 144, openings: [{ kind: "door", offset: 50, width: 38, height: 82.5, header: "2x12" }] };
  const w = layoutWall(plan, wall);
  const bottoms = w.members.filter((m) => m.label === "bottom plate").map((m) => [m.x, m.length]);
  assert.deepEqual(bottoms, [[0, 50], [88, 56]]);
  assert.equal(count(w, "sill"), 0);
  assert.ok(w.notes.some((n) => /3\/8" .*shim/.test(n) || /gap too small/.test(n)));
  assert.deepEqual(verifyWall(w, wall), []);
});

test("long plates are spliced over full studs, cap joints at least the lap away from top joints", () => {
  const plan = base();
  for (const L of [200, 250, 300, 400, 480, 600]) {
    const wall = { id: "A", length: L, corner: true, tees: [L / 3] };
    const w = layoutWall(plan, wall);
    assert.deepEqual(verifyWall(w, wall), [], `length ${L}`);
    for (const c of w.joints.cap) for (const t of w.joints.top) assert.ok(Math.abs(c - t) >= plan.topPlateLap - 1e-9, `${L}: cap ${c} top ${t}`);
    for (const m of w.members.filter((mm) => mm.kind === "plate")) assert.ok(m.length <= 192 + 1e-9, `${L}: plate ${m.length}`);
  }
});

test("random walls lay out cleanly: nothing overlaps, every opening is clear (400 seeded walls)", () => {
  const rand = rng(7);
  let checked = 0;
  for (let n = 0; n < 400; n++) {
    const plan = base();
    plan.studSpacing = [16, 24, 19.2][n % 3];
    plan.studLength = Object.values(PRECUT)[n % 3];
    const L = Math.round(48 + rand() * 520);
    const stud = rand() < 0.3 ? "2x6" : "2x4";
    const openings = [];
    let at = 6 + rand() * 30;
    while (at < L - 60) {
      const width = Math.round(18 + rand() * 70);
      const kind = rand() < 0.4 ? "door" : "window";
      const jacks = width > 60 ? 2 : 1;
      if (at + width + 12 > L - 6) break;
      openings.push({ kind, label: `o${openings.length}`, offset: at + 3 * jacks, width, height: kind === "door" ? 82.5 : Math.round(24 + rand() * 40), header: ["2x8", "2x10", "2x12"][Math.floor(rand() * 3)], jacks });
      at += width + 12 + 6 * jacks + rand() * 60;
    }
    const wall = { id: `W${n}`, length: L, stud, corner: rand() < 0.5, tees: rand() < 0.5 ? [Math.round(10 + rand() * (L - 20))] : [], openings };
    plan.walls = [wall];
    const errors = validatePlan(plan);
    if (errors.length) continue; // a tee inside an opening's king zone, for example
    const w = layoutWall(plan, wall);
    assert.deepEqual(verifyWall(w, wall), [], `wall ${n}: ${JSON.stringify(wall)}`);
    checked++;
  }
  assert.ok(checked > 300, `only ${checked} walls were valid`);
});

test("plan problems are reported in words, not thrown", () => {
  const plan = base();
  plan.walls = [
    { id: "A", length: 120, openings: [{ kind: "window", offset: 0.5, width: 30, height: 40, header: "2x10" }] },
    { id: "A", length: 6 },
    { id: "B", length: 120, openings: [{ kind: "window", offset: 20, width: 30, height: 40, header: "2x10" }, { kind: "door", offset: 52, width: 30, height: 82.5, header: "2x10" }] },
    { id: "C", length: 120, openings: [{ kind: "window", offset: 30, width: 30, height: 40, header: "2x12", headerHeight: 90 }] },
    { id: "D", length: 120, openings: [{ kind: "window", offset: 30, width: 30, height: 80, header: "2x10" }] },
  ];
  const errors = validatePlan(plan);
  assert.ok(errors.some((e) => /Wall A.*run past the end studs/.test(e)));
  assert.ok(errors.some((e) => /two walls have this name/.test(e)));
  assert.ok(errors.some((e) => /Wall B.*overlap/.test(e)));
  assert.ok(errors.some((e) => /Wall C.*does not fit under the top plates/.test(e)));
  assert.ok(errors.some((e) => /Wall D.*sill is below the bottom plate/.test(e)));
  const r = takeoff(plan);
  assert.equal(r.ok, false);
});

test("simplex solves a known LP and returns its dual", () => {
  // max 3a + 5b, a <= 4, 2b <= 12, 3a + 2b <= 18 -> a=2, b=6, value 36; duals (0, 1.5, 1).
  const r = simplexMaxLE([[1, 0], [0, 2], [3, 2]], [3, 5], [4, 12, 18]);
  assert.ok(Math.abs(r.value - 36) < 1e-9);
  assert.deepEqual(r.y.map((v) => Math.round(v * 1e9) / 1e9), [2, 6]);
  assert.deepEqual(r.x.map((v) => Math.round(v * 1e9) / 1e9), [0, 1.5, 1]);
});

test("bounded knapsack respects bounds and capacity", () => {
  const r = boundedKnapsack([5, 4, 3], [10, 7, 5], [1, 2, 3], 12);
  assert.equal(r.value, 22); // 5 + 4 + 3 -> 10 + 7 + 5
  assert.ok(r.counts.every((c, i) => c <= [1, 2, 3][i]));
  assert.ok(r.counts.reduce((s, c, i) => s + c * [5, 4, 3][i], 0) <= 12);
});

test("the optimiser covers every piece, stays above its bound, and matches the exact cheapest order on seeded cases", () => {
  const rand = rng(11);
  let lpExact = 0;
  let total = 0;
  for (let n = 0; n < 120; n++) {
    const pieces = Array.from({ length: 2 + Math.floor(rand() * 4) }, () => ({ length: Math.round((12 + rand() * 170) * 8) / 8, qty: 1 + Math.floor(rand() * 4) }));
    const stock = [8, 10, 12, 14, 16].map((f) => ({ length: f * 12, price: n % 2 ? Math.round(f * (0.8 + 0.08 * f + rand() * 0.3) * 100) / 100 : f }));
    const res = optimizeStock(pieces, stock, 0.125);
    // Every piece is cut, and every board holds what is cut from it.
    const want = pieces.flatMap((p) => Array(p.qty).fill(p.length)).sort((a, b) => a - b);
    const got = res.bars.flatMap((b) => b.cuts.map((c) => c.length)).sort((a, b) => a - b);
    assert.deepEqual(got, want);
    for (const b of res.bars) assert.ok(b.cuts.reduce((s, c) => s + c.length + 0.125, 0) <= b.length + 0.125 + 1e-9);
    assert.ok(res.cost >= res.lpBound - 1e-6, `cost ${res.cost} below LP bound ${res.lpBound}`);
    assert.ok(res.cost <= res.ffdCost + 1e-9);
    const items = pieces.map((p) => ({ w: Math.ceil(p.length * 16 - 1e-6) + 2, d: p.qty }));
    const boards = stock.map((s) => ({ ...s, cap: s.length * 16 + 2 }));
    const exact = exactStock(items, boards, 1e8);
    if (!exact) continue;
    total++;
    assert.ok(Math.abs(res.cost - exact.cost) < 1e-6, `case ${n}: ${res.cost} vs exact ${exact.cost}`);
    assert.ok(exact.cost >= res.lpBound - 1e-6);
    if (Math.abs(res.lpCost - exact.cost) < 1e-6) lpExact++;
  }
  assert.ok(total >= 100, `exact solved only ${total}`);
  assert.ok(lpExact / total > 0.7, `LP rounding matched exact on ${lpExact}/${total}`);
});

test("a piece longer than every board is an error, not a silent drop", () => {
  assert.throws(() => optimizeStock([{ length: 200, qty: 1 }], [{ length: 192, price: 16 }]), /longer than every board/);
});

test("the example house: a complete, consistent takeoff close to its lower bound", () => {
  const plan = samplePlan();
  const r = takeoff(plan);
  assert.equal(r.ok, true);
  r.walls.forEach((w, i) => assert.deepEqual(verifyWall(w, plan.walls[i]), [], w.id));
  const pieces = r.cuts.reduce((s, c) => s + c.qty, 0);
  const cut = r.orders.reduce((s, o) => s + o.bars.reduce((t, b) => t + b.cuts.length, 0), 0);
  assert.equal(cut, pieces);
  assert.ok(r.summary.gap >= -1e-9 && r.summary.gap < 0.005, `gap ${r.summary.gap}`);
  assert.ok(r.summary.cost < r.summary.naiveCost);
  assert.equal(cutList(r.walls).length, r.cuts.length);
  const csv = toCsv(r);
  assert.match(csv, /^section,size,length_in,length,qty,detail\n/);
  assert.match(csv, /precut stud/);
});

test("default stock carries the precut stud for the wall height asked", () => {
  assert.ok(defaultStock(PRECUT["9ft"]).some((s) => s.label === "precut stud" && s.length === PRECUT["9ft"]));
  assert.ok(!defaultStock(PRECUT["9ft"]).some((s) => s.length === PRECUT["8ft"]));
});

// ---- sheathing ----
import { sheathe, defaultSheathing, panelBreaks } from "./sheathing.mjs";

const sheathed = (plan) => { const r = takeoff(plan); return { r, s: sheathe({ ...plan, sheathing: defaultSheathing() }, r) }; };

test("a plain 10 ft wall at 16 on center: joints on studs at 48 and 96, a 24 in last panel", () => {
  const plan = { ...base(), walls: [{ id: "A", length: 120, stud: "2x4" }] };
  const { s } = sheathed(plan);
  assert.ok(s.ok);
  assert.deepEqual(s.walls[0].panels.map((p) => [p.x0, p.x1]), [[0, 48 - 0], [48, 96], [96, 120]].map(([a, b]) => [a, b]));
  assert.deepEqual(s.walls[0].check, []);
  // 97-1/8 in of wall needs a 4x9 sheet; three strips (48, 48, 24) share two sheets: 48 | 48 | 24 does not pack, so three
  assert.equal(s.sheet.length, 108);
  assert.equal(s.summary.panels, 3);
});

test("19.2 on center: a panel is ripped short to the last stud that fits", () => {
  const plan = { ...base(), studSpacing: 19.2, walls: [{ id: "A", length: 144, stud: "2x4" }] };
  const { s } = sheathed(plan);
  const [p1] = s.walls[0].panels;
  // studs are centred on 19.2, 38.4, 57.6 ...; the furthest centre within 48 is 38.4
  assert.ok(Math.abs(p1.x1 - 38.4) < 0.07, String(p1.x1));
  assert.deepEqual(s.walls[0].check, []);
});

test("an opening is cut out of the panel and the cut-outs add up to the opening width", () => {
  const plan = { ...base(), walls: [{ id: "A", length: 192, stud: "2x4", openings: [{ kind: "window", label: "W", offset: 60, width: 36, height: 48, header: "2x10" }] }] };
  const { s } = sheathed(plan);
  const cuts = s.walls[0].panels.flatMap((p) => p.cutouts);
  assert.equal(cuts.reduce((t, c) => t + (c.x1 - c.x0), 0), 36);
  for (const c of cuts) { assert.equal(c.y1, 82.5); assert.equal(c.y0, 82.5 - 48); }
  assert.deepEqual(s.walls[0].check, []);
});

test("interior walls marked sheathed:false are skipped", () => {
  const { s } = sheathed(samplePlan());
  assert.deepEqual(s.walls.map((w) => w.id), ["Front", "Right", "Back", "Left"]);
});

test("no sheet long enough is an error, and a shorter cover height uses the 4x8", () => {
  const plan = { ...base(), walls: [{ id: "A", length: 96, stud: "2x4" }] };
  const r = takeoff(plan);
  const a = sheathe({ ...plan, sheathing: { sheets: [{ label: "4x8", width: 48, length: 96, price: 1 }] } }, r);
  assert.equal(a.ok, false);
  const b = sheathe({ ...plan, sheathing: { sheets: [{ label: "4x8", width: 48, length: 96, price: 1 }], coverHeight: 96 } }, r);
  assert.ok(b.ok);
  assert.equal(b.summary.sheets, 2);
});

test("400 seeded random walls: panels tile the wall, every edge has framing, cost is never below the bound", () => {
  const rand = rng(77);
  let withNailer = 0;
  for (let n = 0; n < 400; n++) {
    const length = 60 + Math.floor(rand() * 40) * 12;
    const ops = [];
    let at = 24;
    for (let k = 0; k < Math.floor(rand() * 4); k++) {
      const width = [24, 36, 48, 72][Math.floor(rand() * 4)];
      const kind = rand() < 0.3 ? "door" : "window";
      if (at + width + 24 > length) break;
      ops.push(kind === "door" ? { kind, offset: at, width, height: 82.5, header: "2x10" } : { kind, offset: at, width, height: 48, header: "2x10" });
      at += width + 30 + Math.floor(rand() * 60);
    }
    const plan = { ...base(), studSpacing: [16, 19.2, 24][Math.floor(rand() * 3)], walls: [{ id: "W", length, stud: "2x4", corner: rand() < 0.5, openings: ops }] };
    const { r, s } = sheathed(plan);
    if (!r.ok || !s.ok || !s.walls.length) continue;
    const w = s.walls[0];
    assert.deepEqual(w.check, [], JSON.stringify(plan));
    assert.equal(w.panels.reduce((t, p) => t + p.width, 0), length);
    assert.ok(s.summary.cost >= s.summary.bound - 1e-9);
    assert.ok(s.summary.sheets <= s.summary.panels);
    withNailer += w.nailers.length > 0 ? 1 : 0;
  }
  assert.ok(withNailer >= 0);
});

test("panelBreaks: nothing in reach and no opening gives null", () => {
  assert.equal(panelBreaks(200, [0, 100, 200], 48, 12, []), null);
});

test("blocking: rows sit between full studs, skip openings, and a 12 ft wall gets fire blocking", () => {
  const plan = { ...base(), studLength: 140.625, blocking: { fire: true } };
  const wall = { id: "A", length: 240, stud: "2x4", openings: [{ kind: "window", offset: 100, width: 36, height: 48, header: "2x6", headerHeight: 100 }] };
  plan.walls = [wall];
  const w = layoutWall(plan, wall);
  assert.deepEqual(verifyWall(w, wall), []);
  const bl = w.members.filter((m) => m.kind === "blocking");
  assert.ok(bl.length > 0);
  assert.ok(bl.every((m) => m.label === "fire blocking" && Math.abs(m.y + 0.75 - (1.5 + 140.625 / 2)) < 1e-9));
  assert.ok(bl.every((m) => m.x + m.w <= 100 || m.x >= 136));
  assert.ok(takeoff(plan).cuts.some((c) => c.kind === "blocking" || c.kind === "fire blocking"));
  const flat = { ...plan, blocking: undefined };
  assert.equal(layoutWall(flat, wall).members.filter((m) => m.kind === "blocking").length, 0);
  assert.ok(layoutWall(flat, wall).notes.some((n) => n.includes("fire blocking")));
  const two = { ...base(), blocking: { rows: 2 } };
  const w2 = layoutWall(two, { id: "B", length: 96, stud: "2x4" });
  assert.equal(new Set(w2.members.filter((m) => m.kind === "blocking").map((m) => m.y)).size, 2);
});
