import test from "node:test";
import assert from "node:assert/strict";
import { turntableFrame, turnAngles, renderTurntable, normalise } from "./turntable.mjs";
import { newDesign, applyOp } from "./design.mjs";

test("front at 0, back at 180, narrowest at the sides but never zero", () => {
  assert.equal(turntableFrame(0).side, "front");
  assert.equal(turntableFrame(0).scaleX, 1);
  assert.equal(turntableFrame(180).side, "back");
  assert.equal(turntableFrame(180).scaleX, 1);
  const side = turntableFrame(90);
  assert.ok(side.scaleX > 0 && side.scaleX < 0.2);
  assert.equal(side.turn, 1);
});

test("angles wrap and negative angles work", () => {
  assert.equal(normalise(-90), 270);
  assert.equal(normalise(450), 90);
  assert.equal(turntableFrame(-10).side, "front");
  assert.equal(turntableFrame(200).side, "back");
});

test("a full turn is evenly spaced and bounded", () => {
  assert.deepEqual(turnAngles(4), [0, 90, 180, 270]);
  assert.equal(turnAngles(1000).length, 72);
});

test("the turned drawing shows the back artwork only when turned round", () => {
  let d = newDesign({});
  d = applyOp(d, { op: "add", kind: "text", text: "FRONTWORD", area: "front", method: "screen" });
  d = applyOp(d, { op: "add", kind: "text", text: "BACKWORD", area: "back", method: "screen" });
  assert.match(renderTurntable(d, 20), /FRONTWORD/);
  assert.doesNotMatch(renderTurntable(d, 20), /BACKWORD/);
  assert.match(renderTurntable(d, 160), /BACKWORD/);
  assert.match(renderTurntable(d, 90), /scale\(0\.16 1\)/);
});

test("artwork text is escaped in the turned view", () => {
  let d = newDesign({});
  d = applyOp(d, { op: "add", kind: "text", text: "<script>x</script>", area: "front", method: "screen" });
  assert.doesNotMatch(renderTurntable(d, 0), /<script>/);
});
