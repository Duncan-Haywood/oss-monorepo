// PDF to ZUGFeRD, part 2: document-level discounts and charges between the item rows and the
// total (EN 16931 BG-20 / BG-21), rows continued across pages past a page subtotal, and the
// layouts LibreOffice prints (labels wrapped round their amount, a rate and an amount in one cell,
// party blocks stacked). Fixtures: pro/testdata/*.html, printed by Chromium and by LibreOffice;
// fictional firms. Proprietary (see ../LICENSE).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateFacturX } from "../facturx-pdf.mjs";
import { readFontsSync } from "../facturx-pdf-node.mjs";
import { checkInvoice } from "./check.mjs";
import { draftFromLines, draftFromPdf, readRow } from "./pdf-draft.mjs";

const pdf = (name) => new Uint8Array(readFileSync(new URL(`./testdata/${name}`, import.meta.url)));
const fieldOf = (r, path) => r.fields.find((f) => f.path === path);

for (const producer of ["", "-libreoffice"]) {
  const lo = producer ? " (LibreOffice)" : "";

  test(`a discount and a charge between the rows and the total, German${lo}`, async () => {
    const r = await draftFromPdf(pdf(`rechnung-rabatt-de${producer}.pdf`));
    assert.equal(r.draft.lines.length, 3);
    assert.equal(r.draft.lines[0].description, "Wandfliesen verlegen", "the fl/fi ligatures read as letters");
    assert.equal(r.draft.lines[1].description, "Fliesenkleber flexibel 25 kg");
    assert.deepEqual(r.draft.allowances, [{ reason: "3 % Rabatt", amount: 65.75, tax_percent: 19 }]);
    // LibreOffice wraps "zzgl. Anfahrtspauschale" onto two lines round its amount.
    assert.deepEqual(r.draft.charges, [{ reason: "Anfahrtspauschale", amount: 35, tax_percent: 19 }]);
    assert.equal(r.printedTotals.lineTotal, 2191.8);
    assert.equal(r.printedTotals.net, 2161.05, "the net after the discount and the charge, not the subtotal");
    assert.equal(r.printedTotals.gross, 2571.65);
    assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
    for (const id of ["rows-sum-to-net", "discounts-and-charges", "net-matches", "taxable-matches", "vat-matches", "total-matches"]) {
      assert.ok(r.checks.some((c) => c.id === id), id);
    }
    const a = fieldOf(r, "allowances.0");
    assert.match(a.line, /abzgl\. 3 % Rabatt/);
    assert.equal(a.check, true);
    assert.match(a.note, /only VAT rate/);
    assert.ok(r.toConfirm.includes("charges.0"));
    assert.ok(!r.draft.allowances.some((x) => /skonto/i.test(x.reason)), "Skonto in the payment terms is not a discount");
  });

  test(`a French remise between Total HT and Net HT${lo}`, async () => {
    const r = await draftFromPdf(pdf(`facture-remise-fr${producer}.pdf`));
    assert.equal(r.locale, "fr");
    // LibreOffice stacks the Vendeur and Client blocks one above the other.
    assert.equal(r.draft.seller.name, "Plâtrerie Exemple SAS");
    assert.equal(r.draft.buyer.name, "Promotion Modèle SARL");
    assert.equal(r.draft.buyer.vat_id, "FR40303265045");
    // ... and wraps the first description above and below its row, which starts "64 m²".
    assert.deepEqual(
      r.draft.lines.map((l) => [l.description, l.quantity, l.unit_price, l.tax_percent]),
      [
        ["Cloisons en plaques de plâtre", 64, 32.5, 20],
        ["Bandes et enduit", 64, 6.25, 20],
        ["Déplacement chantier", 2, 10, 20],
      ],
    );
    // ... and prints "Remise 10 % -250,00 €" as one cell.
    assert.deepEqual(r.draft.allowances, [{ reason: "Remise 10 %", amount: 250, tax_percent: 20 }]);
    assert.equal(r.draft.charges, undefined);
    assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
    assert.deepEqual(r.missing, []);
    assert.equal(r.ready, true);
  });

  test(`rows continued onto page 2 past "Zwischensumme Seite 1", two VAT rates and a freight charge${lo}`, async () => {
    const r = await draftFromPdf(pdf(`rechnung-mehrseitig-de${producer}.pdf`));
    assert.equal(r.pages, 2);
    assert.equal(r.draft.lines.length, 12, "the rows of both pages");
    assert.equal(r.draft.lines[0].description, "Rollrasen liefern");
    assert.equal(r.draft.lines[11].description, "Pflegeschnitt");
    // LibreOffice prints "19 % 780,00 €" as one cell.
    assert.deepEqual(r.draft.lines.map((l) => l.tax_percent), [7, 19, 7, 19, 7, 19, 19, 19, 19, 19, 7, 19]);
    assert.equal(r.draft.number, "2026-1123");
    assert.equal(r.draft.seller.vat_id, "DE136695976");
    // The page subtotal is not the invoice's net total.
    assert.equal(r.printedTotals.lineTotal, 3961);
    assert.equal(r.printedTotals.net, 4050);
    // LibreOffice wraps "19 % USt auf 2.792,00 / 530,48 €": the base is not the VAT.
    assert.deepEqual(r.printedTotals.vatRates, [{ rate: 7, amount: 88.06 }, { rate: 19, amount: 530.48 }]);
    // Freight at 19 % is the only split under which both rates' printed VAT come out.
    assert.deepEqual(r.draft.charges, [{ reason: "Frachtkosten", amount: 89, tax_percent: 19 }]);
    assert.match(fieldOf(r, "charges.0").note, /only split/);
    if (!producer) assert.equal(r.checks.find((c) => c.id === "carried-forward")?.ok, true, "Zwischensumme Seite 1 and Übertrag match the page-1 rows");
    assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
    assert.deepEqual(r.missing.map((m) => m.path), ["buyer.endpoint"]);
  });
}

test("end to end: discounts, charges and two pages -> draft -> Factur-X -> the checker passes it", async () => {
  for (const base of ["rechnung-rabatt-de", "facture-remise-fr", "rechnung-mehrseitig-de"]) {
    for (const name of [`${base}.pdf`, `${base}-libreoffice.pdf`]) {
      const r = await draftFromPdf(pdf(name));
      // What the person confirming the draft adds when the PDF prints no buyer VAT ID.
      if (!r.draft.buyer.vat_id) r.draft.buyer.endpoint = { scheme: "EM", id: "rechnungseingang@kunde.example" };
      const fx = generateFacturX(r.draft, { fonts: readFontsSync(), date: new Date("2026-11-26T00:00:00Z") });
      assert.equal(fx.ok, true, `${name}: ${JSON.stringify(fx.errors)}`);
      const checked = await checkInvoice({ name: "out.pdf", source: fx.pdf }, { lang: "en" });
      assert.equal(checked.status, "pass", `${name}: ${JSON.stringify(checked.findings?.map((f) => f.rule))}`);
    }
  }
});

test("readRow: a rate and an amount in one cell, and a quantity with a unit first in the row", () => {
  assert.deepEqual(readRow(["2", "120", "m²", "6,50 €", "19 % 780,00 €"], "de"), {
    description: "", quantity: 120, unitPrice: 6.5, amount: 780, unit: "MTK", rate: 19,
  });
  assert.equal(readRow(["Arbeit", "2", "50,00", "100,00 € 7 %"], "de").rate, 7);
  assert.deepEqual(readRow(["64 m²", "32,50 €", "20 % 2 080,00 €"], "fr"), {
    description: "", quantity: 64, unitPrice: 32.5, amount: 2080, unit: "MTK", rate: 20,
  });
});

const T = (y, ...cells) => ({ page: 1, y, text: cells.join("  "), cells, xs: cells.map((_, i) => i * 100) });
const P2 = (line) => ({ ...line, page: 2 });
const HEAD = [
  T(800, "Rechnungsnummer:", "R-9"),
  T(780, "Rechnungsdatum:", "01.12.2026"),
  T(700, "Pos.", "Bezeichnung", "Menge", "Einzelpreis", "USt", "Gesamt"),
  T(680, "1", "Montage", "10", "50,00", "19 %", "500,00"),
  T(660, "2", "Fachbuch", "4", "25,00", "7 %", "100,00"),
];

test("a discount on a two-rate invoice that no single rate explains is left for a person", () => {
  // 10 % off everything, split across both rates (85,50 + 6,30 VAT): no one rate gives that VAT.
  const r = draftFromLines([
    ...HEAD,
    T(640, "Zwischensumme", "600,00"),
    T(620, "abzgl. 10 % Rabatt", "-60,00"),
    T(600, "Nettobetrag", "540,00"),
    T(580, "19 % USt", "85,50"),
    T(560, "7 % USt", "6,30"),
    T(540, "Gesamtbetrag", "631,80"),
  ]);
  assert.deepEqual(r.draft.allowances, [{ reason: "10 % Rabatt", amount: 60 }]);
  assert.ok(r.missing.some((m) => m.path === "allowances.0.tax_percent" && /one entry per rate/.test(m.message)));
  assert.equal(r.ready, false);
  assert.match(fieldOf(r, "allowances.0").note, /VAT rate not read/);
});

test("Skonto and a down payment after the total are not discounts; a carried sum that is off is reported", () => {
  const r = draftFromLines([
    ...HEAD.slice(0, 4),
    T(640, "Übertrag", "450,00"),
    P2(T(760, "2", "Fachbuch", "4", "25,00", "7 %", "100,00")),
    P2(T(700, "Nettobetrag", "600,00")),
    P2(T(680, "19 % USt", "95,00")),
    P2(T(660, "7 % USt", "7,00")),
    P2(T(640, "Gesamtbetrag", "702,00")),
    P2(T(620, "abzgl. Abschlagszahlung vom 01.11.2026", "-300,00")),
    P2(T(600, "2 % Skonto bei Zahlung bis 10.12.2026", "14,04")),
  ]);
  assert.equal(r.draft.lines.length, 2, "the row on page 2 is read");
  assert.equal(r.draft.allowances, undefined);
  assert.equal(r.printedTotals.net, 600);
  assert.equal(r.checks.find((c) => c.id === "carried-forward").ok, false, "450,00 carried forward, but the row above it is 500,00");
  assert.equal(r.ready, false);
});

test("a page subtotal labelled only Zwischensumme is not the net total when rows follow it", () => {
  const r = draftFromLines([
    ...HEAD.slice(0, 4),
    T(640, "Zwischensumme", "500,00"),
    P2(T(760, "2", "Fachbuch", "4", "25,00", "7 %", "100,00")),
    P2(T(700, "Nettobetrag", "600,00")),
    P2(T(680, "19 % USt", "95,00")),
    P2(T(660, "7 % USt", "7,00")),
    P2(T(640, "Gesamtbetrag", "702,00")),
  ]);
  assert.equal(r.draft.lines.length, 2);
  assert.equal(r.printedTotals.net, 600);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
});

test("a printed percentage that is not the amount is marked for checking", () => {
  const r = draftFromLines([
    ...HEAD.slice(0, 4),
    T(640, "Zwischensumme", "500,00"),
    T(620, "abzgl. 5 % Rabatt", "-20,00"),
    T(600, "Nettobetrag", "480,00"),
    T(580, "19 % USt", "91,20"),
    T(560, "Gesamtbetrag", "571,20"),
  ]);
  assert.deepEqual(r.draft.allowances, [{ reason: "5 % Rabatt", amount: 20, tax_percent: 19 }]);
  assert.match(fieldOf(r, "allowances.0").note, /5 % of the 500\.00 rows total is 25\.00, not the printed 20\.00/);
  assert.ok(r.checks.every((c) => c.ok), "the totals themselves agree");
});

test("an exempt invoice's discount takes the exemption (§ 19 UStG)", () => {
  const r = draftFromLines([
    T(800, "Rechnungsnummer:", "K-1"),
    T(700, "Pos.", "Bezeichnung", "Menge", "Einzelpreis", "Gesamt"),
    T(680, "1", "Gartenpflege", "4", "40,00", "160,00"),
    T(640, "Zwischensumme", "160,00"),
    T(620, "Treuerabatt", "-10,00"),
    T(600, "Gesamtbetrag", "150,00"),
    T(560, "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."),
  ]);
  assert.equal(r.draft.lines[0].tax_category, "E");
  assert.equal(r.draft.allowances[0].tax_category, "E");
  assert.equal(r.draft.allowances[0].tax_percent, 0);
  assert.match(r.draft.allowances[0].tax_reason, /§ 19 UStG/);
});
