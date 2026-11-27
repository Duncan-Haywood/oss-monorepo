import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /Not affiliated with the American Institute of Architects/);
});

test("inputs have labels and nothing can send the schedule anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "ret", "sret", "reduce-at", "reduced", "reduce-mode", "prev", "project", "appno", "period", "contractor", "owner"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(page("sheet.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/);
  assert.doesNotMatch(page("workbook.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  const dynamic = [...html.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(dynamic.sort(), ["./sheet.mjs", "./workbook.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

// docs/history/pay-application-page-perf-2026-11-25.md: the .xlsx reader and writer load on first use.
test("the .xlsx reader and writer load on demand, and every call to them goes through the loaded module", () => {
  const html = page("index.html");
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  for (const fn of ["readXlsx", "pickSheet", "findSchedule", "retainageChecks"]) {
    assert.match(page("sheet.mjs"), new RegExp(`export (async )?function ${fn}\\b`));
    for (const m of script.matchAll(new RegExp(`(.{6})\\b${fn}\\(`, "g"))) assert.equal(m[1], "sheet.", `${fn} is called without sheet.`);
  }
  assert.match(page("workbook.mjs"), /export function workbookXlsx\b/);
  for (const m of script.matchAll(/(.{2})\bworkbookXlsx\(/g)) assert.equal(m[1], "w.", "workbookXlsx is called without the loaded module");
  // run() asks for sheet.mjs before the header search, and the caller loads it and runs again
  assert.match(script, /if \(!sheet\) return null;[^\n]*\n\s*const found = sheet\.findSchedule/);
  assert.match(script, /if \(ok === null\) \{\s*try \{ await loadSheet\(\); \}/);
  // a failed fetch clears the memo so the next press retries
  assert.match(script, /p \?\?= load\(\)\.catch\(\(err\) => \{ p = null; throw err; \}\)/);
});

test("page says what it does not decide and does not pose as the AIA form", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /not the AIA G702\/G703 form/);
  assert.match(html, /FAQPage/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

// pay-app-guides (2026-11-24) is the free front door for the pay-app billing
// bet; this is its inbound sibling link (platform/pages/siblings-budget.json).
test("index links one hop to the pay-app-guides sibling", () => {
  assert.match(page("index.html"), /href="\.\.\/pay-app-guides\/"/);
});

test("next-month carry-forward is on the page and the suite pitch says PayApps is open, free on one job, paid plans not on sale", () => {
  const html = page("index.html");
  assert.match(html, /id="next-start"/);
  assert.match(html, /id="next-dl"/);
  assert.match(html, /next_period_started/);
  for (const [file, from] of [["index.html", "pay-application-generator"], ["pay-application-template.html", "pay-application-generator%2Ftemplate"]]) {
    const suite = /<section class="card" id="suite">([\s\S]*?)<\/section>/.exec(page(file))[1];
    assert.match(suite, /open now/, file);
    assert.match(suite, /free on one active job, with no card/, file);
    // The Free plan has no lien waivers, QuickBooks or job costing (ventures/payapps/apps/payapps/src/shared/plans.ts).
    assert.match(suite, /Lien waivers, QuickBooks and job costing are in the paid plans, which are not on sale yet/, file);
    assert.doesNotMatch(suite, /\$\s?\d/, `${file}: no price until checkout is live`);
    assert.doesNotMatch(suite, /in development|early access/i, `${file}: stale pre-launch copy`);
    assert.ok(suite.includes(`href="https://payapps.marisstella.app/?signup&amp;from=${from}"`), `${file}: tracked sign-up link`);
    // The product's own page in the catalogue (ventures/payapps/site/, built by payapps-site).
    assert.ok(suite.includes('href="../payapps/"'), `${file}: link to the PayApps home page`);
    assert.doesNotMatch(suite, /feedback\/\?type=idea/);
  }
});

test("an Excel workbook can be chosen and the import is explained on the page", () => {
  const html = page("index.html");
  assert.match(html, /accept="\.xlsx,\.xlsm,\.csv/);
  assert.match(html, /id="import-notes"/);
  assert.match(html, /workbook_imported/);
  assert.match(html, /Can I use the Excel continuation sheet I already have\?/);
  assert.match(html, /"name": "Can I use the Excel continuation sheet I already have\?"/);
});

test("the Excel template section is on the page, tracked, and says it is not the AIA form", () => {
  const html = page("index.html");
  const sec = /<section class="card" id="template">([\s\S]*?)<\/section>/.exec(html)[1];
  assert.match(sec, /id="dl-template"/);
  assert.match(sec, /not the AIA G702\/G703 form/);
  assert.match(html, /id="dl-xlsx"/);
  for (const ev of ["workbook_downloaded", "template_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${ev}"\\)`));
    assert.match(html, new RegExp(`<code>${ev}</code>`));
  }
});

test("the template's own page is linked, honest about the AIA, sends nothing and quotes no price", () => {
  assert.match(page("index.html"), /href="pay-application-template\.html"/);
  const t = page("pay-application-template.html");
  assert.match(t, /<title>Pay Application Template \(Excel\)<\/title>/);
  assert.match(t, /not the AIA G702\/G703 form/);
  assert.match(t, /Not affiliated with the American Institute of Architects/);
  assert.match(t, /No warranty/);
  assert.match(t, /FAQPage/);
  assert.match(t, /href="\.\.\/pay-app-guides\/"/);
  assert.doesNotMatch(t, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(t, /<script[^>]+src=["']https?:/);
  assert.deepEqual([...t.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./usage.mjs", "./workbook.mjs"]);
  const suite = /<section class="card" id="suite">([\s\S]*?)<\/section>/.exec(t)[1];
  assert.match(suite, /not on sale yet/);
  assert.doesNotMatch(suite, /\$\s?\d/);
  assert.match(page("sitemap.xml"), /pay-application-template\.html/);
});
