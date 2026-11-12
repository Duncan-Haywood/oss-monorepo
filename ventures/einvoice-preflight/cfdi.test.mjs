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

// Red-team guards (2026-11-12): each test below fails with a code mutant, or the defect, that got through.
const stampedAt = (t) => good.replace("</cfdi:Comprobante>", `<cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="5FB2822E-396D-4725-8521-CDC4BDD20CCF" FechaTimbrado="${t}" RfcProvCertif="SAT970701NN3" SelloCFD="x" NoCertificadoSAT="30001000000500003456" SelloSAT="x"/></cfdi:Complemento></cfdi:Comprobante>`);

test("MX-036: stamped exactly 72 hours after Fecha is inside the window; one second later is not", () => {
  assert.deepEqual(checkCfdi(stampedAt("2026-11-13T10:15:00")).findings, []);
  assert.deepEqual(checkCfdi(stampedAt("2026-11-13T10:15:01")).findings.map((f) => f.rule), ["MX-036"]);
});

test("MX-034: a summary Traslado Base that is not the lines' bases summed", () => {
  const r = checkCfdi(good.replace('Base="3550.50"', 'Base="3551.50"')).findings;
  assert.deepEqual(r.map((f) => f.rule), ["MX-034"]);
  assert.match(r[0].message, /Base 3551\.50 is not the sum of the lines' bases \(3550\.50\)/);
});

test("MX-023: a line tax Base of 0 is named, not only the schema minimum", () => {
  const r = checkCfdi(good.replace('Base="850.50"', 'Base="0"')).findings;
  assert.ok(r.some((f) => f.rule === "MX-023" && /Base must be greater than 0/.test(f.message)));
});

test("MX-012: a payroll CFDI in USD is told to use MXN; in MXN it is not", () => {
  const n = good.replace('TipoDeComprobante="I"', 'TipoDeComprobante="N"');
  const usd = checkCfdi(n.replace('Moneda="MXN"', 'Moneda="USD" TipoCambio="17.25"')).findings;
  assert.ok(usd.some((f) => f.rule === "MX-012" && /payroll/.test(f.message)));
  assert.ok(!checkCfdi(n).findings.some((f) => /payroll/.test(f.message)));
});

test("an unreadable or empty line Base is a schema fault only: the correct summary is not blamed", () => {
  for (const v of ["", "abc"]) {
    const r = checkCfdi(good.replace('Base="850.50"', `Base="${v}"`)).findings;
    assert.deepEqual(r.map((f) => f.rule), ["MX-003"], v);
  }
});

// Red-team guards, second pass (2026-11-12).
test("a hex, exponent or blank amount is a schema fault only: the sums do not read it as a number", () => {
  // Number() reads "0x10" as 16, "1e3" as 1000 and " " as 0; the schema calls them not numbers.
  for (const v of ["0x10", "1e3", " ", "Infinity"]) {
    const line = checkCfdi(good.replace('Importe="850.50"', `Importe="${v}"`)).findings;
    assert.deepEqual([...new Set(line.map((f) => f.rule))], ["MX-003"], `Concepto Importe ${JSON.stringify(v)}`);
    const base = checkCfdi(good.replace('Base="850.50"', `Base="${v}"`)).findings;
    assert.deepEqual(base.map((f) => f.rule), ["MX-003"], `Traslado Base ${JSON.stringify(v)}`);
  }
  // Whitespace around a decimal is collapsed by the schema, so it still reads as the number.
  assert.deepEqual(checkCfdi(good.replace('Total="3848.58"', 'Total=" 3848.58 "')).findings, []);
});

test("an unreadable line tax Importe leaves the summary's group Importe unjudged", () => {
  const r = checkCfdi(good.replace('Importe="136.08"', 'Importe="abc"')).findings;
  assert.ok(!r.some((f) => f.rule === "MX-034" && /Importe .* is not the sum of the lines'/.test(f.message)), JSON.stringify(r));
});

test("MX-032: one line tax group and no summary is still a missing summary", () => {
  const oneTax = good
    .replace(/<cfdi:Retenciones>\s*<cfdi:Retencion Base="2700.00"[^>]*\/>\s*<\/cfdi:Retenciones>/, "")
    .replace(/<cfdi:Impuestos TotalImpuestosRetenidos[\s\S]*?<\/cfdi:Impuestos>/, "");
  assert.ok(checkCfdi(oneTax).findings.some((f) => f.rule === "MX-032"));
});

test("detection reads the first 4096 characters, no more", () => {
  const tag = '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"/>';
  const end = tag.indexOf("cfd/4") + 5; // the namespace's last character
  const at = (n) => `<!--${"x".repeat(n - end - 7)}-->` + tag; // the "4" lands at index n - 1
  assert.ok(looksLikeCfdi(at(4096)));
  assert.ok(!looksLikeCfdi(at(4097)));
});

// ---------- regimes and uses (MX-015..MX-017), from SAT's catCFDI spreadsheet columns ----------
import { personType, checkRegimen } from "./cfdi.mjs";
import { REGIMEN, USO } from "./cfdi-regimen-data.mjs";

const rules = (text) => checkCfdi(text).findings.map((f) => f.rule);
const asPerson = (t) => t.replace('Rfc="URE180429TM6"', 'Rfc="GODE561231GR8"');

test("the regime table matches SAT's catalogue on the rows people trip over", () => {
  assert.equal(Object.keys(REGIMEN).length, 19);
  assert.equal(Object.keys(USO).length, 24);
  assert.deepEqual(REGIMEN["601"], { texto: "General de Ley Personas Morales", fisica: false, moral: true });
  assert.ok(REGIMEN["626"].fisica && REGIMEN["626"].moral); // RESICO: both
  assert.ok(REGIMEN["616"].fisica && !REGIMEN["616"].moral);
  assert.ok(!USO.D01.moral && USO.D01.fisica);
  assert.deepEqual(USO.CN01.regimenes, ["605"]);
  assert.ok(!USO.G03.regimenes.includes("616") && USO.G02.regimenes.includes("616"));
  assert.equal(USO.S01.regimenes.length, 19);
});

test("person type comes from the RFC length; generic RFCs have none", () => {
  assert.equal(personType("EKU9003173C9"), "moral");
  assert.equal(personType("GODE561231GR8"), "fisica");
  assert.equal(personType("XAXX010101000"), null);
  assert.equal(personType("XEXX010101000"), null);
  assert.equal(personType("ABC"), null);
  assert.equal(personType(undefined), null);
});

test("MX-015: a person's regime on a company issuer", () => {
  const t = good.replace('RegimenFiscal="601"/>', 'RegimenFiscal="612"/>');
  assert.deepEqual(rules(t), ["MX-015"]);
  assert.match(checkCfdi(t).findings[0].message, /612 \(Personas Físicas con Actividades Empresariales y Profesionales\).*company/);
});

test("MX-016: a company regime or a personal-deduction use on the wrong kind of receiver", () => {
  assert.deepEqual(rules(good.replace('RegimenFiscalReceptor="601"', 'RegimenFiscalReceptor="605"')), ["MX-016"]);
  assert.deepEqual(rules(good.replace('UsoCFDI="G03"', 'UsoCFDI="D01"')), ["MX-016"]);
  assert.deepEqual(rules(asPerson(good)), ["MX-016"]); // person RFC, company regime 601
  assert.deepEqual(rules(asPerson(good).replace('RegimenFiscalReceptor="601"', 'RegimenFiscalReceptor="612"')), []);
  assert.deepEqual(rules(asPerson(good).replace('RegimenFiscalReceptor="601"', 'RegimenFiscalReceptor="612"').replace('UsoCFDI="G03"', 'UsoCFDI="D01"')), []);
});

test("MX-017: a use SAT does not allow with the receiver's regime names the ones it does", () => {
  const t = asPerson(good).replace('RegimenFiscalReceptor="601"', 'RegimenFiscalReceptor="616"');
  const f = checkCfdi(t).findings;
  assert.deepEqual(f.map((x) => x.rule), ["MX-017"]);
  assert.match(f[0].message, /G03 .* not allowed with RegimenFiscalReceptor 616/);
  assert.match(f[0].fix, /allowed uses are G02, S01\.$/);
  assert.ok(!/GODE561231GR8/.test(JSON.stringify(f)), "findings never repeat an RFC");
  // payroll use with a business regime
  assert.deepEqual(rules(asPerson(good).replace('RegimenFiscalReceptor="601"', 'RegimenFiscalReceptor="612"').replace('UsoCFDI="G03"', 'UsoCFDI="CN01"')), ["MX-017"]);
  // a company in the foreign-resident regime may only take S01 (or CP01 on a payment)
  assert.deepEqual(rules(good.replace('RegimenFiscalReceptor="601"', 'RegimenFiscalReceptor="610"')), ["MX-017"]);
  assert.deepEqual(rules(good.replace('RegimenFiscalReceptor="601"', 'RegimenFiscalReceptor="610"').replace('UsoCFDI="G03"', 'UsoCFDI="S01"')), []);
});

test("regime checks leave generic receivers to MX-014 and payment uses to pagos20", () => {
  const pub = good.replace('Rfc="URE180429TM6"', 'Rfc="XAXX010101000"');
  assert.deepEqual([...new Set(rules(pub))], ["MX-014"]);
  const f = [];
  checkRegimen({ Rfc: "EKU9003173C9", RegimenFiscal: "601" }, { Rfc: "GODE561231GR8", RegimenFiscalReceptor: "616", UsoCFDI: "G03" }, "P", f);
  assert.deepEqual(f, []);
  checkRegimen({}, { Rfc: "GODE561231GR8", RegimenFiscalReceptor: "999", UsoCFDI: "ZZZ" }, "I", f);
  assert.deepEqual(f, [], "codes outside the catalogue are MX-003's");
});

test("every regime/use pair: a finding exactly when SAT's table forbids it", () => {
  let allowed = 0, total = 0;
  for (const [rfc, kind] of [["GODE561231GR8", "fisica"], ["EKU9003173C9", "moral"]]) {
    for (const reg of Object.keys(REGIMEN)) {
      if (!REGIMEN[reg][kind]) continue;
      for (const uso of Object.keys(USO)) {
        if (uso === "CP01") continue;
        const f = [];
        checkRegimen({}, { Rfc: rfc, RegimenFiscalReceptor: reg, UsoCFDI: uso }, "I", f);
        const ok = USO[uso][kind] && USO[uso].regimenes.includes(reg);
        total++; if (ok) allowed++;
        assert.equal(f.length === 0, ok, `${kind} ${reg} ${uso}`);
      }
    }
  }
  assert.deepEqual([allowed, total], [245, 483]);
});
