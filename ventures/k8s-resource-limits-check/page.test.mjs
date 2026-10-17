import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("index links to the docs page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="why-a-missing-resource-limit-takes-down-a-node\.html"/,
    "index must link the docs page so crawlers can reach it",
  );
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL("./why-a-missing-resource-limit-takes-down-a-node.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("all pages carry the no-warranty clause", async () => {
  for (const file of ["index.html", "why-a-missing-resource-limit-takes-down-a-node.html", "vs-polaris.html"]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test("index links to the vs-polaris comparison page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="vs-polaris\.html"/);
});

test("vs-polaris page links back to the tool", async () => {
  const page = await readFile(new URL("./vs-polaris.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("vs-polaris page carries the not-affiliated trademark disclaimer", async () => {
  const page = await readFile(new URL("./vs-polaris.html", import.meta.url), "utf8");
  assert.match(page, /not\s+affiliated\s+with/i);
});

test("vs-polaris page is listed in the sitemap", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /vs-polaris\.html/);
});

test("index carries the sponsor link", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index states nothing is uploaded (privacy line)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /never uploaded|never leaves your device/i);
});

test("index links one hop to the k8s-rollout-safety-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/k8s-rollout-safety-check\/"/,
    "index must link ../k8s-rollout-safety-check/ so crawlers reach this tool in one hop from a sibling",
  );
});

test("index links one hop to the k8s-deprecated-api-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/k8s-deprecated-api-check\/"/,
    "index must link ../k8s-deprecated-api-check/ so crawlers reach this tool in one hop from a sibling",
  );
});

test("index links one hop to the helm-values-schema-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/helm-values-schema-check\/"/,
    "index must link ../helm-values-schema-check/ so crawlers reach this tool in one hop from a sibling",
  );
});

test("sitemap lists all published pages", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  for (const loc of ["index.html", "why-a-missing-resource-limit-takes-down-a-node.html", "vs-polaris.html"]) {
    assert.match(sitemap, new RegExp(loc.replace(/\./g, "\\.")));
  }
});

// Each <script type="application/ld+json"> block, parsed independently.
// A lazy [\s\S]*? spanning from one script tag's opening to a *later* tag's
// content would silently stitch two JSON-LD blocks together and either
// throw on the seam or parse a truncated object -- this instead matches
// each block on its own non-`<` content, which is safe because none of
// this file's JSON-LD strings contain a literal `<`.
function jsonLdBlocks(page) {
  return [...page.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
}

test("the FAQPage schema on every page is valid JSON and matches the visible headings", async () => {
  for (const file of ["index.html", "why-a-missing-resource-limit-takes-down-a-node.html", "vs-polaris.html"]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    const schema = jsonLdBlocks(page).find((s) => s["@type"] === "FAQPage");
    assert.ok(schema, `${file} is missing a FAQPage schema block`);
    for (const q of schema.mainEntity) {
      assert.ok(page.includes(`<h3>${q.name}</h3>`), `${file}: FAQ question "${q.name}" has no matching <h3>`);
      assert.ok(page.includes(q.acceptedAnswer.text), `${file}: FAQ answer for "${q.name}" is not verbatim on the page`);
    }
  }
});

test("the SoftwareApplication schema on index is valid JSON and free", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const schema = jsonLdBlocks(page).find((s) => s["@type"] === "SoftwareApplication");
  assert.ok(schema, "index is missing a SoftwareApplication schema block");
  assert.equal(schema.offers.price, "0");
});

// Inbound hop for k8s-pod-security-check, which would otherwise be a
// crawlable orphan (`platform/pages/siblings.mjs` fails on one).
test("index links one hop to the k8s-pod-security-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\.\/k8s-pod-security-check\/"/);
});
