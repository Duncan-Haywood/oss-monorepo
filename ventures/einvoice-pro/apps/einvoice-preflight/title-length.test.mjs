// Every page's <title> fits a search result (70 characters, entities decoded),
// the bar platform/ci/check_title_meta.py checks. Hand-written country guides
// ran 70 to 130 before 2026-11-23; a new guide must fit too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("./", import.meta.url);
const MAX = 70;
// One pass over every reference, so `&amp;lt;` reads as the four characters `&lt;`, as a browser shows it.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"' };
const decode = (s) => s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot));/gi, (m, h, d, n) =>
  h ? String.fromCodePoint(parseInt(h, 16)) : d ? String.fromCodePoint(+d) : NAMED[n.toLowerCase()] ?? m);

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

test("each country guide's title still names its country first", () => {
  for (const f of readdirSync(DIR).filter((n) => n.endsWith("-e-invoice-mandate.html"))) {
    const t = decode(readFileSync(new URL(f, DIR), "utf8").match(/<title>([^<]*)/)[1]);
    assert.ok(!/^(E-invoic|What|How|Free)/.test(t), `${f}: "${t}"`);
  }
});
