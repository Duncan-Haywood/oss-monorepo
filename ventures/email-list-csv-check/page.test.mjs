import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, independence note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /does not verify that any email address is deliverable/);
  assert.match(html, /does not establish that anyone consented/);
  assert.match(html, /CAN-SPAM, GDPR, CASL/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Not affiliated with Mailchimp, HubSpot, Klaviyo, Brevo or Constant Contact/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "platform", "fixtypos"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("page states what is read from memory and what is not checked", () => {
  const html = page("index.html");
  assert.match(html, /Not checked/);
  assert.match(html, /read from memory of each platform's public import help/);
  assert.match(html, /no import was tried/);
  assert.match(html, /no mail server is contacted/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["file_checked", "example_loaded", "fixes_applied", "rejected_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 3);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("every platform listed on the page is one the code knows", async () => {
  const { PLATFORMS } = await import("./calc.mjs");
  const html = page("index.html");
  for (const [id, p] of Object.entries(PLATFORMS)) {
    assert.ok(html.includes(`value="${id}"`), id);
    assert.ok(html.includes(p.name), p.name);
  }
});

test("related venture pages link back to this tool", () => {
  for (const slug of ["email-auth-check", "substack-subscriber-export-analyzer"]) {
    assert.match(readFileSync(new URL(`../${slug}/index.html`, import.meta.url), "utf8"), /href="\.\.\/email-list-csv-check\/"/, slug);
  }
});
