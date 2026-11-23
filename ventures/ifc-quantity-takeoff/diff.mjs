// Change report between two revisions of one IFC model.
//
// Input: the rows of two takeoffs (qto.mjs `takeoff(...).rows`), the earlier
// revision first. Output: every element of either revision, each placed in
// exactly one of
//
//   unchanged   matched, same quantities, attributes and place;
//   changed     matched, and a quantity, an attribute, its place (moved) or
//               its size (reshaped) differs;
//   added       only in the later revision;
//   removed     only in the earlier revision;
//   merged      several earlier elements replaced by one later element on the
//               same storey whose box holds their centres and whose volume is
//               theirs summed within `groupTol` (Revit "parts" exported in one
//               revision and the host in the next);
//   split       the reverse: one earlier element replaced by several.
//
// Elements are matched, in this order:
//   1. by GlobalId;
//   2. by Tag within a class, when the Tag is unique in both revisions
//      (Revit writes its ElementId there, which survives a re-export that
//      regenerates GlobalIds);
//   3. by geometry: same class, same world box within `moveTol`, and the same
//      volume within `tol`, when exactly one candidate fits.
// Matches 2 and 3 are reported with `how` = "tag" or "geometry", so a reader
// sees which elements lost their GlobalId between revisions; nothing else in
// the file says so, and a takeoff tool keyed on GlobalId alone counts each of
// them as one removed and one added element.
//
// After merged/split groups, one more pairing (`how` = "place"): an element
// deleted and placed again in the authoring tool (a new Revit ElementId, so
// a new GlobalId and Tag) at nearly the same spot, possibly as another type.
// Same class and storey, the two world boxes overlapping by at least
// `placeOverlap` of their union (intersection volume / union volume), and
// exactly one candidate both ways. It is reported as "replaced in place",
// a change with its type, size and move listed, not as "same element": the
// count on the bill of quantities is unchanged, and what an estimator prices
// is the swap. On the Lake Kegonsa Home's 2014-10-21 -> 10-23 exports, 22 of
// the 25 window records listed as removed or added were 11 windows re-placed
// this way (eval/replaced-in-place-2026-11-22.md).
//
// A storey renamed between revisions keeps its own GlobalId. Its elements
// are not changed by that: the rename is listed once, in `renames.storey`,
// and the pairing steps take a renamed storey as the same storey. On the
// Tulpstraat house's BlenderBIM series the step that renamed "My Storey" to
// "00_begane_grond" had listed all 28 matched elements as changed, 4 of them
// for the storey's name alone (eval/revision-diff-tulpstraat-2026-11-23.md).
// A type whose name changed under one GlobalId is listed in `renames.type`
// but stays a change on its elements (`sameTypeObject` on the attribute):
// Revit keeps the GlobalId when a type is re-specified or swapped (Lake
// Kegonsa: "5.125x6" glulam to "HSS3.500X0.203" steel), and that is priced.
//
// A material has no GlobalId, so a material renamed in place (BlenderBIM's
// "Unknown" given the name "baksteen" on Tulpstraat) is told by its STEP
// entity id, and only when the two files keep those ids: a tool that edits
// the file in place does, a re-export renumbers everything. `materialIdsKept`
// is that test: of the elements matched by GlobalId, at least 3, and 80% of
// them keep their own STEP id (Tulpstraat: all, on all 11 steps). When it holds,
// an id whose name differs is listed in `renames.material`, and an element
// whose material changed only by that is marked `sameMaterialEntity` on the
// attribute; like a type, a material name is the specification, so it stays
// a change. `materialSwaps` groups every material change by before -> after
// with the elements' volume and area: the re-specifications an estimator
// prices, one line each instead of one per element.
//
// `boqDelta` sums each revision by the same grouping as the bill of
// quantities and subtracts: the lines an estimator prices for a change order.

import { boq, rowQuantities, keyLabel } from "./qto.mjs";

const QTY = ["volume", "area", "length", "weight"];
const ATTRS = ["ifcClass", "name", "type", "storey", "material", "classification"];
const ATTR_LABEL = { ifcClass: "class", name: "name", type: "type", storey: "storey", material: "material", classification: "classification" };

const relDiff = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null || b == null) return Infinity;
  const d = Math.abs(a - b), m = Math.max(Math.abs(a), Math.abs(b));
  return m === 0 ? 0 : d / m;
};

// The GlobalIds only ever remove a change: a re-export may regenerate a
// storey's or type's GlobalId (the Lake Kegonsa exporter switch did), so the
// same name under a new GlobalId still counts as the same storey or type.
const REF_GID = { storey: "storeyGlobalId", type: "typeGlobalId" };
/** A storey's or type's name changed while its GlobalId held. */
const isRename = (k, a, b) => Object.hasOwn(REF_GID, k) && (a[k] ?? null) !== (b[k] ?? null) && !!a[REF_GID[k]] && a[REF_GID[k]] === b[REF_GID[k]];
/** Same storey: the same name, or a renamed one (same GlobalId). */
const sameStorey = (a, b) => (a.storey ?? null) === (b.storey ?? null) || isRename("storey", a, b);

/**
 * Storeys and types whose name differs between the revisions under one
 * GlobalId, each with the number of later elements on or of it.
 */
function findRenames(A, B) {
  const out = {};
  for (const k of ["storey", "type"]) {
    const g = REF_GID[k];
    const before = new Map(), after = new Map();
    for (const r of A) if (r[g] && r[k] != null && !before.has(r[g])) before.set(r[g], r[k]);
    for (const r of B) if (r[g] && r[k] != null) { const e = after.get(r[g]); if (e) e.elements++; else after.set(r[g], { name: r[k], elements: 1 }); }
    out[k] = [];
    for (const [gid, e] of after) if (before.has(gid) && before.get(gid) !== e.name) out[k].push({ globalId: gid, before: before.get(gid), after: e.name, elements: e.elements });
    out[k].sort((x, y) => String(x.after).localeCompare(String(y.after)));
  }
  return out;
}

/** IfcMaterial entity id -> name over the elements of one revision. */
const materialNames = (rows) => {
  const m = new Map();
  for (const r of rows) {
    for (const p of r.materialParts || []) if (!m.has(p.id)) m.set(p.id, { kind: "IFCMATERIAL", name: p.name ?? null });
    const s = r.materialSet;
    if (s && !m.has(s.id)) m.set(s.id, { kind: s.kind, name: s.name ?? null });
  }
  return m;
};
const usesMaterial = (r, id) => r.materialSet?.id === id || (r.materialParts || []).some((p) => p.id === id);
const KIND_LABEL = { IFCMATERIAL: "IfcMaterial", IFCMATERIALLAYERSET: "IfcMaterialLayerSet", IFCMATERIALPROFILESET: "IfcMaterialProfileSet", IFCMATERIALCONSTITUENTSET: "IfcMaterialConstituentSet", IFCMATERIALLIST: "IfcMaterialList" };

/**
 * Whether the two revisions keep their STEP ids (a file edited in place, told
 * by the elements matched by GlobalId keeping theirs), and the IfcMaterial
 * ids renamed under them with the later elements using each.
 */
export function materialRenames(A, B, pairs = []) {
  const ma = materialNames(A), mb = materialNames(B);
  const shared = [...ma.keys()].filter((id) => mb.has(id));
  const byGid = pairs.filter((p) => p.how === "globalId" && p.a.id != null);
  const same = byGid.filter((p) => p.a.id === p.b.id).length;
  const kept = byGid.length >= 3 && same >= 0.8 * byGid.length;
  const renames = [];
  if (kept) {
    for (const id of shared) {
      const x = ma.get(id), y = mb.get(id);
      // the same id holding another kind of entity is not the same material
      if (x.kind !== y.kind || x.name === y.name) continue;
      renames.push({ entityId: id, entity: Object.hasOwn(KIND_LABEL, y.kind) ? KIND_LABEL[y.kind] : y.kind, before: x.name, after: y.name, elements: B.filter((r) => usesMaterial(r, id)).length });
    }
    renames.sort((x, y) => String(x.after).localeCompare(String(y.after)));
  }
  return { kept, matched: byGid.length, sameStepId: same, renames };
}

/**
 * The same assignment entity reaching the same IfcMaterial entities, in the
 * same order, on both rows (a wall moved from a bare material to a layer set
 * of that material is re-specified, not renamed).
 */
const sameMaterialEntities = (a, b) => {
  const pa = a.materialParts || [], pb = b.materialParts || [];
  return a.materialRef != null && a.materialRef === b.materialRef && pa.length > 0 && pa.length === pb.length && pa.every((p, i) => p.id === pb[i].id);
};

const boxCentre = (b) => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
const boxSize = (b) => [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
/** intersection volume over union volume of two boxes; 0 when they do not overlap or either is flat. */
const boxIoU = (a, b) => {
  let inter = 1;
  for (let i = 0; i < 3; i++) { const d = Math.min(a[i + 3], b[i + 3]) - Math.max(a[i], b[i]); if (!(d > 0)) return 0; inter *= d; }
  const va = (a[3] - a[0]) * (a[4] - a[1]) * (a[5] - a[2]), vb = (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
  const u = va + vb - inter;
  return u > 0 ? inter / u : 0;
};
const boxGap = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
/** true when point p lies inside box b, give or take `tol` metres. */
const pointInside = (p, b, tol) => p[0] >= b[0] - tol && p[1] >= b[1] - tol && p[2] >= b[2] - tol && p[0] <= b[3] + tol && p[1] <= b[4] + tol && p[2] <= b[5] + tol;

/** The quantities of a row the bill of quantities sums, plus its box. */
function quantitiesOf(r) {
  const q = rowQuantities(r);
  return { volume: q.volume, area: q.area, length: q.length, weight: q.weight };
}

/**
 * Compares two matched rows: which quantities moved past `tol` (relative),
 * which attributes differ, how far the box moved (metres, centre to centre)
 * when that is more than `moveTol` and its size held, or that its size
 * changed.
 */
function compareRows(a, b, tol, moveTol, idsKept = false) {
  const qa = quantitiesOf(a), qb = quantitiesOf(b);
  const quantities = {};
  for (const k of QTY) {
    if (qa[k] == null && qb[k] == null) continue;
    const absTol = k === "volume" ? 1e-6 : k === "area" ? 1e-4 : k === "length" ? 1e-4 : 1e-3;
    if (relDiff(qa[k], qb[k]) > tol && Math.abs((qa[k] ?? 0) - (qb[k] ?? 0)) > absTol) quantities[k] = { before: qa[k], after: qb[k], delta: (qb[k] ?? 0) - (qa[k] ?? 0) };
  }
  const attributes = {};
  const renamed = {};
  for (const k of ATTRS) {
    if ((a[k] ?? null) === (b[k] ?? null)) continue;
    if (k === "storey" && isRename(k, a, b)) renamed[ATTR_LABEL[k]] = { before: a[k] ?? null, after: b[k] ?? null };
    else attributes[ATTR_LABEL[k]] = { before: a[k] ?? null, after: b[k] ?? null, ...(k === "type" && isRename(k, a, b) ? { sameTypeObject: true } : {}), ...(k === "material" && idsKept && sameMaterialEntities(a, b) ? { sameMaterialEntity: true } : {}) };
  }
  // moved: the box kept its size and its centre shifted; reshaped: the box
  // changed size (a wall made longer shifts its centre too, but did not move)
  let moved = null, reshaped = null;
  if (a.box && b.box) {
    const sa = boxSize(a.box), sb = boxSize(b.box);
    if (sa.some((v, i) => Math.abs(v - sb[i]) > moveTol)) reshaped = { before: sa, after: sb };
    else {
      const ca = boxCentre(a.box), cb = boxCentre(b.box);
      const d = Math.hypot(cb[0] - ca[0], cb[1] - ca[1], cb[2] - ca[2]);
      if (d > moveTol) moved = { distance: d, by: cb.map((v, i) => v - ca[i]) };
    }
  }
  return { quantities, attributes, renamed, moved, reshaped, before: qa, after: qb };
}

/**
 * The change report. Options: tol (relative quantity change still counted as
 * equal, default 0.005), moveTol (metres a box may shift and still be the
 * same place, default 0.01), groupTol (relative volume difference between a
 * merged or split group and the element it replaces, default 0.02).
 */
export function diffTakeoffs(rowsA, rowsB, opts = {}) {
  const tol = opts.tol ?? 0.005;
  const moveTol = opts.moveTol ?? 0.01;
  // parts and their host differ a little where joins are cleaned up (0.4 to
  // 0.6% on the Aalseth Residence's walls), so a group gets more room
  const groupTol = opts.groupTol ?? 0.02;
  // replaced in place: boxes overlapping by this share of their union (0 turns it off)
  const placeOverlap = opts.placeOverlap ?? 0.5;
  // assemblies whose parts are elements are left out of the BoQ; leave them
  // out here too so a stair and its flights are not reported twice
  const A = rowsA.filter((r) => !r.isAssembly), B = rowsB.filter((r) => !r.isAssembly);
  const pairs = [];
  const freeA = new Set(A), freeB = new Set(B);
  const take = (a, b, how) => { freeA.delete(a); freeB.delete(b); pairs.push({ a, b, how }); };

  // 1. GlobalId. A GlobalId must be unique in a file, but some are not (in
  //    HHS construction2.ifc a column was given a slab's); when one repeats,
  //    the same class is preferred, and the repeats are counted
  const byGid = new Map();
  for (const b of B) if (b.globalId) { if (!byGid.has(b.globalId)) byGid.set(b.globalId, []); byGid.get(b.globalId).push(b); }
  const dupCount = (rows) => { const seen = new Set(), dup = new Set(); for (const r of rows) { if (seen.has(r.globalId)) dup.add(r.globalId); seen.add(r.globalId); } return dup.size; };
  for (const a of A) {
    const cands = (a.globalId && byGid.get(a.globalId) || []).filter((b) => freeB.has(b));
    const b = cands.find((c) => c.ifcClass === a.ifcClass) ?? (cands.length === 1 ? cands[0] : null);
    if (b) take(a, b, "globalId");
  }

  // 2. Tag within a class, unique on both sides (among all rows, not only the free ones)
  const tagKey = (r) => (r.tag ? `${r.ifcClass}\u0000${r.tag}` : null);
  const countTags = (rows) => { const m = new Map(); for (const r of rows) { const k = tagKey(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
  const tagsA = countTags(A), tagsB = countTags(B);
  const freeBByTag = new Map();
  for (const b of freeB) { const k = tagKey(b); if (k && tagsB.get(k) === 1) freeBByTag.set(k, b); }
  for (const a of [...freeA]) {
    const k = tagKey(a);
    if (!k || tagsA.get(k) !== 1) continue;
    const b = freeBByTag.get(k);
    if (b && freeB.has(b)) take(a, b, "tag");
  }

  // 3. geometry: same class, same box, same volume, one candidate only
  const volOf = (r) => quantitiesOf(r).volume;
  const geoFits = (a, b) => a.ifcClass === b.ifcClass && a.box && b.box && boxGap(a.box, b.box) <= moveTol && relDiff(volOf(a), volOf(b)) <= tol;
  for (const a of [...freeA]) {
    if (!a.box) continue;
    const cands = [...freeB].filter((b) => geoFits(a, b));
    if (cands.length !== 1) continue;
    const b = cands[0];
    if ([...freeA].filter((a2) => geoFits(a2, b)).length !== 1) continue;
    take(a, b, "geometry");
  }

  // 4. merged / split: one element's box holds several on the other side, and
  //    the volumes agree. Class is not compared: Revit exports a roof's parts
  //    as IfcRoof and the roof itself as IfcSlab.
  const groups = [];
  const findGroups = (ones, many, kind) => {
    for (const one of [...ones]) {
      const v = volOf(one);
      if (!one.box || v == null || !(v > 0)) continue;
      const inside = [...many].filter((m) => m.box && volOf(m) != null && sameStorey(m, one) && pointInside(boxCentre(m.box), one.box, moveTol));
      if (inside.length < 2) continue;
      const sum = inside.reduce((s, m) => s + volOf(m), 0);
      if (relDiff(sum, v) > groupTol) continue;
      ones.delete(one);
      for (const m of inside) many.delete(m);
      groups.push(kind === "merged" ? { kind, before: inside, after: [one], volumeBefore: sum, volumeAfter: v } : { kind, before: [one], after: inside, volumeBefore: v, volumeAfter: sum });
    }
  };
  findGroups(freeB, freeA, "merged");
  findGroups(freeA, freeB, "split");

  // 5. replaced in place: what is still unpaired, same class and storey,
  //    boxes overlapping by `placeOverlap` of their union, one candidate both ways
  if (placeOverlap > 0) {
    // volumes within a quarter: a swapped window type differs by a few
    // percent; a host and its thickest layer by a third or more
    const placeFits = (a, b) => a.ifcClass === b.ifcClass && a.box && b.box && sameStorey(a, b) && boxIoU(a.box, b.box) >= placeOverlap && relDiff(volOf(a), volOf(b)) <= 0.25;
    // another unpaired element of the class centred inside the box on the
    // other side is the mark of parts and their host, not of a swap
    const crowded = (one, others, self) => [...others].some((o) => o !== self && o.ifcClass === one.ifcClass && o.box && sameStorey(o, one) && pointInside(boxCentre(o.box), one.box, 0));
    const cand = new Map();
    for (const a of freeA) { if (!a.box) continue; const c = [...freeB].filter((b) => placeFits(a, b)); if (c.length === 1) cand.set(a, c[0]); }
    for (const [a, b] of cand) {
      if (!freeA.has(a) || !freeB.has(b)) continue;
      if ([...freeA].filter((a2) => placeFits(a2, b)).length !== 1) continue;
      if (crowded(a, freeB, b) || crowded(b, freeA, a)) continue;
      take(a, b, "place");
    }
  }

  const mat = materialRenames(A, B, pairs);
  const changed = [], unchanged = [];
  for (const p of pairs) {
    const c = compareRows(p.a, p.b, tol, moveTol, mat.kept);
    const entry = { ...p, ...c };
    if (p.how === "place") changed.push(entry); // a new element, even when nothing measurable differs
    else if (Object.keys(c.quantities).length || Object.keys(c.attributes).length || c.moved || c.reshaped) changed.push(entry);
    else unchanged.push(entry);
  }
  const added = [...freeB], removed = [...freeA];
  const reid = pairs.filter((p) => p.how === "tag" || p.how === "geometry");
  const renames = { ...findRenames(A, B), material: mat.renames };
  // every material change, grouped by before -> after
  const swaps = new Map();
  for (const c of changed) {
    const m = c.attributes.material;
    if (!m) continue;
    const k = JSON.stringify([m.before, m.after]);
    if (!swaps.has(k)) swaps.set(k, { before: m.before, after: m.after, elements: 0, renamedInPlace: 0, volume: 0, area: 0, classes: {} });
    const s = swaps.get(k);
    s.elements++;
    if (m.sameMaterialEntity) s.renamedInPlace++;
    s.volume += c.after.volume ?? 0;
    s.area += c.after.area ?? 0;
    s.classes[c.b.ifcClass] = (s.classes[c.b.ifcClass] || 0) + 1;
  }
  const materialSwaps = [...swaps.values()].sort((x, y) => y.elements - x.elements || String(x.after).localeCompare(String(y.after)));
  // rooms are not elements: compared on their own when both room lists are given
  const rooms = opts.rooms ? diffRooms(opts.rooms[0], opts.rooms[1], { tol }) : null;
  return {
    changed, unchanged, added, removed, groups, renames, materialSwaps, rooms,
    materialIdsKept: mat.kept,
    summary: {
      before: A.length, after: B.length,
      matched: pairs.length - pairs.filter((p) => p.how === "place").length, byGlobalId: pairs.filter((p) => p.how === "globalId").length, byTag: reid.filter((p) => p.how === "tag").length, byGeometry: reid.filter((p) => p.how === "geometry").length,
      replacedInPlace: pairs.filter((p) => p.how === "place").length,
      unchanged: unchanged.length, changed: changed.length,
      quantityChanged: changed.filter((c) => Object.keys(c.quantities).length).length,
      attributeChanged: changed.filter((c) => Object.keys(c.attributes).length).length,
      moved: changed.filter((c) => c.moved).length,
      reshaped: changed.filter((c) => c.reshaped).length,
      added: added.length, removed: removed.length,
      merged: groups.filter((g) => g.kind === "merged").length, split: groups.filter((g) => g.kind === "split").length,
      duplicateGlobalIds: { before: dupCount(A), after: dupCount(B) },
      storeysRenamed: renames.storey.length, typesRenamed: renames.type.length, materialsRenamed: renames.material.length, materialSwaps: materialSwaps.length,
      renamedOnly: unchanged.filter((c) => Object.keys(c.renamed).length).length,
      rooms: rooms ? rooms.summary : null,
    },
  };
}

/** A room's measured figures, else the ones its quantity set stores. */
const ROOM_QTY = ["floorArea", "perimeter", "netWallArea", "volume"];
const ROOM_STORED = { floorArea: ["NetFloorArea", "GrossFloorArea"], perimeter: ["GrossPerimeter", "NetPerimeter"], netWallArea: ["NetWallArea", "GrossWallArea"], volume: ["NetVolume", "GrossVolume"] };
export function roomQuantities(r) {
  const out = {};
  for (const k of ROOM_QTY) {
    let v = r?.computed?.[k];
    if (v == null) for (const s of ROOM_STORED[k]) { const x = r?.stored?.[s]?.value; if (typeof x === "number") { v = x; break; } }
    out[k] = v ?? null;
  }
  out.openings = r?.computed?.openings ?? null;
  return out;
}
const ROOM_ATTRS = [["number", "number"], ["name", "name"], ["description", "description"], ["storey", "storey"], ["predefinedType", "type"]];

/**
 * The rooms (IfcSpace) of two takeoffs compared, as the elements are: a room
 * is matched by GlobalId, then, for a room with a new GlobalId, by its number
 * and name on the same storey when that is unique on both sides. A matched
 * room is changed when its number, name, description, storey or type
 * differs, when one of its single-value properties is added, removed or
 * given another value (a room data sheet's use or finish), when its floor
 * area, perimeter, net wall area or volume moves past `tol`, or when the
 * number of doors and windows in its walls changes.
 */
export function diffRooms(roomsA = [], roomsB = [], opts = {}) {
  const tol = opts.tol ?? 0.005;
  const pairs = [];
  const freeA = new Set(roomsA), freeB = new Set(roomsB);
  const byGid = new Map();
  for (const b of roomsB) if (b.globalId && !byGid.has(b.globalId)) byGid.set(b.globalId, b);
  for (const a of roomsA) {
    const b = a.globalId ? byGid.get(a.globalId) : null;
    if (b && freeB.has(b)) { freeA.delete(a); freeB.delete(b); pairs.push({ a, b, how: "globalId" }); }
  }
  const key = (r) => (r.number || r.name ? JSON.stringify([r.number ?? null, r.name ?? null, r.storey ?? null]) : null);
  const counts = (rs) => { const m = new Map(); for (const r of rs) { const k = key(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
  const ca = counts(roomsA), cb = counts(roomsB);
  const freeBByKey = new Map();
  for (const b of freeB) { const k = key(b); if (k && cb.get(k) === 1) freeBByKey.set(k, b); }
  for (const a of [...freeA]) {
    const k = key(a);
    if (!k || ca.get(k) !== 1) continue;
    const b = freeBByKey.get(k);
    if (b && freeB.has(b)) { freeA.delete(a); freeB.delete(b); pairs.push({ a, b, how: "name" }); }
  }
  const changed = [], unchanged = [];
  for (const p of pairs) {
    const attributes = {};
    for (const [k, label] of ROOM_ATTRS) if ((p.a[k] ?? null) !== (p.b[k] ?? null)) attributes[label] = { before: p.a[k] ?? null, after: p.b[k] ?? null };
    const pa = p.a.properties || {}, pb = p.b.properties || {};
    const properties = {};
    for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
      const x = Object.hasOwn(pa, k) ? pa[k] : undefined, y = Object.hasOwn(pb, k) ? pb[k] : undefined;
      if (x !== y) properties[k] = { before: x ?? null, after: y ?? null, kind: x === undefined ? "added" : y === undefined ? "removed" : "changed" };
    }
    const qa = roomQuantities(p.a), qb = roomQuantities(p.b);
    const quantities = {};
    for (const k of ROOM_QTY) {
      if (qa[k] == null && qb[k] == null) continue;
      if (relDiff(qa[k], qb[k]) > tol && Math.abs((qa[k] ?? 0) - (qb[k] ?? 0)) > 1e-4) quantities[k] = { before: qa[k], after: qb[k], delta: (qb[k] ?? 0) - (qa[k] ?? 0) };
    }
    if (qa.openings != null && qb.openings != null && qa.openings !== qb.openings) quantities.openings = { before: qa.openings, after: qb.openings, delta: qb.openings - qa.openings };
    const entry = { ...p, attributes, properties, quantities, before: qa, after: qb };
    if (Object.keys(attributes).length || Object.keys(properties).length || Object.keys(quantities).length) changed.push(entry);
    else unchanged.push(entry);
  }
  const added = [...freeB], removed = [...freeA];
  const area = (rs) => rs.reduce((s, r) => s + (roomQuantities(r).floorArea ?? 0), 0);
  return {
    changed, unchanged, added, removed,
    summary: {
      before: roomsA.length, after: roomsB.length,
      matched: pairs.length, byGlobalId: pairs.filter((p) => p.how === "globalId").length, byName: pairs.filter((p) => p.how === "name").length,
      unchanged: unchanged.length, changed: changed.length, added: added.length, removed: removed.length,
      attributeChanged: changed.filter((c) => Object.keys(c.attributes).length).length,
      propertyChanged: changed.filter((c) => Object.keys(c.properties).length).length,
      quantityChanged: changed.filter((c) => Object.keys(c.quantities).length).length,
      floorAreaBefore: area(roomsA), floorAreaAfter: area(roomsB),
    },
  };
}

/** One line per room property change, attribute change or quantity change: "BriefRole: (none) -> QUIET POD". */
export function roomChangeText(c, { short = false } = {}) {
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const prop = (k) => (short ? k.replace(/^.*\./, "") : k);
  return [
    ...Object.entries(c.attributes).map(([k, v]) => `${k}: ${v.before ?? "(none)"} -> ${v.after ?? "(none)"}`),
    ...Object.entries(c.properties).map(([k, v]) => v.kind === "added" ? `${prop(k)} added: ${v.after ?? "(empty)"}` : v.kind === "removed" ? `${prop(k)} removed (was ${v.before ?? "(empty)"})` : `${prop(k)}: ${v.before ?? "(empty)"} -> ${v.after ?? "(empty)"}`),
    ...Object.entries(c.quantities).map(([k, q]) => k === "openings" ? `doors and windows ${q.before} -> ${q.after}` : `${k === "floorArea" ? "floor area" : k === "netWallArea" ? "net wall area" : k} ${q.delta > 0 ? "+" : ""}${r4(q.delta)}`),
  ].join("; ");
}

/**
 * Bill-of-quantities lines of both revisions under the same grouping, with
 * the change on each line. With rates ({[JSON key]: {rate, unit}}), the
 * amount before, after and the difference.
 */
export function boqDelta(rowsA, rowsB, by = ["class", "type"], rates = {}) {
  const la = boq(rowsA, by), lb = boq(rowsB, by);
  const lines = new Map();
  const blank = () => ({ count: 0, volume: 0, area: 0, length: 0, weight: 0 });
  for (const [side, L] of [["before", la], ["after", lb]]) {
    for (const l of L) {
      const k = JSON.stringify(l.key);
      if (!lines.has(k)) lines.set(k, { key: l.key, before: blank(), after: blank() });
      const t = lines.get(k)[side];
      for (const q of ["count", ...QTY]) t[q] = l[q];
    }
  }
  const out = [];
  for (const [k, l] of lines) {
    l.delta = {};
    for (const q of ["count", ...QTY]) l.delta[q] = l.after[q] - l.before[q];
    const rate = rates[k];
    if (rate && Number.isFinite(rate.rate)) {
      const unitQ = { each: "count", m3: "volume", m2: "area", m: "length", kg: "weight" }[rate.unit];
      if (unitQ) l.amount = { before: rate.rate * l.before[unitQ], after: rate.rate * l.after[unitQ], delta: rate.rate * l.delta[unitQ] };
    }
    out.push(l);
  }
  return out.sort((a, b) => a.key.join("\u0000").localeCompare(b.key.join("\u0000")));
}

const csvCell = (v) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@\t\r]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) && typeof v !== "number" ? "'" : "") + s.replace(/"/g, '""')}"` : s;
};

/** Lines of `boqDelta` as CSV, changed lines only unless `all`. */
export function boqDeltaCsv(lines, by, { all = false } = {}) {
  const cap = keyLabel;
  const head = [...by.map(cap), "Count before", "Count after", "Count change", "Volume m3 before", "Volume m3 after", "Volume m3 change", "Area m2 before", "Area m2 after", "Area m2 change", "Length m before", "Length m after", "Length m change", "Weight kg before", "Weight kg after", "Weight kg change", "Amount before", "Amount after", "Amount change"];
  const out = [head.map(csvCell).join(",")];
  const small = (d) => Math.abs(d.count) < 0.5 && Math.abs(d.volume) < 1e-6 && Math.abs(d.area) < 1e-4 && Math.abs(d.length) < 1e-4 && Math.abs(d.weight) < 1e-3;
  for (const l of lines) {
    if (!all && small(l.delta) && !(l.amount && Math.abs(l.amount.delta) > 1e-9)) continue;
    const row = [...l.key];
    for (const q of ["count", ...QTY]) row.push(l.before[q], l.after[q], l.delta[q]);
    row.push(l.amount?.before, l.amount?.after, l.amount?.delta);
    out.push(row.map(csvCell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

const HOW_TEXT = { globalId: "", tag: "new GlobalId, matched by Tag", geometry: "new GlobalId, matched by geometry", place: "new element in the same place (box overlap)" };

/** One CSV row per element that is not unchanged. */
export function changesCsv(d) {
  const head = ["Change", "GlobalId before", "GlobalId after", "Class", "Name", "Type", "Storey", "Matched by", "What changed", "Volume m3 before", "Volume m3 after", "Area m2 before", "Area m2 after", "Length m before", "Length m after", "Weight kg before", "Weight kg after", "Moved m"];
  const out = [head.map(csvCell).join(",")];
  const qcells = (qa, qb) => QTY.flatMap((k) => [qa?.[k] ?? null, qb?.[k] ?? null]);
  for (const r of d.renames?.material || []) out.push(["material renamed", `#${r.entityId}`, `#${r.entityId}`, r.entity ?? "IfcMaterial", r.after, "", "", "same STEP id (file edited in place)", `name: ${r.before ?? "(none)"} -> ${r.after ?? "(none)"} (${r.elements} element${r.elements === 1 ? "" : "s"}; each still listed as a material change)`, ...qcells(null, null), null].map(csvCell).join(","));
  for (const s of d.materialSwaps || []) out.push(["material swap", "", "", Object.keys(s.classes).join(" / "), "", "", "", s.renamedInPlace === s.elements ? "same material entity" : s.renamedInPlace ? `${s.renamedInPlace} of ${s.elements} same material entity` : "", `material: ${s.before ?? "(none)"} -> ${s.after ?? "(none)"} (${s.elements} element${s.elements === 1 ? "" : "s"})`, null, s.volume, null, s.area, null, null, null, null, null].map(csvCell).join(","));
  for (const [k, label, cls] of [["storey", "storey renamed", "IfcBuildingStorey"], ["type", "type renamed", "(type)"]]) {
    for (const r of d.renames?.[k] || []) out.push([label, r.globalId, r.globalId, cls, r.after, k === "type" ? r.after : "", k === "storey" ? r.after : "", "same GlobalId", `name: ${r.before ?? "(none)"} -> ${r.after ?? "(none)"} (${r.elements} element${r.elements === 1 ? "" : "s"}; ${k === "storey" ? "not counted as changed" : "each still listed as a type change"})`, ...qcells(null, null), null].map(csvCell).join(","));
  }
  for (const c of d.changed) {
    const what = [
      ...Object.entries(c.quantities).map(([k, q]) => `${k} ${q.delta > 0 ? "+" : ""}${Math.round(q.delta * 1e4) / 1e4}`),
      ...Object.entries(c.attributes).map(([k, v]) => `${k}: ${v.before ?? "(none)"} -> ${v.after ?? "(none)"}${v.sameTypeObject ? " (same type GlobalId: renamed or re-specified)" : ""}${v.sameMaterialEntity ? " (same material entity, renamed)" : ""}`),
      ...(c.moved ? [`moved ${Math.round(c.moved.distance * 1000) / 1000} m`] : []),
      ...(c.reshaped ? [`box ${c.reshaped.before.map((v) => Math.round(v * 1000) / 1000).join(" x ")} -> ${c.reshaped.after.map((v) => Math.round(v * 1000) / 1000).join(" x ")} m`] : []),
    ].join("; ");
    out.push([c.how === "place" ? "replaced in place" : "changed", c.a.globalId, c.b.globalId, c.b.ifcClass, c.b.name, c.b.type, c.b.storey, (Object.hasOwn(HOW_TEXT, c.how) ? HOW_TEXT[c.how] : ""), what, ...qcells(c.before, c.after), c.moved ? c.moved.distance : null].map(csvCell).join(","));
  }
  for (const c of d.unchanged) if (c.how !== "globalId") out.push(["same element, new GlobalId", c.a.globalId, c.b.globalId, c.b.ifcClass, c.b.name, c.b.type, c.b.storey, (Object.hasOwn(HOW_TEXT, c.how) ? HOW_TEXT[c.how] : ""), "", ...qcells(c.before, c.after), null].map(csvCell).join(","));
  for (const g of d.groups) {
    const label = g.kind === "merged" ? `merged (${g.before.length} into 1)` : `split (1 into ${g.after.length})`;
    for (const r of g.before) out.push([label, r.globalId, "", r.ifcClass, r.name, r.type, r.storey, "box and volume", `group volume ${Math.round(g.volumeBefore * 1e4) / 1e4} -> ${Math.round(g.volumeAfter * 1e4) / 1e4}`, ...qcells(quantitiesOf(r), null), null].map(csvCell).join(","));
    for (const r of g.after) out.push([label, "", r.globalId, r.ifcClass, r.name, r.type, r.storey, "box and volume", "", ...qcells(null, quantitiesOf(r)), null].map(csvCell).join(","));
  }
  for (const r of d.added) out.push(["added", "", r.globalId, r.ifcClass, r.name, r.type, r.storey, "", "", ...qcells(null, quantitiesOf(r)), null].map(csvCell).join(","));
  for (const r of d.removed) out.push(["removed", r.globalId, "", r.ifcClass, r.name, r.type, r.storey, "", "", ...qcells(quantitiesOf(r), null), null].map(csvCell).join(","));
  // rooms: floor area in the area columns, room volume in the volume columns
  if (d.rooms) {
    const rq = (q) => [q?.volume ?? null, q?.floorArea ?? null];
    const rcells = (qa, qb) => { const [va, aa] = rq(qa), [vb, ab] = rq(qb); return [va, vb, aa, ab, null, null, null, null]; };
    const label = (r) => [r.number, r.name].filter(Boolean).join(" ") || `#${r.id}`;
    for (const c of d.rooms.changed) out.push(["room changed", c.a.globalId, c.b.globalId, "IfcSpace", label(c.b), "", c.b.storey, c.how === "name" ? "new GlobalId, matched by number and name" : "", roomChangeText(c), ...rcells(c.before, c.after), null].map(csvCell).join(","));
    for (const c of d.rooms.unchanged) if (c.how !== "globalId") out.push(["same room, new GlobalId", c.a.globalId, c.b.globalId, "IfcSpace", label(c.b), "", c.b.storey, "new GlobalId, matched by number and name", "", ...rcells(c.before, c.after), null].map(csvCell).join(","));
    for (const r of d.rooms.added) out.push(["room added", "", r.globalId, "IfcSpace", label(r), "", r.storey, "", "", ...rcells(null, roomQuantities(r)), null].map(csvCell).join(","));
    for (const r of d.rooms.removed) out.push(["room removed", r.globalId, "", "IfcSpace", label(r), "", r.storey, "", "", ...rcells(roomQuantities(r), null), null].map(csvCell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}
