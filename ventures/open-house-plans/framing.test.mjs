import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeBrief } from "./brief.mjs";
import { searchDesigns } from "./search.mjs";
import { STYLES } from "./styles.mjs";
import { buildModel } from "./model3d.mjs";
import { takeoff } from "./takeoff.mjs";
import { frameHouse, framingInput, studLengthFor } from "./framing.mjs";
import { verifyWall, THICK, PRECUT } from "./wft-engine.mjs";
import { designFiles } from "./engine.mjs";

function planFor(raw) {
  const { brief } = normalizeBrief(raw);
  const style = STYLES[brief.style];
  const plan = searchDesigns(brief, { keep: 1 }).designs[0].plan;
  const tk = takeoff(plan, brief, style, buildModel(plan, brief, style).h);
  return { brief, style, plan, tk };
}

test("the vendored framing engine is the Wall Framing Takeoff source, byte for byte", () => {
  const script = fileURLToPath(new URL("./vendor-framing.mjs", import.meta.url));
  assert.doesNotThrow(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" }));
});

test("precut stud length follows the ceiling", () => {
  assert.equal(studLengthFor(8), PRECUT["8ft"]);
  assert.equal(studLengthFor(9), PRECUT["9ft"]);
  assert.equal(studLengthFor(10), PRECUT["10ft"]);
});

test("every wall of every program frames: none left out, every wall passes the engine's own self-check", () => {
  for (const beds of [0, 1, 2, 3, 4, 5]) for (const frame of ["advanced", "conventional"]) for (const garage of [0, 2]) {
    const { brief, style, plan, tk } = planFor({ beds, frame, garage, style: beds % 2 ? "ranch" : "cottage" });
    const f = frameHouse(plan, brief, tk, style);
    const tag = `${beds} bed ${frame} ${garage}-car`;
    assert.equal(f.summary.wallsLeftOut, 0, `${tag}: ${f.notes.filter((n) => /left out/.test(n)).join("; ")}`);
    assert.equal(f.walls.length, plan.walls.filter((w) => w.type !== "open").length, tag);
    const byId = new Map(f.input.walls.map((w) => [w.id, w]));
    for (const w of f.walls) {
      const problems = verifyWall(w, byId.get(w.id));
      assert.deepEqual(problems, [], `${tag} ${w.id}`);
    }
    // the order covers the cut list: as many inches bought as needed, per size
    for (const o of f.orders) assert.ok(o.bought + 1e-6 >= o.needed, `${tag} ${o.size}`);
    assert.ok(f.summary.gapToBound >= -1e-9 && f.summary.gapToBound < 2, `${tag}: gap ${f.summary.gapToBound}%`);
  }
});

test("walls follow the framer's reading of the plan", () => {
  const { brief, style, plan, tk } = planFor({ beds: 3, garage: 1 });
  const { input, map } = framingInput(plan, brief, tk, style);
  const T = 0.5416666666666666 * 12; // exterior wall thickness, in
  const byPlan = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, input.walls.find((w) => w.id === k)]));
  const front = plan.walls.find((w) => w.type === "ext" && w.dir === "h" && w.c === 0);
  const left = plan.walls.find((w) => w.type === "ext" && w.dir === "v" && w.c === 0);
  // the front runs the full width, the sides fit between the front and back
  assert.equal(byPlan[front.id].length, plan.W * 12);
  assert.ok(Math.abs(byPlan[left.id].length - (plan.D * 12 - 2 * T)) < 1 / 16 + 1e-9);
  assert.equal(byPlan[front.id].corner, true);
  assert.equal(byPlan[front.id].stud, "2x6");
  // every partition meeting the front wall puts a tee in it
  const meeting = plan.walls.filter((w) => w.type !== "ext" && w.type !== "open" && w.dir === "v" && w.a === 0);
  assert.equal(byPlan[front.id].tees.length, meeting.length);
  // every opening on the front sits inside the wall with room for its jacks
  for (const o of byPlan[front.id].openings) {
    assert.ok(o.offset >= THICK * (o.jacks + 1) - 1e-9 && o.offset + o.width <= byPlan[front.id].length - THICK * (o.jacks + 1) + 1e-9, o.label);
  }
});

test("mulled windows get one header sized for their combined span, and a garage door an engineered beam", () => {
  const { brief, style, plan, tk } = planFor({ beds: 3, garage: 1 });
  const f = frameHouse(plan, brief, tk, style);
  const mulled = f.input.walls.flatMap((w) => w.openings).filter((o) => /mulled/.test(o.label));
  assert.ok(mulled.length >= 1);
  for (const o of mulled) assert.ok(["2x10", "2x12"].includes(o.header), `${o.label}: ${o.header}`);
  assert.equal(f.lvl.length, 1);
  assert.match(f.lvl[0].label, /garage door/);
  // the beam is drawn but not cut from boards
  assert.ok(!f.cuts.some((c) => c.kind === "header" && c.walls.some((w) => /\(w1\)/.test(w)) && c.size === "2x12" && c.length > 108));
});

test("the plan set carries the framing sheet, cut list and order, and the README says what they cover", () => {
  const r = designFiles({ beds: 2, style: "craftsman" });
  for (const n of ["framing.svg", "framing-cuts.csv", "lumber-order.csv"]) assert.ok(r.files[n], n);
  assert.match(r.files["framing.svg"], /^<svg[^>]+viewBox="0 0 1600 \d+"/);
  assert.match(r.files["framing.svg"], /NOT FOR CONSTRUCTION/);
  assert.match(r.files["lumber-order.csv"], /^Size,Length,Length \(in\),Quantity,Note\n/);
  assert.match(r.files["lumber-order.csv"], /precut stud/);
  assert.match(r.files["README.md"], /## Wall framing, stud by stud/);
  assert.match(r.files["README.md"], /wall framing only/);
  assert.equal(r.design.studFraming.wallsLeftOut, 0);
  // conventional framing on the same brief needs more pieces than advanced
  const conv = designFiles({ beds: 2, style: "craftsman", frame: "conventional" });
  assert.ok(conv.design.studFraming.pieces > r.design.studFraming.pieces);
});
