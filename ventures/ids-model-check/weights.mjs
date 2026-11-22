// Qto_ NetWeight and GrossWeight from each element's volume and its
// material's density, for the model fill (model-fill.mjs opts.geometry, via
// geometry-quantities.mjs measureModel).
//
// Why a density per model, not a table of standard ones: the exporters that
// store weights derive them as volume x a density their own material
// catalogue holds, and offices set those differently. On the public Tekla
// exports (eval/member-weights-2026-11-22.md) every stored NetWeight is the
// element's stored NetVolume times one density per material, to 0.5%: S235JR
// at 8,000 kg/m3 in one office's model and 7,850 in another's, concrete at
// 2,400 or 2,450, timber at 600. A fixed 7,850 would have written 1.9% light
// on every steel part of the first model. So the density comes, in order,
// from:
//   1. the user's table (`densities`: material name -> kg/m3);
//   2. the model's own material properties: Pset_MaterialCommon MassDensity
//      (IFC4 IfcMaterialProperties) or IfcGeneralMaterialProperties
//      MassDensity (IFC2x3), when it is a plausible figure (ARCHICAD writes
//      0 for every material it has no density for);
//   3. the model's own stored weights: a material whose elements that store
//      both a weight and the matching volume all give the same ratio, within
//      0.5%, on at least two elements. Its density is their median, and it
//      fills that material's elements that store no weight.
// A layered or mixed material ("Concrete / Insulation") gets no density
// unless the table names it as written.
//
// The volume is the element's own stored NetVolume (GrossVolume for
// GrossWeight) when it has one, since that is what the exporter weighed, and
// the volume measured from its body otherwise. NetWeight is "the total net
// weight ... taking into account possible processing features (cut-outs,
// etc.) or openings" and GrossWeight the same without them (the Qto_ sets'
// definitions), so net goes with net volume and gross with gross.

export const DENSITY_TOL = 0.005;
export const MIN_AGREEING = 2;
// kg/m3: lighter than this is not a building material's density in SI (or a
// placeholder 0); heavier than lead is a unit slip.
const PLAUSIBLE = [10, 12000];

const num = (v) => (typeof v === "number" ? v : v && typeof v === "object" && typeof v.value === "number" ? v.value : null);
const str = (v) => (typeof v === "string" ? v : v && typeof v === "object" && typeof v.value === "string" ? v.value : null);
const refId = (v) => (v && typeof v === "object" && v.ref !== undefined ? v.ref : null);
const key = (name) => String(name).trim().toLowerCase();
const plausible = (d) => typeof d === "number" && Number.isFinite(d) && d >= PLAUSIBLE[0] && d <= PLAUSIBLE[1];
const median = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** A stored quantity of the row by name (case and space blind), SI. */
function storedQ(r, name, kind) {
  const want = name.toLowerCase();
  for (const [k, q] of Object.entries(r.stored || {})) if (q.kind === kind && k.toLowerCase().replace(/\s+/g, "") === want && q.value > 0) return q.value;
  return null;
}

/**
 * Densities the model carries on its materials, by lower-cased material name.
 * @returns {Map<string, number>} kg/m3
 */
export function modelDensities(model) {
  const out = new Map();
  const E = model.entities;
  const put = (matRef, d) => {
    const m = E.get(refId(matRef));
    const name = m && m.type === "IFCMATERIAL" ? str(m.args[0]) : null;
    if (name && plausible(d) && !out.has(key(name))) out.set(key(name), d);
  };
  for (const e of E.values()) {
    if (e.type === "IFCMATERIALPROPERTIES" && e.args.length >= 4) {
      // IFC4: (Name, Description, Properties, Material)
      if (str(e.args[0]) !== "Pset_MaterialCommon") continue;
      for (const p of e.args[2] || []) {
        const P = E.get(refId(p));
        if (P && P.type === "IFCPROPERTYSINGLEVALUE" && str(P.args[0]) === "MassDensity") put(e.args[3], num(P.args[2]));
      }
    } else if (e.type === "IFCGENERALMATERIALPROPERTIES") {
      // IFC2x3: (Material, MolecularWeight, Porosity, MassDensity)
      put(e.args[0], num(e.args[3]));
    }
  }
  return out;
}

/**
 * Densities learned from elements that store both a weight and its volume.
 * @param {Array} rows ifc-quantity-takeoff rows
 * @returns {{densities: Map<string, number>, materials: Array}} densities by
 *   lower-cased material name; materials: every material seen with its
 *   ratios' count, spread and verdict
 */
export function learnedDensities(rows, { tol = DENSITY_TOL, min = MIN_AGREEING } = {}) {
  const by = new Map();
  for (const r of rows) {
    if (!r.material || r.material.includes(" / ")) continue;
    const ratios = [];
    const nw = storedQ(r, "NetWeight", "weight"), nv = storedQ(r, "NetVolume", "volume");
    const gw = storedQ(r, "GrossWeight", "weight"), gv = storedQ(r, "GrossVolume", "volume");
    if (nw && nv) ratios.push(nw / nv);
    if (gw && gv) ratios.push(gw / gv);
    if (!ratios.length) continue;
    const k = key(r.material);
    if (!by.has(k)) by.set(k, { material: r.material, ratios: [] });
    by.get(k).ratios.push(...ratios);
  }
  const densities = new Map(), materials = [];
  for (const [k, { material, ratios }] of by) {
    const d = median(ratios);
    const agree = ratios.filter((x) => Math.abs(x / d - 1) <= tol).length;
    const ok = ratios.length >= min && agree === ratios.length;
    // Rounded to 0.1 kg/m3: the stored figures carry no finer density.
    if (ok) densities.set(k, Math.round(d * 10) / 10);
    materials.push({ material, ratios: ratios.length, agree, density: Math.round(d * 10) / 10, min: Math.min(...ratios), max: Math.max(...ratios), used: ok, why: ok ? null : ratios.length < min ? `only ${ratios.length} element(s) store a weight and its volume` : `${ratios.length - agree} of ${ratios.length} ratios are more than ${tol * 100}% from the median` });
  }
  return { densities, materials };
}

/**
 * Parses a density table: CSV text ("material,density" per line, a header
 * allowed) or "NAME=VALUE;NAME=VALUE". Values in kg/m3.
 * @returns {Map<string, number>}
 */
export function parseDensities(text) {
  const out = new Map();
  if (!text) return out;
  const s = String(text);
  const items = /[\r\n]/.test(s) || (s.includes(",") && !s.includes("=")) ? s.split(/\r?\n/).map((l) => { const i = l.lastIndexOf(","); return i < 0 ? null : [l.slice(0, i), l.slice(i + 1)]; }) : s.split(";").map((p) => { const i = p.lastIndexOf("="); return i < 0 ? null : [p.slice(0, i), p.slice(i + 1)]; });
  for (const it of items) {
    if (!it) continue;
    const name = it[0].trim().replace(/^"|"$/g, ""), d = Number(it[1].trim().replace(/^"|"$/g, ""));
    if (!name || !Number.isFinite(d) || d <= 0) continue; // a header row, or a blank
    out.set(key(name), d);
  }
  return out;
}

/**
 * Each element's NetWeight and GrossWeight, kg.
 * @param {object} model parseStep model
 * @param {Array} rows ifc-quantity-takeoff rows
 * @param {{densities?: Map<string, number>, learn?: boolean}} opts
 * @returns {{byId: Map<number, {NetWeight?: object, GrossWeight?: object}>, sources: Map<string, {density: number, from: string}>, learned: Array}}
 */
export function memberWeights(model, rows, { densities = new Map(), learn = true } = {}) {
  const fromModel = modelDensities(model);
  const { densities: fromWeights, materials } = learn ? learnedDensities(rows) : { densities: new Map(), materials: [] };
  const sources = new Map();
  const densityOf = (material) => {
    if (!material) return null;
    const k = key(material);
    if (sources.has(k)) return sources.get(k);
    let s = null;
    if (densities.has(k)) s = { density: densities.get(k), from: "table" };
    else if (!material.includes(" / ") && fromModel.has(k)) s = { density: fromModel.get(k), from: "material" };
    else if (!material.includes(" / ") && fromWeights.has(k)) s = { density: fromWeights.get(k), from: "stored-weights" };
    sources.set(k, s);
    return s;
  };
  const byId = new Map();
  for (const r of rows) {
    const s = densityOf(r.material);
    if (!s) continue;
    const ok = r.computed?.status === "ok";
    const nv = storedQ(r, "NetVolume", "volume") ?? (ok ? r.computed.net : null);
    const gv = storedQ(r, "GrossVolume", "volume") ?? (ok ? r.computed.gross : null);
    const m = {};
    if (nv > 0) m.NetWeight = { value: nv * s.density, kind: "weight", density: s.density, from: s.from };
    if (gv > 0) m.GrossWeight = { value: gv * s.density, kind: "weight", density: s.density, from: s.from };
    if (m.NetWeight || m.GrossWeight) byId.set(r.id, m);
  }
  for (const k of [...sources.keys()]) if (!sources.get(k)) sources.delete(k);
  return { byId, sources, learned: materials };
}

/** Merges memberWeights' figures into a quantitiesFromRows map (in place). */
export function addWeights(out, weights) {
  for (const [id, m] of weights.byId) {
    let q = out.get(id);
    if (!q) out.set(id, (q = new Map()));
    for (const [name, v] of Object.entries(m)) q.set(name, { value: v.value, kind: "weight" });
  }
  return out;
}
