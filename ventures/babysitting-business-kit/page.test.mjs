import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "babysitting-taxes.html"];

test("every page carries the no-warranty clause and the sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal, tax, or financial advice/i, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,}/, p);
    assert.match(html, /<link rel="canonical" href="\.\//, p);
  }
});

test("the app states its privacy line and says who it is not affiliated with", () => {
  const html = page("index.html");
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /Not affiliated with Care\.com, Sittercity/);
  assert.match(html, /Turn usage counting off/);
});

test("JSON-LD parses, and every FAQ question is answered on the page", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name.replace(/'/g, "'")}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text), `answer on page: ${q.name}`);
  }
  for (const p of PAGES.slice(1)) for (const m of page(p).matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
});

test("every form control has a label", () => {
  const html = page("index.html");
  const labelled = new Set([...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/type="checkbox"/.test(attrs) || /aria-label=/.test(attrs)) continue;
    const id = /id="([^"]+)"/.exec(attrs);
    assert.ok(id && labelled.has(id[1]), `unlabelled control: ${m[0]}`);
  }
});

test("the page only talks to a server the sitter typed in", () => {
  const html = page("index.html");
  const fetches = [...html.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(fetches, ["`${url}/api/desk`"]);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
});

test("every tab button has a panel", () => {
  const html = page("index.html");
  const tabs = [...html.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
  const panels = [...html.matchAll(/data-panel="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, panels);
});
