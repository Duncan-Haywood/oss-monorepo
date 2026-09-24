import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { listStates, getRule, checkPosting } from "./engine.mjs";

const DOCS_PAGE = "why-pay-range-laws-differ-by-state.html";
const VS_PAGE = "vs-checking-each-states-law-by-hand.html";

test("index links to the docs page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, new RegExp(`href="${DOCS_PAGE.replace(/\./g, "\\.")}"`));
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL(`./${DOCS_PAGE}`, import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("both pages carry the no-warranty clause", async () => {
  for (const file of ["index.html", DOCS_PAGE]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test("index and docs page both state this is not legal advice", async () => {
  for (const file of ["index.html", DOCS_PAGE]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /not legal advice/i, `${file} is missing the not-legal-advice statement`);
  }
});

test("index links to a related legal-reference venture in one hop (see siblings.test.mjs's orphan budget)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/call-recording-consent-check\/"/,
    'index must link ../call-recording-consent-check/ so crawlers reach a related tool in one hop',
  );
});

test("index carries the sponsor link", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index states nothing is uploaded (privacy line)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /never uploaded|never leaves your device|sent anywhere|Nothing is uploaded|nothing is uploaded/i);
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

test("index has a copy-shareable-link control and wires the real share functions", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="copy-link"/);
  assert.match(page, /id="copy-link-status"/);
  assert.match(page, /import\s*{\s*encodeInputs,\s*decodeInputs,\s*formValues\s*}\s*from\s*"\.\/share\.mjs"/);
});

test("a shared link is applied through formValues(), never handed to the form bare (see check_shared_link_clears.py)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /applyShared\(formValues\(sharedInputs\)\)/);
});

test("the shareable link never carries the posting text field", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /encodeInputs\(\{\s*states:\s*selectedStates\(\)\.join\(","\)\s*\}\)/);
  assert.doesNotMatch(page, /encodeInputs\([^)]*posting-text/);
});

test("the privacy paragraph names the two share-related events it actually records", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /link_shared/);
  assert.match(page, /link_loaded/);
});

test("index's FAQPage JSON-LD text matches the visible copy", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on index");
  assert.ok(faq.mainEntity.length >= 3);
  const visible = page.replace(/&mdash;/g, "—").replace(/&amp;/g, "&");
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `question not found verbatim: ${name}`);
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});

test("index's script wires the real engine functions, not a re-implementation", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /import\s*{\s*listStates,\s*getRule,\s*checkPosting\s*}\s*from\s*"\.\/engine\.mjs"/);
});

// The worked example must actually demonstrate a real "missing" result
// when run through this venture's own engine (PRODUCT_PLAYBOOK.md §5e,
// "prove it on a worked example"), not just look plausible by eye.
test("index's worked example demonstrates a real missing-range result (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /Join our fast-growing team as a Senior Engineer/);
  assert.match(page, /setSelectedStates\(\["Colorado"\]\)/);
  const result = checkPosting("Join our fast-growing team as a Senior Engineer! Great benefits and a fun culture.", ["Colorado"]);
  assert.equal(result.scan.classification, "none");
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].state, "Colorado");
});

test("the states table on index lists all 51 jurisdictions via the real engine", () => {
  assert.equal(listStates().length, 51);
});

test("index links to the comparison page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, new RegExp(`href="${VS_PAGE.replace(/\./g, "\\.")}"`));
});

test("the comparison page links back to the checker and its FAQPage JSON-LD matches the visible text", async () => {
  const vs = await readFile(new URL(`./${VS_PAGE}`, import.meta.url), "utf8");
  assert.match(vs, /href="\.\/"/);
  const blocks = [...vs.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the comparison page");
  assert.ok(faq.mainEntity.length >= 3);
  const visible = vs.replace(/&mdash;/g, "—").replace(/&amp;/g, "&");
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `question not found verbatim: ${name}`);
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});

test("the comparison page carries the disclaimers, names no product, and is listed in the venture sitemap", async () => {
  const vs = await readFile(new URL(`./${VS_PAGE}`, import.meta.url), "utf8");
  assert.match(vs, /No warranty/);
  assert.match(vs, /Nothing leaves your browser/);
  assert.match(vs, /names no specific product/i);
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, new RegExp(VS_PAGE.replace(/\./g, "\\.")));
});

test("the comparison page does not repeat a question the index or docs page already answers", async () => {
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
  const overlap = [...vsQuestions].filter((q) => indexQuestions.has(q) || docsQuestions.has(q));
  assert.deepEqual(overlap, [], `duplicated FAQ question(s): ${overlap.join(", ")}`);
});

test("docs page is listed in the venture sitemap", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, new RegExp(DOCS_PAGE.replace(/\./g, "\\.")));
});

test("docs page's jurisdiction-count claim holds against the real engine", async () => {
  const page = await readFile(new URL(`./${DOCS_PAGE}`, import.meta.url), "utf8");
  assert.match(page, /Fourteen states and DC/);
  const required = listStates().filter((s) => getRule(s).type === "range-required");
  assert.equal(required.length, 14);
});
