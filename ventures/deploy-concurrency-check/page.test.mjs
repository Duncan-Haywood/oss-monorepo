// What these assert is the set of promises the pages make that a code change
// can quietly break: the disclaimers, the privacy claim, the sponsor line, and
// the fact that the page ships no network call. The last one is load-bearing --
// `/about/` promises the catalogue adds no third-party script, font or beacon,
// and a single `<script src>` or `fetch()` slipped in here would make that
// promise false site-wide while every other check stayed green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = readdirSync(HERE).filter((f) => f.endsWith(".html"));
const read = (name) => readFileSync(join(HERE, name), "utf-8");

test("every page ships and is listed in the sitemap", () => {
  assert.deepEqual(
    PAGES.sort(),
    [
      "how-a-deploy-ships-an-older-commit.html",
      "index.html",
      "vs-reading-your-workflows-yourself.html",
    ],
    "a page was added or removed without updating this list",
  );
  const sitemap = read("sitemap.xml");
  for (const page of PAGES) {
    assert.ok(sitemap.includes(page), `${page} is not in sitemap.xml, so nothing enumerates it`);
  }
});

test("every page carries the no-warranty clause", () => {
  for (const page of PAGES) {
    assert.match(read(page), /no warranty/i, `${page} is missing the no-warranty clause`);
  }
});

test("the comparison page carries the not-affiliated disclaimer", () => {
  // It names GitHub, which is a real trademark, so the exemption that makes it
  // a generic-method page does not excuse the disclaimer -- it carries it too.
  const markup = read("vs-reading-your-workflows-yourself.html");
  assert.match(markup, /not affiliated with/i);
  assert.match(markup, /GitHub/);
});

test("every page states the privacy promise the catalogue makes for it", () => {
  for (const page of PAGES) {
    const markup = read(page);
    assert.match(
      markup,
      /no network request|nothing is uploaded|uploads nothing|stays in your browser/i,
      `${page} does not say what happens to what the visitor pastes`,
    );
  }
});

test("no page loads anything over the network", () => {
  // The promise above has to be true, not merely stated. A remote script, font,
  // stylesheet, image or beacon would each break it.
  for (const page of PAGES) {
    const markup = read(page);
    assert.doesNotMatch(markup, /<script[^>]+src=/i, `${page} loads a remote script`);
    assert.doesNotMatch(markup, /<link[^>]+href="https?:/i, `${page} loads a remote stylesheet`);
    assert.doesNotMatch(markup, /<img[^>]+src="https?:/i, `${page} loads a remote image`);
    assert.doesNotMatch(markup, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/i,
      `${page} makes a network call`);
    assert.doesNotMatch(markup, /@import\s+url\(/i, `${page} imports a remote stylesheet`);
  }
});

test("every page offers the optional sponsor link, and none gates a feature on it", () => {
  for (const page of PAGES) {
    const markup = read(page);
    assert.match(markup, /sponsors\/Duncan-Haywood/, `${page} has no sponsor link`);
    assert.match(
      markup,
      /optional/i,
      `${page} does not say sponsoring is optional`,
    );
  }
  // Nothing anywhere may make a feature conditional on payment.
  for (const page of PAGES) {
    assert.doesNotMatch(read(page), /\b(pro plan|upgrade to|paid tier|premium)\b/i,
      `${page} reads as if something is gated behind payment`);
  }
});

test("the tool page states its limits rather than implying a guarantee", () => {
  const markup = read("index.html");
  // Source is hard-wrapped, so these match across a line break on purpose --
  // a test that only passes while the prose happens to fit one line would go
  // red on a reflow and teach the next reader to loosen it rather than read it.
  assert.match(markup, /evidence,\s+not\s+a\s+determination/i);
  // The most dangerous thing this page could imply is that a clean report means
  // the pipeline is safe. It must say otherwise, in the page itself.
  assert.match(markup, /not\s+that\s+your\s+pipeline\s+is\s+safe/i);
});

test("the tool page's opt-out control exists and is labelled", () => {
  const markup = read("index.html");
  assert.match(markup, /id="optout"/);
  assert.match(markup, /for="optout"/);
  assert.match(markup, /setUsageOptOut/);
});

test("every form control on the tool page has an accessible name", () => {
  // 48 critical axe `label` violations shipped live in this catalogue once,
  // because nothing outside the browser sweep looked at accessible names.
  // This is the cheap half of that check, run on every commit.
  const markup = read("index.html");
  const ids = [...markup.matchAll(/<(?:textarea|input|select)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, "no form control found -- has the page changed shape?");
  for (const id of ids) {
    const labelled =
      new RegExp(`<label[^>]+for="${id}"`).test(markup) ||
      new RegExp(`<label[^>]*>\\s*<input[^>]+id="${id}"`).test(markup) ||
      new RegExp(`<[^>]+id="${id}"[^>]*aria-label=`).test(markup);
    assert.ok(labelled, `the control #${id} has no label, so a screen reader announces it unnamed`);
  }
  for (const match of markup.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)) {
    assert.ok(match[1].trim().length > 0, "a button has no text");
  }
});

test("the pages link to each other, so none is an orphan", () => {
  assert.match(read("index.html"), /how-a-deploy-ships-an-older-commit\.html/);
  assert.match(read("index.html"), /vs-reading-your-workflows-yourself\.html/);
  for (const page of PAGES.filter((p) => p !== "index.html")) {
    assert.match(read(page), /href="\.\/"/, `${page} does not link back to the tool`);
  }
});

test("the page imports the same classifier the CLI is pinned to", () => {
  // If the page ever inlined its own copy of the logic, the parity test in
  // classify.test.mjs would still pass while the page drifted from the CLI.
  assert.match(read("index.html"), /import \{ classifyWorkflow \} from "\.\/classify\.mjs"/);
});

test("the tool page escapes pasted input before rendering it", () => {
  // Everything rendered comes from the workflow the visitor pasted. Without
  // escaping, pasting a workflow containing markup would execute it.
  const markup = read("index.html");
  assert.match(markup, /function escapeHtml/);
  assert.match(markup, /escapeHtml\(f\.title\)/);
  assert.match(markup, /escapeHtml\(f\.fix\)/);
  assert.doesNotMatch(markup, /innerHTML\s*=\s*text\b/);
});
