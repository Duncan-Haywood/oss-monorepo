import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const html = read("e-invoicing-mandates-by-country.html");
const countryPages = fs.readdirSync(new URL("./", import.meta.url)).filter((f) => /-e-invoice-mandate\.html$/.test(f));

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free to use and source available/);
});

test("has one row per country page and links each of them", () => {
  assert.equal(countryPages.length, 93);
  for (const f of countryPages) assert.ok(html.includes(`<a href="${f}">`), f);
  assert.equal((html.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr>/g) || []).length, countryPages.length);
});

test("the hub is linked from the tool page and has its own sitemap entry", () => {
  assert.match(read("index.html"), /href="e-invoicing-mandates-by-country\.html"/);
  assert.match(read("sitemap.xml"), /<\/url>\s*<url>\s*<loc>[^<]*e-invoicing-mandates-by-country\.html<\/loc>\s*<\/url>/);
});

test("key dates agree with the country pages", () => {
  const pairs = [
    ["france-e-invoice-mandate.html", "1 Sep 2026"],
    ["belgium-e-invoice-mandate.html", "1 Jan 2026"],
    ["uae-e-invoice-mandate.html", "1 Jan 2027"],
    ["saudi-arabia-zatca-e-invoice-mandate.html", "1 Feb 2027"],
    ["bulgaria-e-invoice-mandate.html", "1 Jan 2028"],
  ];
  for (const [page, date] of pairs) {
    const [d, m, y] = date.split(" ");
    const month = { Jan: "January", Feb: "February", Sep: "September" }[m];
    assert.match(read(page), new RegExp(`${d} (${m}|${month}) ${y}`), page);
    assert.ok(html.includes(date), date);
  }
});

test("makes no price claim and canonical names this file", () => {
  assert.doesNotMatch(html, /\$\d/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/e-invoicing-mandates-by-country\.html">/);
});

test("FAQPage schema is valid JSON and matches visible h3 headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  for (const q of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text));
  }
});

test("every country count the page states matches the table (polish, 2026-11-27)", () => {
  // The lede said seventy-six and the meta and share descriptions 88 while the
  // table held 93 rows: each count was right when written, and none moved with it.
  const rows = (html.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr>/g) || []).length;
  const words = { 93: "Ninety-three" };
  const said = [...html.matchAll(/\b(\d+) countries\b/g)].map((m) => Number(m[1]));
  assert.ok(said.length >= 2, "the meta and share descriptions state a count");
  for (const n of said) assert.equal(n, rows, `"${n} countries" with ${rows} rows`);
  const lede = html.match(/<p class="lede">([A-Z][a-z]+(?:-[a-z]+)?) countries/);
  assert.ok(lede, "the lede opens with the count in words");
  assert.equal(lede[1], words[rows] ?? lede[1], `lede says ${lede[1]} with ${rows} rows`);
  assert.ok(words[rows], `add ${rows} in words to this test and the lede`);
});

test("the Key dates cell of every row is prose (label above on a phone); the short cells stay beside their labels", () => {
  assert.match(html, /<table class="stack">/);
  const rows = html.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr>[\s\S]*?<\/tr>/g);
  for (const r of rows) {
    const tds = r.match(/<td\b[^>]*>/g);
    assert.equal(tds[0], '<td class="prose">', r.slice(0, 120));
    assert.equal(tds.filter((t) => t.includes("prose")).length, 1, r.slice(0, 120));
  }
});
