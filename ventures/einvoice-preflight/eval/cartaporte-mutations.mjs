// Planted-defect run for the Carta Porte 3.1 checks (cartaporte31.mjs, MX-070..MX-079, and
// MX-003 for the two catalogues kept outside the schema table). Each mutation edits a clean
// waybill once and names the rule that should catch it; a mutation whose pattern is absent
// from a file is skipped, not counted. SAT's error matrix for the complement was not read,
// so each defect is one the XSD's own documentation or a catCartaPorte column describes
// (cartaporte31.mjs says which).
//   node eval/cartaporte-mutations.mjs [file.xml ...]
//   (default: the five fixtures/cfdi-4.0-cp31-*.xml files)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkCfdi } from "../cfdi.mjs";

const sub = (t, re, fn) => (re.test(t) ? t.replace(re, fn) : null);
const attr = (t, el, name, value) => sub(t, new RegExp(`(<cartaporte31:${el}\\b[^>]*?) ${name}="[^"]*"`), (m, open) => (value === null ? open : `${open} ${name}="${value}"`));
const add = (t, el, text) => sub(t, new RegExp(`<cartaporte31:${el}\\b`), (m) => `${m} ${text}`);
const bump = (v) => { const [i, f] = v.split("."); return f === undefined ? String(Number(i) + 1) : `${Number(i) + 1}.${f}`; };

// [name, expected rule, (text) => mutated text or null]
export const MUTATIONS = [
  // MX-070: the document
  ["Carta Porte 3.0 namespace", "MX-070", (t) => sub(t, /http:\/\/www\.sat\.gob\.mx\/CartaPorte31"/, () => 'http://www.sat.gob.mx/CartaPorte30"')],
  ["the complement twice", "MX-070", (t) => sub(t, /(<cartaporte31:CartaPorte [\s\S]*<\/cartaporte31:CartaPorte>)/, (m) => m + m)],
  ["no transport node", "MX-070", (t) => sub(t, /\s*<cartaporte31:(Autotransporte|TransporteMaritimo|TransporteAereo|TransporteFerroviario)\b[\s\S]*?(<\/cartaporte31:\1>|\/>)(?=\s*<\/cartaporte31:Mercancias>)/, () => "")],
  // MX-003: the catalogues outside the schema table
  ["unknown station code", "MX-003", (t) => attr(t, "Ubicacion", "NumEstacion", "ZZ9999")],
  ["unknown UN number", "MX-003", (t) => attr(t, "Mercancia", "CveMaterialPeligroso", "9999")],
  // MX-071: locations
  ["no origin", "MX-071", (t) => sub(t, /TipoUbicacion="Origen"/, () => 'TipoUbicacion="Destino"')],
  ["no destination", "MX-071", (t) => sub(t, /TipoUbicacion="Destino"/g, () => 'TipoUbicacion="Origen"')],
  ["destination id with the origin prefix", "MX-071", (t) => sub(t, /(TipoUbicacion="Destino" IDUbicacion=")DE/, (m, a) => `${a}OR`)],
  ["two locations share an id", "MX-071", (t) => { const ids = [...t.matchAll(/IDUbicacion="(DE\d{6})"/g)].map((m) => m[1]); return ids.length > 1 ? t.replace(`IDUbicacion="${ids[1]}"`, `IDUbicacion="${ids[0]}"`) : null; }],
  ["CantidadTransporta to an unknown destination", "MX-071", (t) => attr(t, "CantidadTransporta", "IDDestino", "DE999999")],
  ["CantidadTransporta from a destination", "MX-071", (t) => { const d = /IDUbicacion="(DE\d{6})"/.exec(t)?.[1]; return d ? attr(t, "CantidadTransporta", "IDOrigen", d) : null; }],
  ["arrival before departure", "MX-071", (t) => sub(t, /(TipoUbicacion="Destino"[^>]*FechaHoraSalidaLlegada=")\d{4}/, (m, a) => `${a}2025`)],
  // MX-072: distances
  ["TotalDistRec not the sum", "MX-072", (t) => sub(t, / TotalDistRec="([\d.]+)"/, (m, v) => ` TotalDistRec="${bump(v)}"`)],
  ["a leg's distance changed", "MX-072", (t) => sub(t, / DistanciaRecorrida="([\d.]+)"/, (m, v) => ` DistanciaRecorrida="${bump(v)}"`)],
  ["TotalDistRec left out", "MX-072", (t) => (/ DistanciaRecorrida=/.test(t) ? attr(t, "CartaPorte", "TotalDistRec", null) : null)],
  // MX-073: goods totals
  ["NumTotalMercancias off by one", "MX-073", (t) => sub(t, / NumTotalMercancias="(\d+)"/, (m, v) => ` NumTotalMercancias="${Number(v) + 1}"`)],
  ["PesoBrutoTotal not the sum", "MX-073", (t) => sub(t, / PesoBrutoTotal="([\d.]+)"/, (m, v) => ` PesoBrutoTotal="${bump(v)}"`)],
  ["a good's PesoEnKg changed", "MX-073", (t) => sub(t, / PesoEnKg="([\d.]+)"/, (m, v) => ` PesoEnKg="${bump(v)}"`)],
  ["PesoNetoTotal not the DetalleMercancia sum", "MX-073", (t) => sub(t, /(<cartaporte31:Mercancia [^>]*?)(\/?)>/, (m, open, self) => `${open}><cartaporte31:DetalleMercancia UnidadPesoMerc="KGM" PesoBruto="10" PesoNeto="9" PesoTara="1"/>${self ? "</cartaporte31:Mercancia>" : ""}`)?.replace(/ PesoBrutoTotal=/, ' PesoNetoTotal="8" PesoBrutoTotal=')],
  // MX-074: stations and permits against the mode
  ["a rail station on another mode's trip", "MX-074", (t) => (/NumEstacion="/.test(t) && !/TransporteFerroviario/.test(t) ? attr(t, "Ubicacion", "NumEstacion", "Q0736") : null)],
  ["an air station on another mode's trip", "MX-074", (t) => (/NumEstacion="/.test(t) && !/TransporteAereo/.test(t) ? attr(t, "Ubicacion", "NumEstacion", "EA0001") : null)],
  ["a road permit on another mode", "MX-074", (t) => sub(t, /(<cartaporte31:Transporte(?:Aereo|Maritimo)\b[^>]*?) PermSCT="[^"]*"/, (m, open) => `${open} PermSCT="TPAF01"`)],
  ["an air permit on a road vehicle", "MX-074", (t) => sub(t, /(<cartaporte31:Autotransporte\b[^>]*?) PermSCT="[^"]*"/, (m, open) => `${open} PermSCT="TPTA01"`)],
  // MX-075: trailers
  ["a semi-trailer configuration without Remolques", "MX-075", (t) => sub(t, /\s*<cartaporte31:Remolques>[\s\S]*?<\/cartaporte31:Remolques>/, () => "")],
  ["a straight truck with Remolques", "MX-075", (t) => (/<cartaporte31:Remolques>/.test(t) ? attr(t, "IdentificacionVehicular", "ConfigVehicular", "C2") : sub(t, /(<cartaporte31:Seguros [^>]*\/>)/, (m) => `${m}<cartaporte31:Remolques><cartaporte31:Remolque SubTipoRem="CTR004" Placa="RM9999Z"/></cartaporte31:Remolques>`))],
  // MX-076: hazardous goods
  ["a hazardous product key marked No", "MX-076", (t) => attr(t, "Mercancia", "MaterialPeligroso", "No")],
  ["a hazardous product key with no MaterialPeligroso", "MX-076", (t) => (/MaterialPeligroso="Sí"/.test(t) ? attr(t, "Mercancia", "MaterialPeligroso", null) : null)],
  ["a may-be-hazardous key without MaterialPeligroso", "MX-076", (t) => sub(t, /(<cartaporte31:Mercancia [^>]*?BienesTransp=")\d{8}"((?![^>]*MaterialPeligroso))/, (m, a) => `${a}10171701"`)],
  ["a non-hazardous key marked No", "MX-076", (t) => sub(t, /(<cartaporte31:Mercancia [^>]*?BienesTransp="(?:43211503|50202306|50221101)")/, (m) => `${m} MaterialPeligroso="No"`)],
  ["hazardous without a UN number", "MX-076", (t) => (/MaterialPeligroso="Sí"/.test(t) ? attr(t, "Mercancia", "CveMaterialPeligroso", null) : null)],
  ["hazardous without packaging", "MX-076", (t) => (/MaterialPeligroso="Sí"/.test(t) ? attr(t, "Mercancia", "Embalaje", null) : null)],
  ["hazardous by road without the environmental insurer", "MX-076", (t) => (/MaterialPeligroso="Sí"/.test(t) ? attr(t, "Seguros", "AseguraMedAmbiente", null) : null)],
  // MX-077: international moves
  ["international without the border fields", "MX-077", (t) => (/TranspInternac="No"/.test(t) ? attr(t, "CartaPorte", "TranspInternac", "Sí") : null)],
  ["international without PaisOrigenDestino", "MX-077", (t) => attr(t, "CartaPorte", "PaisOrigenDestino", null)],
  ["international by sea on a road trip", "MX-077", (t) => (/<cartaporte31:TransporteMaritimo/.test(t) ? null : attr(t, "CartaPorte", "ViaEntradaSalida", "02"))],
  ["international to Mexico", "MX-077", (t) => attr(t, "CartaPorte", "PaisOrigenDestino", "MEX")],
  ["domestic with border fields", "MX-077", (t) => (/TranspInternac="No"/.test(t) ? add(t, "CartaPorte", 'EntradaSalidaMerc="Entrada"') : null)],
  // MX-078: transport figures
  ["a road driver without a licence", "MX-078", (t) => (/<cartaporte31:Autotransporte/.test(t) ? attr(t, "TiposFigura", "NumLicencia", null) : null)],
  ["a figure with no RFC or foreign id", "MX-078", (t) => attr(t, "TiposFigura", "RFCFigura", null)],
  ["a figure with both RFC and foreign id", "MX-078", (t) => (/RFCFigura=/.test(t) ? add(t, "TiposFigura", 'NumRegIdTribFigura="123456789" ResidenciaFiscalFigura="USA"') : null)],
  ["a location's foreign id without its country", "MX-078", (t) => attr(t, "Ubicacion", "ResidenciaFiscal", null)],
  // MX-079: RFC check digits
  ["a location's RFC with a wrong check digit", "MX-079", (t) => sub(t, /RFCRemitenteDestinatario="EKU9003173C9"/, () => 'RFCRemitenteDestinatario="EKU9003173C8"')],
  ["a figure's RFC with a wrong check digit", "MX-079", (t) => sub(t, /RFCFigura="EKU9003173C9"/, () => 'RFCFigura="EKU9003173C8"')],
];

export function runMutations(text) {
  const clean = checkCfdi(text).findings;
  const results = [];
  for (const [name, rule, mutate] of MUTATIONS) {
    const mutated = mutate(text);
    if (mutated === null || mutated === undefined || mutated === text) { results.push({ name, rule, status: "skipped" }); continue; }
    const got = checkCfdi(mutated).findings.map((f) => f.rule);
    results.push({ name, rule, status: got.includes(rule) ? "caught" : "missed", got: [...new Set(got)] });
  }
  return { clean, results };
}

export const SEEDS = ["cfdi-4.0-cp31-road.xml", "cfdi-4.0-cp31-road-intl.xml", "cfdi-4.0-cp31-air.xml", "cfdi-4.0-cp31-rail.xml", "cfdi-4.0-cp31-sea.xml"];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) files.push(...SEEDS.map((f) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url))));
  let caught = 0, ran = 0, cleanTotal = 0;
  const hit = new Set();
  for (const f of files) {
    const { clean, results } = runMutations(readFileSync(f, "utf8"));
    cleanTotal += clean.length;
    console.log(`${f.split("/").pop()}: clean findings ${clean.length ? clean.map((c) => c.rule).join(",") : "none"}`);
    for (const r of results) {
      if (r.status === "skipped") continue;
      ran++;
      if (r.status === "caught") { caught++; hit.add(r.name); } else console.log(`  MISSED ${r.name} (${r.rule}); got ${r.got.join(",") || "nothing"}`);
    }
  }
  console.log(`${caught} of ${ran} planted defects caught by the rule named for them over ${files.length} files (${hit.size} of ${MUTATIONS.length} mutations ran and were caught somewhere); ${cleanTotal} findings on the clean files`);
}
