import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyze, hasRisk, FINDING_KINDS as K } from "./engine.mjs";

const DOCS_PAGE = "why-node-version-drift-happens.html";
const VS_PAGE = "vs-eyeballing-and-npm-engine-strict.html";
const PAGES = ["index.html", DOCS_PAGE, VS_PAGE];
const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");

test("index links to the docs page and the comparison page, and both link back", async () => {
  const index = await read("index.html");
  assert.match(index, new RegExp(`href="${DOCS_PAGE.replace(/\./g, "\\.")}"`));
  assert.match(index, new RegExp(`href="${VS_PAGE.replace(/\./g, "\\.")}"`));
  for (const p of [DOCS_PAGE, VS_PAGE]) assert.match(await read(p), /href="\.\/"/);
});

test("the comparison page carries the not-affiliated disclaimer naming what it compares", async () => {
  const vs = await read(VS_PAGE);
  assert.match(vs, /not\s+affiliated\s+with/i);
  assert.match(vs, /engine-strict/);
});

test("all three pages carry the no-warranty clause and the nominative-use line", async () => {
  for (const file of PAGES) {
    const page = await read(file);
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
    assert.match(page, /trademark of the OpenJS Foundation/i, `${file} is missing the Node.js trademark line`);
  }
});

test("the EOL table is described as a dated snapshot on every page that quotes dates", async () => {
  for (const file of PAGES) {
    const page = await read(file);
    assert.match(page, /2026-10-11|nodejs\.org/, `${file} should point at nodejs.org or the table date`);
  }
});

test("index carries the sponsor link, privacy line, opt-out, and a sibling link", async () => {
  const page = await read("index.html");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(page, /Nothing you type is ever uploaded/);
  assert.match(page, /id="optout"/);
  assert.match(page, /href="\.\.\/package-exports-drift-check\/"/);
});

test("the sibling package-exports-drift-check links back (reciprocal link closes the crawlable orphan)", async () => {
  const sibling = await readFile(new URL("../package-exports-drift-check/index.html", import.meta.url), "utf8");
  assert.match(sibling, /href="\.\.\/node-version-drift-check\/"/);
});

test("index has SoftwareApplication and FAQPage JSON-LD", async () => {
  const page = await read("index.html");
  assert.match(page, /"@type":"SoftwareApplication"/);
  assert.match(page, /"@type":"FAQPage"/);
});

function faqOf(page) {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  return blocks.find((b) => b["@type"] === "FAQPage");
}

test("each page's FAQPage JSON-LD matches its visible headings and paragraphs verbatim", async () => {
  for (const file of PAGES) {
    const page = await read(file);
    const faq = faqOf(page);
    assert.ok(faq && faq.mainEntity.length >= 3, `FAQPage with 3+ questions on ${file}`);
    // Compare against the page with the JSON-LD removed, so this cannot pass
    // just because the JSON-LD contains itself.
    const visible = page.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    for (const { name, acceptedAnswer } of faq.mainEntity) {
      assert.ok(visible.includes(name), `${file}: question not visible: ${name}`);
      assert.ok(visible.includes(acceptedAnswer.text), `${file}: answer not visible for: ${name}`);
    }
  }
});

test("no FAQ question is repeated across pages", async () => {
  const seen = new Map();
  for (const file of PAGES) {
    for (const q of faqOf(await read(file)).mainEntity) {
      assert.ok(!seen.has(q.name), `"${q.name}" appears on both ${seen.get(q.name)} and ${file}`);
      seen.set(q.name, file);
    }
  }
});

test("sitemap lists all three published pages", async () => {
  const sitemap = await read("sitemap.xml");
  for (const page of PAGES) assert.match(sitemap, new RegExp(page.replace(/\./g, "\\.")));
});

function inputs(page) {
  const text = (id) => {
    const m = new RegExp(`<textarea id="${id}"[^>]*>([\\s\\S]*?)</textarea>`).exec(page);
    assert.ok(m, `textarea ${id}`);
    return m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  };
  return {
    "package.json": text("in-package"), ".nvmrc": text("in-nvmrc"), ".tool-versions": text("in-toolversions"),
    Dockerfile: text("in-dockerfile"), ".github/workflows/ci.yml": text("in-workflow"),
  };
}
const toFiles = (o) => Object.entries(o).map(([path, text]) => ({ path, text }));

// PRODUCT_PLAYBOOK.md 5e: prove it on a worked example, with this venture's own engine.
test("the default textarea contents demonstrate real drift (first click shows something)", async () => {
  const r = analyze(toFiles(inputs(await read("index.html"))), { today: "2026-10-11" });
  assert.ok(hasRisk(r));
});

test("the worked example matches the default boxes and shows three finding kinds", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_FILES = (\{[\s\S]*?\n    \});/.exec(page);
  assert.ok(m, "expected an EXAMPLE_FILES constant");
  const example = JSON.parse(m[1].replace(/\};$/, "}").replace(/;$/, ""));
  assert.deepEqual(example, inputs(page));
  const kinds = new Set(analyze(toFiles(example), { today: "2026-10-11" }).findings.map((f) => f.kind));
  for (const k of [K.PIN_VIOLATES_ENGINES, K.MAJOR_DISAGREEMENT, K.EOL_NODE]) assert.ok(kinds.has(k), `example should show ${k}`);
});
