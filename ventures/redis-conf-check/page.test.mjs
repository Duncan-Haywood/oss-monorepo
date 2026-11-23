import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const index = readFileSync(path.join(here, "index.html"), "utf8");
const guide = readFileSync(path.join(here, "redis-conf-mistakes-explained.html"), "utf8");
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

test("the entry page is a working tool", () => {
  for (const id of ["check", "load-example", "add-file", "clear", "optout", "files", "rows", "notes", "exposure", "order", "cwd", "addrs", "lookup", "lookup-out", "no-defrag"]) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /scan\.mjs/);
  assert.match(index, /usage\.mjs/);
});

test("disclaimers, privacy, sources and sponsor link are on both pages", () => {
  for (const page of [index, guide]) {
    assert.match(page, /No warranty/);
    assert.match(page, /no SLA/i);
    assert.match(page, /sponsors\/Duncan-Haywood/);
    assert.match(page, /redis\/redis\/blob\/7\.0\.15\/src\/config\.c/);
    assert.match(page, /not affiliated/i);
  }
  assert.match(index, /never uploaded/i);
  assert.match(index, /makes no network calls/i);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /not a security audit/);
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
  const engine = readFileSync(path.join(here, "scan.mjs"), "utf8");
  assert.doesNotMatch(engine, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|node:net|node:http/);
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
  assert.match(index, /href="redis-conf-mistakes-explained\.html"/);
  assert.match(guide, /href="\.\/"/);
  const sitemap = readFileSync(path.join(here, "sitemap.xml"), "utf8");
  for (const n of readdirSync(here).filter((n) => n.endsWith(".html"))) assert.match(sitemap, new RegExp(n.replace(/\./g, "\\.")));
});

test("the guide explains every finding type, and the engine emits only listed types", async () => {
  const { TYPES } = await import("./scan.mjs");
  for (const t of TYPES) assert.ok(guide.includes(`<code>${t}</code>`), `guide does not explain ${t}`);
  const src = readFileSync(path.join(here, "scan.mjs"), "utf8");
  const emitted = new Set([...src.matchAll(/type: "([a-z-]+)"/g), ...src.matchAll(/startupFail\("([a-z-]+)"/g), ...src.matchAll(/guardFinding\("[a-z-]+", "([a-z-]+)"/g), ...src.matchAll(/hint: "([a-z-]+)"/g)].map((m) => m[1]));
  for (const t of emitted) assert.ok(TYPES.includes(t), t);
});

test("the guide's worked example is the CLI's real output", () => {
  const blocks = [...guide.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => unescape(m[1]));
  const dir = mkdtempSync(path.join(tmpdir(), "redis-conf-check-"));
  writeFileSync(path.join(dir, "redis.conf"), blocks[0] + "\n");
  const out = execFileSync(process.execPath, [path.join(here, "check.mjs"), "redis.conf"], { encoding: "utf8", cwd: dir });
  assert.equal(blocks[1].trim(), out.trim());
});

test("the page's worked example finds what its status line promises", async () => {
  const { scanFiles } = await import("./scan.mjs");
  const src = index.match(/const EXAMPLE = (\[[\s\S]*?\n {4}\]);/)[1];
  const r = scanFiles(Function(`return ${src}`)());
  const types = new Set(r.findings.map((f) => f.type));
  for (const t of ["open-without-password", "default-user-nopass", "requirepass-replaced", "weak-password", "overridden-directive", "rename-command-used", "decimal-memory-unit"]) assert.ok(types.has(t), t);
  assert.equal(r.exposure.remote.outcome, "open");
  const status = index.match(/els\.status\.textContent = "Worked example: ([^"]+)"/)[1];
  for (const word of ["127.0.0.1", "0.0.0.0", "protected mode", "nopass", "8 characters", "CONFIG", "2,000,000,000"]) assert.ok(status.includes(word), word);
});

test("the parity numbers on the pages are the recorded run's", async () => {
  const rec = JSON.parse(readFileSync(path.join(here, "parity/redis-7.0.json"), "utf8"));
  for (const page of [index, guide, readFileSync(path.join(here, "README.md"), "utf8"), readFileSync(path.join(here, "llms.txt"), "utf8")]) {
    assert.ok(page.includes(`${rec.cases.length} generated files`), "case count");
  }
  const { compare } = await import("./parity/compare.mjs");
  const res = compare(rec);
  const readme = readFileSync(path.join(here, "README.md"), "utf8");
  const fmt = (n) => n.toLocaleString("en-US");
  assert.ok(readme.includes(`all ${fmt(res.values)} \`CONFIG GET\` values`), "values");
  assert.ok(readme.includes(`all ${fmt(res.probes)} client probes`), "probes");
  assert.ok(readme.includes(`${rec.cases.filter((c) => c.started).length} started`), "started");
});
