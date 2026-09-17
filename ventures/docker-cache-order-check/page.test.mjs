import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { scanText, hasRisk, FINDING_KINDS } from "./engine.mjs";

const DOCS_PAGE = "why-docker-build-cache-gets-busted.html";
const VS_PAGE = "vs-manually-reviewing-a-dockerfile.html";

test("index links to the docs page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, new RegExp(`href="${DOCS_PAGE.replace(/\./g, "\\.")}"`));
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL(`./${DOCS_PAGE}`, import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("index links to the comparison page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, new RegExp(`href="${VS_PAGE.replace(/\./g, "\\.")}"`));
});

test("the comparison page links back to the checker and names no specific product", async () => {
  const vs = await readFile(new URL(`./${VS_PAGE}`, import.meta.url), "utf8");
  assert.match(vs, /href="\.\/"/);
  assert.match(vs, /names no specific product/i);
});

test("all three pages carry the no-warranty clause", async () => {
  for (const file of ["index.html", DOCS_PAGE, VS_PAGE]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test("index carries the sponsor link", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index states nothing is uploaded (privacy line)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /never uploaded|never leaves your device|sent anywhere|Nothing is uploaded/i);
});

test("index links to at least one sibling Dockerfile-checker venture", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/docker-base-image-pin-check\/"/,
    'index must link ../docker-base-image-pin-check/ so crawlers reach a related tool in one hop',
  );
});

test("index has SoftwareApplication and FAQPage JSON-LD", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /"@type":"SoftwareApplication"/);
  assert.match(page, /"@type":"FAQPage"/);
});

test("index has a usage opt-out control", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="optout"/);
});

test("both pages' FAQPage JSON-LD matches their visible text verbatim", async () => {
  for (const file of ["index.html", DOCS_PAGE, VS_PAGE]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1]),
    );
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq, `missing FAQPage JSON-LD on ${file}`);
    assert.ok(faq.mainEntity.length >= 3);
    const visible = page.replace(/&mdash;/g, "—").replace(/&amp;/g, "&");
    for (const { name, acceptedAnswer } of faq.mainEntity) {
      assert.ok(visible.includes(name), `${file}: question not found verbatim: ${name}`);
      assert.ok(visible.includes(acceptedAnswer.text), `${file}: answer not found verbatim for: ${name}`);
    }
  }
});

test("the comparison page does not repeat a question the index page already answers", async () => {
  const faqOf = async (name) => {
    const html = await readFile(new URL(`./${name}`, import.meta.url), "utf8");
    const block = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b["@type"] === "FAQPage");
    return new Set(block.mainEntity.map((q) => q.name));
  };
  const vsQuestions = await faqOf(VS_PAGE);
  const indexQuestions = await faqOf("index.html");
  const docsQuestions = await faqOf(DOCS_PAGE);
  const overlapVsIndex = [...vsQuestions].filter((q) => indexQuestions.has(q));
  const overlapDocsIndex = [...docsQuestions].filter((q) => indexQuestions.has(q));
  assert.deepEqual(overlapVsIndex, [], `duplicated FAQ question(s) between comparison and index: ${overlapVsIndex.join(", ")}`);
  assert.deepEqual(overlapDocsIndex, [], `duplicated FAQ question(s) between docs and index: ${overlapDocsIndex.join(", ")}`);
});

test("sitemap lists all three published pages", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  for (const page of ["index.html", DOCS_PAGE, VS_PAGE]) {
    assert.match(sitemap, new RegExp(page.replace(/\./g, "\\.")), `sitemap missing ${page}`);
  }
});

// The worked example must actually demonstrate real findings when run
// through this venture's own engine (PRODUCT_PLAYBOOK.md §5e, "prove it on
// a worked example"), not just look plausible by eye.
test("index's worked example demonstrates all three finding kinds (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const match = /const EXAMPLE_DOCKERFILE = \[([\s\S]*?)\]\.join\("\\n"\);/.exec(page);
  assert.ok(match, "expected an EXAMPLE_DOCKERFILE array constant in index.html");
  const lines = [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
  const dockerfile = lines.join("\n");
  const findings = scanText(dockerfile, "Dockerfile");
  assert.ok(hasRisk(findings), "worked example should demonstrate real risk");
  const kinds = new Set(findings.map((f) => f.kind));
  assert.ok(kinds.has(FINDING_KINDS.APT_UPDATE_INSTALL_SPLIT), "expected an apt update/install split finding");
  assert.ok(kinds.has(FINDING_KINDS.MANIFEST_AFTER_BROAD_COPY), "expected a manifest-after-broad-copy finding");
});

// The default textarea contents (what a first-time visitor sees before
// clicking anything) should also be a real, checkable Dockerfile that
// demonstrates the tool's primary finding -- so the very first click a
// visitor makes shows something, not a blank "no issues found".
test("the default textarea contents demonstrate a real finding", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const match = /<textarea id="dockerfile-input"[^>]*>([\s\S]*?)<\/textarea>/.exec(page);
  assert.ok(match, "expected the default textarea contents in index.html");
  const dockerfile = match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  const findings = scanText(dockerfile, "Dockerfile");
  assert.ok(hasRisk(findings), "default textarea contents should demonstrate a real finding");
});
