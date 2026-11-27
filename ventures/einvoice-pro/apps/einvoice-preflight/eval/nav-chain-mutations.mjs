// The chain checks (hungary-nav-chain.mjs, HU-036/HU-037) on NAV's own modification samples,
// then one seeded fault at a time into each chain's modifying documents. Usage:
//   git clone --depth 1 https://github.com/nav-gov-hu/Online-Invoice.git /tmp/nav
//   node eval/nav-chain-mutations.mjs "/tmp/nav/sample/Data sample"
// NAV's samples hold six chains (five on base invoice ZZZ000001, one batch modification of
// SZ00001-3). They are separate scenarios that reuse the base, so each is checked on its own.
import { readFileSync } from "node:fs";
import { checkNavChains } from "../hungary-nav-chain.mjs";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node eval/nav-chain-mutations.mjs <NAV 'sample/Data sample' directory>");
const read = (f) => readFileSync(`${dir}/${f}`, "utf8");
const BASE = "Eredeti szamla modositasokhoz.xml";
const CHAINS = {
  "modification and cancellation": [BASE, "Modositas es ervenytelenites 1.xml", "Modositas es ervenytelenites 2.xml@STORNO"],
  "wrong product, two steps": [BASE, "Teves termek helyesbitese 20.xml", "Teves termek helyesbitese 21.xml"],
  "wrong product": [BASE, "Teves termek helyesbitese.xml"],
  "multiple modification": [BASE, "Tobbszoros modositas 1.xml", "Tobbszoros modositas 2.xml"],
  "line data": [BASE, "Teteladatok modositasa.xml"],
  "one document, three invoices": ["Tobb szamla modositasa egy okirattal alap 1.xml", "Tobb szamla modositasa egy okirattal alap 2.xml", "Tobb szamla modositasa egy okirattal alap 3.xml", "Tobb szamla modositasa egy okirattal.xml"],
};
const load = (files) => files.map((f) => {
  const [name, op] = f.split("@");
  return { name, source: read(name), operation: op || (name.includes("alap") || name === BASE ? null : "MODIFY") };
});
const all = (r) => [...r.byFile.values()].flat();

// Each mutation: (member text, chain) -> mutated text, or null where it does not apply; and the code it should raise.
const first = (xml, re, fn) => (re.test(xml) ? xml.replace(re, fn) : null);
const MUTATIONS = {
  "modificationIndex repeated": [(x, ctx) => (ctx.prevIndex ? first(x, /<modificationIndex>\d+</g, `<modificationIndex>${ctx.prevIndex}<`) : null), "MODIFICATION_INDEX_NOT_UNIQUE"],
  "issued before the base invoice": [(x) => first(x, /<invoiceIssueDate>[^<]+</, "<invoiceIssueDate>2021-05-01<"), "INCORRECT_DATE_MODIFICATION_ISSUE_DATE_EARLY"],
  "delivery date set to its own issue date, next month": [(x) => (/<line>/.test(x) ? first(first(x, /<invoiceIssueDate>[^<]+</, "<invoiceIssueDate>2021-07-02<"), /<invoiceDeliveryDate>[^<]+</g, "<invoiceDeliveryDate>2021-07-02<") : null), "UNINTENDED_MODIFICATION_DELIVERY_DATE"],
  "another customer tax number": [(x) => first(x, /(<customerTaxNumber>\s*<base:taxpayerId>)\d{8}</g, "$112345676<"), "INCORRECT_HEAD_DATA_CUSTOMER_TAXPAYERID_DIFFERS"],
  "invoiceCategory changed": [(x) => first(x, /<invoiceCategory>NORMAL</g, "<invoiceCategory>AGGREGATE<"), "INVOICE_TYPE_MISMATCH"],
  "modifyWithoutMaster true": [(x) => first(x, /<modifyWithoutMaster>false</g, "<modifyWithoutMaster>true<"), "MODIFY_WITHOUT_MASTER_MISMATCH"],
  "created line reuses base line 1": [(x) => first(x, /<lineNumberReference>\d+<\/lineNumberReference>(\s*<lineOperation>CREATE)/, "<lineNumberReference>1</lineNumberReference>$1"), "INVOICE_LINE_ALREADY_EXISTS"],
  "modified line not in the chain": [(x) => first(x, /<lineNumberReference>\d+<\/lineNumberReference>(\s*<lineOperation>)CREATE/, "<lineNumberReference>99</lineNumberReference>$1MODIFY"), "INCORRECT_LINE_REFERENCE"],
};

let clean = 0;
let total = 0;
let caught = 0;
const missed = [];
const byKind = {};
for (const [label, files] of Object.entries(CHAINS)) {
  const inputs = load(files);
  const r = checkNavChains(inputs);
  const f = all(r);
  console.log(`${label}: ${r.chains.length} chain(s), ${r.chains.reduce((s, c) => s + c.members.length, 0)} modifying invoice(s), ${f.length} finding(s)${f.length ? ": " + f.map((x) => x.nav).join(", ") : ""}`);
  if (!f.length) clean++;
  const members = inputs.filter((i) => i.operation);
  members.forEach((m, j) => {
    const prevIndex = j > 0 ? Number(/<modificationIndex>(\d+)</.exec(members[j - 1].source)?.[1]) : null;
    for (const [kind, [mutate, wanted]] of Object.entries(MUTATIONS)) {
      // On a cancellation, the delivery-date fault is NAV's 11401, not 11400.
      const want = m.operation === "STORNO" && wanted === "UNINTENDED_MODIFICATION_DELIVERY_DATE" ? "UNINTENDED_CANCELLATION_DELIVERY_DATE" : wanted;
      const mutated = mutate(m.source, { prevIndex });
      if (!mutated || mutated === m.source) continue;
      const res = checkNavChains(inputs.map((i) => (i === m ? { ...i, source: mutated } : i)));
      const got = (res.byFile.get(m.name) || []).map((x) => x.nav);
      total++;
      byKind[kind] ??= [0, 0];
      byKind[kind][1]++;
      if (got.includes(want)) { caught++; byKind[kind][0]++; } else missed.push(`${label} / ${m.name} / ${kind}: got ${got.join(", ") || "nothing"}`);
    }
  });
}
// The cancellation: seeded short by 2, 1 and 0 HUF.
const mc = load(CHAINS["modification and cancellation"]);
const storno = mc[2];
for (const off of [0, 1, 2, 1000]) {
  const src = storno.source.replace(/<invoiceNetAmount>-3300000</, `<invoiceNetAmount>${-3300000 + off}<`);
  const got = (checkNavChains([mc[0], mc[1], { ...storno, source: src }]).byFile.get(storno.name) || []).map((x) => x.nav);
  console.log(`cancellation net short by ${off}: ${got.join(", ") || "no finding"}`);
}
console.log(`\nNAV's chains with no finding: ${clean} of ${Object.keys(CHAINS).length}`);
for (const [k, [c, n]] of Object.entries(byKind)) console.log(`  ${k}: ${c} of ${n}`);
console.log(`mutants: ${total}, caught by the expected code: ${caught}`);
for (const m of missed) console.log(`  missed: ${m}`);
