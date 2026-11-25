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
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
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

// Closest sibling: the family's side when the sitter is a household employee.
test("index links one hop to the nanny-tax-calculator sibling", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/nanny-tax-calculator\/"/);
  assert.match(html, /nanny tax calculator/i);
});

// Tab modules that load on the tab's first open (perf, 2026-11-23): each one is
// imported nowhere statically, its tab and container exist, and the mount it
// calls is a real export of the module it loads.
test("tab-only modules load on demand and mount what they export", () => {
  const html = page("index.html");
  const block = html.slice(html.indexOf("const LAZY_TABS = {"), html.indexOf("function openLazyTab"));
  const rows = [...block.matchAll(/^\s+(\w+): \{ box: "(\w+)", load: \(\) => import\("\.\/([\w-]+\.mjs)"\), mount: \(m\) => \{(.*)\} \},$/gm)];
  assert.equal(rows.length, 9);
  for (const [, tab, box, file, body] of rows) {
    assert.match(html, new RegExp(`data-tab="${tab}"`), tab);
    const panel = html.slice(html.indexOf(`data-panel="${tab}"`), html.indexOf("</section>", html.indexOf(`data-panel="${tab}"`)));
    assert.match(panel, new RegExp(`id="${box}"`), `${box} sits in the ${tab} panel`);
    assert.doesNotMatch(html, new RegExp(`from "\\./${file}"`), `${file} is not imported statically`);
    const src = page(file);
    for (const [, name] of body.matchAll(/m\.(\w+)\(/g)) assert.match(src, new RegExp(`export function ${name}\\b`), `${file} exports ${name}`);
  }
  assert.match(html, /if \(tab === "website"\) renderSite\(\);\n\s+openLazyTab\(tab\);/);
});
