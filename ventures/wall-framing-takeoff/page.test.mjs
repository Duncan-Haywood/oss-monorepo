import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

for (const name of ["index.html", "how-many-studs-for-a-wall.html"]) {
  test(`${name} carries the disclaimer, privacy line and sponsor link`, () => {
    const html = page(name);
    assert.match(html, /No warranty/);
    assert.match(html, /not engineering, construction, building-code/i);
    assert.match(html, /not checked against any span table or code/);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
    assert.match(html, /Not affiliated with any lumberyard/);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<meta name="description" content="[^"]{80,}/);
    assert.match(html, /<link rel="canonical" href="\.\/[\w-]+\.html">/);
    assert.match(html, /<meta property="og:title"/);
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  });
}

test("JSON-LD parses, and every FAQ answer on the page matches its structured data", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("every static control has a label, and generated rows label their inputs", () => {
  const html = page("index.html");
  const statics = [...html.replace(/<script type="module">[\s\S]*<\/script>/, "").matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(statics.length >= 9);
  for (const tag of statics) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  for (const helper of ["const f = ", "const sel = ", "const chk = ", "const del = "]) {
    const line = html.slice(html.indexOf(helper), html.indexOf("\n", html.indexOf(helper)));
    assert.match(line, /aria-label=/, helper);
  }
});

test("the module script imports only local files, its names exist, and it parses", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./engine.mjs", "./usage.mjs"]);
  const names = html.match(/import \{([^}]+)\} from "\.\/engine\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./engine.mjs");
  for (const name of names) assert.ok(name in engine, name);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  assert.doesNotMatch(page("engine.mjs"), /^\s*import\s/m);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)/g)].map((m) => m[1]);
  assert.ok(used.length > 25);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the usage events named in the privacy line are the ones the page records", () => {
  const html = page("index.html");
  const recorded = new Set([...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]));
  const named = new Set([...html.match(/Anonymous feature events \(([^)]*)\)/)[1].matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]));
  assert.deepEqual([...recorded].sort(), [...named].sort());
});

test("sitemap lists every page and robots allows crawling", () => {
  const sm = page("sitemap.xml");
  assert.match(sm, /<loc>\.\/index\.html<\/loc>/);
  assert.match(sm, /<loc>\.\/how-many-studs-for-a-wall\.html<\/loc>/);
  assert.match(page("robots.txt"), /Allow: \//);
});

test("the footer links the cut list optimizer, and it links back", () => {
  assert.match(page("index.html"), /<a href="\.\.\/cut-list-optimizer\/">/);
  assert.match(readFileSync(new URL("../cut-list-optimizer/index.html", import.meta.url), "utf8"), /<a href="\.\.\/wall-framing-takeoff\/">/);
});
