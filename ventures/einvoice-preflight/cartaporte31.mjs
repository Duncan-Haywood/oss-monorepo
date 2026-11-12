// Offline checks for the Carta Porte 3.1 complement (Complemento Carta Porte, namespace
// http://www.sat.gob.mx/CartaPorte31) inside a CFDI 4.0: the waybill a Mexican carrier or
// shipper stamps for goods moving by road, sea, air or rail. Called by cfdi.mjs. Rule ids
// MX-070..MX-079 are this tool's own, not SAT's CPxxx codes: SAT's error matrix for the
// complement was not read (omawww.sat.gob.mx refused the build host on 2026-11-12), so
// every rule below cites what it does rest on.
//
// Sources:
//   CartaPorte31.xsd and catCartaPorte.xsd (phpcfdi/resources-sat-xml, a byte copy of
//   www.sat.gob.mx/sitio_internet/cfd/), read by build-cfdi-schema.mjs into
//   cfdi-xsd-data.mjs for the structure, and their xs:documentation text, which states
//   the sums and links checked here (quoted in each rule's comment);
//   catCartaPorte's spreadsheet columns the XSD does not carry (each station's transport
//   mode, each permit's transport mode, whether a vehicle configuration takes a trailer,
//   whether a product key is hazardous), read by build-cartaporte-data.mjs from
//   phpcfdi/resources-sat-catalogs (public domain) into cartaporte-data.mjs.
//
// Layers:
//   1. the document (MX-070): version 3.1 only, one complement, a transport node;
//   2. the schema via cfdi.mjs's checkNode (MX-002..MX-006), plus the two catalogues kept
//      outside it (c_Estaciones, c_MaterialPeligroso; MX-003);
//   3. locations (MX-071), distances (MX-072), goods totals (MX-073), stations and permits
//      against the transport mode (MX-074), trailers (MX-075), hazardous goods (MX-076),
//      international moves (MX-077), transport figures (MX-078), RFC check digits (MX-079).
// Amounts are compared exactly (BigInt). An offline observation, not SAT's or a PAC's
// acceptance, and not legal or customs advice.

import { dec, show } from "./pagos20.mjs";
import { checkRfc } from "./mexico.mjs";
import { ESTACIONES, SIN_MODO, PELIGROSOS, PROD_MP, CONFIG, PERMISOS } from "./cartaporte-data.mjs";
import { ESTADOS, MUNICIPIOS, LOCALIDADES } from "./cce20-data.mjs";
import { cpEstado } from "./cce20.mjs";
import { addressProblems } from "./mx-address.mjs";

export const CP31_NS = "http://www.sat.gob.mx/CartaPorte31";

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

const childNs = (n, name, ns) => n?.children.find((c) => c.name === name && c.ns === ns);
const kidsNs = (n, name, ns) => (n ? n.children.filter((c) => c.name === name && c.ns === ns) : []);
const P = (n, name) => childNs(n, name, CP31_NS);
const PK = (n, name) => kidsNs(n, name, CP31_NS);

// ---------- packed code sets ----------

const sets = new Map();
/** Unpack {prefix|digits: base-36 gaps} (build-cartaporte-data.mjs) into a Set. */
export function unpack(packed) {
  if (sets.has(packed)) return sets.get(packed);
  const out = new Set();
  for (const [k, gaps] of Object.entries(packed)) {
    const [prefix, w] = k.split("|");
    const width = Number(w);
    let n = -1;
    for (const g of gaps.split(",")) {
      n += parseInt(g, 36);
      out.add(prefix + (width ? String(n).padStart(width, "0") : ""));
    }
  }
  sets.set(packed, out);
  return out;
}

export const MODES = { "01": "Autotransporte", "02": "TransporteMaritimo", "03": "TransporteAereo", "04": "TransporteFerroviario" };
const MODE_NAME = { "01": "road", "02": "sea", "03": "air", "04": "rail" };
// File values index these tables, so "constructor" must not reach Object.prototype.
const own = (o, k) => (k !== undefined && Object.hasOwn(o, k) ? o[k] : undefined);

/** The transport mode (01..04) of a station code, null when the catalogue mirror gives it
 * none, undefined when the code is not in c_Estaciones. */
export function stationMode(code) {
  for (const [mode, packed] of Object.entries(ESTACIONES)) if (unpack(packed).has(code)) return mode;
  return unpack(SIN_MODO).has(code) ? null : undefined;
}
export const isHazardCode = (code) => unpack(PELIGROSOS).has(code);
/** A product key's "Material peligroso" column: "0", "1" or "0,1". */
export function productHazard(code) {
  if (unpack(PROD_MP["1"]).has(code)) return "1";
  if (unpack(PROD_MP["0,1"]).has(code)) return "0,1";
  return "0";
}

const sum = (list) => list.reduce((s, v) => s + v, 0n);
const decimals = (s) => { const t = String(s).trim(); const i = t.indexOf("."); return i < 0 ? 0 : t.length - i - 1; };

// ---------- the checker ----------

/**
 * Check the Carta Porte side of a CFDI. `root` is the parsed cfdi:Comprobante; `ctx` gives
 * cfdi.mjs's helpers: {findings, skipped, checkNode, ELEMENTS, CFDI_NS}.
 */
export function checkCartaPorte(root, ctx) {
  const { findings, skipped, checkNode, ELEMENTS, CFDI_NS, typeProblem } = ctx;
  const complemento = childNs(root, "Complemento", CFDI_NS);
  const all = (complemento?.children || []).filter((c) => c.name === "CartaPorte");
  if (!all.length) return {};
  const base = "/Comprobante/Complemento/CartaPorte";
  const push = (rule, message, fix, path) => findings.push(finding(rule, message, fix, path));

  // ---- 1. the document ----
  const other = all.filter((c) => c.ns !== CP31_NS);
  for (const c of other) {
    const v = /CartaPorte(\d+)$/.exec(c.ns || "")?.[1];
    push("MX-070", `The Carta Porte complement is version ${v ? `${v[0]}.${v.slice(1)}` : "unknown"} (namespace ${c.ns || "none"}); this checker reads 3.1, the version SAT's current schema publishes, and does not read older ones.`,
      "Reissue the waybill with cartaporte31:CartaPorte Version=\"3.1\".", base);
  }
  const cps = all.filter((c) => c.ns === CP31_NS);
  if (!cps.length) return {};
  if (cps.length > 1) push("MX-070", `The CFDI carries ${cps.length} Carta Porte complements; one waybill describes one movement.`, "Keep one cartaporte31:CartaPorte, or issue a CFDI per movement.", base);
  const node = cps[0];
  const h = node.attrs;
  const meta = { waybills: 1 };

  // ---- 2. the schema ----
  checkNode(node, "Comprobante/Complemento/CartaPorte", findings, ELEMENTS.CartaPorte, { ns: CP31_NS, xsd: "CartaPorte31.xsd", strip: "Comprobante/Complemento/" });

  const ubicaciones = PK(P(node, "Ubicaciones"), "Ubicacion");
  const mercancias = P(node, "Mercancias");
  const items = PK(mercancias, "Mercancia");
  const figuras = PK(P(node, "FiguraTransporte"), "TiposFigura");
  const modes = Object.entries(MODES).filter(([, el]) => P(mercancias, el)).map(([m]) => m);
  meta.modes = modes.map((m) => MODE_NAME[m]);
  meta.locations = ubicaciones.length;
  meta.goods = items.length;
  if (mercancias && !modes.length) push("MX-070", "Mercancias names no means of transport: none of Autotransporte, TransporteMaritimo, TransporteAereo or TransporteFerroviario is present.",
    "Add the node for the vehicle, vessel, aircraft or train that moves the goods.", `${base}/Mercancias`);

  // ---- 3. locations ----
  // "TipoUbicacion: ... si el tipo de ubicación corresponde al origen o destino";
  // "IDUbicacion: ... para origen el acrónimo "OR" o para destino el acrónimo "DE" seguido
  // de 6 dígitos"; CantidadTransporta's IDOrigen / IDDestino are "de acuerdo al valor
  // registrado en el atributo IDUbicacion".
  const origins = ubicaciones.filter((u) => u.attrs.TipoUbicacion === "Origen");
  const dests = ubicaciones.filter((u) => u.attrs.TipoUbicacion === "Destino");
  if (ubicaciones.length) {
    if (!origins.length) push("MX-071", "Ubicaciones has no location with TipoUbicacion=\"Origen\"; a movement starts somewhere.", "Mark the place the goods leave from as Origen.", `${base}/Ubicaciones`);
    if (!dests.length) push("MX-071", "Ubicaciones has no location with TipoUbicacion=\"Destino\"; a movement ends somewhere.", "Mark the place the goods arrive at as Destino.", `${base}/Ubicaciones`);
  }
  const ids = new Map();
  ubicaciones.forEach((u, i) => {
    const p = `${base}/Ubicaciones/Ubicacion[${i + 1}]`;
    const id = u.attrs.IDUbicacion, tipo = u.attrs.TipoUbicacion;
    if (id === undefined) return;
    const want = tipo === "Origen" ? "OR" : tipo === "Destino" ? "DE" : null;
    if (want && /^(OR|DE)\d{6}$/.test(id) && !id.startsWith(want)) push("MX-071", `Location ${i + 1} is a${tipo === "Origen" ? "n origin" : " destination"} but its IDUbicacion ${id} starts with ${id.slice(0, 2)}; the schema's note says origins start OR and destinations DE.`,
      `Use ${want}${id.slice(2)}.`, `${p}/@IDUbicacion`);
    if (ids.has(id)) push("MX-071", `IDUbicacion ${id} is used by locations ${ids.get(id).i + 1} and ${i + 1}; each location's id identifies it.`, "Give each location its own six digits.", `${p}/@IDUbicacion`);
    else ids.set(id, { i, tipo });
  });
  items.forEach((m, i) => {
    PK(m, "CantidadTransporta").forEach((ct, j) => {
      const p = `${base}/Mercancias/Mercancia[${i + 1}]/CantidadTransporta[${j + 1}]`;
      for (const [attr, tipo] of [["IDOrigen", "Origen"], ["IDDestino", "Destino"]]) {
        const v = ct.attrs[attr];
        if (v === undefined) continue;
        const hit = ids.get(v);
        if (!hit) push("MX-071", `Goods ${i + 1}: CantidadTransporta's ${attr} ${v} is not the IDUbicacion of any location.`, `Use the IDUbicacion of the ${tipo === "Origen" ? "origin" : "destination"} the quantity ${tipo === "Origen" ? "leaves" : "reaches"}.`, `${p}/@${attr}`);
        else if (hit.tipo !== tipo) push("MX-071", `Goods ${i + 1}: CantidadTransporta's ${attr} ${v} names a location of type ${hit.tipo}, not ${tipo}.`, `Point ${attr} at a location with TipoUbicacion="${tipo}".`, `${p}/@${attr}`);
      }
    });
  });
  // Time: an arrival estimated before the first departure.
  const t = (u) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(u.attrs.FechaHoraSalidaLlegada || "") ? u.attrs.FechaHoraSalidaLlegada : null);
  const firstOut = origins.map(t).filter(Boolean).sort()[0];
  if (firstOut) dests.forEach((u) => {
    const at = t(u);
    if (at && at < firstOut) push("MX-071", `Destination ${u.attrs.IDUbicacion || ""} has an arrival time (${at}) before the first departure (${firstOut}).`.replace("  ", " "),
      "Check the dates: FechaHoraSalidaLlegada is the departure for an origin and the arrival for a destination.", `${base}/Ubicaciones/Ubicacion[${ubicaciones.indexOf(u) + 1}]/@FechaHoraSalidaLlegada`);
  });

  // ---- 3b. distances ----
  // "TotalDistRec: ... la suma de las distancias recorridas, registradas en el atributo
  // DistanciaRecorrida".
  const dist = ubicaciones.map((u) => u.attrs.DistanciaRecorrida).filter((v) => v !== undefined);
  if (h.TotalDistRec !== undefined && dist.length) {
    const vals = dist.map(dec);
    const total = dec(h.TotalDistRec);
    if (total !== null && vals.every((v) => v !== null) && sum(vals) !== total) {
      const d = Math.max(decimals(h.TotalDistRec), ...dist.map(decimals));
      push("MX-072", `TotalDistRec is ${h.TotalDistRec} km but the locations' DistanciaRecorrida add up to ${show(sum(vals), d)} km; the schema defines it as their sum.`,
        `Set TotalDistRec="${show(sum(vals), d)}", or correct the distance that is wrong.`, `${base}/@TotalDistRec`);
    }
  }
  if (h.TotalDistRec === undefined && dist.length) push("MX-072", "Locations carry DistanciaRecorrida but the complement has no TotalDistRec, their sum.", "Add TotalDistRec, the kilometres summed.", `${base}/@TotalDistRec`);

  // ---- 3c. goods totals ----
  if (mercancias) {
    const m = mercancias.attrs;
    // "NumTotalMercancias: ... identificándose por cada nodo Mercancia registrado".
    if (m.NumTotalMercancias !== undefined && /^\d+$/.test(m.NumTotalMercancias) && Number(m.NumTotalMercancias) !== items.length) {
      push("MX-073", `NumTotalMercancias is ${m.NumTotalMercancias} but Mercancias holds ${items.length} Mercancia node${items.length === 1 ? "" : "s"}; the schema counts one per node.`,
        `Set NumTotalMercancias="${items.length}".`, `${base}/Mercancias/@NumTotalMercancias`);
    }
    // "PesoBrutoTotal: ... la suma del peso bruto total estimado de los bienes"; each
    // Mercancia's PesoEnKg is "el peso estimado" in kilograms. Compared only when the
    // total is in kilograms (UnidadPeso KGM).
    const kg = items.map((x) => dec(x.attrs.PesoEnKg));
    const pbt = dec(m.PesoBrutoTotal);
    if (m.UnidadPeso === "KGM" && pbt !== null && items.length && kg.every((v) => v !== null) && sum(kg) !== pbt) {
      const d = Math.max(decimals(m.PesoBrutoTotal), ...items.map((x) => decimals(x.attrs.PesoEnKg)));
      push("MX-073", `PesoBrutoTotal is ${m.PesoBrutoTotal} kg but the goods' PesoEnKg add up to ${show(sum(kg), d)} kg; the schema defines it as their sum.`,
        `Set PesoBrutoTotal="${show(sum(kg), d)}", or correct the weight that is wrong.`, `${base}/Mercancias/@PesoBrutoTotal`);
    } else if (m.UnidadPeso && m.UnidadPeso !== "KGM" && items.length) {
      skipped.push(`MX-073 (PesoBrutoTotal): UnidadPeso is ${m.UnidadPeso}, not KGM, so the total is not compared with the goods' PesoEnKg.`);
    }
    // "PesoNetoTotal: ... la suma de los valores indicados en el atributo PesoNeto del nodo
    // DetalleMercancia".
    const netos = items.map((x) => P(x, "DetalleMercancia")).filter(Boolean).map((d) => dec(d.attrs.PesoNeto));
    const pnt = dec(m.PesoNetoTotal);
    if (pnt !== null && netos.length && netos.every((v) => v !== null) && sum(netos) !== pnt) {
      const d = Math.max(decimals(m.PesoNetoTotal), 3);
      push("MX-073", `PesoNetoTotal is ${m.PesoNetoTotal} but the DetalleMercancia PesoNeto values add up to ${show(sum(netos), d)}; the schema defines it as their sum.`,
        `Set PesoNetoTotal="${show(sum(netos), d)}".`, `${base}/Mercancias/@PesoNetoTotal`);
    }
  }

  // ---- 3d. stations and permits against the mode ----
  // "NumEstacion: ... de acuerdo al valor de la columna Clave identificación del catálogo
  // c_Estaciones ... que permita asociarla al tipo de transporte"; each PermSCT "debe
  // corresponder con" the vehicle, vessel or aircraft "de acuerdo al catálogo".
  let sinModo = 0;
  ubicaciones.forEach((u, i) => {
    const code = u.attrs.NumEstacion;
    if (code === undefined) return;
    const p = `${base}/Ubicaciones/Ubicacion[${i + 1}]/@NumEstacion`;
    const mode = stationMode(code);
    if (mode === undefined) { push("MX-003", `NumEstacion on Ubicacion ${code} is not a code in SAT's catalogue (c_Estaciones).`, "Correct NumEstacion to a value CartaPorte31.xsd accepts.", p); return; }
    if (mode === null) { sinModo++; return; }
    if (modes.length && !modes.includes(mode)) push("MX-074", `Location ${i + 1}'s station ${code} is a ${MODE_NAME[mode]} station in c_Estaciones, but the goods move by ${modes.map((x) => MODE_NAME[x]).join(" and ")}.`,
      `Use a station of the transport mode, or add the ${MODES[mode]} node if part of the trip is by ${MODE_NAME[mode]}.`, p);
  });
  if (sinModo) skipped.push(`MX-074 (stations): ${sinModo} station code${sinModo === 1 ? " is" : "s are"} in catCartaPorte.xsd but have no transport mode in the catalogue copy read, so the mode is not compared.`);
  for (const mode of modes) {
    const tn = P(mercancias, MODES[mode]);
    const perm = tn?.attrs.PermSCT;
    const permModes = own(PERMISOS, perm);
    if (permModes === undefined) continue;
    if (!permModes.split(",").includes(mode)) push("MX-074", `${MODES[mode]}'s PermSCT ${perm} is a ${permModes.split(",").map((x) => own(MODE_NAME, x)).join("/")} permit in c_TipoPermiso, not a ${MODE_NAME[mode]} one.`,
      `Use the ${MODE_NAME[mode]} permit the carrier holds (c_TipoPermiso, Clave transporte ${mode}).`, `${base}/Mercancias/${MODES[mode]}/@PermSCT`);
  }

  // ---- 3e. trailers ----
  // c_ConfigAutotransporte's "Remolque" column: 1 the configuration has a trailer, 0 it
  // has none, "0, 1" either.
  const auto = P(mercancias, "Autotransporte");
  if (auto) {
    const cfg = P(auto, "IdentificacionVehicular")?.attrs.ConfigVehicular;
    const rem = P(auto, "Remolques");
    const flag = own(CONFIG, cfg);
    if (flag === "1" && !rem) push("MX-075", `ConfigVehicular ${cfg} is a configuration with a trailer or semi-trailer in c_ConfigAutotransporte, but Autotransporte has no Remolques.`,
      "Add Remolques with each trailer's SubTipoRem and Placa, or use the configuration actually driven.", `${base}/Mercancias/Autotransporte/Remolques`);
    if (flag === "0" && rem) push("MX-075", `ConfigVehicular ${cfg} is a configuration without a trailer in c_ConfigAutotransporte, but Autotransporte lists Remolques.`,
      "Remove Remolques, or use the configuration with the trailer (for example T3S2 rather than C3).", `${base}/Mercancias/Autotransporte/Remolques`);
  }

  // ---- 3f. hazardous goods ----
  // c_ClaveProdServCP's "Material peligroso" column: 1 the product is hazardous, "0,1" it
  // may be, 0 it is not. CveMaterialPeligroso and Embalaje are for goods marked "Sí";
  // AseguraMedAmbiente / PolizaMedAmbiente: "cuando exista al menos una mercancía
  // tipificada como material peligroso se debe registrar".
  let anyHazard = false;
  items.forEach((x, i) => {
    const a = x.attrs, p = `${base}/Mercancias/Mercancia[${i + 1}]`;
    const flag = productHazard(a.BienesTransp);
    const mp = a.MaterialPeligroso;
    if (mp === "Sí") anyHazard = true;
    if (flag === "1" && mp !== "Sí") push("MX-076", `Goods ${i + 1}: BienesTransp ${a.BienesTransp} is hazardous in c_ClaveProdServCP (Material peligroso 1), so MaterialPeligroso is "Sí"${mp === undefined ? "; it is missing" : `, not "${mp}"`}.`,
      "Set MaterialPeligroso=\"Sí\" with CveMaterialPeligroso and Embalaje.", `${p}/@MaterialPeligroso`);
    if (flag === "0,1" && mp === undefined) push("MX-076", `Goods ${i + 1}: BienesTransp ${a.BienesTransp} may be hazardous (c_ClaveProdServCP Material peligroso "0,1"), so MaterialPeligroso says which: "Sí" or "No".`,
      "Add MaterialPeligroso.", `${p}/@MaterialPeligroso`);
    if (flag === "0" && mp !== undefined) push("MX-076", `Goods ${i + 1}: BienesTransp ${a.BienesTransp} is not hazardous in c_ClaveProdServCP (Material peligroso 0), so MaterialPeligroso is left out.`,
      "Remove MaterialPeligroso, or check the product key.", `${p}/@MaterialPeligroso`);
    if (mp === "Sí") {
      if (a.CveMaterialPeligroso === undefined) push("MX-076", `Goods ${i + 1} are marked hazardous but have no CveMaterialPeligroso (the UN number under NOM-002-SCT/2011).`, "Add CveMaterialPeligroso from c_MaterialPeligroso.", `${p}/@CveMaterialPeligroso`);
      if (a.Embalaje === undefined) push("MX-076", `Goods ${i + 1} are marked hazardous but have no Embalaje (the packaging the hazardous material needs).`, "Add Embalaje from c_TipoEmbalaje.", `${p}/@Embalaje`);
    } else if (flag !== "1") { // on a hazardous key the fault is the MaterialPeligroso value, said above
      for (const k of ["CveMaterialPeligroso", "Embalaje", "DescripEmbalaje"]) if (a[k] !== undefined) push("MX-076", `Goods ${i + 1}: ${k} is filled though MaterialPeligroso is ${mp === undefined ? "absent" : `"${mp}"`}; it describes hazardous goods only.`, `Remove ${k}, or set MaterialPeligroso="Sí".`, `${p}/@${k}`);
    }
    if (a.CveMaterialPeligroso !== undefined && !isHazardCode(a.CveMaterialPeligroso)) push("MX-003", `CveMaterialPeligroso on Mercancia ${a.CveMaterialPeligroso} is not a code in SAT's catalogue (c_MaterialPeligroso).`, "Correct CveMaterialPeligroso to a value CartaPorte31.xsd accepts.", `${p}/@CveMaterialPeligroso`);
  });
  meta.hazardous = anyHazard;
  if (anyHazard && auto) {
    const seg = P(auto, "Seguros")?.attrs || {};
    for (const k of ["AseguraMedAmbiente", "PolizaMedAmbiente"]) if (seg[k] === undefined) push("MX-076", `At least one good is hazardous and it moves by road, so Seguros needs ${k} (the environmental-damage insurer and policy).`, `Add ${k} to Autotransporte/Seguros.`, `${base}/Mercancias/Autotransporte/Seguros/@${k}`);
  }

  // ---- 3g. international moves ----
  // TranspInternac: whether the goods "ingresan o salen del territorio nacional";
  // EntradaSalidaMerc, PaisOrigenDestino and ViaEntradaSalida describe that entry or exit.
  const intl = h.TranspInternac;
  const border = ["EntradaSalidaMerc", "PaisOrigenDestino", "ViaEntradaSalida"];
  if (intl === "Sí") {
    for (const k of border) if (h[k] === undefined) push("MX-077", `TranspInternac is "Sí" (the goods cross the border) but ${k} is missing.`, `Add ${k}.`, `${base}/@${k}`);
    const via = own(MODE_NAME, h.ViaEntradaSalida);
    if (via && modes.length && !modes.includes(h.ViaEntradaSalida)) push("MX-077", `ViaEntradaSalida is ${h.ViaEntradaSalida} (${via}) but the complement describes no ${via} transport.`,
      "Set ViaEntradaSalida to the mode that crosses the border, or add its transport node.", `${base}/@ViaEntradaSalida`);
    if (h.PaisOrigenDestino === "MEX") push("MX-077", "PaisOrigenDestino is MEX, but on an international move it is the foreign country the goods come from or go to.", "Set PaisOrigenDestino to that country's c_Pais code.", `${base}/@PaisOrigenDestino`);
  } else if (intl === "No") {
    for (const k of border) if (h[k] !== undefined) push("MX-077", `${k} is filled though TranspInternac is "No" (the goods stay in Mexico).`, `Remove ${k}, or set TranspInternac="Sí".`, `${base}/@${k}`);
    if (P(node, "RegimenesAduaneros")) push("MX-077", "RegimenesAduaneros is present though TranspInternac is \"No\"; customs regimes describe goods entering or leaving Mexico.", "Remove RegimenesAduaneros, or set TranspInternac=\"Sí\".", `${base}/RegimenesAduaneros`);
  }

  // ---- 3h. transport figures ----
  // NumLicencia: "la licencia o el permiso otorgado al operador del autotransporte";
  // NumRegIdTribFigura "cuando se trate de residentes en el extranjero".
  figuras.forEach((f, i) => {
    const a = f.attrs, p = `${base}/FiguraTransporte/TiposFigura[${i + 1}]`;
    if (a.TipoFigura === "01" && auto && a.NumLicencia === undefined) push("MX-078", `Figure ${i + 1} is the driver (TipoFigura 01) of a road movement but has no NumLicencia.`, "Add the driver's federal licence number.", `${p}/@NumLicencia`);
    if (a.RFCFigura === undefined && a.NumRegIdTribFigura === undefined) push("MX-078", `Figure ${i + 1} has neither RFCFigura nor NumRegIdTribFigura; one identifies them.`, "Add the RFC, or for a foreign resident the foreign tax id with ResidenciaFiscalFigura.", p);
    if (a.RFCFigura !== undefined && a.NumRegIdTribFigura !== undefined) push("MX-078", `Figure ${i + 1} has both an RFC and a foreign tax id; the foreign id is for a figure with no RFC who resides abroad.`, "Keep RFCFigura and remove NumRegIdTribFigura and ResidenciaFiscalFigura, or the other way round.", `${p}/@NumRegIdTribFigura`);
    if (a.NumRegIdTribFigura !== undefined && a.ResidenciaFiscalFigura === undefined) push("MX-078", `Figure ${i + 1} has a foreign tax id but no ResidenciaFiscalFigura, the country that issued it.`, "Add ResidenciaFiscalFigura (c_Pais).", `${p}/@ResidenciaFiscalFigura`);
  });
  ubicaciones.forEach((u, i) => {
    const a = u.attrs, p = `${base}/Ubicaciones/Ubicacion[${i + 1}]`;
    if (a.NumRegIdTrib !== undefined && a.ResidenciaFiscal === undefined) push("MX-078", `Location ${i + 1} has a foreign tax id (NumRegIdTrib) but no ResidenciaFiscal, the country that issued it.`, "Add ResidenciaFiscal (c_Pais).", `${p}/@ResidenciaFiscal`);
  });

  // ---- 3j. Mexican addresses against the postal-code catalogues ----
  // A Domicilio in Mexico (Pais MEX) on a location or a transport figure: Estado, Municipio
  // and Localidad as c_Estado, c_Municipio and c_Localidad codes of that state, the postal
  // code in c_CodigoPostal and in that state, and, where SAT's catalogues fill the column,
  // the postal code's municipality, locality and colonias (mx-address.mjs). The same
  // cross-references SAT's Comercio Exterior matrix checks on the same catalogues (CCE126 to
  // CCE130); Carta Porte's own matrix was not read, so this rests on that and on the
  // schema's notes ("la clave de la colonia", "conforme con el catálogo c_Pais"). A field
  // written as a name rather than a code is not compared and is named in `skipped`.
  const doms = [
    ...ubicaciones.map((u, i) => [P(u, "Domicilio"), `Location ${i + 1}`, `${base}/Ubicaciones/Ubicacion[${i + 1}]/Domicilio`]),
    ...figuras.map((f, i) => [P(f, "Domicilio"), `Figure ${i + 1}`, `${base}/FiguraTransporte/TiposFigura[${i + 1}]/Domicilio`]),
  ];
  const uncoded = new Set();
  for (const [dom, who, p] of doms) {
    if (!dom || dom.attrs.Pais !== "MEX") continue;
    const d = dom.attrs;
    if (d.Estado !== undefined && !(ESTADOS.MEX || []).includes(d.Estado)) {
      push("MX-080", `${who}'s address is in Mexico but Estado "${d.Estado}" is not a c_Estado code.`, "Use the three-letter c_Estado code (for example NLE, JAL, CMX).", `${p}/@Estado`);
      continue;
    }
    if (d.Municipio !== undefined && /^\d{3}$/.test(d.Municipio) && !(MUNICIPIOS[d.Estado] || "").split(" ").includes(d.Municipio)) push("MX-080", `${who}: Municipio ${d.Municipio} is not a c_Municipio code of ${d.Estado}.`, `Use the municipality's three-digit code within ${d.Estado}.`, `${p}/@Municipio`);
    if (d.Localidad !== undefined && /^\d{2}$/.test(d.Localidad) && !(LOCALIDADES[d.Estado] || "").split(" ").includes(d.Localidad)) push("MX-080", `${who}: Localidad ${d.Localidad} is not a c_Localidad code of ${d.Estado}.`, `Use the locality's two-digit code within ${d.Estado}, or leave Localidad out.`, `${p}/@Localidad`);
    const cp = d.CodigoPostal;
    if (cp === undefined) continue;
    const st = cpEstado(cp);
    if (!/^\d{5}$/.test(cp) || typeProblem({ ref: "c_CodigoPostal" }, cp)) { push("MX-080", `${who}: CodigoPostal "${cp}" is not a Mexican postal code in c_CodigoPostal.`, "Use the address's five-digit postal code.", `${p}/@CodigoPostal`); continue; }
    if (st && st !== d.Estado) { push("MX-080", `${who}: CodigoPostal ${cp} belongs to ${st} in c_CodigoPostal, not to Estado ${d.Estado}.`, "Correct the postal code or the state.", `${p}/@CodigoPostal`); continue; }
    const r = addressProblems(d);
    for (const q of r.problems) push("MX-080", `${who}: ${q.message}`, q.fix, `${p}/@${q.field}`);
    for (const f of r.uncoded) uncoded.add(f);
  }
  if (uncoded.size) skipped.push(`MX-080 (addresses): ${[...uncoded].join(", ")} written as a name rather than a SAT catalogue code, so not compared with the postal code.`);

  // ---- 3i. RFC check digits ----
  const rfcs = [
    ...ubicaciones.map((u, i) => [u.attrs.RFCRemitenteDestinatario, `Location ${i + 1}'s RFCRemitenteDestinatario`, `${base}/Ubicaciones/Ubicacion[${i + 1}]/@RFCRemitenteDestinatario`]),
    ...figuras.map((f, i) => [f.attrs.RFCFigura, `Figure ${i + 1}'s RFCFigura`, `${base}/FiguraTransporte/TiposFigura[${i + 1}]/@RFCFigura`]),
  ];
  for (const [rfc, who, p] of rfcs) {
    if (!rfc || !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) continue;
    const r = checkRfc(rfc);
    if (!r.ok && r.kind) push("MX-079", `${who}: the check digit does not match the rest of the RFC; a character is probably mistyped.`,
      "Copy the RFC from the party's Constancia de Situación Fiscal. A few RFCs SAT issued carry a digit that fails this test, so confirm before changing it.", p);
  }
  return meta;
}
