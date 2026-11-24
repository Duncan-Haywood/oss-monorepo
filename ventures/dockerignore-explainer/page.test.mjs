import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "why-dockerignore-pattern-does-not-match-subfolders.html";
const PAGES = ["index.html", GUIDE];

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal, security or professional advice/, p);
    assert.match(html, /Not affiliated with or endorsed by Docker, Inc\./, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD blocks parse and each FAQ matches the visible questions", () => {
  for (const p of PAGES) {
    const html = page(p);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, p);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
    assert.ok(!/AggregateRating|"Review"/.test(html), p);
  }
  const app = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]))[0];
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
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
    assert.match(page("sitemap.xml"), new RegExp(p === "index.html" ? "dockerignore-explainer/<" : escapeRegExp(p)));
  }
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 5);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "dockerignore.mjs", "matcher.mjs", "dockerfile.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  for (const f of ["matcher.mjs", "dockerfile.mjs"]) assert.doesNotMatch(page(f), /^\s*import\s|import\(|Date\.now|Math\.random/m, f);
});

test("the inline script imports only exported names and every element it uses exists", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./dockerignore.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/dockerignore\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./dockerignore.mjs");
  for (const n of names) assert.ok(n in engine, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  for (const m of html.matchAll(/for \(const id of \[([^\]]+)\]\)/g)) for (const id of m[1].match(/"([\w-]+)"/g)) assert.ok(ids.has(id.replace(/"/g, "")), id);
});

test("usage events are documented where they are recorded", () => {
  const html = page("index.html");
  for (const e of ["dockerignore_checked", "example_loaded", "folder_picked", "why_shown", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("the guide's examples are what the engine says", async () => {
  const { resolve, buildTree } = await import("./matcher.mjs");
  const sent = (ignore, files) => {
    const r = resolve(ignore, buildTree(files));
    return r.error ? r.error : Object.fromEntries(r.entries.filter((e) => !e.isDir).map((e) => [e.path, e.sent]));
  };
  assert.deepEqual(sent("*.log\n", ["a.log", "logs/b.log"]), { "a.log": false, "logs/b.log": true });
  assert.deepEqual(sent("**/*.md\n!docs\n", ["x.md", "docs/README.md", "docs/a.txt"]), { "x.md": false, "docs/README.md": false, "docs/a.txt": true });
  assert.deepEqual(sent("**/*.md\n!docs/**\n", ["x.md", "docs/README.md", "docs/a.txt"]), { "x.md": false, "docs/README.md": true, "docs/a.txt": true });
  assert.deepEqual(sent("*\n!src\n", ["src/a/b.go", "src/c", "d"]), { d: false, "src/a/b.go": true, "src/c": true });
  assert.deepEqual(sent("[!a]\n", ["a", "b", "!"]), { "!": false, a: false, b: true });
  assert.equal(sent("a[^x]b\n", ["a/b/c"])["a/b/c"], false);
  assert.deepEqual(sent("  # not a comment\nnode_modules # deps\n", ["# not a comment", "node_modules/x"]), { "# not a comment": false, "node_modules/x": true });
  assert.match(sent("node_modules\n!node_modules/keep\n[\n", ["a"]), /syntax error in pattern/);
  const g = page(GUIDE);
  for (const s of ["<code>logs/b.log</code></td><td><strong>yes</strong>", "<code>docs/README.md</code></td><td><strong>no</strong>", "invalid excludepatterns: syntax error in pattern"]) assert.ok(g.includes(s), s);
});

test("links: siblings, guide, robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml", () => {
  for (const s of ["docker-build-secrets-check", "docker-cache-order-check", "gitignore-explainer"]) assert.match(page("index.html"), new RegExp(`href="\\.\\./${s}/"`));
  assert.match(page("index.html"), new RegExp(`href="${escapeRegExp(GUIDE)}"`));
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# \.dockerignore Explainer/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: dockerignore-explainer$/m);
});
