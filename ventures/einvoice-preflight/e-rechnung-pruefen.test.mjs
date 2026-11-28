import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("e-rechnung-pruefen.html");

test("German page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /Ohne Gewähr \(no warranty\)/);
  assert.match(html, /keine Rechts-, Steuer-, Finanz- oder Buchhaltungsberatung/);
  assert.match(html, /Free to use and source available/);
  assert.match(html, /FSL-1\.1-MIT/);
});

test("states the BMF dates and threshold the einvoice-site deadline file checked, with its sources", () => {
  for (const d of ["seit 1.1.2025", "bis 31.12.2026", "bis 31.12.2027", "ab 1.1.2028", "800.000 Euro"]) assert.ok(html.includes(d), d);
  assert.match(html, /bundesfinanzministerium\.de\/Content\/DE\/FAQ\/e-rechnung\.html/);
  assert.match(html, /MINIMUM und BASIC-WL/);
});

test("its links open the checker with the rules preset, and the checker honours them", () => {
  assert.match(html, /href="\.\/\?profil=xrechnung#drop"/);
  assert.match(html, /href="\.\/\?profil=en16931#drop"/);
  const index = read("index.html");
  assert.match(index, /q\.get\("profil"\)/);
  for (const id of ["xrechnung", "official"]) assert.match(index, new RegExp(`<input id="${id}" type="checkbox"`));
});

test("every rule it links has a German page", () => {
  const links = [...html.matchAll(/href="rules\/de\/([\w-]+)\.html"/g)].map((m) => m[1]);
  assert.ok(links.length >= 9);
  for (const s of links) assert.ok(fs.existsSync(new URL(`./rules/de/${s}.html`, import.meta.url)), s);
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

test("linked from the checker, the English Germany page, the sitemap and llms.txt", () => {
  assert.match(read("index.html"), /href="e-rechnung-pruefen\.html"/);
  assert.match(read("germany-e-invoice-mandate.html"), /href="e-rechnung-pruefen\.html"/);
  assert.match(read("sitemap.xml"), /e-rechnung-pruefen\.html/);
  assert.match(read("llms.txt"), /e-rechnung-pruefen\.html/);
});
