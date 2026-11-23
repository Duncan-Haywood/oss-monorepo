import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "why-license-mit-license-breaks-your-build.html";
const PAGES = ["index.html", GUIDE];
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("every page carries the no-warranty clause and the independence line", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal or professional advice/, p);
    assert.match(html, /Not affiliated with or endorsed by the Python Software Foundation/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD parses and each FAQ answer is on the page word for word", () => {
  for (const p of PAGES) {
    const html = page(p);
    const faq = ld(html).find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, p);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${esc(q.name)}</h3>`), q.name);
      assert.ok(html.includes(`<p>${esc(q.acceptedAnswer.text)}</p>`), q.name);
    }
    assert.ok(!/AggregateRating|"Review"/.test(html));
  }
  assert.equal(ld(page("index.html"))[0].offers.price, "0");
});

test("SEO basics", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,70}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${p.replace(/\./g, "\\.")}">`), p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(page("sitemap.xml"), new RegExp(p === "index.html" ? "pyproject-metadata-check/<" : p.replace(/\./g, "\\.")));
  }
});

test("inputs are labelled, nothing is sent anywhere, the script wires real elements", async () => {
  const html = page("index.html");
  for (const tag of [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0])) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), tag);
  }
  for (const f of [...PAGES, "engine.mjs", "toml.mjs", "pep.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const engine = await import("./engine.mjs");
  for (const n of html.match(/import \{([^}]+)\} from "\.\/engine\.mjs"/)[1].split(",").map((s) => s.trim())) assert.ok(n in engine, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of src.matchAll(/\$\("#([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
});

test("usage events are documented where they are recorded", () => {
  const html = page("index.html");
  for (const e of ["pyproject_checked", "example_loaded", "high_found", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("numbers on the pages match the evidence files", () => {
  const claims = JSON.parse(page("eval/backend-claims.json"));
  const g = page(GUIDE);
  for (const [b, v] of Object.entries(claims.versions)) assert.ok(g.includes(`${b} ${v}`), `${b} ${v}`);
  assert.ok(g.includes(`Of the ${Object.keys(claims.cases).length - 1} cases`));
  const all = Object.entries(claims.cases).filter(([, by]) => Object.values(by).every((r) => r.result === "error")).map(([k]) => k).sort();
  assert.deepEqual(all, ["dynamic-and-static", "license-expression-invalid", "readme-content-type-missing", "version-invalid"]);
  const html = page("index.html");
  assert.match(html, /setuptools 84, hatchling 1\.33, flit_core 4\.2/);
  assert.ok(claims.versions.setuptools.startsWith("84.") && claims.versions.hatchling.startsWith("1.33") && claims.versions.flit_core.startsWith("4.2"));
});

test("links: siblings, guide, README, llms.txt, LICENSE, VENTURE.yaml", () => {
  const html = page("index.html");
  for (const s of ["requirements-pin-check", "pypi-provenance-check", "pip-audit-triage"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(readFileSync(new URL(`../${s}/index.html`, import.meta.url)));
  }
  assert.match(html, new RegExp(`href="${GUIDE}"`));
  for (const f of ["README.md", "llms.txt", "LICENSE", "VENTURE.yaml", "robots.txt"]) assert.ok(page(f).length > 10, f);
});
