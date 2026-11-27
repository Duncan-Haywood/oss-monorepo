import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AEAT_CODE_RULES, looksLikeAeatResponse, pairLine, readAeatResponse, responseEnvelope, responseFindings } from "./verifactu-response.mjs";
import { AEAT_ERRORS, AEAT_ERRORS_SOURCE } from "./verifactu-errors-data.mjs";
import { parseErroresProperties, render } from "./build-verifactu-errors.mjs";
import { huellaOf, huellaPayload, readVerifactu, recordFindings } from "./verifactu.mjs";
import { createHash } from "node:crypto";

const fxBytes = (n) => readFileSync(new URL(`./fixtures/verifactu/${n}`, import.meta.url));
const fx = (n) => fxBytes(n).toString("utf8");
const NS = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws";

test("the data file is AEAT's errores.properties, unchanged and complete", () => {
  const bytes = fxBytes("aeat-errores.properties.txt");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), AEAT_ERRORS_SOURCE.sha256);
  assert.equal(AEAT_ERRORS_SOURCE.sha256, "06519ceb23422bd6b0ad3bfb659e3007615050da4920781d12cff536481d5902");
  assert.equal(readFileSync(new URL("./verifactu-errors-data.mjs", import.meta.url), "utf8"), render(bytes));
  const codes = parseErroresProperties(bytes);
  assert.equal(Object.keys(codes).length, 247);
  const by = (s) => Object.values(codes).filter((c) => c.scope === s).length;
  assert.deepEqual([by("submission"), by("record"), by("accepted")], [44, 193, 10]);
  assert.equal(codes["1152"].es, "La fecha de expedición no puede ser inferior al 28 de octubre de 2024.");
  assert.equal(AEAT_ERRORS["2000"].scope, "accepted");
});

test("every mapped code is in AEAT's list and names rules that exist", () => {
  const src = readFileSync(new URL("./verifactu.mjs", import.meta.url), "utf8");
  for (const [code, c] of Object.entries(AEAT_CODE_RULES)) {
    assert.ok(AEAT_ERRORS[code], `${code} not in AEAT's list`);
    assert.ok(["yes", "partly", "no"].includes(c.offline), code);
    assert.equal(c.offline === "no", c.rules.length === 0, code);
    for (const r of c.rules) assert.ok(src.includes(`"${r}"`), `${code}: ${r} not raised by verifactu.mjs`);
  }
});

test("a real AEAT reply (code 1123, NIF AAAA) is read and explained", () => {
  const t = fx("curried-response-1123.xml");
  assert.ok(looksLikeAeatResponse(t));
  const r = readAeatResponse(t);
  assert.equal(r.status, "Incorrecto");
  assert.deepEqual(r.lines.map((l) => [l.status, l.code, l.operation]), [["Incorrecto", "1123", "Alta"]]);
  const [f] = responseFindings(r);
  assert.equal(f.rule, "AEAT-1123");
  assert.match(f.message, /El formato del NIF es incorrecto/);
  assert.match(f.fix, /VF-019/);
  assert.match(responseEnvelope(r), /1 rejected/);
});

// The record the reply answers, rebuilt: issuer AAAA, 12345 of 13-09-2024.
function record(o = {}) {
  const f = { issuer: "AAAA", number: "12345", date: "13-09-2024", type: "F1", cuota: "21.00", importe: "121.00", prev: "", generated: "2024-09-13T10:00:00+02:00", ...o };
  return `<sum1:RegistroAlta xmlns:sum1="${NS}/SuministroInformacion.xsd"><sum1:IDFactura><sum1:IDEmisorFactura>${f.issuer}</sum1:IDEmisorFactura><sum1:NumSerieFactura>${f.number}</sum1:NumSerieFactura><sum1:FechaExpedicionFactura>${f.date}</sum1:FechaExpedicionFactura></sum1:IDFactura><sum1:TipoFactura>F1</sum1:TipoFactura><sum1:Destinatarios><sum1:IDDestinatario><sum1:NombreRazon>B</sum1:NombreRazon><sum1:NIF>A39200019</sum1:NIF></sum1:IDDestinatario></sum1:Destinatarios><sum1:Desglose><sum1:DetalleDesglose><sum1:ClaveRegimen>01</sum1:ClaveRegimen><sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion><sum1:TipoImpositivo>21</sum1:TipoImpositivo><sum1:BaseImponibleOimporteNoSujeto>100.00</sum1:BaseImponibleOimporteNoSujeto><sum1:CuotaRepercutida>21.00</sum1:CuotaRepercutida></sum1:DetalleDesglose></sum1:Desglose><sum1:CuotaTotal>21.00</sum1:CuotaTotal><sum1:ImporteTotal>121.00</sum1:ImporteTotal><sum1:Encadenamiento><sum1:PrimerRegistro>S</sum1:PrimerRegistro></sum1:Encadenamiento><sum1:FechaHoraHusoGenRegistro>${f.generated}</sum1:FechaHoraHusoGenRegistro><sum1:TipoHuella>01</sum1:TipoHuella><sum1:Huella>${huellaOf(huellaPayload("alta", f))}</sum1:Huella></sum1:RegistroAlta>`;
}

test("paired with the record sent, the 1123 rejection is reproduced by VF-019", () => {
  const r = readAeatResponse(fx("curried-response-1123.xml"));
  const batch = readVerifactu(record()).map((rec) => ({ record: rec, file: "sent.xml" }));
  assert.ok(pairLine(r.lines[0], batch));
  const [f] = responseFindings(r, batch);
  assert.equal(f.reproduced, true);
  assert.match(f.fix, /raises it too \(VF-019\)/);
  assert.match(responseEnvelope(r, batch), /1 paired/);
  // The same record with a well-formed NIF: the code is offline, so not raising it is reported.
  const fixed = readVerifactu(record({ issuer: "A39200019" })).map((rec) => ({ record: rec, file: "sent.xml" }));
  assert.equal(pairLine({ ...r.lines[0], id: { ...r.lines[0].id, issuer: "A39200019" } }, fixed)?.file, "sent.xml");
  assert.equal(pairLine(r.lines[0], fixed), null);
});

const reply = (lines, status = "ParcialmenteCorrecto") => `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="${NS}/RespuestaSuministro.xsd" xmlns:tik="${NS}/SuministroInformacion.xsd"><tikR:CSV>A-X</tikR:CSV><tikR:EstadoEnvio>${status}</tikR:EstadoEnvio>${lines.map(([n, st, code, op = "Alta"]) => `<tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>A39200019</tik:IDEmisorFactura><tik:NumSerieFactura>${n}</tik:NumSerieFactura><tik:FechaExpedicionFactura>13-09-2025</tik:FechaExpedicionFactura></tikR:IDFactura><tikR:Operacion><tik:TipoOperacion>${op}</tik:TipoOperacion></tikR:Operacion><tikR:EstadoRegistro>${st}</tikR:EstadoRegistro>${code ? `<tikR:CodigoErrorRegistro>${code}</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>x 123456789012</tikR:DescripcionErrorRegistro>` : ""}</tikR:RespuestaLinea>`).join("")}</tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>`;

test("accepted with errors is a warning; census and duplicate codes say why they are not checked; digits withheld", () => {
  const r = readAeatResponse(reply([["1", "Correcto"], ["2", "AceptadoConErrores", "2001"], ["3", "Incorrecto", "3000"], ["4", "Incorrecto", "1109"]]));
  const f = responseFindings(r);
  assert.deepEqual(f.map((x) => [x.rule, x.severity ?? "error"]), [["AEAT-2001", "warning"], ["AEAT-3000", "error"], ["AEAT-1109", "error"]]);
  assert.match(f[1].fix, /records it already holds/);
  assert.match(f[2].fix, /census/);
  assert.ok(f.every((x) => !/123456789012/.test(x.message)));
  assert.match(responseEnvelope(r), /1 correct, 1 accepted with errors, 2 rejected/);
});

test("a code outside the map is still explained from AEAT's list; an unknown code says so", () => {
  const f = responseFindings(readAeatResponse(reply([["1", "Incorrecto", "1128"], ["2", "Incorrecto", "1999"]])));
  assert.match(f[0].message, /No existe acuerdo de facturaci/);
  assert.match(f[1].message, /not in the AEAT's published list/);
});

test("a SOAP fault refuses the whole submission", () => {
  const t = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>env:Client</faultcode><faultstring>Codigo[4102].El XML no cumple el esquema. Falta informar campo obligatorio.: BaseImponibleOimporteNoSujeto</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`;
  assert.ok(looksLikeAeatResponse(t));
  const r = readAeatResponse(t);
  assert.equal(r.kind, "fault");
  const [f] = responseFindings(r);
  assert.equal(f.rule, "AEAT-4102");
  assert.match(f.message, /BaseImponibleOimporteNoSujeto/);
  assert.match(f.fix, /schema/);
});

test("a correct line whose record this checker flags is reported, so a too-strict rule can be found", () => {
  const sent = readVerifactu(record({ issuer: "A39200019", number: "9", date: "13-09-2025", generated: "2025-09-13T10:00:00+02:00" }).replace("<sum1:NIF>A39200019</sum1:NIF>", "<sum1:NIF>A39200019</sum1:NIF>").replace("PrimerRegistro>S<", "PrimerRegistro>X<"));
  const f = responseFindings(readAeatResponse(reply([["9", "Correcto"]], "Correcto")), sent.map((record) => ({ record, file: "s.xml" })));
  assert.equal(f[0].rule, "AEAT-PASSED");
  assert.match(f[0].message, /VF-004/);
  assert.ok(recordFindings(sent[0]).some((x) => x.rule === "VF-004"));
  assert.equal(looksLikeAeatResponse("<RegistroAlta/>"), false);
});
