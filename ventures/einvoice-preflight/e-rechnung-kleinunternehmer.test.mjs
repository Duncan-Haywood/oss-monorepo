// The German "E-Rechnung für Kleinunternehmer" page: every measured result on it is bound to
// kleinunternehmer-bench.mjs, so a change to the creator or the checker that moves a result
// fails here until the page is updated.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { MISTAKES, draft, mistakeTable } from "./kleinunternehmer-bench.mjs";
import { generateInvoice } from "./generate.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("e-rechnung-kleinunternehmer.html");
const rows = await mistakeTable();

test("German page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /Ohne Gewähr \(no warranty\)/);
  assert.match(html, /keine Rechts-, Steuer-, Finanz- oder Buchhaltungsberatung/);
  assert.match(html, /FSL-1\.1-MIT/);
});

test("the built-in check: what it catches and what it still misses", () => {
  const want = [[], [], ["INV-035"], ["INV-035"], [], [], ["XR-009"], ["INV-022"]];
  assert.equal(rows.length, MISTAKES.length);
  rows.forEach((r, i) => assert.deepEqual(r.xrechnung.builtin.blocking, want[i], r.label));
  // BR-CO-26 (row 1) and BR-Z-10 (row 5) pass the built-in rules: the page says so.
  assert.match(html, /Die eingebauten Prüfungen melden BR-CO-26 noch nicht/);
});

test("the official rules, when installed, give the ids the page shows", { skip: rows[0].xrechnung.official === null && "slimdom/fontoxpath not installed" }, () => {
  const xr = [[], ["BR-CO-26"], ["BR-E-10"], ["BR-S-05"], [], ["BR-Z-10"], ["BR-E-02", "BR-DE-16"], ["BR-CO-09"]];
  const zf = [[], ["BR-CO-26"], ["BR-E-10"], ["BR-S-05"], [], ["BR-Z-10"], ["BR-E-02"], ["BR-CO-09"]];
  rows.forEach((r, i) => {
    assert.deepEqual([...r.xrechnung.official.blocking].sort(), [...xr[i]].sort(), r.label);
    assert.deepEqual(r.zugferd.official.blocking, zf[i], r.label);
    assert.deepEqual(r.xrechnung.official.other, [], r.label);
  });
});

test("each row's label and rule ids are on the page, and every linked rule has a German page", () => {
  for (const [label] of MISTAKES) assert.ok(html.includes(`<tr><td>${label}</td>`), label);
  for (const id of ["BR-CO-26", "BR-E-10", "BR-S-05", "BR-Z-10", "BR-E-02", "BR-DE-16", "BR-CO-09"]) assert.ok(html.includes(id), id);
  for (const [, id] of html.matchAll(/href="rules\/de\/([a-z0-9-]+)\.html"/g)) {
    assert.ok(fs.existsSync(new URL(`./rules/de/${id}.html`, import.meta.url)), id);
  }
});

test("the creator asks for a seller identifier when a Kleinunternehmer gives only a tax number", () => {
  const d = draft();
  delete d.seller.company_id;
  const out = generateInvoice(d, { format: "cii", profile: "xrechnung" });
  assert.equal(out.ok, false);
  assert.ok(out.errors.some((e) => e.path === "seller.company_id" && /BR-CO-26/.test(e.message)));
  assert.equal(generateInvoice(draft(), { format: "cii", profile: "xrechnung" }).ok, true);
  assert.match(read("create.html"), /data-k="company_id"/);
});

test("states the legal points it relies on, with the sources", () => {
  for (const src of ["gesetze-im-internet.de/ustdv_1980/__34a.html", "gesetze-im-internet.de/ustg_1980/__19.html", "bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html"]) {
    assert.ok(html.includes(src), src);
  }
  assert.match(html, /25\.000 Euro/);
  assert.match(html, /100\.000 Euro/);
  assert.match(html, /§ 34a Satz 4 UStDV/);
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

test("linked from the checker, the German pages, the Germany guide, the sitemap and llms.txt", () => {
  for (const f of ["index.html", "e-rechnung-pruefen.html", "xrechnung-oder-zugferd.html", "germany-e-invoice-mandate.html", "sitemap.xml", "llms.txt"]) {
    assert.match(read(f), /e-rechnung-kleinunternehmer\.html/, f);
  }
});
