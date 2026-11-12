import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demandShifts } from "./demand.mjs";
import { parseShifts } from "./calc.mjs";

const page = (n) => readFileSync(new URL(`./${n}`, import.meta.url), "utf8");

test("sales page: made-up fortnight gives shifts the roster builder reads", () => {
  const html = page("shifts-from-sales.html");
  assert.ok(html.includes('from "./demand.mjs"') && html.includes("No warranty"));
  const rows = ["datetime,sales"];
  for (let i = 5; i < 19; i++) for (let h = 8; h < 18; h++) rows.push(`2026-10-${String(i).padStart(2, "0")} ${String(h).padStart(2, "0")}:00,${h === 8 || h === 12 || h === 13 ? 150 : 70}`);
  const r = demandShifts(rows.join("\n"), { splh: 60 });
  // 150/60 -> 3 heads, 70/60 -> 2 heads: 3*3 + 7*2 = 23 hours a day
  assert.equal(r.needed, 23 * 7);
  assert.ok(r.scheduled >= r.needed);
  assert.deepEqual(parseShifts(r.shiftsText).errors, []);
  assert.match(page("sitemap.xml"), /shifts-from-sales\.html/);
  assert.match(page("index.html"), /shifts-from-sales\.html/);
});

test("sales page: text with no readable sales is shown as an error, not 'Paste sales above.'", () => {
  const html = page("shifts-from-sales.html");
  assert.match(html, /!r\.rows && \$\("#csv"\)\.value\.trim\(\)/);
  const r = demandShifts("hello,world\nfoo,bar", { splh: 60 });
  assert.equal(r.rows, 0);
  assert.match(r.notes.join(" "), /No sales column/);
});

test("sales page: the backtest button runs backtestSales and counts its use locally", () => {
  const html = page("shifts-from-sales.html");
  assert.match(html, /import \{ demandShifts, backtestSales, pickHalfLife \} from "\.\/demand\.mjs"/);
  assert.match(html, /id="backtest"/);
  assert.match(html, /record\("sales_backtest_run"\)/);
  assert.match(html, /not a promise about the next one/);
});

test("sales page: the closure score is a box, on by default, passed to the backtest and to auto; auto's window reaches the plan", () => {
  const html = page("shifts-from-sales.html");
  assert.match(html, /<input type="checkbox" id="scoreclosed" checked>/);
  assert.equal((html.match(/scoreClosed: \$\("#scoreclosed"\)\.checked/g) || []).length, 2);
  assert.match(html, /o\.halfLife = autoPick\.halfLife; o\.window = autoPick\.window;/);
  assert.match(html, /the last 4 weeks only on your own file/);
});

test("sales page: a labour standard option feeds minutes per ticket, sale and item to the engine", () => {
  const html = readFileSync(new URL("./shifts-from-sales.html", import.meta.url), "utf8");
  assert.match(html, /<option value="standard">minutes of work/);
  assert.match(html, /id="std"/);
  assert.match(html, /\{ standard: \$\("#std"\)\.value, shutMin: num\("#shutmin"\) \}/);
  assert.match(html, /<label for="shutmin">Staff with the doors shut<\/label><input id="shutmin"/); // lone-worker rule
  assert.match(html, /<code>90\/after-close<\/code> is one person staying two hours/);
  assert.match(html, /record\("sales_labour_standard"\)/);
  assert.match(html, /<code>10\/hour<\/code>[^<]*<code>30\/open<\/code>[^<]*<code>45\/close<\/code>/); // fixed work is explained beside the box
  assert.match(html, /<code>20\/before-open<\/code>[^<]*<code>45\/after-close<\/code>/); // and work with the doors shut
  assert.match(html, /Minutes of work per labor hour/);
});
