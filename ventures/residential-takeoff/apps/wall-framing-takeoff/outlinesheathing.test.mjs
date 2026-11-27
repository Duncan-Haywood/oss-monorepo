import { test } from "node:test";
import assert from "node:assert/strict";
import { outlineRoof } from "./roofoutline.mjs";
import { layoutRoof, slopeFactor } from "./roof.mjs";
import { sheatheOutlineRoof, outlineSheathingText, outlineSheathingCuts, ripStrips, runEnds, layRunOnRafters, planeSection, planeDepth, weighStartsOneByOne, START_TRIES } from "./outlinesheathing.mjs";
import { frameOutlineRoof } from "./hipframe.mjs";

const stock = ["2x8", "2x10", "2x12"].flatMap((size) => [96, 120, 144, 168, 192, 240, 288].map((length) => ({ size, length, price: length / 12 })));
const L = [[0, 0], [480, 0], [480, 240], [240, 240], [240, 420], [0, 420]];

test("a rectangle's courses and sheet count are the hip roof's in roof.mjs, piece for piece", () => {
  for (const [w, l, pitch] of [[336, 480, 4], [288, 480, 6], [240, 360, 9]]) {
    const ro = outlineRoof([[0, 0], [l, 0], [l, w], [0, w]], { pitch, overhang: 12 });
    // without hip starts on both sides, the layouts are the same piece for piece
    const s = sheatheOutlineRoof(ro, { hipStarts: false });
    assert.equal(s.ok, true, s.errors.join(" "));
    const hip = { shape: "hip", width: w, length: l, pitch, overhang: 12, rafter: "2x8", hip: "2x10", ridge: "2x10", spacing: 16 };
    const r = layoutRoof({ ...hip, hipStarts: false }, { stock });
    assert.equal(r.ok, true, (r.errors || []).join(" "));
    assert.equal(s.sheets.count, r.sheets.count, `${w} x ${l} at ${pitch}:12`);
    assert.ok(Math.abs(s.sheets.area - r.sheets.area) < 1e-6);
    // plane 1 runs along the long side: roof.mjs's "long" courses; plane 2 its "end" courses
    for (const [plane, name] of [[s.planes[0], "long"], [s.planes[1], "end"]]) {
      const theirs = r.courses.filter((c) => c.plane === name);
      assert.equal(plane.courses.length, theirs.length);
      plane.courses.forEach((c, i) => {
        assert.deepEqual(c.pieces.map((p) => p.length), theirs[i].pieces.map((p) => Math.round(p.length * 16) / 16), `${name} course ${i}`);
      });
    }
    // with them (the default) the count only comes down
    const hs = sheatheOutlineRoof(ro);
    assert.ok(hs.sheets.count < s.sheets.count, `${w} x ${l} at ${pitch}:12: ${hs.sheets.count} vs ${s.sheets.count}`);
    assert.equal(hs.sheets.withoutHipStarts, s.sheets.count);
    // roof.mjs's own reuse (2026-11-26) comes down from the same count; the two pack the starts differently
    // (this one rips strips across widths and staggers pieces), so the counts are compared, not the pieces
    const rs = layoutRoof(hip, { stock });
    assert.equal(rs.sheets.withoutReuse, s.sheets.count);
    assert.ok(rs.sheets.count < s.sheets.count, `${w} x ${l} at ${pitch}:12: roof.mjs ${rs.sheets.count} vs ${s.sheets.count}`);
    assert.ok(Math.abs(rs.sheets.count - hs.sheets.count) <= 1, `${w} x ${l} at ${pitch}:12: roof.mjs ${rs.sheets.count}, outline ${hs.sheets.count}`);
  }
});

test("a 40 x 28 ft hip roof at 6:12: hip offcuts start the hip ends of the courses above (hand-checked)", () => {
  // eave line 504 x 360 in (12 in overhang); one 48 in course covers 48 / sqrt(1.25) = 42.933 in of plan depth,
  // so each course is 2 x 42.933 shorter than the one below, and a hip end's 45-degree cut leaves a right
  // triangle 42-15/16 along the course and 48 up the slope, right angle at the top of the piece's end.
  const ro = outlineRoof([[0, 0], [480, 0], [480, 336], [0, 336]], { pitch: 6, overhang: 12 });
  const s = sheatheOutlineRoof(ro);
  assert.equal(s.ok, true, s.errors.join(" "));
  // cutting every piece to its course's bottom length (roof.mjs's layout) takes 53 sheets
  assert.equal(s.sheets.withoutHipStarts, 53);
  assert.equal(s.sheets.count, 47);
  // turned end for end, that triangle has its right angle at the bottom and its hypotenuse along the next
  // course's hip, which is the corner the next course up needs at that hip. Plane 1's second course: its left
  // end starts with a triangle at 42-15/16 (where the hip crosses its bottom edge), and the sheet after it starts
  // a band further on, at the course's top length: 85-7/8 = 2 x 42.933
  const c1 = s.planes[0].courses[1];
  assert.deepEqual(c1.pieces[0], { x: 42.9375, length: 42.9375, offcut: "left", hip: true });
  assert.equal(c1.pieces[1].x, 85.875);
  // the course below gave its left triangle (its first piece is a full 96 in sheet laid from the hip)
  assert.deepEqual(s.planes[0].courses[0].pieces[0], { x: 0, length: 96 });
  // the course above that is the next donor: cut to its bottom length again, nothing started
  assert.ok(s.planes[0].courses[2].pieces.every((q) => !q.offcut));
  assert.equal(s.planes[0].courses[2].pieces.reduce((t, q) => t + q.length, 0), Math.round((504 - 4 * 48 / slopeFactor(6)) * 16) / 16);
  // every start used a triangle some hip end gave, none twice
  assert.ok(s.sheets.hipStarts > 0 && s.sheets.valleyFills + s.sheets.hipStarts <= s.sheets.hipOffcuts);
  assert.ok(s.notes.some((n) => /hip ends start with a hip offcut from another course of the same width, turned end for end .*: 6 sheets fewer/.test(n)), s.notes.join("\n"));
  assert.ok(s.sheets.coveredSqFt >= s.sheets.area - 1e-6);
  // switched off, the layout is the old one
  const off = sheatheOutlineRoof(ro, { hipStarts: false });
  assert.equal(off.sheets.count, 53);
  assert.equal(off.sheets.hipStarts, 0);
});

test("on an L the inside plane's courses grow towards the valley by one course's run (hand-checked)", () => {
  const ro = outlineRoof(L, { pitch: 6, overhang: 12 });
  const s = sheatheOutlineRoof(ro);
  assert.equal(s.ok, true, s.errors.join(" "));
  // the eave line's third side runs from (492, 252) to (252, 252): 240 in, a hip at its outside end and a
  // valley at its inside end. Up one 48 in course the plan run is 48 / sqrt(1 + 0.25) = 42.933 in, so the
  // hip end moves in 42.933 and the valley end out 42.933: one piece must span 240 + 42.933 = 282.93 in.
  const p3 = s.planes.find((p) => p.side === 3);
  assert.ok(p3);
  assert.equal(p3.eaveIn, 240);
  const sum = p3.courses[0].pieces.reduce((t, p) => t + p.length, 0);
  assert.equal(sum, Math.round((240 + 48 / slopeFactor(6)) * 16) / 16);
  // the rectangle stops at the bottom's 240 in and the valley corner is a hip's triangle, 42.933 in along the
  // course (42-15/16 rounded), so the pieces cut from sheets are 96 + 96 + 48 rather than 96 + 96 + 90-15/16
  assert.deepEqual(p3.courses[0].pieces.map((p) => p.length), [96, 96, 48, 42.9375]);
  assert.deepEqual(p3.courses[0].pieces.map((p) => p.offcut || ""), ["", "", "", "right"]);
  // the plane on the valley's other side (side 4) starts at the valley: its triangle is on the left
  const p4 = s.planes.find((p) => p.side === 4);
  assert.ok(p4);
  assert.equal(p4.courses[0].pieces[0].offcut, "left");
  // one valley, two planes meeting it, four courses each: 8 corners, every one filled
  assert.equal(s.sheets.valleyFills, 8);
  // the long eave (504 in) loses 2 x 42.933 at its hips per course, as on a rectangle
  const p1 = s.planes.find((p) => p.side === 1);
  assert.ok(p1);
  assert.equal(p1.courses[1].pieces.reduce((t, p) => t + p.length, 0), Math.round((504 - 2 * 42.933) * 16) / 16);
  assert.equal(s.planes.length, 6);
  assert.ok(s.sheets.count * 32 >= s.sheets.area, "the sheets cover the roof");
  assert.match(outlineSheathingText(s).join("\n"), /Plane 3 \(eave side 240"/);
});

/** Even-odd inside test, written apart from the module's. @param {{x:number,y:number}[]} p */
function within(p, /** @type {number} */ x, /** @type {number} */ y) {
  let c = false;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (a.x === b.x && (a.y > y) !== (b.y > y) && a.x > x) c = !c; }
  return c;
}

/** L-infinity depth of (x, y) inside the eave line and the side it is measured to (the roof's own rule, hiproof.mjs). */
function nearest(/** @type {{x:number,y:number}[]} */ p, /** @type {number} */ x, /** @type {number} */ y) {
  let best = Infinity, next = Infinity, side = -1;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const gx = Math.max(0, Math.min(a.x, b.x) - x, x - Math.max(a.x, b.x)), gy = Math.max(0, Math.min(a.y, b.y) - y, y - Math.max(a.y, b.y));
    const d = Math.max(gx, gy);
    if (d < best) { next = best; best = d; side = i; } else if (d < next) next = d;
  }
  return { d: best, side, margin: next - best };
}

test("on 120 seeded random outlines every point of the roof is under a piece of its own plane's course", () => {
  let seed = 23;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let checked = 0, points = 0, fills = 0, starts = 0;
  for (let n = 0; n < 120; n++) {
    const cols = 1 + Math.floor(rnd() * 6), w = 60 + Math.floor(rnd() * 120);
    const hs = Array.from({ length: cols }, () => 120 + 24 * Math.floor(rnd() * 10));
    const pts = [[0, 0], [cols * w, 0]];
    for (let c = cols - 1; c >= 0; c--) { pts.push([(c + 1) * w, hs[c]]); pts.push([c * w, hs[c]]); }
    const pitch = 3 + Math.floor(rnd() * 10), overhang = [0, 12, 18][Math.floor(rnd() * 3)];
    const ro = outlineRoof(pts, { pitch, overhang });
    if (!ro.ok) continue;
    const s = sheatheOutlineRoof(ro);
    assert.equal(s.ok, true, `${JSON.stringify(pts)} ${s.errors.join(" ")}`);
    checked++;
    const k = slopeFactor(pitch), band = 48 / k;
    assert.ok(s.sheets.coveredSqFt >= s.sheets.area - 1e-6);
    assert.ok(s.sheets.count * 32 >= s.sheets.area);
    for (const pl of s.planes) for (const c of pl.courses) for (const q of c.pieces) assert.ok(q.length > 0 && q.length <= 96);
    // pooling never costs a sheet, and a valley corner is filled only from a hip offcut that exists
    assert.ok(s.sheets.count <= s.sheets.unpooled);
    assert.ok(s.sheets.valleyFills + s.sheets.hipStarts <= s.sheets.hipOffcuts);
    // hip starts are used only when they save a sheet
    assert.ok(s.sheets.hipStarts === 0 ? s.sheets.count === s.sheets.withoutHipStarts : s.sheets.count < s.sheets.withoutHipStarts);
    for (const pl of s.planes) for (const c of pl.courses) for (const q of c.pieces) if (q.offcut) assert.ok(q.length > 0 && q.length <= band + 0.07, `offcut ${q.length}`);
    fills += s.sheets.valleyFills;
    starts += s.sheets.hipStarts;
    const e = ro.eaveLine, xs = e.map((q) => q.x), ys = e.map((q) => q.y);
    for (let m = 0; m < 300; m++) {
      const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), y = Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys));
      const { d, side, margin } = nearest(e, x, y);
      if (margin < 0.01) continue; // on a hip, valley or ridge
      // outside the eave line, or within a hair of a course joint: skip
      if (!within(e, x, y) || d % band < 0.01 || band - (d % band) < 0.01) continue;
      const a = e[side], b = e[(side + 1) % e.length], len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const t = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / len;
      const pl = s.planes.find((q) => q.side === side + 1);
      if (!pl) continue; // a tie with no area of its own
      const c = pl.courses[Math.floor(d / band)];
      assert.ok(c, `${JSON.stringify(pts)} side ${side + 1} depth ${d}`);
      // pieces are rounded to the 1/16 in
      // a hip offcut covers only its triangle: at depth u into the band, at a valley the part of its span within
      // u of the rectangle it meets (the valley's edge moves out one plan inch per inch of depth), at a hip the
      // part more than u in from the run's end (the hip's edge moves in)
      const u = d - Math.floor(d / band) * band;
      const under = (/** @type {{x:number,length:number,offcut?:string,hip?:boolean}} */ q) => q.offcut === "left"
        ? (q.hip ? t >= q.x + u - 0.07 : t >= q.x + q.length - u - 0.07) && t <= q.x + q.length + 0.07
        : q.offcut === "right" ? t >= q.x - 0.07 && (q.hip ? t <= q.x + q.length - u + 0.07 : t <= q.x + u + 0.07) : t >= q.x - 0.07 && t <= q.x + q.length + 0.07;
      assert.ok(c.pieces.some(under), `${JSON.stringify(pts)} side ${side + 1} at t ${t}, depth ${d}`);
      points++;
    }
  }
  assert.ok(checked >= 100, `${checked} outlines`);
  assert.ok(points > 10000, `${points} points`);
  assert.ok(fills > 100, `${fills} valley corners filled`);
  assert.ok(starts > 100, `${starts} hip ends started`);
});

test("a typed sheet size changes the courses, and a bad one is refused", () => {
  const ro = outlineRoof(L, { pitch: 6, overhang: 12 });
  const s = sheatheOutlineRoof(ro, { sheet: { width: 48, length: 120 } });
  assert.equal(s.ok, true);
  for (const pl of s.planes) for (const c of pl.courses) for (const q of c.pieces) assert.ok(q.length <= 120);
  assert.ok(s.sheets.count < sheatheOutlineRoof(ro).sheets.count + 1);
  assert.equal(sheatheOutlineRoof(ro, { sheet: { width: 0 } }).ok, false);
  assert.equal(sheatheOutlineRoof({ ok: false }).ok, false);
});

test("CLI: a stair-step outline's roof sheathing is in the ROOF text, the material list and the budget", async () => {
  const { main } = await import("./cli.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const p = samplePlan();
  const outline = [[0, 0], ["30'", 0], ["30'", "10'"], ["20'", "10'"], ["20'", "20'"], ["10'", "20'"], ["10'", "30'"], [0, "30'"]];
  p.roof = { outline, pitch: 6, overhang: 12, rafter: "2x8", hip: "2x10", valley: "2x10", ridge: "2x10" };
  p.prices = { roofSheet: 30 };
  p.stock.push({ size: "2x10", length: 240, price: 40 }); // the 198 in hips need a 20 ft board, so the roof frames
  const ro = outlineRoof(outline.map(([x, y]) => [typeof x === "string" ? parseFloat(x) * 12 : x, typeof y === "string" ? parseFloat(y) * 12 : y]), { pitch: 6, overhang: 12 });
  // the CLI frames the roof and lays the sheathing's end joints on those rafters
  const frame = frameOutlineRoof(ro.points, ro.eaveLine, ro.lines, { pitch: 6, rafter: "2x8", hip: "2x10", valley: "2x10", ridge: "2x10", stock: p.stock });
  assert.equal(frame.ok, true);
  const want = sheatheOutlineRoof(ro, { frame });
  assert.equal(want.ok, true);
  assert.ok(want.sheets.joints && want.sheets.joints.onRafters > 0);
  const text = main(["p.json", "--roof"], () => JSON.stringify(p));
  assert.equal(text.code, 0, text.out.slice(0, 400));
  assert.match(text.out, new RegExp(`Roof sheathing \\(all-hip, from outline\\): ${want.sheets.count} sheets`));
  assert.match(text.out, /Plane 1 \(eave side/);
  assert.match(text.out, /End joints on the rafters: \d+ of \d+ joints land on a rafter centre/);
  const ml = main(["p.json", "--material-list", "--json"], () => JSON.stringify(p));
  assert.equal(ml.code, 0, ml.out.slice(0, 400));
  const row = JSON.parse(ml.out).rows.find((x) => x.item === "roof sheathing (all-hip, from outline)");
  assert.ok(row, "material list row");
  assert.equal(row.qty, want.sheets.count);
  const bud = main(["p.json", "--budget"], () => JSON.stringify(p));
  assert.equal(bud.code, 0, bud.out.slice(0, 400));
  assert.match(bud.out, /Roof sheathing sheets/);
});

test("strips of different widths share a sheet, first-fit decreasing, kerf between them", () => {
  // 32-1/2 + 1/8 + 3-9/16 = 36-3/16 fits a 48 in sheet; two 24s and a kerf do not
  assert.deepEqual(ripStrips([3.5625, 32.5], 48, 0.125), [[32.5, 3.5625]]);
  assert.deepEqual(ripStrips([24, 24], 48, 0.125), [[24], [24]]);
  assert.deepEqual(ripStrips([24, 23.875], 48, 0.125), [[24, 23.875]]);
  assert.deepEqual(ripStrips([48, 48, 10], 48, 0.125), [[48], [48], [10]]);
  assert.deepEqual(ripStrips([], 48, 0.125), []);
});

test("a stair-step's sheet count comes down from the per-width, no-reuse count (hand-checked)", () => {
  // 30 x 30 ft stair-step, three 10 ft steps, 6:12, 12 in eave: before this change 41 sheets (38.3% offcut)
  const step = [[0, 0], [360, 0], [360, 120], [240, 120], [240, 240], [120, 240], [120, 360], [0, 360]];
  const ro = outlineRoof(step, { pitch: 6, overhang: 12 });
  // valley fills and pooled strips alone: 34 (hip starts are checked below)
  const s = sheatheOutlineRoof(ro, { hipStarts: false });
  assert.equal(s.ok, true);
  assert.equal(s.sheets.count, 34);
  // leftover hip offcuts starting other courses' hip ends take it to 30
  const hs = sheatheOutlineRoof(ro);
  assert.equal(hs.sheets.count, 30);
  assert.equal(hs.sheets.withoutHipStarts, 34);
  assert.ok(hs.sheets.valleyFills >= s.sheets.valleyFills, "valley corners keep their triangles first");
  // the 32-1/2 in second courses take four sheets; the 3-9/16 in top strips ride on one of them
  assert.ok(s.sheets.rips.some((r) => r.widths.length === 2 && r.widths[0] === 32.5 && r.widths[1] === 3.5625));
  assert.ok(s.sheets.unpooled > s.sheets.count);
  assert.ok(s.notes.some((n) => /valley corners are filled/.test(n)));
  assert.ok(s.notes.some((n) => /1 sheet of 32-1\/2" \+ 3-9\/16"/.test(n)), s.notes.join("\n"));
  assert.ok(s.sheets.coveredSqFt >= s.sheets.area - 1e-6);
});

test("runEnds tells a hip from a valley from anything else", () => {
  const ro = outlineRoof(L, { pitch: 6, overhang: 12 });
  const p = ro.eaveLine, band = 48 / slopeFactor(6);
  // side 3 (index 2): a hip at its outside start, a valley at its inside end; its first course's run is
  // [0, 240 + band]
  assert.deepEqual(runEnds(p, 2, 0, band, [], 0, 240 + band), { left: "hip", right: "valley" });
  // a run that is not the section's (cut short) is neither
  assert.deepEqual(runEnds(p, 2, 0, band, [], 10, 200), { left: null, right: null });
});

const stockLong = ["2x8", "2x10", "2x12"].flatMap((size) => [96, 120, 144, 168, 192, 240, 288, 336].map((length) => ({ size, length, price: length / 12 })));
const framed = (/** @type {number[][]} */ pts, /** @type {number} */ pitch, /** @type {number} */ overhang, spacing = 16) => {
  const ro = outlineRoof(pts, { pitch, overhang });
  const frame = ro.ok ? frameOutlineRoof(ro.points, ro.eaveLine, ro.lines, { pitch, spacing, rafter: "2x8", hip: "2x10", valley: "2x10", ridge: "2x10", stock: stockLong }) : null;
  return { ro, frame };
};

test("end joints on rafters: a 40 x 28 ft hip roof's long eave course, hand-checked", () => {
  const { ro, frame } = framed([[0, 0], [480, 0], [480, 336], [0, 336]], 6, 12);
  assert.equal(frame?.ok, true);
  // the joints as laid when every piece is cut to its course's bottom length (hip starts are checked apart)
  const s = sheatheOutlineRoof(ro, { frame, hipStarts: false });
  assert.equal(s.ok, true, s.errors.join(" "));
  // the eave corner is 12 in outside the wall corner and the rafters stand every 16 in from the wall corner,
  // so along the 504 in eave they are at 12 + 16j. From the left end the farthest within 96 in is 92 (j = 5),
  // then every 96 in (6 spaces) to 476; the last piece is 504 - 476 = 28 in.
  const c0 = s.planes[0].courses[0];
  assert.deepEqual(c0.pieces.map((q) => q.length), [92, 96, 96, 96, 96, 28]);
  assert.deepEqual(c0.joints?.map((j) => j.x), [92, 188, 284, 380, 476]);
  assert.ok(c0.joints?.every((j) => j.onRafter));
  // the course above starts at the hip, 48 / sqrt(1.25) = 42.93 in in from the eave corner, and its first
  // piece is at most half a sheet: the farthest station within 42.93 + 48 = 90.93 is 76 (j = 4). Its joints
  // never sit on a rafter the course below jointed on.
  const c1 = s.planes[0].courses[1];
  assert.equal(c1.joints?.[0].x, 76);
  for (const pl of s.planes) for (let i = 1; i < pl.courses.length; i++) {
    const below = (pl.courses[i - 1].joints || []).map((j) => j.x);
    for (const j of pl.courses[i].joints || []) assert.ok(!below.includes(j.x), `plane ${pl.side} course ${i} joint ${j.x}`);
  }
  assert.equal(s.sheets.joints?.linedUp, 0);
  assert.equal(s.sheets.joints?.offRafters, 0);
  assert.equal(s.sheets.joints?.looseSheets, sheatheOutlineRoof(ro, { hipStarts: false }).sheets.count);
  assert.ok(s.notes.some((n) => /^End joints on the rafters: 50 of 50 joints land on a rafter centre/.test(n)), s.notes.join("\n"));
  // without the framing nothing changes: no joints listed, the old note
  const loose = sheatheOutlineRoof(ro, { hipStarts: false });
  assert.equal(loose.sheets.joints, null);
  assert.equal(loose.planes[0].courses[0].joints, undefined);
  assert.ok(loose.notes.some((n) => /End joints are not placed on rafters/.test(n)));
});

test("on 80 seeded random outlines every joint said to be on a rafter is on one, and coverage is the loose layout's", () => {
  let seed = 41;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let checked = 0, joints = 0, on = 0, fills = 0, blocked = 0;
  for (let n = 0; n < 80; n++) {
    const cols = 1 + Math.floor(rnd() * 6), w = 60 + Math.floor(rnd() * 120);
    const hs = Array.from({ length: cols }, () => 120 + 24 * Math.floor(rnd() * 10));
    const pts = [[0, 0], [cols * w, 0]];
    for (let c = cols - 1; c >= 0; c--) { pts.push([(c + 1) * w, hs[c]]); pts.push([c * w, hs[c]]); }
    const pitch = 3 + Math.floor(rnd() * 10), overhang = [0, 12, 18][Math.floor(rnd() * 3)], spacing = [16, 19.2, 24][Math.floor(rnd() * 3)];
    const { ro, frame } = framed(pts, pitch, overhang, spacing);
    if (!ro.ok || !frame?.ok) continue;
    const s = sheatheOutlineRoof(ro, { frame }), loose = sheatheOutlineRoof(ro);
    assert.equal(s.ok, true, `${JSON.stringify(pts)} ${s.errors.join(" ")}`);
    checked++;
    // every joint with no rafter gets its nailer and two blocks, each block shorter than its bay by one thickness
    assert.equal(s.sheets.blocks.length, s.sheets.joints?.offRafters, JSON.stringify(pts));
    for (const b of s.sheets.blocks) {
      assert.ok(b.block >= 1.5 && b.nailer > 0 && b.nailer <= 48, JSON.stringify(b));
      if (!b.bayKnown) assert.equal(b.block, Math.round((spacing - 1.5) * 16) / 16);
    }
    blocked += s.sheets.blocks.length;
    assert.ok(s.sheets.coveredSqFt >= s.sheets.area - 1e-6);
    assert.ok(s.sheets.valleyFills + s.sheets.hipStarts <= s.sheets.hipOffcuts);
    const k = slopeFactor(pitch), band = 48 / k, e = ro.eaveLine;
    for (const pl of s.planes) {
      const i = pl.side - 1, a = e[i], b = e[(i + 1) % e.length], len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      const mine = frame.rafters.filter((r) => r.plane === i).map((r) => {
        const d0 = (r.x0 - a.x) * -uy + (r.y0 - a.y) * ux, d1 = (r.x1 - a.x) * -uy + (r.y1 - a.y) * ux;
        return { t: (r.x0 - a.x) * ux + (r.y0 - a.y) * uy, lo: Math.min(d0, d1), hi: Math.max(d0, d1) };
      });
      const lp = loose.planes.find((q) => q.side === pl.side);
      assert.ok(lp);
      pl.courses.forEach((c, ci) => {
        for (const q of c.pieces) assert.ok(q.length > 0 && q.length <= 96, `piece ${q.length}`);
        // the same stretches covered as the loose layout (which the 120-outline test proves covers the roof)
        const union = (/** @type {{x:number,length:number}[]} */ ps) => {
          const m = /** @type {number[][]} */ ([]);
          for (const q of [...ps].sort((u, v) => u.x - v.x)) { const l = m[m.length - 1]; if (l && q.x <= l[1] + 0.1) l[1] = Math.max(l[1], q.x + q.length); else m.push([q.x, q.x + q.length]); }
          return m;
        };
        // each piece is rounded to the 1/16 in, so the ends may drift by a few sixteenths
        const mu = union(c.pieces), lu = union(lp.courses[ci].pieces);
        assert.equal(mu.length, lu.length, `${JSON.stringify(pts)} plane ${pl.side} course ${ci}`);
        mu.forEach(([u, v], x) => assert.ok(Math.abs(u - lu[x][0]) < 0.3 && Math.abs(v - lu[x][1]) < 0.3, `${JSON.stringify(pts)} plane ${pl.side} course ${ci}: ${u}-${v} vs ${lu[x]}`));
        const d0 = ci * band, d1 = Math.min(pl.depthIn, (ci + 1) * band);
        for (const j of c.joints || []) {
          joints++;
          if (j.fill) fills++;
          if (!j.onRafter) continue;
          on++;
          assert.ok(mine.some((r) => Math.abs(r.t - j.x) < 0.07 && Math.min(r.hi, d1) - Math.max(r.lo, d0) > 1e-3), `${JSON.stringify(pts)} plane ${pl.side} course ${ci}: no rafter at ${j.x}`);
        }
      });
    }
  }
  assert.ok(checked >= 60, `${checked} outlines`);
  // the joint behind a valley-corner fill is where the hip's triangle puts it; every other joint found a rafter
  // in reach on these outlines but one (seeded: 2,299 on, 622 behind fills, 1 with no station within half a sheet)
  assert.ok(joints > 2000 && fills > 300, `${joints} joints, ${fills} behind fills`);
  assert.ok(on >= joints - fills - 2, `${on} of ${joints - fills} joints not behind a fill are on rafters`);
  assert.equal(blocked, joints - on);
});

test("blocks behind valley fills: a 30 x 30 ft stair-step at 6:12, 16 in o.c., hand-checked, and in the lumber order", async () => {
  const pts = [[0, 0], [360, 0], [360, 120], [240, 120], [240, 240], [120, 240], [120, 360], [0, 360]];
  const { ro, frame } = framed(pts, 6, 12);
  assert.equal(frame?.ok, true);
  // valley fills only (hip starts add their own joints; the CLI checks below take the default)
  const s = sheatheOutlineRoof(ro, { frame, hipStarts: false });
  assert.equal(s.ok, true, s.errors.join(" "));
  // six joints have no rafter, all behind a valley-corner fill; each falls in a 16 in bay of the plate layout, so its
  // two blocks are 16 - 1-1/2 = 14-1/2 in, and its nailer is the course wide: 48 in on the eave course, 32-1/2 in on
  // the second (the plane's depth there leaves 32-1/2 in up the slope)
  assert.equal(s.sheets.joints?.offRafters, 6);
  assert.equal(s.sheets.joints?.offRafterFills, 6);
  assert.equal(s.sheets.blocks.length, 6);
  for (const b of s.sheets.blocks) {
    assert.equal(b.fill, true);
    assert.equal(b.bayKnown, true);
    assert.equal(b.size, "2x8");
    assert.equal(b.block, 14.5);
    const c = s.planes.find((q) => q.side === b.plane)?.courses.find((q) => q.y === b.y);
    assert.equal(b.nailer, c?.width);
    // the joint sits strictly inside its bay: no rafter of the plane's layout within 1/16 in of it on that course
    assert.ok(c?.joints?.some((j) => j.x === b.x && !j.onRafter));
  }
  assert.deepEqual(s.sheets.blocks.map((b) => b.nailer).sort((m, n) => m - n), [32.5, 32.5, 48, 48, 48, 48]);
  assert.deepEqual(outlineSheathingCuts(s, "Roof").map((r) => [r.kind, r.size, r.length, r.qty]).sort(), [["sheathing block", "2x8", 14.5, 12], ["sheathing nailer", "2x8", 32.5, 2], ["sheathing nailer", "2x8", 48, 4]]);
  assert.ok(s.notes.some((n) => /^Blocking under the 6 end joints with no rafter \(6 behind a corner fill\): a 2x8 nailer/.test(n)), s.notes.join("\n"));
  assert.match(outlineSheathingText(s).join("\n"), /Blocking under joints with no rafter \(2x8, in the lumber order\): 6 nailers the course wide and 12 blocks between the rafters \(14-1\/2"\)/);
  // no framing, no blocks; a failed layout gives no cuts
  assert.deepEqual(sheatheOutlineRoof(ro).sheets.blocks, []);
  assert.deepEqual(outlineSheathingCuts({ ok: false, errors: ["x"] }), []);
  // the CLI (hip starts on, the default) puts them in the lumber order and the material list's members: the
  // valley fills' six plus one per hip start with no rafter under its joint
  const n = sheatheOutlineRoof(ro, { frame }).sheets.blocks.length;
  assert.ok(n > 6, `${n} blocks with hip starts`);
  const { main } = await import("./cli.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const p = samplePlan();
  p.roof = { outline: pts, pitch: 6, overhang: 12, rafter: "2x8", hip: "2x10", valley: "2x10", ridge: "2x10" };
  p.stock.push(...stockLong);
  const out = main(["p.json", "--roof"], () => JSON.stringify(p));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  assert.match(out.out, new RegExp(`Blocking under joints with no rafter \\(2x8, in the lumber order\\): ${n} nailers`));
  const ml = main(["p.json", "--material-list", "--json"], () => JSON.stringify(p));
  assert.equal(ml.code, 0, ml.out.slice(0, 400));
  const rows = JSON.parse(ml.out).rows;
  assert.equal(rows.find((x) => x.item === "2x8 sheathing block")?.qty, 2 * n, JSON.stringify(rows.filter((x) => /2x8/.test(x.item))));
  assert.equal(rows.find((x) => x.item === "2x8 sheathing nailer")?.qty, n);
  // and the board order grows by what they take: the same plan without the blocks orders less 2x8
  const json = JSON.parse(main(["p.json", "--roof", "--json"], () => JSON.stringify(p)).out);
  const cuts = (json.cuts || json.cutList || []).filter((/** @type {any} */ c) => /^sheathing (block|nailer)$/.test(c.kind));
  assert.equal(cuts.reduce((t, /** @type {any} */ c) => t + c.qty, 0), 3 * n, Object.keys(json).join(","));
});

test("layRunOnRafters: a joint off a rafter only where none is in reach, mirrored from the right", () => {
  // stations every 16 in from 8: from 0 the farthest within 96 is 88, then 184
  const st = Array.from({ length: 20 }, (_, j) => 8 + 16 * j);
  const a = layRunOnRafters(0, 250, 96, false, st, 96);
  assert.deepEqual(a.pieces.map((q) => q.length), [88, 96, 66]);
  assert.deepEqual(a.joints, [{ t: 88, on: true }, { t: 184, on: true }]);
  // half-sheet lead: farthest within 48 is 40
  assert.equal(layRunOnRafters(0, 250, 96, false, st, 48).pieces[0].length, 40);
  // the course below jointed at 88: take 72 instead
  assert.equal(layRunOnRafters(0, 250, 96, false, st, 96, [88]).joints[0].t, 72);
  // from the right end: farthest within 96 of 250 going left is 168
  const r = layRunOnRafters(0, 250, 96, true, st, 96);
  assert.deepEqual(r.joints.map((j) => j.t), [168, 72]);
  assert.deepEqual(r.pieces.map((q) => q.x), [0, 72, 168]);
  // no station at all: sheet lengths, joints listed off a rafter
  const none = layRunOnRafters(0, 200, 96, false, [], 96);
  assert.deepEqual(none.pieces.map((q) => q.length), [96, 96, 8]);
  assert.ok(none.joints.every((j) => !j.on));
  // a run within a sheet has no joint and ignores the lead
  assert.deepEqual(layRunOnRafters(0, 90, 96, false, st, 48).pieces.map((q) => q.length), [90]);
});

test("a wider course's hip offcut, cut down, starts a narrower top course's hip end (hand-checked)", () => {
  // 24 x 12 ft with a 12 x 2 ft wing, 6:12, 12 in eave. One 48 in course covers 48 / sqrt(1.25) = 42.933 in of plan
  // depth. Plane 2 (the 144 in eave side) is 72 in deep, so its top course is 72 - 42.933 = 29.067 in of plan
  // (32-1/2 in up the slope); planes 5 and 6 (168 in) are 84 in deep, top courses 41.067 in (45-15/16 in).
  const ro = outlineRoof([[0, 0], [288, 0], [288, 120], [144, 120], [144, 144], [0, 144]], { pitch: 6, overhang: 12 });
  const s = sheatheOutlineRoof(ro);
  assert.equal(s.ok, true, s.errors.join(" "));
  // same-band reuse alone: plane 2's top course is one 58-1/8 in piece, and the 32-1/2 in strips are 96, 48 and
  // 58-1/8, three strips (48 + 58-1/8 is longer than a sheet)
  const same = sheatheOutlineRoof(ro, { crossBands: false });
  assert.equal(same.sheets.count, 18);
  assert.equal(same.sheets.cutDown, 0);
  assert.deepEqual(same.planes[1].courses[1].pieces, [{ x: 42.9375, length: 58.125 }]);
  // plane 5's top course gives a 41-1/16 in triangle no other 45-15/16 in course needs; cut parallel to its long
  // edge down to 29-1/16 in (the same 45-degree shape: 29-1/16 x sqrt(1.25) = 32-1/2 up the slope) it starts plane
  // 2's top course at its right hip, the piece there stops at the top length, 58-1/8 - 29-1/16 = 29-1/16, and
  // 48 + 29-1/16 share one strip: two 32-1/2 in strips, one sheet fewer
  assert.equal(s.sheets.count, 17);
  assert.equal(s.sheets.withoutCutDown, 18);
  assert.equal(s.sheets.cutDown, 1);
  assert.deepEqual(s.planes[1].courses[1].pieces, [{ x: 42.9375, length: 29.0625 }, { x: 72, length: 29.0625, offcut: "right", hip: true, cutFrom: 41.0625 }]);
  assert.deepEqual(s.sheets.rows.find((r) => r.width === 32.5), { width: 32.5, strips: 2, pieces: 3, ownSheets: 2 });
  assert.ok(s.sheets.valleyFills + s.sheets.hipStarts <= s.sheets.hipOffcuts);
  assert.ok(s.sheets.coveredSqFt >= s.sheets.area - 1e-6);
  assert.ok(s.notes.some((n) => /^1 of the triangles placed is cut down from a wider course's hip offcut .* 1 sheet fewer than reusing same-width offcuts only\./.test(n)), s.notes.join("\n"));
  assert.ok(outlineSheathingText(s).some((l) => l.includes("[hip offcut 29-1/16\", cut down from 41-1/16\"]")));
});

test("on 200 seeded random outlines cutting wider triangles down never costs a sheet, and saves some", () => {
  let seed = 41;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let n = 0, same = 0, cross = 0, better = 0, cut = 0;
  for (let i = 0; i < 200; i++) {
    const cols = 1 + Math.floor(rnd() * 6), w = 60 + Math.floor(rnd() * 120);
    const hs = Array.from({ length: cols }, () => 120 + 24 * Math.floor(rnd() * 10));
    const pts = [[0, 0], [cols * w, 0]];
    for (let c = cols - 1; c >= 0; c--) { pts.push([(c + 1) * w, hs[c]]); pts.push([c * w, hs[c]]); }
    const pitch = 3 + Math.floor(rnd() * 10), overhang = [0, 12, 18][Math.floor(rnd() * 3)];
    const ro = outlineRoof(pts, { pitch, overhang });
    if (!ro.ok) continue;
    const a = sheatheOutlineRoof(ro, { crossBands: false }), b = sheatheOutlineRoof(ro);
    // every outline passes the planes' area check (one, seed 41's four-column step at 6:12 with an 18 in eave,
    // failed it by 1.1 sq ft until each plane's own depth was a break: outline-plane-depth-breaks)
    assert.ok(a.ok && b.ok, JSON.stringify(pts) + " " + [...(a.errors || []), ...(b.errors || [])].join(" "));
    n++;
    assert.ok(b.sheets.count <= a.sheets.count, JSON.stringify(pts));
    assert.equal(b.sheets.withoutCutDown, a.sheets.count, JSON.stringify(pts));
    // kept only when it saves a sheet (the wider search sometimes ends on a better allocation of same-band
    // triangles alone, so a saving with none cut down is possible too)
    if (b.sheets.cutDown) assert.ok(b.sheets.count < a.sheets.count, JSON.stringify(pts));
    assert.ok(b.sheets.valleyFills + b.sheets.hipStarts <= b.sheets.hipOffcuts);
    assert.ok(b.sheets.coveredSqFt >= b.sheets.area - 1e-6);
    // a cut-down triangle comes from a deeper band than the course it lands in
    for (const pl of b.planes) for (const c of pl.courses) for (const q of c.pieces) if (q.cutFrom != null) { assert.ok(q.offcut && q.cutFrom > q.length); cut++; }
    same += a.sheets.count; cross += b.sheets.count; if (b.sheets.count < a.sheets.count) better++;
  }
  assert.ok(n >= 190, `${n} outlines`);
  // measured 2026-11-26: 6,926 sheets to 6,890 (0.52% fewer) on 199 outlines, 34 of them better, 81 triangles cut down;
  // with the 200th outline passing the area check (37 sheets both ways): 6,963 to 6,927, the rest unchanged
  assert.equal(n, 200);
  assert.equal(same, 6963);
  assert.equal(cross, 6927);
  assert.equal(better, 34);
  assert.equal(cut, 81);
});

/** Every course's pieces cover its plane's section at 19 depths inside the band (0.07 in slack for the 1/16 rounding). */
function shortCourses(/** @type {any} */ ro, /** @type {any} */ s) {
  const k = Math.sqrt(1 + (ro.pitch / 12) ** 2);
  const out = [];
  for (const pl of s.planes) for (const c of pl.courses) {
    const runs = c.pieces.map((/** @type {any} */ q) => [q.x, q.x + q.length]).sort((/** @type {number[]} */ m, /** @type {number[]} */ n) => m[0] - n[0]);
    const d0 = c.y / k, d1 = (c.y + c.width) / k;
    for (let m = 1; m < 20; m++) for (const [a, b] of planeSection(ro.eaveLine, pl.side - 1, d0 + (d1 - d0) * m / 20)) {
      let at = a;
      for (const [u, v] of runs) if (u <= at + 0.07 && v > at) at = v;
      if (at < b - 0.07) out.push({ side: pl.side, y: c.y, short: b - at });
    }
  }
  return out;
}

test("two sides on one line split one plane: the depth where one side's share ends is a break (outline-plane-depth-breaks)", () => {
  // seed 41's four-column step: columns 89 in wide, 240, 312, 240 and 336 in deep, 6:12, 18 in eave. The eave sides
  // of columns 1 and 3 lie on one line (y = 258) facing the same way, one plane split between them by a 45-degree
  // line no roof line marks; column 1's share runs out 107 in deep ((196 - -18) / 2), where column 3's section turns
  // onto column 1's end hip. 107 was not among the roof lines' depths (0, 62.5, 138), so Simpson's rule across that
  // kink counted 1004.18 sq ft against the eave line's 1003.06 and the outline was refused.
  const ro = outlineRoof([[0, 0], [356, 0], [356, 336], [267, 336], [267, 240], [178, 240], [178, 312], [89, 312], [89, 240], [0, 240]], { pitch: 6, overhang: 18 });
  assert.equal(ro.ok, true);
  assert.ok(Math.abs(planeDepth(ro.eaveLine, 8) - 107) < 1e-6);
  const s = sheatheOutlineRoof(ro);
  assert.equal(s.ok, true, (s.errors || []).join(" "));
  assert.ok(s.sheets.coveredSqFt >= s.sheets.area - 1e-6);
  assert.deepEqual(shortCourses(ro, s), []);
});

test("a cross-shaped outline's courses cover their planes (a stretch between the roof lines' depths was missed)", () => {
  // 144 x 120 in with a 48 x 48 in arm out of each long side's middle, 9:12, no eave. The arms' ends are short sides,
  // and each long side is two sides on one line either side of an arm. Before each plane's own depth was a break the
  // area check failed (190.40 against 190.00 sq ft); over 400 seeded comb outlines 27 planes on 23 outlines had a
  // course up to a sheet length (96 in) short of its section with the check passing, now none.
  const ro = outlineRoof([[0, 0], [48, 0], [48, -48], [96, -48], [96, 0], [144, 0], [144, 120], [96, 120], [96, 168], [48, 168], [48, 120], [0, 120]], { pitch: 9, overhang: 0 });
  assert.equal(ro.ok, true);
  const s = sheatheOutlineRoof(ro);
  assert.equal(s.ok, true, (s.errors || []).join(" "));
  assert.ok(Math.abs(s.sheets.area - 190) < 0.01, String(s.sheets.area));
  assert.deepEqual(shortCourses(ro, s), []);
});

test("on 400 seeded comb outlines (steps top and bottom) every course covers its plane and the area check passes", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const cols = 2 + Math.floor(rnd() * 5), w = 48 + 12 * Math.floor(rnd() * 10);
    const top = Array.from({ length: cols }, () => 120 + 48 * Math.floor(rnd() * 3));
    const bot = Array.from({ length: cols }, () => -48 * Math.floor(rnd() * 3));
    /** @type {[number, number][]} */
    const pts = [];
    for (let c = 0; c < cols; c++) { pts.push([c * w, bot[c]]); pts.push([(c + 1) * w, bot[c]]); }
    for (let c = cols - 1; c >= 0; c--) { pts.push([(c + 1) * w, top[c]]); pts.push([c * w, top[c]]); }
    const q = pts.filter((pt, j) => { const a = pts[(j + pts.length - 1) % pts.length], b = pts[(j + 1) % pts.length]; return !((a[0] === pt[0] && pt[0] === b[0]) || (a[1] === pt[1] && pt[1] === b[1])); })
      .filter((pt, j, arr) => { const a = arr[(j + arr.length - 1) % arr.length]; return !(a[0] === pt[0] && a[1] === pt[1]); });
    const pitch = 3 + Math.floor(rnd() * 10), overhang = [0, 12, 18][Math.floor(rnd() * 3)];
    const ro = outlineRoof(q, { pitch, overhang });
    if (!ro.ok) continue;
    const s = sheatheOutlineRoof(ro);
    assert.equal(s.ok, true, JSON.stringify(q) + " " + (s.errors || []).join(" "));
    assert.deepEqual(shortCourses(ro, s), [], JSON.stringify(q));
    n++;
  }
  assert.equal(n, 400);
});

test("weighing hip starts' blocks against the sheets they save: the 30 x 30 ft stair-step at 6:12, by hand", async () => {
  const pts = [[0, 0], [360, 0], [360, 120], [240, 120], [240, 240], [120, 240], [120, 360], [0, 360]];
  const { ro, frame } = framed(pts, 6, 12);
  assert.equal(frame?.ok, true);
  const plain = sheatheOutlineRoof(ro, { frame, hipStarts: false });
  const counted = sheatheOutlineRoof(ro, { frame });
  assert.equal(plain.ok && counted.ok, true);
  // by count alone the starts are kept: 35 to 31 sheets, 6 to 16 joints with no rafter to block
  assert.deepEqual([plain.sheets.count, counted.sheets.count, plain.sheets.blocks.length, counted.sheets.blocks.length], [35, 31, 6, 16]);
  const saved = 4, added = 10;
  assert.equal(counted.sheets.startsWeighed, null);
  assert.match(counted.notes.join("\n"), /4 sheets fewer, 10 more joints with no rafter to block/);
  // with both prices, weighed whole and then start by start: at $5 and $10 a joint the starts pay as a layout
  // ($100 of sheets against $50 or $100 of blocking; $10 is a tie, which keeps no starts as a whole), but two of the
  // fourteen add a blocked joint each and save no sheet, so they are left out: 31 sheets and 14 blocked joints,
  // $845 and $915, against $855 and $935 for the whole layouts (and $935 and $995 with no starts)
  const sp = 25;
  for (const bp of [5, 10]) {
    const cheap = sheatheOutlineRoof(ro, { frame, sheet: { price: sp, blockedJointPrice: bp } });
    assert.deepEqual([cheap.sheets.count, cheap.sheets.hipStarts, cheap.sheets.blocks.length], [31, 12, 14], `at ${bp} a joint`);
    assert.deepEqual(cheap.sheets.startsWeighed, { sheetPrice: sp, blockedJointPrice: bp, sheetsSaved: saved, blocksAdded: added - 2, countedSheets: 31, countedBlocks: 16, startsDropped: 2 });
    assert.ok(31 * sp + 14 * bp < Math.min(31 * sp + 16 * bp, 35 * sp + 6 * bp));
    assert.match(cheap.notes.join("\n"), new RegExp(`\\(\\$100\\.00 of sheets at \\$25\\.00 a sheet against \\$${(8 * bp).toFixed(2)} of blocking at \\$${bp.toFixed(2)} a joint\\)`));
    assert.match(cheap.notes.join("\n"), /2 hip ends are not started though they could be: weighed one at a time, leaving each out makes the roof cheaper/);
  }
  // from $15 a joint no start pays, one at a time or together
  for (const bp of [15, 20]) {
    const dear = sheatheOutlineRoof(ro, { frame, sheet: { price: sp, blockedJointPrice: bp } });
    assert.equal(dear.sheets.count, 35, `at ${bp} a joint`);
    assert.equal(dear.sheets.hipStarts, 0);
    assert.equal(dear.sheets.blocks.length, 6);
    assert.equal(dear.sheets.startsWeighed?.sheetsSaved, 0);
    assert.equal(dear.sheets.startsWeighed?.startsDropped, 0);
    assert.match(dear.notes.join("\n"), new RegExp(`would save 4 sheets \\(\\$100\\.00 at \\$25\\.00 a sheet\\) but leave 10 more joints with no rafter to block \\(\\$${(10 * bp).toFixed(2)} at \\$${bp.toFixed(2)} a joint\\), so they are not used`));
  }
  // one price alone, or no framing, weighs nothing: the count decides as before
  assert.equal(sheatheOutlineRoof(ro, { frame, sheet: { price: sp } }).sheets.count, 31);
  assert.equal(sheatheOutlineRoof(ro, { frame, sheet: { blockedJointPrice: 99 } }).sheets.count, 31);
  assert.equal(sheatheOutlineRoof(ro, { sheet: { price: sp, blockedJointPrice: 99 } }).sheets.count, sheatheOutlineRoof(ro).sheets.count);
  // a bad price is refused with the field named
  for (const bad of [-1, Number.NaN, "10", 1e6]) {
    const r = sheatheOutlineRoof(ro, { frame, sheet: { price: 25, blockedJointPrice: /** @type {any} */ (bad) } });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(" "), /sheet\.blockedJointPrice/);
  }
  // the CLI reads both prices from the plan's roof.sheet
  const { main } = await import("./cli.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const p = samplePlan();
  p.roof = { outline: pts, pitch: 6, overhang: 12, rafter: "2x8", hip: "2x10", valley: "2x10", ridge: "2x10", sheet: { price: sp, blockedJointPrice: 20 } };
  p.stock.push(...stockLong);
  const out = main(["p.json", "--roof"], () => JSON.stringify(p));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  assert.match(out.out, /so they are not used: the sheets they save cost no more than the blocking they add/);
});

test("weighed hip starts never cost more than either layout, over random framed outlines", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let weighed = 0, dropped = 0, oneByOne = 0, fewer = 0;
  for (let n = 0; n < 40; n++) {
    // an L or a rectangle of 10 to 36 ft bays
    const a = 120 + 12 * Math.floor(rand() * 22), b = 120 + 12 * Math.floor(rand() * 22), c = 120 + 12 * Math.floor(rand() * 12);
    const pts = rand() < 0.5 ? [[0, 0], [a + c, 0], [a + c, b], [a, b], [a, b + c], [0, b + c]] : [[0, 0], [a, 0], [a, b], [0, b]];
    const pitch = [4, 6, 9][Math.floor(rand() * 3)];
    const { ro, frame } = framed(pts, pitch, 12);
    if (!frame?.ok) continue;
    const sp = 15 + Math.floor(rand() * 30), bp = Math.floor(rand() * 40);
    const plain = sheatheOutlineRoof(ro, { frame, hipStarts: false });
    const counted = sheatheOutlineRoof(ro, { frame });
    const w = sheatheOutlineRoof(ro, { frame, sheet: { price: sp, blockedJointPrice: bp } });
    assert.equal(w.ok, true, JSON.stringify(pts));
    const cost = (/** @type {any} */ s) => s.sheets.count * sp + s.sheets.blocks.length * bp;
    assert.ok(cost(w) <= cost(plain) + 1e-9 && cost(w) <= cost(counted) + 1e-9, `${JSON.stringify(pts)} at ${pitch}:12, ${sp}/${bp}`);
    // not bounded by the counted layout's sheets: barring one start can free its triangle for an end that saves more
    if (w.sheets.startsWeighed) weighed++;
    if (counted.sheets.hipStarts && !w.sheets.hipStarts) dropped++;
    if (w.sheets.startsWeighed?.startsDropped) oneByOne++;
    if (w.sheets.count < counted.sheets.count) fewer++;
  }
  // seeded, so fixed: 13 outlines leave single starts out, 4 of them with fewer sheets than the count alone found
  assert.ok(weighed > 10 && dropped > 0, `${weighed} weighed, ${dropped} dropped`);
  assert.deepEqual([oneByOne, fewer], [13, 4]);
});

test("start-by-start weighing keeps a bar only when it lowers the cost, and stops at START_TRIES", () => {
  // a stub roof: three starts a, b, c; each saves its sheets and adds its blocks; barring one frees nothing
  const save = { a: 1, b: 0, c: 0 }, blk = { a: 1, b: 1, c: 2 };
  const lay = (/** @type {string[]} */ on) => ({ count: 10 - on.reduce((t, e) => t + /** @type {any} */ (save)[e], 0), starts: on.length, blocks: Array(2 + on.reduce((t, e) => t + /** @type {any} */ (blk)[e], 0)).fill(0), startEnds: on.map((e) => ({ r: e, flag: /** @type {"fillR"} */ ("fillR") })) });
  const plain = lay([]), all = lay(["a", "b", "c"]);
  let calls = 0;
  const relay = (/** @type {any} */ _from, /** @type {{ r: unknown }[]} */ ban) => { calls++; return lay(["a", "b", "c"].filter((e) => !ban.some((x) => x.r === e))); };
  // $25 a sheet, $10 a joint: all three cost 9 x 25 + 6 x 10 = 285, none 10 x 25 + 2 x 10 = 270, a alone 225 + 30 = 255
  const whole = { use: plain, sheetPrice: 25, blockedJointPrice: 10, saved: 0, added: 0 };
  const w = weighStartsOneByOne(whole, plain, [all], relay);
  assert.deepEqual([w.use.count, w.use.blocks.length, w.dropped, w.saved, w.added], [9, 3, 2, 25, 10]);
  // nothing cheaper than whole.use: whole.use stands, with nothing dropped
  const free = weighStartsOneByOne({ ...whole, blockedJointPrice: 0 }, plain, [all], relay);
  assert.equal(free.dropped, 0);
  assert.equal(free.use, plain);
  // a free sheet never pays for a start, so nothing is laid again
  calls = 0;
  assert.equal(weighStartsOneByOne({ ...whole, sheetPrice: 0 }, plain, [all], relay).dropped, 0);
  assert.equal(calls, 0);
  // a relay that always helps a little stops after START_TRIES re-layouts
  calls = 0;
  let n = 12; // 11 sheets is $275, under the three starts' $285, and each re-layout one sheet cheaper
  const always = () => { calls++; n -= 1; return { count: n, starts: 1, blocks: [], startEnds: [{ r: calls, flag: /** @type {"fillR"} */ ("fillR") }] }; };
  weighStartsOneByOne(whole, plain, [all], always);
  assert.equal(calls, START_TRIES);
});
