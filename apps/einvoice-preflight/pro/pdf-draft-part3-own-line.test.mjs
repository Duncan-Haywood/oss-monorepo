// PDF to ZUGFeRD, part 3: a discount printed on its own line under its row ("abzgl. 8 % Rabatt
// -85,44 €"), EN 16931 BG-27. Before this, such a line was read as a discount on the whole invoice
// and ended the table, so every row after it was lost. Fixture:
// pro/testdata/rechnung-positionsrabatt-de.html, printed by Chromium and by LibreOffice; fictional
// firms. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateFacturX } from "../facturx-pdf.mjs";
import { readFontsSync } from "../facturx-pdf-node.mjs";
import { checkInvoice } from "./check.mjs";
import { draftFromLines, draftFromPdf } from "./pdf-draft.mjs";

const pdf = (name) => new Uint8Array(readFileSync(new URL(`./testdata/${name}`, import.meta.url)));

for (const producer of ["", "-libreoffice"]) {
  const lo = producer ? " (LibreOffice)" : "";

  test(`discounts on their own line under rows 1 and 4, and the rows between still read${lo}`, async () => {
    const r = await draftFromPdf(pdf(`rechnung-positionsrabatt-de${producer}.pdf`));
    assert.deepEqual(
      r.draft.lines.map((l) => [l.description, l.quantity, l.unit_price, l.allowances]),
      [
        ["LED-Panel 60 x 60, 4000 K", 12, 89, [{ reason: "Rabatt", percent: 8 }]],
        ["Mantelleitung NYM-J 3 x 1,5", 100, 0.92, undefined],
        ["Elektroinstallation", 14, 58, undefined],
        ["Unterverteilung 3-reihig", 1, 245, [{ reason: "Sonderrabatt", amount: 20 }]],
      ],
    );
    // Not taken a second time as a discount on the whole invoice.
    assert.equal(r.draft.allowances, undefined);
    assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
    for (const id of ["rows-sum-to-net", "net-matches", "vat-matches", "total-matches"]) assert.ok(r.checks.some((c) => c.id === id), id);
    const f0 = r.fields.find((x) => x.path === "lines.0");
    assert.match(f0.note, /abzgl\. 8 % Rabatt.*1068\.00 less 8 % = 85\.44 is 982\.56/);
    assert.match(f0.line, /abzgl\. 8 % Rabatt/);
    // The last row's discount has no percent to check it by: it follows the pattern above and asks
    // to be confirmed.
    const f3 = r.fields.find((x) => x.path === "lines.3");
    assert.equal(f3.check, true);
    assert.match(f3.note, /245\.00 less 20\.00 is 225\.00 \(under the last row/);
    assert.deepEqual(r.missing.map((m) => m.path), ["buyer.endpoint"]);

    r.draft.buyer.endpoint = { scheme: "EM", id: "rechnungseingang@buerobau.example" };
    const fx = generateFacturX(r.draft, { fonts: readFontsSync(), date: new Date("2026-11-26T00:00:00Z") });
    assert.equal(fx.ok, true, JSON.stringify(fx.errors));
    assert.equal(fx.totals.net, 2111.56);
    assert.equal(fx.totals.gross, 2512.76);
    const checked = await checkInvoice({ name: "out.pdf", source: fx.pdf }, { lang: "en" });
    assert.equal(checked.status, "pass", JSON.stringify(checked.findings?.map((x) => x.rule)));
  });
}

const T = (y, ...cells) => ({ page: 1, y, text: cells.join("  "), cells, xs: cells.map((_, i) => i * 100) });
const head = [T(800, "Rechnungsnummer:", "R-20"), T(700, "Pos.", "Bezeichnung", "Menge", "Einzelpreis", "Gesamt")];

test("a discount line that also prints the row's net, and a charge under a row", () => {
  const r = draftFromLines([
    ...head,
    T(680, "1", "Montage", "10", "50,00", "500,00"),
    T(664, "Rabatt 10 %", "-50,00", "450,00"),
    T(648, "2", "Material", "1", "150,00", "150,00"),
    T(632, "zzgl. Eilzuschlag", "15,00"),
    T(616, "3", "Anfahrt", "1", "40,00", "40,00"),
    T(580, "Nettobetrag", "655,00"),
    T(560, "19 % USt", "124,45"),
    T(540, "Gesamtbetrag", "779,45"),
  ]);
  assert.deepEqual(r.draft.lines.map((l) => [l.description, l.allowances, l.charges]), [
    ["Montage", [{ reason: "Rabatt", percent: 10 }], undefined],
    ["Material", undefined, [{ reason: "Eilzuschlag", amount: 15 }]],
    ["Anfahrt", undefined, undefined],
  ]);
  assert.equal(r.draft.allowances, undefined);
  assert.equal(r.draft.charges, undefined);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
});

test("a printed percent that is not the row's: the amount is kept and the row asks to be confirmed", () => {
  const r = draftFromLines([
    ...head,
    T(680, "1", "Montage", "10", "50,00", "500,00"),
    T(664, "abzgl. 10 % Rabatt", "-45,00"),
    T(648, "2", "Material", "1", "150,00", "150,00"),
    T(600, "Nettobetrag", "605,00"),
    T(580, "19 % USt", "114,95"),
    T(560, "Gesamtbetrag", "719,95"),
  ]);
  assert.deepEqual(r.draft.lines[0].allowances, [{ reason: "Rabatt", amount: 45 }]);
  const f = r.fields.find((x) => x.path === "lines.0");
  assert.equal(f.check, true);
  assert.match(f.note, /10 % of 500\.00 is 50\.00, not the printed 45\.00/);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
});

test("under the last row only: the row's own when its percent fits, else a discount on the invoice", () => {
  const foot = (net, vat, gross) => [T(600, "Nettobetrag", net), T(580, "19 % USt", vat), T(560, "Gesamtbetrag", gross)];
  // 5 % of the last row (150,00) is 7,50: the row's own.
  const own = draftFromLines([...head, T(680, "1", "Montage", "10", "50,00", "500,00"), T(664, "2", "Material", "1", "150,00", "150,00"), T(648, "abzgl. 5 % Rabatt", "-7,50"), ...foot("642,50", "122,08", "764,58")]);
  assert.deepEqual(own.draft.lines[1].allowances, [{ reason: "Rabatt", percent: 5 }]);
  assert.equal(own.draft.allowances, undefined);
  assert.ok(own.checks.every((c) => c.ok), JSON.stringify(own.checks));
  // 5 % of all rows (650,00) is 32,50: a discount on the whole invoice, as before.
  const doc = draftFromLines([...head, T(680, "1", "Montage", "10", "50,00", "500,00"), T(664, "2", "Material", "1", "150,00", "150,00"), T(648, "abzgl. 5 % Rabatt", "-32,50"), ...foot("617,50", "117,33", "734,83")]);
  assert.equal(doc.draft.lines[1].allowances, undefined);
  assert.deepEqual(doc.draft.allowances, [{ reason: "5 % Rabatt", amount: 32.5, tax_percent: 19 }]);
  // No percent and no row above with its own discount line: left on the invoice, not guessed.
  const none = draftFromLines([...head, T(680, "1", "Montage", "10", "50,00", "500,00"), T(664, "2", "Material", "1", "150,00", "150,00"), T(648, "Sonderrabatt", "-20,00"), ...foot("630,00", "119,70", "749,70")]);
  assert.equal(none.draft.lines[1].allowances, undefined);
  assert.equal(none.draft.allowances?.[0].amount, 20);
});

test("French: a Remise line in one cell under a wrapped description", () => {
  const r = draftFromLines([
    T(800, "Facture n°", "F-2026-90"),
    T(700, "Désignation", "Qté", "Prix unitaire", "Montant HT"),
    T(680, "Carrelage grès cérame", "40", "32,00 €", "1 280,00 €"),
    T(668, "60 x 60, pose droite"),
    T(652, "Remise 5 % -64,00 €"),
    T(636, "Plinthes", "30", "4,20 €", "126,00 €"),
    T(600, "Total HT", "1 342,00 €"),
    T(580, "TVA 20 %", "268,40 €"),
    T(560, "Total TTC", "1 610,40 €"),
  ]);
  assert.equal(r.locale, "fr");
  assert.deepEqual(r.draft.lines.map((l) => [l.description, l.allowances]), [
    ["Carrelage grès cérame 60 x 60, pose droite", [{ reason: "Remise", percent: 5 }]],
    ["Plinthes", undefined],
  ]);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
});
