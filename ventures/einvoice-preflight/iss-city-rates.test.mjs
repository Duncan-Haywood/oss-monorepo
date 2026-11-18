import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cityRateProblem, spToLc, CITIES } from "./iss-city-rates.mjs";
import { checkAbrasf } from "./abrasf.mjs";
import { checkNfse } from "./nfse.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const swap = (base, from, to, all = false) => { assert.ok(base.includes(from), from); return all ? base.split(from).join(to) : base.replace(from, to); };
const rules = (r) => r.findings.map((f) => f.rule);
const SP = "3550308";
const judge = (item, rate, extra = {}) => cityRateProblem({ city: SP, item, rate, year: 2026, ...extra });

test("São Paulo's numbers to LC 116's: the four shifted runs, nothing else", () => {
  for (const [sp, lc] of [["3.01", "3.02"], ["3.04", "3.05"], ["7.13", "7.13"], ["7.14", "7.16"], ["7.20", "7.22"], ["7.21", "7.21"], ["13.01", "13.02"], ["13.04", "13.05"], ["17.06", "17.06"], ["17.07", "17.08"], ["17.24", "17.25"], ["1.07", "1.07"], ["40.01", "40.01"]]) assert.equal(spToLc(sp), lc, sp);
});

test("art. 16's general rates by LC 116 subitem", () => {
  // III: 2.9% for item 1 except 1.09, and São Paulo's 17.24 (LC 17.25).
  for (const item of ["1.01", "1.05", "1.07", "17.25"]) { assert.equal(judge(item, "2.90"), null, item); assert.ok(judge(item, "5.00"), item); }
  // I, a: 2% for items 4 and 5, 1.09 and 13.04 (LC 13.05).
  for (const item of ["4.01", "5.09", "1.09", "13.05", "8.01", "21.01", "17.08"]) { assert.equal(judge(item, "2.00"), null, item); assert.ok(judge(item, "2.90"), item); }
  // II: 2.5% for São Paulo's 17.09, LC 17.10.
  assert.equal(judge("17.10", "2.50"), null);
  assert.ok(judge("17.09", "2.50"), "LC 17.09 (perícias) is not São Paulo's 17.09");
  // IV: 5% for the rest.
  for (const item of ["17.01", "6.01", "7.02", "14.01"]) assert.equal(judge(item, "5.00"), null, item);
});

test("a rate set for part of a subitem is accepted beside the general rate", () => {
  assert.equal(judge("16.02", "2.00"), null, "school transport and taxis");
  assert.equal(judge("16.02", "5.00"), null);
  assert.equal(judge("17.12", "2.00"), null, "vouchers and platform administration (São Paulo's 17.11)");
  assert.equal(judge("3.03", "2.50"), null, "stands (São Paulo's 3.02)");
  const m = judge("7.10", "3.00").message;
  assert.match(m, /sets 5% for LC 116 subitem 7\.10 \(IV\), or 2% for cleaning, maintenance and upkeep of buildings/);
});

test("the message names São Paulo's own number for a shifted subitem", () => {
  assert.match(judge("17.25", "5.00").message, /São Paulo's own list numbers it 17\.24; LC 116 numbers it 17\.25/);
  assert.doesNotMatch(judge("1.07", "5.00").message, /own list numbers/);
});

test("the São Paulo number in the message is the inverse of spToLc at every run's ends", () => {
  // Each shifted run's first and last LC subitem, and the unshifted neighbours either side.
  const shifted = ["3.02", "3.05", "13.02", "13.05", "7.16", "7.22", "17.08", "17.25"];
  for (const lc of shifted) {
    const m = /São Paulo's own list numbers it (\d+\.\d+); LC 116 numbers it (\d+\.\d+)/.exec(judge(lc, "9.00").message);
    assert.ok(m, lc);
    assert.equal(m[2], lc);
    assert.equal(spToLc(m[1]), lc, `${m[1]} maps back to ${lc}`);
  }
  for (const lc of ["3.01", "3.06", "13.01", "13.06", "7.15", "7.23", "17.07", "17.26"]) assert.doesNotMatch(judge(lc, "9.00").message, /own list numbers/, lc);
});

test("not judged: other cities, years outside 2024-2028, no item, no rate", () => {
  assert.equal(cityRateProblem({ city: "3106200", item: "1.07", rate: "4.00", year: 2026 }), null, "Belo Horizonte: no table yet");
  assert.equal(judge("1.07", "5.00", { year: 2023 }), null);
  assert.equal(judge("1.07", "5.00", { year: 2029 }), null);
  assert.equal(judge("1.07", "5.00", { year: NaN }), null);
  assert.equal(judge(null, "5.00"), null);
  assert.equal(judge("1.07", "0"), null);
  // A 1.00 fraction is read both ways.
  assert.equal(judge("1.07", "0.029"), null);
  assert.ok(CITIES[SP].years[0] === 2024 && CITIES[SP].years[1] === 2028);
});

test("ABR-025 on the ABRASF fixture (ISS due in São Paulo)", () => {
  const abr = read("abrasf-compnfse-204.xml");
  assert.ok(!rules(checkAbrasf(abr)).includes("ABR-025"));
  // 5% would be inside the national band but not São Paulo's rate for 1.07.
  const five = swap(swap(abr, "<Aliquota>2.90</Aliquota>", "<Aliquota>5.00</Aliquota>", true), "<ValorIss>24.65</ValorIss>", "<ValorIss>42.50</ValorIss>", true);
  const f = checkAbrasf(five).findings.filter((x) => x.rule === "ABR-025");
  assert.equal(f.length, 1);
  assert.match(f[0].message, /São Paulo's Lei 13\.701\/2003 art\. 16 sets 2\.9% for LC 116 subitem 1\.07 \(III\)/);
  assert.deepEqual(rules(checkAbrasf(five)), ["ABR-025"]);
  // Due in Rio instead: Rio's art. 33 sets 5% for 1.07, so nothing is said.
  assert.ok(!rules(checkAbrasf(swap(five, "<MunicipioIncidencia>3550308", "<MunicipioIncidencia>3304557"))).includes("ABR-025"));
  // A Simples Nacional provider is not judged.
  assert.ok(!rules(checkAbrasf(swap(five, "<OptanteSimplesNacional>2", "<OptanteSimplesNacional>1"))).includes("ABR-025"));
  // An old competence is said, not judged.
  const old = checkAbrasf(swap(five, "<Competencia>2026-11-10", "<Competencia>2022-11-10", true));
  assert.ok(!rules(old).includes("ABR-025"));
  assert.match(old.skipped.join(" "), /São Paulo's own rate table is read for 2024-2028 competences only/);
});

test("NFSE-037 on the national fixture (cLocIncid São Paulo)", () => {
  const nac = read("nfse-nacional.xml");
  assert.ok(!rules(checkNfse(nac)).includes("NFSE-037"));
  const five = swap(swap(nac, "<pAliqAplic>2.90", "<pAliqAplic>5.00"), "<vISSQN>40.60", "<vISSQN>70.00");
  const f = checkNfse(five).findings.filter((x) => x.rule === "NFSE-037");
  assert.equal(f.length, 1);
  assert.equal(f[0].path, "/NFSe/infNFSe/valores/pAliqAplic");
  assert.match(f[0].message, /sets 2\.9% for LC 116 subitem 1\.01/);
  assert.ok(!rules(checkNfse(swap(five, "<opSimpNac>1", "<opSimpNac>3"))).includes("NFSE-037"));
  assert.ok(!rules(checkNfse(swap(five, "<cLocIncid>3550308", "<cLocIncid>3304557"))).includes("NFSE-037"));
  // A DPS has no cLocIncid: not judged.
  assert.ok(!rules(checkNfse(read("nfse-dps.xml"))).includes("NFSE-037"));
});

const RJ = "3304557";
const rio = (item, rate, extra = {}) => cityRateProblem({ city: RJ, item, rate, year: 2026, ...extra });

test("Rio de Janeiro, Lei 691/1984 art. 33: 5% general, 2% for any service, named 3%, 0.5% and 2.6%", () => {
  // I and II, 5 and 8: 5% and 2% are rates the law sets for every subitem.
  for (const item of ["1.07", "4.01", "14.05", "17.06", "31.01", "40.01"]) { assert.equal(rio(item, "5.00"), null, item); assert.equal(rio(item, "2.00"), null, item); }
  // Rates Rio never sets for a subitem: São Paulo's 2.9%, a 4%, a 2.5%.
  for (const [item, rate] of [["1.07", "2.90"], ["17.06", "4.00"], ["17.10", "2.50"], ["1.05", "3.50"]]) assert.ok(rio(item, rate), `${item} ${rate}`);
  // II, 1 (3%): construction and engineering, Rio's 7.15-7.18 being LC 7.17-7.20.
  for (const item of ["7.01", "7.02", "7.03", "7.04", "7.05", "7.17", "7.18", "7.19", "7.20"]) assert.equal(rio(item, "3.00"), null, item);
  assert.ok(rio("7.16", "3.00"), "LC 7.16 is forestry (Rio's 7.14), not dredging");
  assert.ok(rio("7.10", "3.00"));
  // II, 3 (3%): internet advertising is Rio's 17.24, LC 17.25; LC 17.24 (talks) is not.
  assert.equal(rio("17.25", "3.00"), null);
  assert.match(rio("17.24", "3.00").message, /Rio de Janeiro's own list numbers it 17\.23; LC 116 numbers it 17\.24/);
  // II, 21 (3%): oil and gas logistics, read where a logistics service is filed.
  for (const item of ["11.04", "16.02", "20.01"]) assert.equal(rio(item, "3.00"), null, item);
  // II, 7 (0.5%) only on 7.02 and 7.05; § 3 (2.6%) only on hospitals, 4.03.
  assert.equal(rio("7.02", "0.50"), null);
  assert.ok(rio("7.10", "0.50"));
  assert.equal(rio("4.03", "2.60"), null);
  assert.match(rio("4.01", "2.60").message, /sets 5% for LC 116 subitem 4\.01 \(I\), or 2% for a qualifying provider/);
  // A 1.00 fraction (ISSRio) is read both ways; outside 2024-2028 nothing is judged.
  assert.equal(rio("1.02", "0.05"), null);
  assert.ok(rio("1.02", "0.04"));
  assert.equal(rio("1.07", "2.90", { year: 2023 }), null);
});

test("ABR-025 and NFSE-037 where the ISS is due in Rio", () => {
  const abr = read("abrasf-compnfse-204.xml");
  // São Paulo's 2.9% on 1.07 moved to Rio: Rio's art. 33 has no 2.9%.
  const rj = swap(abr, "<MunicipioIncidencia>3550308", "<MunicipioIncidencia>3304557");
  const f = checkAbrasf(rj).findings.filter((x) => x.rule === "ABR-025");
  assert.equal(f.length, 1);
  assert.match(f[0].message, /Rio de Janeiro's Lei 691\/1984 art\. 33 sets 5% for LC 116 subitem 1\.07 \(I\)/);
  const nac = read("nfse-nacional.xml");
  const n = checkNfse(swap(nac, "<cLocIncid>3550308", "<cLocIncid>3304557")).findings.filter((x) => x.rule === "NFSE-037");
  assert.equal(n.length, 1);
  assert.match(n[0].message, /Rio de Janeiro's/);
});

const CWB = "4106902";
const cwb = (item, rate, extra = {}) => cityRateProblem({ city: CWB, item, rate, year: 2026, ...extra });

test("Curitiba, LC 40/2001 art. 4: whole-subitem rates by LC 116's own numbers", () => {
  // I (2%): collective transport, leasing, schools, the shows and events of item 12 that I, f-m
  // name, franchising (LC 134/2022, LC 17.08: Curitiba keeps 17.07 as "(VETADO)").
  for (const item of ["16.01", "15.09", "8.01", "12.01", "12.03", "12.04", "12.07", "12.08", "12.10", "12.11", "12.13", "17.08"]) {
    assert.equal(cwb(item, "2.00"), null, item);
    assert.match(cwb(item, "5.00").message, new RegExp(`sets 2% for LC 116 subitem ${item.replace(".", "\\.")} \\(I, [a-n]\\)`), item);
  }
  // II (2.5%): security, typesetting (LC 13.05, not São Paulo's 13.04), tyre retreading.
  for (const item of ["11.02", "13.05", "14.04"]) { assert.equal(cwb(item, "2.50"), null, item); assert.ok(cwb(item, "5.00"), item); }
  assert.ok(cwb("13.04", "2.50"), "13.04 is reprography in Curitiba's list");
  // III (4%): health plans and registries.
  for (const item of ["4.22", "4.23", "21.01"]) { assert.equal(cwb(item, "4.00"), null, item); assert.ok(cwb(item, "5.00"), item); }
  // IV (5%): the rest, with 2% beside it for exports and call centres (I, c and e).
  for (const item of ["1.07", "7.02", "17.06", "17.25", "40.01"]) { assert.equal(cwb(item, "5.00"), null, item); assert.equal(cwb(item, "2.00"), null, item); }
});

test("Curitiba: part-of-subitem rates, and rates the law never sets", () => {
  // Part of a subitem: 2.5% for cleaning (7.10), insurance (10.01), representation (10.09);
  // 4% for hospitals within 4.03. 5% stays acceptable beside them.
  for (const [item, rate] of [["7.10", "2.50"], ["10.01", "2.50"], ["10.09", "2.50"], ["4.03", "4.00"]]) { assert.equal(cwb(item, rate), null, `${item} ${rate}`); assert.equal(cwb(item, "5.00"), null, item); }
  // São Paulo's 2.9% for software, Rio's 3% for construction, a 4% outside III: none is Curitiba's.
  const m = cwb("1.07", "2.90").message;
  assert.match(m, /Curitiba's Lei Complementar 40\/2001 art\. 4 sets 5% for LC 116 subitem 1\.07 \(IV\), or 2% for a service for a recipient abroad/);
  assert.doesNotMatch(m, /own list numbers/, "Curitiba keeps LC 116's numbers: no renumbering note");
  assert.ok(cwb("7.02", "3.00"));
  assert.ok(cwb("17.01", "4.00"));
  assert.ok(cwb("7.10", "4.00"));
  assert.match(cwb("4.03", "3.00").message, /; 4% for hospitals, sanatoriums.*\(III, a\)/);
  // A 1.00 fraction is read both ways.
  assert.equal(cwb("11.02", "0.025"), null);
});

test("Curitiba before LC 146/2025: any services cooperative at 4% in 2024 and 2025", () => {
  assert.equal(cwb("17.01", "4.00", { year: 2025 }), null);
  assert.equal(cwb("7.02", "4.00", { year: 2024 }), null);
  assert.match(cwb("7.02", "3.00", { year: 2025 }).message, /4% for a services cooperative \(any kind until 9 June 2025\) \(III, b before LC 146\/2025\)/);
  assert.ok(cwb("17.01", "4.00", { year: 2026 }), "from 2026 only health-service cooperatives");
  assert.equal(cwb("17.01", "4.00", { year: 2023 }), null, "outside 2024-2028: not judged");
});

test("ABR-025 and NFSE-037 where the ISS is due in Curitiba", () => {
  // The ABRASF fixture's 2.9% on 1.07, moved to Curitiba: art. 4 has no 2.9%.
  const abr = read("abrasf-compnfse-204.xml");
  const f = checkAbrasf(swap(abr, "<MunicipioIncidencia>3550308", "<MunicipioIncidencia>4106902")).findings.filter((x) => x.rule === "ABR-025");
  assert.equal(f.length, 1);
  assert.match(f[0].message, /Curitiba's Lei Complementar 40\/2001 art\. 4 sets 5% for LC 116 subitem 1\.07 \(IV\)/);
  // At 5% (ValorIss to match) Curitiba says nothing.
  const five = swap(swap(swap(abr, "<MunicipioIncidencia>3550308", "<MunicipioIncidencia>4106902"), "<Aliquota>2.90</Aliquota>", "<Aliquota>5.00</Aliquota>", true), "<ValorIss>24.65</ValorIss>", "<ValorIss>42.50</ValorIss>", true);
  assert.deepEqual(rules(checkAbrasf(five)), []);
  const nac = read("nfse-nacional.xml");
  const n = checkNfse(swap(nac, "<cLocIncid>3550308", "<cLocIncid>4106902")).findings.filter((x) => x.rule === "NFSE-037");
  assert.equal(n.length, 1);
  assert.match(n[0].message, /Curitiba's/);
});
