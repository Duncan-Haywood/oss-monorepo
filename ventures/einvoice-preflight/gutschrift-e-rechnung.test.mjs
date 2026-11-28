// The German "Gutschrift als E-Rechnung" page: every measured row on it is bound to
// gutschrift-bench.mjs, so a change to the creator or the checker that moves a result fails
// here until the page is updated.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { CASES, caseTable, negate } from "./gutschrift-bench.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("gutschrift-e-rechnung.html");
const rows = await caseTable();

// What each case gives, as the page states it. Built-in first, then the official rules
// (measured with slimdom 4.3.5 and fontoxpath 3.34.0, as CI installs them).
const EXPECTED = [
  [[], [], [], []],
  [[], [], [], []],
  [["INV-033"], [], [], []],
  [[], [], [], []],
  [[], [], [], []],
  [[], [], [], []],
  [[], [], [], ["BR-DE-26 (warning)"]],
  [[], [], [], []],
  [[], [], [], []],
  [["INV-033", "XR-007"], [], [], ["BR-DE-17 (warning)"]],
  [["INV-034"], [], ["BR-CL-01"], []],
  [["INV-034", "INV-033"], [], ["BR-CL-01"], []],
];

const BUILTIN_CELL = {
  "": "keine Meldung",
  "INV-033": "Fehler INV-033 (Bezug fehlt)",
  "INV-033,XR-007": "Fehler XR-007 (Code), INV-033 (Bezug fehlt)",
  "INV-034": "Fehler INV-034 (Dateiart und Code passen nicht)",
  "INV-033,INV-034": "Fehler INV-034 (Dateiart und Code passen nicht), INV-033 (Bezug fehlt)",
};
const OFFICIAL_CELL = {
  "": "keine Meldung",
  "BR-DE-26 (warning)": 'Warnung <a href="rules/de/br-de-26.html">BR-DE-26</a>',
  "BR-DE-17 (warning)": 'Warnung <a href="rules/de/br-de-17.html">BR-DE-17</a>',
  "BR-CL-01": "abgewiesen: BR-CL-01",
};
const key = (list) => [...list].sort().join(",");

test("German page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /Ohne Gewähr \(no warranty\)/);
  assert.match(html, /keine Rechts-, Steuer-, Finanz- oder Buchhaltungsberatung/);
  assert.match(html, /FSL-1\.1-MIT/);
});

test("the cases are what their labels say", () => {
  assert.equal(rows.length, CASES.length);
  assert.equal(rows.length, EXPECTED.length);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(by["Rechnung (380), richtig"].root, "Invoice");
  assert.equal(by["Rechnungskorrektur als Gutschriftsanzeige (381) mit Bezug auf die Rechnung, richtig"].reference, true);
  assert.equal(by["381 ohne Bezug auf die ursprüngliche Rechnung (BT-25 fehlt)"].reference, false);
  assert.equal(by["381 mit negativen Beträgen (doppelt negativ)"].payable, "-398.50");
  assert.equal(by["Storno als Rechnung (380) mit negativen Beträgen und Bezug"].code, "380");
  assert.equal(by["Storno als Rechnung (380) mit negativen Beträgen und Bezug"].reference, true);
  assert.equal(by["korrigierte Rechnung (384) ohne Bezug"].code, "384");
  assert.equal(by["Gutschrift im Sinne des UStG (389, Abrechnung durch den Kunden)"].code, "389");
  assert.equal(by["Gutschriftsanzeige-Datei (CreditNote) mit Typcode 380"].root, "CreditNote");
  assert.equal(by["Rechnungs-Datei (Invoice) mit Typcode 381"].root, "Invoice");
  for (const r of rows) assert.ok(["398.50", "-398.50"].includes(r.payable), r.label);
});

test("negate leaves unit prices positive and does not double a minus", () => {
  const x = '<cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount><cbc:PayableAmount currencyID="EUR">5.00</cbc:PayableAmount>';
  assert.equal(negate(x), '<cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount><cbc:PayableAmount currencyID="EUR">-5.00</cbc:PayableAmount>');
  assert.equal(negate(negate(x)), negate(x));
});

test("the built-in checks give what the page says", () => {
  rows.forEach((r, i) => {
    assert.deepEqual(r.result.builtin.blocking, EXPECTED[i][0], r.label);
    assert.deepEqual(r.result.builtin.other, EXPECTED[i][1], r.label);
  });
});

test("the official rules, when installed, give what the page says", { skip: rows[0].result.official === null && "slimdom/fontoxpath not installed" }, () => {
  rows.forEach((r, i) => {
    assert.deepEqual(r.result.official.blocking, EXPECTED[i][2], r.label);
    assert.deepEqual(r.result.official.other, EXPECTED[i][3], r.label);
  });
});

test("each table row on the page is the measured result", () => {
  rows.forEach((r, i) => {
    const builtin = BUILTIN_CELL[key([...EXPECTED[i][0], ...EXPECTED[i][1]])];
    const official = OFFICIAL_CELL[key([...EXPECTED[i][2], ...EXPECTED[i][3]])];
    assert.ok(builtin && official, `${r.label}: no page wording`);
    assert.ok(html.includes(`<tr><td>${r.label}</td><td>${official}</td><td>${builtin}</td></tr>`), r.label);
  });
  for (const f of ["br-de-17", "br-de-26"]) assert.ok(fs.existsSync(new URL(`./rules/de/${f}.html`, import.meta.url)), f);
});

test("the statutes and the Peppol note are quoted with their sources", () => {
  assert.match(html, /§ 14 Abs\. 2 Satz 5 UStG/);
  assert.match(html, /§ 14 Abs\. 4 Satz 1 Nr\. 10 UStG/);
  assert.match(html, /„spezifisch und eindeutig auf die Rechnung bezogen ist“, in derselben Form wie die Rechnung \(§ 31 Abs\. 5 UStDV\)/);
  assert.match(html, /gesetze-im-internet\.de\/ustg_1980\/__14\.html/);
  assert.match(html, /gesetze-im-internet\.de\/ustdv_1980\/__31\.html/);
  assert.match(html, /docs\.peppol\.eu\/poacc\/billing\/3\.0\/bis\//);
  assert.match(html, /398,50 Euro/);
});

test("FAQPage schema matches the visible questions and answers", () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text), q.name);
  }
});

test("no price claim, no validity claim, no script, and the paid service is described as not on sale", () => {
  assert.doesNotMatch(html, /[$€]\s?\d/);
  assert.doesNotMatch(html, /ist gültig|rechtssicher|garantiert/);
  assert.match(html, /Noch ist nichts zu kaufen/);
  assert.doesNotMatch(html, /<script(?! type="application\/ld\+json")/);
});

test("linked from the checker, the German pages, the sitemap and llms.txt", () => {
  for (const f of ["index.html", "e-rechnung-pruefen.html", "xrechnung-oder-zugferd.html", "germany-e-invoice-mandate.html", "sitemap.xml", "llms.txt"]) {
    assert.match(read(f), /gutschrift-e-rechnung\.html/, f);
  }
});
