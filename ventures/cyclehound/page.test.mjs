// The page's promises, checked against the file: disclaimer, privacy, no
// third-party requests, every asset it loads ships beside it, and the
// measured numbers it quotes are the ones in BENCHMARK.md.
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
    assert.ok(!/^(https?:)?\/\//.test(m[1]), `third-party asset: ${m[1]}`);
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
  for (const n of ["11,422", "9,417", "14.1 to 17.8 s", "327 to 363 MB", "51.8 s", "2,272 MB", "0.19 to 0.26 s", "17 to 20 MB", "8.0.0", "16.10.4"]) {
    assert.ok(html.includes(n), `page lacks ${n}`);
    assert.ok(bench.includes(n), `BENCHMARK.md lacks ${n}`);
  }
});

test("llms.txt and sitemap exist", () => {
  assert.ok(existsSync(new URL("./llms.txt", import.meta.url)));
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /index\.html/);
});

test("index links one hop to the dupehound sibling", () => {
  assert.match(html, /href="\.\.\/dupehound\/"/);
});
