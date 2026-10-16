import { test } from "node:test";
import assert from "node:assert/strict";
import { render, plain, headings, safeUrl, slugify } from "./markdown.mjs";

test("raw HTML in an article never reaches the page as markup", () => {
  const { html } = render("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n# <b>x</b>\n\n- <i>y</i>\n\n> <u>z</u>");
  assert.doesNotMatch(html, /<script|<img|<b>|<i>|<u>/); assert.match(html, /&lt;script&gt;/);
});

test("only safe link and image targets survive", () => {
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "//evil.example/x", "vbscript:x", "file:///etc/passwd"]) assert.equal(safeUrl(bad), null, bad);
  for (const ok of ["https://a.com/x?y=1&z=2", "http://a.com", "mailto:a@b.co", "/a/other", "#section"]) assert.ok(safeUrl(ok), ok);
  assert.equal(safeUrl("http://a.com/i.png", { imageOnly: true }), null, "images must be https");
  assert.match(render("[x](javascript:alert(1))").html, /^<p>x\)?<\/p>$/);
  const { html } = render('[a](https://a.com/"onmouseover="x) ![i](https://a.com/i.png) ![j](http://a.com/j.png)');
  assert.doesNotMatch(html, /\sonmouseover=/, "a quote in a URL cannot open a new attribute"); assert.match(html, /<img src="https:\/\/a\.com\/i\.png" alt="i" loading="lazy">/); assert.doesNotMatch(html, /http:\/\/a\.com\/j/);
  assert.match(render("[ok](https://a.com)").html, /rel="noopener nofollow"/);
});

test("headings get unique anchors and a contents list; the article title level is reserved", () => {
  const r = render("# Intro\n## Setup\n### Step\n## Setup\n#### deep");
  assert.deepEqual(r.toc.map((t) => [t.id, t.level]), [["intro", 2], ["setup", 3], ["step", 4], ["setup-2", 3]].filter(([, l]) => l <= 3));
  assert.match(r.html, /<h2 id="intro">Intro<\/h2>/); assert.match(r.html, /<h3 id="setup">Setup<\/h3>/); assert.match(r.html, /id="setup-2"/);
  assert.doesNotMatch(r.html, /<h1/);
});

test("lists, code, emphasis and quotes render", () => {
  const { html } = render("Some **bold** and *italic* with `a<b` code.\n\n1. one\n2. two\n   more\n\n- a\n- b\n\n```js\nif (a < b) {}\n```\n\n> quoted **text**\n\n---");
  assert.match(html, /<strong>bold<\/strong>/); assert.match(html, /<em>italic<\/em>/); assert.match(html, /<code>a&lt;b<\/code>/);
  assert.match(html, /<ol><li>one<\/li><li>two more<\/li><\/ol>/); assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<pre><code>if \(a &lt; b\) \{\}<\/code><\/pre>/); assert.match(html, /<blockquote><p>quoted <strong>text<\/strong><\/p>/); assert.match(html, /<hr>/);
  assert.doesNotMatch(render("**unterminated and `code").html, /<strong>/);
});

test("plain text for search drops markup and keeps link text", () => {
  assert.equal(plain("# Title\n\nSee [the docs](https://x.com) and **this**.\n\n```\ncode\n```"), "Title See the docs and this. code");
  assert.deepEqual(headings("# A\ntext\n## B *c*\n```\n# not a heading\n```"), ["A", "B c"]);
  assert.equal(slugify("  Hello, World! "), "hello-world");
});
