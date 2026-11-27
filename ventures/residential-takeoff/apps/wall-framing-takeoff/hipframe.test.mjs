import { test } from "node:test";
import assert from "node:assert/strict";
import { frameOutlineRoof, outlineFrameCuts, outlineFrameText } from "./hipframe.mjs";
import { hipRoofLines } from "./hiproof.mjs";
import { readOutline, offsetOutline, areaPerimeter } from "./roofoutline.mjs";
import { layoutRoof } from "./roof.mjs";
import { samplePlan } from "./engine.mjs";
import { main } from "./cli.mjs";

const stockOf = (lengths) => ["2x8", "2x10", "2x12"].flatMap((size) => lengths.map((length) => ({ size, length, price: length / 12 })));
const STOCK = stockOf([96, 120, 144, 168, 192, 240, 288]);
const sorted = (a) => [...a].sort((m, n) => m - n);

function frame(pts, pitch, o = {}) {
  const r = readOutline(pts);
  assert.equal(r.ok, true, r.errors.join(" "));
  const eave = offsetOutline(r.points, o.overhang ?? 12);
  const lines = hipRoofLines(eave, pitch);
  assert.equal(lines.ok, true);
  return { f: frameOutlineRoof(r.points, eave, lines.lines, { pitch, stock: STOCK, ...o }), eave, lines: lines.lines, walls: r.points };
}

/** The roof's height in units of run: L-infinity distance from (x, y) to the eave line (brute force, as hiproof.test.mjs). */
function depth(pts, x, y) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const gx = Math.max(0, Math.min(a.x, b.x) - x, x - Math.max(a.x, b.x)), gy = Math.max(0, Math.min(a.y, b.y) - y, y - Math.max(a.y, b.y));
    d = Math.min(d, Math.max(gx, gy));
  }
  return d;
}

const onSeg = (l, x, y) => {
  const dx = l.x1 - l.x0, dy = l.y1 - l.y0, L2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - l.x0) * dx + (y - l.y0) * dy) / L2));
  return Math.hypot(l.x0 + t * dx - x, l.y0 + t * dy - y) < 1e-4;
};

for (const [W, L] of [[288, 480], [320, 512], [256, 256]]) {
  test(`a ${W} x ${L} rectangle frames exactly as roof.mjs's hip roof: same commons, jacks, hips and ridge`, () => {
    const { f } = frame([[0, 0], [L, 0], [L, W], [0, W]], 6, { rafter: "2x8", hip: "2x10", ridge: "2x10" });
    assert.equal(f.ok, true, f.errors?.join(" "));
    const h = layoutRoof({ shape: "hip", width: W, length: L, pitch: 6, overhang: 12, rafter: "2x8", hip: "2x10", ridge: "2x10", spacing: 16 }, { stock: STOCK, kerf: 0.125 });
    assert.equal(h.ok, true, h.errors?.join(" "));
    assert.deepEqual(sorted(f.rafters.filter((x) => x.kind === "rafter").map((x) => x.length)), sorted(h.rafters.map((x) => x.length)));
    assert.deepEqual(sorted(f.rafters.filter((x) => x.kind === "jack rafter").map((x) => x.length)), sorted(h.jacks.map((x) => x.length)));
    assert.deepEqual(f.hips.map((x) => x.length), h.hips.map((x) => x.length));
    assert.deepEqual(f.ridges.map((x) => x.length), h.ridges.map((x) => x.length));
    assert.equal(f.counts.valleyJacks + f.counts.cripples + f.counts.valleys, 0);
  });
}

test("a Z outline the gable model cannot split gets valley jacks and cripples, each end where the roof says", () => {
  const Z = [[0, 0], [360, 0], [360, 120], [240, 120], [240, 240], [120, 240], [120, 360], [0, 360]];
  const { f, eave, lines } = frame(Z, 6, { ridge: "2x10" });
  assert.equal(f.ok, true, f.errors?.join(" "));
  assert.ok(f.counts.commons > 0 && f.counts.jacks > 0 && f.counts.valleyJacks > 0 && f.counts.cripples > 0, JSON.stringify(f.counts));
  assert.equal(f.counts.valleys, 2);
  for (const x of f.rafters) {
    const top = { x: x.x1, y: x.y1 }, bot = { x: x.x0, y: x.y0 };
    // the top is on a ridge or a hip; a valley-footed rafter starts on a valley line
    assert.ok(lines.some((l) => (x.top === "ridge" ? l.kind === "ridge" || l.kind === "hip" : l.kind === "hip") && onSeg(l, top.x, top.y)), `top of ${JSON.stringify(x)}`);
    if (x.bottom === "valley") assert.ok(lines.some((l) => l.kind === "valley" && onSeg(l, bot.x, bot.y)), `foot of ${JSON.stringify(x)}`);
    else assert.ok(depth(eave, bot.x, bot.y) < 1e-6, "an eave rafter starts on the eave line");
    // the plane rises one unit per unit of run along the rafter: the roof height at each end is the run from the eave
    const run = Math.hypot(x.x1 - x.x0, x.y1 - x.y0);
    assert.ok(Math.abs(depth(eave, top.x, top.y) - depth(eave, bot.x, bot.y) - run) < 1e-6, `run of ${JSON.stringify(x)}`);
  }
});

test("on 200 seeded random outlines every rafter lies on its plane, and rafter run x spacing is close to the plan area", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let checked = 0;
  for (let n = 0; n < 200; n++) {
    const cols = 1 + Math.floor(rnd() * 6), w = 60 + Math.floor(rnd() * 120);
    const hs = Array.from({ length: cols }, () => 120 + 24 * Math.floor(rnd() * 10));
    const pts = [[0, 0], [cols * w, 0]];
    for (let c = cols - 1; c >= 0; c--) { pts.push([(c + 1) * w, hs[c]]); pts.push([c * w, hs[c]]); }
    const r = readOutline(pts);
    const eave = offsetOutline(r.points, 12);
    if (!eave) continue;
    const lines = hipRoofLines(eave, 8).lines;
    const f = frameOutlineRoof(r.points, eave, lines, { pitch: 8, ridge: "2x10", stock: stockOf([2400]) });
    assert.equal(f.ok, true, JSON.stringify(pts));
    let run = 0;
    for (const x of f.rafters) {
      const len = Math.hypot(x.x1 - x.x0, x.y1 - x.y0);
      run += len;
      for (const s of [0.1, 0.5, 0.9]) {
        const px = x.x0 + s * (x.x1 - x.x0), py = x.y0 + s * (x.y1 - x.y0);
        assert.ok(Math.abs(depth(eave, px, py) - depth(eave, x.x0, x.y0) - s * len) < 1e-6, `${JSON.stringify(pts)} ${JSON.stringify(x)}`);
      }
      assert.ok(x.length > 0 && x.length <= 2400);
    }
    // each rafter carries about one spacing's width of roof; added commons and corners make it a band, not an equation
    const ratio = run * 16 / areaPerimeter(eave).area;
    assert.ok(ratio > 0.8 && ratio < 1.35, `${ratio} for ${JSON.stringify(pts)}`);
    assert.equal(f.hips.length + f.valleys.length, lines.filter((l) => l.kind !== "ridge").length);
    checked++;
  }
  assert.ok(checked > 150, `checked ${checked}`);
});

test("refuses unknown sizes, unlisted stock and members longer than the longest board", () => {
  const r = readOutline([[0, 0], [480, 0], [480, 288], [0, 288]]);
  const eave = offsetOutline(r.points, 12), lines = hipRoofLines(eave, 6).lines;
  assert.match(frameOutlineRoof(r.points, eave, lines, { pitch: 6, rafter: "2x9", stock: STOCK }).errors[0], /Unknown rafter size 2x9/);
  assert.match(frameOutlineRoof(r.points, eave, lines, { pitch: 6, hip: "2x6", stock: STOCK }).errors[0], /No 2x6 boards listed/);
  assert.match(frameOutlineRoof(r.points, eave, lines, { pitch: 6, stock: stockOf([96, 120]) }).errors.join(" "), /longer than the longest 2x8/);
  assert.match(frameOutlineRoof(r.points, eave, lines, { pitch: 6, spacing: 4, stock: STOCK }).errors[0], /spacing/);
});

test("cut rows group by size, length and kind; the text names every kind", () => {
  const { f } = frame([[0, 0], [360, 0], [360, 120], [240, 120], [240, 240], [120, 240], [120, 360], [0, 360]], 6, { ridge: "2x10", hip: "2x10" });
  const cuts = outlineFrameCuts(f);
  assert.equal(cuts.reduce((t, c) => t + c.qty, 0), f.rafters.length + f.hips.length + f.valleys.length + f.ridges.length);
  assert.ok(cuts.every((c) => c.walls[0] === "Roof"));
  const text = outlineFrameText(f).join("\n");
  for (const w of ["common rafters", "jack rafters", "valley jacks", "cripple jacks", "hip rafters", "valley rafters", "ridge board"]) assert.match(text, new RegExp(w));
  assert.deepEqual(outlineFrameCuts({ ok: false, errors: ["x"] }), []);
});

test("CLI: an outline the gable model cannot split puts its all-hip rafters in the lumber order and the material list", () => {
  const p = samplePlan();
  p.stock.push({ size: "2x10", length: 240, price: 30 }, { size: "2x8", length: 240, price: 24 });
  p.roof = { outline: [[0, 0], ["30'", 0], ["30'", "10'"], ["20'", "10'"], ["20'", "20'"], ["10'", "20'"], ["10'", "30'"], [0, "30'"]], pitch: 6, overhang: 12, rafter: "2x8", hip: "2x10", ridge: "2x10" };
  const out = main(["p.json", "--material-list", "--json"], () => JSON.stringify(p));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  const j = JSON.parse(out.out);
  const members = j.rows.filter((x) => x.section === "Members cut from those boards").map((x) => x.item);
  for (const m of ["2x8 rafter", "2x8 jack rafter", "2x8 valley jack rafter", "2x8 cripple jack", "2x10 hip rafter", "2x10 valley rafter", "2x10 ridge board"]) assert.ok(members.includes(m), m);
  assert.ok(j.rows.some((x) => x.item === "rafters framed from outline"));
  assert.ok(j.notes.some((x) => /Framed instead as the all-hip roof/.test(x)));
  const text = main(["p.json"], () => JSON.stringify(p));
  assert.equal(text.code, 0);
  assert.match(text.out, /framed from the outline \(all-hip, 6:12, 16 in o\.c\.\)/);
  // with no board long enough for the long hips it says why and still gives the squares
  const short = samplePlan();
  short.roof = { ...p.roof };
  const s = main(["p.json", "--material-list"], () => JSON.stringify(short));
  assert.equal(s.code, 0);
  assert.match(s.out, /Not framed as an all-hip roof either: .*longer than the longest 2x10/);
  assert.match(s.out, /roof area \(all-hip, from outline\)/);
});
