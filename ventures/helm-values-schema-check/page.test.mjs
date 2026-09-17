import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("index links to the docs page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="why-helm-silently-accepts-a-typo-in-values-yaml\.html"/,
    "index must link the docs page so crawlers can reach it",
  );
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL("./why-helm-silently-accepts-a-typo-in-values-yaml.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("all pages carry the no-warranty clause", async () => {
  for (const file of ["index.html", "why-helm-silently-accepts-a-typo-in-values-yaml.html", "vs-helm-lint.html"]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test("index links to the vs-helm-lint comparison page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="vs-helm-lint\.html"/);
});

test("vs-helm-lint page links back to the tool", async () => {
  const page = await readFile(new URL("./vs-helm-lint.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("vs-helm-lint page carries the not-affiliated trademark disclaimer", async () => {
  const page = await readFile(new URL("./vs-helm-lint.html", import.meta.url), "utf8");
  assert.match(page, /not\s+affiliated\s+with/i);
});

test("vs-helm-lint page is listed in the sitemap", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /vs-helm-lint\.html/);
});

test("index carries the sponsor link", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index states nothing is uploaded (privacy line)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /never uploaded|never leaves your device/i);
});

test("index links one hop to the k8s-deprecated-api-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/k8s-deprecated-api-check\/"/,
    "index must link ../k8s-deprecated-api-check/ so crawlers reach this tool in one hop from a sibling",
  );
});

test("sitemap lists all three published pages", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  for (const loc of ["index.html", "why-helm-silently-accepts-a-typo-in-values-yaml.html", "vs-helm-lint.html"]) {
    assert.match(sitemap, new RegExp(loc.replace(/\./g, "\\.")));
  }
});
