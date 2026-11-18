import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
test("page carries disclaimer, privacy line, and wired controls", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Do Not Track/);
  for (const id of ["payload", "check", "load-example", "optout", "rows"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /<h1>/);
});
test("script is shipped beside the page", () => {
  assert.match(readFileSync(new URL("./stranded.py", import.meta.url), "utf8"), /Find git commits/);
});
