// The server/JSON route (?schematron=1) runs PINT and ZATCA files against their
// own rule sets through the plain-JS runner; an ordinary EU file keeps the Saxon path.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preflightDocuments } from "./report.mjs";
import { plainAvailable } from "./plain-node.mjs";

const run = async (file) => (await preflightDocuments([{ name: file, source: readFileSync(new URL(file, import.meta.url), "utf8") }], { schematron: true })).reports?.[0] ?? {};
const skip = !plainAvailable() && "slimdom and fontoxpath not installed";

test("a Singapore PINT file with defects draws the GST rules", { skip }, async () => {
  const r = await run("./examples/pint-sg-invoice-with-defects.xml");
  assert.equal(r.schematron, "ok");
  const ids = r.errors.map((e) => e.rule);
  for (const id of ["BR-109-GST-SG", "BR-NG-12-GST-SG", "BR-CO-17-GST-SG"]) assert.ok(ids.includes(id), id);
});

test("a clean PINT file draws no EU-base category finding", { skip }, async () => {
  const r = await run("./examples/pint-sg-invoice.xml");
  assert.equal(r.schematron, "ok");
  assert.ok(!r.errors.some((e) => /^BR-(S|Z|O)-|^BR-CL-/.test(e.rule)));
});

test("a ZATCA simplified invoice is checked by the KSA rules", { skip }, async () => {
  const r = await run("./examples/zatca-simplified-invoice.xml");
  assert.equal(r.schematron, "ok");
  assert.ok(r.errors.some((e) => e.rule === "BR-KSA-98"));
});

test("built-in EU checks that PINT and ZATCA files trip falsely are dropped", { skip }, async () => {
  for (const f of ["pint-sg-invoice.xml", "pint-aunz-invoice.xml"]) {
    const r = await run(`./examples/${f}`);
    assert.ok(!r.errors.some((e) => e.rule === "INV-024"), f);
  }
  const z = await run("./examples/zatca-simplified-invoice.xml");
  for (const id of ["INV-022", "INV-005", "INV-017", "INV-018", "INV-024"]) assert.ok(!z.errors.some((e) => e.rule === id), id);
  // ZATCA's own examples (2026-11-11): credit notes are Invoice documents with type 381
  const cn = await run("./examples/zatca-simplified-credit-note.xml");
  assert.ok(!cn.errors.some((e) => e.rule === "INV-034"), "INV-034 on a KSA credit note");
  // a simplified invoice with no buyer name draws no INV-006 under ZATCA
  const src = readFileSync(new URL("./examples/zatca-simplified-invoice.xml", import.meta.url), "utf8")
    .replace(/(<cac:AccountingCustomerParty>)[\s\S]*?(<\/cac:AccountingCustomerParty>)/, "$1<cac:Party></cac:Party>$2");
  const { reports } = await preflightDocuments([{ name: "nobuyer.xml", source: src }], { schematron: true });
  assert.ok(!reports[0].errors.some((e) => e.rule === "INV-006"), "INV-006 on a KSA simplified invoice");
  // an ordinary EU file keeps them
  const d = await run("./examples/pint-sg-invoice-with-defects.xml");
  assert.ok(d.errors.some((e) => e.rule === "INV-038"));
});

test("a repeated tax rate stays reported under PINT; only ZATCA drops that INV-038", { skip }, async () => {
  // Red-team run 2026-11-11: widening the ZATCA-only drop to every own-rules file survived the suite.
  const src = readFileSync(new URL("./examples/pint-sg-invoice.xml", import.meta.url), "utf8");
  const subtotal = src.match(/<cac:TaxSubtotal>[\s\S]*?<\/cac:TaxSubtotal>/)[0];
  const doubled = src.replace(subtotal, subtotal + subtotal);
  const { reports } = await preflightDocuments([{ name: "twice.xml", source: doubled }], { schematron: true });
  assert.equal(reports[0].schematron, "ok");
  assert.ok(reports[0].errors.some((e) => e.rule === "INV-038" && /repeats the same tax percentage/.test(e.message)));
});
