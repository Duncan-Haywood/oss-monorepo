import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, applyCommand, parseCommand } from "./engine.mjs";
import {
  identity, multiply, compose, invertRigid, transformPoint, transformDir, perspective, yawToward, playerOffset,
  deskRing, goPose, buildScene, pickRay, wrapText, downsample, rms, cleanTranscript, BOARD,
} from "./xr.mjs";

const near = (a, b, eps = 1e-5) => a.every((v, i) => Math.abs(v - b[i]) < eps);

function board(lines) {
  let s = emptyState();
  for (const line of lines) s = applyCommand(s, parseCommand(line, s.agents)).state;
  return s;
}

test("compose and invertRigid round-trip a camera pose", () => {
  const m = compose([1, 1.6, -2], 0.7, [1, 1, 1], -0.3);
  assert.ok(near(multiply(m, invertRigid(m)), identity()));
  assert.ok(near(transformPoint(invertRigid(m), [1, 1.6, -2]), [0, 0, 0]));
  // Yaw turns forward (-z) toward -x, the WebXR convention for a left turn.
  assert.ok(near(transformDir(compose([0, 0, 0], Math.PI / 2), [0, 0, -1]), [-1, 0, 0]));
});

test("perspective puts a point on the near plane at depth -1", () => {
  const p = perspective(Math.PI / 2, 1, 0.1, 100);
  const v = [0, 0, -0.1, 1];
  const clip = [0, 1, 2, 3].map((r) => p[r] * v[0] + p[4 + r] * v[1] + p[8 + r] * v[2] + p[12 + r] * v[3]);
  assert.ok(Math.abs(clip[2] / clip[3] + 1) < 1e-5);
});

test("yawToward and playerOffset agree with where the player stands", () => {
  assert.ok(Math.abs(yawToward([0, 0, 0], [0, 0, -1])) < 1e-9);
  assert.ok(Math.abs(yawToward([0, 0, 0], [-1, 0, 0]) - Math.PI / 2) < 1e-9);
  // The offset must take the player's world position to the reference space's origin.
  const player = { x: 2, z: -1, yaw: 0.8 };
  const { position, orientation } = playerOffset(player);
  const yaw = 2 * Math.atan2(orientation.y, orientation.w);
  const offset = compose([position.x, 0, position.z], yaw);
  assert.ok(near(transformPoint(offset, [2, 0, -1]), [0, 0, 0]));
});

test("desks ring the player without standing in front of the board", () => {
  for (const n of [1, 3, 8]) {
    const ring = deskRing(n);
    assert.equal(ring.length, n);
    for (const d of ring) {
      assert.ok(Math.abs(Math.hypot(d.x, d.z) - 2.7) < 1e-9);
      // Nothing in the 70-degree cone toward the board.
      assert.ok(!(d.z < 0 && Math.abs(Math.atan2(d.x, -d.z)) < 0.6), `desk at ${d.x},${d.z} blocks the board`);
      // Each desk faces the centre.
      assert.ok(Math.abs(d.yaw - yawToward([d.x, 0, d.z], [0, 0, 0])) < 1e-9);
    }
  }
});

test("goPose stands in front of the board or a named desk", () => {
  const desks = deskRing(3).map((d, i) => ({ ...d, agent: ["Scout", "Builder", "Reviewer"][i] }));
  assert.deepEqual(goPose({ kind: "board" }, desks), { x: 0, z: BOARD.z + 2.1, yaw: 0 });
  assert.deepEqual(goPose({ kind: "home" }, desks), { x: 0, z: 0, yaw: 0 });
  const p = goPose({ kind: "desk", agent: "builder" }, desks);
  const d = desks[1];
  assert.ok(Math.abs(Math.hypot(d.x - p.x, d.z - p.z) - 1.25) < 1e-9);
  assert.ok(Math.abs(p.yaw - yawToward([p.x, 0, p.z], [d.x, 0, d.z])) < 1e-9);
});

test("buildScene puts every task on the board and every agent at a desk", () => {
  const s = board(["Fix login @Builder !", "Write docs for Scout", "start 1", "Polish @Reviewer", "finish 3"]);
  const { items, desks } = buildScene(s, { selected: s.tasks[0].id, ci: { [s.tasks[0].id]: { state: "failing" } } });
  const notes = items.filter((i) => i.label?.kind === "note");
  assert.deepEqual(notes.map((n) => n.label.num).sort(), [1, 2, 3]);
  assert.equal(notes.find((n) => n.label.num === 1).label.selected, true);
  assert.equal(notes.find((n) => n.label.num === 1).label.ci, "failing");
  assert.deepEqual(desks.map((d) => d.agent), ["Scout", "Builder", "Reviewer"]);
  const builder = items.find((i) => i.label?.kind === "monitor" && i.label.agent === "Builder");
  assert.equal(builder.label.status, "doing");
  assert.deepEqual(builder.pick, { kind: "task", id: s.tasks[0].id });
  // Send and Cancel are not pickable until something is waiting to be sent.
  const send = () => items.find((i) => i.label?.kind === "button" && i.label.text === "Send");
  assert.equal(send().pick, null);
  const pending = buildScene(s, { pending: { text: "x" } }).items.find((i) => i.label?.text === "Send");
  assert.deepEqual(pending.pick, { kind: "button", id: "confirm" });
});

test("a full column folds the overflow into one 'more' note", () => {
  const s = board(Array.from({ length: 12 }, (_, i) => `Task number ${i + 1}`));
  const { items } = buildScene(s);
  assert.equal(items.filter((i) => i.label?.kind === "note" && i.label.status === "todo").length, BOARD.perColumn - 1);
  assert.match(items.find((i) => i.label?.kind === "more").label.text, /^\+6 more/);
});

test("pickRay hits the nearest pickable quad and misses its edge", () => {
  const items = [
    { mesh: "quad", pos: [0, 1.5, -3], size: [1, 0.2, 1], yaw: 0, pick: { id: "far" } },
    { mesh: "quad", pos: [0, 1.5, -2], size: [1, 0.2, 1], yaw: 0, pick: { id: "near" } },
    { mesh: "quad", pos: [0, 1.5, -1], size: [1, 0.2, 1], yaw: 0, pick: null },
  ];
  assert.equal(pickRay(items, [0, 1.5, 0], [0, 0, -1]).item.pick.id, "near");
  assert.equal(pickRay(items, [0.6, 1.5, 0], [0, 0, -1]), null);
  assert.equal(pickRay(items, [0, 1.5, 0], [0, 0, 1]), null);
  // A quad turned to face the player from the side.
  const side = [{ mesh: "quad", pos: [-2, 1.5, 0], size: [0.4, 0.4, 1], yaw: Math.PI / 2, pick: { id: "side" } }];
  assert.equal(pickRay(side, [0, 1.5, 0.1], [-1, 0, 0]).item.pick.id, "side");
  assert.equal(pickRay(side, [0, 1.5, 0.3], [-1, 0, 0]), null);
});

test("wrapText fits lines and marks a cut with an ellipsis", () => {
  const measure = (s) => s.length;
  assert.deepEqual(wrapText("one two three", 20, measure), ["one two three"]);
  assert.deepEqual(wrapText("aaa bbb ccc ddd eee", 7, measure, 2), ["aaa bbb", "ccc dd…"]);
  assert.deepEqual(wrapText("", 10, measure), []);
});

test("audio helpers: downsample, rms, cleanTranscript", () => {
  const ramp = Float32Array.from({ length: 48 }, (_, i) => i);
  const d = downsample(ramp, 48000, 16000);
  assert.equal(d.length, 16);
  assert.equal(d[0], 1);
  assert.equal(rms(new Float32Array(10)), 0);
  assert.ok(Math.abs(rms(Float32Array.from([1, -1])) - 1) < 1e-9);
  assert.equal(cleanTranscript(" Start two."), "Start two");
  assert.equal(cleanTranscript("[BLANK_AUDIO]"), "");
  assert.equal(cleanTranscript(" (music) "), "");
  assert.equal(cleanTranscript("Move login to review. [noise]"), "Move login to review");
});

test("monitors and the panel face the player standing at the centre", () => {
  const s = board(["Fix login @Builder"]);
  const { items } = buildScene(s);
  for (const it of items.filter((i) => ["monitor", "panel", "button"].includes(i.label?.kind))) {
    const normal = [Math.sin(it.yaw), Math.cos(it.yaw)];
    const toCentre = [-it.pos[0], -it.pos[2]];
    assert.ok(normal[0] * toCentre[0] + normal[1] * toCentre[1] > 0, `${it.label.kind} faces away`);
    // And a ray from the centre at it actually hits it.
    const dir = [it.pos[0], 0, it.pos[2]].map((v) => v / Math.hypot(it.pos[0], it.pos[2]));
    if (it.pick) assert.equal(pickRay([it], [0, it.pos[1], 0], dir)?.item, it);
  }
});
