import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutWallTile, validateWallTile, wallTileText } from "./walltile.mjs";

// Tub surround by hand: three walls 60 x 72, 30 x 72 and 30 x 72 in, a 12 x 12 niche on the long wall.
const tub = { surfaces: [
  { name: "back", width: 60, height: 72, openings: [{ width: 12, height: 12 }] },
  { name: "left", width: 30, height: 72 }, { name: "right", width: 30, height: 72 },
] };

test("by hand: net area, tiles, thinset, grout", () => {
  // gross (4320 + 2160 + 2160) / 144 = 60 sq ft; niche 1 sq ft; net 59
  const p = layoutWallTile({ ...tub, tile: { tileWidth: 3, tileLength: 6, joint: 0.125, thickness: 0.3125 } });
  assert.equal(p.ok, true);
  assert.ok(Math.abs(p.grossSqFt - 60) < 1e-9);
  assert.ok(Math.abs(p.sqFt - 59) < 1e-9);
  const perTile = 3.125 * 6.125 / 144;
  assert.equal(p.tiles, Math.ceil(59 * 1.1 / perTile - 1e-9)); // 488
  assert.equal(p.thinsetBags, 1);
  const cuIn = 144 * (1 / 3.125 + 1 / 6.125) * 0.125 * 0.3125;
  assert.ok(Math.abs(p.groutLb - 59 * cuIn / 1728 * 100) < 1e-9);
  assert.equal(p.groutBags, 1);
});

test("backer board is cut round the niche, not saved; screws and membrane", () => {
  const p = layoutWallTile({ ...tub, membrane: true });
  assert.equal(p.backerSqFt, 60);
  assert.equal(p.backerSheets, Math.ceil(66 / 15 - 1e-9)); // 5
  assert.equal(p.screws, Math.ceil(5 * 15 * 1.2 - 1e-9)); // 90
  assert.equal(p.screwBoxes, 1);
  assert.equal(p.membraneGallons, 2); // 60 / 50
});

test("a backsplash with no backer or membrane, diagonal waste, prices", () => {
  const p = layoutWallTile({ backer: false, surfaces: [{ width: 120, height: 18, diagonal: true }], tile: { tileWidth: 4, tileLength: 4, tilePrice: 0.5, thinsetPrice: 20, groutPrice: 15 } });
  assert.equal(p.backerSheets, 0);
  assert.equal(p.membraneGallons, 0);
  assert.ok(Math.abs(p.orderSqFt - 15 * 1.15) < 1e-9);
  assert.equal(p.cost, p.tiles * 0.5 + 20 + 15);
});

test("refusals", () => {
  assert.match(validateWallTile(null)[0], /object/);
  assert.match(validateWallTile({})[0], /surfaces/);
  assert.ok(validateWallTile({ surfaces: [{ width: "60", height: 72 }] }).length);
  assert.ok(validateWallTile({ surfaces: [{ width: 10, height: 10, openings: [{ width: 10, height: 10 }] }] })[0].includes("cover all"));
  assert.ok(validateWallTile({ surfaces: [{ width: 10, height: 10 }], tile: { tileWidth: 0 } }).length);
  assert.ok(validateWallTile({ surfaces: [{ width: 10, height: 10 }], tile: { waste: 0.9 } }).length);
  assert.equal(layoutWallTile({ surfaces: [] }).ok, false);
});

test("text names the parts and the limits", () => {
  const t = wallTileText(layoutWallTile({ ...tub, membrane: true })).join("\n");
  assert.match(t, /tiles with waste/);
  assert.match(t, /Backer board/);
  assert.match(t, /membrane/);
  assert.match(t, /not counted/);
});

test("edge trim from typed edges, whole pieces with waste", () => {
  const p = layoutWallTile({ surfaces: [{ width: 60, height: 72, trimEdges: ["top", "left", "left"] }], tile: { trimPrice: 12 } });
  assert.equal(p.trimInches, 132); // 60 + 72, duplicate ignored
  assert.equal(p.trimPieces, Math.ceil(132 * 1.1 / 96 - 1e-9)); // 2
  assert.equal(p.cost, 24); // 2 pieces x 12
  assert.equal(layoutWallTile({ surfaces: [{ width: 60, height: 72 }] }).trimPieces, 0);
  assert.ok(validateWallTile({ surfaces: [{ width: 10, height: 10, trimEdges: ["roof"] }] }).length);
  assert.match(wallTileText(p).join("\n"), /Edge trim/);
});
