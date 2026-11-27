// The creator's Croatian out-of-scope labels and document-level charges, checked by both engines:
//   node eval/hr-out-of-scope-creator.mjs [hr.sef.json]
// Each case rebuilds one of the Porezna uprava's sample eRačuni (Primjeri eRačuna) with the
// creator, then runs the file through the plain route (EN 16931 base + HR-BR rules) and, given a
// SEF of the authority's HR-CIUS XSLT (see eval/hr-cius-differential.mjs), through Saxon-JS.
// Companies and OIBs are made up; their check digits are valid.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { generateInvoice } = await import("../generate.mjs");
const { runPlain } = await import("../plain-node.mjs");
let saxon = null;
if (process.argv[2]) {
  const require = createRequire(import.meta.url);
  const SaxonJS = require(require.resolve("saxon-js", { paths: [process.cwd()] }));
  const sef = JSON.parse(readFileSync(process.argv[2], "utf8"));
  saxon = (xml) => [...SaxonJS.transform({ stylesheetInternal: sef, sourceText: xml, destination: "serialized" }, "sync").principalResult.matchAll(/<svrl:failed-assert[^>]*\bid="([^"]+)"/g)].map((x) => x[1]);
}
const norm = (a) => [...new Set(a)].sort().join(",") || "-";
const base = (lines, extra = {}) => ({
  number: "42-1-1", issue_date: "2026-11-02", issue_time: "09:30:00", due_date: "2026-12-02", process: "P1",
  operator: { name: "Ana Operater", oib: "55556666775" },
  seller: { name: "Primjer Usluge d.o.o.", street: "Ilica 1", city: "Zagreb", postal_code: "10000", country: "HR", vat_id: "HR12345678903" },
  buyer: { name: "Kupac Primjer d.d.", street: "Riva 5", city: "Split", postal_code: "21000", country: "HR", vat_id: "HR98765432106" },
  payment: { means: "30", iban: "HR1210010051863000160", reference: "HR00 42-1-1" },
  lines: lines || [product], ...extra,
});
const product = { description: "Proizvod", quantity: 1, unit_price: 100, tax_percent: 25, kpd: "62.20.20" };
// [case, the sample it rebuilds, its PayableAmount, draft]
const cases = [
  ["deposit line", "eRacun_PDV_NEOP_POVRATNA_NAKNADA_stavka", "130.00", base([product, { description: "Povratna naknada", quantity: 1, unit_price: 5, hr_label: "POVNAK", kpd: "22.22.19" }])],
  ["deposit charge", "eRacun_PDV_NEOP_POVRATNA_NAKNADA_trosak", "130.00", base(null, { charges: [{ amount: 5, hr_label: "POVNAK" }] })],
  ["PP charge", "eRacun_PDV_NEOP_PP_trosak", "128.00", base(null, { charges: [{ amount: 3, hr_label: "PP" }] })],
  ["PPMV charge", "Racun_za_leasing_PDV_PPMV_aktivacija", "14500.00", base([{ ...product, description: "Automobil", unit_price: 10000, kpd: "29.10.22" }], { charges: [{ amount: 2000, hr_label: "PPMV" }] })],
  ["N charge (tourist tax)", "eRacun_PDV25_i_Neoporeziva_naknada_trosak", "135.00", base(null, { charges: [{ reason: "Turistička pristojba", amount: 10, hr_label: "N" }] })],
  ["mixed: E line, deposit, PP, 25 % delivery, discount", "-", "-", base([product, { description: "Tecaj", quantity: 1, unit_price: 150, tax_category: "E", tax_reason: "Oslobođeno PDV-a prema čl. 39. Zakona o PDV-u", kpd: "85.59.09" }, { description: "Povratna naknada", quantity: 4, unit_price: 0.07, hr_label: "POVNAK", kpd: "22.22.19" }], { charges: [{ amount: 3, hr_label: "PP" }, { reason: "Dostava", amount: 8, tax_percent: 25 }], allowances: [{ reason: "Popust", amount: 10, tax_percent: 25 }] })],
  ["25 % delivery charge and discount", "-", "-", base(null, { charges: [{ reason: "Dostava", amount: 8, tax_percent: 25 }], allowances: [{ reason: "Popust", amount: 10, tax_percent: 25 }] })],
];
for (const [name, sample, payable, d] of cases) {
  const out = generateInvoice(d, { profile: "hr" });
  if (!out.ok) { console.log(JSON.stringify({ case: name, errors: out.errors })); continue; }
  const due = out.xml.match(/<cbc:PayableAmount currencyID="EUR">([\d.]+)</)[1];
  const r = await runPlain(out.xml);
  const hr = norm(r.findings.filter((f) => f.source === "cius-hr-schematron").map((f) => f.rule));
  const enFatal = norm(r.findings.filter((f) => f.source !== "cius-hr-schematron" && f.severity !== "warning").map((f) => f.rule));
  const s = saxon ? norm(saxon(out.xml)) : null;
  console.log(JSON.stringify({ case: name, sample, samplePayable: payable, payable: due, plainHr: hr, saxonHr: s, enFatal, skipped: r.skipped.length }));
}
