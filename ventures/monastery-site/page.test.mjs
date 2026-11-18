import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const script = /<script type="module">([\s\S]*?)<\/script>/.exec(page)[1];

test("the builder carries the disclaimer, the sponsor link and the privacy switch", () => {
  assert.match(page, /No warranty/);
  assert.match(page, /not legal, tax, or financial advice/);
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(page, /<input type="checkbox" id="usage"/);
  assert.match(page, /Everything runs in your browser/);
});

test("every builder field has a label, and every path it writes is one the engine reads", async () => {
  const src = readFileSync(new URL("./site.mjs", import.meta.url), "utf8");
  for (const [, id, path] of page.matchAll(/<(?:input|select|textarea)[^>]*id="([^"]+)"[^>]*data-path="([^"]+)"/g)) {
    assert.match(page, new RegExp(`<label for="${id}"`), id);
    const leaf = path.split(".").filter((k) => !/^\d+$/.test(k)).pop();
    assert.ok(src.includes(leaf), `${path}: the engine never reads "${leaf}"`);
  }
});

test("every id the script reads exists in the markup", () => {
  for (const [, id] of script.matchAll(/\$\("([\w-]+)"\)/g)) assert.match(page, new RegExp(`id="${id}"`), id);
});

test("the builder posts nothing: it fetches only the shipped examples", () => {
  assert.doesNotMatch(script, /XMLHttpRequest|sendBeacon|method:\s*"POST"/);
  const fetched = [...script.matchAll(/fetch\(`?"?([^`")]+)/g)].map((m) => m[1]);
  for (const f of fetched) assert.match(f, /^\.\/examples\//, f);
});

test("JSON-LD parses, and the FAQ data is the FAQ on the page", () => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  for (const q of faq.mainEntity) {
    assert.ok(page.includes(`<h3>${q.name}</h3><p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("the module script is valid syntax", () => {
  assert.doesNotThrow(() => new Function(script.replace(/^\s*import .*$/gm, "").replace(/\bawait\b/g, "")));
});

test("the page links to both demos and they exist", () => {
  for (const d of ["demo/abbey/index.html", "demo/sisters/index.html"]) {
    assert.ok(page.includes(`href="${d}"`), d);
    assert.ok(readFileSync(new URL(`./${d}`, import.meta.url), "utf8").includes("<!doctype html>"));
  }
});

test("the builder links one hop to the parish-office sibling", () => {
  assert.match(page, /href="\.\.\/parish-office\/"/);
});
