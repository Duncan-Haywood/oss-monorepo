import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGES = ["index", "cmmc-level-1-self-assessment", "sprs-score-calculator", "nist-800-171-ssp-template", "dfars-7012-incident-reporting", "stock-size-from-step-file", "job-shop-quote-calculator", "rfq-review", "cmmc-level-1-vs-level-2", "ssp-and-poam", "how-to-price-a-machined-part", "quote-vs-actual"];
const read = (p) => readFileSync(new URL(`./${p}.html`, import.meta.url), "utf8");

for (const p of PAGES) {
  test(`${p}: disclaimer, no-SLA, non-affiliation, CTA and usage tracking`, () => {
    const html = read(p);
    assert.match(html, /<title>[^<]{10,}<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{50,}"/);
    assert.match(html, /No warranty\./);
    assert.match(html, /Best-effort hosting, no SLA\./);
    assert.match(html, /Not affiliated with or endorsed by the Department of Defense/);
    assert.match(html, /In development — early access/);
    assert.match(html, /https:\/\/marisstella\.app\/industries\/manufacturing\//);
    assert.match(html, /recordUsage\(/);
    assert.match(html, /id="usage-toggle"/);
  });

  test(`${p}: makes no certification or endorsement claim`, () => {
    const text = read(p).replace(/<[^>]+>/g, " ");
    for (const bad of [/\bCMMC[- ]certified\b/i, /\bget certified\b/i, /\bDoD[- ]approved\b(?! medium assurance certificate)/i, /\bendorsed by the DoD\b(?![^.]*Not affiliated)/i, /\bguarantee(d|s)? (compliance|a score|certification)\b/i]) {
      assert.doesNotMatch(text, bad, `${p} matches ${bad}`);
    }
  });
}

test("the quote calculator ships no rates: every money field starts empty", () => {
  const html = read("job-shop-quote-calculator");
  for (const name of ["materialPerPart", "scrapPct", "setupHours", "setupRate", "programHours", "programRate", "cycleMinutes", "machineRate", "markupPct", "setupFactor", "cycleFactor"]) {
    const m = html.match(new RegExp(`<input name="${name}"[^>]*>`));
    assert.ok(m, name);
    assert.doesNotMatch(m[0], /value=/, `${name} has a default value`);
  }
});

test("pricing guide contains no dollar figures", () => {
  let text = read("how-to-price-a-machined-part");
  let prev;
  do { prev = text; text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ""); } while (text !== prev);
  assert.doesNotMatch(text, /\$\s?\d/);
});

test("CMMC guide carries a dated status check", () => {
  const html = read("cmmc-level-1-vs-level-2");
  assert.match(html, /Status check, 24 November 2026/);
  assert.match(html, /suspended by the Department of War on 13 July 2026/);
});

test("the stock page ships no material price and keeps the file in the browser", () => {
  const html = read("stock-size-from-step-file");
  for (const name of ["price", "roughWidth", "roughDepth", "roughFeed", "finishStepover", "finishFeed", "allowancePct", "loadMinutes"]) {
    const m = html.match(new RegExp(`<input name="${name}"[^>]*>`));
    assert.ok(m, name);
    assert.doesNotMatch(m[0], /value=/, `${name} has a default value`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/, "the page must not transmit the file");
  assert.match(html, /never uploaded/);
});

test("quote-vs-actual page ships no benchmark: no dollar or hour figure outside the invented example", () => {
  let text = read("quote-vs-actual");
  let prev;
  do { prev = text; text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ""); } while (text !== prev);
  assert.doesNotMatch(text, /\$\s?\d/);
  assert.match(text, /Load an invented example/);
  assert.match(text, /href="job-shop-quote-calculator.html"/);
});

test("incident page builds the DOM from text, never innerHTML, and keeps nothing by default", () => {
  const html = read("dfars-7012-incident-reporting");
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /id="keep-draft"(?![^>]*checked)/);
  assert.match(html, /https:\/\/dibnet\.dod\.mil/);
  assert.match(html, /within 72 hours of discovery of any cyber incident/);
});

test("customer quote section: built from text, keeps nothing by default, never keeps customer details", () => {
  const html = read("job-shop-quote-calculator");
  assert.match(html, /id="cq"/);
  assert.match(html, /id="keep-cq"(?![^>]*checked)/);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /import \{ META_FIELDS, reviewQuote, quoteToHtml, quoteToText \} from "\.\/quote-doc\.mjs"/);
  const kept = html.match(/const shopOnly = Object\.fromEntries\(\[([^\]]+)\]/);
  assert.ok(kept, "shop-only key list");
  for (const k of ["customer", "rfqRef", "partNumber", "quoteNumber"]) assert.doesNotMatch(kept[1], new RegExp(`"${k}"`));
});

test("RFQ review page keeps pasted text out of storage and renders findings as text", () => {
  const html = read("rfq-review");
  assert.doesNotMatch(html, /localStorage|setItem\(/);
  assert.doesNotMatch(html, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /recordUsage\("rfq-review"\)/);
});

test("quote calculator accepts quantity breaks handed over from the RFQ review", () => {
  assert.match(read("job-shop-quote-calculator"), /get\("breaks"\)/);
  assert.match(read("rfq-review"), /job-shop-quote-calculator\.html\?breaks=/);
});
