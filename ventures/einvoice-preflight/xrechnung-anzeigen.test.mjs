import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("xrechnung-anzeigen.html");

test("German page with the disclaimer, the licence line and a title that fits a result line", () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /Ohne Gewähr \(no warranty\)/);
  assert.match(html, /keine Rechts-, Steuer-, Finanz- oder Buchhaltungsberatung/);
  assert.match(html, /FSL-1\.1-MIT/);
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  assert.ok(title.length <= 60, title);
  const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
  assert.ok(desc.length <= 160, desc);
});

test("reads the file locally with the view module, counts use anonymously, and offers print and check", () => {
  assert.match(html, /from "\.\/einvoice-view\.mjs"/);
  assert.match(html, /import\("\.\/facturx\.mjs"\)/);
  assert.match(html, /recordUsage\(usageStorage\(\), optOut\.checked, "invoice_viewed"\)/);
  assert.match(html, /id="usageOptOut"/);
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /href="\.\/\?profil=xrechnung#drop"/);
  assert.doesNotMatch(html, /fetch\((?!"examples\/ubl-invoice\.xml")/, "no fetch other than the bundled example");
  assert.ok(fs.existsSync(new URL("./examples/ubl-invoice.xml", import.meta.url)));
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

test("names the official free alternative, makes no price or validity claim, and the paid service is not on sale", () => {
  assert.match(html, /e-rechnung\.elster\.de/);
  assert.doesNotMatch(html, /[$€]\s?\d/);
  assert.doesNotMatch(html, /ist gültig|rechtssicher|garantiert/);
  assert.match(html, /rechnet nichts nach/);
  assert.match(html, /Noch ist nichts zu kaufen/);
});

test("linked from the checker, the German pages, the English Germany page, the sitemap and llms.txt", () => {
  for (const f of ["index.html", "e-rechnung-pruefen.html", "xrechnung-oder-zugferd.html", "germany-e-invoice-mandate.html"]) {
    assert.match(read(f), /href="xrechnung-anzeigen\.html"/, f);
  }
  assert.match(read("sitemap.xml"), /<url>\s*<loc>[^<]*xrechnung-anzeigen\.html<\/loc>\s*<\/url>/);
  assert.match(read("llms.txt"), /xrechnung-anzeigen\.html/);
});
