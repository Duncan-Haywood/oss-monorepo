import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan, validatePlan, takeoff } from "./engine.mjs";
import { panelizeWall, panelParts } from "./panels.mjs";

// Property test: random walls cut into shop panels. Panels must tile the wall,
// cut only where no framing member crosses, hold every member exactly once, stay
// within the limit unless flagged, and never need more panels when the limit grows.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];

function randomWall(rand, id) {
  const length = 72 + Math.floor(rand() * 70) * 6;
  const openings = [];
  let at = 12 + Math.floor(rand() * 40);
  while (rand() < 0.8 && at < length - 40) {
    const door = rand() < 0.3;
    const width = door ? 36 : 24 + Math.floor(rand() * 8) * 6;
    if (at + width > length - 12) break;
    openings.push(door
      ? { kind: "door", label: `D${openings.length}`, offset: at, width, height: 82.5, header: "2x10" }
      : { kind: "window", label: `W${openings.length}`, offset: at, width, height: 24 + Math.floor(rand() * 5) * 6, header: "2x10" });
    at += width + 8 + Math.floor(rand() * 60);
  }
  return { id, length, stud: rand() < 0.5 ? "2x4" : "2x6", corner: rand() < 0.5, openings };
}

test("fuzz: shop panels tile each wall, cut clear of members and hold every member once", () => {
  const failures = [];
  let walls = 0, multi = 0, over = 0;
  const eps = 1e-6;
  for (let seed = 1; seed <= 120; seed++) {
    const rand = rng(seed);
    const plan = samplePlan();
    plan.studSpacing = pick(rand, [16, 24]);
    plan.walls = [randomWall(rand, "A"), randomWall(rand, "B")];
    if (validatePlan(plan).length) continue;
    const t = takeoff(plan);
    if (!t.ok) continue;
    for (const w of t.walls) {
      const max = pick(rand, [48, 96, 144, 192, 288]);
      const pan = panelizeWall(w, max);
      walls++;
      if (pan.panels.length > 1) multi++;
      if (pan.over) over++;
      const tag = `seed ${seed} ${w.id} max ${max}`;
      // tiling
      if (Math.abs(pan.panels[0].x0) > eps || Math.abs(pan.panels.at(-1).x1 - w.length) > eps) failures.push(`${tag}: panels do not span the wall`);
      for (let k = 1; k < pan.panels.length; k++) if (Math.abs(pan.panels[k].x0 - pan.panels[k - 1].x1) > eps) failures.push(`${tag}: gap or overlap at panel ${k}`);
      const total = pan.panels.reduce((s, p) => s + p.width, 0);
      if (Math.abs(total - w.length) > 0.01) failures.push(`${tag}: widths add to ${total}, wall is ${w.length}`);
      // each cut crosses no framing member
      for (const c of pan.cuts) for (const m of w.members) if (m.kind !== "plate" && m.x + 1e-3 < c && c < m.x + m.w - 1e-3) failures.push(`${tag}: cut ${c} crosses a ${m.kind}`);
      // limit and flag
      for (const p of pan.panels) if (p.width > max + 1e-3 !== p.over) failures.push(`${tag}: over flag wrong on ${p.name}`);
      if (pan.over !== pan.panels.some((p) => p.over)) failures.push(`${tag}: wall over flag disagrees`);
      if (pan.panels.length < Math.ceil(w.length / max - 1e-9)) failures.push(`${tag}: fewer panels than length / limit`);
      if (new Set(pan.panels.map((p) => p.name)).size !== pan.panels.length) failures.push(`${tag}: duplicate panel names`);
      // every framing member sits in exactly one panel
      const seen = new Map();
      for (const p of pan.panels) for (const i of p.members) seen.set(i, (seen.get(i) || 0) + 1);
      w.members.forEach((m, i) => { if (m.kind !== "plate" && seen.get(i) !== 1) failures.push(`${tag}: ${m.kind} ${i} in ${seen.get(i) || 0} panels`); });
      // parts: finite weights, plates trimmed to the panel, non-plate piece count agrees
      const parts = panelParts(w, pan);
      parts.forEach((q, k) => {
        if (![q.lb, q.totalLb].every(Number.isFinite) || q.lb <= 0) failures.push(`${tag}: panel ${q.name} weight ${q.lb}`);
        for (const pc of q.pieces) if (pc.kind === "plate" && pc.length > pan.panels[k].width * 1.5 + 1e-3 + 1) failures.push(`${tag}: plate on ${q.name} longer than its span`);
      });
      const nonPlate = parts.reduce((s, q) => s + q.pieces.filter((x) => x.kind !== "plate").reduce((n, x) => n + x.qty, 0), 0);
      if (nonPlate !== w.members.filter((m) => m.kind !== "plate").length) failures.push(`${tag}: ${nonPlate} framing pieces in panels, wall has ${w.members.filter((m) => m.kind !== "plate").length}`);
      // a larger limit never needs more panels
      if (panelizeWall(w, max * 2).panels.length > pan.panels.length) failures.push(`${tag}: doubling the limit needed more panels`);
    }
  }
  assert.deepEqual(failures.slice(0, 8), []);
  assert.ok(walls >= 200 && multi >= 60, `coverage: ${walls} walls, ${multi} cut into 2+ panels, ${over} over limit`);
});
