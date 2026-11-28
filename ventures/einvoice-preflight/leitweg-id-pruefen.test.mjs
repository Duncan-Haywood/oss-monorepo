// The German "Leitweg-ID prüfen" page: every measured figure on it is bound to
// leitweg-id-bench.mjs, so a change to the creator or the checker that moves a result
// fails here until the page is updated.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { GOOD, MISTAKES, mistakeTable, typoCounts } from "./leitweg-id-bench.mjs";
import { leitwegCheckDigitsValid } from "./profile.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("leitweg-id-pruefen.html");
const rows = await mistakeTable();

const BUILTIN_CELL = {
  "": "keine Meldung",
  "XR-001": "Fehler XR-001",
  "XR-002": "Fehler XR-002 (Prüfziffer)",
  "XR-012 (warning)": "Warnung XR-012 (Schreibweise)",
};

test("German page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /Ohne Gewähr \(no warranty\)/);
  assert.match(html, /keine Rechts-, Steuer-, Finanz- oder Buchhaltungsberatung/);
  assert.match(html, /FSL-1\.1-MIT/);
});

test("the built-in checks: XR-002 on typos, XR-012 on the three form slips, XR-001 when it is gone", () => {
  const want = [[], ["XR-002"], ["XR-002"], [], [], [], [], [], [], ["XR-001"], []];
  const warn = [[], [], [], [], [], ["XR-012 (warning)"], ["XR-012 (warning)"], ["XR-012 (warning)"], [], [], []];
  assert.equal(rows.length, MISTAKES.length);
  rows.forEach((r, i) => {
    assert.deepEqual(r.result.builtin.blocking, want[i], r.label);
    assert.deepEqual(r.result.builtin.other, warn[i], r.label);
  });
});

test("the official rules, when installed, flag only the missing buyer reference", { skip: rows[0].result.official === null && "slimdom/fontoxpath not installed" }, () => {
  rows.forEach((r, i) => {
    assert.deepEqual(r.result.official.blocking, i === 9 ? ["BR-DE-15"] : [], r.label);
    assert.deepEqual(r.result.official.other, [], r.label);
  });
});

test("each table row on the page is the bench's result", () => {
  for (const r of rows) {
    const b = [...r.result.builtin.blocking, ...r.result.builtin.other].join(", ");
    const cell = BUILTIN_CELL[b];
    assert.ok(cell, `${r.label}: no page wording for ${b}`);
    const official = r.result.builtin.blocking.includes("XR-001") ? 'abgewiesen: <a href="rules/de/br-de-15.html">BR-DE-15</a>' : "keine Meldung";
    assert.ok(html.includes(`<tr><td>${r.label}</td><td>${official}</td><td>${cell}</td></tr>`), r.label);
  }
  assert.ok(fs.existsSync(new URL("./rules/de/br-de-15.html", import.meta.url)));
});

test("the typo counts on the page are the bench's", () => {
  const t = typoCounts();
  assert.deepEqual(t, { substitutions: 135, substitutionsPassing: 0, swaps: 9, swapsPassing: 0 });
  assert.match(html, /Von den 135 Möglichkeiten/);
  assert.match(html, /den 9 Vertauschungen/);
  assert.ok(html.includes(`<code>${GOOD}</code>`));
});

test("the specification's worked example is right, and the page quotes its steps", () => {
  assert.equal(leitwegCheckDigitsValid("04011000-1234512345-06"), true);
  assert.equal(BigInt("04011000123451234500") % 97n, 92n);
  assert.equal(BigInt("04011000123451234506") % 97n, 1n);
  assert.match(html, /04011000123451234500 mod 97 = 92, also 98 − 92 = <strong>06<\/strong>/);
  assert.match(html, /Leitweg-ID-Formatspezifikation-v2-0-2-1\.pdf/);
  assert.match(html, /ICD-Wert 0204/);
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

test("the in-page check imports the checker's own functions and counts only an event name", () => {
  assert.match(html, /import \{ leitwegCheckDigitsValid, leitwegFormIssue, looksLikeLeitwegId \} from "\.\/profile\.mjs"/);
  assert.match(html, /recordUsage\(usageStorage\(\), false, "leitweg_id_checked"\)/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("linked from the checker, the German pages, the sitemap and llms.txt", () => {
  for (const f of ["index.html", "e-rechnung-pruefen.html", "xrechnung-oder-zugferd.html", "germany-e-invoice-mandate.html", "sitemap.xml", "llms.txt"]) {
    assert.match(read(f), /leitweg-id-pruefen\.html/, f);
  }
});
