import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutElectrical, validateElectrical, wallSpaces, electricalText, snapToStuds } from "./electrical.mjs";

test("wall spaces: doors break a wall, windows do not", () => {
  const s = wallSpaces(240, [{ kind: "door", offset: 100, width: 36 }, { kind: "window", offset: 20, width: 40 }]);
  assert.deepEqual(s, [{ start: 0, end: 100 }, { start: 136, end: 240 }]);
});

test("receptacles by hand: a 144 in wall space needs one, 145 in needs two", () => {
  const r = layoutElectrical({}, { walls: [{ id: "A", length: 144 }] });
  assert.equal(r.receptacles, 1);
  assert.deepEqual(r.spaces[0].receptacles, [72]);
  // 145 in tips over to two, placed at quarter points
  const r2 = layoutElectrical({}, { walls: [{ id: "A", length: 145 }] });
  assert.equal(r2.receptacles, 2);
  assert.deepEqual(r2.spaces[0].receptacles, [36.25, 108.75]);
});

test("door splits spaces; a 20 in stub gets none; interior wall has two faces; switch per door", () => {
  const plan = { walls: [{ id: "I", length: 300, sheathed: false, openings: [{ kind: "door", offset: 20, width: 32 }] }] };
  // spaces: 20 in (none), 248 in -> 2 ; two faces -> 4
  const r = layoutElectrical({}, plan);
  assert.equal(r.receptacles, 4);
  assert.equal(r.switches, 1);
  assert.equal(r.boxes, 5);
  assert.equal(r.cableFt, 60);
  assert.equal(r.cableRolls, 1); // 66 ft in a 250 ft roll
});

test("skipWalls, prices, rolls", () => {
  const plan = { walls: [{ id: "G", length: 600 }, { id: "A", length: 288, openings: [{ kind: "door", offset: 0, width: 36 }] }] };
  const r = layoutElectrical({ skipWalls: ["G"], receptaclePrice: 2, switchPrice: 3, boxPrice: 1, cablePrice: 100, cablePerDevice: 100, cableRoll: 250, waste: 0 }, plan);
  assert.equal(r.receptacles, 2); // 252 in -> 2
  assert.equal(r.switches, 1);
  assert.equal(r.cableFt, 300);
  assert.equal(r.cableRolls, 2);
  assert.equal(r.cost, 2 * 2 + 3 + 3 * 1 + 2 * 100);
  assert.ok(electricalText(r).length > 2);
});

test("bad settings are refused with a reason", () => {
  assert.ok(validateElectrical({ maxSpacing: "144" }).length);
  assert.ok(validateElectrical({ maxSpacing: 5 }).length);
  assert.ok(validateElectrical({ switchPerDoor: 1.5 }).length);
  assert.ok(validateElectrical({ skipWalls: ["nope"] }, { walls: [{ id: "A" }] }).length);
  assert.ok(validateElectrical({ receptaclePrice: -1 }).length);
  assert.equal(layoutElectrical({ cableRoll: 1 }, { walls: [] }).ok, false);
  assert.equal(layoutElectrical({}, { walls: [] }).boxes, 0);
});

test("snapToStuds: a box goes to the side of the nearest stud, clear of every stud", () => {
  const studs = [0, 16, 32, 48, 64, 80, 96, 112, 128].map((x) => ({ x, w: 1.5 }));
  const r = snapToStuds([72], 0, 144, studs, 144);
  assert.equal(r.snapped, true);
  // nearest stud to 72 is at 64..65.5 or 80..81.5; 72 is 8 in from each side of the bay, so a stud face +- 1.125
  assert.ok([64 - 1.125, 65.5 + 1.125, 80 - 1.125, 81.5 + 1.125].includes(r.at[0]), String(r.at[0]));
  for (const s of studs) assert.ok(r.at[0] - 1.125 >= s.x + s.w - 1e-9 || r.at[0] + 1.125 <= s.x + 1e-9);
});

test("layoutElectrical with layouts snaps and reports it", () => {
  const plan = { walls: [{ id: "A", length: 144 }] };
  const members = [0, 16, 32, 48, 64, 80, 96, 112, 128, 142.5].map((x) => ({ kind: "stud", orient: "v", x, w: 1.5 }));
  const r = layoutElectrical({}, plan, { A: { members } });
  assert.equal(r.receptacles, 1);
  assert.equal(r.spaces[0].snapped, true);
  assert.notEqual(r.spaces[0].receptacles[0], 72);
  assert.ok(electricalText(r).some((l) => /stud side/.test(l)));
  assert.equal(layoutElectrical({}, plan).spaces[0].snapped, false);
});
