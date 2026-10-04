import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, PHI note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, billing, coding, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Protected health information/);
  assert.match(html, /not a HIPAA compliance assessment/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "schedule", "payer", "tol"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files, so nothing is loaded from a network host", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page documents the model, its limits, and that the layout is read from memory", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /read by position from memory of the standard/);
  assert.match(html, /no real remittance was available/);
  assert.match(html, /Patient names and member IDs are never read into the page/);
});

test("page states it is independent of payers and clearinghouses", () => {
  const html = page("index.html");
  assert.match(html, /Not affiliated with any payer or clearinghouse/);
  assert.match(html, /not sponsored, endorsed or connected to any insurance carrier/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["era_analyzed", "example_loaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", async () => {
  const { existsSync } = await import("node:fs");
  for (const m of page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) {
    assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
  }
});

test("the 835 guide links to the tool, carries the disclaimers and names no patient data", () => {
  const guide = page("how-to-read-an-835-era-file.html");
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /No warranty/);
  assert.match(guide, /not legal, tax, billing, coding, compliance, or financial advice/);
  assert.match(guide, /not a HIPAA compliance assessment/);
  assert.match(guide, /No affiliation with, endorsement by, or sponsorship from any named company/);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, /<script type="application\/ld\+json">/);
  assert.doesNotMatch(guide, /fetch\(|<script[^>]+src=/);
  assert.match(page("index.html"), /href="\.\/how-to-read-an-835-era-file\.html"/);
  assert.match(page("sitemap.xml"), /how-to-read-an-835-era-file\.html/);
});
