import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("vs-Bonsai page carries the required disclaimers and no invented pricing", async () => {
  const page = await readFile(new URL("./vs-bonsai.html", import.meta.url), "utf8");
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /not affiliated with, endorsed by, or sponsored by Bonsai/);
  assert.match(page, /not reachable from this session to confirm/);
  // No dollar figure is ever attributed to Bonsai on this page.
  assert.doesNotMatch(page, /Bonsai[^.]{0,80}\$\d/);
});

test("vs-Bonsai page declares a canonical URL and links back to the calculator", async () => {
  const page = await readFile(new URL("./vs-bonsai.html", import.meta.url), "utf8");
  assert.match(page, /<link rel="canonical" href="\.\/vs-bonsai\.html" \/>/);
  assert.match(page, /<a href="\.\/">.*Quote Margin Check/);
});

test("the calculator, sitemap, and robots all reference the vs-Bonsai page", async () => {
  const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(index, /vs-bonsai\.html/);
  assert.match(sitemap, /vs-bonsai\.html/);
});
