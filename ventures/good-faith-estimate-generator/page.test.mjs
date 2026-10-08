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
});

test("every form control has a label or aria-label and nothing can send data anywhere", () => {
  const html = page("index.html");
  const ids = [...html.matchAll(/<(?:input|select|textarea)[^>]* id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 15);
  for (const id of ids) assert.match(html, new RegExp(`<label for="${id}"`), id);
  assert.match(html, /setAttribute\("aria-label", name\)/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the module scripts import only local files", () => {
  const html = page("index.html");
  const imports = [...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("every name the page imports from calc.mjs is exported", async () => {
  const html = page("index.html");
  const m = html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/);
  const calc = await import("./calc.mjs");
  for (const name of m[1].split(",").map((s) => s.trim())) assert.ok(name in calc, name);
});

test("user text is escaped before it reaches innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  assert.match(html, /textContent = renderText/);
});

test("page states what it does not decide", () => {
  const html = page("index.html");
  assert.match(html, /Not decided/);
  assert.match(html, /compare with the template CMS publishes/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const footer = html.slice(html.indexOf("<footer>"));
  const named = [...footer.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(named, [...new Set(recorded)].sort());
});
