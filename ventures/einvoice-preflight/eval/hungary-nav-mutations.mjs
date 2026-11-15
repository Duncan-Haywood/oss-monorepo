// Seeds one fault at a time into NAV's published InvoiceData samples and counts how
// often hungary-nav.mjs reports the rule the fault should trip, and whether any
// finding at all appears that the untouched file did not have.
//   git clone --depth 1 https://github.com/nav-gov-hu/Online-Invoice.git /tmp/nav
//   node eval/hungary-nav-mutations.mjs "/tmp/nav/sample/Data sample"
// The samples are MIT licensed by NAV and are not copied into the tree (three are,
// under fixtures/hungary-nav/, with the licence).
import { readdirSync, readFileSync } from "node:fs";
import { checkNavInvoice } from "../hungary-nav.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node eval/hungary-nav-mutations.mjs <dir of NAV InvoiceData samples>");
  process.exit(2);
}

// Replace the first match of `re` (a regex with one capture group for the value) using fn(value).
// The capture's own position (the regex `d` flag), never m[0].indexOf(m[1]), which can land on
// an earlier copy of the value inside the match. Audited 2026-11-15 on NAV's 30 samples: every
// current `first` mutant is byte-identical either way (the affected ones had moved to `tail`).
const first = (re, fn) => (text) => {
  const m = new RegExp(re.source, re.flags.replace("d", "") + "d").exec(text);
  if (!m) return null;
  const start = m.indices[1][0];
  const out = text.slice(0, start) + fn(m[1]) + text.slice(start + m[1].length);
  return out === text ? null : out;
};
// The same, kept for the patterns whose capture closes the match (written when `first` still
// used indexOf, which landed on the 5 inside taxpayerId 98765432).
const tail = (re, fn) => (text) => {
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].lastIndexOf(m[1]);
  const out = text.slice(0, start) + fn(m[1]) + text.slice(start + m[1].length);
  return out === text ? null : out;
};
// NAV tolerates 1% of the amount (never less than one unit), so a seeded error must be larger:
// 10% of the value plus 2 units.
const bump = () => (v) => (Number(v) + Math.abs(Number(v)) * 0.1 + 2).toFixed(2);

const MUTATIONS = [
  { name: "line net +10%", rules: ["HU-020", "HU-022", "HU-023", "HU-024"], apply: first(/<lineNetAmount>([-\d.]+)</, bump()) },
  { name: "line VAT +10%", rules: ["HU-021", "HU-022", "HU-023", "HU-024"], apply: first(/<lineVatAmount>([-\d.]+)</, bump()) },
  { name: "line net HUF x10", rules: ["HU-023", "HU-024"], apply: first(/<lineNetAmountHUF>([-\d.]+)</, (v) => (Number(v) * 10 + 10).toFixed(2)) },
  { name: "line gross +10%", rules: ["HU-022", "HU-023"], apply: first(/<lineGrossAmountNormal>([-\d.]+)</, bump()) },
  { name: "simplified line gross +10%", rules: ["HU-020", "HU-023", "HU-026"], apply: first(/<lineGrossAmountSimplified>([-\d.]+)</, bump()) },
  { name: "invoice net total +10%", rules: ["HU-025"], apply: first(/<invoiceNetAmount>([-\d.]+)</, bump()) },
  { name: "invoice VAT total +10%", rules: ["HU-025"], apply: first(/<invoiceVatAmount>([-\d.]+)</, bump()) },
  { name: "invoice gross total +10%", rules: ["HU-025", "HU-026"], apply: first(/<invoiceGrossAmount>([-\d.]+)</, bump()) },
  { name: "rate row net +10%", rules: ["HU-023", "HU-024", "HU-025"], apply: first(/<vatRateNetAmount>([-\d.]+)</, bump()) },
  { name: "EUR rate given per 100 HUF", rules: ["HU-012"], apply: (t) => /<currencyCode>EUR</.test(t) ? first(/<exchangeRate>([\d.]+)</, (v) => (Number(v) / 100).toFixed(4))(t) : null },
  { name: "HUF invoice with rate 1.1", rules: ["HU-012"], apply: (t) => /<currencyCode>HUF</.test(t) ? first(/<exchangeRate>([\d.]+)</, () => "1.1")(t) : null },
  { name: "vatPercentage 0.25 (pre-2013) on a new invoice", rules: ["HU-005"], apply: (t) => /<invoiceReference>/.test(t) ? null : first(/<vatPercentage>(0\.27)</, () => "0.25")(t) },
  { name: "vatPercentage 0.21 (not Hungarian)", rules: ["HU-005"], apply: first(/<vatPercentage>(0\.\d+)</, () => "0.21") },
  { name: "vatContent on a normal line", rules: ["HU-006"], apply: first(/<lineAmountsNormal>\s*<lineNetAmountData>[\s\S]*?<lineVatRate>\s*(<vatPercentage>[\d.]+<\/vatPercentage>)/, () => "<vatContent>0.2126</vatContent>") },
  { name: "exemption case lower-case", rules: ["HU-007"], apply: first(/<vatExemption>\s*<case>([A-Z]+)</, (v) => v.toLowerCase()) },
  { name: "OWN unit without unitOfMeasureOwn", rules: ["HU-015"], apply: (t) => t.includes("<unitOfMeasureOwn>") ? t.replace(/<unitOfMeasureOwn>[^<]*<\/unitOfMeasureOwn>/, "") : null },
  { name: "unknown unit LITRE", rules: ["HU-015"], apply: first(/<unitOfMeasure>([A-Z_]+)</, () => "LITRE") },
  { name: "second line numbered 1", rules: ["HU-002"], apply: (t) => { const i = t.indexOf("<lineNumber>2<"); return i < 0 ? null : t.slice(0, i) + "<lineNumber>1<" + t.slice(i + 14); } },
  { name: "quantity dropped on an expressed line", rules: ["HU-004"], apply: (t) => /<lineExpressionIndicator>true</.test(t) && /<quantity>/.test(t) ? t.replace(/<quantity>[^<]*<\/quantity>/, "") : null },
  { name: "private person keeps customerName", rules: ["HU-008"], apply: (t) => /<customerName>/.test(t) ? first(/<customerVatStatus>([A-Z_]+)</, () => "PRIVATE_PERSON")(t) : null },
  { name: "supplier taxpayerId digit changed", rules: ["HU-018"], apply: first(/<supplierTaxNumber>\s*<base:taxpayerId>(\d{8})</, (v) => v.slice(0, 7) + String((Number(v[7]) + 1) % 10)) },
  { name: "delivery period reversed", rules: ["HU-014"], apply: (t) => { const s = /<invoiceDeliveryPeriodStart>([^<]+)</.exec(t); const e = /<invoiceDeliveryPeriodEnd>([^<]+)</.exec(t); return s && e && s[1] !== e[1] ? t.replace(s[0], `<invoiceDeliveryPeriodStart>${e[1]}<`).replace(e[0], `<invoiceDeliveryPeriodEnd>${s[1]}<`) : null; } },
  { name: "invoice number with trailing space", rules: ["HU-013"], apply: first(/<invoiceNumber>([^<]+)</, (v) => v + " ") },
  { name: "modifying line loses lineModificationReference", rules: ["HU-017"], apply: (t) => t.includes("<lineModificationReference>") ? t.replace(/<lineModificationReference>[\s\S]*?<\/lineModificationReference>/, "") : null },
  { name: "aggregate line loses aggregateInvoiceLineData", rules: ["HU-011"], apply: (t) => t.includes("<aggregateInvoiceLineData>") ? t.replace(/<aggregateInvoiceLineData>[\s\S]*?<\/aggregateInvoiceLineData>/, "") : null },
  { name: "exempt line given VAT", rules: ["HU-010"], apply: first(/<vatExemption>(?:(?!<line>)[\s\S])*?<\/lineVatRate>\s*<lineVatData>\s*<lineVatAmount>([-\d.]+)</, () => "100.00") },
  { name: "file cut off half-way", rules: ["HU-001"], apply: (t) => t.slice(0, Math.floor(t.length / 2)) },
  // Added 2026-11-15 with the Annex I re-read (eval/nav-annex1-calculations-2026-11-15.md): faults
  // only the new or corrected warnings see.
  { name: "line gross HUF +10% (754)", rules: ["HU-022"], apply: first(/<lineGrossAmountNormalHUF>([-\d.]+)</, bump()) },
  { name: "rate row VAT HUF +10% (891)", rules: ["HU-025"], apply: first(/<vatRateVatAmountHUF>([-\d.]+)</, bump()) },
  { name: "simplified line gross HUF +10% (901/921)", rules: ["HU-026"], apply: first(/<lineGrossAmountSimplifiedHUF>([-\d.]+)</, bump()) },
  { name: "discountRate 0.1 added, net unchanged (740)", rules: ["HU-020"], apply: (t) => /<lineDiscountData>/.test(t) ? null : first(/<unitPriceHUF>[^<]*<\/unitPriceHUF>(\s*)<lineAmountsNormal>/, () => "<lineDiscountData><discountRate>0.1</discountRate></lineDiscountData>")(t) },
  { name: "summary row at a rate no line uses (680)", rules: ["HU-024"], apply: (t) => { const m = /<summaryByVatRate>\s*<vatRate>\s*<vatPercentage>0\.27<\/vatPercentage>[\s\S]*?<\/summaryByVatRate>/.exec(t); if (!m || /<vatPercentage>0\.18</.test(t)) return null; return t.replace(m[0], m[0] + m[0].replace("0.27", "0.18").replace(/(Amount(?:HUF)?>)[-\d.]+</g, "$10.00<")); } },
  // Added 2026-11-15 with the Annex I I.1/I.2 read (eval/nav-annex1-head-lines-2026-11-15.md): header
  // and line-data warnings, HU-034 and HU-035. The four that need the day of reporting are not seeded here.
  { name: "supplier county code 21 (120)", rules: ["HU-034"], apply: tail(/<supplierTaxNumber>[\s\S]*?<base:countyCode>(\d\d)</, () => "21") },
  { name: "supplier VAT code 4 (50)", rules: ["HU-034"], apply: tail(/<supplierTaxNumber>[\s\S]*?<base:vatCode>(\d)</, () => "4") },
  { name: "customer given the seller's tax number (10)", rules: ["HU-034"], apply: (t) => { const s = /<supplierTaxNumber>\s*<base:taxpayerId>(\d{8})</.exec(t); return s ? first(/<customerTaxNumber>\s*<base:taxpayerId>(\d{8})</, () => s[1])(t) : null; } },
  { name: "delivery 400 days after issue (313)", rules: ["HU-034"], apply: (t) => { const i = /<invoiceIssueDate>([\d-]+)</.exec(t); return i ? first(/<invoiceDeliveryDate>([\d-]+)</, () => new Date(Date.parse(`${i[1]}T00:00:00Z`) + 400 * 86400000).toISOString().slice(0, 10))(t) : null; } },
  { name: "seller EU VAT number of another company (500)", rules: ["HU-034"], apply: (t) => /<supplierInfo>[\s\S]*?<communityVatNumber>/.test(t.split("</supplierInfo>")[0]) ? null : t.replace("</supplierTaxNumber>", "</supplierTaxNumber><communityVatNumber>HU10000006</communityVatNumber>") },
  { name: "line refers to itself (590)", rules: ["HU-035"], apply: (t) => t.includes("<lineNumber>1</lineNumber>") ? t.replace("<lineNumber>1</lineNumber>", "<lineNumber>1</lineNumber><referencesToOtherLines><referenceToOtherLine>1</referenceToOtherLine></referencesToOtherLines>") : null },
  { name: "new invoice net total negated (1090)", rules: ["HU-025"], apply: (t) => /<invoiceReference>/.test(t) ? null : first(/<invoiceNetAmount>([\d.]+)</, (v) => Number(v) === 0 ? v : `-${v}`)(t) },
];

const key = (f) => `${f.rule}|${f.path}|${f.message}`;
const files = readdirSync(dir).filter((f) => f.endsWith(".xml")).sort();
const rows = [];
let applied = 0, expected = 0, any = 0, baseFindings = 0, clean = 0;
for (const file of files) {
  const text = readFileSync(`${dir}/${file}`, "utf8");
  const before = checkNavInvoice(text).findings;
  baseFindings += before.length;
  if (!before.length) clean += 1;
  const seen = new Set(before.map(key));
  for (const m of MUTATIONS) {
    const mutated = m.apply(text);
    if (!mutated) continue;
    applied += 1;
    const fresh = checkNavInvoice(mutated).findings.filter((f) => !seen.has(key(f)));
    const hit = fresh.some((f) => m.rules.includes(f.rule));
    if (hit) expected += 1;
    if (fresh.length) any += 1;
    rows.push({ file, mutation: m.name, hit, fresh: [...new Set(fresh.map((f) => f.rule))].join(" ") || "-" });
  }
}
const byMutation = new Map();
for (const r of rows) {
  const b = byMutation.get(r.mutation) || { n: 0, hit: 0 };
  b.n += 1; if (r.hit) b.hit += 1;
  byMutation.set(r.mutation, b);
}
console.log(`samples: ${files.length} (${clean} with no finding, ${baseFindings} findings on the untouched files)`);
console.log(`mutants: ${applied}; expected rule reported: ${expected} (${(100 * expected / applied).toFixed(1)}%); any new finding: ${any} (${(100 * any / applied).toFixed(1)}%)`);
console.log("\nmutation\tapplied\tcaught");
for (const [name, b] of byMutation) console.log(`${name}\t${b.n}\t${b.hit}`);
const missed = rows.filter((r) => !r.hit);
if (missed.length) {
  console.log("\nnot caught by the expected rule:");
  for (const r of missed) console.log(`  ${r.mutation} @ ${r.file}: new findings ${r.fresh}`);
}
