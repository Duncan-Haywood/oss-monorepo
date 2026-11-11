import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const index = readFileSync(path.join(here, "index.html"), "utf8");
const guide = readFileSync(path.join(here, "systemd-service-hardening-explained.html"), "utf8");

test("the entry page is a working tool", () => {
  for (const id of ["check", "load-example", "add-file", "user-units", "optout"]) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /<textarea/);
  assert.match(index, /classify\.mjs/);
  assert.match(index, /usage\.mjs/);
});

test("disclaimers, privacy and sponsor link are on both pages", () => {
  for (const page of [index, guide]) {
    assert.match(page, /No warranty/);
    assert.match(page, /no SLA/i);
    assert.match(page, /sponsors\/Duncan-Haywood/);
  }
  assert.match(index, /never uploaded/i);
  assert.match(index, /makes no network calls/i);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /not a security audit/);
  assert.match(index, /not <code>systemd-analyze security<\/code>/);
});

test("no unqualified safety claim", () => {
  for (const page of [index, guide]) {
    const prose = page.replace(/<script[\s\S]*?<\/script>/g, "");
    for (const m of prose.matchAll(/\b(?:is|are)\s+safe\b/gi)) {
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
  assert.match(index, /href="systemd-service-hardening-explained\.html"/);
  assert.match(guide, /href="\.\/"/);
  const sitemap = readFileSync(path.join(here, "sitemap.xml"), "utf8");
  for (const n of readdirSync(here).filter((n) => n.endsWith(".html"))) assert.match(sitemap, new RegExp(n.replace(/\./g, "\\.")));
});

test("every setting the scanner flags is explained in the guide", async () => {
  for (const s of ["NoNewPrivileges=", "ProtectSystem=strict", "ProtectHome=", "PrivateTmp=", "PrivateDevices=",
    "ProtectKernelTunables=", "SystemCallFilter=", "RestrictAddressFamilies=", "ReadWritePaths=/", "UMask=",
    "AmbientCapabilities=", "Environment=", "DynamicUser=yes", "curl"]) {
    assert.ok(guide.includes(s), `guide does not explain ${s}`);
  }
});

test("the guide's worked drop-in is the CLI's real output", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "suhc-"));
  const unit = path.join(dir, "ledger-api.service");
  writeFileSync(unit, "[Service]\nExecStart=/usr/local/bin/ledger-api --port 8080\nRestart=always\n");
  const out = execFileSync("python3", [path.join(here, "check.py"), unit, "--drop-in"], { encoding: "utf8" });
  const dropIn = out.slice(out.indexOf("# Starter"));
  const block = [...guide.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)][1][1]
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  assert.equal(block.trim(), dropIn.trim());
});
