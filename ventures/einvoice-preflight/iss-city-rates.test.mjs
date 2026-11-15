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
  assert.equal(cityRateProblem({ city: "3304557", item: "1.07", rate: "5.00", year: 2026 }), null);
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
  // Due in Rio instead: no São Paulo table applies.
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
