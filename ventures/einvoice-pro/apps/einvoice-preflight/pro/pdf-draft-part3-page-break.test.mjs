// PDF to ZUGFeRD, part 3: a row's description wrapped onto several lines and split by a page break.
// Chromium prints the amounts on the row's first line and goes on under the header it repeats on
// page 2; LibreOffice centres a row's amounts in its description unless the row splits. The rest of
// the description at the top of page 2 belongs to the last row of page 1, and the row is marked for
// a person to confirm. Also rows in m³ and t, which were dropped. Fixtures:
// pro/testdata/rechnung-umbruch-de.html (Chromium) and rechnung-umbruch-de-libreoffice.html (the
// same invoice with less space above the table, so LibreOffice's taller rows split at the same row);
// fictional firms. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateFacturX } from "../facturx-pdf.mjs";
import { readFontsSync } from "../facturx-pdf-node.mjs";
import { checkInvoice } from "./check.mjs";
import { draftFromLines, draftFromPdf, readRow } from "./pdf-draft.mjs";

const pdf = (name) => new Uint8Array(readFileSync(new URL(`./testdata/${name}`, import.meta.url)));
const WALL =
  "Natursteinmauer Granit trocken gesetzt, Höhe bis 60 cm, inkl. Streifenfundament C20/25, Frostschutzschicht und Hinterfüllung mit Drainagekies 16/32 sowie Abdeckplatten Granit geflammt";

for (const producer of ["", "-libreoffice"]) {
  const lo = producer ? " (LibreOffice)" : "";

  test(`a five-line description split across the page break${lo}`, async () => {
    const r = await draftFromPdf(pdf(`rechnung-umbruch-de${producer}.pdf`));
    assert.equal(r.pages, 2);
    assert.equal(r.draft.lines.length, 13, "every row, page 1 and page 2");
    const wall = r.draft.lines[10];
    assert.equal(wall.description, WALL);
    assert.deepEqual([wall.quantity, wall.unit, wall.unit_price, wall.tax_percent], [9, "MTR", 145, 19]);
    assert.equal(r.draft.lines[11].description, "Entsorgung Altpflaster", "the next row keeps its own description");
    const f = r.fields.find((x) => x.path === "lines.10");
    assert.equal(f.check, true, "a description joined across pages is for a person to confirm");
    assert.match(f.note, /description continued at the top of page 2: "/);
    assert.ok(r.toConfirm.includes("lines.10"));
    assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
  });

  test(`rows in m³ and t are read, with their UN/ECE units${lo}`, async () => {
    const r = await draftFromPdf(pdf(`rechnung-umbruch-de${producer}.pdf`));
    const by = Object.fromEntries(r.draft.lines.map((l) => [l.description, l]));
    assert.deepEqual([by["Schotter 0/32 Tragschicht"].quantity, by["Schotter 0/32 Tragschicht"].unit], [12, "TNE"]);
    assert.deepEqual([by["Aushub Bodenklasse 3-5"].quantity, by["Aushub Bodenklasse 3-5"].unit], [18, "MTQ"]);
    assert.equal(r.printedTotals.net, 6477);
  });
}

test("both prints convert to a Factur-X that passes the checker", async () => {
  for (const name of ["rechnung-umbruch-de.pdf", "rechnung-umbruch-de-libreoffice.pdf"]) {
    const r = await draftFromPdf(pdf(name));
    if (!r.draft.buyer.vat_id) r.draft.buyer.endpoint = { scheme: "EM", id: "rechnungseingang@kunde.example" };
    const fx = generateFacturX(r.draft, { fonts: readFontsSync(), date: new Date("2026-11-26T00:00:00Z") });
    assert.equal(fx.ok, true, `${name}: ${JSON.stringify(fx.errors)}`);
    const checked = await checkInvoice({ name: "out.pdf", source: fx.pdf }, { lang: "en" });
    assert.equal(checked.status, "pass", `${name}: ${JSON.stringify(checked.findings?.map((f) => f.rule))}`);
  }
});

test("readRow: m³ and t", () => {
  assert.equal(readRow(["7", "Aushub", "18 m³", "21,00 €", "378,00 €"], "de").unit, "MTQ");
  assert.equal(readRow(["4", "Schotter", "12", "t", "24,00 €", "288,00 €"], "de").unit, "TNE");
});

// Lines at explicit x: the position number at 50, the description at 85, amounts to the right.
const X = [50, 85, 320, 410, 460, 500];
const R = (page, y, ...cells) => ({ page, y, text: cells.join("  "), cells, xs: cells.map((_, i) => X[i]) });
const W = (page, y, text, x = 85) => ({ page, y, text, cells: [text], xs: [x] });
const head = (page, y) => R(page, y, "Pos.", "Bezeichnung", "Menge", "Einzelpreis", "USt", "Gesamt");
const top = [R(1, 800, "Rechnungsnummer:", "R-77"), R(1, 785, "Rechnungsdatum:", "01.12.2026"), head(1, 700)];
const foot = (page) => [R(page, 600, "Nettobetrag", "700,00"), R(page, 585, "19 % USt", "133,00"), R(page, 570, "Gesamtbetrag", "833,00")];

test("a running head at the top of page 2 is not part of a description", () => {
  const r = draftFromLines([
    ...top,
    R(1, 680, "1", "Montage", "10", "50,00", "19 %", "500,00"),
    W(1, 669.5, "Heizkörper Bad und Küche"),
    W(2, 805, "Rechnung R-77 – Seite 2 von 2", 50),
    head(2, 787),
    R(2, 768, "2", "Material", "1", "200,00", "19 %", "200,00"),
    ...foot(2),
  ]);
  assert.deepEqual(r.draft.lines.map((l) => l.description), ["Montage Heizkörper Bad und Küche", "Material"]);
  assert.equal(r.fields.find((f) => f.path === "lines.0").check, undefined, "nothing joined across pages");
});

test("a running head printed at the description's x is still not carried", () => {
  const r = draftFromLines([
    ...top,
    R(1, 680, "1", "Montage", "10", "50,00", "19 %", "500,00"),
    W(1, 669.5, "Heizkörper Bad und Küche"),
    W(2, 805, "Seite 2"),
    head(2, 787),
    R(2, 768, "2", "Material", "1", "200,00", "19 %", "200,00"),
    ...foot(2),
  ]);
  assert.deepEqual(r.draft.lines.map((l) => l.description), ["Montage Heizkörper Bad und Küche", "Material"]);
});

test("text at another column, or far below the repeated header, is not carried", () => {
  const other = draftFromLines([
    ...top,
    R(1, 680, "1", "Montage", "10", "50,00", "19 %", "500,00"),
    W(1, 669.5, "Heizkörper Bad und Küche"),
    head(2, 787),
    W(2, 772, "Hinweis zur Entsorgung", 50),
    R(2, 742, "2", "Material", "1", "200,00", "19 %", "200,00"),
    ...foot(2),
  ]);
  assert.deepEqual(other.draft.lines.map((l) => l.description), ["Montage Heizkörper Bad und Küche", "Material"]);
  const far = draftFromLines([
    ...top,
    R(1, 680, "1", "Montage", "10", "50,00", "19 %", "500,00"),
    W(1, 669.5, "Heizkörper Bad und Küche"),
    head(2, 787),
    W(2, 700, "Lose Anmerkung"),
    R(2, 660, "2", "Material", "1", "200,00", "19 %", "200,00"),
    ...foot(2),
  ]);
  assert.deepEqual(far.draft.lines.map((l) => l.description), ["Montage Heizkörper Bad und Küche", "Material"]);
});

test("centred rows: lines just above page 2's first row are that row's, not page 1's", () => {
  const r = draftFromLines([
    ...top,
    W(1, 691.7, "Montage Heizkörper"),
    R(1, 680, "1", "Bad", "10", "50,00", "19 %", "500,00"),
    W(1, 668.3, "und Küche"),
    head(2, 787),
    W(2, 771.7, "Material"),
    R(2, 760, "2", "Kupferrohr", "1", "200,00", "19 %", "200,00"),
    W(2, 748.3, "15 mm"),
    ...foot(2),
  ]);
  assert.deepEqual(r.draft.lines.map((l) => l.description), ["Montage Heizkörper Bad und Küche", "Material Kupferrohr 15 mm"]);
  assert.equal(r.fields.find((f) => f.path === "lines.0").check, undefined);
});

test("top-aligned rows: page 2's first lines go on with page 1's last row", () => {
  const r = draftFromLines([
    ...top,
    R(1, 690, "1", "Material", "1", "200,00", "19 %", "200,00"),
    W(1, 679.5, "Kupferrohr 15 mm"),
    R(1, 660, "2", "Montage", "10", "50,00", "19 %", "500,00"),
    W(1, 649.5, "Heizkörper Bad"),
    head(2, 787),
    W(2, 772, "und Küche, inkl. Thermostat"),
    W(2, 761.5, "und Entlüftung"),
    ...foot(2),
  ]);
  assert.deepEqual(r.draft.lines.map((l) => l.description), [
    "Material Kupferrohr 15 mm",
    "Montage Heizkörper Bad und Küche, inkl. Thermostat und Entlüftung",
  ]);
  const f = r.fields.find((x) => x.path === "lines.1");
  assert.equal(f.check, true);
  assert.match(f.line, /und Entlüftung/);
});
