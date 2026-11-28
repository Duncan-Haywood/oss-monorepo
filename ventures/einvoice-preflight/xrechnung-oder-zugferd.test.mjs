// The German "XRechnung oder ZUGFeRD?" page: every measured figure on it is bound to
// xrechnung-zugferd-bench.mjs, so a change to the creator or the checker that moves a
// result fails here until the page is updated.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { OMISSIONS, fileSizes, omissionTable } from "./xrechnung-zugferd-bench.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("xrechnung-oder-zugferd.html");
const rows = await omissionTable();

test("German page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /Ohne Gewähr \(no warranty\)/);
  assert.match(html, /keine Rechts-, Steuer-, Finanz- oder Buchhaltungsberatung/);
  assert.match(html, /FSL-1\.1-MIT/);
});

test("the built-in check: every omission but the delivery date fails only the XRechnung", () => {
  const want = [[], ["XR-001"], ["XR-004"], ["XR-004"], ["XR-003"], ["XR-006"], []];
  assert.equal(rows.length, OMISSIONS.length);
  rows.forEach((r, i) => {
    assert.deepEqual(r.xrechnung.builtin.blocking, want[i], r.label);
    assert.deepEqual(r.zugferd.builtin.blocking, [], r.label);
    assert.deepEqual(r.zugferd.builtin.other, [], r.label);
  });
  assert.match(html, /XR-001, -003, -004, -006/);
});

test("the official rules, when installed, give the BR-DE ids the page links", { skip: rows[0].xrechnung.official === null && "slimdom/fontoxpath not installed" }, () => {
  const want = [[], ["BR-DE-15"], ["BR-DE-2"], ["BR-DE-6"], ["BR-DE-1"], ["BR-DE-8"], []];
  rows.forEach((r, i) => {
    assert.deepEqual(r.xrechnung.official.blocking, want[i], r.label);
    assert.deepEqual(r.zugferd.official.blocking, [], r.label);
  });
  assert.deepEqual(rows[3].xrechnung.official.other, ["BR-DE-27 (warning)"]);
  assert.deepEqual(rows[6].xrechnung.official.other, ["BR-DE-TMP-32 (information)"]);
});

test("each row's label and rule ids are on the page, and every linked rule has a German page", () => {
  for (const [label] of OMISSIONS.slice(1)) assert.ok(html.includes(`<td>${label}</td>`), label);
  for (const id of ["br-de-15", "br-de-2", "br-de-6", "br-de-1", "br-de-8", "br-de-tmp-32"]) {
    assert.match(html, new RegExp(`href="rules/de/${id}\\.html"`));
    assert.ok(fs.existsSync(new URL(`./rules/de/${id}.html`, import.meta.url)), id);
  }
});

test("file sizes on the page match the creator's output, in whole KB", () => {
  for (const f of fileSizes()) {
    assert.ok(html.includes(`<tr><td>${f.file}</td><td>${Math.round(f.bytes / 1024)} KB</td></tr>`), `${f.file} ${f.bytes}`);
  }
});

test("states the BMF points it relies on, with the source", () => {
  assert.match(html, /bundesfinanzministerium\.de\/Content\/DE\/FAQ\/e-rechnung\.html/);
  assert.match(html, /MINIMUM und BASIC-WL/);
  assert.match(html, /XML maßgebend/);
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

test("linked from the checker, both Germany pages, the sitemap and llms.txt", () => {
  for (const f of ["index.html", "e-rechnung-pruefen.html", "germany-e-invoice-mandate.html", "sitemap.xml", "llms.txt"]) {
    assert.match(read(f), /xrechnung-oder-zugferd\.html/, f);
  }
});
