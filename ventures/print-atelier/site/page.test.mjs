/**
 * Structural checks on index.html — the properties the page cannot lose
 * without breaking a promise made elsewhere: the liability disclaimer every
 * user-facing surface carries, the "no third-party script, font, CDN or
 * network call" claim `/about/` states on behalf of every tool, and the
 * local-only usage counting in `portfolio/usage/README.md`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, "index.html"), "utf8");

test("the page carries the portfolio's liability disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /accept\s+no\s+liability\s+for\s+any\s+loss\s+or\s+damage/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("the page states the no-upload privacy position where a user will see it", () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /Nothing leaves your device/);
});

test("the page discloses what it cannot check", () => {
  assert.match(html, /What this does not check/);
  for (const claim of ["Colour.", "Sharpness and noise.", "Paper, press and finish."]) {
    assert.ok(html.includes(claim), `missing limitation: ${claim}`);
  }
  assert.match(html, /Order a proof/);
});

test("nothing is loaded from a third-party origin", () => {
  const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/([^"]+)"/g)].map((m) => m[2]);
  const allowed = external.filter((url) => url.startsWith("github.com/sponsors/"));
  assert.deepEqual(external.filter((url) => !allowed.includes(url)), []);
  assert.ok(!/<link[^>]+rel="(stylesheet|preconnect)"/.test(html), "no external stylesheet or preconnect");
});

test("every script is local: no inline handlers, no remote script tags", () => {
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, []);
  assert.ok(!/\son(click|load|change|submit)=/.test(html), "no inline event handler attributes");
});

test("the inline module imports only sibling modules that exist", () => {
  const imports = [...html.matchAll(/from\s+"(\.\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(imports.length >= 2, "the page wires up its modules");
  for (const spec of imports) {
    assert.doesNotThrow(
      () => readFileSync(path.join(here, spec), "utf8"),
      `index.html imports ${spec}, which does not ship`,
    );
  }
});

test("both JSON-LD blocks are valid JSON", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(blocks.length, 2, "SoftwareApplication and FAQPage");
  const parsed = blocks.map((block) => JSON.parse(block));
  assert.equal(parsed[0]["@type"], "SoftwareApplication");
  assert.equal(parsed[0].offers.price, "0");
  assert.equal(parsed[1]["@type"], "FAQPage");
  assert.ok(parsed[1].mainEntity.length >= 4);
});

test("every FAQ marked up in JSON-LD is also visible on the page", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const faq = JSON.parse(blocks[1]);
  const visible = html.slice(html.indexOf("<h2>Questions</h2>"));
  for (const entry of faq.mainEntity) {
    const stem = entry.name.replace(/[?]$/, "").split(" ").slice(0, 4).join(" ");
    assert.ok(visible.includes(stem), `FAQ "${entry.name}" is marked up but not on the page`);
  }
});

test("usage counting is local, opt-outable, and offered in the privacy section", () => {
  assert.match(html, /id="usage-toggle"/);
  assert.match(html, /localStorage/);
  assert.match(html, /Turn off local usage counting/);
  assert.match(html, /recordEvent\("files_compared"\)/);
});

test("the page has an empty state, a busy state and an error state", () => {
  assert.match(html, /id="status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /Reading \$\{selected\.length\}/, "a busy message while files are read");
  assert.match(html, /could not read one or more files/, "a real error path");
  assert.match(html, /pick your best \$\{MAX_COMPARE_FILES\} masters/, "a message for too many files");
});

test("the results region is hidden until there is a result", () => {
  assert.match(html, /<section id="results" hidden/);
});

test("the object URL is revoked on both the load and the error path", () => {
  // A rejected decode leaks the object URL otherwise, and someone comparing
  // several batches in one sitting accumulates them.
  const reader = html.slice(html.indexOf("function readImageSize"), html.indexOf("function renderVerdict"));
  assert.equal((reader.match(/revokeObjectURL/g) ?? []).length, 2, "revoked in both onload and onerror");
});

test("the page links its licence and the optional sponsors page", () => {
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /entirely optional, the tool stays free either way/);
});

test("the page is indexable and declares a canonical", () => {
  assert.match(html, /<meta name="robots" content="index, follow"/);
  assert.match(html, /<link rel="canonical" href="\."/);
  assert.match(html, /<title>[^<]{20,}<\/title>/);
  const description = html.match(/<meta name="description" content="([^"]+)"/);
  assert.ok(description && description[1].length >= 100, "a description long enough to be a useful snippet");
});
