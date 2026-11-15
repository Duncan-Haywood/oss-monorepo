import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chainFindings, diagnoseHuella, huellaOf, huellaPayload, looksLikeVerifactu, readVerifactu, recordFindings, verifactuQrUrl, verifactuReport } from "./verifactu.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/verifactu/${n}`, import.meta.url), "utf8");
const NS = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";

// An RegistroAlta built from fields; `huella` defaults to the correct fingerprint.
function alta(o = {}) {
  const f = { issuer: "89890001K", number: "12345678/G33", date: "01-01-2024", type: "F1", cuota: "12.35", importe: "123.45", prev: "", generated: "2024-01-01T19:20:30+01:00", ...o };
  const huella = o.huella ?? huellaOf(huellaPayload("alta", f));
  const lines = o.lines ?? `<sum1:DetalleDesglose><sum1:ClaveRegimen>01</sum1:ClaveRegimen><sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion><sum1:TipoImpositivo>11.12</sum1:TipoImpositivo><sum1:BaseImponibleOimporteNoSujeto>${o.base ?? "111.10"}</sum1:BaseImponibleOimporteNoSujeto><sum1:CuotaRepercutida>${f.cuota}</sum1:CuotaRepercutida></sum1:DetalleDesglose>`;
  const enc = f.prev ? `<sum1:RegistroAnterior><sum1:IDEmisorFactura>${o.prevIssuer ?? f.issuer}</sum1:IDEmisorFactura><sum1:NumSerieFactura>${o.prevNumber}</sum1:NumSerieFactura><sum1:FechaExpedicionFactura>${o.prevDate ?? f.date}</sum1:FechaExpedicionFactura><sum1:Huella>${f.prev}</sum1:Huella></sum1:RegistroAnterior>` : "<sum1:PrimerRegistro>S</sum1:PrimerRegistro>";
  const dest = o.dest ?? "<sum1:Destinatarios><sum1:IDDestinatario><sum1:NombreRazon>B</sum1:NombreRazon><sum1:NIF>A39200019</sum1:NIF></sum1:IDDestinatario></sum1:Destinatarios>";
  return `<sum1:RegistroAlta xmlns:sum1="${NS}"><sum1:IDVersion>1.0</sum1:IDVersion><sum1:IDFactura><sum1:IDEmisorFactura>${f.issuer}</sum1:IDEmisorFactura><sum1:NumSerieFactura>${f.number}</sum1:NumSerieFactura><sum1:FechaExpedicionFactura>${f.date}</sum1:FechaExpedicionFactura></sum1:IDFactura><sum1:NombreRazonEmisor>E</sum1:NombreRazonEmisor><sum1:TipoFactura>${f.type}</sum1:TipoFactura>${o.extra ?? ""}${dest}<sum1:Desglose>${lines}</sum1:Desglose><sum1:CuotaTotal>${f.cuota}</sum1:CuotaTotal><sum1:ImporteTotal>${f.importe}</sum1:ImporteTotal><sum1:Encadenamiento>${enc}</sum1:Encadenamiento><sum1:FechaHoraHusoGenRegistro>${f.generated}</sum1:FechaHoraHusoGenRegistro><sum1:TipoHuella>01</sum1:TipoHuella><sum1:Huella>${huella}</sum1:Huella></sum1:RegistroAlta>`;
}
const one = (xml) => readVerifactu(xml)[0];
// AEAT's worked examples are dated 01-01-2024, before the earliest issue date AEAT
// accepts (VF-029), and their line is taxed at 11.12%, no Spanish VAT rate (VF-045, a
// warning); both rules have their own tests, so the shared helper leaves them out.
const rules = (xml) => recordFindings(one(xml)).map((f) => f.rule).filter((r) => r !== "VF-029" && r !== "VF-045");

test("AEAT's two worked examples (huella specification v0.1.2) reproduce", () => {
  assert.equal(huellaOf("IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00"), "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60");
  const first = one(alta());
  assert.deepEqual(recordFindings(first).map((f) => f.rule), ["VF-029", "VF-045"]);
  assert.equal(first.expectedHuella, "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60");
  const second = one(alta({ number: "12345679/G34", prev: first.huella, prevNumber: "12345678/G33", generated: "2024-01-01T19:20:35+01:00" }));
  assert.equal(second.expectedHuella, "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97");
});

test("real records: AEAT test entity envelope and two library fixtures all match", () => {
  for (const n of ["aeat-test-entity-envelope.xml", "josemmo-registro-alta-f1.xml", "josemmo-registro-anulacion.xml"]) {
    const t = fx(n);
    assert.ok(looksLikeVerifactu(t), n);
    const recs = readVerifactu(t);
    const rep = verifactuReport(n, recs);
    assert.ok(rep.verifactu.records.every((r) => r.matches), n);
    assert.ok(!rep.errors.some((e) => ["VF-001", "VF-015", "VF-016", "VF-017"].includes(e.rule)), n);
  }
});

test("AEAT test record hashes the amount as written: 15, not 15.00", () => {
  const t = fx("aeat-test-entity-envelope.xml").replace("<sum1:ImporteTotal>15</sum1:ImporteTotal>", "<sum1:ImporteTotal>15.00</sum1:ImporteTotal>");
  const f = recordFindings(one(t)).find((x) => x.rule === "VF-001");
  assert.ok(f);
  assert.deepEqual(f.diagnosis, ["amounts-short"]);
});

test("diagnosis names the way the string was built", () => {
  // Fingerprint taken over 123.45 but XML says 123.450
  const r1 = one(alta({ importe: "123.450", huella: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60" }));
  assert.deepEqual(recordFindings(r1).find((x) => x.rule === "VF-001").diagnosis, ["amounts-2dp"]);
  // Hashed with +00:00 but the XML carries Z.
  const good = huellaOf(huellaPayload("alta", { issuer: "89890001K", number: "N1", date: "01-01-2024", type: "F1", cuota: "12.35", importe: "123.45", prev: "", generated: "2024-01-01T18:20:30+00:00" }));
  const r2 = one(alta({ number: "N1", generated: "2024-01-01T18:20:30Z", huella: good }));
  assert.ok(recordFindings(r2).find((x) => x.rule === "VF-001").diagnosis.includes("tz-z"));
  assert.ok(recordFindings(r2).some((x) => x.rule === "VF-010"));
  // Chained record hashed without the previous fingerprint.
  const r3 = one(alta({ number: "12345679/G34", prev: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60", prevNumber: "12345678/G33", generated: "2024-01-01T19:20:35+01:00",
    huella: huellaOf(huellaPayload("alta", { issuer: "89890001K", number: "12345679/G34", date: "01-01-2024", type: "F1", cuota: "12.35", importe: "123.45", prev: "", generated: "2024-01-01T19:20:35+01:00" })) }));
  assert.deepEqual(recordFindings(r3).find((x) => x.rule === "VF-001").diagnosis, ["no-prev"]);
  // A changed value is not explained away.
  const r4 = one(alta({ huella: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60", number: "12345678/G99" }));
  const f4 = recordFindings(r4).find((x) => x.rule === "VF-001");
  assert.ok(f4 && !f4.diagnosis && /field value itself differs/.test(f4.message));
  assert.equal(diagnoseHuella("alta", { issuer: "", number: "", date: "", type: "", cuota: "", importe: "", prev: "", generated: "" }, "00"), null);
});

test("entities are decoded before hashing", () => {
  const f = { issuer: "89890001K", number: "A&B/1", date: "01-01-2024", type: "F1", cuota: "12.35", importe: "123.45", prev: "", generated: "2024-01-01T19:20:30+01:00" };
  const h = huellaOf(huellaPayload("alta", f));
  assert.deepEqual(rules(alta({ number: "A&amp;B/1", huella: h })), []);
});

test("chain: good link, broken fingerprint, wrong id, fork, time running backwards", () => {
  const a = one(alta());
  const ok = alta({ number: "12345679/G34", prev: a.huella, prevNumber: "12345678/G33", generated: "2024-01-01T19:20:35+01:00" });
  const batch = (xmls) => xmls.map((x, i) => ({ record: (() => { const r = one(x); recordFindings(r); return r; })(), file: `f${i}.xml` }));
  assert.deepEqual(chainFindings(batch([alta(), ok])), []);
  const broken = alta({ number: "12345679/G34", prev: "A".repeat(64), prevNumber: "12345678/G33", generated: "2024-01-01T19:20:35+01:00" });
  assert.deepEqual(chainFindings(batch([alta(), broken])).map((f) => f.rule), ["VF-005"]);
  const wrongId = alta({ number: "12345679/G34", prev: a.huella, prevNumber: "99", generated: "2024-01-01T19:20:35+01:00" });
  assert.deepEqual(chainFindings(batch([alta(), wrongId])).map((f) => f.rule), ["VF-006"]);
  const other = alta({ number: "X2", prev: a.huella, prevNumber: "12345678/G33", generated: "2024-01-01T19:20:36+01:00" });
  assert.deepEqual(chainFindings(batch([alta(), ok, other])).map((f) => f.rule), ["VF-007"]);
  const early = alta({ number: "12345679/G34", prev: a.huella, prevNumber: "12345678/G33", generated: "2024-01-01T19:20:00+01:00" });
  assert.deepEqual(chainFindings(batch([alta(), early])).map((f) => f.rule), ["VF-008"]);
});

test("record rules: recipients, corrective fields, totals, breakdown", () => {
  assert.ok(rules(alta({ type: "F2" })).includes("VF-012"));
  assert.ok(rules(alta({ dest: "" })).includes("VF-012"));
  assert.ok(rules(alta({ type: "R1" })).includes("VF-013"));
  assert.ok(rules(alta({ type: "R1", extra: "<sum1:TipoRectificativa>S</sum1:TipoRectificativa>" })).includes("VF-014"));
  assert.ok(!rules(alta({ type: "R4", extra: "<sum1:TipoRectificativa>I</sum1:TipoRectificativa>" })).some((r) => ["VF-013", "VF-014"].includes(r)));
  assert.ok(rules(alta({ type: "F9" })).includes("VF-011"));
  assert.ok(rules(alta({ importe: "130.00" })).includes("VF-016"));
  assert.ok(rules(alta({ base: "200.00", importe: "212.35" })).includes("VF-017"));
  assert.ok(rules(alta({ cuota: "12,35" })).includes("VF-021"));
  assert.ok(rules(alta({ date: "31-02-2024" })).includes("VF-009"));
  const exempt = "<sum1:DetalleDesglose><sum1:ClaveRegimen>01</sum1:ClaveRegimen><sum1:OperacionExenta>E1</sum1:OperacionExenta><sum1:TipoImpositivo>21</sum1:TipoImpositivo><sum1:BaseImponibleOimporteNoSujeto>123.45</sum1:BaseImponibleOimporteNoSujeto></sum1:DetalleDesglose>";
  assert.ok(rules(alta({ lines: exempt, cuota: "0.00" })).includes("VF-018"));
  const twoLines = "<sum1:DetalleDesglose><sum1:ClaveRegimen>01</sum1:ClaveRegimen><sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion><sum1:TipoImpositivo>21.00</sum1:TipoImpositivo><sum1:BaseImponibleOimporteNoSujeto>100.00</sum1:BaseImponibleOimporteNoSujeto><sum1:CuotaRepercutida>21.00</sum1:CuotaRepercutida></sum1:DetalleDesglose>";
  assert.ok(rules(alta({ lines: twoLines, cuota: "12.35", importe: "121.00" })).includes("VF-015"));
  const c18 = "<sum1:DetalleDesglose><sum1:ClaveRegimen>18</sum1:ClaveRegimen><sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion><sum1:TipoImpositivo>21.00</sum1:TipoImpositivo><sum1:BaseImponibleOimporteNoSujeto>100.00</sum1:BaseImponibleOimporteNoSujeto><sum1:CuotaRepercutida>21.00</sum1:CuotaRepercutida></sum1:DetalleDesglose>";
  assert.ok(rules(alta({ lines: c18, cuota: "21.00", importe: "121.00" })).includes("VF-028"));
  assert.ok(rules(alta({ dest: "<sum1:Destinatarios><sum1:IDDestinatario><sum1:NombreRazon>B</sum1:NombreRazon><sum1:IDOtro><sum1:CodigoPais>FR</sum1:CodigoPais><sum1:IDType>02</sum1:IDType><sum1:ID>DE123</sum1:ID></sum1:IDOtro></sum1:IDDestinatario></sum1:Destinatarios>" })).includes("VF-023"));
  assert.ok(rules(alta({ extra: "<sum1:Subsanacion>N</sum1:Subsanacion><sum1:RechazoPrevio>S</sum1:RechazoPrevio>" })).includes("VF-020"));
  assert.ok(rules(alta({ huella: "abc" })).includes("VF-002"));
});

test("QR URL: production, test host and non-VERI*FACTU path; values encoded", () => {
  const r = one(fx("aeat-test-entity-envelope.xml"));
  assert.equal(verifactuQrUrl(r), "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=A39200019&numserie=VF280225%2F00088&fecha=02-04-2025&importe=15");
  assert.equal(verifactuQrUrl(r, { production: false, verifactu: false }), "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu?nif=A39200019&numserie=VF280225%2F00088&fecha=02-04-2025&importe=15");
});

test("not mistaken for other XML", () => {
  assert.equal(looksLikeVerifactu("<Invoice xmlns='urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'/>"), false);
  assert.throws(() => readVerifactu("<x/>"));
});

const line = (o = {}) => `<sum1:DetalleDesglose>${o.tax ? `<sum1:Impuesto>${o.tax}</sum1:Impuesto>` : ""}${o.regime === null ? "" : `<sum1:ClaveRegimen>${o.regime ?? "01"}</sum1:ClaveRegimen>`}${o.exempt ? `<sum1:OperacionExenta>${o.exempt}</sum1:OperacionExenta>` : `<sum1:CalificacionOperacion>${o.q ?? "S1"}</sum1:CalificacionOperacion>`}${o.rate === null ? "" : `<sum1:TipoImpositivo>${o.rate ?? "21.00"}</sum1:TipoImpositivo>`}<sum1:BaseImponibleOimporteNoSujeto>${o.base ?? "100.00"}</sum1:BaseImponibleOimporteNoSujeto>${o.atCost ? `<sum1:BaseImponibleACoste>${o.atCost}</sum1:BaseImponibleACoste>` : ""}${o.cuota === null ? "" : `<sum1:CuotaRepercutida>${o.cuota ?? "21.00"}</sum1:CuotaRepercutida>`}${o.sRate ? `<sum1:TipoRecargoEquivalencia>${o.sRate}</sum1:TipoRecargoEquivalencia>` : ""}${o.sAmt ? `<sum1:CuotaRecargoEquivalencia>${o.sAmt}</sum1:CuotaRecargoEquivalencia>` : ""}</sum1:DetalleDesglose>`;
// A clean 2025 record, so VF-029 stays quiet; `o` overrides alta()'s fields.
const rec = (o = {}) => alta({ date: "02-04-2025", generated: "2025-04-02T10:00:00+02:00", cuota: "21.00", importe: "121.00", lines: line(o.line), ...o });
const all = (xml) => recordFindings(one(xml)).map((f) => f.rule);

test("AEAT error-list rules (VF-029 to VF-041) stay quiet on a clean record", () => {
  assert.deepEqual(all(rec()), []);
  assert.deepEqual(all(rec({ type: "F2", dest: "" })), []);
});

test("VF-029: issue dates before 28-10-2024 (AEAT 1152)", () => {
  assert.ok(all(rec({ date: "27-10-2024", generated: "2024-10-27T10:00:00+02:00" })).includes("VF-029"));
  assert.ok(!all(rec({ date: "28-10-2024", generated: "2024-10-28T10:00:00+02:00" })).includes("VF-029"));
});

test("VF-030 Macrodato and VF-031 the F2 cap", () => {
  const big = rec({ cuota: "21000000.00", importe: "121000000.00", line: { base: "100000000.00", cuota: "21000000.00" } });
  assert.ok(all(big).includes("VF-030"));
  assert.ok(!all(rec({ cuota: "21000000.00", importe: "121000000.00", line: { base: "100000000.00", cuota: "21000000.00" }, extra: "<sum1:Macrodato>S</sum1:Macrodato>" })).includes("VF-030"));
  assert.ok(all(rec({ extra: "<sum1:Macrodato>S</sum1:Macrodato>" })).includes("VF-030"));
  const f2 = { type: "F2", dest: "", cuota: "630.00", importe: "3630.00", line: { base: "3000.00", cuota: "630.00" } };
  assert.ok(all(rec(f2)).includes("VF-031"));
  assert.ok(!all(rec({ ...f2, extra: "<sum1:FacturaSinIdentifDestinatarioArt61d>S</sum1:FacturaSinIdentifDestinatarioArt61d>" })).includes("VF-031"));
  assert.ok(!all(rec({ ...f2, cuota: "520.66", importe: "3000.00", line: { base: "2479.34", cuota: "520.66" } })).includes("VF-031"));
});

test("VF-032 and VF-033: the equivalence surcharge", () => {
  const c18 = (sRate, sAmt, date = "02-04-2025", rate = "21.00", cuota = "21.00") => rec({ date, generated: `${date.split("-").reverse().join("-")}T10:00:00+02:00`, cuota: (Number(cuota) + Number(sAmt)).toFixed(2), importe: (100 + Number(cuota) + Number(sAmt)).toFixed(2), line: { regime: "18", rate, cuota, sRate, sAmt } });
  assert.deepEqual(all(c18("5.20", "5.20")), []);
  assert.deepEqual(all(c18("1.75", "1.75")), []);
  assert.ok(all(c18("1.40", "1.40")).includes("VF-032"));
  assert.ok(all(c18("0.50", "0.50", "02-04-2025", "10.00", "10.00")).includes("VF-032"));
  assert.deepEqual(all(c18("1.40", "1.40", "02-04-2025", "10.00", "10.00")), []);
  assert.deepEqual(all(c18("0.26", "0.26", "15-11-2024", "2.00", "2.00")), []);
  assert.ok(all(c18("0.26", "0.26", "02-04-2025", "2.00", "2.00")).includes("VF-032"));
  assert.ok(all(rec({ line: { q: "S1", sRate: "5.20" } })).includes("VF-033"));
});

test("VF-034 reverse charge, VF-035 signs, VF-038 regimes", () => {
  assert.ok(all(rec({ cuota: "0.00", importe: "100.00", line: { q: "S2", rate: "21.00", cuota: "0.00" } })).includes("VF-034"));
  assert.deepEqual(all(rec({ cuota: "0.00", importe: "100.00", line: { q: "S2", rate: "0", cuota: "0" } })), []);
  assert.ok(all(rec({ cuota: "-21.00", importe: "79.00", line: { cuota: "-21.00" } })).includes("VF-035"));
  assert.ok(all(rec({ cuota: "0", importe: "100.00", line: { q: "N1", rate: null, cuota: null, regime: "08" } })).includes("VF-038"));
  assert.ok(all(rec({ cuota: "0", importe: "100.00", line: { q: "N2", rate: null, cuota: null, regime: "08" } })).every((r) => r !== "VF-038"));
  assert.ok(all(rec({ line: { regime: "11", rate: "10.00", cuota: "10.00" }, cuota: "10.00", importe: "110.00" })).includes("VF-038"));
  assert.ok(all(rec({ cuota: "0", importe: "100.00", line: { exempt: "E2", rate: null, cuota: null } })).includes("VF-038"));
  assert.ok(all(rec({ line: { regime: null } })).includes("VF-038"));
  assert.ok(all(rec({ line: { regime: "14" } })).includes("VF-038"));
  assert.ok(!all(rec({ line: { regime: "14" }, extra: "<sum1:FechaOperacion>30-04-2025</sum1:FechaOperacion>" })).includes("VF-038"));
});

test("VF-036 chain to itself, VF-037 flags, VF-039 to VF-041 parties", () => {
  const h = "A".repeat(64);
  assert.ok(all(rec({ prev: h, prevNumber: "X", huella: h })).includes("VF-036"));
  assert.ok(all(rec({ prev: "abc", prevNumber: "X" })).includes("VF-002"));
  assert.ok(all(rec({ type: "F2", dest: "", extra: "<sum1:FacturaSimplificadaArticulos7273>S</sum1:FacturaSimplificadaArticulos7273>" })).includes("VF-037"));
  assert.ok(all(rec({ extra: "<sum1:FacturaSinIdentifDestinatarioArt61d>X</sum1:FacturaSinIdentifDestinatarioArt61d>" })).includes("VF-037"));
  const r3 = rec({ type: "R3", extra: "<sum1:TipoRectificativa>I</sum1:TipoRectificativa>", dest: "<sum1:Destinatarios><sum1:IDDestinatario><sum1:NombreRazon>B</sum1:NombreRazon><sum1:IDOtro><sum1:CodigoPais>FR</sum1:CodigoPais><sum1:IDType>02</sum1:IDType><sum1:ID>FR123</sum1:ID></sum1:IDOtro></sum1:IDDestinatario></sum1:Destinatarios>" });
  assert.ok(all(r3).includes("VF-039"));
  assert.ok(all(rec({ dest: "<sum1:Destinatarios><sum1:IDDestinatario><sum1:NombreRazon>B</sum1:NombreRazon><sum1:NIF>89890001K</sum1:NIF></sum1:IDDestinatario></sum1:Destinatarios>" })).includes("VF-040"));
  assert.ok(all(rec({ extra: "<sum1:EmitidaPorTerceroODestinatario>T</sum1:EmitidaPorTerceroODestinatario>" })).includes("VF-041"));
  assert.ok(all(rec({ extra: "<sum1:Tercero><sum1:NombreRazon>T</sum1:NombreRazon><sum1:NIF>A39200019</sum1:NIF></sum1:Tercero>" })).includes("VF-041"));
  assert.ok(!all(rec({ extra: "<sum1:EmitidaPorTerceroODestinatario>T</sum1:EmitidaPorTerceroODestinatario><sum1:Tercero><sum1:NombreRazon>T</sum1:NombreRazon><sum1:NIF>A39200019</sum1:NIF></sum1:Tercero>" })).includes("VF-041"));
});

test("AEAT's newer codes: 1287 characters, 1286 and 1293 regimes, 1289 E5 buyer, 2009 IPSI", () => {
  assert.ok(all(rec({ number: "A=1" })).includes("VF-042"));
  assert.ok(all(rec({ dest: "<sum1:Destinatarios><sum1:IDDestinatario><sum1:NombreRazon>L&apos;Atelier</sum1:NombreRazon><sum1:NIF>A39200019</sum1:NIF></sum1:IDDestinatario></sum1:Destinatarios>" })).includes("VF-042"));
  assert.ok(!all(rec({ extra: "<ds:Signature xmlns:ds='http://www.w3.org/2000/09/xmldsig#'><ds:SignatureValue>QUJD==</ds:SignatureValue></ds:Signature>" })).includes("VF-042"));
  assert.ok(all(rec({ line: { regime: "02" } })).includes("VF-038"));
  assert.ok(all(rec({ cuota: "0", importe: "100.00", line: { regime: "20", q: "N1", rate: null, cuota: null } })).includes("VF-038"));
  assert.ok(all(rec({ cuota: "0", importe: "100.00", line: { regime: "01", exempt: "E5", rate: null, cuota: null } })).includes("VF-038"));
  const ipsi = recordFindings(one(rec({ line: { tax: "02", regime: null } }))).filter((f) => f.rule === "VF-038");
  assert.equal(ipsi.length, 1);
  assert.equal(ipsi[0].severity, "warning");
});

// VF-043 to VF-047: the code lists of AEAT's schema, dates against its clock, the VAT
// rate list by date, NIF-IVA prefixes around Brexit and the Generador block.
const buyer = (country, type, id) => `<sum1:Destinatarios><sum1:IDDestinatario><sum1:NombreRazon>B</sum1:NombreRazon><sum1:IDOtro>${country ? `<sum1:CodigoPais>${country}</sum1:CodigoPais>` : ""}<sum1:IDType>${type}</sum1:IDType><sum1:ID>${id}</sum1:ID></sum1:IDOtro></sum1:IDDestinatario></sum1:Destinatarios>`;
const NOW = new Date("2026-11-15T12:00:00Z");
const at = (xml) => recordFindings(one(xml), { now: NOW }).map((f) => f.rule);
const dated = (date, line, extra = "") => rec({ date, generated: `${date.split("-").reverse().join("-")}T10:00:00+01:00`, cuota: line.cuota, importe: (100 + Number(line.cuota)).toFixed(2), line, extra });

test("VF-043: values outside the schema's code lists (AEAT 1101, 1111, 1218, 1246, 1212)", () => {
  assert.deepEqual(at(rec({ dest: buyer("FR", "02", "FR12345678901") })), []);
  assert.deepEqual(at(rec({ dest: buyer("US", "04", "123") })), []);
  assert.deepEqual(at(rec({ dest: buyer(null, "02", "FR12345678901") })), []);
  assert.ok(at(rec({ dest: buyer("UK", "04", "123") })).includes("VF-043"), "UK is not ISO 3166 (GB is)");
  assert.ok(at(rec({ dest: buyer("EL", "04", "123") })).includes("VF-043"), "Greece is GR in the list");
  assert.ok(at(rec({ dest: buyer(null, "04", "123") })).includes("VF-043"), "1111: only IDType 02 may omit CodigoPais");
  assert.ok(at(rec({ dest: buyer("US", "08", "123") })).includes("VF-043"));
  assert.ok(at(rec({ line: { tax: "04" } })).includes("VF-043"));
  assert.ok(at(rec({ line: { regime: "12" } })).includes("VF-043"));
  assert.ok(!at(rec({ line: { regime: "17" } })).includes("VF-043"));
  assert.ok(at(rec({ extra: "<sum1:SistemaInformatico><sum1:NIF>A39200019</sum1:NIF><sum1:IndicadorMultiplesOT>X</sum1:IndicadorMultiplesOT></sum1:SistemaInformatico>" })).includes("VF-043"));
});

test("VF-044: dates against the AEAT's clock (1133, 1134, 1146, 1173)", () => {
  assert.ok(at(rec({ extra: "<sum1:FechaOperacion>01-03-2006</sum1:FechaOperacion>" })).includes("VF-044"), "1134: over twenty years old");
  assert.ok(!at(rec({ extra: "<sum1:FechaOperacion>01-03-2025</sum1:FechaOperacion>" })).includes("VF-044"));
  assert.ok(at(rec({ extra: "<sum1:FechaOperacion>10-04-2025</sum1:FechaOperacion>" })).includes("VF-044"), "1146: operation after issue");
  assert.ok(!at(rec({ line: { regime: "15" }, extra: "<sum1:FechaOperacion>10-04-2025</sum1:FechaOperacion>" })).includes("VF-044"), "regime 15 may invoice ahead");
  const future = at(rec({ line: { regime: "14" }, extra: "<sum1:FechaOperacion>10-01-2027</sum1:FechaOperacion>" }));
  assert.ok(!future.includes("VF-044"), "1173: regime 14 may carry a future date");
  assert.equal(at(rec({ extra: "<sum1:FechaOperacion>10-01-2027</sum1:FechaOperacion>" })).filter((r) => r === "VF-044").length, 2, "1146 and 1173 both");
  // The default clock is the real one: a record dated far ahead still trips 1173 today.
  assert.ok(recordFindings(one(rec({ extra: "<sum1:FechaOperacion>10-01-2999</sum1:FechaOperacion>" }))).some((f) => f.rule === "VF-044"));
});

test("VF-045: VAT rates by date (1124, 1194, 1235, 1236, 1132)", () => {
  assert.deepEqual(at(dated("15-11-2024", { rate: "2.00", cuota: "2.00" })), []);
  assert.deepEqual(at(dated("15-11-2024", { rate: "7.5", cuota: "7.50" })), []);
  assert.deepEqual(at(dated("02-04-2025", { rate: "10.00", cuota: "10.00" })), []);
  assert.ok(at(dated("02-04-2025", { rate: "2.00", cuota: "2.00" })).includes("VF-045"), "2% ended with 2024");
  assert.ok(at(dated("02-04-2025", { rate: "7.50", cuota: "7.50" })).includes("VF-045"));
  assert.ok(at(dated("02-04-2025", { rate: "5.00", cuota: "5.00" })).includes("VF-045"), "5% ended 30-09-2024 (1194)");
  assert.ok(at(dated("02-04-2025", { rate: "18.00", cuota: "18.00" })).includes("VF-045"), "18% up to 2012 only (1132)");
  const odd = recordFindings(one(dated("02-04-2025", { rate: "11.00", cuota: "11.00" })), { now: NOW }).find((f) => f.rule === "VF-045");
  assert.equal(odd.severity, "warning", "1124: a rate outside the named ones is a warning");
  assert.ok(!at(dated("02-04-2025", { tax: "03", rate: "7.00", cuota: "7.00" })).includes("VF-045"), "IGIC rates are not checked");
  // FechaOperacion, when given, decides: a 2% operation in December 2024 invoiced in January 2025.
  assert.ok(!at(dated("10-01-2025", { rate: "2.00", cuota: "2.00" }, "<sum1:FechaOperacion>20-12-2024</sum1:FechaOperacion>")).includes("VF-045"));
});

test("VF-046: GB and XI VAT numbers around Brexit (1254, 1255)", () => {
  assert.ok(at(rec({ dest: buyer("GB", "02", "GB123456789") })).includes("VF-046"));
  assert.ok(!at(rec({ dest: buyer("GB", "04", "GB123456789") })).includes("VF-046"));
  assert.ok(!at(rec({ dest: buyer(null, "02", "XI123456789") })).includes("VF-046"));
});

const anul = (inner) => `<sum1:RegistroAnulacion xmlns:sum1="${NS}"><sum1:IDVersion>1.0</sum1:IDVersion><sum1:IDFactura><sum1:IDEmisorFacturaAnulada>89890001K</sum1:IDEmisorFacturaAnulada><sum1:NumSerieFacturaAnulada>A1</sum1:NumSerieFacturaAnulada><sum1:FechaExpedicionFacturaAnulada>02-04-2025</sum1:FechaExpedicionFacturaAnulada></sum1:IDFactura>${inner}<sum1:Encadenamiento><sum1:PrimerRegistro>S</sum1:PrimerRegistro></sum1:Encadenamiento><sum1:FechaHoraHusoGenRegistro>2025-04-03T10:00:00+02:00</sum1:FechaHoraHusoGenRegistro><sum1:TipoHuella>01</sum1:TipoHuella><sum1:Huella>${"A".repeat(64)}</sum1:Huella></sum1:RegistroAnulacion>`;
const gen = (by, ids) => `${by ? `<sum1:GeneradoPor>${by}</sum1:GeneradoPor>` : ""}${ids === null ? "" : `<sum1:Generador><sum1:NombreRazon>G</sum1:NombreRazon>${ids}</sum1:Generador>`}`;
const codes47 = (xml) => recordFindings(one(xml), { now: NOW }).filter((f) => f.rule === "VF-047").map((f) => f.fix.match(/AEAT code (\d+)/)[1]);

test("VF-047: the Generador block of a cancellation (1224-1231, 1258, 1259)", () => {
  const nif = "<sum1:NIF>A39200019</sum1:NIF>";
  const otro = (c, t) => `<sum1:IDOtro><sum1:CodigoPais>${c}</sum1:CodigoPais><sum1:IDType>${t}</sum1:IDType><sum1:ID>X1</sum1:ID></sum1:IDOtro>`;
  assert.deepEqual(codes47(anul("")), []);
  assert.deepEqual(codes47(anul(gen("T", nif))), []);
  assert.deepEqual(codes47(anul(gen("E", "<sum1:NIF>89890001K</sum1:NIF>"))), []);
  assert.deepEqual(codes47(anul(gen("D", otro("ES", "03")))), []);
  assert.deepEqual(codes47(anul(gen("T", null))), ["1224"]);
  assert.deepEqual(codes47(anul(gen(null, nif))), ["1224"]);
  assert.deepEqual(codes47(anul(gen("X", nif))), ["1225"]);
  assert.deepEqual(codes47(anul(gen("E", otro("FR", "02")))), ["1227"]);
  assert.deepEqual(codes47(anul(gen("T", nif + otro("FR", "02")))), ["1228"]);
  assert.deepEqual(codes47(anul(gen("T", otro("ES", "07")))), ["1229"]);
  assert.deepEqual(codes47(anul(gen("D", otro("ES", "06")))), ["1230"]);
  assert.deepEqual(codes47(anul(gen("T", "<sum1:NIF>89890001K</sum1:NIF>"))), ["1259"]);
  assert.deepEqual(codes47(anul(gen("T", "<sum1:NIF>A3920001</sum1:NIF>"))), ["1258"]);
  assert.ok(recordFindings(one(anul(gen("T", otro("FR", "09")))), { now: NOW }).some((f) => f.rule === "VF-043" && /1231/.test(f.fix)));
});
