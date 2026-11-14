// node --test site/picks-page.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRows, byLength, renderPage, renderModule, findings, shortVerdict, SITE, SLUG, KINDS } from "../scripts/build-picks-page.mjs";
import { PICKS_MEASURED, picksGuide } from "./picks-measured.mjs";
import { allPairs, sortBound, runOne } from "../scripts/picks-needed.mjs";
import { suggestedMax } from "./rank-core.mjs";

const table = byLength(loadRows());

test("the answer page and the ranker's table are the current output of scripts/build-picks-page.mjs", () => {
  assert.equal(readFileSync(join(SITE, `${SLUG}.html`), "utf8"), renderPage(table));
  assert.equal(readFileSync(join(SITE, "picks-measured.mjs"), "utf8"), renderModule(table));
});

test("every measured list length has all three kinds of person, and the baselines are the formulas", () => {
  assert.ok(table.length >= 8, `${table.length} lengths`);
  for (const r of table) {
    assert.equal(r.allPairs, allPairs(r.n));
    assert.equal(r.sortBound, sortBound(r.n));
    assert.equal(r.cap, suggestedMax(r.n));
    for (const k of KINDS) assert.ok(r[k.key].min <= r[k.key].mean && r[k.key].mean <= r[k.key].max && r[k.key].max <= r.cap, `${r.n} ${k.key}`);
  }
  assert.equal(sortBound(8), 16); // log2(40320) = 15.3
  assert.equal(allPairs(60), 1770);
});

test("picksGuide gives the measured means at measured lengths and stays between neighbours elsewhere", () => {
  for (const [n, clear, ordinary, close] of PICKS_MEASURED) assert.deepEqual(picksGuide(n), { clear, ordinary, close });
  const a = PICKS_MEASURED[3], b = PICKS_MEASURED[4];
  const mid = picksGuide(Math.floor((a[0] + b[0]) / 2));
  if (b[0] - a[0] > 1) assert.ok(mid.ordinary >= Math.min(a[2], b[2]) && mid.ordinary <= Math.max(a[2], b[2]));
  assert.ok(picksGuide(3).clear >= 1);
  const last = PICKS_MEASURED.at(-1);
  assert.deepEqual(picksGuide(last[0] + 100), picksGuide(last[0]), "past the longest measured list it holds the last row");
});

test("the short-list verdict follows the numbers rather than a fixed sentence", () => {
  const mk = (ranker, once) => ({ ordinary: { spearman: ranker, onceSpearman: once } });
  assert.match(shortVerdict([mk(0.98, 0.9)]), /buy a better order/);
  assert.match(shortVerdict([mk(0.9, 0.98)]), /more accurate as well as shorter/);
  assert.match(shortVerdict([mk(0.95, 0.945)]), /fine shortcut/);
});

test("the page carries the disclaimer, canonical URL, usage counter, FAQ data and a description search engines show whole", () => {
  const html = renderPage(table);
  assert.match(html, /<strong>Disclaimer\.<\/strong>/);
  assert.match(html, /simulated respondents, not a study of real people/);
  assert.match(html, new RegExp(`rel="canonical" href="https://marisstella.app/quick-pick-survey/${SLUG}.html"`));
  assert.match(html, /import \{ record \} from "\.\/usage\.mjs"/);
  assert.match(html, /"@type":"FAQPage"/);
  const d = /<meta name="description" content="([^"]*)"/.exec(html)[1];
  assert.ok(d.length <= 220, `description ${d.length} chars`);
  const F = findings(table);
  assert.ok(F.mid.ordinary.mean < F.mid.allPairs, "the headline claim (adaptive beats every pair at the middle length) holds in the data");
});

test("the simulation is the page's loop: a never-wrong person on 6 options ends with the true order", () => {
  const r = runOne(6, 100, 7);
  assert.equal(r.rho, 1);
  assert.ok(r.picks < suggestedMax(6) && !r.atCap);
});
