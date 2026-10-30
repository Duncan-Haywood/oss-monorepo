import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const html = read("index.html");
const study = JSON.parse(read("results/study.json"));

test("disclaimer, privacy, not-a-fund and sponsor link are on the page", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not investment, financial, legal or tax advice/);
  assert.match(html, /never uploaded/);
  assert.match(html, /Can I run a fund with it\?/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with, or endorsed by, Robinhood/);
});

test("JSON-LD parses and every FAQ question is visible", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
  assert.ok(!/AggregateRating|"Review"/.test(html), "no ratings or reviews we cannot back");
});

// Every headline number on the page must be the one the study produced, so a
// rerun that changes the results fails here until the page is updated.
test("headline numbers match results/study.json", () => {
  const f2 = (x) => x.toFixed(2).replace(/^-/, "−");  // the page uses a true minus sign
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  const e10 = study.equity10.agent, e49 = study.equity49.agent, c = study.crypto.agent;
  const expect = [
    `Sharpe ${f2(e10.holdout.sharpe)} vs ${f2(e10.holdout_equal_weight.sharpe)}`,
    `−${pct(-e10.holdout.max_drawdown)} against −${pct(-e10.holdout_equal_weight.max_drawdown)}`,
    `Overfitting probability ${f2(e10.pbo.pbo)}`,
    `Sharpe ${f2(e49.holdout.sharpe)} vs ${f2(e49.holdout_equal_weight.sharpe)}`,
    `Alpha ${(100 * e49.holdout_vs_equal_weight.alpha_annual).toFixed(1)}%/yr`,
    `t = ${f2(e49.holdout_vs_equal_weight.alpha_t)}`,
    `Deflated Sharpe was ${e49.deflated_sharpe.dsr.toFixed(3)}`,
    `Sharpe ${f2(c.in_sample.sharpe)} → ${f2(c.holdout.sharpe)}`,
    `Overfitting probability ${f2(c.pbo.pbo)} flagged`,
    `best of ${e10.n_trials} rules`,
  ];
  for (const s of expect) assert.ok(html.includes(s), `page should say: ${s}`);
  for (const a of [e10, e49, c]) assert.equal(a.gate.promotable, false, "page says nothing was promoted");
  assert.equal(study.crypto.cost_sweep_holdout["sma_trend(lookback=200)"]["50"].toFixed(2), "0.70");
  assert.ok(html.includes("Sharpe of 0.70 at 50 bps"));
});

test("the page sends nothing anywhere but its own results file", () => {
  const fetches = [...html.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['"results/study.json"']);
});
