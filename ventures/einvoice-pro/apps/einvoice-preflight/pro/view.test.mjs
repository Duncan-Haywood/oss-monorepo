// The readable view (pro/view.mjs) and POST /v1/view.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { inspectInvoiceSource } from "../report.mjs";
import { checkInvoice } from "./check.mjs";
import { createProHandler } from "./server.mjs";
import { MemoryStore } from "./store.mjs";
import { renderInvoiceView, VIEW_CSP, viewLang } from "./view.mjs";

const read = (f) => readFileSync(new URL(`../examples/${f}`, import.meta.url), "utf8");
const DEFECTS = read("ubl-invoice-with-defects.xml");
const GOOD = read("ubl-invoice.xml");
const ADMIN = "admin-test-token";

async function viewOf(name, source, lang = "en", profile = "auto") {
  const check = await checkInvoice({ name, source }, { lang, profile });
  const invoice = (await inspectInvoiceSource(name, source)).invoice;
  return { check, html: renderInvoiceView(invoice, check, { lang, now: new Date("2026-11-27T12:00:00Z") }) };
}

test("every finding is shown exactly once, and a mark on a field links to it", async () => {
  const { check, html } = await viewOf("bad.xml", DEFECTS, "de");
  assert.equal(check.status, "fail");
  assert.ok(check.findings.length >= 5);
  check.findings.forEach((f, i) => {
    const n = i + 1;
    assert.equal(html.split(`id="f${n}"`).length - 1, 1, `finding ${n} (${f.rule}) listed once`);
    assert.equal(html.split(`href="#f${n}"`).length - 1, 1, `finding ${n} (${f.rule}) marked once`);
  });
  // German labels and German explanations.
  assert.match(html, /<html lang="de">/);
  assert.match(html, /Fälligkeitsdatum <span class="bt">BT-9<\/span>/);
  assert.match(html, /Das Fälligkeitsdatum liegt vor dem Rechnungsdatum/);
});

test("a finding sits on its field: the due date row and the missing IBAN", async () => {
  const { check, html } = await viewOf("bad.xml", DEFECTS);
  const due = check.findings.findIndex((f) => f.path === "/due_date") + 1;
  const iban = check.findings.findIndex((f) => f.path === "/payment/iban") + 1;
  assert.ok(due > 0 && iban > 0);
  // The mark is in the same table row as the field's label.
  assert.match(html, new RegExp(`<tr class="bad"><th>Due date <span class="bt">BT-9</span></th><td>2026-08-01 <a class="mark bad" href="#f${due}"`));
  // A field the file lacks is shown as missing when a finding names it.
  assert.match(html, new RegExp(`<th>IBAN <span class="bt">BT-84</span></th><td><em class="missing">missing</em> <a class="mark bad" href="#f${iban}"`));
});

test("a passing invoice shows its values as the file has them, code lists named", async () => {
  const { check, html } = await viewOf("good.xml", GOOD, "fr", "");
  assert.equal(check.status, "pass");
  assert.match(html, /Aucune erreur bloquante/);
  assert.match(html, /Facture commerciale \(380\)/);
  assert.match(html, /Virement SEPA \(58\)/);
  assert.match(html, /DE02120300000000202051/);
  assert.match(html, /Supplier GmbH/);
  assert.doesNotMatch(html, /class="mark/);
});

test("Factur-X PDF: the XML inside is laid out", async () => {
  const pdf = new Uint8Array(readFileSync(new URL("../examples/factur-x-invoice.pdf", import.meta.url)));
  const { html } = await viewOf("fx.pdf", pdf, "en");
  assert.match(html, /INV-2026-0043/);
  assert.match(html, /Reverse charge \(AE\)/);
});

test("values from the file are escaped; the page has no script and its own CSP", async () => {
  const evil = GOOD.replaceAll("Supplier GmbH", "&lt;script&gt;alert(1)&lt;/script&gt;&quot;&lt;img onerror=x&gt;");
  assert.notEqual(evil, GOOD);
  const { html } = await viewOf("evil.xml", evil);
  assert.ok(!/<script/i.test(html), "no script element");
  assert.ok(!/<img/i.test(html), "no injected element");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;&lt;img onerror=x&gt;/);
  // Character references in the file are shown as characters (and escaped again).
  const amp = await viewOf("amp.xml", GOOD.replaceAll("Supplier GmbH", "R&amp;D &#228; GmbH"));
  assert.match(amp.html, /<td>R&amp;D ä GmbH<\/td>/);
  assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'/);
});

test("a file outside EN 16931 gets the check's verdict and a plain note", async () => {
  const fa3 = read("fa3-invoice.xml");
  const check = await checkInvoice({ name: "fa3.xml", source: fa3 }, {});
  const html = renderInvoiceView(null, check, { lang: "en" });
  assert.match(html, /another format or could not be read/);
});

test("findings outside the invoice model (XML paths) are listed first, not lost", () => {
  const check = { status: "fail", findings: [{ rule: "CII-002", message: "schema", path: "/CrossIndustryInvoice/Foo" }, { rule: "X", message: "no path" }] };
  const html = renderInvoiceView({ invoice_number: "1", lines: [], totals: {} }, check, { lang: "nl" });
  assert.match(html, /Bevindingen zonder één veld/);
  assert.ok(html.indexOf('id="f1"') > 0 && html.indexOf('id="f2"') > 0);
});

test("viewLang falls back to English", () => {
  assert.equal(viewLang("pl-PL"), "pl");
  assert.equal(viewLang("xx"), "en");
  assert.equal(viewLang(undefined), "en");
});

// ---- POST /v1/view ----

let server;
let base;
before(async () => {
  const store = new MemoryStore({ now: () => new Date("2026-11-24T10:00:00Z") });
  server = createServer(createProHandler({ store, env: { ADMIN_TOKEN: ADMIN }, now: () => new Date("2026-11-24T10:00:00Z") }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function account() {
  const r = await fetch(`${base}/v1/admin/accounts`, { method: "POST", headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify({ name: "Kanzlei View" }) });
  return (await r.json()).apiKey;
}

test("POST /v1/view answers an HTML download, metered once per file like a check", async () => {
  const key = await account();
  assert.equal((await fetch(`${base}/v1/view`, { method: "POST", body: DEFECTS })).status, 401);
  const r = await fetch(`${base}/v1/view?lang=de&name=rechnung%201.xml`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/xml" }, body: DEFECTS });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /^text\/html/);
  assert.equal(r.headers.get("content-security-policy"), VIEW_CSP);
  assert.equal(r.headers.get("content-disposition"), 'attachment; filename="rechnung_1-view.html"');
  assert.equal(r.headers.get("x-check-status"), "fail");
  assert.equal(r.headers.get("x-usage-documents-charged"), "1");
  const html = await r.text();
  assert.match(html, /E-Rechnung INV-2026-0044/);
  // The same file again, or checked after viewing: free.
  const again = await fetch(`${base}/v1/view`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: DEFECTS });
  assert.equal(again.headers.get("x-usage-documents-charged"), "0");
  const check = await fetch(`${base}/v1/check`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: DEFECTS });
  assert.equal(check.headers.get("x-usage-documents-charged"), "0");
  // explain=0 with fix=1 is refused as on /v1/check; an empty body is refused.
  assert.equal((await fetch(`${base}/v1/view?explain=0&fix=1`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: DEFECTS })).status, 400);
  assert.equal((await fetch(`${base}/v1/view`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: "" })).status, 400);
});

test("UNTDID 1001 876 (partial final construction invoice, allowed by BR-DE-17) is named, not shown as a bare code", async () => {
  const source = GOOD.replace("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>", "<cbc:InvoiceTypeCode>876</cbc:InvoiceTypeCode>");
  assert.notEqual(source, GOOD);
  const { html } = await viewOf("ok.xml", source, "de");
  assert.match(html, /Teilschlussrechnung \(Bau\) \(876\)/);
});
