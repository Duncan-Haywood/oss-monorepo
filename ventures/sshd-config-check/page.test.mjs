import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Remove every <script> element, case-insensitively and until nothing is left to strip.
const stripScripts = (s, sub = "") => { let p; do { p = s; s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, sub); } while (s !== p); return s; };
// Remove every tag, repeating until no tag-shaped text is left.
const stripTags = (s, sub = "") => { let p; do { p = s; s = s.replace(/<[^>]*>/g, sub); } while (s !== p); return s; };
// Escape every regular-expression metacharacter so the text matches literally.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const here = path.dirname(fileURLToPath(import.meta.url));
const index = readFileSync(path.join(here, "index.html"), "utf8");
const guide = readFileSync(path.join(here, "sshd-config-mistakes-explained.html"), "utf8");
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

test("the entry page is a working tool", () => {
  for (const id of ["check", "load-example", "add-file", "clear", "optout", "files", "rows", "notes", "login", "effective", "order", "conn-user", "conn-groups", "conn-addr", "conn-host"]) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /scan\.mjs/);
  assert.match(index, /usage\.mjs/);
});

test("disclaimers, privacy, sources and sponsor link are on both pages", () => {
  for (const page of [index, guide]) {
    assert.match(page, /No warranty/);
    assert.match(page, /no SLA/i);
    assert.match(page, /sponsors\/Duncan-Haywood/);
    assert.match(page, /openssh-portable\/blob\/V_9_6_P1\/sshd_config\.5/);
    assert.match(page, /not affiliated/i);
  }
  assert.match(index, /never uploaded/i);
  assert.match(index, /makes no network calls/i);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /not a security audit/);
  assert.match(guide, /servconf\.c/);
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
  assert.match(index, /href="sshd-config-mistakes-explained\.html"/);
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
  for (const t of emitted) assert.ok(TYPES.includes(t), t);
});

test("the guide's worked example is the CLI's real output", () => {
  const blocks = [...guide.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => unescape(m[1]));
  const dir = mkdtempSync(path.join(tmpdir(), "sshd-config-check-"));
  writeFileSync(path.join(dir, "sshd_config"), blocks[0] + "\n");
  const out = execFileSync(process.execPath, [path.join(here, "check.mjs"), "sshd_config"], { encoding: "utf8", cwd: dir });
  assert.equal(blocks[1].trim(), out.trim());
});

test("the page's worked example finds what its status line promises", async () => {
  const { scanFiles } = await import("./scan.mjs");
  const src = index.match(/const EXAMPLE = (\[[\s\S]*?\n {4}\]);/)[1];
  const example = Function(`return ${src}`)();
  const types = new Set(scanFiles(example).findings.map((f) => f.type));
  for (const t of ["setting-ignored", "dropin-not-read", "permit-root-login-yes", "password-auth-on", "weak-algorithm", "x11-forwarding-on", "looks-global-but-in-match"]) assert.ok(types.has(t), t);
  const status = index.match(/els\.status\.textContent = "Worked example: ([^"]+)"/)[1];
  for (const word of ["cloud-init", ".conf", "PermitRootLogin yes", "CBC", "X11", "ClientAliveInterval", "Match User deploy", "Match Address"]) assert.ok(status.includes(word), word);
});
