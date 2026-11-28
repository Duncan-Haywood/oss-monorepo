import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { loadInvoiceForView } from "./viewer-load.mjs";
import { renderInvoiceHtml, formatDecimal, formatDate, formatIban, esc, describeSpecification } from "./viewer.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url));
const html = read("xrechnung-anzeigen.html").toString("utf8");

test("German page with the disclaimer, the licence line and the usage opt-out", () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /Ohne Gewähr \(no warranty\)/);
  assert.match(html, /keine Rechts-, Steuer-, Finanz- oder Buchhaltungsberatung/);
  assert.match(html, /FSL-1\.1-MIT/);
  assert.match(html, /recordUsage\(usageStorage\(\), optOut\.checked, "xrechnung_viewed"\)/);
  assert.match(html, /id="usageOptOut"/);
});

test("no price claim, no validity claim, and the paid service is described as not on sale", () => {
  assert.doesNotMatch(html, /[$€]\s?\d/);
  assert.doesNotMatch(html, /ist gültig|rechtssicher|garantiert/);
  assert.match(html, /Noch ist nichts zu kaufen/);
});

test("FAQPage schema matches the visible questions and answers", () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  assert.ok(ld.mainEntity.length >= 5);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text), q.name);
  }
});

test("the page's sample file exists and its modules are the ones shipped here", () => {
  for (const m of html.matchAll(/from "\.\/([\w-]+\.mjs)"/g)) assert.ok(fs.existsSync(new URL(`./${m[1]}`, import.meta.url)), m[1]);
  const sample = html.match(/fetch\("([^"]+)"\)/)[1];
  assert.ok(fs.existsSync(new URL(`./${sample}`, import.meta.url)), sample);
});

test("linked from the German pages, the checker, the sitemap and llms.txt", () => {
  for (const f of ["index.html", "e-rechnung-pruefen.html", "xrechnung-oder-zugferd.html", "sitemap.xml", "llms.txt"]) {
    assert.match(read(f).toString("utf8"), /xrechnung-anzeigen\.html/, f);
  }
});

test("amounts are formatted from their decimal text, German style", () => {
  assert.equal(formatDecimal("1234.5"), "1.234,50");
  assert.equal(formatDecimal(48.5), "48,50");
  assert.equal(formatDecimal("0.1234"), "0,1234");
  assert.equal(formatDecimal("-1190.00"), "−1.190,00");
  assert.equal(formatDecimal("-0.00"), "0,00");
  assert.equal(formatDecimal("10", 0), "10");
  assert.equal(formatDecimal("1234567.891"), "1.234.567,891");
  assert.equal(formatDecimal("12345678901234.56"), "12.345.678.901.234,56");
  assert.equal(formatDecimal("abc<"), "abc&lt;");
  assert.equal(formatDate("2026-09-02"), "02.09.2026");
  assert.equal(formatIban("de02120300000000202051"), "DE02 1203 0000 0000 2020 51");
});

test("specification ids are named", () => {
  assert.equal(describeSpecification("urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"), "XRechnung 3.0");
  assert.equal(describeSpecification("urn:cen.eu:en16931:2017"), "EN 16931");
  assert.equal(describeSpecification("urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended"), "ZUGFeRD / Factur-X EXTENDED");
});

test("the XRechnung CII example reads as the invoice its comment describes", async () => {
  const { invoice, source } = await loadInvoiceForView("xrechnung-cii-invoice.xml", read("examples/xrechnung-cii-invoice.xml"));
  assert.equal(source, "XRechnung 3.0 (CII)");
  const out = renderInvoiceHtml(invoice, { source });
  assert.match(out, /Nr\. RE-2026-0107/);
  assert.match(out, /02\.09\.2026/);
  assert.match(out, /Beratung Fachverfahren/);
  assert.match(out, /960,00/);
  assert.match(out, /Umsatzsteuer 19 % auf 1\.000,00 EUR<\/th><td class="num">190,00 EUR/);
  assert.match(out, /Gesamtbetrag brutto<\/th><td class="num">1\.190,00 EUR/);
  assert.match(out, /Positionen \(2\)/);
});

test("UBL, credit notes and a Factur-X PDF all render", async () => {
  const cases = [
    ["ubl-invoice.xml", /Nr\. INV-2026-0042[\s\S]*Zahlbetrag<\/th><td class="num">300,00 EUR/],
    ["xrechnung-cii-credit-note.xml", /Gutschrift/],
    ["peppol-credit-note.xml", /Gutschrift/],
    ["factur-x-invoice.pdf", /Rechnung/],
  ];
  for (const [file, pattern] of cases) {
    const { invoice, source } = await loadInvoiceForView(file, read(`examples/${file}`));
    const out = renderInvoiceHtml(invoice, { source });
    assert.match(out, pattern, file);
    if (file.endsWith(".pdf")) assert.match(source, /aus der PDF entpackte CII-XML/);
  }
});

test("every example in EN 16931 syntax renders without throwing", async () => {
  let rendered = 0;
  for (const file of fs.readdirSync(new URL("./examples/", import.meta.url))) {
    if (!/\.(xml|pdf)$/.test(file)) continue;
    const bytes = read(`examples/${file}`);
    const text = bytes.toString("utf8");
    if (file.endsWith(".xml") && !/CrossIndustryInvoice|urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2/.test(text)) continue;
    try {
      const { invoice, source } = await loadInvoiceForView(file, bytes);
      assert.ok(renderInvoiceHtml(invoice, { source }).length > 200, file);
      rendered += 1;
    } catch (error) {
      // A file with deliberate defects may not parse; the page must say so in German.
      assert.match(error.message, /E-Rechnung|PDF|XML/, file);
    }
  }
  assert.ok(rendered >= 10, `rendered ${rendered}`);
});

test("file content is escaped: a hostile invoice cannot inject markup", async () => {
  const src = read("examples/xrechnung-cii-invoice.xml").toString("utf8")
    .replace("Beratung Fachverfahren", "&lt;img src=x onerror=alert(1)&gt;")
    .replace("<ram:ID>RE-2026-0107</ram:ID>", "<ram:ID>&lt;script&gt;alert(2)&lt;/script&gt;</ram:ID>")
    .replace("Muster Beratung GmbH", "Müller &amp; Söhne GmbH");
  const { invoice } = await loadInvoiceForView("x.xml", new TextEncoder().encode(src));
  const out = renderInvoiceHtml(invoice);
  assert.doesNotMatch(out, /<img|<script/);
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(out, /Nr\. &lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  // Decoded once, escaped once: the reader sees "Müller & Söhne GmbH".
  assert.match(out, /<strong>Müller &amp; Söhne GmbH<\/strong>/);
  assert.equal(esc(`<a href="x">'`), "&lt;a href=&quot;x&quot;&gt;&#39;");
});

test("non-invoices are refused with a German message", async () => {
  await assert.rejects(loadInvoiceForView("a.xml", new Uint8Array()), /leer/);
  await assert.rejects(loadInvoiceForView("a.txt", new TextEncoder().encode("hello")), /keine XML-Datei/);
  await assert.rejects(loadInvoiceForView("a.xml", new TextEncoder().encode("<note>hi</note>")), /nicht als E-Rechnung/);
  await assert.rejects(loadInvoiceForView("a.pdf", new TextEncoder().encode("%PDF-1.4\n%%EOF")), /keine lesbare E-Rechnung/);
});

test("construction invoice codes as KoSIT's BR-DE-17 names them: 875 partial, 876 partial final, 877 final", async () => {
  const { DOCUMENT_TYPES } = await import("./viewer.mjs");
  assert.match(DOCUMENT_TYPES["875"], /^Abschlagsrechnung/);
  assert.match(DOCUMENT_TYPES["876"], /^Teilschlussrechnung/);
  assert.match(DOCUMENT_TYPES["877"], /^Schlussrechnung/);
});

test("a type code naming an Object.prototype member shows as a bare code, not a crash", async () => {
  const { documentTitle } = await import("./viewer.mjs");
  for (const code of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.equal(documentTitle({ document_code: code }), "Rechnung", code);
    const html = renderInvoiceHtml({ document_code: code, lines: [], totals: {} });
    assert.doesNotMatch(html, /function|native code/, code);
  }
});
