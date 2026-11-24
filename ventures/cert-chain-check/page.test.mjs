import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(here, f), "utf8");
const index = read("index.html");
const guide = read("certificate-chain-errors-explained.html");
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

test("the entry page is a working tool", () => {
  for (const id of ["pem", "files", "host", "at", "check", "load-example", "clear", "optout", "rows", "chain", "fixed", "copy-fixed", "download-fixed", "download-json"]) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /from "\.\/scan\.mjs"/);
  assert.match(index, /from "\.\/usage\.mjs"/);
});

test("disclaimers, privacy, sponsor link and not-affiliated line on both pages", () => {
  for (const page of [index, guide]) {
    assert.match(page, /No warranty/);
    assert.match(page, /no SLA/i);
    assert.match(page, /sponsors\/Duncan-Haywood/);
    assert.match(page, /not affiliated/i);
    assert.match(page, /cabforum\.org\/2025\/04\/11\/ballot-sc081v3/);
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

test("the page and engine make no network calls", () => {
  const js = [...index.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  assert.ok(js.length > 0);
  for (const src of [js, read("scan.mjs"), read("x509.mjs")]) assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|node:net|node:http|node:tls/);
});

test("FAQPage JSON-LD matches the visible questions and parses", () => {
  const blocks = [...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  const headings = [...index.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  assert.deepEqual(headings, faq.mainEntity.map((q) => q.name));
  JSON.parse(guide.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
});

test("index links the guide, guide links back, sitemap lists every page", () => {
  assert.match(index, /href="certificate-chain-errors-explained\.html"/);
  assert.match(guide, /href="\.\/"/);
  const sitemap = read("sitemap.xml");
  for (const n of readdirSync(here).filter((n) => n.endsWith(".html"))) assert.match(sitemap, new RegExp(n.replace(/\./g, "\\.")));
});

test("the guide explains every finding type", async () => {
  const { TYPES } = await import("./scan.mjs");
  for (const t of TYPES) assert.ok(guide.includes(`<code>${t}</code>`), `guide does not explain ${t}`);
});

test("the guide's worked example is the CLI's real output", () => {
  const blocks = [...guide.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => unescape(m[1]));
  const dir = mkdtempSync(path.join(tmpdir(), "cert-chain-check-"));
  writeFileSync(path.join(dir, "leaf.pem"), blocks[0] + "\n");
  const out = execFileSync(process.execPath, [path.join(here, "check.mjs"), "leaf.pem", "--host", "example.test", "--at", "2026-11-24T12:00:00Z"], { encoding: "utf8", cwd: dir });
  assert.equal(out.trim(), blocks[1].trim());
});

test("the page's example is the fixture certificates and finds what its status line says", async () => {
  const { scan } = await import("./scan.mjs");
  const ex = JSON.parse(index.match(/const EXAMPLE = ("[\s\S]*?");\n/)[1]);
  assert.equal(ex, read("fixtures/certs/int.pem") + read("fixtures/certs/leaf.pem") + read("fixtures/certs/int-ec.pem"));
  const r = await scan(ex, { host: "api.example.test", at: "2026-11-24T12:00:00Z" });
  const types = r.findings.map((f) => f.type);
  for (const t of ["wrong-order", "unrelated-certificate", "hostname-mismatch"]) assert.ok(types.includes(t), t);
  assert.deepEqual(r.chain, [2, 1]);
});

test("the parity counts on the pages are the recorded run's", () => {
  const rec = JSON.parse(read("fixtures/openssl.json"));
  const nc = Object.keys(rec.certs).length, nch = rec.chains.length;
  const hosts = rec.chains.reduce((a, c) => a + Object.keys(c.opensslHostMatch).length, 0);
  for (const page of [index, read("llms.txt"), read("README.md")]) {
    assert.ok(page.includes(`${nc} generated certificates`) || page.includes(`${nc}\n   certificates`) || page.includes(`${nc} certificates`), "certificate count");
    assert.ok(page.includes(`${nch} chains`) || page.includes(`${nch} generated chains`), "chain count");
  }
  assert.ok(read("README.md").includes(`${hosts} host and IP`), "host checks");
});

test("CLI: usage errors exit 1, risk exits 2 with --fail-on-risk, --fix prints PEM", () => {
  const run = (args) => { try { return { code: 0, out: execFileSync(process.execPath, [path.join(here, "check.mjs"), ...args], { encoding: "utf8", stdio: "pipe" }) }; } catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; } };
  assert.equal(run([]).code, 1);
  assert.equal(run(["--bogus", "x"]).code, 1);
  assert.equal(run([path.join(here, "nope.pem")]).code, 1);
  const leafOnly = path.join(here, "fixtures/chains/leaf-only.pem");
  assert.equal(run([leafOnly, "--at", "2026-11-24", "--fail-on-risk"]).code, 2);
  assert.equal(run([path.join(here, "fixtures/chains/good-rsa.pem"), "--at", "2026-11-24", "--fail-on-risk"]).code, 0);
  const j = JSON.parse(run([leafOnly, "--at", "2026-11-24", "--format", "json"]).out);
  assert.equal(j.verdict, "risky");
  const fixed = run([path.join(here, "fixtures/chains/wrong-order.pem"), "--fix", "--at", "2026-11-24"]).out;
  assert.equal(fixed, read("fixtures/certs/leaf.pem") + read("fixtures/certs/int.pem"));
});
