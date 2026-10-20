import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractProduct, SAMPLE_HTML } from "./extract.mjs";

const read = (f) => readFile(new URL(f, import.meta.url), "utf8");
const index = await read("./index.html");

test("the entry page is a working tool wired to the shared engine", () => {
  for (const id of ["html", "url", "target", "run", "json", "copy-json", "dl-json", "yml", "copy-yml"]) assert.match(index, new RegExp(`id="${id}"`));
  assert.match(index, /from "\.\/extract\.mjs"/);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /FAQPage/);
});

test("both JSON-LD blocks parse", () => {
  const blocks = [...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 2);
  for (const b of blocks) assert.doesNotThrow(() => JSON.parse(b[1]));
});

test("disclaimers, privacy and usage opt-out are present", () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded/i);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  assert.match(index, /What you use today/);
});

test("the page makes no network calls", () => {
  assert.doesNotMatch(index.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the workflow shown on the page is the template file, unescaped", async () => {
  const shown = /<pre class="cmd" id="yml">([\s\S]*?)<\/pre>/.exec(index)[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  assert.equal(shown, await read("./template/price-watch.yml"));
});

test("the worked example finds the price the page claims", () => {
  assert.equal(extractProduct(SAMPLE_HTML).price, 129);
});

test("the example config is valid JSON with usable rules", async () => {
  const cfg = JSON.parse(await read("./template/watch.example.json"));
  assert.ok(cfg.items.length >= 2);
  for (const i of cfg.items) assert.doesNotThrow(() => new URL(i.url));
});
