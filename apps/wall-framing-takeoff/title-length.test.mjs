// Every page's <title> fits a search result (70 characters, entities decoded),
// the bar platform/ci/check_title_meta.py checks. 2026-11-24: 27 hand-written
// titles ran 71 to 104 characters; a new page must fit too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("./", import.meta.url);
const MAX = 70;
// One pass over the string, so an entity a replacement produces is never decoded
// again ("&amp;lt;" is "&lt;", not "<"); `&amp;` is handled in the same pass, last.
const NAMED = { lt: "<", gt: ">", quot: '"', amp: "&" };
const decode = (s) => s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(lt|gt|quot|amp));/gi, (m, h, d, n) =>
  h ? String.fromCodePoint(parseInt(h, 16)) : d ? String.fromCodePoint(+d) : NAMED[n.toLowerCase()] ?? m);

test("decode turns each entity into one character and never decodes twice", () => {
  assert.equal(decode("Studs &amp; plates &#8212; &#x2014; &lt;b&gt; &quot;x&quot;"), 'Studs & plates — — <b> "x"');
  assert.equal(decode("&amp;lt;"), "&lt;");
  assert.equal(decode("&#38;amp;"), "&amp;");
});

test(`every page title is at most ${MAX} characters`, () => {
  const long = [];
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".html"))) {
    const m = readFileSync(new URL(f, DIR), "utf8").match(/<title>([^<]*)<\/title>/);
    if (!m) continue;
    const t = decode(m[1]).trim();
    if ([...t].length > MAX) long.push(`${f}: ${[...t].length} "${t}"`);
  }
  assert.deepEqual(long, []);
});
