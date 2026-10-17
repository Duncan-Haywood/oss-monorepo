import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("index links to the docs page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="why-a-manifest-fails-a-kubernetes-upgrade\.html"/,
    "index must link the docs page so crawlers can reach it",
  );
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL("./why-a-manifest-fails-a-kubernetes-upgrade.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("all pages carry the no-warranty clause", async () => {
  for (const file of [
    "index.html",
    "why-a-manifest-fails-a-kubernetes-upgrade.html",
    "vs-pluto.html",
    "vs-checking-the-migration-guide-by-hand.html",
  ]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test("index links to the vs-pluto comparison page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="vs-pluto\.html"/);
});

test("vs-pluto page links back to the tool", async () => {
  const page = await readFile(new URL("./vs-pluto.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("vs-pluto page carries the not-affiliated trademark disclaimer", async () => {
  const page = await readFile(new URL("./vs-pluto.html", import.meta.url), "utf8");
  assert.match(page, /not\s+affiliated\s+with/i);
});

test("vs-pluto page is listed in the sitemap", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /vs-pluto\.html/);
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

test("index links one hop to the helm-values-schema-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/helm-values-schema-check\/"/,
    "index must link ../helm-values-schema-check/ so crawlers reach this tool in one hop from a sibling",
  );
});

test("index links one hop to the k8s-resource-limits-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/k8s-resource-limits-check\/"/,
    "index must link ../k8s-resource-limits-check/ so crawlers reach this new sibling in one hop -- it ships with no inbound link otherwise, per platform/pages/siblings-budget.json's orphanBudget: 0",
  );
});

test("sitemap lists all published pages", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  for (const loc of [
    "index.html",
    "why-a-manifest-fails-a-kubernetes-upgrade.html",
    "vs-pluto.html",
    "vs-checking-the-migration-guide-by-hand.html",
  ]) {
    assert.match(sitemap, new RegExp(loc.replace(/\./g, "\\.")));
  }
});

test("index links to the vs-checking-the-migration-guide-by-hand comparison page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="vs-checking-the-migration-guide-by-hand\.html"/);
});

test("vs-checking-the-migration-guide-by-hand page links back to the tool", async () => {
  const page = await readFile(new URL("./vs-checking-the-migration-guide-by-hand.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});
