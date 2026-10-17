import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readDir, parseSitemap, fetchSite, main } from "./cli.mjs";
import { SITE } from "./fixture.mjs";

const mk = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ilp-"));
  for (const p of SITE) { const u = new URL(p.url); const f = path.join(d, u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname + ".html"); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, p.html); }
  return d;
};

test("a build folder is read into URLs under --base and audited", async () => {
  const d = mk();
  const pages = readDir(d, "https://example.test");
  assert.equal(pages.length, 9);
  assert.ok(pages.some((p) => p.url === "https://example.test/blog/index.html"));
  const lines = []; const code = await main([d, "--base", "https://example.test", "--priority", "/blog/patient-payment-plans"], { log: (s) => lines.push(s), err: () => {} });
  assert.equal(code, 0); assert.match(lines.join("\n"), /patient-payment-plans/);
});

test("json output parses and a missing --base is a usage error", async () => {
  const d = mk(), out = [];
  assert.equal(await main([d, "--base", "https://example.test", "--json"], { log: (s) => out.push(s), err: () => {} }), 0);
  assert.equal(JSON.parse(out[0]).summary.pages, 9);
  assert.equal(await main([d], { log: () => {}, err: () => {} }), 2);
  assert.equal(await main([], { log: () => {}, err: () => {} }), 2);
});

test("sitemap index is followed, other hosts are skipped, failures are counted not fatal", async () => {
  const map = {
    "https://s.test/sitemap.xml": `<sitemapindex><sitemap><loc>https://s.test/p.xml</loc></sitemap></sitemapindex>`,
    "https://s.test/p.xml": `<urlset><url><loc>https://s.test/a</loc></url><url><loc>https://s.test/b</loc></url><url><loc>https://evil.test/c</loc></url><url><loc>https://s.test/gone</loc></url></urlset>`,
    "https://s.test/a": "<title>A</title>", "https://s.test/b": "<title>B</title>",
  };
  const seen = [];
  const fetchImpl = async (u) => { seen.push(u); return map[u] ? { ok: true, text: async () => map[u] } : { ok: false, status: 404 }; };
  const r = await fetchSite("https://s.test/sitemap.xml", { fetchImpl, delayMs: 0 });
  assert.deepEqual(r.pages.map((p) => p.url).sort(), ["https://s.test/a", "https://s.test/b"]);
  assert.equal(r.failed.length, 1); assert.ok(!seen.some((u) => u.includes("evil")));
  assert.deepEqual(parseSitemap("<loc>https://x/a?b=1&amp;c=2</loc>").urls, ["https://x/a?b=1&c=2"]);
});
