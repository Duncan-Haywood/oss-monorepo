import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutHvac, hvacText } from "./hvac.mjs";
import { layoutPlumbing, plumbingText } from "./plumbing.mjs";
import { layoutWallTile, wallTileText } from "./walltile.mjs";

// Property tests for the three modules that had hand tests only: random input
// (including junk types) must never throw; it is refused with a reason or it
// orders whole items that cover the typed quantities, with a text report.
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
const int = (rand, a, b) => a + Math.floor(rand() * (b - a + 1));
const JUNK = [null, "x", "12", -3, NaN, Infinity, [], {}, true];
// mostly valid number, sometimes junk
const num = (rand, a, b, p = 0.04) => (rand() < p ? pick(rand, JUNK) : Math.round((a + rand() * (b - a)) * 100) / 100);
const whole = (rand, a, b, p = 0.04) => (rand() < p ? pick(rand, JUNK) : int(rand, a, b));
const maybe = (rand, p, f) => (rand() < p ? f() : undefined);
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const ge = (a, b) => a + 1e-6 >= b;

function run(name, gen, check, minOk) {
  let ok = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const d = gen(rng(seed));
    let r;
    try { r = name.layout(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    ok++;
    try {
      check(r, d, (m) => failures.push(`seed ${seed}: ${m}`));
      if (!name.text(r).length) failures.push(`seed ${seed}: empty text`);
    } catch (e) { failures.push(`seed ${seed}: check/text threw ${e.message}`); }
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(ok >= minOk && refused > 0, `${ok} ok, ${refused} refused`);
}

test("fuzz: hvac orders whole sticks and rolls that cover the typed runs", () => {
  run({ layout: layoutHvac, text: hvacText }, (rand) => compact({
    trunkFt: maybe(rand, 0.7, () => num(rand, 0, 120)),
    trunkFittings: maybe(rand, 0.3, () => whole(rand, 0, 12)),
    waste: maybe(rand, 0.5, () => num(rand, 0, 0.4)),
    supportSpacingFt: maybe(rand, 0.4, () => num(rand, 1, 8)),
    tapeFtPerDuctFt: maybe(rand, 0.3, () => num(rand, 0, 2)),
    tapeRollFt: maybe(rand, 0.3, () => num(rand, 20, 200)),
    trunkPrice: maybe(rand, 0.3, () => num(rand, 1, 60)),
    rooms: Array.from({ length: int(rand, rand() < 0.03 ? 0 : 1, 8) }, () => compact({
      count: maybe(rand, 0.4, () => whole(rand, 1, 4)),
      supplyFt: maybe(rand, 0.8, () => num(rand, 0, 40)),
      returnFt: maybe(rand, 0.4, () => num(rand, 0, 30)),
      registers: maybe(rand, 0.3, () => whole(rand, 0, 3)),
      fittings: maybe(rand, 0.3, () => whole(rand, 0, 4)),
    })),
  }), (r, d, bad) => {
    for (const k of ["trunkSticks", "flexRolls", "boots", "registers", "returnGrilles", "fittings", "supports"]) {
      if (!(Number.isInteger(r[k]) && r[k] >= 0)) bad(`${k} = ${r[k]}`);
    }
    if (!ge(r.trunkSticks * r.trunkStickFt, r.trunkFt * (1 + r.waste))) bad("trunk sticks short");
    if (!ge(r.flexRolls * r.flexRollFt, r.flexFt * (1 + r.waste))) bad("flex rolls short");
    if (r.flexRolls > 0 && r.trunkSticks * r.trunkStickFt > (r.trunkFt * (1 + r.waste)) + r.trunkStickFt) bad("too many sticks");
    if (r.perRoom.reduce((s, x) => s + x.supplyFt, 0) !== r.supplyFt) bad("room supply does not add");
    if (r.cost != null && !(r.cost >= 0)) bad(`cost ${r.cost}`);
  }, 100);
});

test("fuzz: plumbing orders whole sticks and coils that cover the typed runs", () => {
  run({ layout: layoutPlumbing, text: plumbingText }, (rand) => compact({
    waste: maybe(rand, 0.5, () => num(rand, 0, 0.4)),
    drainStickFt: maybe(rand, 0.3, () => num(rand, 5, 12)),
    pexCoilFt: maybe(rand, 0.3, () => num(rand, 50, 300)),
    drainHangerSpacingFt: maybe(rand, 0.4, () => num(rand, 1, 8)),
    supplyStrapSpacingFt: maybe(rand, 0.4, () => num(rand, 1, 8)),
    trapPrice: maybe(rand, 0.3, () => num(rand, 1, 30)),
    fixtures: Array.from({ length: int(rand, rand() < 0.03 ? 0 : 1, 8) }, () => compact({
      count: maybe(rand, 0.4, () => whole(rand, 1, 4)),
      drainFt: maybe(rand, 0.7, () => num(rand, 0, 30)),
      ventFt: maybe(rand, 0.5, () => num(rand, 0, 20)),
      hotFt: maybe(rand, 0.6, () => num(rand, 0, 40)),
      coldFt: maybe(rand, 0.6, () => num(rand, 0, 40)),
      trap: maybe(rand, 0.2, () => rand() < 0.5),
      dfu: maybe(rand, 0.3, () => num(rand, 0, 6)),
    })),
  }), (r, d, bad) => {
    for (const k of ["drainSticks", "hotCoils", "coldCoils", "traps", "stops", "hangers", "straps"]) {
      if (!(Number.isInteger(r[k]) && r[k] >= 0)) bad(`${k} = ${r[k]}`);
    }
    if (!ge(r.drainSticks * r.drainStickFt, r.drainTotal * (1 + r.waste))) bad("drain sticks short");
    if (!ge(r.hotCoils * r.pexCoilFt, r.hotFt * (1 + r.waste))) bad("hot coils short");
    if (!ge(r.coldCoils * r.pexCoilFt, r.coldFt * (1 + r.waste))) bad("cold coils short");
    if (r.traps > r.fixtureCount) bad("more traps than fixtures");
    if (r.cost != null && !(r.cost >= 0)) bad(`cost ${r.cost}`);
  }, 100);
});

test("fuzz: wall tile orders whole boxes that cover the net area", () => {
  run({ layout: layoutWallTile, text: wallTileText }, (rand) => compact({
    backer: maybe(rand, 0.3, () => rand() < 0.5),
    membrane: maybe(rand, 0.3, () => rand() < 0.5),
    tile: maybe(rand, 0.8, () => compact({
      tileWidth: maybe(rand, 0.6, () => num(rand, 1, 24)),
      tileLength: maybe(rand, 0.6, () => num(rand, 1, 48)),
      joint: maybe(rand, 0.5, () => num(rand, 0, 0.5)),
      waste: maybe(rand, 0.5, () => num(rand, 0, 0.3)),
      tilePrice: maybe(rand, 0.3, () => num(rand, 1, 20)),
    })),
    surfaces: Array.from({ length: int(rand, rand() < 0.03 ? 0 : 1, 6) }, () => compact({
      name: maybe(rand, 0.5, () => "wall"),
      width: num(rand, 10, 200), height: num(rand, 10, 100),
      diagonal: maybe(rand, 0.2, () => true),
      trimEdges: maybe(rand, 0.3, () => ["top", "left", "bottom", "right"].slice(0, int(rand, 0, 4))),
      openings: maybe(rand, 0.3, () => [{ width: num(rand, 5, 60, 0.02), height: num(rand, 5, 60, 0.02) }]),
    })),
  }), (r, d, bad) => {
    for (const k of ["tiles", "thinsetBags", "groutBags", "backerSheets", "screwBoxes", "membraneGallons", "trimPieces"]) {
      if (!(Number.isInteger(r[k]) && r[k] >= 0)) bad(`${k} = ${r[k]}`);
    }
    if (!(r.sqFt > 0)) bad("no net area");
    if (r.sqFt > r.grossSqFt + 1e-9) bad("net above gross");
    const perTile = (r.tileWidth + r.joint) * (r.tileLength + r.joint) / 144;
    if (!ge(r.tiles * perTile, r.orderSqFt)) bad("tiles short of order area");
    if (!ge(r.orderSqFt, r.sqFt)) bad("order below net");
    if (r.cost != null && !(r.cost >= 0)) bad(`cost ${r.cost}`);
  }, 100);
});
