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
// `boqDelta` sums each revision by the same grouping as the bill of
// quantities and subtracts: the lines an estimator prices for a change order.

import { boq, rowQuantities } from "./qto.mjs";

const QTY = ["volume", "area", "length", "weight"];
const ATTRS = ["ifcClass", "name", "type", "storey", "material", "classification"];
const ATTR_LABEL = { ifcClass: "class", name: "name", type: "type", storey: "storey", material: "material", classification: "classification" };

const relDiff = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null || b == null) return Infinity;
  const d = Math.abs(a - b), m = Math.max(Math.abs(a), Math.abs(b));
  return m === 0 ? 0 : d / m;
};

const boxCentre = (b) => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
const boxSize = (b) => [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
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
function compareRows(a, b, tol, moveTol) {
  const qa = quantitiesOf(a), qb = quantitiesOf(b);
  const quantities = {};
  for (const k of QTY) {
    if (qa[k] == null && qb[k] == null) continue;
    const absTol = k === "volume" ? 1e-6 : k === "area" ? 1e-4 : k === "length" ? 1e-4 : 1e-3;
    if (relDiff(qa[k], qb[k]) > tol && Math.abs((qa[k] ?? 0) - (qb[k] ?? 0)) > absTol) quantities[k] = { before: qa[k], after: qb[k], delta: (qb[k] ?? 0) - (qa[k] ?? 0) };
  }
  const attributes = {};
  for (const k of ATTRS) if ((a[k] ?? null) !== (b[k] ?? null)) attributes[ATTR_LABEL[k]] = { before: a[k] ?? null, after: b[k] ?? null };
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
  return { quantities, attributes, moved, reshaped, before: qa, after: qb };
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
      const inside = [...many].filter((m) => m.box && volOf(m) != null && (m.storey ?? null) === (one.storey ?? null) && pointInside(boxCentre(m.box), one.box, moveTol));
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

  const changed = [], unchanged = [];
  for (const p of pairs) {
    const c = compareRows(p.a, p.b, tol, moveTol);
    const entry = { ...p, ...c };
    if (Object.keys(c.quantities).length || Object.keys(c.attributes).length || c.moved || c.reshaped) changed.push(entry);
    else unchanged.push(entry);
  }
  const added = [...freeB], removed = [...freeA];
  const reid = pairs.filter((p) => p.how !== "globalId");
  return {
    changed, unchanged, added, removed, groups,
    summary: {
      before: A.length, after: B.length,
      matched: pairs.length, byGlobalId: pairs.length - reid.length, byTag: reid.filter((p) => p.how === "tag").length, byGeometry: reid.filter((p) => p.how === "geometry").length,
      unchanged: unchanged.length, changed: changed.length,
      quantityChanged: changed.filter((c) => Object.keys(c.quantities).length).length,
      attributeChanged: changed.filter((c) => Object.keys(c.attributes).length).length,
      moved: changed.filter((c) => c.moved).length,
      reshaped: changed.filter((c) => c.reshaped).length,
      added: added.length, removed: removed.length,
      merged: groups.filter((g) => g.kind === "merged").length, split: groups.filter((g) => g.kind === "split").length,
      duplicateGlobalIds: { before: dupCount(A), after: dupCount(B) },
    },
  };
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
  const cap = (k) => k[0].toUpperCase() + k.slice(1);
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

const HOW_TEXT = { globalId: "", tag: "new GlobalId, matched by Tag", geometry: "new GlobalId, matched by geometry" };

/** One CSV row per element that is not unchanged. */
export function changesCsv(d) {
  const head = ["Change", "GlobalId before", "GlobalId after", "Class", "Name", "Type", "Storey", "Matched by", "What changed", "Volume m3 before", "Volume m3 after", "Area m2 before", "Area m2 after", "Length m before", "Length m after", "Weight kg before", "Weight kg after", "Moved m"];
  const out = [head.map(csvCell).join(",")];
  const qcells = (qa, qb) => QTY.flatMap((k) => [qa?.[k] ?? null, qb?.[k] ?? null]);
  for (const c of d.changed) {
    const what = [
      ...Object.entries(c.quantities).map(([k, q]) => `${k} ${q.delta > 0 ? "+" : ""}${Math.round(q.delta * 1e4) / 1e4}`),
      ...Object.entries(c.attributes).map(([k, v]) => `${k}: ${v.before ?? "(none)"} -> ${v.after ?? "(none)"}`),
      ...(c.moved ? [`moved ${Math.round(c.moved.distance * 1000) / 1000} m`] : []),
      ...(c.reshaped ? [`box ${c.reshaped.before.map((v) => Math.round(v * 1000) / 1000).join(" x ")} -> ${c.reshaped.after.map((v) => Math.round(v * 1000) / 1000).join(" x ")} m`] : []),
    ].join("; ");
    out.push(["changed", c.a.globalId, c.b.globalId, c.b.ifcClass, c.b.name, c.b.type, c.b.storey, (Object.hasOwn(HOW_TEXT, c.how) ? HOW_TEXT[c.how] : ""), what, ...qcells(c.before, c.after), c.moved ? c.moved.distance : null].map(csvCell).join(","));
  }
  for (const c of d.unchanged) if (c.how !== "globalId") out.push(["same element, new GlobalId", c.a.globalId, c.b.globalId, c.b.ifcClass, c.b.name, c.b.type, c.b.storey, (Object.hasOwn(HOW_TEXT, c.how) ? HOW_TEXT[c.how] : ""), "", ...qcells(c.before, c.after), null].map(csvCell).join(","));
  for (const g of d.groups) {
    const label = g.kind === "merged" ? `merged (${g.before.length} into 1)` : `split (1 into ${g.after.length})`;
    for (const r of g.before) out.push([label, r.globalId, "", r.ifcClass, r.name, r.type, r.storey, "box and volume", `group volume ${Math.round(g.volumeBefore * 1e4) / 1e4} -> ${Math.round(g.volumeAfter * 1e4) / 1e4}`, ...qcells(quantitiesOf(r), null), null].map(csvCell).join(","));
    for (const r of g.after) out.push([label, "", r.globalId, r.ifcClass, r.name, r.type, r.storey, "box and volume", "", ...qcells(null, quantitiesOf(r)), null].map(csvCell).join(","));
  }
  for (const r of d.added) out.push(["added", "", r.globalId, r.ifcClass, r.name, r.type, r.storey, "", "", ...qcells(null, quantitiesOf(r)), null].map(csvCell).join(","));
  for (const r of d.removed) out.push(["removed", r.globalId, "", r.ifcClass, r.name, r.type, r.storey, "", "", ...qcells(quantitiesOf(r), null), null].map(csvCell).join(","));
  return out.join("\r\n") + "\r\n";
}
