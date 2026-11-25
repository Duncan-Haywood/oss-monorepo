import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "why-npmignore-publishes-your-gitignored-files.html";
const PAGES = ["index.html", GUIDE];
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
    assert.ok(!/AggregateRating|"Review"/.test(html));
  }
  const app = ld(page("index.html"))[0];
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics on every page", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.ok(html.includes(`<link rel="canonical" href="./${p}">`), p);
    assert.match(html, /<meta property="og:title"/, p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.ok(page("sitemap.xml").includes(p === "index.html" ? "npm-publish-contents/<" : p), p);
  }
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 3);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "packlist.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  assert.doesNotMatch(page("packlist.mjs"), /^\s*import\s|import\(|Date\.now|Math\.random/m);
});

test("the inline script imports only exported names and every element it uses exists", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./packlist.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/packlist\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./packlist.mjs");
  for (const n of names) assert.ok(n in engine, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  for (const m of html.matchAll(/for \(const id of \[([^\]]+)\]\)/g)) for (const id of m[1].match(/"([\w-]+)"/g)) assert.ok(ids.has(id.replace(/"/g, "")), id);
});

test("usage events are documented where they are recorded", () => {
  const html = page("index.html");
  for (const e of ["package_checked", "example_loaded", "secret_found", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("the guide's example says what the engine says", async () => {
  const e = await import("./packlist.mjs");
  const files = e.parseFileList(e.EXAMPLE.files);
  const both = e.analyze({ packageJson: e.EXAMPLE.packageJson, files, ignoreFiles: e.parseIgnoreBundle(e.EXAMPLE.ignoreFiles) });
  const shadow = both.findings.find((f) => f.id === "gitignore-shadowed");
  assert.deepEqual(shadow.paths.sort(), [".env", "coverage/lcov.info", "dist/index.d.ts", "dist/index.js", "dist/index.js.map", "notes/todo.md"]);
  assert.match(both.rows.find((r) => r.path === ".env").reason, /no rule matches, so it ships/);
  const gitOnly = e.parseIgnoreBundle(e.EXAMPLE.ignoreFiles);
  gitOnly.delete(".npmignore");
  const alone = e.analyze({ packageJson: e.EXAMPLE.packageJson, files: files.filter((f) => f !== ".npmignore"), ignoreFiles: gitOnly });
  for (const p of [".env", "coverage/lcov.info", "notes/todo.md"]) assert.ok(!alone.files.includes(p), p);
  // main forces npm into dist/, and then the `dist/` rule no longer matches the files inside.
  for (const p of ["dist/index.js", "dist/index.d.ts", "dist/index.js.map"]) assert.ok(alone.files.includes(p), p);
  assert.deepEqual(alone.findings.find((f) => f.id === "folder-rule-bypassed").paths, [".gitignore:2 `dist/` (folder dist/): dist/index.d.ts, dist/index.js.map"]);
  const g = page(GUIDE);
  for (const s of ["no rule matches, so it ships", "npm 10.9.9 and 11.21.3"]) assert.ok(g.includes(s), s);
});

test("links: siblings, guide, robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml", () => {
  const html = page("index.html");
  for (const s of ["npm-provenance-check", "package-exports-drift-check", "gitignore-explainer"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(readFileSync(new URL(`../${s}/index.html`, import.meta.url)));
  }
  assert.ok(html.includes(`href="${GUIDE}"`), GUIDE);
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# npm Publish Contents/);
  assert.match(page("LICENSE"), /Functional Source License/);
  assert.match(page("VENTURE.yaml"), /^name: npm-publish-contents$/m);
});
