// node --test site/picks-page.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRows, byLength, topByCell, topFindings, renderPage, renderModule, findings, shortVerdict, SITE, SLUG, KINDS, TOP_DATA } from "../scripts/build-picks-page.mjs";
import { PICKS_MEASURED, picksGuide, TOP_MEASURED, topPicksGuide } from "./picks-measured.mjs";
import { allPairs, sortBound, runOne } from "../scripts/picks-needed.mjs";
import { suggestedMax } from "./rank-core.mjs";

const table = byLength(loadRows());
const topRows = loadRows(TOP_DATA);
const top = topByCell(topRows);

test("the answer page and the ranker's table are the current output of scripts/build-picks-page.mjs", () => {
  assert.equal(readFileSync(join(SITE, `${SLUG}.html`), "utf8"), renderPage(table, top));
  assert.equal(readFileSync(join(SITE, "picks-measured.mjs"), "utf8"), renderModule(table, top));
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
  for (const [n, clear, ordinary, close] of PICKS_MEASURED) assert.deepEqual(picksGuide(n), { at: n, clear, ordinary, close });
  const a = PICKS_MEASURED[3], b = PICKS_MEASURED[4];
  const mid = picksGuide(Math.floor((a[0] + b[0]) / 2));
  if (b[0] - a[0] > 1) assert.ok(mid.ordinary >= Math.min(a[2], b[2]) && mid.ordinary <= Math.max(a[2], b[2]));
  assert.ok(picksGuide(3).clear >= 1);
  const last = PICKS_MEASURED.at(-1);
  assert.deepEqual(picksGuide(last[0] + 10), picksGuide(last[0]), "past the longest measured list it returns that row, at its own length");
  assert.equal(picksGuide(last[0] + 10).at, last[0]);
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

test("the shortlist rows are the sweep's full-order and shortlist-mode arms, every cell with all three kinds of person", () => {
  assert.equal(top.length, 8, "10, 15, 20, 30 options x top 3 and top 5");
  for (const r of top) for (const k of KINDS) for (const arm of ["order", "top"]) {
    const x = r[k.key][arm];
    assert.ok(x.picks >= 1 && x.picks <= r.cap && x.exact >= 0 && x.exact <= x.runs && x.atCap <= x.runs, `${r.n}/${r.k} ${k.key} ${arm}`);
  }
  // Cross-check one cell against the raw rows: 20 options, top 3, ordinary, shortlist mode is the "boundary" arm.
  const raw = topRows.find((x) => x.n === 20 && x.k === 3 && x.spread === 6 && x.arm === "boundary");
  const cell = top.find((r) => r.n === 20 && r.k === 3).ordinary.top;
  assert.equal(cell.picks, Math.round(raw.picksMean));
  assert.equal(cell.exact, raw.setRight);
  const live = topRows.find((x) => x.n === 20 && x.k === 3 && x.spread === 6 && x.arm === "live");
  if (live && Math.round(live.picksMean) !== cell.picks) assert.notEqual(cell.picks, Math.round(live.picksMean), "the ablation arms are not mixed in");
});

test("the shortlist findings follow the rows: the shortlist mode gets more ordinary long-list shortlists right", () => {
  const T = topFindings(top);
  assert.ok(T.longOrdinary.top.exact > T.longOrdinary.order.exact, "the claim the page leads with holds in the data");
  assert.equal(T.longOrdinary.runs, 96);
  const html = renderPage(table, top);
  assert.match(html, new RegExp(`right ${Math.round((100 * T.longOrdinary.top.exact) / 96)}% of the time`));
  assert.match(html, /How many comparisons does it take to find the top 3 of 20\?/);
  assert.doesNotMatch(renderPage(table, []), /Only need a shortlist/, "no rows, no section");
});

test("topPicksGuide gives the measured means at measured cells, the nearest measured k, and holds outside the measured lengths", () => {
  for (const [n, k, clear, ordinary, close] of TOP_MEASURED) assert.deepEqual(topPicksGuide(n, k), { at: n, k, clear, ordinary, close });
  assert.equal(topPicksGuide(20, 2).k, 3);
  assert.equal(topPicksGuide(20, 4).k, 5, "a tie goes to the larger k");
  assert.equal(topPicksGuide(20, 9).k, 5);
  const lo = topPicksGuide(6, 3), hi = topPicksGuide(60, 3);
  assert.equal(lo.at, 10); assert.equal(hi.at, 30);
  assert.deepEqual({ ...lo }, { ...topPicksGuide(10, 3) });
  const mid = topPicksGuide(25, 3), a = topPicksGuide(20, 3), b = topPicksGuide(30, 3);
  assert.equal(mid.at, 25);
  assert.ok(mid.ordinary > a.ordinary && mid.ordinary < b.ordinary);
});
