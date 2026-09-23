import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("vs-spreadsheet page carries the required disclaimers and names no specific product", async () => {
  const page = await readFile(new URL("./vs-tracking-quotes-in-a-spreadsheet.html", import.meta.url), "utf8");
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /names no specific product/);
});

test("vs-spreadsheet page declares a canonical URL and links back to the calculator", async () => {
  const page = await readFile(new URL("./vs-tracking-quotes-in-a-spreadsheet.html", import.meta.url), "utf8");
  assert.match(page, /<link rel="canonical" href="\.\/vs-tracking-quotes-in-a-spreadsheet\.html" \/>/);
  assert.match(page, /<a href="\.\/">.*Quote Margin Check/);
});

test("the calculator, sitemap, and robots all reference the vs-spreadsheet page", async () => {
  const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(index, /vs-tracking-quotes-in-a-spreadsheet\.html/);
  assert.match(sitemap, /vs-tracking-quotes-in-a-spreadsheet\.html/);
});
