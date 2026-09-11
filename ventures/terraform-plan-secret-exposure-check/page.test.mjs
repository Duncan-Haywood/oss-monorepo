import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("index links to the docs page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="why-terraform-plan-json-leaks-secrets\.html"/,
    "index must link the docs page so crawlers can reach it",
  );
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL("./why-terraform-plan-json-leaks-secrets.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("both pages carry the no-warranty clause", async () => {
  for (const file of ["index.html", "why-terraform-plan-json-leaks-secrets.html"]) {
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
  assert.match(page, /never uploaded|never leaves your device/i);
});

test("index links one hop to the env-example-drift-check sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/env-example-drift-check\/"/,
    "index must link ../env-example-drift-check/ so crawlers reach this tool in one hop from a sibling",
  );
});

test("index never echoes a full secret value in the worked example's rendering path", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /f\.redacted/, "the report must render the redacted form, not the raw match");
});
