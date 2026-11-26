// Reads what the AEAT sends back for a VERI*FACTU submission: the
// RespuestaRegFactuSistemaFacturacion (EstadoEnvio Correcto, ParcialmenteCorrecto or
// Incorrecto, and one RespuestaLinea per record with EstadoRegistro, CodigoErrorRegistro
// and DescripcionErrorRegistro), alone or in its SOAP envelope, and the SOAP fault whose
// faultstring carries "Codigo[nnnn]" when the whole submission is refused.
//
// Every code is looked up in the AEAT's own list (errores.properties, 247 codes, read
// from prewww2.aeat.es on 2026-11-15; verifactu-errors-data.mjs) and mapped to the
// rules of this tool (verifactu.mjs, VF-001 to VF-047) that catch the same fault before
// sending, or to the reason no file-only check can (the AEAT census, its own records,
// its clock, the certificate). When the records sent are in the same batch, each
// response line is paired with its record by IDFactura (issuer, number, date) and the
// code is marked reproduced or not by this checker on that record.
//
// This reads what the AEAT said; it is not the AEAT and not tax advice. Long digit runs
// in the AEAT's text are withheld from the findings.
import { parseXmlTree } from "./ubl.mjs";
import { AEAT_ERRORS } from "./verifactu-errors-data.mjs";
import { chainFindings, idText as recordLabel, recordFindings } from "./verifactu.mjs";

const local = (name) => String(name || "").replace(/^[^:]*:/, "");
const kids = (node, name) => (node?.children || []).filter((c) => local(c.name) === name);
const kid = (node, name) => kids(node, name)[0] || null;
const decode = (s) => String(s ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const val = (node, ...path) => {
  let cur = node;
  for (const p of path) { cur = kid(cur, p); if (!cur) return null; }
  return decode(cur.text || "").trim();
};
function find(node, name) {
  if (local(node.name) === name) return node;
  for (const c of node.children || []) { const f = find(c, name); if (f) return f; }
  return null;
}
const withhold = (s) => String(s ?? "").replace(/\d{8,}/g, "[number withheld]").replace(/\s+/g, " ").trim();

// Why no file-only check can see a code: by what the AEAT checks it against.
const CENSUS = "the AEAT checks it against its census of taxpayers, which no file-only check can see";
const RECORDS = "the AEAT checks it against the records it already holds";
const TECH = "it is a fault on the AEAT's side or in the connection; send again later";
const HEADER = "it concerns the submission's header, certificate or permissions, which this tool does not read";
const SCHEMA = "it is a schema check; this tool does not run AEAT's XSD, though its record rules catch many missing or malformed fields";
const QUERY = "it concerns a query to the AEAT, not a record sent";

// AEAT code -> rules of this tool. offline: "yes" (the rule checks the same thing),
// "partly" (a shape or check digit, or one half of the AEAT's condition) or "no" (with
// `why`). `en` is an English paraphrase of the AEAT's Spanish text.
const M = (rules, offline, en, why) => ({ rules, offline, en, ...(why ? { why } : {}) });
export const AEAT_CODE_RULES = {
  "4102": M([], "no", "The XML does not follow the schema: a required field is missing.", SCHEMA),
  "4103": M([], "no", "The XML could not be parsed.", SCHEMA),
  "4113": M([], "no", "More records in a block than the schema allows.", SCHEMA),
  "4114": M([], "no", "More invoices in one submission than allowed (1,000).", SCHEMA),
  "4119": M([], "no", "Characters that are not UTF-8.", SCHEMA),
  "4141": M([], "no", "Access to VERI*FACTU suspended: contact verifactu@correo.aeat.es.", HEADER),
  "1100": M([], "no", "Wrong value or type in a field (the AEAT's text names it).", SCHEMA),
  "1104": M([], "no", "NumSerieFactura is wrong.", SCHEMA),
  "1105": M(["VF-009"], "yes", "FechaExpedicionFactura is wrong."),
  "1106": M(["VF-011"], "yes", "TipoFactura is not one of the allowed values."),
  "1107": M(["VF-013"], "yes", "TipoRectificativa is wrong."),
  "1109": M(["VF-019"], "partly", "The NIF is not in the AEAT census.", CENSUS),
  "1110": M(["VF-019"], "partly", "The NIF is not in the AEAT census.", CENSUS),
  "1112": M(["VF-024"], "partly", "The issue date is later than today.", "the AEAT compares it with its own date; this tool compares it with the record's generation time"),
  "1114": M(["VF-013"], "yes", "A corrective invoice needs TipoRectificativa."),
  "1115": M(["VF-013"], "yes", "TipoRectificativa on an invoice that is not corrective."),
  "1116": M(["VF-025"], "yes", "FacturasSustituidas only on an F3."),
  "1117": M(["VF-013"], "yes", "FacturasRectificadas on an invoice that is not corrective."),
  "1118": M(["VF-014"], "yes", "A corrective invoice by substitution needs ImporteRectificacion."),
  "1119": M(["VF-014"], "yes", "ImporteRectificacion on an invoice that is not a correction by substitution."),
  "1121": M(["VF-019"], "partly", "The ID is not in the AEAT census.", CENSUS),
  "1122": M(["VF-023"], "yes", "CodigoPais does not match the first two characters of the VAT number."),
  "1123": M(["VF-019"], "yes", "The NIF's format is wrong (the AEAT also raises it for RegistroAnterior's issuer)."),
  "1126": M(["VF-023"], "partly", "CodigoPais ES only with IDType 03 (passport) or 07 (not in the census), and 07 needs ES."),
  "1136": M(["VF-037"], "yes", "FacturaSimplificadaArticulos7273 takes N or S."),
  "1137": M(["VF-030"], "yes", "Macrodato takes N or S."),
  "1138": M(["VF-030"], "yes", "Macrodato S only when ImporteTotal is 100,000,000 or more."),
  "1139": M(["VF-030"], "yes", "ImporteTotal of 100,000,000 or more needs Macrodato S."),
  "1140": M(["VF-035"], "yes", "CuotaRepercutida and BaseImponibleACoste must have the same sign."),
  "1142": M(["VF-017"], "yes", "CuotaRepercutida does not match the base and rate."),
  "1143": M(["VF-035"], "yes", "CuotaRepercutida and BaseImponibleOimporteNoSujeto must have the same sign."),
  "1145": M(["VF-009"], "yes", "A date's format is wrong."),
  "1147": M(["VF-038"], "yes", "Regime 14 needs FechaOperacion, later than the issue date."),
  "1148": M(["VF-038"], "yes", "Regime 14 only on F1 or R1-R4."),
  "1149": M([], "no", "Regime 14: the buyer's NIF must be in the census and start with P, Q, S or V.", CENSUS),
  "1150": M(["VF-031"], "yes", "An F2 without a billing agreement or the art. 61d flag cannot exceed 3,000."),
  "1151": M(["VF-041"], "yes", "EmitidaPorTerceroODestinatario takes T or D."),
  "1152": M(["VF-029"], "yes", "The issue date cannot be before 28 October 2024."),
  "1153": M(["VF-020"], "yes", "RechazoPrevio X only with Subsanacion S."),
  "1154": M(["VF-019"], "partly", "The corrected invoice's issuer NIF is not in the census.", CENSUS),
  "1155": M(["VF-041"], "yes", "A Tercero block without EmitidaPorTerceroODestinatario."),
  "1156": M(["VF-039"], "yes", "A buyer by NIF-IVA (IDType 02) only on F1, F3, R1-R4."),
  "1158": M(["VF-041"], "yes", "EmitidaPorTerceroODestinatario without its block."),
  "1159": M(["VF-041"], "yes", "A Tercero block when the record says the recipient issued it."),
  "1160": M(["VF-032"], "yes", "At 5% VAT the surcharge is 0.5 or 0.62."),
  "1161": M(["VF-020"], "yes", "RechazoPrevio S needs Subsanacion S."),
  "1162": M(["VF-032"], "yes", "At 21% VAT the surcharge is 5.2 or 1.75."),
  "1163": M(["VF-032"], "yes", "At 10% VAT the surcharge is 1.4."),
  "1164": M(["VF-032"], "yes", "At 4% VAT the surcharge is 0.5."),
  "1165": M(["VF-032"], "yes", "At 0% VAT the surcharge is 0 between 1 January 2023 and 30 September 2024."),
  "1166": M(["VF-032"], "yes", "At 2% VAT (October to December 2024) the surcharge is 0.26."),
  "1167": M(["VF-032"], "yes", "At 5% VAT the surcharge is 0.5 from 1 July to 31 December 2022."),
  "1168": M(["VF-032"], "yes", "At 5% VAT the surcharge is 0.62 from 1 January 2023 to 30 September 2024."),
  "1169": M(["VF-032"], "yes", "At 7.5% VAT (October to December 2024) the surcharge is 1."),
  "1170": M(["VF-032"], "yes", "At 0% VAT from 1 October 2024 the surcharge is 0.26."),
  "1171": M(["VF-020"], "partly", "Subsanacion or RechazoPrevio has a value outside the list."),
  "1174": M(["VF-009"], "yes", "RegistroAnterior's FechaExpedicionFactura is wrong."),
  "1176": M(["VF-019"], "partly", "The SistemaInformatico NIF is wrong.", "this tool checks its shape only"),
  "1181": M(["VF-027"], "yes", "CalificacionOperacion has a wrong value."),
  "1182": M(["VF-027", "VF-038"], "yes", "OperacionExenta has a wrong value (E7, E8 under IGIC only)."),
  "1180": M(["VF-004"], "partly", "Error in the Encadenamiento block (the AEAT's text says which)."),
  "1183": M(["VF-037"], "yes", "FacturaSimplificadaArticulos7273 S only on F1, F3 or R1-R4."),
  "1184": M(["VF-037"], "yes", "FacturaSinIdentifDestinatarioArt61d takes S or N."),
  "1185": M(["VF-037"], "yes", "FacturaSinIdentifDestinatarioArt61d S only on F2 or R5."),
  "1186": M(["VF-041"], "yes", "EmitidaPorTerceroODestinatario T needs the Tercero block."),
  "1187": M(["VF-041"], "yes", "The Tercero block only with EmitidaPorTerceroODestinatario T."),
  "1188": M(["VF-041"], "yes", "The third party's NIF must differ from the issuer's."),
  "1189": M(["VF-012"], "yes", "F1, F3 and R1-R4 need Destinatarios."),
  "1190": M(["VF-012"], "yes", "F2 and R5 carry no Destinatarios."),
  "1191": M(["VF-039"], "yes", "An R3's buyer by NIF or IDType 07 only."),
  "1192": M(["VF-039"], "yes", "An R2's buyer by NIF, IDType 02 or 07 only."),
  "1193": M(["VF-040"], "partly", "A buyer's NIF must be in the census and differ from the issuer's.", CENSUS),
  "1195": M(["VF-027"], "yes", "A line needs OperacionExenta or CalificacionOperacion."),
  "1196": M(["VF-027"], "yes", "OperacionExenta and CalificacionOperacion exclude each other."),
  "1197": M(["VF-034"], "yes", "S2 (reverse charge) only on F1, F3 or R1-R4."),
  "1198": M(["VF-034"], "yes", "S2 lines carry TipoImpositivo and CuotaRepercutida 0."),
  "1199": M(["VF-038"], "yes", "Regime 01 VAT or IGIC lines cannot be exempt E2 or E3."),
  "1200": M(["VF-038"], "yes", "Regime 03 lines are S1."),
  "1201": M(["VF-038"], "yes", "Regime 04 lines are S2 or exempt."),
  "1202": M(["VF-038"], "yes", "Regime 06: not on F2, F3 or R5, and BaseImponibleACoste is required."),
  "1203": M(["VF-038"], "yes", "Regime 07 excludes E2-E5, S2, N1 and N2."),
  "1205": M(["VF-038"], "yes", "Regime 10: N1, an F1 and a buyer identified by NIF."),
  "1206": M(["VF-038"], "yes", "Regime 11 VAT lines at 21%."),
  "1207": M(["VF-034", "VF-018"], "yes", "CuotaRepercutida other than 0 only on S1 lines."),
  "1208": M(["VF-018"], "yes", "An S1 line without BaseImponibleACoste needs TipoImpositivo and CuotaRepercutida."),
  "1210": M(["VF-016"], "yes", "ImporteTotal does not match the bases, tax and surcharge."),
  "1211": M(["VF-041"], "yes", "The third party cannot be IDType 07."),
  "1216": M(["VF-015"], "yes", "CuotaTotal does not match the tax and surcharge."),
  "1237": M(["VF-018"], "yes", "N1 or N2 VAT lines carry no rate, tax or surcharge."),
  "1238": M(["VF-018"], "yes", "Exempt lines carry no rate, tax or surcharge."),
  "1244": M(["VF-010"], "yes", "FechaHoraHusoGenRegistro's format is wrong."),
  "1245": M(["VF-038"], "yes", "VAT or IGIC lines need ClaveRegimen."),
  "1247": M(["VF-003"], "yes", "TipoHuella is wrong."),
  "1252": M(["VF-038"], "yes", "Regime 08 lines carry N2."),
  "1257": M(["VF-038"], "yes", "BaseImponibleACoste only with regime 06 or tax 02 or 05."),
  "1260": M(["VF-038"], "yes", "ClaveRegimen only on VAT or IGIC lines."),
  "1262": M(["VF-002"], "yes", "The fingerprint's length is wrong."),
  "1263": M(["VF-003"], "yes", "TipoHuella's length is wrong."),
  "1264": M(["VF-004"], "yes", "PrimerRegistro's length is wrong."),
  "1265": M(["VF-011"], "yes", "TipoFactura's length is wrong."),
  "1266": M(["VF-021"], "yes", "CuotaTotal's length is wrong."),
  "1267": M(["VF-021"], "yes", "ImporteTotal's length is wrong."),
  "1268": M(["VF-010"], "yes", "FechaHoraHusoGenRegistro's length is wrong."),
  "1269": M(["VF-004"], "yes", "RegistroAnterior is not filled in correctly."),
  "1274": M(["VF-004"], "yes", "PrimerRegistro has a wrong value."),
  "1275": M(["VF-020"], "partly", "RechazoPrevio has a wrong value."),
  "1277": M(["VF-032"], "yes", "Wrong surcharge rate beside 0% VAT."),
  "1281": M(["VF-033"], "yes", "The surcharge only on S1 lines."),
  "1284": M(["VF-033"], "yes", "Surcharge rate and amount go together."),
  "1286": M(["VF-038"], "yes", "Regime 02 VAT or IGIC lines are exempt only (OperacionExenta)."),
  "1287": M(["VF-042"], "yes", "A field contains a character the AEAT refuses (< > \" ' =)."),
  "1289": M(["VF-038"], "yes", "E5 VAT lines: the buyer is identified by IDOtro only."),
  "1291": M(["VF-002"], "yes", "The previous record's fingerprint is not alphanumeric."),
  "1292": M(["VF-002"], "yes", "The fingerprint is not alphanumeric."),
  "1293": M(["VF-038"], "yes", "Regime 20 lines carry N2."),
  "1101": M(["VF-043"], "yes", "CodigoPais is not in the AEAT's country list."),
  "1111": M(["VF-043"], "yes", "CodigoPais is required unless IDType is 02 (VAT number)."),
  "1124": M(["VF-045"], "yes", "TipoImpositivo is not in the list of allowed rates (0, 2, 4, 5, 7.5, 10, 21 on an S1 VAT line; rule 15.1 of the AEAT's validation document)."),
  "1127": M(["VF-032"], "yes", "TipoRecargoEquivalencia is not in the list of allowed rates (0, 0.26, 0.5, 0.62, 1, 1.4, 1.75, 5.2; rule 15.3)."),
  "1135": M(["VF-032"], "partly", "This surcharge rate is allowed only for dates up to 2012.", "the AEAT's text does not name the rate; the rule takes it as 4%, the surcharge beside 16% and 18% VAT, the one old rate outside rule 15.3's list"),
  "1132": M(["VF-045"], "yes", "This VAT rate (7, 8, 16 or 18%) is allowed only for dates up to 2012."),
  "1133": M(["VF-044", "VF-029"], "yes", "FechaExpedicionFactura is more than twenty years old."),
  "1134": M(["VF-044"], "yes", "FechaOperacion is more than twenty years old."),
  "1146": M(["VF-044"], "partly", "The issue date may precede the operation date only on ClaveRegimen 14 or 15 lines (VAT, IGIC or empty).", "the rule lets the record pass when any line is under 14 or 15; the AEAT may require every line to be"),
  "1173": M(["VF-044"], "partly", "A future FechaOperacion only on ClaveRegimen 14 or 15 lines (VAT, IGIC or empty).", "today is this tool's clock, not the AEAT's, and any 14 or 15 line lets the record pass"),
  "1194": M(["VF-045"], "partly", "This rate is allowed only from 1 July 2022 to 30 September 2024.", "the AEAT's text does not name the rate; the rule takes it as 5%, whose surcharge codes 1167 and 1168 cover the same dates"),
  "1212": M(["VF-043"], "yes", "TipoUsoPosibleSoloVerifactu takes S or N."),
  "1213": M(["VF-043"], "yes", "TipoUsoPosibleMultiOT takes S or N."),
  "1218": M(["VF-043"], "yes", "Impuesto is not 01, 02, 03 or 05."),
  "1224": M(["VF-047"], "yes", "GeneradoPor and the Generador block go together."),
  "1225": M(["VF-047"], "yes", "GeneradoPor is not E, D or T."),
  "1226": M(["VF-043"], "yes", "IndicadorMultiplesOT takes S or N."),
  "1227": M(["VF-047"], "yes", "GeneradoPor E needs the Generador's NIF."),
  "1228": M(["VF-047"], "yes", "The Generador carries NIF or IDOtro, exactly one."),
  "1229": M(["VF-047"], "yes", "GeneradoPor T: the Generador cannot be IDType 07."),
  "1230": M(["VF-047"], "yes", "GeneradoPor D with CodigoPais ES: the Generador is IDType 03 or 07."),
  "1231": M(["VF-043"], "yes", "The Generador's IDType is wrong."),
  "1235": M(["VF-045"], "partly", "This rate is allowed only from 1 October to 31 December 2024.", "the AEAT's text does not name the rate; the rule takes 1235 and 1236 as 2% and 7.5%, whose surcharge codes 1166 and 1169 cover the same dates"),
  "1236": M(["VF-045"], "partly", "This rate is allowed only from 1 October to 31 December 2024.", "the AEAT's text does not name the rate; the rule takes 1235 and 1236 as 2% and 7.5%, whose surcharge codes 1166 and 1169 cover the same dates"),
  "1246": M(["VF-043", "VF-038"], "yes", "ClaveRegimen is not in the AEAT's list (21 under IGIC only)."),
  "1254": M(["VF-046"], "yes", "An XI VAT number is not allowed for operations before 1 January 2021."),
  "1255": M(["VF-046"], "yes", "A GB VAT number is not allowed for operations from 1 February 2021."),
  "1258": M(["VF-047"], "partly", "The Generador's NIF is wrong.", "this tool checks its shape and check character only"),
  "1259": M(["VF-047"], "partly", "The Generador's NIF must be in the census and differ from the issuer's.", CENSUS),
  "2000": M(["VF-001"], "yes", "The fingerprint does not match the record (accepted, to be corrected)."),
  "2001": M(["VF-019"], "partly", "A buyer's NIF is not in the census (accepted, to be corrected).", CENSUS),
  "2002": M(["VF-002"], "yes", "The previous record's fingerprint has the wrong length (accepted, to be corrected)."),
  "2003": M(["VF-002"], "yes", "The previous record's fingerprint is malformed (accepted, to be corrected)."),
  "2004": M([], "no", "FechaHoraHusoGenRegistro is too far from the AEAT's clock (accepted, to be corrected).", "the AEAT compares it with its own clock when the record arrives"),
  "2005": M(["VF-016"], "yes", "ImporteTotal does not match the bases, tax and surcharge (accepted, to be corrected)."),
  "2006": M(["VF-015"], "yes", "CuotaTotal does not match the tax and surcharge (accepted, to be corrected)."),
  "2007": M([], "no", "Marked as the first record, but the AEAT already holds records from this issuer and system.", RECORDS),
  "2008": M(["VF-036"], "yes", "The previous record's fingerprint equals this record's."),
  "2009": M(["VF-038"], "yes", "IPSI lines need ClaveRegimen (accepted, to be corrected)."),
  "3000": M([], "no", "Duplicate record: the AEAT already holds it.", RECORDS),
  "3001": M([], "no", "The record was already cancelled.", RECORDS),
  "3002": M([], "no", "No such record at the AEAT.", RECORDS),
  "3003": M([], "no", "The sender may not update this record.", HEADER),
  "3004": M([], "no", "The invoice was registered through the AEAT's form and cannot be changed here.", RECORDS),
};

// A code the map does not cover: classed by what the AEAT's own text says.
function coverageOf(code) {
  if (Object.hasOwn(AEAT_CODE_RULES, code)) return AEAT_CODE_RULES[code];
  const es = AEAT_ERRORS[code]?.es || "";
  let why = SCHEMA;
  if (/censo/i.test(es)) why = CENSUS;
  else if (/t[ée]cnico|base de datos|Servicio no|GET/i.test(es)) why = TECH;
  else if (/cabecera|certificado|apoderad|Representante|Requerimiento|Colaborador/i.test(es)) why = HEADER;
  else if (/consulta|Mostrar|RangoFecha|Periodo|IndicadorRepresentante|filtrar/i.test(es)) why = QUERY;
  return { rules: [], offline: "no", en: null, why };
}

export function looksLikeAeatResponse(text) {
  const head = String(text).slice(0, 65536);
  return /<(?:[A-Za-z0-9_]+:)?RespuestaRegFactuSistemaFacturacion[\s>]/.test(head)
    || (/<(?:[A-Za-z0-9_]+:)?Fault[\s>]/.test(head) && /Codigo\[\d{4}\]/i.test(head));
}

export function readAeatResponse(source) {
  const t = typeof source === "string" ? source : new TextDecoder().decode(source);
  const tree = parseXmlTree(t);
  const resp = find(tree, "RespuestaRegFactuSistemaFacturacion");
  if (!resp) {
    const fault = find(tree, "Fault");
    const text = fault ? val(fault, "faultstring") ?? "" : "";
    const m = /Codigo\[(\d{4})\]\.?\s*(.*)$/is.exec(text);
    if (!m) throw new Error("No AEAT response or SOAP fault with Codigo[...] found");
    return { kind: "fault", code: m[1], text: m[2].trim(), lines: [] };
  }
  const lines = kids(resp, "RespuestaLinea").map((l, i) => ({
    index: i,
    id: { issuer: val(l, "IDFactura", "IDEmisorFactura"), number: val(l, "IDFactura", "NumSerieFactura"), date: val(l, "IDFactura", "FechaExpedicionFactura") },
    operation: val(l, "Operacion", "TipoOperacion"),
    status: val(l, "EstadoRegistro"),
    code: val(l, "CodigoErrorRegistro"),
    description: val(l, "DescripcionErrorRegistro"),
    duplicate: kid(l, "RegistroDuplicado") ? { status: val(l, "RegistroDuplicado", "EstadoRegistroDuplicado"), code: val(l, "RegistroDuplicado", "CodigoErrorRegistro") } : null,
  }));
  return { kind: "response", csv: val(resp, "CSV"), status: val(resp, "EstadoEnvio"), wait: val(resp, "TiempoEsperaEnvio"), presented: val(resp, "DatosPresentacion", "TimestampPresentacion"), lines };
}

const idText = (id) => `${id.number || "?"} of ${id.date || "?"}${id.issuer ? ` (issuer ${id.issuer})` : ""}`;
const sameId = (a, b) => a.number === b.number && (!a.date || a.date === b.date) && (!a.issuer || a.issuer === b.issuer);

// Pair a response line with the record it answers. `batch` holds { record, file } pairs.
export function pairLine(line, batch) {
  const kind = /anul/i.test(line.operation || "") ? "anulacion" : line.operation ? "alta" : null;
  return batch.find((e) => (!kind || e.record.kind === kind) && sameId(line.id, e.record.id || {})) || null;
}

function codeText(code) {
  const official = AEAT_ERRORS[code];
  const c = coverageOf(code);
  return { known: !!official, official, c };
}

export function responseFindings(resp, batch = []) {
  const out = [];
  if (resp.kind === "fault") {
    const { official, c } = codeText(resp.code);
    out.push({
      rule: `AEAT-${resp.code}`, aeat: resp.code,
      message: `The AEAT refused the whole submission with code ${resp.code}${c.en ? `: ${c.en}` : "."}${official ? ` The AEAT's list says: "${official.es}".` : " The code is not in the AEAT's published list."}${resp.text ? ` Its reply: "${withhold(resp.text).slice(0, 300)}".` : ""}`,
      fix: `Nothing in this submission was registered. ${c.offline === "no" ? `This tool cannot check it: ${c.why}.` : `This tool checks it offline: ${c.rules.join(", ")}.`} Correct and send the whole submission again.`,
      path: "/Fault/faultstring",
    });
    return out;
  }
  const chain = batch.length ? chainFindings(batch) : [];
  for (const l of resp.lines) {
    const pair = pairLine(l, batch);
    // A chain finding names its record as "(number of date (issuer ...))": match all of it,
    // since the number alone also matches a longer one (F1 in "(F10 of ...").
    let local = null;
    if (pair) local = [...recordFindings(pair.record), ...chain.filter((f) => f.file === pair.file && f.message.includes(`(${recordLabel(pair.record.id)})`))];
    if (l.status === "Correcto" && !l.code) {
      const blocking = (local || []).filter((f) => f.severity !== "warning" && f.severity !== "information");
      if (blocking.length) {
        out.push({ rule: "AEAT-PASSED", severity: "information", message: `The AEAT registered ${idText(l.id)} as correct, yet this checker raises ${[...new Set(blocking.map((f) => f.rule))].join(", ")} on it (${pair.file}).`,
          fix: "Read each finding: this checker may be stricter than the AEAT on that point, or the file in the batch differs from what was sent. Report a rule the AEAT does not apply so it can be corrected.", path: `/RespuestaLinea[${l.index + 1}]` });
      }
      continue;
    }
    if (!l.code) continue;
    const { official, c } = codeText(l.code);
    const accepted = l.status === "AceptadoConErrores";
    let coverage;
    if (c.offline === "no") coverage = `This tool cannot check it: ${c.why}.`;
    else coverage = `This tool checks it offline${c.offline === "partly" ? ` in part${c.why ? ` (${c.why})` : ""}` : ""}: ${c.rules.join(", ")}.`;
    let verdict = "";
    let reproduced = null;
    if (pair) {
      const hits = local.filter((f) => c.rules.includes(f.rule));
      reproduced = hits.length > 0;
      if (reproduced) verdict = ` On ${pair.file} this checker raises it too (${[...new Set(hits.map((f) => f.rule))].join(", ")}).`;
      else if (c.offline === "yes") verdict = ` On ${pair.file} this checker does not raise it, though the check is offline: the record in the batch may differ from what was sent, or this rule misses a case.`;
      else verdict = ` On ${pair.file} this checker does not raise it${c.offline === "partly" ? `, as expected: ${c.why || "the fault is one only the AEAT can see"}` : ""}.`;
    } else if (batch.length) {
      verdict = " The record is not in this batch (matched by issuer, number and date).";
    }
    out.push({
      rule: `AEAT-${l.code}`, aeat: l.code,
      ...(accepted ? { severity: "warning" } : {}),
      message: `The AEAT ${accepted ? "registered with errors" : "rejected"} ${l.operation === "Anulacion" ? "the cancellation of " : ""}${idText(l.id)} with code ${l.code}${c.en ? `: ${c.en}` : "."}${official ? ` The AEAT's list says: "${official.es}".` : " The code is not in the AEAT's published list (errores.properties, 2026-07-30)."}${l.description ? ` Its reply: "${withhold(l.description).slice(0, 300)}".` : ""}`,
      fix: `${accepted ? "The record is registered; send a correction (Subsanacion S) once fixed. " : "The record was not registered; correct it and send it again (with Subsanacion S and RechazoPrevio as the AEAT's rules ask). "}${coverage}${verdict}`,
      path: `/RespuestaLinea[${l.index + 1}]/CodigoErrorRegistro`,
      ...(reproduced === null ? {} : { reproduced }),
    });
  }
  return out;
}

export function responseEnvelope(resp, batch = []) {
  if (resp.kind === "fault") return `Read as the AEAT's SOAP fault for a VERI*FACTU submission (code ${resp.code}): the whole submission was refused.`;
  const n = (s) => resp.lines.filter((l) => l.status === s).length;
  const paired = batch.length ? resp.lines.filter((l) => pairLine(l, batch)).length : 0;
  return `Read as the AEAT's reply to a VERI*FACTU submission (EstadoEnvio ${resp.status || "missing"}${resp.csv ? `, CSV ${resp.csv}` : ""}), not a record: ${resp.lines.length} line(s), ${n("Correcto")} correct, ${n("AceptadoConErrores")} accepted with errors, ${n("Incorrecto")} rejected${batch.length ? `; ${paired} paired with records in this batch` : ""}.`;
}
