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
