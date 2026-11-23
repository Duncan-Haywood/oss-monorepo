import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("the page carries the no-warranty clause, independence line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not engineering, legal, contractual or scheduling advice/);
  assert.match(html, /Not affiliated with, endorsed by or sponsored by Oracle, Primavera or the Defense Contract Management Agency/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Everything runs in your browser/);
});

test("JSON-LD blocks parse and the FAQ matches the visible questions", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>[^<]{20,}<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{80,320}"/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("llms.txt"), /^# XER Schedule Check/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 2);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of ["index.html", "xer.mjs", "calendar.mjs", "cpm.mjs", "dcma.mjs", "compare.mjs", "risk.mjs", "level.mjs", "floatpaths.mjs", "usage.mjs"]) {
    assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  }
});

test("the inline script imports only exported local names and every element it uses exists", async () => {
  const html = page("index.html");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  for (const m of script.matchAll(/import \{([^}]+)\} from "\.\/([^"]+)"/g)) {
    const mod = await import(`./${m[2]}`);
    for (const name of m[1].split(",").map((s) => s.trim())) assert.ok(name in mod, `${m[2]} exports ${name}`);
  }
  // modules loaded on a button's first press: every name a handler takes from one is exported by it
  const lazy = new Map([...script.matchAll(/const (\w+) = onDemand\(\(\) => import\("\.\/([^"]+)"\)\)/g)].map((m) => [m[1], m[2]]));
  assert.ok(lazy.size >= 10, "on-demand modules");
  const used = new Set();
  for (const m of script.matchAll(/const \{([^}]+)\} = await (\w+)\(\)|\(await (\w+)\(\)\)\.(\w+)/g)) {
    const loader = m[2] || m[3], names = m[1] ? m[1].split(",").map((s) => s.trim()) : [m[4]];
    assert.ok(lazy.has(loader), `${loader} is an onDemand loader`);
    used.add(loader);
    const mod = await import(`./${lazy.get(loader)}`);
    for (const name of names) assert.ok(name in mod, `${lazy.get(loader)} exports ${name}`);
  }
  for (const loader of lazy.keys()) assert.ok(used.has(loader), `${loader} is used`);
  // and nothing still calls a lazy module's export without loading it first: no bare static import of them either
  for (const f of lazy.values()) assert.ok(!script.includes(`from "./${f}"`), `${f} is not also imported statically`);
  for (const m of script.matchAll(/\$\("#([\w-]+)/g)) assert.ok(html.includes(`id="${m[1]}"`), `#${m[1]}`);
});
