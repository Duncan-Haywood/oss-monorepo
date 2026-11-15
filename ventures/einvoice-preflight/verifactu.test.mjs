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
const rules = (xml) => recordFindings(one(xml)).map((f) => f.rule);

test("AEAT's two worked examples (huella specification v0.1.2) reproduce", () => {
  assert.equal(huellaOf("IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00"), "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60");
  const first = one(alta());
  assert.deepEqual(recordFindings(first), []);
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
