import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkCfdi, typeProblem } from "./cfdi.mjs";
import { stationMode, productHazard, isHazardCode, unpack } from "./cartaporte31.mjs";
import { ESTACIONES, SIN_MODO, PELIGROSOS, CONFIG, PERMISOS } from "./cartaporte-data.mjs";
import { runMutations, MUTATIONS, SEEDS } from "./eval/cartaporte-mutations.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const seeds = SEEDS.map((f) => [f, read(f)]);
const road = read("cfdi-4.0-cp31-road.xml");
const rules = (t) => checkCfdi(t).findings.map((f) => f.rule);

test("five synthetic waybills (road, international road, air, rail, sea) draw no finding", () => {
  const modes = new Set();
  for (const [f, t] of seeds) {
    const r = checkCfdi(t);
    assert.deepEqual(r.findings, [], f);
    assert.deepEqual(r.skipped, [], f);
    assert.equal(r.meta.waybills, 1);
    for (const m of r.meta.modes) modes.add(m);
  }
  assert.deepEqual([...modes].sort(), ["air", "rail", "road", "sea"]);
  assert.equal(checkCfdi(road).meta.hazardous, true);
});

test("every planted waybill defect is caught by the rule named for it", () => {
  const ran = new Set();
  for (const [f, t] of seeds) {
    const { clean, results } = runMutations(t);
    assert.deepEqual(clean, [], f);
    for (const r of results) {
      assert.notEqual(r.status, "missed", `${f}: ${r.name}: got ${r.got}`);
      if (r.status === "caught") ran.add(r.name);
    }
  }
  assert.equal(ran.size, MUTATIONS.length);
});

test("the catalogue columns: station modes, hazardous product keys, trailers and permits", () => {
  assert.equal(stationMode("PM001"), "02"); // Rosarito, a port
  assert.equal(stationMode("EA0001"), "03"); // an airport
  assert.equal(stationMode("Q0736"), "04"); // Santo Niño, a rail station
  assert.equal(stationMode("EA001"), null); // in catCartaPorte.xsd, no row with a mode in the mirror
  assert.equal(stationMode("ZZ9999"), undefined);
  // 5,280 stations with a mode + 3,167 without = the XSD's 8,447 distinct codes.
  const withMode = Object.values(ESTACIONES).reduce((n, p) => n + unpack(p).size, 0);
  assert.equal(withMode + unpack(SIN_MODO).size, 8447);
  assert.equal(unpack(PELIGROSOS).size, 4686);
  assert.ok(isHazardCode("1203") && isHazardCode("M0001") && !isHazardCode("0000"));
  assert.equal(productHazard("15101515"), "1"); // premium petrol
  assert.equal(productHazard("10171701"), "0,1"); // weed killers
  assert.equal(productHazard("43211503"), "0"); // notebook computers
  assert.equal(CONFIG.T3S2, "1");
  assert.equal(CONFIG.C2, "0");
  assert.equal(CONFIG.VL, "0,1");
  assert.equal(PERMISOS.TPAF01, "01");
  assert.equal(PERMISOS.TPTA01, "03");
  assert.equal(PERMISOS.TPXX00, "01,02,03");
});

test("a quantity sent to a destination that is not in Ubicaciones (seen on a PAC-stamped file)", () => {
  const t = road.replace('IDDestino="DE000002"', 'IDDestino="DE000003"');
  const f = checkCfdi(t).findings;
  assert.deepEqual(f.map((x) => x.rule), ["MX-071"]);
  assert.match(f[0].message, /IDDestino DE000003 is not the IDUbicacion of any location/);
});

test("PesoBrutoTotal in another unit is named as not compared", () => {
  const t = road.replace('UnidadPeso="KGM"', 'UnidadPeso="TNE"');
  const r = checkCfdi(t);
  assert.deepEqual(r.findings, []);
  assert.ok(r.skipped.some((s) => /UnidadPeso is TNE/.test(s)));
});

test("a version 3.0 or 2.0 complement is named, not read", () => {
  for (const v of ["30", "20"]) {
    const t = road.replaceAll("CartaPorte31", `CartaPorte${v}`);
    const f = checkCfdi(t).findings.filter((x) => x.rule === "MX-070");
    assert.equal(f.length, 1);
    assert.match(f[0].message, new RegExp(`version ${v[0]}\\.${v[1]}`));
  }
});

test("fractionDigits limits the value, not the spelling: trailing zeros pass, as in xmllint", () => {
  const fd2 = { base: "decimal", fractionDigits: 2 };
  assert.equal(typeProblem(fd2, "27.8900"), "");
  assert.equal(typeProblem(fd2, "27.890"), "");
  assert.match(typeProblem(fd2, "27.891"), /more than 2 decimals/);
  // A real stamped waybill carried PesoBrutoVehicular="27.8900" (fractionDigits 2).
  const t = road.replace('PesoBrutoVehicular="41.50"', 'PesoBrutoVehicular="41.5000"');
  assert.deepEqual(rules(t), []);
});

test("without a Carta Porte complement nothing here runs", () => {
  const r = checkCfdi(read("cfdi-4.0-invoice.xml"));
  assert.equal(r.meta.waybills, undefined);
  assert.ok(!r.findings.some((f) => /^MX-07/.test(f.rule)));
});

// ---- MX-080: a Mexican address against c_Estado, c_Municipio, c_CodigoPostal and c_Colonia ----
const origin = 'Calle="Avenida Paseo Tabasco" NumeroExterior="1203" Municipio="004" Estado="TAB" Pais="MEX" CodigoPostal="86000"';
const withOrigin = (attrs) => road.replace(origin, attrs);
const mx080 = (t) => checkCfdi(t).findings.filter((f) => f.rule === "MX-080");

test("MX-080: the postal code's municipality, locality and colonia from SAT's catalogues", () => {
  // c_CodigoPostal: 86000 is TAB 004 locality 02; c_Colonia lists 0001, 0002 and 1477 for it.
  assert.deepEqual(mx080(withOrigin(`${origin} Localidad="02" Colonia="1477"`)), []);
  const m = mx080(withOrigin(origin.replace('Municipio="004"', 'Municipio="005"')));
  assert.equal(m.length, 1);
  assert.match(m[0].message, /^Location 1: Municipio 005 is not the municipality of postal code 86000: c_CodigoPostal gives TAB 004\.$/);
  assert.ok(m[0].path.endsWith("/Ubicaciones/Ubicacion[1]/Domicilio/@Municipio"));
  assert.match(mx080(withOrigin(`${origin} Localidad="03"`))[0].message, /Localidad 03 is not the locality of postal code 86000/);
  assert.match(mx080(withOrigin(`${origin} Colonia="0003"`))[0].message, /Colonia 0003 is not a c_Colonia code of postal code 86000, which lists 3/);
});

test("MX-080: state codes, municipality codes of the state, and the postal code's state", () => {
  assert.match(mx080(withOrigin(origin.replace('Estado="TAB"', 'Estado="Tabasco"')))[0].message, /Estado "Tabasco" is not a c_Estado code/);
  assert.match(mx080(withOrigin(origin.replace('Municipio="004"', 'Municipio="999"')))[0].message, /Municipio 999 is not a c_Municipio code of TAB/);
  assert.match(mx080(withOrigin(origin.replace('CodigoPostal="86000"', 'CodigoPostal="24100"')))[0].message, /CodigoPostal 24100 belongs to CAM in c_CodigoPostal, not to Estado TAB/);
  assert.match(mx080(withOrigin(origin.replace('CodigoPostal="86000"', 'CodigoPostal="8600"')))[0].message, /CodigoPostal "8600" is not a Mexican postal code/);
});

test("MX-080: names instead of codes are skipped and said; foreign addresses and empty catalogue columns are left alone", () => {
  const r = checkCfdi(withOrigin(origin.replace('Municipio="004"', 'Municipio="Centro" Colonia="Centro Delegacional"')));
  assert.deepEqual(r.findings.filter((f) => f.rule === "MX-080"), []);
  assert.ok(r.skipped.some((s) => /^MX-080 \(addresses\): Municipio, Colonia written as a name/.test(s)), r.skipped.join(" | "));
  // 86001 is in TAB's block but its catalogue row names no municipality: nothing to compare.
  assert.deepEqual(mx080(withOrigin(origin.replace('CodigoPostal="86000"', 'CodigoPostal="86001"').replace('Municipio="004"', 'Municipio="005"'))), []);
  assert.deepEqual(mx080(withOrigin(origin.replace('Pais="MEX"', 'Pais="USA"').replace('Estado="TAB"', 'Estado="TX"'))), []);
});
