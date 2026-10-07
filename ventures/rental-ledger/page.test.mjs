import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("structured data parses and the FAQ in JSON-LD matches the visible FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 6);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("every static form control has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const ids = [...html.matchAll(/<(?:input|select|textarea) id="([A-Za-z-]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 12);
  for (const id of ids) {
    const wrapped = new RegExp(`<label[^>]*>[^<]*<input id="${id}"`).test(html);
    const labelled = new RegExp(`<label for="${id}"`).test(html) || new RegExp(`id="${id}"[^>]*aria-label=`).test(html);
    assert.ok(wrapped || labelled, id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("innerHTML is only ever given escaped values", () => {
  const html = page("index.html");
  const script = html.slice(html.indexOf('<script type="module">'), html.indexOf("</script>", html.indexOf('<script type="module">')));
  const stmts = script.split(/\.innerHTML\s*=/).slice(1).map((t) => t.slice(0, t.search(/;\n/)));
  assert.ok(stmts.length >= 6);
  const raw = stmts.flatMap((t) => [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim())).filter((x) => !/^esc\(/.test(x) && !/^(i > 0|head)/.test(x));
  // The only unescaped interpolations are fixed markup choices and counts, never user text.
  for (const r of raw) assert.match(r, /^(head \? |i > 0 \?|c\.target|r\.count|r\.problems\.length|r\.entries\.length|k$)/, r);
});

test("the entry types and Schedule E lines in the page come from calc.mjs", async () => {
  const { TYPES, EXPENSE_LINES } = await import("./calc.mjs");
  const html = page("index.html");
  assert.match(html, /Object\.entries\(TYPES\)/);
  assert.match(html, /Object\.entries\(EXPENSE_LINES\)/);
  assert.ok(Object.keys(TYPES).length === 5 && Object.keys(EXPENSE_LINES).length >= 14);
});

test("page states the storage caveat, the limits and the backup guard", () => {
  const html = page("index.html");
  assert.match(html, /Clearing site data|Do not use this as your only record/);
  assert.match(html, /are not modelled/);
  assert.match(html, /data-storage-guard/);
  assert.match(html, /id="storage-guard"/);
  assert.match(html, /rental-ledger-last-backup/);
});

test("footer links the siblings that exist", async () => {
  const { existsSync } = await import("node:fs");
  const html = page("index.html");
  for (const s of ["rental-property-schedule-e-categorizer", "rent-roll-delinquency-analyzer", "landlord-repair-or-replace-planner", "rental-dscr-calculator", "renewal-rent-optimizer"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
    assert.ok(existsSync(new URL(`../${s}/`, import.meta.url)), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the results print by themselves and events are local only", () => {
  const html = page("index.html");
  assert.match(html, /id="results-card"/);
  assert.match(html, /@media print/);
  for (const ev of ["entry_added", "csv_imported", "schedule_downloaded", "example_loaded"]) assert.match(html, new RegExp(`record\\("${ev}"\\)`));
});
