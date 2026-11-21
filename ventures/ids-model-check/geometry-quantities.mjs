// Quantities read from an element's own geometry, for the model fill
// (model-fill.mjs, opts.geometry) when no quantity set in the model holds
// them. The measuring is ifc-quantity-takeoff's (its qto.mjs takeoff(): the
// body's volume, less its IfcRelVoidsElement openings, and areas cut through
// the body by the planes the standard Qto_ sets define). This file only maps
// its rows onto the Qto_ quantity names they stand for.
//
// Which names are offered, and why (eval/qto-from-geometry-2026-11-21.md
// measures each against the values exporters stored, on the HHS Office
// models):
//   GrossVolume, NetVolume   any element with a body (NetVolume only when
//                            every opening could be cut out)
//   GrossSideArea, NetSideArea, GrossFootprintArea, NetFootprintArea, Width
//                            walls (side: the wall's middle plane; footprint:
//                            the plan at its base; width: its thickness)
//   GrossArea, NetArea       slabs, plates, coverings, roofs (the extruded
//                            profile)
//   CrossSectionArea         columns, beams, members, piles
// Lengths and heights are not offered: Qto_ Length is a centre-line or
// nominal figure the body does not define on its own (a wall's mitred ends,
// a beam's cut-backs), and a computed one would disagree with what the
// exporter means.
//
// Every value is in SI units (m, m2, m3), as the IDS standard reads values.

const WALL = /^IFCWALL/;
const PLAN = /^IFC(SLAB|PLATE|COVERING|ROOF)/;
const CROSS = /^IFC(COLUMN|BEAM|MEMBER|PILE)/;

// [quantity name, quantity kind, class test or null for any, reader(row) -> number|null]
export const GEOMETRY_QUANTITIES = [
  ["GrossVolume", "volume", null, (r) => r.computed.gross],
  ["NetVolume", "volume", null, (r) => r.computed.net],
  ["GrossSideArea", "area", WALL, (r) => r.computed.areas?.side?.gross],
  ["NetSideArea", "area", WALL, (r) => r.computed.areas?.side?.net],
  ["GrossFootprintArea", "area", WALL, (r) => r.computed.areas?.footprint?.gross],
  ["NetFootprintArea", "area", WALL, (r) => r.computed.areas?.footprint?.net],
  ["Width", "length", WALL, (r) => r.computed.areas?.side?.width],
  ["GrossArea", "area", PLAN, (r) => r.computed.areas?.plan?.gross],
  ["NetArea", "area", PLAN, (r) => r.computed.areas?.plan?.net],
  ["CrossSectionArea", "area", CROSS, (r) => r.computed.areas?.cross?.gross],
];

// The IFC quantity class each kind is written as.
export const KIND_CLASS = { volume: "IFCQUANTITYVOLUME", area: "IFCQUANTITYAREA", length: "IFCQUANTITYLENGTH" };

const usable = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/**
 * The quantities each element's geometry gives.
 * @param {Array} rows takeoff(model).rows from ifc-quantity-takeoff/qto.mjs
 * @returns {Map<number, Map<string, {value: number, kind: string}>>} STEP id -> name -> SI value
 */
export function quantitiesFromRows(rows) {
  const out = new Map();
  for (const r of rows) {
    if (!r.computed || r.computed.status !== "ok") continue;
    const A = r.computed.areas;
    const areasOk = A && !A.error && !A.faceted;
    let m = null;
    for (const [name, kind, cls, read] of GEOMETRY_QUANTITIES) {
      if (cls && !cls.test(r.ifcType)) continue;
      if (kind !== "volume" && !areasOk) continue;
      const v = read(r);
      if (!usable(v)) continue;
      if (!m) out.set(r.id, (m = new Map()));
      m.set(name, { value: v, kind });
    }
  }
  return out;
}

/**
 * The model fill's opts.geometry: (element, quantity name, quantity class)
 * -> SI value or undefined.
 */
export function geometryLookup(byId) {
  return (e, name, qclass) => {
    const m = byId.get(e.id);
    const q = m && m.get(name);
    return q && Object.hasOwn(KIND_CLASS, q.kind) && KIND_CLASS[q.kind] === qclass ? q.value : undefined;
  };
}

/**
 * Loads ifc-quantity-takeoff (the sibling folder, in the monorepo and on the
 * site alike, or the URL given) and measures the model. Node or a worker.
 * @param {string|Uint8Array} ifcText the .ifc file's text or bytes
 * @param {{dir?: string|URL}} opts dir: ifc-quantity-takeoff's folder
 */
export async function measureModel(ifcText, opts = {}) {
  const base = opts.dir ? new URL(String(opts.dir).replace(/\/?$/, "/"), import.meta.url) : new URL("../ifc-quantity-takeoff/", import.meta.url);
  const { parseStep } = await import(new URL("step.mjs", base).href);
  const { takeoff } = await import(new URL("qto.mjs", base).href);
  return quantitiesFromRows(takeoff(parseStep(ifcText)).rows);
}
