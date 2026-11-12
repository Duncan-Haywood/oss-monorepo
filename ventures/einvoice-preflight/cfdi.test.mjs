import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkCfdi, looksLikeCfdi, importeBounds, taxBounds, currencyDecimals, typeProblem } from "./cfdi.mjs";
import { parseCfdiXml } from "./cfdi-xml.mjs";
import { runMutations, MUTATIONS } from "./eval/cfdi-mutations.mjs";
import { preflightDocuments } from "./report.mjs";

const good = readFileSync(new URL("./fixtures/cfdi-4.0-invoice.xml", import.meta.url), "utf8");

test("the example CFDI draws no finding", () => {
  const r = checkCfdi(good);
  assert.deepEqual(r.findings, []);
  assert.equal(r.meta.version, "4.0");
  assert.equal(r.meta.lines, 2);
  assert.equal(r.meta.stamped, false);
});

test("every planted defect is caught by the rule named for it", () => {
  const { clean, results } = runMutations(good);
  assert.deepEqual(clean, []);
  assert.equal(results.length, MUTATIONS.length);
  for (const r of results) assert.equal(r.status, "caught", `${r.name}: got ${r.got}`);
});

test("detected as CFDI, not as UBL; 3.3 is named, not read", () => {
  assert.ok(looksLikeCfdi(good));
  assert.ok(!looksLikeCfdi('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>'));
  const old = checkCfdi(good.replace('xmlns:cfdi="http://www.sat.gob.mx/cfd/4"', 'xmlns:cfdi="http://www.sat.gob.mx/cfd/3"').replace('Version="4.0"', 'Version="3.3"'));
  assert.deepEqual(old.findings.map((f) => f.rule), ["MX-001"]);
  assert.match(old.findings[0].message, /3\.3/);
});

test("the XML reader keeps non-ASCII attribute names and decodes entities", () => {
  const { root } = parseCfdiXml('<a:X xmlns:a="u" Año="2026" N="A &amp; B &#xD1;"/>');
  assert.equal(root.attrs["Año"], "2026");
  assert.equal(root.attrs.N, "A & B Ñ");
  assert.equal(root.ns, "u");
  assert.throws(() => parseCfdiXml('<!DOCTYPE x [<!ENTITY a "b">]><x/>'));
});

test("InformacionGlobal's Año is read and range-checked", () => {
  const g = good.replace("<cfdi:Emisor", '<cfdi:InformacionGlobal Periodicidad="04" Meses="11" Año="2018"/>\n  <cfdi:Emisor');
  const r = checkCfdi(g).findings;
  assert.deepEqual(r.map((f) => f.rule), ["MX-003"]);
  assert.match(r[0].message, /Año.*minimum 2019/);
});

test("line amount bounds follow the half-unit rule", () => {
  // 4 x 956.04 = 3824.16; written as 3824.15 by a real stamped sample, inside the bounds.
  const [lo, hi] = importeBounds("4", "956.04", 2);
  assert.ok(lo <= 3824.15 && 3824.15 <= hi);
  const [lo6, hi6] = importeBounds("1.000000", "8.620690", 6);
  assert.ok(lo6 <= 8.62069 && hi6 >= 8.62069 && hi6 - lo6 < 0.00001);
  const [tlo, thi] = taxBounds("2700.00", "0.160000", 2);
  assert.deepEqual([tlo, thi], [431.99, 432.01]); // one cent either side once rounded outward
});

test("currency decimals come from ISO 4217", () => {
  assert.equal(currencyDecimals("MXN"), 2);
  assert.equal(currencyDecimals("JPY"), 0);
  assert.equal(currencyDecimals("XXX"), 2);
});

test("catalogue lookups: compact runs and plain lists", () => {
  assert.equal(typeProblem({ ref: "c_ClaveProdServ" }, "86101700"), "");
  assert.match(typeProblem({ ref: "c_ClaveProdServ" }, "99999999"), /catalogue/);
  assert.equal(typeProblem({ ref: "c_CodigoPostal" }, "86000"), "");
  assert.equal(typeProblem({ ref: "c_ClaveUnidad" }, "H87"), "");
  assert.match(typeProblem({ ref: "c_RegimenFiscal" }, "602"), /catalogue/);
});

test("a foreign receiver needs ResidenciaFiscal; PPD with 99 passes", () => {
  const f = good.replace('Rfc="URE180429TM6"', 'Rfc="XEXX010101000"').replace('DomicilioFiscalReceptor="86991" RegimenFiscalReceptor="601" UsoCFDI="G03"', 'DomicilioFiscalReceptor="86000" RegimenFiscalReceptor="616" UsoCFDI="S01"');
  assert.deepEqual(checkCfdi(f).findings.map((x) => x.rule), ["MX-014"]);
  const ppd = good.replace('FormaPago="03"', 'FormaPago="99"').replace('MetodoPago="PUE"', 'MetodoPago="PPD"');
  assert.deepEqual(checkCfdi(ppd).findings, []);
});

test("local taxes skip the total check and say so", () => {
  const t = good.replace("</cfdi:Comprobante>", '<cfdi:Complemento><implocal:ImpuestosLocales xmlns:implocal="http://www.sat.gob.mx/implocal" version="1.0" TotaldeRetenciones="0" TotaldeTraslados="10.00"/></cfdi:Complemento></cfdi:Comprobante>');
  const r = checkCfdi(t.replace('Total="3848.58"', 'Total="3858.58"'));
  assert.deepEqual(r.findings, []);
  assert.match(r.skipped.join(" "), /ImpuestosLocales/);
});

test("the report routes a CFDI to its own rules", async () => {
  const bad = good.replace('Total="3848.58"', 'Total="3849.58"');
  const { reports, readErrors } = await preflightDocuments([{ name: "f.xml", source: bad }]);
  assert.deepEqual(readErrors, []);
  assert.match(reports[0].envelope, /Mexican CFDI 4\.0/);
  assert.deepEqual(reports[0].errors.map((e) => e.rule), ["MX-035"]);
});

test("findings never repeat an RFC", () => {
  const bad = good.replace('Rfc="EKU9003173C9"', 'Rfc="EKU9003173C8"');
  for (const f of checkCfdi(bad).findings) assert.doesNotMatch(JSON.stringify(f), /EKU9003173C/);
});
