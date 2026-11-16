// The page's promises, checked against the file: disclaimer, privacy, no
// third-party requests, every asset it loads ships beside it, and the
// measured numbers it quotes are the ones in BENCHMARK.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { load } from "./web/csshound.mjs";

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
  for (const n of ["3,915", "99,479", "8,101,928", "0.50 to 0.52 s", "18 to 21 MB", "8,815", "644,192", "8.0%", "13,412"]) {
    assert.ok(html.includes(n), `page lacks ${n}`);
    assert.ok(bench.includes(n), `BENCHMARK.md lacks ${n}`);
  }
});

test("the example finds what the page says it should", async () => {
  const src = html.slice(html.indexOf('$("css").value = ['), html.indexOf('].join("\\n");') + 1);
  const lines = Function(`return ${src.slice(src.indexOf("["))}`)();
  const cs = await load(readFileSync(new URL("./web/csshound.wasm", import.meta.url)));
  const r = cs.analyze(lines.join("\n"), "", { html: true });
  assert.deepEqual(r.rejected, [".card .ribbon", ".current", ".modal", ".modal-backdrop", ".no-print"]);
  assert.equal(r.dead_rules, 2); // .modal list and .no-print; .tier-* kept by the prefix
});

test("llms.txt and sitemap exist", () => {
  assert.ok(existsSync(new URL("./llms.txt", import.meta.url)));
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /index\.html/);
});

test("index links one hop to its Rust siblings", () => {
  assert.match(html, /href="\.\.\/cyclehound\/"/);
  assert.match(html, /href="\.\.\/dupehound\/"/);
});
