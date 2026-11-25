import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyze } from "./csp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(HERE, f), "utf8");
const pages = ["index.html", "refused-to-execute-inline-script.html"];
const ld = (src) => [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test("JSON-LD parses: SoftwareApplication + FAQPage on the tool, HowTo on the guide", () => {
  const idx = ld(read("index.html"));
  assert.equal(idx.find((b) => b["@type"] === "SoftwareApplication").offers.price, "0");
  assert.ok(idx.find((b) => b["@type"] === "FAQPage").mainEntity.length >= 3);
  assert.ok(ld(read("refused-to-execute-inline-script.html")).find((b) => b["@type"] === "HowTo").step.length >= 3);
});

test("every FAQ answer in the schema is also visible on the page", () => {
  const html = read("index.html");
  for (const q of ld(html).find((b) => b["@type"] === "FAQPage").mainEntity) {
    assert.ok(html.includes(`<h3>${q.name.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h3>`), q.name);
  }
});

test("no-warranty clause, sponsor link and licence on every page; privacy line on the tool", () => {
  for (const p of pages) {
    const s = read(p);
    assert.match(s, /provided free and as-is, without warranty/, p);
    assert.match(s, /github\.com\/sponsors\/Duncan-Haywood/, p);
    assert.match(s, /FSL-1.1-MIT licence/, p);
  }
  assert.match(read("index.html"), /never uploaded/);
  assert.match(read("index.html"), /id="usageOptOut"/);
});

test("the page's two example policies say what the page claims they show", () => {
  const html = read("index.html");
  const weak = html.match(/const WEAK = "([^"]+)"/)[1];
  const strict = html.match(/const STRICT = "([^"]+)"/)[1];
  assert.match(analyze(weak).summary, /high-severity/);
  assert.deepEqual(analyze(strict).findings.filter((f) => f.severity !== "info"), []);
});

test("the guide's hash example is the value the tool computes", async () => {
  const { inlineHash } = await import("./csp.mjs");
  assert.ok(read("refused-to-execute-inline-script.html").includes(await inlineHash("alert('Hello, world.');")));
});
