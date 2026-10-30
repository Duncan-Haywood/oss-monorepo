import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLength, formatLength, formatInches, layoutWall, verifyWall, validatePlan, takeoff, samplePlan,
  plateLaps, optimizeStock, exactStock, simplexMaxLE, boundedKnapsack, cutList, toCsv, PRECUT, defaultStock,
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
import { sheathe, defaultSheathing, panelBreaks, nailerCuts } from "./sheathing.mjs";

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

test("sheathing: a joint over an opening with no cripples comes back as a sized nailer piece", () => {
  const plan = { ...base(), studSpacing: 24, walls: [{ id: "N", length: 240, stud: "2x4", corner: false, openings: [{ kind: "door", offset: 20, width: 100, height: 82.5, header: "2x10" }] }] };
  const r = takeoff(plan);
  assert.ok(r.ok, JSON.stringify(r.errors));
  r.walls[0].members = r.walls[0].members.filter((m) => m.kind !== "cripple");
  const s = sheathe({ ...plan, sheathing: defaultSheathing() }, r);
  assert.ok(s.ok);
  const w = s.walls[0];
  assert.ok(w.nailers.length > 0);
  assert.equal(w.nailerPieces.length, w.nailers.length);
  const hdr = r.walls[0].members.find((m) => m.kind === "header");
  for (const p of w.nailerPieces) {
    assert.equal(p.size, "2x4");
    assert.ok(Math.abs(p.length - (94.125 - (hdr.y + hdr.h))) < 0.07, JSON.stringify(p));
  }
  assert.ok(s.notes.some((n) => /2x4 nailer .* long/.test(n)));
  const nl = s.nailerLumber;
  assert.equal(nl.cuts.reduce((t, c) => t + c.qty, 0), w.nailerPieces.length);
  assert.ok(nl.cuts.every((c) => c.kind === "nailer" && c.size === "2x4" && c.walls.includes("N")));
  assert.ok(nl.orders.length === 1 && nl.orders[0].boards >= 1 && nl.cost > 0);
  assert.ok(nl.orders[0].lines.every((l) => l.length >= nl.cuts[0].length));
});

test("sheathing nailers join the cut list and the lumber order", () => {
  const plan = { ...base(), studSpacing: 24, walls: [{ id: "N", length: 240, stud: "2x4", corner: false, openings: [{ kind: "door", offset: 20, width: 100, height: 82.5, header: "2x10" }] }] };
  const r = takeoff(plan);
  r.walls[0].members = r.walls[0].members.filter((m) => m.kind !== "cripple");
  const extra = nailerCuts(sheathe({ ...plan, sheathing: defaultSheathing() }, r));
  assert.ok(extra.length > 0);
  const n = extra.reduce((s, c) => s + c.qty, 0);
  const t = takeoff(plan, extra);
  assert.ok(t.ok);
  assert.equal(t.cuts.filter((c) => c.kind === "sheathing nailer").reduce((s, c) => s + c.qty, 0), n);
  assert.equal(t.summary.pieces, r.summary.pieces + n);
  assert.ok(t.summary.neededFeet > r.summary.neededFeet);
  assert.deepEqual(nailerCuts(null), []);
});

test("corner plate laps move piece lengths but not the plate totals", () => {
  const plain = takeoff(samplePlan());
  const p = { ...samplePlan(), plateLaps: true };
  const lapped = takeoff(p);
  assert.ok(lapped.ok);
  const sum = (r, re) => r.walls.reduce((s, w) => s + w.members.filter((m) => m.kind === "plate" && re.test(m.label)).reduce((a, m) => a + m.length, 0), 0);
  for (const re of [/top/, /cap/, /bottom/]) assert.ok(Math.abs(sum(plain, re) - sum(lapped, re)) < 1e-6);
  lapped.walls.forEach((w, i) => assert.deepEqual(verifyWall(w, p.walls[i]), []));
  const f = lapped.walls[0];
  const first = (label) => f.members.filter((m) => m.label === label).sort((a, b) => a.x - b.x)[0];
  assert.equal(first("top plate").x, 3.5); // butts against the last wall
  assert.equal(first("cap plate").x, -3.5); // runs through over it
  assert.deepEqual(plateLaps({ walls: [] }, {}), { topStart: 0, topEnd: 0, capStart: 0, capEnd: 0, capGaps: [] });
});

test("tee laps: the partition's cap runs over the through wall, whose cap is cut for it", () => {
  const p = samplePlan();
  p.plateLaps = true;
  const hall = p.walls.find((w) => w.id === "Hall");
  hall.tee = { wall: "Front", at: 168, end: "start" };
  const plain = takeoff({ ...p, walls: p.walls.map((w) => ({ ...w, tee: undefined })) });
  const r = takeoff(p);
  assert.ok(r.ok);
  r.walls.forEach((w, i) => assert.deepEqual(verifyWall(w, p.walls[i]), []));
  const caps = (res, id) => res.walls.find((w) => w.id === id).members.filter((m) => m.label === "cap plate");
  const total = (a) => a.reduce((s, m) => s + m.length, 0);
  assert.ok(Math.abs(total(caps(r, "Hall")) - total(caps(plain, "Hall")) - 3.5) < 1e-6); // runs 3.5 in over the Front wall
  assert.ok(Math.abs(total(caps(plain, "Front")) - total(caps(r, "Front")) - 3.5) < 1e-6); // cut 3.5 in for the partition
  assert.ok(caps(r, "Front").every((m) => m.x + m.length <= 168 - 1.75 + 1e-6 || m.x >= 168 + 1.75 - 1e-6));
  assert.deepEqual(plateLaps(p, p.walls.find((w) => w.id === "Front")).capGaps, [[166.25, 169.75]]);
  const bad = takeoff({ ...p, walls: p.walls.map((w) => (w.id === "Hall" ? { ...w, tee: { wall: "Nope", at: 5 } } : w)) });
  assert.ok(!bad.ok);
});

// ---- two-course sheathing ----
import { chooseCourses, jointBlocking } from "./sheathing.mjs";

const tallPlan = (len = 240, studLength = 140, openings = []) => ({ ...base(), studLength, stock: defaultStock(studLength), walls: [{ id: "A", length: len, stud: "2x4", openings }] });

test("chooseCourses: one sheet when it is long enough, else a lower sheet and an upper course of at least minCourse", () => {
  const sheets = defaultSheathing().sheets;
  assert.equal(chooseCourses(sheets, 100).length, 1);
  const c = chooseCourses(sheets, 144.5);
  assert.equal(c.length, 2);
  assert.equal(c[0].y1, 120);
  assert.ok(Math.abs(c[1].y1 - c[1].y0 - 24.5) < 1e-9);
  assert.equal(c[1].perSheet, 4); // four 24-1/2 in bands fit across a 9 ft sheet with kerf
  assert.equal(chooseCourses([{ width: 48, length: 96, price: 1 }], 200), null);
  // a lower sheet that would leave a 6 in sliver is passed over
  const d = chooseCourses(sheets, 126);
  assert.ok(d.every((x) => x.y1 - x.y0 >= 12 - 1e-9));
});

test("a wall taller than every sheet gets two courses, a blocked joint, and passes its own check", () => {
  const plan = tallPlan(240, 140, [{ kind: "window", label: "W", offset: 60, width: 36, height: 48, header: "2x10" }]);
  const r = takeoff(plan);
  const s = sheathe({ ...plan, sheathing: { ...defaultSheathing(), sheets: defaultSheathing().sheets.filter((x) => x.length <= 120) } }, r);
  assert.ok(s.ok, JSON.stringify(s.errors));
  assert.equal(s.courses.length, 2);
  const w = s.walls[0];
  assert.deepEqual(w.check, []);
  const lower = w.panels.filter((p) => p.course === 0);
  const upper = w.panels.filter((p) => p.course === 1);
  assert.equal(lower.length, upper.length);
  assert.ok(upper.every((p) => Math.abs(p.height - (s.cover - s.jointY)) < 1e-9 && p.y0 === s.jointY && p.id.endsWith("U")));
  // the window is below the joint: cut out of the lower course only
  assert.ok(lower.some((p) => p.cutouts.length) && upper.every((p) => p.cutouts.length === 0));
  assert.ok(w.jointBlocks.length > 0);
  assert.ok(w.jointBlocks.every((b) => b.size === "2x4" && b.y === s.jointY && b.length >= 1));
  assert.equal(s.summary.sheets, s.orders[0].qty + s.orders[1].qty);
  assert.ok(s.summary.areaBought >= s.summary.areaCovered);
  const rows = nailerCuts(s);
  assert.equal(rows.filter((c) => c.kind === "sheathing joint block").reduce((t, c) => t + c.qty, 0), w.jointBlocks.length);
  assert.ok(s.nailerLumber.orders.length === 1 && s.nailerLumber.cost > 0);
});

test("joint blocking skips bays an opening cuts out at the joint height", () => {
  // a window from 20 to 100 in, reaches the joint at 96 (4x8 and 4x6 sheets only)
  const plan = tallPlan(240, 140, [{ kind: "window", label: "W", offset: 100, width: 36, height: 80, header: "2x10", headerHeight: 100 }]);
  const r = takeoff(plan);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const sheets = [{ label: "4x8", width: 48, length: 96, price: 1 }, { label: "4x6", width: 48, length: 72, price: 1 }];
  const s = sheathe({ ...plan, sheathing: { ...defaultSheathing(), sheets } }, r);
  assert.ok(s.ok, JSON.stringify(s.errors));
  assert.deepEqual(s.walls[0].check, []);
  for (const b of s.walls[0].jointBlocks) assert.ok(b.x + b.length <= 100 + 1e-6 || b.x >= 136 - 1e-6, JSON.stringify(b));
  const { blocks } = jointBlocking(r.walls[0], plan.walls[0].openings, plan, s.jointY);
  assert.equal(blocks.length, s.walls[0].jointBlocks.length);
});

test("two-course sheathing, 300 seeded walls: every course tiles the wall, the joint is backed along its length, cost is not below the bound", () => {
  const rand = rng(31);
  let two = 0;
  for (let n = 0; n < 300; n++) {
    const studLength = 125 + Math.floor(rand() * 30);
    const len = 72 + Math.floor(rand() * 30) * 12;
    const openings = rand() < 0.6 ? [{ kind: "window", label: "W", offset: 24 + Math.floor(rand() * 20) * 4, width: 36, height: 48, header: "2x10" }] : [];
    const plan = tallPlan(len, studLength, openings);
    const r = takeoff(plan);
    if (!r.ok) continue;
    const s = sheathe({ ...plan, sheathing: { ...defaultSheathing(), sheets: defaultSheathing().sheets.filter((x) => x.length <= 120) } }, r);
    if (!s.ok) continue;
    if (s.courses.length === 2) two++;
    for (const w of s.walls) assert.deepEqual(w.check, [], `${len}/${studLength}`);
    assert.ok(s.summary.cost >= s.summary.bound - 1e-6);
  }
  assert.ok(two > 200, `only ${two} two-course walls`);
});

// ---- horizontal sheathing ----
const horiz = (plan, over = {}) => { const r = takeoff(plan); return { r, s: sheathe({ ...plan, sheathing: { ...defaultSheathing(), orientation: "horizontal", ...over } }, r) }; };

test("horizontal sheathing: courses, staggered end joints on framing, blocked course joints, self-check passes", () => {
  const plan = tallPlan(300, 105, [{ kind: "window", label: "W", offset: 60, width: 36, height: 48, header: "2x10" }]);
  const { r, s } = horiz(plan);
  assert.ok(s.ok, JSON.stringify(s.errors));
  assert.equal(s.orientation, "horizontal");
  const w = s.walls[0];
  assert.deepEqual(w.check, []);
  const heights = [...new Set(w.panels.map((p) => p.course))].map((c) => w.panels.find((p) => p.course === c).height);
  assert.ok(Math.abs(heights.reduce((t, h) => t + h, 0) - s.cover) < 1e-9);
  assert.ok(heights.every((h) => h >= 12 - 1e-9));
  // stagger: consecutive courses share no interior joint
  const joints = (c) => w.panels.filter((p) => p.course === c).map((p) => p.x1).filter((x) => x < 300 - 1e-9);
  for (let c = 0; c + 1 < heights.length; c++) assert.ok(joints(c).every((x) => !joints(c + 1).includes(x)), `course ${c} and ${c + 1}`);
  assert.equal(w.jointBlocks.length > 0, heights.length > 1);
  assert.ok(s.summary.areaBought >= s.summary.areaCovered);
  assert.ok(s.summary.cost >= s.summary.bound - 1e-6);
  const rows = nailerCuts(s);
  assert.equal(rows.filter((c) => c.kind === "sheathing joint block").reduce((t, c) => t + c.qty, 0), w.jointBlocks.length);
  assert.ok(r.ok);
});

test("horizontal sheathing: every panel edge has framing, 200 seeded walls, no sliver courses", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 200; i++) {
    const studLength = 92 + Math.floor(rnd() * 60);
    const len = 120 + Math.floor(rnd() * 360);
    const off = 12 + Math.floor(rnd() * (len - 100));
    const plan = tallPlan(len, studLength, rnd() < 0.7 ? [{ kind: "window", label: "W", offset: off, width: 36, height: 36 + Math.floor(rnd() * 24), header: "2x10" }] : []);
    const { r, s } = horiz(plan);
    if (!r.ok || !s.ok) continue;
    for (const w of s.walls) {
      assert.deepEqual(w.check, [], `case ${i}`);
      for (const c of new Set(w.panels.map((p) => p.course))) {
        const row = w.panels.filter((p) => p.course === c);
        assert.ok(Math.abs(row.reduce((t, p) => t + p.width, 0) - len) < 1e-6);
        assert.ok(row[0].height >= 12 - 1e-9);
      }
    }
  }
});

test("horizontal sheathing is chosen from the listed sheets by cost and is off by default", () => {
  const plan = tallPlan(240, 105);
  const r = takeoff(plan);
  assert.equal(sheathe({ ...plan, sheathing: defaultSheathing() }, r).orientation, undefined);
  const s = horiz(plan).s;
  const costs = defaultSheathing().sheets.map((sh) => horiz(plan, { sheets: [sh] }).s.summary.cost);
  assert.ok(Math.abs(s.summary.cost - Math.min(...costs)) < 1e-6);
});

// ---- corner overhang ----
test("corner overhang: the earlier wall's sheathing runs past its end by the next wall's depth, checks pass", () => {
  const plan = { ...samplePlan(), plateLaps: true };
  const r = takeoff(plan);
  const off = sheathe({ ...plan, sheathing: defaultSheathing() }, r);
  const on = sheathe({ ...plan, sheathing: { ...defaultSheathing(), overhang: true } }, r);
  assert.equal(on.ok, true);
  for (const w of on.walls) {
    assert.deepEqual(w.check, [], `${w.id}: ${w.check}`);
    const wall = r.walls.find((x) => x.id === w.id);
    const end = w.panels.filter((p) => p.course === 0).at(-1).x1;
    assert.equal(end, wall.length + w.overhang);
  }
  assert.ok(on.walls.some((w) => w.overhang === 3.5));
  assert.ok(on.summary.areaCovered > off.summary.areaCovered);
  assert.ok(off.walls.every((w) => !w.overhang));
});

test("a gable wall: studs rise with the roof, plates run along the slope, the layout verifies", () => {
  const plan = { ...base(), walls: [{ id: "G", length: 240, gable: { pitch: 6 } }] };
  assert.deepEqual(validatePlan(plan), []);
  const w = layoutWall(plan, plan.walls[0]);
  assert.deepEqual(verifyWall(w, plan.walls[0]), []);
  const studs = w.members.filter((m) => m.orient === "v").sort((a, b) => a.x - b.x);
  assert.equal(studs[0].length, plan.studLength + 0.5 * 1.5); // eave end: long point is the inner edge
  const mid = studs.reduce((best, m) => (Math.abs(m.x + 0.75 - 120) < Math.abs(best.x + 0.75 - 120) ? m : best));
  assert.ok(Math.abs(mid.length - (plan.studLength + 0.5 * 120)) < 6, "the stud at the peak is about 60 in taller");
  assert.ok(Math.abs(studs[studs.length - 1].length - studs[0].length) < 1e-9, "symmetric");
  // the two top plate runs are longer than their run by 1/cos
  const sec = Math.sqrt(1.25);
  const top = w.members.filter((m) => m.label === "top plate");
  assert.ok(Math.abs(top.reduce((s, m) => s + m.length, 0) - 240 * sec) < 1e-6);
  assert.equal(w.gable.peakRise, 60);
  // a taller stud costs more board: the takeoff goes through
  const r = takeoff(plan);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.ok(r.cuts.some((c) => c.kind === "stud" && c.length > plan.studLength + 50));
});

test("a gable stud straddling the peak reaches the peak, not just its higher edge", () => {
  const plan = { ...base(), walls: [{ id: "G", length: 224, gable: { pitch: 6 } }] };
  const w = layoutWall(plan, plan.walls[0]);
  const peak = w.members.find((m) => m.orient === "v" && m.x < 112 && m.x + 1.5 > 112);
  assert.ok(peak, "a 224 in wall at 16 in centres puts a stud across the peak");
  assert.equal(peak.length, plan.studLength + 0.5 * 112);
  assert.deepEqual(verifyWall(w, plan.walls[0]), []);
});

test("gable walls reject a flat pitch", () => {
  const plan = { ...base(), walls: [{ id: "G", length: 240, gable: { pitch: 0 } }] };
  assert.ok(validatePlan(plan).some((e) => e.includes("pitch")));
});

test("an off-centre gable peak: far slope is steeper, eaves stay level, plates follow each slope, layout verifies", () => {
  const plan = { ...base(), walls: [{ id: "G", length: 240, gable: { pitch: 6, peak: 80 } }] };
  assert.deepEqual(validatePlan(plan), []);
  const w = layoutWall(plan, plan.walls[0]);
  assert.deepEqual(verifyWall(w, plan.walls[0]), []);
  assert.equal(w.gable.peakRise, 40); // 6:12 over 80 in
  assert.ok(Math.abs(w.gable.farPitch - 3) < 1e-9, "40 in of rise over 160 in of run is 3:12");
  const studs = w.members.filter((m) => m.orient === "v").sort((a, b) => a.x - b.x);
  assert.equal(studs[0].length, plan.studLength + 0.5 * 1.5);
  assert.ok(Math.abs(studs[studs.length - 1].length - (plan.studLength + (3 / 12) * 1.5)) < 1e-9, "far eave stud rises at the far pitch");
  const top = w.members.filter((m) => m.label === "top plate");
  const want = 80 * Math.sqrt(1 + 0.25) + 160 * Math.sqrt(1 + 0.0625);
  assert.ok(Math.abs(top.reduce((s, m) => s + m.length, 0) - want) < 1e-6);
  assert.ok(takeoff(plan).ok);
  const bad = { ...base(), walls: [{ id: "G", length: 240, gable: { pitch: 6, peak: 1 } }] };
  assert.ok(validatePlan(bad).some((e) => e.includes("peak")));
});

test("gable walls frame openings: kings and cripples run to the slope, the layout verifies", () => {
  const ops = [
    { kind: "window", offset: 40, width: 36, height: 36, header: "2x10", headerHeight: 80, label: "W1" },
    { kind: "door", offset: 120, width: 36, height: 80, header: "2x10", headerHeight: 81.5, label: "D1" },
  ];
  const plan = { ...base(), walls: [{ id: "G", length: 240, gable: { pitch: 6 }, openings: ops }] };
  assert.deepEqual(validatePlan(plan), []);
  const w = layoutWall(plan, plan.walls[0]);
  assert.deepEqual(verifyWall(w, plan.walls[0]), []);
  const kings = w.members.filter((m) => m.kind === "king");
  assert.equal(kings.length, 4);
  assert.ok(kings.every((k) => k.length >= plan.studLength));
  const rising = kings.find((k) => k.label === "king, D1" && k.x > 120);
  assert.ok(Math.abs(rising.length - (plan.studLength + 0.5 * Math.min(rising.x + 1.5, 240 - rising.x))) < 1e-6);
  // the door cuts the bottom plate; the window stays under it
  const bottom = w.members.filter((m) => m.label === "bottom plate");
  assert.ok(!bottom.some((m) => m.x < 156 - 1e-6 && m.x + m.w > 120 + 1e-6));
  assert.ok(w.members.some((m) => m.label === "top cripple, W1" && m.length > 0));
  const r = takeoff(plan);
  assert.ok(r.ok, JSON.stringify(r.errors));
});

// ---- rim lap ----
test("rim lap: sheathing runs below the bottom plate to cover the rim board, checks pass, sheet grows", () => {
  const plan = samplePlan();
  const r = takeoff(plan);
  const off = sheathe({ ...plan, sheathing: defaultSheathing() }, r);
  const on = sheathe({ ...plan, sheathing: { ...defaultSheathing(), rimLap: 9.25 } }, r);
  assert.equal(on.ok, true);
  assert.equal(on.rimLap, 9.25);
  for (const w of on.walls) {
    assert.deepEqual(w.check, [], `${w.id}: ${w.check}`);
    assert.ok(w.panels.every((p) => p.y0 < 0 || p.course > 0));
  }
  assert.ok(on.summary.areaCovered > off.summary.areaCovered);
  assert.ok(on.notes.some((n) => /rim board/.test(n)));
  assert.ok(on.courses[0].y0 === -9.25 || on.courses.length > 1);
});

test("a gable opening that rises into the triangle: cripples only where the roof clears the header, too-tall headers rejected", () => {
  const plan = { ...base(), walls: [{ id: "G", length: 240, gable: { pitch: 6 }, openings: [
    { kind: "window", offset: 100, width: 36, height: 36, header: "2x10", headerHeight: 110, label: "W1" },
  ] }] };
  assert.deepEqual(validatePlan(plan), []);
  const w = layoutWall(plan, plan.walls[0]);
  assert.deepEqual(verifyWall(w, plan.walls[0]), []);
  const eave = plan.studLength + 1.5;
  const cr = w.members.filter((m) => m.label === "top cripple, W1");
  assert.ok(cr.length > 0 && cr.every((m) => m.length > 0.5));
  assert.ok(w.notes.some((n) => /above the eave line/.test(n)));
  const rise = (x) => 0.5 * Math.min(x, 240 - x);
  // each cripple's top sits on the roof line at its long point
  for (const m of cr) assert.ok(Math.abs(m.y + m.length - (eave + Math.max(rise(m.x), rise(m.x + 1.5)))) < 1e-6);
  const high = { ...base(), walls: [{ id: "G", length: 240, gable: { pitch: 6 }, openings: [
    { kind: "window", offset: 20, width: 36, height: 36, header: "2x10", headerHeight: 110, label: "W2" },
  ] }] };
  assert.ok(validatePlan(high).some((e) => /sloped top plate/.test(e)));
  const flat = { ...base(), walls: [{ id: "F", length: 240, openings: [{ kind: "window", offset: 100, width: 36, height: 36, header: "2x10", headerHeight: 110 }] }] };
  assert.ok(validatePlan(flat).some((e) => /under the top plates/.test(e)));
});

test("advanced framing: two-stud corners drop one backing stud, ladder tees swap backing studs for blocks, both self-check", () => {
  const wall = { id: "A", length: 240, stud: "2x4", corner: true, tees: [120] };
  const std = { ...base(), walls: [wall] };
  const adv = { ...std, advanced: { twoStudCorners: true, ladderTees: true } };
  const count = (p, kind) => layoutWall(p, wall).members.filter((m) => m.kind === kind).length;
  assert.equal(count(std, "corner"), 2);
  assert.equal(count(adv, "corner"), 1);
  assert.equal(count(std, "tee"), 2);
  assert.equal(count(adv, "tee"), 0);
  const w = layoutWall(adv, wall);
  assert.deepEqual(verifyWall(w, wall), []);
  const ladder = w.members.filter((m) => m.kind === "blocking" && m.label.startsWith("ladder blocking"));
  assert.ok(ladder.length >= 3);
  // blocks sit between the studs either side of the tee, 24 in apart, and never touch a stud
  const studs = w.members.filter((m) => m.orient === "v");
  assert.ok(ladder.every((b) => !studs.some((s) => b.x < s.x + s.w - 1e-6 && b.x + b.w > s.x + 1e-6)));
  assert.ok(ladder.every((b) => b.x < 120 && b.x + b.w > 120));
  assert.ok(takeoff(adv).ok);
});

test("advanced framing: a tee next to an opening falls back to standard backing with a note", () => {
  const wall = { id: "A", length: 240, stud: "2x4", tees: [120], openings: [{ kind: "window", offset: 110, width: 36, height: 48, header: "2x6", headerHeight: 80 }] };
  const plan = { ...base(), walls: [wall], advanced: { ladderTees: true } };
  const w = layoutWall(plan, wall);
  assert.ok(w.notes.some((n) => n.includes("Ladder blocking")));
  assert.deepEqual(verifyWall(w, wall), []);
});

test("advanced framing: a single top plate drops the cap plate, lowers the wall 1-1/2 in and counts the ties", () => {
  const wall = { id: "A", length: 240, stud: "2x4", corner: true, tees: [120] };
  const std = { ...base(), walls: [wall] };
  const one = { ...std, advanced: { singleTopPlate: true } };
  const a = layoutWall(std, wall);
  const b = layoutWall(one, wall);
  assert.equal(b.members.filter((m) => m.label === "cap plate").length, 0);
  assert.equal(a.height - b.height, 1.5);
  assert.deepEqual(verifyWall(b, wall), []);
  assert.deepEqual(b.joints.cap, []);
  assert.equal(b.plateTies, b.joints.top.length + 2);
  assert.ok(b.notes.some((n) => n.includes("single top plate")));
  const lenOf = (w, label) => w.members.filter((m) => m.label === label).reduce((t, m) => t + m.length, 0);
  assert.equal(lenOf(a, "cap plate"), 240);
  assert.ok(takeoff(one).ok);
});

test("gable wall sheathing: panels on full-height studs, long point sets the sheet, area matches the triangle", () => {
  const plan = { ...base(), walls: [{ id: "G", length: 240, gable: { pitch: 6 }, openings: [{ kind: "window", label: "W", offset: 100, width: 36, height: 36, header: "2x6" }] }] };
  const { r, s } = sheathed(plan);
  assert.ok(s.ok, JSON.stringify(s.errors));
  const g = s.gables;
  assert.ok(g, "a gable order exists");
  const gw = g.walls[0];
  assert.deepEqual(gw.check, []);
  assert.ok(Math.abs(gw.panels.reduce((t, p) => t + p.width, 0) - 240) < 1e-9, "panels span the wall");
  assert.ok(gw.panels.every((p) => p.width <= 48 + 1e-9));
  // the tallest panel is the one at the peak and needs two courses (157 in > the longest 144 in sheet)
  const tallest = gw.panels.reduce((a, b) => (b.height > a.height ? b : a));
  assert.ok(tallest.height > 144 && tallest.sheets.length === 2);
  // exact area under the roof line: eave height * run + triangle (peak rise 60 over 240) with plate thickness along the slope
  const sec = Math.sqrt(1.25);
  const eave = 1.5 + plan.studLength + 3 * sec;
  const expected = (eave * 240 + 0.5 * 240 * 60) / 144 - 36 * 36 / 144;
  assert.ok(Math.abs(g.summary.areaCovered - expected) < 1e-6, `${g.summary.areaCovered} vs ${expected}`);
  assert.ok(g.summary.areaBought >= g.summary.areaCovered);
  assert.ok(g.summary.sheets >= Math.ceil(g.summary.areaCovered / 48), "no fewer sheets than the area needs, at the longest sheet (4x12, 48 sq ft)");
});

test("nested gable courses: two like trapezoids turned against each other fill a parallelogram, hand heights", async () => {
  const { nestedHeight } = await import("./sheathing.mjs");
  // 48 wide, 20 in at the low edge and 44 at the high edge: turned, the two heights add to 64 everywhere
  const a = { width: 48, e: [20, 44] };
  assert.ok(Math.abs(nestedHeight(a, a).height - 64.125) < 1e-9);
  // a 24 in wide course 44..56 turned over the 20..44 one, same slope 1/2: 20 + x/2 + 56 - x/2 = 76
  const b = { width: 24, e: [44, 56] };
  assert.ok(Math.abs(nestedHeight(a, b).height - 76.125) < 1e-9);
  assert.ok(nestedHeight(a, b).width === 48);
  // a rectangle (no slope) just stacks: heights add
  const r = { width: 48, e: [30, 30] };
  assert.ok(Math.abs(nestedHeight(r, r).height - 60.125) < 1e-9);
});

test("gable wall sheathing: sloped top courses nest on one sheet when the full order is cheaper, never dearer", () => {
  const plan = { ...base(), walls: [{ id: "G", length: 240, gable: { pitch: 6 } }] };
  const { s } = sheathed(plan);
  const g = s.gables;
  assert.ok(g.summary.nestedPairs >= 1, "the 6:12 gable has courses that nest");
  assert.ok(g.summary.cost < g.summary.unnestedCost, `${g.summary.cost} vs ${g.summary.unnestedCost}`);
  const nested = g.walls[0].panels.filter((p) => p.nestedWith);
  assert.ok(nested.length >= 2 && nested.every((p) => g.walls[0].panels.find((q) => q.id === p.nestedWith).nestedWith === p.id), "pairs point at each other");
  assert.deepEqual(g.walls[0].check, []);
  assert.ok(g.summary.areaBought >= g.summary.areaCovered);
  assert.ok(g.summary.cost >= g.summary.bound - 1e-9);
  // 8:12 on a 24 ft wall: nesting does not lower the cost, so the order equals the bounding-box one
  const steep = sheathed({ ...base(), walls: [{ id: "G", length: 288, gable: { pitch: 8 } }] }).s.gables;
  assert.equal(steep.summary.cost, steep.summary.unnestedCost);
  assert.equal(steep.summary.nestedPairs, 0);
});

test("windows a mullion apart share their kings; closer than that is refused in words", () => {
  const plan = base();
  const win = (offset, extra = {}) => ({ kind: "window", offset, width: 36, height: 48, header: "2x10", ...extra });
  // 5 in between: jack + king + jack = 4.5 in fits, 0.5 in is left beside the second window's jack
  const wall = { id: "A", length: 144, openings: [win(30, { label: "w1" }), win(71, { label: "w2" })] };
  plan.walls = [wall];
  assert.deepEqual(validatePlan(plan), []);
  const w = layoutWall(plan, wall);
  assert.deepEqual(w.members.filter((m) => m.kind === "king").map((m) => m.x).sort((a, b) => a - b), [27, 67.5, 108.5]);
  assert.equal(w.members.filter((m) => /shared king/.test(m.label)).length, 1);
  assert.ok(w.notes.some((n) => /share 1 king/.test(n)));
  assert.deepEqual(verifyWall(w, wall), []);
  // exactly 4.5 in: no sliver
  const tight = { id: "B", length: 144, openings: [win(30, { label: "a" }), win(70.5, { label: "b" })] };
  plan.walls = [tight];
  assert.deepEqual(validatePlan(plan), []);
  assert.deepEqual(verifyWall(layoutWall(plan, tight), tight), []);
  // 3 in: no room for a king between the jacks
  const mull = { id: "C", length: 144, openings: [win(30), win(69)] };
  plan.walls = [mull];
  assert.ok(validatePlan(plan).some((e) => /too narrow to share kings.*4-1\/2/.test(e)));
});

test("an opening near a wall end uses the end stud as its king", () => {
  const plan = base();
  // jack (1.5) + end stud (1.5) = 3 in minimum; a 5 in offset leaves a 3.5 in strip, one king short
  plan.walls = [{ id: "N", length: 120, openings: [{ kind: "door", offset: 3, width: 30, height: 82.5, header: "2x10" }] }];
  assert.deepEqual(validatePlan(plan), []);
  const r = takeoff(plan);
  const w = r.walls[0];
  assert.equal(w.members.filter((m) => m.kind === "king").length, 1);
  assert.ok(w.notes.some((n) => /end stud serves as its king/.test(n)));
  assert.deepEqual(verifyWall(w, plan.walls[0]), []);
  // right end too, and a 2-king opening keeping the king that fits
  const e = layoutWall(plan, { id: "E", length: 120, openings: [{ kind: "window", label: "R", offset: 120 - 3 - 36, width: 36, height: 40, header: "2x10", kings: 2 }, { kind: "window", label: "M", offset: 20, width: 36, height: 40, header: "2x10", kings: 2 }] });
  assert.equal(e.members.filter((m) => m.kind === "king").length, 6);
  assert.deepEqual(verifyWall(e, { id: "E", length: 120, openings: [{ kind: "window", label: "R", offset: 81, width: 36, height: 40, header: "2x10", kings: 2 }, { kind: "window", label: "M", offset: 20, width: 36, height: 40, header: "2x10", kings: 2 }] }), []);
  plan.walls[0].openings[0].offset = 2.9;
  assert.ok(validatePlan(plan).some((e) => /jacks must clear the end stud/.test(e)));
});

test("blocking: stagger alternates bays above and below the row line, and fire blocking still holds 10 ft", () => {
  const plan = { ...base(), studLength: 140.625, blocking: { fire: true, stagger: true } };
  const wall = { id: "A", length: 240, stud: "2x4", openings: [] };
  plan.walls = [wall];
  const w = layoutWall(plan, wall);
  const bl = w.members.filter((m) => m.kind === "blocking");
  assert.ok(bl.length >= 2);
  const mid = 1.5 + 140.625 / 2 - 0.75;
  assert.deepEqual(verifyWall(w, wall), []);
  const offs = new Set(bl.map((m) => Math.round((m.y - mid) * 1000) / 1000));
  assert.ok(offs.has(1.5) && offs.has(-1.5) && offs.size === 2);
  const flat = layoutWall({ ...plan, blocking: { fire: true } }, wall).members.filter((m) => m.kind === "blocking");
  assert.equal(bl.length, flat.length);
  // a 10 ft run limit: the worst staggered gap between plate, rows and plate stays within 120 in
  const ys = [...new Set(bl.map((m) => m.y))].sort((a, b) => a - b);
  assert.ok(ys[0] - 1.5 <= 120 && (plan.studLength + 3) - (ys[ys.length - 1] + 1.5) <= 120);
});
