import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { audit } from "./analyze.mjs";

const read = (f) => readFile(new URL(f, import.meta.url), "utf8");
const index = await read("./index.html");
const guide = await read("./seo-checklist-for-a-single-page.html");

test("the entry page is a working tool wired to the shared engine", () => {
  assert.match(index, /id="html"/);
  assert.match(index, /id="run"/);
  assert.match(index, /from "\.\/analyze\.mjs"/);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /FAQPage/);
});

test("disclaimers, privacy and the no-guarantee wording are present", () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never leaves your device/i);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  assert.match(index, /not a ranking guarantee/i);
});

test("the inline example does not close its own script tag early", () => {
  const scripts = index.match(/<script type="module">[\s\S]*?<\/script>/g) || [];
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /audit_run|record\("audit_run"\)/);
});

test("the site passes its own audit with no critical or warning findings except the known ones", () => {
  for (const [name, html] of [["index", index], ["guide", guide]]) {
    const r = audit(html);
    assert.equal(r.counts.critical, 0, name);
    const ids = r.findings.map((f) => f.id).filter((id) => !["og", "twitter", "canonical-relative"].includes(id));
    assert.deepEqual(ids, [], name);
  }
});
