import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const index = readFileSync(path.join(here, "index.html"), "utf8");
const guide = readFileSync(path.join(here, "nginx-misconfigurations-explained.html"), "utf8");
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

test("the entry page is a working tool", () => {
  for (const id of ["check", "load-example", "add-file", "clear", "optout", "files", "rows", "notes"]) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /scan\.mjs/);
  assert.match(index, /usage\.mjs/);
});

test("disclaimers, privacy, credit and sponsor link are on both pages", () => {
  for (const page of [index, guide]) {
    assert.match(page, /No warranty/);
    assert.match(page, /no SLA/i);
    assert.match(page, /sponsors\/Duncan-Haywood/);
    assert.match(page, /github\.com\/yandex\/gixy/);
  }
  assert.match(index, /never uploaded/i);
  assert.match(index, /makes no network calls/i);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /not a security audit/);
  assert.match(index, /not affiliated/);
  assert.match(guide, /Not affiliated/);
});

test("no unqualified safety claim", () => {
  for (const page of [index, guide]) {
    const prose = page.replace(/<script[\s\S]*?<\/script>/g, "");
    for (const m of prose.matchAll(/\b(?:is|are)\s+(?:safe|secure)\b/gi)) {
      const before = prose.slice(Math.max(0, m.index - 60), m.index);
      const after = prose.slice(m.index + m[0].length).trimStart();
      assert.ok(/\b(?:never|not|no)\b/i.test(before) || after.startsWith("?"), `claim near ${before}${m[0]}`);
    }
  }
});

test("the page script makes no network calls", () => {
  const js = [...index.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  assert.ok(js.length > 0);
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
});

test("FAQPage JSON-LD matches the visible questions and parses", () => {
  const blocks = [...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  const names = faq.mainEntity.map((q) => q.name);
  const headings = [...index.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  assert.deepEqual(headings, names);
  JSON.parse(guide.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
});

test("index links the guide, guide links back, sitemap lists every page", () => {
  assert.match(index, /href="nginx-misconfigurations-explained\.html"/);
  assert.match(guide, /href="\.\/"/);
  const sitemap = readFileSync(path.join(here, "sitemap.xml"), "utf8");
  for (const n of readdirSync(here).filter((n) => n.endsWith(".html"))) assert.match(sitemap, new RegExp(n.replace(/\./g, "\\.")));
});

test("the guide explains every finding type", async () => {
  const { TYPES } = await import("./scan.mjs");
  for (const t of TYPES) assert.ok(guide.includes(t), `guide does not explain ${t}`);
});

test("the guide's worked example is the CLI's real output", () => {
  const blocks = [...guide.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => unescape(m[1]));
  const dir = mkdtempSync(path.join(tmpdir(), "ncsc-"));
  writeFileSync(path.join(dir, "shop.conf"), blocks[0] + "\n");
  const out = execFileSync("node", [path.join(here, "check.mjs"), "shop.conf"], { encoding: "utf8", cwd: dir });
  assert.equal(blocks[1].trim(), out.trim());
});

test("the page's worked example finds what its status line promises", async () => {
  const { scanFiles } = await import("./scan.mjs");
  const src = index.match(/const EXAMPLE = (\[[\s\S]*?\n {4}\]);/)[1];
  const example = Function(`return ${src}`)();
  const types = new Set(scanFiles(example).findings.map((f) => f.type));
  for (const t of ["alias-path-traversal", "cors-reflects-any-origin", "ssrf-upstream-from-request", "crlf-injection-uri",
    "status-page-public", "add-header-drops-inherited", "ssl-protocol-deprecated", "server-tokens-on"]) assert.ok(types.has(t), t);
});
