import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "why-semver-range-skips-prereleases.html"];
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
// Visible copy escapes < > & ; a raw "<1.4" would open a tag and swallow the rest of the answer.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal, security or professional advice/, p);
    assert.match(html, /Not affiliated with or endorsed by npm, Inc\./, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD blocks parse and each FAQ matches the visible questions", () => {
  for (const p of PAGES) {
    const html = page(p);
    const faq = ld(html).find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, p);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${esc(q.name)}</h3>`), q.name);
      assert.ok(html.includes(`<p>${esc(q.acceptedAnswer.text)}</p>`), q.name);
    }
  }
  const app = ld(page("index.html"))[0];
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
  for (const p of PAGES) assert.ok(!/AggregateRating|"Review"/.test(page(p)));
});

test("SEO basics on every page", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${p.replace(".", "\\.")}">`), p);
    assert.match(html, /<meta property="og:title"/, p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(page("sitemap.xml"), new RegExp(p === "index.html" ? "semver-range-explainer/<" : p.replace(".", "\\.")));
  }
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 4);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "semver.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  assert.doesNotMatch(page("semver.mjs"), /^\s*import\s|import\(|Date\.now|Math\.random/m);
});

test("the inline script imports only exported names and every element it uses exists", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./semver.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/semver\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./semver.mjs");
  for (const n of names) assert.ok(n in engine, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  for (const m of html.matchAll(/for \(const id of \[([^\]]+)\]\)/g)) for (const id of m[1].match(/"([\w-]+)"/g)) assert.ok(ids.has(id.replace(/"/g, "")), id);
});

test("usage events are documented where they are recorded", () => {
  const html = page("index.html");
  for (const e of ["range_checked", "example_loaded", "ranges_compared", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("the guide quotes what the engine says", async () => {
  const e = await import("./semver.mjs");
  const g = unescape(page("why-semver-range-skips-prereleases.html"));
  for (const [v, r] of [["1.9.0-rc.1", "^1.2.0"], ["2.0.0-beta.4", ">=2.0.0-beta.1 <2.0.0"], ["2.1.0-beta.0", ">=2.0.0-beta.1"], ["1.2.3-rc.1", "^1.2.3-rc.1 || *"]]) {
    assert.ok(g.includes(e.explainVersion(v, r).reason), `${v} ${r}`);
  }
  assert.equal(e.satisfies("1.2.3-rc.1", "^1.2.3-rc.1"), true);
  assert.equal(e.rangeString(e.parseRange("^1.2.0")), ">=1.2.0 <2.0.0-0");
  assert.equal(e.satisfies("2.0.0-alpha", "<2.0.0", { includePrerelease: true }), true);
  assert.equal(e.satisfies("2.0.0-alpha", "<2.0.0-0", { includePrerelease: true }), false);
});

test("links: siblings, guide, robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml", () => {
  const html = page("index.html");
  for (const s of ["npm-lockfile-duplicates-check", "node-version-drift-check"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(readFileSync(new URL(`../${s}/index.html`, import.meta.url)));
  }
  assert.match(html, /href="why-semver-range-skips-prereleases\.html"/);
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# Semver Range Explainer/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: semver-range-explainer$/m);
});
