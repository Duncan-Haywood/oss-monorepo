// @ts-check
// Wall tile: shower surrounds, tub walls and backsplashes. What to order for
// each tiled surface typed as a rectangle in inches (`surfaces: [{name, width,
// height, openings: [{width, height}], backer, membrane, diagonal}]`); the
// wall model has no tiled-area outlines, so they are typed the way flooring
// rooms and paint ceilings are.
//
// Per surface: net area = width x height less its openings (a window, a niche
// is typed as an opening and so is not tiled; a niche's returns are not
// counted). From the net area:
//  - tiles: area plus waste (10%, 15% for `diagonal: true`) over the tile size
//    plus the grout joint, whole tiles;
//  - thinset: whole bags at a typed coverage (default 80 sq ft per bag);
//  - grout: by joint volume (joint runs x joint width x tile thickness x
//    density), whole bags, the same arithmetic flooring uses;
//  - cement backer board (`backer`, default true): the gross area (openings
//    are cut out, not saved) plus waste, in whole sheets of `backerSheetSqFt`
//    (default 15, a 3 x 5 ft board), with screws at a typed rate per sq ft of
//    board (default 1.2); no seam tape or board thickness is chosen for you;
//  - waterproofing membrane (`membrane`, default false): gallons at a typed
//    coverage (default 50 sq ft per gallon, both coats), whole gallons, over
//    the gross area of the surfaces that ask for it.
//  - edge trim (`trimEdges: ["top","left",...]` per surface): the typed edges
//    in inches plus waste (10%) over a piece length (default 96 in), whole pieces.
// Every default is a typed figure, not a code figure or a maker's: type the
// product's own. Corner pieces, niches' returns, curb and bench
// tops, slope work and a pan liner are not counted.

import { textNumberErrors } from "./numfields.mjs";

const NUMS = ["tileWidth", "tileLength", "joint", "thickness", "waste", "diagonalWaste", "thinsetSqFtPerBag", "groutLbPerCuFt", "groutBagLb", "backerSheetSqFt", "backerWaste", "screwsPerSqFt", "membraneSqFtPerGal", "tilePrice", "thinsetPrice", "groutPrice", "backerPrice", "screwBoxPrice", "screwsPerBox", "membranePrice", "trimPieceLength", "trimWaste", "trimPrice"];
const up = (/** @type {number} */ x) => Math.ceil(x - 1e-9);

/** @param {any} d */
export function validateWallTile(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Wall tile settings are an object."];
  if (!Array.isArray(d.surfaces) || !d.surfaces.length) return ["Wall tile needs `surfaces`: a list of {name, width, height} in inches."];
  if (d.surfaces.length > 200) return ["Wall tile takes at most 200 surfaces."];
  const t = d.tile ?? {};
  if (typeof t !== "object" || Array.isArray(t)) return ["`tile` is an object."];
  e.push(...textNumberErrors(t, NUMS));
  if (e.length) return e;
  for (const k of ["tileWidth", "tileLength"]) if (t[k] != null && !(t[k] >= 1 && t[k] <= 96)) e.push(`${k} must be between 1 and 96 in.`);
  if (t.joint != null && !(t.joint >= 0 && t.joint <= 2)) e.push("joint must be between 0 and 2 in.");
  if (t.thickness != null && !(t.thickness > 0 && t.thickness <= 2)) e.push("thickness must be above 0 and at most 2 in.");
  for (const k of ["waste", "diagonalWaste", "backerWaste"]) if (t[k] != null && !(t[k] >= 0 && t[k] <= 0.5)) e.push(`${k} must be between 0 and 0.5.`);
  for (const k of ["thinsetSqFtPerBag", "groutLbPerCuFt", "groutBagLb", "backerSheetSqFt", "membraneSqFtPerGal", "screwsPerBox"]) if (t[k] != null && !(t[k] > 0)) e.push(`${k} must be above 0.`);
  if (t.screwsPerSqFt != null && !(t.screwsPerSqFt >= 0 && t.screwsPerSqFt <= 10)) e.push("screwsPerSqFt must be between 0 and 10.");
  if (t.trimPieceLength != null && !(t.trimPieceLength >= 12 && t.trimPieceLength <= 240)) e.push("trimPieceLength must be between 12 and 240 in.");
  if (t.trimWaste != null && !(t.trimWaste >= 0 && t.trimWaste <= 0.5)) e.push("trimWaste must be between 0 and 0.5.");
  d.surfaces.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    const w = `Surface ${i + 1}`;
    if (s && s.trimEdges != null && (!Array.isArray(s.trimEdges) || s.trimEdges.some((/** @type {any} */ x) => !["top", "bottom", "left", "right"].includes(x)))) { e.push(`${w}: trimEdges is a list of "top", "bottom", "left" or "right".`); return; }
    if (!s || typeof s !== "object" || Array.isArray(s)) { e.push(`${w} is an object.`); return; }
    if (s.name != null && (typeof s.name !== "string" || s.name.length > 80)) { e.push(`${w}: name is text up to 80 characters.`); return; }
    const te = textNumberErrors(s, ["width", "height"]);
    if (te.length) { e.push(...te.map((x) => `${w}: ${x}`)); return; }
    if (!(s.width > 0 && s.width <= 1000 && s.height > 0 && s.height <= 400)) { e.push(`${w} needs a width up to 1000 in and a height up to 400 in, both above 0.`); return; }
    if (s.openings != null && !Array.isArray(s.openings)) { e.push(`${w}: openings is a list.`); return; }
    let open = 0;
    for (const o of s.openings || []) {
      if (!o || typeof o !== "object" || !(o.width > 0) || !(o.height > 0) || typeof o.width !== "number" || typeof o.height !== "number") { e.push(`${w}: each opening needs a width and a height above 0.`); return; }
      open += o.width * o.height;
    }
    if (open >= s.width * s.height) e.push(`${w}: its openings cover all of it.`);
  });
  return e;
}

/** @param {any} d */
export function layoutWallTile(d) {
  const errors = validateWallTile(d);
  if (errors.length) return { ok: false, errors };
  const t = d.tile ?? {};
  const w = t.tileWidth ?? 3, l = t.tileLength ?? 6, j = t.joint ?? 0.125, th = t.thickness ?? 0.3125;
  let trimIn = 0, base = 0, diag = 0, gross = 0, boardGross = 0, membraneGross = 0;
  const surfaces = [];
  for (const s of d.surfaces) {
    const grossSq = s.width * s.height / 144;
    const open = (s.openings || []).reduce((/** @type {number} */ a, /** @type {any} */ o) => a + Math.min(o.width * o.height, s.width * s.height), 0) / 144;
    const net = grossSq - open;
    gross += grossSq;
    for (const ed of new Set(s.trimEdges || [])) trimIn += ed === "top" || ed === "bottom" ? s.width : s.height;
    if (s.diagonal) diag += net; else base += net;
    if (s.backer ?? d.backer ?? true) boardGross += grossSq;
    if (s.membrane ?? d.membrane ?? false) membraneGross += grossSq;
    surfaces.push({ name: s.name ?? null, grossSqFt: grossSq, netSqFt: net });
  }
  const area = base + diag;
  const need = base * (1 + (t.waste ?? 0.1)) + diag * (1 + (t.diagonalWaste ?? 0.15));
  const perTile = (w + j) * (l + j) / 144;
  const tiles = up(need / perTile);
  const thinsetBags = up(area / (t.thinsetSqFtPerBag ?? 80));
  const jointCuIn = 144 * (1 / (w + j) + 1 / (l + j)) * j * th;
  const groutLb = area * jointCuIn / 1728 * (t.groutLbPerCuFt ?? 100);
  const groutBags = groutLb > 0 ? up(groutLb / (t.groutBagLb ?? 25)) : 0;
  const sheetSq = t.backerSheetSqFt ?? 15;
  const boardNeed = boardGross * (1 + (t.backerWaste ?? 0.1));
  const boardSheets = boardGross > 0 ? up(boardNeed / sheetSq) : 0;
  const screws = up(boardSheets * sheetSq * (t.screwsPerSqFt ?? 1.2));
  const screwBoxes = screws > 0 ? up(screws / (t.screwsPerBox ?? 100)) : 0;
  const membraneGal = membraneGross > 0 ? up(membraneGross / (t.membraneSqFtPerGal ?? 50)) : 0;
  const trimPieces = trimIn > 0 ? up(trimIn * (1 + (t.trimWaste ?? 0.1)) / (t.trimPieceLength ?? 96)) : 0;
  const lines = [
    [trimPieces, t.trimPrice],
    [tiles, t.tilePrice], [thinsetBags, t.thinsetPrice], [groutBags, t.groutPrice], [boardSheets, t.backerPrice], [screwBoxes, t.screwBoxPrice], [membraneGal, t.membranePrice],
  ];
  const priced = lines.some(([, p]) => p != null);
  const cost = priced ? lines.reduce((s, [n, p]) => s + (p != null ? n * p : 0), 0) : null;
  return {
    ok: true, errors: [], surfaces, count: surfaces.length, grossSqFt: gross, sqFt: area, orderSqFt: need,
    tileWidth: w, tileLength: l, joint: j, tiles, thinsetBags, groutLb, groutBags,
    backerSqFt: boardGross, backerSheets: boardSheets, backerSheetSqFt: sheetSq, screws, screwBoxes,
    membraneSqFt: membraneGross, membraneGallons: membraneGal, trimInches: trimIn, trimPieces, trimPieceLength: t.trimPieceLength ?? 96,
    prices: { tile: t.tilePrice ?? null, thinset: t.thinsetPrice ?? null, grout: t.groutPrice ?? null, backer: t.backerPrice ?? null, screwBox: t.screwBoxPrice ?? null, membrane: t.membranePrice ?? null, trim: t.trimPrice ?? null },
    cost,
  };
}

/** @param {any} p */
export function wallTileText(p) {
  const l = [];
  l.push(`  Tile: ${p.sqFt.toFixed(1)} sq ft net on ${p.count} surface${p.count > 1 ? "s" : ""} (${p.grossSqFt.toFixed(1)} sq ft before openings) of ${p.tileWidth} x ${p.tileLength} in tile, ${p.joint} in joints -> ${p.tiles} tiles with waste, ${p.thinsetBags} bag${p.thinsetBags === 1 ? "" : "s"} thinset, ${p.groutLb.toFixed(1)} lb grout (${p.groutBags} bag${p.groutBags === 1 ? "" : "s"}).`);
  if (p.backerSheets) l.push(`  Backer board: ${p.backerSqFt.toFixed(1)} sq ft -> ${p.backerSheets} sheets of ${p.backerSheetSqFt} sq ft, ${p.screws} screws (${p.screwBoxes} box${p.screwBoxes === 1 ? "" : "es"}).`);
  if (p.membraneGallons) l.push(`  Waterproofing membrane: ${p.membraneSqFt.toFixed(1)} sq ft -> ${p.membraneGallons} gal.`);
  if (p.trimPieces) l.push(`  Edge trim: ${(p.trimInches / 12).toFixed(1)} ft of typed edges -> ${p.trimPieces} piece${p.trimPieces === 1 ? "" : "s"} of ${p.trimPieceLength} in.`);
  if (p.cost != null) l.push(`  Wall tile cost: ${p.cost.toFixed(2)}.`);
  l.push("  Defaults are typed figures, not code or a maker's: use your product's tile size, coverage and board. Corners, niche returns, curbs, benches, slope and the pan liner are not counted.");
  return l;
}
