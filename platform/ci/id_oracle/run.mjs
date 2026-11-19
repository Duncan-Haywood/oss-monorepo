#!/usr/bin/env node
// Cross-venture identifier oracle: feeds cases drawn by gen_cases.py (labelled by
// python-stdnum) to every venture's own IBAN, GTIN, ISBN, ABA routing, BIC and SEPA
// creditor-id checker, and reports where a venture's verdict differs from the oracle's.
//
//   node platform/ci/id_oracle/run.mjs cases.jsonl [--json out.json] [--fail-on-reject]
//
// A difference is one of:
//   false-reject   stdnum accepts, the venture rejects, inside the countries the venture claims
//   false-accept   stdnum rejects, the venture accepts
//   out-of-scope   stdnum accepts an IBAN whose country the venture's table does not carry
//                  (deliberate for a SEPA-only tool; listed so the tables can be compared)
// --fail-on-reject exits 1 on any false-reject, so the sweep can guard a CI job.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const v = async (rel) => import(pathToFileURL(path.join(root, "ventures", rel)).href);

const ADAPTERS = [];
const add = (venture, domain, accepts, scope = null) => ADAPTERS.push({ venture, domain, accepts, scope });

{
  const m = await v("iban-list-check/calc.mjs");
  add("iban-list-check", "iban", (s) => m.classify(s).kind === "ok", new Set(Object.keys(m.COUNTRIES)));
}
{
  const m = await v("sepa-payment-file-validator/calc.mjs");
  add("sepa-payment-file-validator", "iban", (s) => m.ibanCheck(s).ok, new Set(Object.keys(m.IBAN_LENGTHS)));
}
{
  const m = await v("sepa-pain001-validator/calc.mjs");
  // a warning (country outside its table) still passes; only errors reject
  add("sepa-pain001-validator", "iban", (s) => m.checkIban(s).ok, new Set(Object.keys(m.IBAN_LENGTHS)));
  add("sepa-pain001-validator", "bic", (s) => m.checkBic(s).ok && !m.checkBic(s).warn);
}
for (const slug of ["csv-to-sepa-pain001", "csv-to-sepa-pain008"]) {
  const m = await v(`${slug}/calc.mjs`);
  add(slug, "iban", (s) => m.checkIban(s).ok, new Set(Object.keys(m.IBAN_LENGTHS)));
  add(slug, "bic", (s) => m.checkBic(s).ok);
  if (m.checkCreditorId) add(slug, "creditor", (s) => m.checkCreditorId(s).ok);
}
for (const slug of ["eu-bank-statement-reader", "camt053-to-ofx-converter"]) {
  const m = await v(`${slug}/calc.mjs`);
  add(slug, "iban", (s) => m.ibanState(s)?.ok === true, new Set(Object.keys(m.IBAN_LENGTHS)));
}
{
  const m = await v("gtin-list-check/calc.mjs");
  // classify restores lost leading zeros, so only a value returned unchanged counts as accepted as written
  add("gtin-list-check", "gtin", (s) => { const r = m.classify(s); return r.kind === "ok" && r.value === s; });
  add("gtin-list-check", "isbn10", (s) => m.isbn10Ok(s));
}
for (const slug of ["woocommerce-product-csv-check", "square-catalog-csv-check", "shopify-product-csv-check", "bigcommerce-product-csv-check"]) {
  const m = await v(`${slug}/calc.mjs`);
  // gtinProblem returns null for lengths it does not judge, so a non-GTIN length is "not flagged", not "accepted"
  add(slug, "gtin", (s) => [8, 12, 13, 14].includes(s.length) && m.gtinProblem(s) === null);
}
{
  const m = await v("meta-catalog-csv-check/calc.mjs");
  add("meta-catalog-csv-check", "gtin", (s) => m.gtinValid(s));
}
{
  const m = await v("merchant-feed-check/engine.mjs");
  add("merchant-feed-check", "gtin", (s) => m.gtinChecksumValid(s));
}
for (const slug of ["ebay-file-exchange-check", "amazon-inventory-loader-check"]) {
  const m = await v(`${slug}/calc.mjs`);
  add(slug, "gtin", (s) => m.gtinValid(s));
}
{
  const m = await v("nacha-file-validator/calc.mjs");
  add("nacha-file-validator", "rtn", (s) => m.routingCheckDigitOk(s));
}
{
  const m = await v("publish-kit/book.mjs");
  add("publish-kit", "isbn13", (s) => m.isValidIsbn13(s));
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const cases = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));

const report = [];
for (const a of ADAPTERS) {
  const mine = cases.filter((c) => c.domain === a.domain);
  const r = { venture: a.venture, domain: a.domain, cases: mine.length, agree: 0, falseReject: [], falseAccept: [], outOfScope: {}, errors: [], cdAlias: { total: 0, accepted: 0 } };
  for (const c of mine) {
    let got;
    try { got = Boolean(a.accepts(c.value)); } catch (e) { r.errors.push({ value: c.value, error: String(e.message || e) }); continue; }
    // Check digits 00, 01 and 99 leave remainder 1 like 97, 98 and 02, but the algorithm never produces them. stdnum
    // accepts them; whether ISO 13616 forbids them was not read, so they are tallied apart, not scored.
    if (c.kind === "cd-alias") { r.cdAlias.total++; if (got) r.cdAlias.accepted++; continue; }
    if (got === c.valid) { r.agree++; continue; }
    if (c.valid && a.scope && c.cc && !a.scope.has(c.cc)) { r.outOfScope[c.cc] = (r.outOfScope[c.cc] || 0) + 1; continue; }
    (c.valid ? r.falseReject : r.falseAccept).push({ value: c.value, kind: c.kind, cc: c.cc });
  }
  report.push(r);
}

const byKind = (xs) => Object.entries(xs.reduce((o, x) => ((o[`${x.kind}${x.cc ? ":" + x.cc : ""}`] = (o[`${x.kind}${x.cc ? ":" + x.cc : ""}`] || 0) + 1), o), {}))
  .sort((p, q) => q[1] - p[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join(", ");
let rejects = 0;
for (const r of report) {
  rejects += r.falseReject.length;
  const oos = Object.keys(r.outOfScope).sort();
  const scored = r.cases - r.cdAlias.total;
  console.log(`${r.venture} [${r.domain}] ${r.agree}/${scored} agree; false-reject ${r.falseReject.length}; false-accept ${r.falseAccept.length}; out-of-scope countries ${oos.length}; errors ${r.errors.length}`);
  if (r.falseReject.length) console.log(`  false-reject: ${byKind(r.falseReject)}  e.g. ${r.falseReject[0].value}`);
  if (r.falseAccept.length) console.log(`  false-accept: ${byKind(r.falseAccept)}  e.g. ${r.falseAccept[0].value}`);
  if (oos.length) console.log(`  out-of-scope: ${oos.join(" ")}`);
  if (r.cdAlias.total) console.log(`  check digits 00/01/99 (not scored): accepted ${r.cdAlias.accepted} of ${r.cdAlias.total}`);
  if (r.errors.length) console.log(`  errors: ${r.errors[0].value}: ${r.errors[0].error}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
if (args.includes("--fail-on-reject") && rejects) process.exit(1);
