import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import { MISTAKES, mistakeTable } from "./belgium-peppol-bench.mjs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("peppol-factuur-controleren.html");
// Strip tags until nothing changes, so no tag-shaped text can survive a single pass (CodeQL alert #1524).
const plain = (s) => {
  let prev;
  do {
    prev = s;
    s = s.replace(/<[^>]+>/g, "");
  } while (s !== prev);
  return s;
};

test("plain() strips tags, doubled brackets included", () => {
  assert.equal(plain("<td>a</td><td>b</td>"), "ab");
  assert.equal(plain("x<<b>y</b>"), "xy");
  assert.doesNotMatch(plain(html), /<[a-z\/][^>]*>/i);
});

test("Dutch page with the disclaimer and the licence line", () => {
  assert.match(html, /<html lang="nl">/);
  assert.match(html, /Zonder garantie \(no warranty\)/);
  assert.match(html, /geen juridisch, fiscaal, financieel of boekhoudkundig advies/);
  assert.match(html, /Free to use and source available/);
  assert.match(html, /FSL-1\.1-MIT/);
  assert.match(html, /zonder nalezing door een moedertaalspreker/);
  assert.ok("Peppol-factuur controleren: gratis en zonder upload".length <= 70);
});

// The table rows, in page order, with what the bench must print for them. The bench draws the
// same mistakes in the same order; "built-in" never runs without the official columns here,
// because slimdom and fontoxpath may be missing in CI (then only the built-in column is bound).
const ROWS = [
  ["geen fout", [], [], []],
  ["BE ervoor", ["INV-041"], ["PEPPOL-COMMON-R043"], ["PEPPOL-COMMON-R043"]],
  ["puntjes", ["INV-041"], ["PEPPOL-COMMON-R043"], ["PEPPOL-COMMON-R043"]],
  ["voorloopnul", ["INV-041"], ["PEPPOL-COMMON-R043"], ["PEPPOL-COMMON-R043"]],
  ["tikfout in het ondernemingsnummer", ["INV-041"], ["PEPPOL-COMMON-R043"], ["PEPPOL-COMMON-R043"]],
  ["ander ondernemingsnummer", [], [], []],
  ["btw-nummer", ["INV-023"], [], ["PEPPOL-COMMON-R062 (warning)"]],
  ["geen referentie", ["PP-005"], ["PEPPOL-EN16931-R003"], ["PEPPOL-EN16931-R003"]],
  ["IBAN", ["INV-025"], [], []],
];

const hasOfficial = (() => {
  try {
    const req = createRequire(import.meta.url);
    req.resolve("slimdom");
    req.resolve("fontoxpath");
    return true;
  } catch {
    return false;
  }
})();

test("the bench measures what the page's table says", { timeout: 120_000 }, async () => {
  assert.equal(MISTAKES.length, ROWS.length);
  const rows = await mistakeTable();
  for (const [i, [key, builtin, official, next]] of ROWS.entries()) {
    const r = rows[i];
    assert.ok(r.label.includes(key), `${r.label} ~ ${key}`);
    assert.equal(r.refused, undefined, r.label);
    assert.deepEqual(r.builtin.blocking, builtin, `${r.label} built-in`);
    assert.deepEqual(r.builtin.other, [], `${r.label} built-in informational`);
    if (!hasOfficial) continue;
    const fmt = (c) => [...c.blocking, ...c.other];
    assert.deepEqual(fmt(r.official), official, `${r.label} 3.0.22`);
    assert.deepEqual(fmt(r.next), next, `${r.label} 3.1.0`);
  }
});

test("the page's table cells say the same", () => {
  const body = html.split("Gemeten: welke fouten")[1].split("</table>")[0];
  const trs = [...body.matchAll(/<tr><td>(.*?)<\/tr>/g)].map((m) => plain(m[1]));
  assert.equal(trs.length, ROWS.length);
  // Page order differs from the bench (the wrong-but-valid sender is last on the page).
  const pageOrder = [0, 1, 2, 3, 4, 6, 7, 8, 5];
  for (const [p, b] of pageOrder.entries()) {
    const [, builtin, official, next] = ROWS[b];
    const cell = trs[p];
    for (const id of [...builtin, ...official, ...next]) assert.ok(cell.includes(id.replace(" (warning)", "")), `${cell}: ${id}`);
    if (!builtin.length && !official.length && !next.length) assert.equal(cell.match(/geen melding/g).length, 3, cell);
  }
  assert.match(html, /PEPPOL-COMMON-R062, waarschuwing/);
});

const DEADLINES = new URL("../einvoice-pro/apps/einvoice-site/content/deadlines.mjs", import.meta.url);

// einvoice-preflight-ci checks out this venture alone (sparse), so the cross-check runs where the
// whole tree is present: locally and in ventures-tests.
test("the Belgian dates and rules are the deadline file's own Dutch sentences, with its sources", { skip: !fs.existsSync(DEADLINES) && "einvoice-site not in this checkout" }, async () => {
  const { COUNTRIES, SOURCES } = await import(DEADLINES.href);
  const countries = Array.isArray(COUNTRIES) ? COUNTRIES : Object.values(COUNTRIES);
  const be = countries.find((c) => c.key === "be");
  assert.ok(be, "Belgium in deadlines.mjs");
  for (const d of be.deadlines) assert.ok(html.includes(d.text.nl), `deadline ${d.date}`);
  for (const r of be.rules.filter((x) => x.source === "beVatMeasures" || x.source === "beWho")) assert.ok(html.includes(r.text.nl), r.source);
  for (const key of ["beWho", "beTolerance", "beToleranceEnd", "beVatMeasures"]) {
    assert.ok(html.includes(`href="${SOURCES[key].url}"`), key);
    assert.equal(SOURCES[key].checked, "2026-11-27", key);
  }
  assert.match(html, /Op 27 november 2026 met die teksten vergeleken/);
});

test("its links open the checker with the Peppol rules preset, and the checker honours them", () => {
  assert.match(html, /href="\.\/\?profil=peppol#drop"/);
  assert.match(html, /href="\.\/\?profil=en16931#drop"/);
  const index = read("index.html");
  assert.match(index, /q\.get\("profil"\)/);
  assert.match(index, /peppol: 1/);
  for (const id of ["peppol", "official", "peppolNext"]) assert.match(index, new RegExp(`<input id="${id}" type="checkbox"`));
});

test("every rule it links has a Dutch page", () => {
  const links = [...html.matchAll(/href="rules\/nl\/([\w-]+)\.html"/g)].map((m) => m[1]);
  assert.ok(links.length >= 9);
  for (const s of links) assert.ok(fs.existsSync(new URL(`./rules/nl/${s}.html`, import.meta.url)), s);
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
  assert.doesNotMatch(plain(html.split("</head>")[1]), /is geldig|gegarandeerd|100 ?%/);
  assert.match(html, /Er is nog niets te koop/);
});

test("linked from the checker, the English Belgium page, the sitemap and llms.txt", () => {
  assert.match(read("index.html"), /href="peppol-factuur-controleren\.html"/);
  assert.match(read("belgium-e-invoice-mandate.html"), /href="peppol-factuur-controleren\.html"/);
  assert.match(read("sitemap.xml"), /<\/url>\s*<url>\s*<loc>[^<]*peppol-factuur-controleren\.html<\/loc>\s*<\/url>/);
  assert.match(read("llms.txt"), /peppol-factuur-controleren\.html/);
});
