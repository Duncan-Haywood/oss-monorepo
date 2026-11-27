// PDF to ZUGFeRD, part 1: plain PDF invoices (printed by Chromium from testdata/*.html, and the
// creator's own Factur-X page) read back into the creator's draft, the draft written as Factur-X,
// and that file passing the checker. Proprietary (see ../LICENSE).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { generateFacturX } from "../facturx-pdf.mjs";
import { readFontsSync } from "../facturx-pdf-node.mjs";
import { checkInvoice } from "./check.mjs";
import { draftFromLines, draftFromPdf, findDate, ibanChecksumOk, parseAmount, readRow } from "./pdf-draft.mjs";
import { extractPdfLines, layoutLines } from "./pdf-text.mjs";
import { createProHandler } from "./server.mjs";
import { MemoryStore } from "./store.mjs";

const pdf = (name) => new Uint8Array(readFileSync(new URL(`./testdata/${name}`, import.meta.url)));
const DRAFT = JSON.parse(readFileSync(new URL("../examples/draft-invoice.json", import.meta.url), "utf8"));
const fieldOf = (r, path) => r.fields.find((f) => f.path === path);

test("parseAmount reads German, French and English amounts", () => {
  assert.equal(parseAmount("1.234,56 €"), 1234.56);
  assert.equal(parseAmount("1 234,56 €", "fr"), 1234.56);
  assert.equal(parseAmount("1 234,56", "fr"), 1234.56);
  assert.equal(parseAmount("1,234.56", "en"), 1234.56);
  assert.equal(parseAmount("398.50 EUR", "en"), 398.5);
  assert.equal(parseAmount("12,5"), 12.5);
  assert.equal(parseAmount("1.000"), 1000);
  assert.equal(parseAmount("1,000", "en"), 1000);
  assert.equal(parseAmount("1,000", "de"), 1);
  assert.equal(parseAmount("-12,00"), -12);
  assert.equal(parseAmount("12,00-"), -12);
  assert.equal(parseAmount("Beratung"), null);
  assert.equal(parseAmount("12.11.2026"), null);
  assert.equal(parseAmount("DE136695976"), null);
});

test("findDate reads day-first numeric, ISO and written dates", () => {
  assert.equal(findDate("12.11.2026"), "2026-11-12");
  assert.equal(findDate("Rechnungsdatum: 3.2.26"), "2026-02-03");
  assert.equal(findDate("03/12/2026"), "2026-12-03");
  assert.equal(findDate("2026-10-15"), "2026-10-15");
  assert.equal(findDate("15. Oktober 2026"), "2026-10-15");
  assert.equal(findDate("3 novembre 2026"), "2026-11-03");
  assert.equal(findDate("October 15, 2026"), "2026-10-15");
  assert.equal(findDate("10/15/2026"), "2026-10-15", "month-first still reads when the day cannot be a month");
  assert.equal(findDate("31.02.2026"), null);
  assert.equal(findDate("no date"), null);
});

test("ibanChecksumOk is the ISO 13616 mod-97 check", () => {
  assert.equal(ibanChecksumOk("DE02120300000000202051"), true);
  assert.equal(ibanChecksumOk("FR1420041010050500013M02606"), true);
  assert.equal(ibanChecksumOk("DE02120300000000202052"), false);
  assert.equal(ibanChecksumOk("DE0212"), false);
});

test("readRow keeps a row only when quantity x unit price = amount", () => {
  assert.deepEqual(readRow(["2", "Arbeitszeit", "12,5", "Std.", "68,00 €", "850,00 €"], "de"), {
    description: "Arbeitszeit", quantity: 12.5, unitPrice: 68, amount: 850, unit: "HUR", rate: null,
  });
  assert.equal(readRow(["2", "Arbeitszeit", "12,5", "Std.", "68,00 €", "851,00 €"], "de"), null);
  assert.equal(readRow(["Pose sur site", "2 jours", "540,00 €", "20 %", "1 080,00 €"], "fr").unit, "DAY");
  assert.equal(readRow(["Pose sur site", "2 jours", "540,00 €", "20 %", "1 080,00 €"], "fr").rate, 20);
});

test("layoutLines splits table cells by gap and orders lines top to bottom", () => {
  const run = (x, y, text, end = x + text.length * 5) => ({ page: 1, x, y, end, size: 10, text });
  const lines = layoutLines([run(300, 700, "200,00"), run(50, 700, "Beratung"), run(200, 700, "2"), run(50, 720, "Rechnung")]);
  assert.deepEqual(lines.map((l) => l.cells), [["Rechnung"], ["Beratung", "2", "200,00"]]);
});

test("a German invoice printed by a browser: header, both parties, footer IDs, rows and totals", async () => {
  const r = await draftFromPdf(pdf("rechnung-de.pdf"));
  assert.equal(r.readable, true);
  assert.equal(r.locale, "de");
  const d = r.draft;
  assert.equal(d.number, "2026-0815");
  assert.equal(d.issue_date, "2026-11-12");
  assert.equal(d.delivery_date, "2026-11-06");
  assert.equal(d.due_date, "2026-12-12");
  assert.equal(d.order_reference, "BV-4711");
  assert.equal(d.currency, "EUR");
  assert.deepEqual(
    { name: d.seller.name, street: d.seller.street, postal_code: d.seller.postal_code, city: d.seller.city, country: d.seller.country, vat_id: d.seller.vat_id, tax_number: d.seller.tax_number },
    { name: "Elektro Beispiel GmbH", street: "Industriestraße 12", postal_code: "70565", city: "Stuttgart", country: "DE", vat_id: "DE136695976", tax_number: "99/815/08150" },
  );
  assert.deepEqual(
    { name: d.buyer.name, street: d.buyer.street, postal_code: d.buyer.postal_code, city: d.buyer.city, country: d.buyer.country },
    { name: "Bauunternehmung Muster KG", street: "Am Hafen 7", postal_code: "28217", city: "Bremen", country: "DE" },
  );
  assert.equal(d.payment.iban, "DE02120300000000202051");
  assert.equal(d.payment.bic, "BYLADEM1001");
  assert.deepEqual(
    d.lines.map((l) => [l.description, l.quantity, l.unit, l.unit_price, l.tax_percent]),
    [
      ["Elektroinstallation Unterverteilung", 1, "C62", 1850, 19],
      ["Arbeitszeit Elektromeister", 12.5, "HUR", 68, 19],
      ["NYM-J 3x1,5 mm² Mantelleitung", 150, "MTR", 1.12, 19],
    ],
  );
  assert.deepEqual(r.printedTotals, { net: 2868, vat: 544.92, gross: 3412.92, vatRates: [{ rate: 19, amount: 544.92 }] });
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
  assert.equal(r.checks.length, 5);
  assert.deepEqual(r.missing.map((m) => m.path), ["buyer.endpoint"], "the PDF prints no buyer VAT ID or e-invoice address");
  assert.equal(r.ready, false);
  // Every value carries the line it was read from, and judgment calls are marked.
  for (const f of r.fields) assert.ok(typeof f.line === "string" && f.page === 1, f.path);
  assert.match(fieldOf(r, "payment.iban").line, /IBAN: DE02 1203 0000 0000 2020 51/);
  assert.equal(fieldOf(r, "buyer.country").check, true);
  assert.ok(r.toConfirm.includes("buyer.name"));
  assert.ok(r.toConfirm.includes("lines.0"), "the row's rate came from the totals");
});

test("the same invoice through LibreOffice: a description wrapped onto two lines joins its row", async () => {
  const r = await draftFromPdf(pdf("rechnung-de-libreoffice.pdf"));
  assert.equal(r.draft.lines.length, 3);
  assert.equal(r.draft.lines[0].description, "Elektroinstallation Unterverteilung");
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
});

test("a French facture: Vendeur / Client columns, TVA per row, written date", async () => {
  const r = await draftFromPdf(pdf("facture-fr.pdf"));
  assert.equal(r.locale, "fr");
  const d = r.draft;
  assert.equal(d.number, "F-2026-0142");
  assert.equal(d.issue_date, "2026-11-03");
  assert.equal(d.due_date, "2026-12-03");
  assert.equal(d.seller.name, "Menuiserie Exemple SARL");
  assert.equal(d.seller.vat_id, "FR68900000001");
  assert.equal(d.buyer.name, "Atelier Dupont SAS");
  assert.equal(d.buyer.city, "Grenoble");
  assert.equal(d.payment.iban, "FR1420041010050500013M02606");
  assert.deepEqual(d.lines.map((l) => [l.quantity, l.unit_price, l.tax_percent]), [[1, 4200, 20], [2, 540, 20]]);
  assert.equal(fieldOf(r, "seller.name").check, undefined, "a labelled column is not a guess");
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
});

test("§ 13b reverse charge: rows at 0 % become category AE with the PDF's own wording, buyer VAT ID by its label", async () => {
  const r = await draftFromPdf(pdf("rechnung-13b-de.pdf"));
  assert.equal(r.exemption.category, "AE");
  assert.equal(r.draft.buyer.vat_id, "DE900000022");
  assert.equal(r.draft.seller.vat_id, "DE136695976");
  for (const l of r.draft.lines) {
    assert.equal(l.tax_percent, 0);
    assert.equal(l.tax_category, "AE");
    assert.equal(l.tax_reason, "Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).");
  }
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
  assert.equal(r.ready, true);
});

test("the creator's own Factur-X page reads back to the draft it was made from", async () => {
  const fx = generateFacturX(DRAFT, { fonts: readFontsSync(), date: new Date("2026-10-15T00:00:00Z") });
  const r = await draftFromPdf(fx.pdf);
  assert.equal(r.reason, "already_einvoice", "the XML inside is the invoice: the caller is told to check that");
  for (const k of ["number", "issue_date", "due_date", "delivery_date", "buyer_reference", "order_reference"]) assert.equal(r.draft[k], DRAFT[k], k);
  assert.equal(r.draft.seller.vat_id, DRAFT.seller.vat_id);
  assert.equal(r.draft.payment.iban, DRAFT.payment.iban);
  assert.equal(r.draft.payment.bic, DRAFT.payment.bic);
  assert.deepEqual(r.draft.lines.map((l) => [l.description, l.quantity, l.unit_price, l.tax_percent]), DRAFT.lines.map((l) => [l.description, l.quantity, l.unit_price, l.tax_percent]));
  assert.ok(r.checks.every((c) => c.ok));
});

test("end to end: plain PDF -> draft -> Factur-X -> the checker passes it", async () => {
  for (const name of ["rechnung-de.pdf", "facture-fr.pdf", "rechnung-13b-de.pdf"]) {
    const r = await draftFromPdf(pdf(name));
    // The one thing these PDFs do not print and the person confirming the draft adds: the buyer's
    // e-invoice address, when no buyer VAT ID identifies them (listed in `missing`).
    if (!r.draft.buyer.vat_id) {
      assert.deepEqual(r.missing.map((m) => m.path), ["buyer.endpoint"], name);
      assert.equal(r.ready, false);
      r.draft.buyer.endpoint = { scheme: "EM", id: "rechnungseingang@kunde.example" };
    } else assert.deepEqual(r.missing, [], name);
    const fx = generateFacturX(r.draft, { fonts: readFontsSync(), date: new Date("2026-11-26T00:00:00Z") });
    assert.equal(fx.ok, true, `${name}: ${JSON.stringify(fx.errors)}`);
    const checked = await checkInvoice({ name: "out.pdf", source: fx.pdf }, { lang: "en" });
    assert.equal(checked.status, "pass", `${name}: ${JSON.stringify(checked.findings?.map((f) => f.rule))}`);
  }
});

test("nothing is invented: a row that does not multiply out is left out and the totals say so", () => {
  const L = (y, ...cells) => ({ page: 1, y, text: cells.join("  "), cells, xs: cells.map((_, i) => i * 100) });
  const r = draftFromLines([
    L(800, "Rechnungsnummer:", "R-1"),
    L(780, "Rechnungsdatum:", "01.12.2026"),
    L(700, "Pos.", "Bezeichnung", "Menge", "Einzelpreis", "Gesamt"),
    L(680, "1", "Fliesen verlegen", "10", "45,00", "450,00"),
    L(660, "2", "Material", "1", "99,00", "120,00"),
    L(640, "Nettobetrag", "570,00"),
    L(620, "zzgl. 19 % MwSt", "108,30"),
    L(600, "Gesamtbetrag", "678,30"),
  ]);
  assert.equal(r.draft.lines.length, 1);
  assert.equal(r.checks.find((c) => c.id === "rows-sum-to-net").ok, false);
  assert.equal(r.ready, false);
  assert.ok(r.missing.some((m) => m.path === "seller.name"), "no seller on the page: listed as missing, not filled in");
});

test("a page with no text layer, and bytes that are not a PDF", async () => {
  const scan = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF");
  assert.deepEqual(await draftFromPdf(scan), { readable: false, reason: "no_text", pages: 1 });
  assert.deepEqual(await draftFromPdf(new TextEncoder().encode("<Invoice/>")), { readable: false, reason: "not_pdf" });
  const enc = new TextEncoder().encode("%PDF-1.4\ntrailer << /Encrypt 5 0 R >>");
  assert.equal((await extractPdfLines(enc)).reason, "encrypted");
});

test("a hostile content stream stays bounded", async () => {
  const content = `BT /F1 10 Tf ${"[".repeat(5000)}(x) Tj ${"q ".repeat(10000)} ET`;
  const body = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n4 0 obj << /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\ntrailer << /Root 1 0 R >>`;
  const t = Date.now();
  const r = await extractPdfLines(new TextEncoder().encode(body));
  assert.ok(r);
  assert.ok(Date.now() - t < 2000);
});

// --- the API ---
let server;
let base;
before(async () => {
  const now = () => new Date("2026-11-26T10:00:00Z");
  server = createServer(createProHandler({ store: new MemoryStore({ now }), env: { ADMIN_TOKEN: "t" }, now }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("POST /v1/convert: signed in, a PDF in, the draft out; refuses other bodies", async () => {
  const acct = await (await fetch(`${base}/v1/admin/accounts`, { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ name: "Kanzlei PDF" }) })).json();
  const key = acct.apiKey;
  assert.equal((await fetch(`${base}/v1/convert`, { method: "POST", body: pdf("rechnung-de.pdf") })).status, 401);
  const res = await fetch(`${base}/v1/convert?profile=xrechnung`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/pdf" }, body: pdf("rechnung-de.pdf") });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.profile, "xrechnung");
  assert.equal(j.draft.number, "2026-0815");
  assert.ok(j.warnings.some((w) => w.path === "buyer_reference"), "XRechnung asks for the Leitweg-ID, which this PDF does not print");
  assert.equal(res.headers.get("x-usage-documents-charged"), null, "not metered");
  const bad = await fetch(`${base}/v1/convert`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: "<Invoice/>" });
  assert.equal(bad.status, 415);
  const badProfile = await fetch(`${base}/v1/convert?profile=hr`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: pdf("rechnung-de.pdf") });
  assert.equal(badProfile.status, 400);
  const empty = await fetch(`${base}/v1/convert`, { method: "POST", headers: { authorization: `Bearer ${key}` } });
  assert.equal(empty.status, 400);
});

// --- part 2: the convert screen's build step ---

test("POST /v1/convert/build: the confirmed draft becomes a checked Factur-X, metered once by its XML", async () => {
  const acct = await (await fetch(`${base}/v1/admin/accounts`, { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ name: "Kanzlei Build" }) })).json();
  const auth = { authorization: `Bearer ${acct.apiKey}`, "content-type": "application/json" };
  const read = await (await fetch(`${base}/v1/convert`, { method: "POST", headers: { authorization: auth.authorization }, body: pdf("rechnung-de.pdf") })).json();
  // What the person adds on the screen: the buyer's e-invoice address the PDF does not print.
  const draft = { ...read.draft, buyer: { ...read.draft.buyer, endpoint: { scheme: "EM", id: "rechnung@muster-kg.example" } } };

  const post = (body) => fetch(`${base}/v1/convert/build?lang=de`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const res = await post({ draft, format: "facturx", profile: "en16931" });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(j.contentType, "application/pdf");
  assert.equal(j.filename, "2026-0815.pdf");
  const bytes = Buffer.from(j.content, "base64");
  assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.deepEqual([j.totals.net, j.totals.tax, j.totals.gross], [read.printedTotals.net, read.printedTotals.vat, read.printedTotals.gross], "the e-invoice carries the PDF's amounts");
  assert.equal(j.check.status, "pass", JSON.stringify(j.check.findings));
  assert.equal(res.headers.get("x-usage-documents-charged"), "1");

  // The same invoice built again (a new PDF timestamp, the same XML) is not charged again.
  const again = await post({ draft, format: "facturx", profile: "en16931" });
  assert.equal(again.headers.get("x-usage-documents-charged"), "0");

  // XML formats.
  const ubl = await (await post({ draft, format: "ubl", profile: "en16931" })).json();
  assert.equal(ubl.contentType, "application/xml");
  assert.match(Buffer.from(ubl.content, "base64").toString("utf8"), /<Invoice[\s>]/);
  assert.equal(ubl.check.status, "pass", JSON.stringify(ubl.check.findings));

  // A draft the creator cannot build: errors, 200, unmetered.
  const broken = await post({ draft: { ...draft, number: "" }, format: "cii", profile: "en16931" });
  const bj = await broken.json();
  assert.equal(bj.ok, false);
  assert.ok(bj.errors.some((e) => e.path === "number"));
  assert.equal(broken.headers.get("x-usage-documents-charged"), null);

  // Factur-X has no Peppol profile: the creator says so.
  const peppolPdf = await (await post({ draft, format: "facturx", profile: "peppol" })).json();
  assert.equal(peppolPdf.ok, false);
  assert.ok(peppolPdf.errors.some((e) => e.path === "profile"));

  // Refusals.
  assert.equal((await fetch(`${base}/v1/convert/build`, { method: "POST", body: "{}" })).status, 401);
  assert.equal((await post({ draft, format: "docx" })).status, 400);
  assert.equal((await post({ draft, profile: "hr" })).status, 400);
  assert.equal((await post({ draft: [] })).status, 400);
  assert.equal((await fetch(`${base}/v1/convert/build`, { method: "POST", headers: auth, body: "not json" })).status, 400);
});
