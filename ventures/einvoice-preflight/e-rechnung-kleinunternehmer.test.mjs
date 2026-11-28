// The German "E-Rechnung für Kleinunternehmer" page: every measured row on it is bound to
// kleinunternehmer-bench.mjs, so a change to the creator or the checker that moves a result
// fails here until the page is updated.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { VARIANTS, creatorRefusal, variantTable } from "./kleinunternehmer-bench.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("e-rechnung-kleinunternehmer.html");
const rows = await variantTable();

test("German page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /Ohne Gewähr \(no warranty\)/);
  assert.match(html, /keine Rechts-, Steuer-, Finanz- oder Buchhaltungsberatung/);
  assert.match(html, /FSL-1\.1-MIT/);
});

test("the built-in check finds the missing reason and, as XRechnung, the missing tax number", () => {
  const xr = [[], [], ["INV-035"], ["XR-009"], [], ["INV-035"], [], ["INV-022"], []];
  const zf = [[], [], ["INV-035"], [], [], ["INV-035"], [], ["INV-022"], []];
  assert.equal(rows.length, VARIANTS.length);
  rows.forEach((r, i) => {
    assert.deepEqual(r.xrechnung.builtin.blocking, xr[i], r.label);
    assert.deepEqual(r.zugferd.builtin.blocking, zf[i], r.label);
  });
  assert.match(html, /\(INV-035\)/);
  assert.match(html, /\(XR-009\)/);
  assert.match(html, /\(INV-022\)/);
});

test("the official rules, when installed, give the ids the page names", { skip: rows[0].xrechnung.official === null && "slimdom/fontoxpath not installed" }, () => {
  const xr = [[], ["BR-CO-26"], ["BR-E-10"], ["BR-E-02", "BR-DE-16"], ["BR-DE-14"], ["BR-S-05"], ["BR-Z-10"], ["BR-CO-09"], []];
  const zf = [[], ["BR-CO-26"], ["BR-E-10"], ["BR-E-02"], [], ["BR-S-05"], ["BR-Z-10"], ["BR-CO-09"], []];
  rows.forEach((r, i) => {
    assert.deepEqual([...r.xrechnung.official.blocking].sort(), [...xr[i]].sort(), r.label);
    assert.deepEqual(r.zugferd.official.blocking, zf[i], r.label);
  });
});

test("each row's label is on the page and every linked rule has a German page", () => {
  for (const [label] of VARIANTS) assert.ok(html.includes(`<td>${label}</td>`), label);
  for (const id of ["br-co-26", "br-e-10", "br-de-16", "br-de-14", "br-z-10", "br-co-09"]) {
    assert.match(html, new RegExp(`href="rules/de/${id}\\.html"`));
    assert.ok(fs.existsSync(new URL(`./rules/de/${id}.html`, import.meta.url)), id);
  }
});

test("the creator refuses a seller with only a Steuernummer, as the page says", () => {
  const out = creatorRefusal();
  assert.equal(out.ok, false);
  assert.ok(out.errors.some((e) => e.path === "seller.company_id" && /BR-CO-26/.test(e.message)));
  assert.match(html, /verlangt er dann eine Verkäuferkennung/);
});

test("states the legal points with their sources", () => {
  assert.match(html, /gesetze-im-internet\.de\/ustdv_1980\/__34a\.html/);
  assert.match(html, /gesetze-im-internet\.de\/ustdv_1980\/__33\.html/);
  assert.match(html, /gesetze-im-internet\.de\/ustg_1980\/__19\.html/);
  assert.match(html, /bundesfinanzministerium\.de\/Content\/DE\/FAQ\/e-rechnung\.html/);
  assert.match(html, /25\.000 Euro/);
  assert.match(html, /100\.000 Euro/);
  assert.match(html, /1\. Januar 2025/);
});

test("FAQPage schema matches the visible questions and answers", () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text), q.name);
  }
});

test("no price claim, no validity claim, and the paid service is described as not on sale", () => {
  assert.doesNotMatch(html, /[$€]\s?\d/);
  assert.doesNotMatch(html, /ist gültig|rechtssicher|garantiert/);
  assert.match(html, /Noch ist nichts zu kaufen/);
});

test("linked from the checker, the German pages, the sitemap and llms.txt", () => {
  for (const f of ["index.html", "e-rechnung-pruefen.html", "xrechnung-oder-zugferd.html", "germany-e-invoice-mandate.html", "sitemap.xml", "llms.txt"]) {
    assert.match(read(f), /e-rechnung-kleinunternehmer\.html/, f);
  }
});
