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
  assert.match(html, /FAQPage/);
});

test("inputs have labels and nothing can send the figures anywhere", () => {
  const html = page("index.html");
  for (const id of ["lanes", "hoursweekday", "hoursweekend", "peakshare", "peakutil", "offutil", "peakprice", "offprice", "leaguepct", "leaguediscount", "feespct", "bowlersperhour", "fbspend", "fbcogspct", "arcadeperhour", "arcademarginpct", "perhourcost", "partiesweek", "partyprice", "partycostpct", "staffhours", "wage", "burdenpct", "rentmonthly", "utilitiesmonthly", "insuranceyear", "marketingmonthly", "managermonthly", "othermonthly", "lanecost", "fitout", "barkitchen", "launch", "depositmonths", "contingencypct", "startpct", "rampmonths", "ltcpct", "loanrate", "termyears", "targetmargin"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page says what it does not decide and that every figure is yours", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /break-even lane-hours/i);
  assert.match(html, /Ramp-up/);
  assert.match(html, /planning and zoning, building and fire code/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "summary_downloaded", "csv_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("every input id the script reads exists on the page", () => {
  const html = page("index.html");
  const map = html.match(/const map = \{([^}]*)\}/)[1];
  for (const [, id] of map.matchAll(/(\w+): "/g)) assert.match(html, new RegExp(`id="${id}"`));
});
