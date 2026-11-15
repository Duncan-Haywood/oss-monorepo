import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { issRateProblem, issBurdenProblem, issBand, lcSubitem } from "./iss-rate.mjs";
import { checkAbrasf } from "./abrasf.mjs";
import { checkNfse } from "./nfse.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const abr = read("abrasf-compnfse-204.xml");
const nac = read("nfse-nacional.xml");
const swap = (base, from, to, all = false) => { assert.ok(base.includes(from), from); return all ? base.split(from).join(to) : base.replace(from, to); };
const rules = (r) => r.findings.map((f) => f.rule);

test("LC 116 subitems from ABRASF and national codes", () => {
  for (const [c, want] of [["01.07", "1.07"], ["7.02", "7.02"], ["0702", "7.02"], ["702", "7.02"], ["16.01", "16.01"], ["1601", "16.01"], ["7.2", "7.02"], ["abc", null], ["", null]]) assert.equal(lcSubitem(c), want, c);
  assert.equal(lcSubitem("070201", true), "7.02");
  assert.equal(lcSubitem("160101", true), "16.01");
  assert.equal(lcSubitem("0702", true), null);
});

test("the band: 2% to 5%, scaled by art. 8-B in 2029-2032, none from 2033", () => {
  assert.deepEqual(issBand(2026), { min: 2, max: 5, cut: 0 });
  assert.deepEqual(issBand(NaN), { min: 2, max: 5, cut: 0 });
  assert.deepEqual(issBand(2029), { min: 1.8, max: 4.5, cut: 0.1 });
  assert.deepEqual(issBand(2032), { min: 1.2, max: 3, cut: 0.4 });
  assert.equal(issBand(2033), null);
});

test("rates inside, above and below the band", () => {
  for (const r of ["2.00", "5.00", "3.5", "0.05", "0.02", "0", "", "x"]) assert.equal(issRateProblem({ rate: r, item: "1.07", year: 2026 }), null, r);
  assert.equal(issRateProblem({ rate: "5.01", year: 2026 }).kind, "high");
  assert.equal(issRateProblem({ rate: "1.99", item: "1.07", year: 2026 }).kind, "low");
  assert.match(issRateProblem({ rate: "1.5", item: "17.01", year: 2026 }).message, /below the national minimum of 2%.*17\.01/);
  // The construction and public-transport subitems may go below 2%, never above 5%.
  for (const item of ["7.02", "7.05", "16.01"]) { assert.equal(issRateProblem({ rate: "1.00", item, year: 2026 }), null); assert.equal(issRateProblem({ rate: "6", item, year: 2026 }).kind, "high"); }
  // A fraction under 1 is tried both ways: 0.5 is 0.5% or 50%, both out.
  assert.match(issRateProblem({ rate: "0.5", item: "1.07" }).message, /read as 0\.5% or 50%/);
  // A percentage-only layout does not read 0.05 as 5%.
  assert.equal(issRateProblem({ rate: "0.05", item: "1.07", fraction: false }).kind, "low");
  // 2029: 5% is over the cut maximum of 4.5%; 1.9% is inside.
  assert.match(issRateProblem({ rate: "5.00", year: 2029 }).message, /art\. 8-B .*1\.8%-4\.5%/);
  assert.equal(issRateProblem({ rate: "1.9", item: "1.07", year: 2029 }), null);
  assert.equal(issRateProblem({ rate: "9", year: 2033 }), null);
});

test("the burden after a municipal benefit", () => {
  // 5% on a base cut from 1,000 to 300: 15.00 of 1,000 = 1.5%.
  assert.match(issBurdenProblem({ issCents: 1500, grossBaseCents: 100000, item: "1.07", year: 2026 }).message, /effective 1\.50%/);
  assert.equal(issBurdenProblem({ issCents: 1500, grossBaseCents: 100000, item: "7.02", year: 2026 }), null);
  assert.equal(issBurdenProblem({ issCents: 2000, grossBaseCents: 100000, item: "1.07", year: 2026 }), null);
  assert.equal(issBurdenProblem({ issCents: 1999, grossBaseCents: 100000, item: "1.07", year: 2026 }), null, "a cent of slack");
});

test("ABR-024 on the ABRASF fixture", () => {
  assert.ok(!rules(checkAbrasf(abr)).includes("ABR-024"));
  const high = swap(abr, "<Aliquota>2.90</Aliquota>", "<Aliquota>6.00</Aliquota>", true);
  const f = checkAbrasf(high).findings.filter((x) => x.rule === "ABR-024");
  assert.equal(f.length, 1);
  assert.match(f[0].message, /6\.00 \(6%\), above the national maximum of 5%/);
  const low = swap(abr, "<Aliquota>2.90</Aliquota>", "<Aliquota>1.50</Aliquota>", true);
  assert.ok(rules(checkAbrasf(low)).includes("ABR-024"));
  assert.ok(!rules(checkAbrasf(swap(low, "<ItemListaServico>01.07", "<ItemListaServico>07.02"))).includes("ABR-024"));
  const sn = checkAbrasf(swap(low, "<OptanteSimplesNacional>2", "<OptanteSimplesNacional>1"));
  assert.ok(!rules(sn).includes("ABR-024"));
  assert.match(sn.skipped.join(" "), /Aliquota 1\.50: below the national 2% minimum, from a Simples Nacional provider; not judged/);
  // Above 5% is reported even for a Simples Nacional provider.
  assert.ok(rules(checkAbrasf(swap(high, "<OptanteSimplesNacional>2", "<OptanteSimplesNacional>1"))).includes("ABR-024"));
  assert.ok(!rules(checkAbrasf(swap(low, "<ExigibilidadeISS>1", "<ExigibilidadeISS>4"))).includes("ABR-024"));
});

test("NFSE-024 on the national fixture", () => {
  assert.ok(!rules(checkNfse(nac)).includes("NFSE-024"));
  const high = checkNfse(swap(nac, "<pAliqAplic>2.90", "<pAliqAplic>5.50"));
  assert.equal(high.findings.find((f) => f.rule === "NFSE-024").path, "/NFSe/infNFSe/valores/pAliqAplic");
  const low = swap(nac, "<pAliqAplic>2.90", "<pAliqAplic>1.00");
  assert.ok(rules(checkNfse(low)).includes("NFSE-024"));
  assert.ok(!rules(checkNfse(swap(low, "<cTribNac>010101", "<cTribNac>070201"))).includes("NFSE-024"));
  const sn = checkNfse(swap(low, "<opSimpNac>1", "<opSimpNac>3"));
  assert.ok(!rules(sn).includes("NFSE-024"));
  assert.match(sn.skipped.join(" "), /opSimpNac 3 \(Simples Nacional or MEI\); not judged/);
  // A DPS carries the rate in tribMun/pAliq.
  const dps = read("nfse-dps.xml");
  if (dps.includes("<tpRetISSQN>")) {
    const withRate = dps.replace(/(<tpRetISSQN>\d<\/tpRetISSQN>)/, "$1<pAliq>7.00</pAliq>");
    const f = checkNfse(withRate).findings.find((x) => x.rule === "NFSE-024");
    assert.ok(f, "DPS pAliq 7.00");
    assert.match(f.path, /tribMun\/pAliq$/);
  }
});

test("NFSE-024: a municipal benefit that takes the burden under 2%", () => {
  // The fixture: vServ 1,500, vDescIncond 100, vBC 1,400, 2.90% = 40.60. A benefit of 200 off the
  // base makes vBC 1,200 and the ISSQN 34.80: 34.80 of 1,400 before the benefit = 2.49%, fine;
  // 1,000 off makes it 400 and 11.60: 0.83%.
  const bm = (cut, bc, iss) => swap(swap(swap(nac, "<vBC>1400.00</vBC>", `<vCalcBM>${cut}</vCalcBM><vBC>${bc}</vBC>`), "<vISSQN>40.60", `<vISSQN>${iss}`), "<tpRetISSQN>", `<BM><nBM>12345678901234</nBM><vRedBCBM>${cut}</vRedBCBM></BM><tpRetISSQN>`);
  const ok = checkNfse(bm("200.00", "1200.00", "34.80"));
  assert.ok(!rules(ok).includes("NFSE-024"), JSON.stringify(ok.findings.filter((f) => f.rule === "NFSE-024")));
  const under = checkNfse(bm("1000.00", "400.00", "11.60")).findings.find((f) => f.rule === "NFSE-024");
  assert.ok(under);
  assert.match(under.message, /effective 0\.83%/);
});

test("lcSubitem: a municipal breakdown after the subitem is dropped; a 5-digit city code is not an LC item", () => {
  // Some cities append their own breakdown to the subitem ("14.0101"); the LC subitem is 14.01.
  assert.equal(lcSubitem("14.0101"), "14.01");
  assert.equal(lcSubitem("7.021"), "7.02");
  // São Paulo's own 5-digit service code ("02919") and other city codes are not LC 116 items.
  for (const c of ["02919", "14010", "123456"]) assert.equal(lcSubitem(c), null, c);
});

test("issBurdenProblem: not judged from 2033 (no band), nor on a zero or negative base", () => {
  assert.equal(issBurdenProblem({ issCents: 100, grossBaseCents: 100000, item: "1.07", year: 2033 }), null);
  assert.equal(issBurdenProblem({ issCents: 100, grossBaseCents: 0, item: "1.07", year: 2026 }), null);
  assert.equal(issBurdenProblem({ issCents: 100, grossBaseCents: -100000, item: "1.07", year: 2026 }), null);
});
