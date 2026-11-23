import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "how-to-split-group-trip-expenses.html"];

test("pages carry the disclaimer and the sponsor link; the tool carries privacy and no-SLA", () => {
  for (const name of PAGES) {
    const html = page(name);
    assert.match(html, /No warranty/, name);
    assert.match(html, /not legal, tax or financial advice/, name);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, name);
  }
  const html = page("index.html");
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /id="optout"/);
});

test("JSON-LD parses and every FAQ answer is visible on the page", () => {
  for (const name of PAGES) {
    const html = page(name);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, name);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
  }
});

test("SEO basics and sitemap", () => {
  for (const name of PAGES) {
    const html = page(name);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<meta name="description" content="[^"]{80,}/);
    assert.match(html, /<link rel="canonical" href="\.\//);
    assert.match(html, /<h1>/);
    assert.match(page("sitemap.xml"), new RegExp(name.replace(".", "\\.")));
  }
});

test("every static input is labelled and nothing is sent anywhere", () => {
  const html = page("index.html");
  const markup = html.split("<script type=\"module\">")[0];
  const inputs = [...markup.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/type="radio"/.test(t));
  assert.ok(inputs.length >= 8);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  for (const src of [html, page("calc.mjs")]) assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
});

test("the guide's balance table matches the engine", async () => {
  const { run, EXAMPLE } = await import("./calc.mjs");
  const net = run(EXAMPLE).book.net.map((c) => (c / 100).toFixed(2));
  const guide = page("how-to-split-group-trip-expenses.html");
  const shown = [...guide.matchAll(/<td class="num">([+−-][\d.]+)<\/td>/g)].map((m) => m[1].replace("−", "-").replace("+", ""));
  assert.deepEqual(shown, net);
});
