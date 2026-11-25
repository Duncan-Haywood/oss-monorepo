import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripScripts = (s) => { let p; do { p = s; s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ""); } while (s !== p); return s; };
const stripTags = (s) => { let p; do { p = s; s = s.replace(/<[^>]+>/g, ""); } while (s !== p); return s; };
const here = path.dirname(fileURLToPath(import.meta.url));
const index = readFileSync(path.join(here, "index.html"), "utf8");
const guide = readFileSync(path.join(here, "pg-hba-conf-mistakes-explained.html"), "utf8");
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

test("the entry page is a working tool", () => {
  for (const id of ["check", "load-example", "add-file", "clear", "optout", "files", "rows", "notes", "probes", "connection", "order", "ssl-off", "conn-user", "conn-db", "conn-groups", "conn-addr", "conn-tls", "conn-repl"]) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /scan\.mjs/);
  assert.match(index, /usage\.mjs/);
});

test("disclaimers, privacy, sources and sponsor link are on both pages", () => {
  for (const page of [index, guide]) {
    assert.match(page, /No warranty/);
    assert.match(page, /no SLA/i);
    assert.match(page, /sponsors\/Duncan-Haywood/);
    assert.match(page, /postgres\/blob\/REL_16_STABLE\/src\/backend\/libpq\/hba\.c/);
    assert.match(page, /docs\/16\/auth-pg-hba-conf\.html/);
    assert.match(page, /not affiliated/i);
  }
  assert.match(index, /never uploaded/i);
  assert.match(index, /makes no network calls/i);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /not a security audit/);
  assert.match(guide, /pg_hba_file_rules/);
});

test("no unqualified safety claim", () => {
  for (const page of [index, guide]) {
    const prose = stripScripts(page);
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
  const headings = [...stripScripts(index).matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => stripTags(m[1]).trim());
  assert.deepEqual(headings, names);
  JSON.parse(guide.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
});

test("index links the guide, guide links back, sitemap lists every page", () => {
  assert.match(index, /href="pg-hba-conf-mistakes-explained\.html"/);
  assert.match(guide, /href="\.\/"/);
  const sitemap = readFileSync(path.join(here, "sitemap.xml"), "utf8");
  for (const n of readdirSync(here).filter((n) => n.endsWith(".html"))) assert.match(sitemap, new RegExp(escapeRegExp(n)));
});

test("the guide explains every finding type", async () => {
  const { TYPES } = await import("./scan.mjs");
  for (const t of TYPES) assert.ok(guide.includes(`<code>${t}</code>`), `guide does not explain ${t}`);
});

test("every type the engine can emit is in TYPES", async () => {
  const { TYPES } = await import("./scan.mjs");
  const src = readFileSync(path.join(here, "scan.mjs"), "utf8");
  const emitted = new Set([...src.matchAll(/type: "([a-z-]+)"/g), ...src.matchAll(/add\([^,]+, "([a-z-]+)"/g)].map((m) => m[1]));
  for (const t of emitted) if (!["local", "host"].includes(t)) assert.ok(TYPES.includes(t), t);
});

test("the guide's worked example is the CLI's real output", () => {
  const blocks = [...guide.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => unescape(m[1]));
  const dir = mkdtempSync(path.join(tmpdir(), "pg-hba-check-"));
  writeFileSync(path.join(dir, "pg_hba.conf"), blocks[0] + "\n");
  const out = execFileSync(process.execPath, [path.join(here, "check.mjs"), "pg_hba.conf"], { encoding: "utf8", cwd: dir });
  assert.equal(blocks[1].trim(), out.trim());
});

test("the page's worked example finds what its status line promises", async () => {
  const { scanFiles } = await import("./scan.mjs");
  const src = index.match(/const EXAMPLE = (\[[\s\S]*?\n {4}\]);/)[1];
  const example = Function(`return ${src}`)();
  const types = new Set(scanFiles(example).findings.map((f) => f.type));
  for (const t of ["trust-local", "trust-loopback", "md5-method", "shadowed-rule", "unanchored-regex", "cleartext-password-no-tls", "host-bits-set", "ipv4-shorthand", "include-dir-file-ignored"]) assert.ok(types.has(t), t);
  const status = index.match(/els\.status\.textContent = "Worked example: ([^"]+)"/)[1];
  for (const word of ["trust", "127.0.0.1", "md5", "never fires", "/analyst", "host bits", "8.0.0.7", "conf.d", ".bak"]) assert.ok(status.includes(word), word);
});

test("the parity numbers on the pages are the recorded run's", () => {
  const rec = JSON.parse(readFileSync(path.join(here, "parity/pg-16.json"), "utf8"));
  const conns = rec.match.reduce((n, c) => n + c.results.length, 0);
  const fmt = (n) => n.toLocaleString("en-US");
  for (const page of [index, guide, readFileSync(path.join(here, "README.md"), "utf8"), readFileSync(path.join(here, "llms.txt"), "utf8")]) {
    assert.ok(page.includes(`${rec.parse.length} generated files`), "parse count");
    assert.ok(page.includes(fmt(conns)), "connection count");
  }
  assert.match(rec.server, /^PostgreSQL 16\.15/);
});
