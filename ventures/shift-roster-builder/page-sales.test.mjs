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
