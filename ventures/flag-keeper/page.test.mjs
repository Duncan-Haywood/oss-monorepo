import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateConfig, simulate, impact } from "./engine.mjs";

const file = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const area = (id) => JSON.parse(file("index.html").match(new RegExp(`<textarea id="${id}"[^>]*>([\\s\\S]*?)</textarea>`))[1]);

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = file("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /no uptime or delivery guarantee/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every form control has a label and the page makes no network requests", () => {
  const html = file("index.html");
  for (const id of ["cfg", "flagkey", "ctx", "users", "cfg2"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the page imports modules that exist and never a Node-only one", () => {
  const html = file("index.html");
  for (const m of html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)) {
    assert.doesNotThrow(() => file(m[1]), m[1]);
    assert.doesNotMatch(file(m[1]), /from "node:/, `${m[1]} must run in a browser`);
  }
});

test("the in-page FAQ matches the structured data", () => {
  const html = file("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  for (const q of faq.mainEntity) { assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name); assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name); }
});

test("the configs pre-filled on the page are valid, match examples/, and the comparison widens only", () => {
  const a = area("cfg"), b = area("cfg2");
  assert.deepEqual(a, JSON.parse(file("examples/flags.json")));
  assert.deepEqual(validateConfig(a), []); assert.deepEqual(validateConfig(b), []);
  const attrs = JSON.parse(file("index.html").match(/<textarea id="ctx"[^>]*>([\s\S]*?)<\/textarea>/)[1]);
  const s = simulate(a, "new-checkout", { users: 5000, attrs });
  assert.ok(s.byVariant.on > 300 && s.byVariant.off > 4000, JSON.stringify(s));
  const r = impact(a, b, "new-checkout", { users: 5000, attrs });
  assert.deepEqual(Object.keys(r.moves), ["off -> on"]);
});

test("robots and sitemap let crawlers find the page; deploy files point at this directory", () => {
  assert.match(file("robots.txt"), /Allow: \//);
  assert.match(file("sitemap.xml"), /index\.html/);
  assert.match(file("render.yaml"), /dockerContext: ventures\/flag-keeper/);
  assert.match(file("Dockerfile"), /COPY engine\.mjs sdk\.mjs server\.mjs/);
  assert.match(file("fly.toml"), /auto_stop_machines = "off"/);
});
