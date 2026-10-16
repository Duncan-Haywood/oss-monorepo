import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("page carries disclaimer, no-warranty, privacy and opt-out", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, procurement or business advice/i);
  assert.match(html, /Do Not Track/);
  assert.match(html, /id="usageOptOut"/);
  assert.match(html, /Not affiliated with the U\.S\. government/);
});

test("untrusted API text is never written with innerHTML", () => {
  const script = html.slice(html.indexOf('<script type="module">'));
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write/);
});

test("page imports only modules that exist", () => {
  for (const m of ["calc.mjs", "usage.mjs"]) assert.match(html, new RegExp(`./${m.replace(".", "\\.")}`));
  readFileSync(new URL("./calc.mjs", import.meta.url));
});

test("JSON-LD blocks parse", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 2);
  for (const b of blocks) JSON.parse(b[1]);
});

test("form inputs have bounds", () => {
  for (const id of ["window", "lead", "minvalue"]) assert.match(html, new RegExp(`id="${id}"[^>]*min=`));
});
