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
