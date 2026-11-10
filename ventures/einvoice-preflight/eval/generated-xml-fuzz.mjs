// Format-level fuzz: random drafts -> generateInvoice (UBL and CII) -> read back
// -> checkInvoice. Clean drafts must raise nothing; a changed amount in the XML
// text must raise a finding. Complements metamorphic-fuzz.mjs (JSON only).
// Usage: node eval/generated-xml-fuzz.mjs [N=500] [seed=2026]
import { generateInvoice } from "../generate.mjs";
import { parseInvoiceSource } from "../report.mjs";
import { checkInvoice } from "../checks.mjs";

const N = Number(process.argv[2] || 500);
let seed = Number(process.argv[3] || 2026);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
const RATES = [19, 7, 21, 5.5, 25];

function draft(i) {
  const n = ri(1, 6);
  return {
    number: "F-" + i, issue_date: "2026-10-15", due_date: "2026-11-14",
    buyer_reference: "REF-1", ...(rand() < 0.15 ? { document_type: "credit_note", original_invoice: "ORIG-1" } : {}),
    seller: { name: "S GmbH", street: "A 1", city: "Berlin", postal_code: "10115", country: "DE", vat_id: "DE136695976",
      endpoint: { scheme: "EM", id: "a@s.example" }, contact: { name: "E", phone: "+49 30 1", email: "a@s.example" } },
    buyer: { name: "B AG", street: "M 2", city: "Hamburg", postal_code: "20095", country: "DE", endpoint: { scheme: "EM", id: "b@b.example" } },
    payment: { iban: "DE02 1203 0000 0000 2020 51", bic: "BYLADEM1001" },
    lines: Array.from({ length: n }, (_, k) => ({
      description: "item " + k, quantity: ri(1, 40) / (rand() < 0.3 ? 4 : 1), unit: "pieces",
      unit_price: ri(1, 99999) / 100, tax_percent: RATES[ri(0, 4)],
    })),
  };
}

const stat = {};
const bump = (k, ok) => ((stat[k] ||= [0, 0])[1]++, ok && stat[k][0]++);
const examples = [];
for (let i = 0; i < N; i++) {
  const d = draft(i);
  for (const format of ["ubl", "cii"]) {
    const out = generateInvoice(d, { format });
    if (!out.ok) { bump(`${format} generated`, false); examples.push([format, i, "gen", out.errors[0]]); continue; }
    bump(`${format} generated`, true);
    const back = await parseInvoiceSource("x.xml", out.xml);
    const f = checkInvoice(back);
    bump(`${format} clean draft raises nothing`, f.length === 0);
    if (f.length) examples.push([format, i, "clean", f[0].rule || f[0].id, f[0].message]);
    const tag = format === "ubl" ? "PayableAmount" : "GrandTotalAmount";
    const tag2 = format === "ubl" ? "TaxInclusiveAmount" : "GrandTotalAmount";
    for (const [name, t] of [["gross total", tag2], ["payable/due", format === "ubl" ? "PayableAmount" : "DuePayableAmount"]]) {
      const re = new RegExp(`(<(?:cbc|ram):${t}[^>]*>)([\\d.]+)(<)`);
      const m = out.xml.match(re);
      if (!m) continue;
      const bad = out.xml.replace(re, (_, a, v, c) => a + (Number(v) + 1).toFixed(2) + c);
      const f2 = checkInvoice(await parseInvoiceSource("x.xml", bad));
      bump(`${format} ${name} +1.00 detected`, f2.length > 0);
      if (!f2.length) examples.push([format, i, name, "missed"]);
    }
  }
}
for (const [k, [a, b]] of Object.entries(stat)) console.log(`${k}: ${a}/${b}`);
if (examples.length) console.log("first misses:", JSON.stringify(examples.slice(0, 5)));
