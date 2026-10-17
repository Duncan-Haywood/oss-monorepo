import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { NOT_CHECKED, PERSON_PROPS, ORG_PROPS, DEAL_PROPS } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, independence note and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, accounting, compliance, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Not affiliated with Pipedrive/);
  assert.match(html, /Pipedrive is a trademark of its owner, used here only to say which file format the tool reads/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("inputs have labels and neither page nor parser can send the file anywhere", () => {
  const html = page("index.html");
  for (const id of ["file", "paste", "kind"]) assert.match(html, new RegExp(`<label for="${id}">`));
  const pattern = /fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\s*\(|navigator\.serviceWorker/;
  assert.doesNotMatch(html, pattern);
  for (const f of ["calc.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), pattern, f);
  assert.doesNotMatch(page("calc.mjs"), /^import /m);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/);
});

test("page states what is read from memory and lists everything the code says it does not check", () => {
  const html = page("index.html");
  assert.match(html, /<h3>Not checked<\/h3>/);
  assert.match(html, /read from memory of Pipedrive's public import help pages/);
  assert.match(html, /no Pipedrive account or import was available/);
  assert.ok(NOT_CHECKED.some((n) => /owner/i.test(n)));
  for (const n of NOT_CHECKED) assert.ok(html.includes(n), n);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["file_checked", "example_loaded", "fixes_applied"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("related-tool links point at ventures that exist", () => {
  const links = [...page("index.html").matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)];
  assert.ok(links.length >= 3);
  for (const m of links) assert.ok(existsSync(new URL(`../${m[1]}/VENTURE.yaml`, import.meta.url)), m[1]);
});

test("the deal statuses on the page are the ones the code checks", async () => {
  const { DEAL_STATUS } = await import("./calc.mjs");
  const html = page("index.html");
  for (const v of DEAL_STATUS) assert.ok(html.includes(v), v);
});

test("field tables have unique keys and the key fields", () => {
  for (const t of [PERSON_PROPS, ORG_PROPS, DEAL_PROPS]) {
    assert.equal(new Set(t.map((p) => p[1])).size, t.length);
    assert.ok(t.some((p) => p[1] === "owner" || p[1] === "label"));
  }
  assert.ok(PERSON_PROPS.some((p) => p[1] === "email"));
  assert.ok(ORG_PROPS.some((p) => p[1] === "name"));
  assert.ok(DEAL_PROPS.some((p) => p[1] === "status"));
});

test("the FAQ in the structured data is on the page too", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 5);
  for (const q of faq.mainEntity) assert.ok(html.includes(q.name.replace(/&/g, "&amp;")), q.name);
});
