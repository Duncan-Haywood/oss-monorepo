import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./index.html", import.meta.url), "utf8");

test("offers portable Markdown review actions", () => {
  assert.match(page, /id="copy-markdown"/);
  assert.match(page, /id="download-markdown"/);
  assert.match(page, /# Quote Margin Review/);
  assert.match(page, /markdown_copied/);
  assert.match(page, /markdown_downloaded/);
});

test("Markdown review includes inputs, arithmetic, and scenarios", () => {
  for (const heading of ["Supplied inputs", "Derived arithmetic", "Pre-send observations", "Time-overrun scenarios"]) {
    assert.match(page, new RegExp(`## ${heading}`));
  }
  assert.match(page, /quote-margin-review\.md/);
});
