import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutWallTile, wallTileText } from "./walltile.mjs";

// Seeded property test on invented tiled surfaces (some hostile): refused with
// a reason, or areas and whole-unit counts match an independent recount.
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

test("fuzz: random wall tile inputs are recounted by hand or refused with a reason", () => {
  const failures = [];
  let laid = 0, refused = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const surfaces = [];
    const n = Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const s = { name: `S${i}`, width: pick(rand, [30, 60, 96, 120]), height: pick(rand, [36, 60, 84]) };
      if (rand() < 0.05) s.width = pick(rand, [0, -5, "60", NaN, 5000]);
      if (rand() < 0.4) s.openings = [{ width: pick(rand, [12, 24]), height: pick(rand, [12, 36]) }];
      if (rand() < 0.05) s.openings = [{ width: 1000, height: 1000 }];
      if (rand() < 0.3) s.diagonal = true;
      if (rand() < 0.3) s.backer = false;
      if (rand() < 0.3) s.membrane = true;
      if (rand() < 0.3) s.trimEdges = rand() < 0.05 ? ["middle"] : pick(rand, [["top"], ["top", "left"], ["top", "top", "right"]]);
      surfaces.push(s);
    }
    const d = { surfaces };
    if (rand() < 0.4) d.tile = { tileWidth: pick(rand, [3, 4, 12]), tileLength: pick(rand, [6, 12, 24]), joint: pick(rand, [0.0625, 0.125, 0.25]) };
    if (rand() < 0.1) d.tile = { ...(d.tile ?? {}), waste: pick(rand, [0.6, -1]) };
    if (rand() < 0.3) d.tile = { ...(d.tile ?? {}), tilePrice: 2, backerPrice: 12 };
    let p;
    try { p = layoutWallTile(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!p.ok) { refused++; if (!p.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const bad = [];
    const t = d.tile ?? {};
    let gross = 0, net = 0, base = 0, diag = 0, board = 0, mem = 0, trim = 0;
    for (const s of surfaces) {
      const g = s.width * s.height / 144;
      const o = (s.openings ?? []).reduce((a, x) => a + x.width * x.height, 0) / 144;
      gross += g; net += g - o;
      if (s.diagonal) diag += g - o; else base += g - o;
      if (s.backer ?? true) board += g;
      if (s.membrane ?? false) mem += g;
      for (const e of new Set(s.trimEdges ?? [])) trim += e === "top" || e === "bottom" ? s.width : s.height;
    }
    const eq = (a, b, what) => { if (Math.abs(a - b) > 1e-6) bad.push(`${what}: ${a} vs ${b}`); };
    eq(p.grossSqFt, gross, "gross"); eq(p.sqFt, net, "net"); eq(p.backerSqFt, board, "backer area");
    eq(p.membraneSqFt, mem, "membrane area"); eq(p.trimInches, trim, "trim inches");
    const w = t.tileWidth ?? 3, l = t.tileLength ?? 6, j = t.joint ?? 0.125;
    const need = base * (1 + (t.waste ?? 0.1)) + diag * (1 + (t.diagonalWaste ?? 0.15));
    if (p.tiles * (w + j) * (l + j) / 144 + 1e-6 < need) bad.push("tiles do not cover the area plus waste");
    if ((p.tiles - 1) * (w + j) * (l + j) / 144 > need + 1e-6) bad.push("tiles over-rounded");
    if (p.thinsetBags * 80 + 1e-6 < net) bad.push("thinset does not cover");
    if (p.backerSheets * 15 + 1e-6 < board * 1.1) bad.push("backer sheets do not cover");
    if (!board && (p.backerSheets || p.screws)) bad.push("backer without board");
    if (!mem && p.membraneGallons) bad.push("membrane without area");
    if (!trim && p.trimPieces) bad.push("trim without edges");
    for (const k of ["tiles", "thinsetBags", "groutBags", "backerSheets", "screws", "screwBoxes", "membraneGallons", "trimPieces"]) if (!Number.isInteger(p[k]) || p[k] < 0) bad.push(`bad ${k}`);
    if (!Number.isFinite(p.groutLb) || p.groutLb < 0) bad.push("bad grout");
    if (t.tilePrice == null && p.cost !== null) bad.push("cost without prices");
    if (t.tilePrice != null) eq(p.cost, p.tiles * 2 + p.backerSheets * 12, "cost");
    try { if (!wallTileText(p).length) bad.push("empty text"); } catch (e) { bad.push(`text threw ${e.message}`); }
    if (bad.length) failures.push(`seed ${seed}: ${bad.join("; ")}`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 50 && refused > 5, `laid ${laid}, refused ${refused}`);
});
