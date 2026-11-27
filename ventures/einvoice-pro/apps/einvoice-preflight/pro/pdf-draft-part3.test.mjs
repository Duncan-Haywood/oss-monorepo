// PDF to ZUGFeRD, part 3: a discount on a single row (EN 16931 BG-27). A table with a Rabatt,
// Remise or Discount column may print a row whose quantity x price is not its amount; it is read
// when one discount (a percent, or an amount between the price and the amount) makes it so, to the
// cent, and written as a line allowance. Fixture: pro/testdata/rechnung-zeilenrabatt-de.html,
// printed by Chromium and by LibreOffice; fictional firms. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateFacturX } from "../facturx-pdf.mjs";
import { readFontsSync } from "../facturx-pdf-node.mjs";
import { checkInvoice } from "./check.mjs";
import { draftFromLines, draftFromPdf, readRow } from "./pdf-draft.mjs";

const pdf = (name) => new Uint8Array(readFileSync(new URL(`./testdata/${name}`, import.meta.url)));

for (const producer of ["", "-libreoffice"]) {
  const lo = producer ? " (LibreOffice)" : "";

  test(`rows with a percent and an amount in the Rabatt column, beside a USt column${lo}`, async () => {
    const r = await draftFromPdf(pdf(`rechnung-zeilenrabatt-de${producer}.pdf`));
    assert.deepEqual(
      r.draft.lines.map((l) => [l.description, l.quantity, l.unit_price, l.tax_percent, l.allowances]),
      [
        ["Kupferrohr 15 mm", 24, 8.4, 19, [{ reason: "Rabatt", percent: 10 }]],
        ["Pressbogen 15 mm", 36, 4.85, 19, [{ reason: "Rabatt", percent: 15 }]],
        ["Montage Heizkörper", 8, 62, 19, undefined],
        ["Thermostatkopf", 6, 24.9, 19, [{ reason: "Rabatt", amount: 9.4 }]],
      ],
    );
    // The rows add up after their discounts; no discount is taken twice as a document-level one.
    assert.equal(r.draft.allowances, undefined);
    assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
    for (const id of ["rows-sum-to-net", "net-matches", "vat-matches", "total-matches"]) assert.ok(r.checks.some((c) => c.id === id), id);
    const f = r.fields.find((x) => x.path === "lines.0");
    assert.match(f.note, /Rabatt: 24 x 8\.40 = 201\.60, less 10 % = 20\.16, is the printed 181\.44/);
    assert.match(r.fields.find((x) => x.path === "lines.3").note, /less 9\.40, is the printed 140\.00/);
    // Only the buyer's e-invoice address is missing (the PDF prints no buyer VAT ID).
    assert.deepEqual(r.missing.map((m) => m.path), ["buyer.endpoint"]);

    // Confirmed and built, the Factur-X file carries the line allowances and passes the checker.
    r.draft.buyer.endpoint = { scheme: "EM", id: "rechnungseingang@wohnungsbau.example" };
    const fx = generateFacturX(r.draft, { fonts: readFontsSync(), date: new Date("2026-11-26T00:00:00Z") });
    assert.equal(fx.ok, true, JSON.stringify(fx.errors));
    assert.equal(fx.totals.net, 965.85);
    assert.equal(fx.totals.gross, 1149.36);
    const checked = await checkInvoice({ name: "out.pdf", source: fx.pdf }, { lang: "en" });
    assert.equal(checked.status, "pass", JSON.stringify(checked.findings?.map((x) => x.rule)));
  });
}

test("readRow with a discount column: the arithmetic decides which percent is the discount", () => {
  const opts = { discount: true };
  // 10 % off 201,60 is 181,44; 19 % off is not, so 19 % is the VAT rate whichever comes first.
  for (const cells of [["1", "Kupferrohr", "24", "8,40", "10 %", "19 %", "181,44"], ["1", "Kupferrohr", "24", "8,40", "19 %", "10 %", "181,44"]]) {
    const row = readRow(cells, "de", opts);
    assert.deepEqual([row.quantity, row.unitPrice, row.amount, row.rate, row.discount], [24, 8.4, 181.44, 19, { percent: 10, amount: 20.16 }]);
  }
  // "Remise 5 %" in French, the amount after a thin-space thousands separator.
  assert.deepEqual(readRow(["Pose", "12", "112,50 €", "5 %", "20 %", "1 282,50 €"], "fr", opts).discount, { percent: 5, amount: 67.5 });
  // An amount off, printed with a minus or without.
  assert.deepEqual(readRow(["Thermostatkopf", "6", "24,90", "-9,40", "140,00"], "de", opts).discount, { amount: 9.4 });
  assert.deepEqual(readRow(["Thermostatkopf", "6", "24,90", "9,40", "140,00"], "de", opts).discount, { amount: 9.4 });
  // LibreOffice's joined cell.
  assert.deepEqual(readRow(["4", "Thermostatkopf", "6", "Stk", "24,90 €", "-9,40 € 19 % 140,00 €"], "de", opts).rate, 19);
  // "0 %" in the discount column is no discount and not a VAT rate.
  const plain = readRow(["Montage", "8", "62,00", "0 %", "496,00"], "de", opts);
  assert.equal(plain.rate, null);
  assert.equal(plain.discount, undefined);
  // Without a discount column the row stays unread: nothing is guessed.
  assert.equal(readRow(["Kupferrohr", "24", "8,40", "10 %", "19 %", "181,44"], "de"), null);
  // Off by a cent: unread with a discount column too.
  assert.equal(readRow(["Kupferrohr", "24", "8,40", "10 %", "19 %", "181,45"], "de", opts), null);
  // Two readings that both fit are not chosen between.
  assert.equal(readRow(["Kabel", "10", "10,00", "10 %", "10,00", "90,00"], "de", opts), null);
});

const T = (y, ...cells) => ({ page: 1, y, text: cells.join("  "), cells, xs: cells.map((_, i) => i * 100) });

test("a Remise column on a French invoice, and the totals checked after the row discounts", () => {
  const r = draftFromLines([
    T(800, "Facture n°", "F-2026-77"),
    T(780, "Date de facture :", "20/11/2026"),
    T(700, "Désignation", "Qté", "Prix unitaire", "Remise", "TVA", "Montant HT"),
    T(680, "Pose de carrelage", "12", "112,50 €", "5 %", "20 %", "1 282,50 €"),
    T(660, "Plinthes", "30", "4,20 €", "", "20 %", "126,00 €"),
    T(620, "Total HT", "1 408,50 €"),
    T(600, "TVA 20 %", "281,70 €"),
    T(580, "Total TTC", "1 690,20 €"),
  ]);
  assert.equal(r.locale, "fr");
  assert.deepEqual(r.draft.lines[0].allowances, [{ reason: "Remise", percent: 5 }]);
  assert.equal(r.draft.lines[1].allowances, undefined);
  for (const id of ["rows-sum-to-net", "net-plus-vat-is-gross"]) assert.equal(r.checks.find((c) => c.id === id)?.ok, true, id);
  assert.equal(r.printedTotals.net, 1408.5);
});

test("a document-level discount below a table with a discount column is still read as one", () => {
  const r = draftFromLines([
    T(800, "Rechnungsnummer:", "R-10"),
    T(700, "Pos.", "Bezeichnung", "Menge", "Einzelpreis", "Rabatt", "Gesamt"),
    T(680, "1", "Montage", "10", "50,00", "10 %", "450,00"),
    T(660, "2", "Material", "1", "150,00", "", "150,00"),
    T(640, "Zwischensumme", "600,00"),
    T(620, "abzgl. 5 % Projektrabatt", "-30,00"),
    T(600, "Nettobetrag", "570,00"),
    T(580, "19 % USt", "108,30"),
    T(560, "Gesamtbetrag", "678,30"),
  ]);
  assert.deepEqual(r.draft.lines[0].allowances, [{ reason: "Rabatt", percent: 10 }]);
  assert.deepEqual(r.draft.allowances, [{ reason: "5 % Projektrabatt", amount: 30, tax_percent: 19 }]);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
});
