import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "cvss-3-0-vs-3-1-score-differences.html"];
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal, security or professional advice/, p);
    assert.match(html, /Not affiliated with or endorsed by FIRST/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD parses, each FAQ matches the visible copy, and there are no ratings", () => {
  for (const p of PAGES) {
    const html = page(p);
    const faq = ld(html).find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, p);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${esc(q.name)}</h3>`), q.name);
      assert.ok(html.includes(`<p>${esc(q.acceptedAnswer.text)}</p>`), q.name);
    }
    assert.ok(!/AggregateRating|"Review"/.test(html), p);
  }
  assert.equal(ld(page("index.html"))[0].offers.price, "0");
});

test("SEO basics on every page", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${escapeRegExp(p)}">`), p);
    assert.match(html, /<meta property="og:title"/, p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(page("sitemap.xml"), new RegExp(p === "index.html" ? "cvss-vector-check/<" : escapeRegExp(p)));
  }
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(inputs.length, 3);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "cvss.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  assert.doesNotMatch(page("cvss.mjs"), /^\s*import\s|import\(|Date\.now|Math\.random/m);
});

test("the inline script imports only exported names and every element it uses exists", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./cvss.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/cvss\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./cvss.mjs");
  for (const n of names) assert.ok(n in engine, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  for (const m of html.matchAll(/for \(const id of \[([^\]]+)\]\)/g)) for (const id of m[1].match(/"([\w-]+)"/g)) assert.ok(ids.has(id.replace(/"/g, "")), id);
});

test("usage events are documented where they are recorded", () => {
  const html = page("index.html");
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.ok(recorded.length >= 5);
  for (const e of new Set(recorded)) assert.ok(html.includes(`<code>${e}</code>`), e);
});

test("the guide's published numbers match the engine on the cases it names", async () => {
  const { explain } = await import("./cvss.mjs");
  const v = "CVSS:3.1/AV:P/AC:L/PR:H/UI:R/S:C/C:H/I:H/A:N/RC:U/CR:H/IR:M/AR:H/MAV:L/MAC:H/MUI:N/MS:C/MA:H";
  assert.ok(page("cvss-3-0-vs-3-1-score-differences.html").includes(v));
  const x = explain(v);
  assert.equal(x.scores.environmental, 7);
  assert.equal(x.otherVersion.environmental, 6.9);
});

test("the footer links its sibling npm-audit-triage", () => {
  assert.ok(page("index.html").includes('href="../npm-audit-triage/"'));
});
