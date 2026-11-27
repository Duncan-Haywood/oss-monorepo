// PRO-DE-001 (ZUGFeRD MINIMUM / BASIC WL is not an e-invoice in Germany) and profile=auto.
// These back the "What is checked" list on einvoice-site (ROADMAP Next 3, 2026-11-26).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkInvoice, resolveProfile } from "./check.mjs";
import { detectProfile, germanProfileRule } from "./rules.mjs";

const ex = (f) => readFileSync(new URL(`../examples/${f}`, import.meta.url), "utf8");
const cii = ex("cii-invoice.xml"); // EN 16931, seller DE, buyer FR
const withGuideline = (xml, id) => xml.replace("<ram:ID>urn:cen.eu:en16931:2017</ram:ID>", `<ram:ID>${id}</ram:ID>`);

test("germanProfileRule: MINIMUM and BASIC WL from a German seller", () => {
  for (const [id, name] of [["urn:factur-x.eu:1p0:minimum", "MINIMUM"], ["urn:factur-x.eu:1p0:basicwl", "BASIC WL"], ["urn:zugferd.de:2p0:minimum", "MINIMUM"]]) {
    const [f, ...rest] = germanProfileRule({ specification_id: id, supplier: { country: "DE" } });
    assert.equal(rest.length, 0);
    assert.equal(f.rule, "PRO-DE-001");
    assert.match(f.message, new RegExp(name));
  }
});

test("germanProfileRule: not for a French seller unless the German rules were chosen", () => {
  const inv = { specification_id: "urn:factur-x.eu:1p0:minimum", supplier: { country: "FR" } };
  assert.deepEqual(germanProfileRule(inv), []);
  assert.equal(germanProfileRule(inv, "xrechnung").length, 1);
});

test("germanProfileRule: EN 16931, EXTENDED and XRechnung pass; unreadable input is ignored", () => {
  for (const id of ["urn:cen.eu:en16931:2017", "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended", "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"]) {
    assert.deepEqual(germanProfileRule({ specification_id: id, supplier: { country: "DE" } }), []);
  }
  assert.deepEqual(germanProfileRule(null), []);
  assert.deepEqual(germanProfileRule({ supplier: { country: "DE" } }), []);
});

test("checkInvoice: a German MINIMUM CII file fails with PRO-DE-001, explained from the template", async () => {
  const r = await checkInvoice({ name: "min.xml", source: withGuideline(cii, "urn:factur-x.eu:1p0:minimum") }, { lang: "de" });
  const f = r.findings.find((x) => x.rule === "PRO-DE-001");
  assert.ok(f, JSON.stringify(r.findings.map((x) => x.rule)));
  assert.equal(r.status, "fail");
  assert.match(JSON.stringify(f), /gilt in Deutschland nicht als E-Rechnung/);
  const ok = await checkInvoice({ name: "en.xml", source: cii }, { lang: "en" });
  assert.ok(!ok.findings.some((x) => x.rule === "PRO-DE-001"));
});

test("checkInvoice: PRO-DE-001 also reads a Factur-X PDF's attachment", async () => {
  const pdf = new Uint8Array(readFileSync(new URL("../examples/factur-x-invoice.pdf", import.meta.url)));
  const r = await checkInvoice({ name: "fx.pdf", source: pdf }, { lang: "en" });
  // The shipped PDF is EN 16931 from a German seller: no PRO-DE-001.
  assert.ok(!r.findings.some((x) => x.rule === "PRO-DE-001"));
});

test("detectProfile: only what the file declares, plus a domestic French invoice", () => {
  assert.equal(detectProfile({ specification_id: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0" }), "xrechnung");
  assert.equal(detectProfile({ specification_id: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0" }), "peppol");
  assert.equal(detectProfile({ specification_id: "urn:cen.eu:en16931:2017", supplier: { country: "FR" }, customer: { country: "FR" } }), "france");
  // A German B2B invoice does not get the BR-DE (XRechnung) rules from the seller's country alone.
  assert.equal(detectProfile({ specification_id: "urn:cen.eu:en16931:2017", supplier: { country: "DE" }, customer: { country: "DE" } }), "");
  assert.equal(detectProfile({ specification_id: "urn:cen.eu:en16931:2017", supplier: { country: "FR" }, customer: { country: "DE" } }), "");
  assert.equal(detectProfile(null), "");
});

test("resolveProfile and checkInvoice with profile=auto report what was applied", async () => {
  assert.deepEqual(await resolveProfile("x.xml", ex("xrechnung-cii-invoice.xml"), "auto"), { profile: "xrechnung", detected: true });
  assert.deepEqual(await resolveProfile("p.xml", ex("peppol-credit-note.xml"), "auto"), { profile: "peppol", detected: true });
  assert.deepEqual(await resolveProfile("c.xml", cii, "auto"), { profile: "", detected: true });
  assert.deepEqual(await resolveProfile("c.xml", cii, "nonsense"), { profile: "", detected: false });
  assert.deepEqual(await resolveProfile("c.xml", "not xml at all", "auto"), { profile: "", detected: true });
  const r = await checkInvoice({ name: "x.xml", source: ex("xrechnung-cii-invoice.xml") }, { profile: "auto" });
  assert.equal(r.profile, "xrechnung");
  assert.equal(r.profileDetected, true);
  const plain = await checkInvoice({ name: "x.xml", source: ex("xrechnung-cii-invoice.xml") }, { profile: "" });
  assert.equal(plain.profile, "");
  assert.equal(plain.profileDetected, undefined);
});
