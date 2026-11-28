// XR-012: a Leitweg-ID in a non-standard form (a label, spaces or dots, no hyphens). The
// official EN 16931 and KoSIT rules do not check the id (ventures/einvoice-preflight,
// leitweg-id-bench.mjs), so this warning is the only finding a paying accountant sees for it.
import assert from "node:assert/strict";
import test from "node:test";
import { inspectXrechnungProfile } from "./profile.mjs";
import { explainFindings } from "./pro/explain.mjs";

const invoice = (ref) => ({
  buyer_reference: ref,
  supplier: { vat_id: "DE136695976", city: "Berlin", postal_code: "10115", contact: { name: "E", phone: "+49 30 1", email: "billing@muster.example" } },
  customer: { city: "Hamburg", postal_code: "20095" },
  payment: { means: "58", iban: "DE89370400440532013000" },
});

test("XR-012 is a warning on the three form slips, silent on a correct id and on ordinary references", () => {
  for (const ref of ["Leitweg-ID: 04011000-12345-03", "04011000 12345 03", "040110001234503"]) {
    assert.deepEqual(inspectXrechnungProfile(invoice(ref)).map((f) => `${f.rule}:${f.severity}`), ["XR-012:warning"], ref);
  }
  for (const ref of ["04011000-12345-03", "Kostenstelle 4711", "PO-77"]) assert.deepEqual(inspectXrechnungProfile(invoice(ref)), [], ref);
  assert.deepEqual(inspectXrechnungProfile(invoice("Leitweg-ID: 04011000-12354-03")).map((f) => f.rule), ["XR-002"]);
});

test("XR-012 is explained from a template in every language, without the typed id", async () => {
  const findings = inspectXrechnungProfile(invoice("Leitweg-ID: 04011000-12345-03"));
  for (const lang of ["en", "de", "fr", "nl"]) {
    const [out] = await explainFindings(findings, { lang });
    assert.equal(out.explanation.source, "template", lang);
    assert.match(out.explanation.title, /Leitweg-ID/, lang);
    assert.ok(!JSON.stringify(out.explanation).includes("12345"), lang);
  }
});
