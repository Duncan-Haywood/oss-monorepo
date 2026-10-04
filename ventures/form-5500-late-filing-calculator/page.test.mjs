import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, figures warning and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, retirement-plan, ERISA, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /verify them against current DOL and IRS guidance/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and nothing can send data anywhere", () => {
  const html = page("index.html");
  for (const id of ["pye", "ptype", "assets", "participants", "filing", "years", "ext", "c-dfvc-day", "c-dol-day", "c-one"]) {
    assert.match(html, new RegExp(`<label for="${id}">`));
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("editable constants on the page match the calculator's defaults", async () => {
  const { DEFAULTS } = await import("./calc.mjs");
  const html = page("index.html");
  const val = (id) => Number(new RegExp(`id="${id}" value="(\\d+)"`).exec(html)[1]);
  assert.equal(val("c-dfvc-day"), DEFAULTS.dfvcPerDay);
  assert.equal(val("c-small-report"), DEFAULTS.dfvcCaps.small.perReport);
  assert.equal(val("c-small-plan"), DEFAULTS.dfvcCaps.small.perPlan);
  assert.equal(val("c-large-report"), DEFAULTS.dfvcCaps.large.perReport);
  assert.equal(val("c-large-plan"), DEFAULTS.dfvcCaps.large.perPlan);
  assert.equal(val("c-irs-day"), DEFAULTS.irsPerDay);
  assert.equal(val("c-irs-max"), DEFAULTS.irsMaxPerReturn);
  assert.equal(val("c-dol-day"), DEFAULTS.dolMaxPerDay);
  assert.equal(val("c-one"), DEFAULTS.onePlanAssetThreshold);
});

test("page states the figures are ceilings from memory and that it is independent of the agencies", () => {
  const html = page("index.html");
  assert.match(html, /from memory of the published programme and statute figures/);
  assert.match(html, /not predictions/);
  assert.match(html, /inflation-adjusted/);
  assert.match(html, /Not affiliated with the IRS, the DOL or any plan provider/);
});

test("robots and sitemap let crawlers find both pages", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("sitemap.xml"), /when-is-form-5500-due\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["plan_calculated", "example_loaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  for (const m of page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) {
    assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
  }
});

test("the due-date guide links to the tool, carries the disclaimers and makes no network calls", () => {
  const guide = page("when-is-form-5500-due.html");
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /No warranty/);
  assert.match(guide, /not legal, tax, retirement-plan, ERISA, compliance, or financial advice/);
  assert.match(guide, /No affiliation with, endorsement by, or sponsorship from any named agency/);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, /<script type="application\/ld\+json">/);
  assert.doesNotMatch(guide, /fetch\(|<script[^>]+src=/);
  assert.match(page("index.html"), /href="\.\/when-is-form-5500-due\.html"/);
});

test("the guide's due-date table agrees with the calculator", async () => {
  const { dueDate } = await import("./calc.mjs");
  assert.equal(dueDate("2024-12-31").normalRaw.slice(5), "07-31");
  assert.equal(dueDate("2024-12-31", { extended: true }).raw.slice(5), "10-15");
  assert.equal(dueDate("2025-06-30").normalRaw.slice(5), "01-31");
  assert.equal(dueDate("2025-06-30", { extended: true }).raw.slice(5), "04-15");
  assert.equal(dueDate("2025-09-30").normalRaw.slice(5), "04-30");
  assert.equal(dueDate("2025-09-30", { extended: true }).raw.slice(5), "07-15");
});
