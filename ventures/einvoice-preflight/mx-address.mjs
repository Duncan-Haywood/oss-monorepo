// A Mexican postal code's municipality, locality and colonias, from SAT's c_CodigoPostal and
// c_Colonia catalogues (mx-address-data.mjs, built by build-mx-address-data.mjs), and the
// cross-check of an address's coded fields against them. Used by cce20.mjs (SAT's CCE129,
// CCE130 and their receiver and addressee twins) and cartaporte31.mjs.
//
// What the catalogues can and cannot say: c_CodigoPostal lists every code in each state's
// block, and only 32,808 of its 95,748 rows name a municipality (the others are codes not
// in use, with the columns empty), and 12,241 a locality. A column the catalogue leaves
// empty is no constraint here: the check compares only what SAT wrote. c_Colonia lists
// colonias for 32,333 postal codes; a postal code it does not list cannot be checked.

import { CP_MUN, COLONIAS } from "./mx-address-data.mjs";

const n36 = (s) => (s[0] === "_" ? -parseInt(s.slice(1), 36) : parseInt(s, 36));

let MUN = null;
function munTable() {
  if (MUN) return MUN;
  MUN = new Map();
  let cp = 0, cur = null;
  for (const e of CP_MUN.split(" ")) {
    const [gap, estado, municipio, localidad] = e.split(".");
    cp += n36(gap);
    if (estado !== undefined) cur = { estado, municipio, localidad: localidad || "" };
    MUN.set(cp, cur);
  }
  return MUN;
}

let COL = null;
function colTable() {
  if (COL) return COL;
  COL = new Map();
  let cp = 0, last = 0;
  for (const e of COLONIAS.split(" ")) {
    const [gap, runs] = e.split(":");
    cp += gap === "" ? 1 : n36(gap);
    const codes = new Set();
    for (const r of runs.split(".")) {
      const [d, more] = r.split("-");
      const start = last + 1 + n36(d);
      const end = start + (more ? parseInt(more, 36) : 0);
      for (let c = start; c <= end; c++) codes.add(String(c).padStart(4, "0"));
      last = end;
    }
    COL.set(cp, codes);
  }
  return COL;
}

/** {estado, municipio, localidad} c_CodigoPostal gives the postal code, or null when the
 * code is not five digits or its row names no municipality. localidad may be "". */
export function cpInfo(cp) {
  if (!/^\d{5}$/.test(cp || "")) return null;
  return munTable().get(Number(cp)) || null;
}

/** The c_Colonia codes listed for the postal code (a Set of four-digit strings), or null. */
export function cpColonias(cp) {
  if (!/^\d{5}$/.test(cp || "")) return null;
  return colTable().get(Number(cp)) || null;
}

/**
 * Cross-check a Mexican address's coded fields with its postal code. `d` holds the
 * attributes (Estado, Municipio, Localidad, Colonia, CodigoPostal). Returns problems as
 * {field, message, fix}; a field written as text rather than a code (a municipality's name,
 * a colonia's name) is not compared, and `uncoded` lists such fields so a caller can say so.
 */
export function addressProblems(d) {
  const out = [], uncoded = [];
  const cp = d.CodigoPostal;
  const info = cpInfo(cp);
  if (info) {
    if (d.Municipio !== undefined) {
      if (!/^\d{3}$/.test(d.Municipio)) uncoded.push("Municipio");
      else if (d.Estado === info.estado && d.Municipio !== info.municipio) out.push({ field: "Municipio", message: `Municipio ${d.Municipio} is not the municipality of postal code ${cp}: c_CodigoPostal gives ${info.estado} ${info.municipio}.`, fix: `Set Municipio="${info.municipio}", or correct the postal code.` });
    }
    if (d.Localidad !== undefined && info.localidad) {
      if (!/^\d{2}$/.test(d.Localidad)) uncoded.push("Localidad");
      else if (d.Estado === info.estado && d.Localidad !== info.localidad) out.push({ field: "Localidad", message: `Localidad ${d.Localidad} is not the locality of postal code ${cp}: c_CodigoPostal gives ${info.estado} ${info.localidad}.`, fix: `Set Localidad="${info.localidad}", correct the postal code, or leave Localidad out.` });
    }
  }
  if (d.Colonia !== undefined) {
    if (!/^\d{4}$/.test(d.Colonia)) uncoded.push("Colonia");
    else {
      const set = cpColonias(cp);
      if (set && !set.has(d.Colonia)) {
        const list = [...set].slice(0, 5).join(", ");
        out.push({ field: "Colonia", message: `Colonia ${d.Colonia} is not a c_Colonia code of postal code ${cp}, which lists ${set.size} (${list}${set.size > 5 ? ", ..." : ""}).`, fix: `Use one of postal code ${cp}'s colonia codes, or correct the postal code.` });
      }
    }
  }
  return { problems: out, uncoded, known: !!info };
}
