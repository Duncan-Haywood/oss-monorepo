import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { collect, renderPage, tidy } from "./build-br-fr-codes-page.mjs";

const html = fs.readFileSync(new URL("./br-fr-error-codes.html", import.meta.url), "utf8");

test("the committed page is what build-br-fr-codes-page.mjs writes (run it after a BR-FR rebuild or a translation change)", () => {
  assert.equal(html, renderPage());
});

test("lists every rule code once with an anchor, English beside the French", () => {
  const rows = collect();
  for (const code of new Set(rows.map((r) => r.code))) assert.ok(html.includes(`id="r-${code.replace(/[^\w-]+/g, "-")}"`), code);
  assert.ok(rows.length > 300);
  for (const r of rows) assert.notEqual(r.en, r.fr, `${r.code}: no English`);
  assert.match(html, /<td lang="fr">/);
});

test("tidies messages the way the checker's report does", () => {
  const src = fs.readFileSync(new URL("./plain-schematron.mjs", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("./build-br-fr-codes-page.mjs", import.meta.url), "utf8");
  const body = (s) => s.match(/const tidy = \(t\) => (.*);/)[1];
  assert.equal(body(src), body(page));
  assert.equal(tidy('[BR-FR-01/BT-1] : The id is too long. Current value : "". Check it.'), "The id is too long. Check it.");
  assert.equal(tidy("invoiceID : BR-FR-BD-02/BT-47 : When the framework"), "When the framework");
});

test("carries the disclaimer, says the translation is unofficial, makes no price claim", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Unofficial translation/);
  assert.doesNotMatch(html, /\$\d/);
});

test("FAQPage schema matches the visible questions", () => {
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of schema.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("linked from the tool page and the France page, in the sitemap and llms.txt", () => {
  for (const f of ["index.html", "france-e-invoice-mandate.html", "llms.txt"]) {
    assert.match(fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /br-fr-error-codes\.html/, f);
  }
  assert.match(fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /<loc>[^<]*br-fr-error-codes\.html<\/loc>/);
});

test("long allowed-code lists fold into <details>, codes still in the page; short lists stay inline", async () => {
  const { cell } = await import("./build-br-fr-codes-page.mjs");
  const long = `Not allowed: ${Array.from({ length: 12 }, (_, i) => `"C${i}"`).join(", ")}. Fix it.`;
  const out = cell(long, "en");
  assert.match(out, /<details class="codes"><summary>Show the 12 allowed codes<\/summary>/);
  assert.match(out, /<code>C11<\/code><\/details>Fix it\./);
  assert.match(cell(long, "fr"), /Afficher les 12 codes autorisés/);
  assert.equal(cell('Only "A", "B" & "C".', "en"), "Only &quot;A&quot;, &quot;B&quot; &amp; &quot;C&quot;.");
  assert.match(html, /Show the 51 allowed codes/);
  assert.match(html, /<code>IRR_NOM_F<\/code>/);
});
