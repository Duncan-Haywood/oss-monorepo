// Skonto in the payment terms (BT-20). KoSIT's BR-DE-18 checks only lines that begin with "#",
// so XR-013 warns on the two forms it lets through (words only, a line without its leading "#"),
// the creator keeps the line break BR-DE-18 needs, and the paid skonto-form fix rewrites slips of
// writing (ventures/einvoice-preflight/skonto-bench.mjs measures all of it on the free copy).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateInvoice } from "./generate.mjs";
import { plainAvailable } from "./plain-node.mjs";
import { paymentTermsText, SKONTO_LINE, skontoEntryFixed, skontoTermsFixed, skontoTermsIssue, inspectXrechnungProfile } from "./profile.mjs";
import { explainFindings } from "./pro/explain.mjs";
import { checkInvoice, validate } from "./pro/check.mjs";

const UBL = readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8");
const CII = readFileSync(new URL("./examples/xrechnung-cii-invoice.xml", import.meta.url), "utf8");
const ubl = (note) => UBL.replace("<cbc:Note>Net 30 days</cbc:Note>", `<cbc:Note>${note}</cbc:Note>`);
const cii = (note) => CII.replace("<ram:Description>Zahlbar innerhalb von 30 Tagen netto</ram:Description>", `<ram:Description>${note}</ram:Description>`);

test("paymentTermsText keeps the line break after a Skonto line and leaves plain text alone", () => {
  assert.equal(paymentTermsText("  Zahlbar in 30 Tagen  "), "Zahlbar in 30 Tagen");
  assert.equal(paymentTermsText("#SKONTO#TAGE=10#PROZENT=2.00#"), "#SKONTO#TAGE=10#PROZENT=2.00#\n");
  assert.equal(paymentTermsText("Netto 30\r\n #SKONTO#TAGE=10#PROZENT=2.00# \r\n"), "Netto 30\n#SKONTO#TAGE=10#PROZENT=2.00#\n");
  assert.equal(paymentTermsText(undefined), "");
});

test("skontoEntryFixed rewrites slips of writing and refuses what would be a guess", () => {
  const good = "#SKONTO#TAGE=10#PROZENT=2.00#";
  for (const slip of ["#SKONTO#TAGE=10#PROZENT=2,00#", "#skonto#tage=10#prozent=2.00#", "#SKONTO#TAGE=10#PROZENT=2.0#",
    "#SKONTO#TAGE=10#PROZENT=2#", "#SKONTO#TAGE=10#PROZENT=2.00%#", "#SKONTO# TAGE=10 #PROZENT=2.00#", "#SKONTO#TAGE=10#PROZENT=2.00",
    "SKONTO#TAGE=10#PROZENT=2.00#", good]) {
    assert.equal(skontoEntryFixed(slip), good, slip);
    assert.match(skontoEntryFixed(slip), SKONTO_LINE);
  }
  assert.equal(skontoEntryFixed("#SKONTO#TAGE=10#PROZENT=2,5#BASISBETRAG=1200,5#"), "#SKONTO#TAGE=10#PROZENT=2.50#BASISBETRAG=1200.50#");
  for (const guess of ["#SKONTO#TAGE=10#PROZENT=2.125#", "#SKONTO#TAGE=zehn#PROZENT=2.00#", "#SKONTO#PROZENT=2.00#",
    "#SKONTO#TAGE=10#PROZENT=2.00#BASISBETRAG=1.200,00#", "2 % Skonto in 10 Tagen"]) {
    assert.equal(skontoEntryFixed(guess), "", guess);
  }
  assert.equal(skontoTermsFixed("Netto 30\n#SKONTO#TAGE=10#PROZENT=3.00##skonto#tage=20#prozent=2#"),
    "Netto 30\n#SKONTO#TAGE=10#PROZENT=3.00#\n#SKONTO#TAGE=20#PROZENT=2.00#\n");
  assert.equal(skontoTermsFixed("#SKONTO#TAGE=10#PROZENT=2.125#"), null);
});

test("skontoTermsIssue: words and a missing leading # are reported; BR-DE-18's own ground is not", () => {
  assert.deepEqual(skontoTermsIssue("2 % Skonto bei Zahlung innerhalb von 10 Tagen"), { kind: "words", line: "#SKONTO#TAGE=10#PROZENT=2.00#" });
  assert.deepEqual(skontoTermsIssue("Bei Zahlung in 10 Tagen 2,5 % Skonto, 30 Tage netto"), { kind: "words", line: "" });
  assert.deepEqual(skontoTermsIssue("SKONTO#TAGE=14#PROZENT=3.00#"), { kind: "no-hash", line: "#SKONTO#TAGE=14#PROZENT=3.00#" });
  for (const quiet of ["Zahlbar innerhalb 30 Tagen", "Skonto wird nicht gewährt", "#SKONTO#TAGE=10#PROZENT=2.00#\n",
    "2 % Skonto in 10 Tagen\n#SKONTO#TAGE=10#PROZENT=2.00#\n", "#skonto#tage=10#prozent=2,00#", ""]) {
    assert.equal(skontoTermsIssue(quiet), null, quiet);
  }
});

test("XR-013 is read from UBL and CII files as a warning and explained from templates in every language", async () => {
  for (const [name, xml] of [["u.xml", ubl("2 % Skonto bei Zahlung innerhalb von 10 Tagen")], ["c.xml", cii("SKONTO#TAGE=10#PROZENT=2.00#")]]) {
    const v = await validate(name, xml, { profile: "xrechnung" });
    const f = v.findings.filter((x) => x.rule === "XR-013");
    assert.equal(f.length, 1, `${name}: ${JSON.stringify(v.findings)}`);
    assert.equal(f[0].severity, "warning");
    assert.match(f[0].fix, /#SKONTO#TAGE=10#PROZENT=2\.00#/);
    for (const lang of ["en", "de", "fr", "nl"]) {
      const [out] = await explainFindings(f, { lang });
      assert.equal(out.explanation.source, "template", `${name} ${lang}`);
      assert.match(out.explanation.action, /#SKONTO#TAGE=10#PROZENT=2\.00#/, lang);
    }
  }
  const ok = await validate("ok.xml", ubl("#SKONTO#TAGE=10#PROZENT=2.00#\n"), { profile: "xrechnung" });
  assert.ok(!ok.findings.some((x) => x.rule === "XR-013"));
});

test("the creator writes a Skonto line that passes the XRechnung rules, in UBL and CII", { skip: plainAvailable() ? false : "needs npm i --no-save slimdom fontoxpath" }, async () => {
  const draft = JSON.parse(readFileSync(new URL("./examples/draft-invoice.json", import.meta.url), "utf8"));
  draft.terms = "Zahlbar innerhalb 30 Tagen\n#SKONTO#TAGE=10#PROZENT=2.00#";
  for (const format of ["ubl", "cii"]) {
    const out = generateInvoice(draft, { format, profile: "xrechnung" });
    assert.ok(out.ok, format);
    assert.match(out.xml, /#SKONTO#TAGE=10#PROZENT=2\.00#\n</, format);
    const v = await validate(`g.${format}.xml`, out.xml, { profile: "xrechnung", schematron: true });
    assert.ok(!v.findings.some((f) => f.rule === "BR-DE-18"), `${format}: ${JSON.stringify(v.findings.map((f) => f.rule))}`);
  }
});

test("skonto-form fixes a missing leading # (XR-013) and leaves Skonto in words to a human", async () => {
  const r = await checkInvoice({ name: "u.xml", source: ubl("SKONTO#TAGE=10#PROZENT=2.00#") }, { fix: true, profile: "xrechnung" });
  const fix = r.fixes.applied.find((a) => a.id === "skonto-form");
  assert.ok(fix, JSON.stringify(r.fixes));
  assert.deepEqual(fix.changes, [{ element: "Note", before: "SKONTO#TAGE=10#PROZENT=2.00#", after: "#SKONTO#TAGE=10#PROZENT=2.00#\n" }]);
  assert.ok(fix.resolves.includes("XR-013"));
  const words = await checkInvoice({ name: "w.xml", source: ubl("2 % Skonto bei Zahlung innerhalb von 10 Tagen") }, { fix: true, profile: "xrechnung" });
  assert.ok(!(words.fixes?.applied ?? []).some((a) => a.id === "skonto-form"));
});

test("skonto-form clears BR-DE-18 on the slips the official rule refuses, in UBL and CII", { skip: plainAvailable() ? false : "needs npm i --no-save slimdom fontoxpath" }, async () => {
  const opts = { fix: true, profile: "xrechnung", schematron: true };
  for (const [name, xml] of [
    ["comma.xml", ubl("#SKONTO#TAGE=10#PROZENT=2,00#\n")],
    ["lower.xml", ubl("#skonto#tage=10#prozent=2.00#\n")],
    ["nobreak.xml", ubl("#SKONTO#TAGE=10#PROZENT=2.00#")],
    ["oneline.xml", ubl("#SKONTO#TAGE=10#PROZENT=3.00##SKONTO#TAGE=20#PROZENT=2.00#\n")],
    ["cii.xml", cii("Zahlbar innerhalb von 30 Tagen netto\n#SKONTO#TAGE=10#PROZENT=2#")],
  ]) {
    const before = await validate(name, xml, { profile: "xrechnung", schematron: true });
    assert.ok(before.findings.some((f) => f.rule === "BR-DE-18"), `${name} fails BR-DE-18 first`);
    const r = await checkInvoice({ name, source: xml }, opts);
    const fix = r.fixes.applied.find((a) => a.id === "skonto-form");
    assert.ok(fix, `${name}: ${JSON.stringify(r.fixes.skipped)}`);
    assert.ok(fix.resolves.includes("BR-DE-18"), name);
    const after = await validate(name, r.fixes.content, { profile: "xrechnung", schematron: true });
    assert.ok(!after.findings.some((f) => f.rule === "BR-DE-18" || f.rule === "XR-013"), `${name}: ${JSON.stringify(after.findings)}`);
  }
  const guess = await checkInvoice({ name: "g.xml", source: ubl("#SKONTO#TAGE=10#PROZENT=2.125#\n") }, opts);
  assert.ok(!(guess.fixes?.applied ?? []).some((a) => a.id === "skonto-form"));
  assert.match(JSON.stringify(guess.fixes?.skipped ?? []), /check it by hand/);
});

test("inspectXrechnungProfile reads payment.terms from a JSON invoice too", () => {
  const inv = { buyer_reference: "04011000-12345-03", supplier: { vat_id: "DE136695976", city: "B", postal_code: "1", contact: { name: "E", phone: "+49 30 1", email: "a@b.example" } },
    customer: { city: "H", postal_code: "2" }, payment: { means: "58", iban: "DE89370400440532013000", terms: "3 % Skonto innerhalb 7 Tagen" } };
  assert.deepEqual(inspectXrechnungProfile(inv).map((f) => `${f.rule}:${f.severity}`), ["XR-013:warning"]);
});
