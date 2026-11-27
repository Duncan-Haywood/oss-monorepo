// Plan PDFs as the sketch underlay (planpdf.mjs), on the PDF Plan Takeoff's
// made-up sample sheet: a 36' x 24' building at 1/4" = 1'-0" beside a wall
// section at 1/2" = 1'-0", and the same sheet printed at half size on page 2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { samplePdf, SAMPLE } from "./sample.mjs";
import { readPlanPdf, planUnderlay, underlayScale, uvToGrid, GridSnaps, snapPoints, pageSvg, toDisplay } from "./planpdf.mjs";

const inflate = async (b) => { try { return inflateSync(b); } catch { return null; } };
const read = () => readPlanPdf(samplePdf(), inflate);

test("the sheet is sized by its printed scale, which the dimension strings confirm", async () => {
  const { pages, error } = await read();
  assert.equal(error, null);
  const s = underlayScale(pages[0]);
  assert.equal(s.ratio, 48);
  assert.match(s.how, /4 of the sheet's 6 dimension strings/);
  const u = planUnderlay(pages[0]);
  assert.ok(u.ok);
  // 17 x 11 in of paper at 48 to 1: 68 ft by 44 ft
  assert.deepEqual(u.trace, { x: 0, y: 0, w: 816, h: 528 });
});

test("a set printed at half size is placed at the real size", async () => {
  const { pages } = await read();
  const s = underlayScale(pages[1]);
  assert.equal(s.ratio, 96);
  assert.match(s.how, /half size/);
  assert.deepEqual(planUnderlay(pages[1]).trace, { x: 0, y: 0, w: 816, h: 528 });
});

test("the building's corners are snap points, 36 ft and 24 ft apart on the grid", async () => {
  const { pages } = await read();
  const u = planUnderlay(pages[0]);
  const snaps = new GridSnaps(u.trace, u.uv);
  const k = 48 / 72;
  const C = SAMPLE.outsideCorners.map(([x, y]) => snaps.near({ x: x * k + 2, y: (792 - y) * k + 1.5 }, 6));
  for (const c of C) assert.ok(c);
  assert.ok(Math.abs(C[1].x - C[0].x - 432) < 1e-6, "36 ft");
  assert.ok(Math.abs(C[0].y - C[3].y - 288) < 1e-6, "24 ft");
});

test("snap points follow the picture when it is moved and doubled", async () => {
  const { pages } = await read();
  const u = planUnderlay(pages[0]);
  const t = { x: 10, y: 20, w: u.trace.w * 2, h: u.trace.h * 2 };
  const p = uvToGrid(t, 0.5, 0.25);
  assert.deepEqual(p, { x: 10 + 816, y: 20 + 264 });
  const g = new GridSnaps(t, u.uv);
  const c = g.near({ x: 10 + 2 * 80 + 1, y: 20 + 2 * (592 * 2 / 3) }, 4);
  assert.ok(c && Math.abs(c.x - (10 + 160)) < 1e-6);
});

test("with a square-wall line the answer stays on that line", async () => {
  const g = new GridSnaps({ x: 0, y: 0, w: 100, h: 100 }, [{ u: 0.5, v: 0.52 }]);
  assert.deepEqual(g.near({ x: 49, y: 50 }, 5, { axis: "h", at: 50 }), { x: 50, y: 50 });
  assert.equal(g.near({ x: 49, y: 50 }, 5, { axis: "v", at: 40 }), null);
  assert.equal(g.near({ x: 0, y: 0 }, 5), null);
});

test("rotated pages display upright and the text is escaped in the picture", () => {
  const page = { page: 1, box: [0, 0, 200, 100], rotate: 90, segs: Float64Array.from([10, 20, 30, 20]), paint: Uint8Array.from([1]), curve: Uint8Array.from([0]), runs: [{ text: "<script>&'\"", x: 50, y: 50, size: 8, angle: 0 }] };
  assert.deepEqual(toDisplay(page, 10, 20), [20, 10]);
  const { svg } = pageSvg(page);
  assert.match(svg, /viewBox="0 0 100 200"/);
  assert.ok(!svg.includes("<script>"));
  assert.match(svg, /&lt;script&gt;&amp;&apos;&quot;/);
  assert.equal(snapPoints(page).length, 2);
});

test("fill edges and curve chords are not snap points", () => {
  const page = { page: 1, box: [0, 0, 100, 100], rotate: 0, segs: Float64Array.from([0, 0, 10, 0, 20, 20, 30, 20, 40, 40, 50, 40]), paint: Uint8Array.from([1, 2, 1]), curve: Uint8Array.from([0, 0, 1]), runs: [] };
  assert.equal(snapPoints(page).length, 2);
});

test("files the reader cannot use are refused with a reason", async () => {
  assert.match((await readPlanPdf(new TextEncoder().encode("hello"), inflate)).error, /not a PDF/);
  const blank = { page: 1, box: [0, 0, 100, 100], rotate: 0, segs: new Float64Array(0), paint: new Uint8Array(0), runs: [], images: [] };
  assert.match(planUnderlay(blank).error, /no line work/);
  assert.match(planUnderlay({ ...blank, images: [{}] }).error, /scanned picture/);
  assert.equal(underlayScale(blank), null);
  assert.equal(planUnderlay(undefined).ok, false);
});

test("a sheet with no scale note is placed 40 ft across for a two-click scale", () => {
  const page = { page: 1, box: [0, 0, 600, 300], rotate: 0, segs: Float64Array.from([0, 0, 10, 0]), paint: Uint8Array.from([1]), curve: Uint8Array.from([0]), runs: [], images: [] };
  const u = planUnderlay(page);
  assert.equal(u.scale, null);
  assert.deepEqual(u.trace, { x: 0, y: 0, w: 480, h: 240 });
});
