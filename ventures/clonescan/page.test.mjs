// The page's promises, checked against the file: disclaimer, privacy, no
// third-party requests, and that every asset it loads ships beside it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("no-warranty and no-SLA clauses are on the page", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not affiliated with or endorsed by/);
});

test("the page loads nothing from another origin", () => {
  for (const m of html.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    const url = m[1];
    assert.ok(!/^(https?:)?\/\//.test(url), `third-party asset: ${url}`);
  }
  const script = html.slice(html.indexOf('<script type="module">'));
  assert.doesNotMatch(script, /https?:\/\//, "the module script must not name a remote URL");
});

test("every module and wasm file the page loads exists", () => {
  for (const m of html.matchAll(/from "\.\/([^"]+)"|new URL\("\.\/([^"]+)"/g)) {
    const rel = m[1] || m[2];
    assert.ok(existsSync(new URL(`./${rel}`, import.meta.url)), rel);
  }
});

test("usage events named in the footer are the ones the script records", () => {
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]).sort();
  const named = [...html.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]).filter((n) => recorded.includes(n)).sort();
  assert.deepEqual([...new Set(named)], [...new Set(recorded)]);
  assert.match(html, /id="optout"/);
});

test("measured numbers on the page match BENCHMARK.md", () => {
  const bench = readFileSync(new URL("./BENCHMARK.md", import.meta.url), "utf8");
  for (const n of ["40.1 s", "927 MB", "0.14 s", "58 MB", "31.9%", "32.7%", "93.5%", "94.6%", "1,054"]) {
    assert.ok(html.includes(n), `page lacks ${n}`);
    assert.ok(bench.includes(n), `BENCHMARK.md lacks ${n}`);
  }
});

test("llms.txt and sitemap exist", () => {
  assert.ok(existsSync(new URL("./llms.txt", import.meta.url)));
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /index\.html/);
});

// Closest sibling: the same question at the dependency level.
test("index links one hop to the npm-lockfile-duplicates-check sibling", () => {
  assert.match(html, /href="\.\.\/npm-lockfile-duplicates-check\/"/);
});
