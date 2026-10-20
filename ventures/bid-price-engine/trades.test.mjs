import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { listTrades, renderModule, CATEGORIES } from "./build-trades.mjs";
import { TRADES } from "./trades.mjs";

test("trades.mjs is current and every bid calculator has a category", () => {
  const trades = listTrades();
  assert.deepEqual(trades.filter((t) => !t.category).map((t) => t.slug), []);
  assert.equal(readFileSync(new URL("./trades.mjs", import.meta.url), "utf8"), renderModule(trades), "run `node build-trades.mjs`");
});

test("every trade links to a real specialist calculator and a known category", () => {
  assert.ok(TRADES.length >= 100);
  for (const t of TRADES) {
    assert.ok(CATEGORIES[t.category], t.slug);
    assert.ok(existsSync(new URL(`../${t.calculator}/index.html`, import.meta.url)), t.calculator);
  }
});

test("category defaults are sane planning inputs", () => {
  for (const c of Object.values(CATEGORIES)) {
    assert.ok(c.marginPct > 0 && c.marginPct < 60 && c.burdenPct >= 0 && c.overheadPct >= 0 && c.contingencyPct >= 0);
    assert.doesNotThrow(() => import("./calc.mjs").then((m) => m.parseLabor(c.laborHint)));
  }
});
