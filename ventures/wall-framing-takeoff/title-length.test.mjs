// Every page's <title> fits a search result (70 characters, entities decoded),
// the bar platform/ci/check_title_meta.py checks. 2026-11-24: 27 hand-written
// titles ran 71 to 104 characters; a new page must fit too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("./", import.meta.url);
const MAX = 70;
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"' };
// One pass, so a decoded "&" is never decoded again ("&amp;lt;" stays "&lt;").
const decode = (s) => s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot));/gi, (m, h, d, n) =>
  h ? String.fromCodePoint(parseInt(h, 16)) : d ? String.fromCodePoint(+d) : NAMED[n] ?? m);

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
