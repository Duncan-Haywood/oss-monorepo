import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FEE_SCHEDULE_PRESETS, feeChangeImpact, feeChangeNote } from "./calc.mjs";

const html = readFileSync(
  new URL("./what-will-the-tiktok-shop-fee-change-cost-me.html", import.meta.url),
  "utf8",
);

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");

const shipped = () => ({
  itemPrice: 19.99,
  shippingCharged: 4.99,
  affiliateRate: 15,
  affiliateOnItemOnly: true,
  returnRate: 12,
  cogs: 5.5,
  fulfillmentCost: 4.28,
  otherPerOrder: 0.4,
  adSpend: 1.5,
  unsellableRate: 80,
  unitsPerDay: 8,
});

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the first paint does not count a bounce as usage", () => {
  assert.match(scriptSource, /\bpaint\(\);/);
  assert.doesNotMatch(
    scriptSource,
    /count\([^)]+\);\s*paint\(\);?\s*$/,
    "the initial paint() must not sit behind a count()",
  );
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  const claims = [
    ["Cost per order and per month", /extraCostPerMonth/],
    ["organic vs affiliate split", /impact\.organic/],
    ["price that holds your margin", /priceToHoldMargin/],
    ["max buy cost after the change", /maxBuyCostAfter/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(
      scriptSource,
      rendered,
      `featureList advertises "${claim}" but the script never uses ${rendered}`,
    );
  }
});

test("the landing copy names the facilitation split and the disclaimers", () => {
  assert.match(markup, /facilitation lands on affiliate-sourced orders/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /id="usageOptOut"/);
  assert.match(markup, /href="\."/);
});

test("the page says the announced rates are not a guarantee", () => {
  // The whole page is built on an announcement. Presenting it as settled fact
  // would be the one materially misleading thing this tool could do.
  assert.match(markup, /not a guarantee they ship unchanged/);
});

test("the comparison table headers match the rendered row template", () => {
  const table = markup.match(/<table>[\s\S]*?<\/table>/);
  assert.ok(table, "comparison table missing");
  const headers = [...table[0].matchAll(/<th\b/g)];
  assert.equal(headers.length, 4, `expected 4 headers, found ${headers.length}`);
  assert.match(scriptSource, /split\.before\.expectedProfit/);
  assert.match(scriptSource, /split\.after\.expectedProfit/);
  assert.match(scriptSource, /split\.extraCostPerOrder/);
});

test("both schedule pickers are filled from the shipped presets", () => {
  assert.match(markup, /id="fromId"/);
  assert.match(markup, /id="toId"/);
  assert.match(scriptSource, /FEE_SCHEDULE_PRESETS/);
  assert.match(scriptSource, /el\("fromId"\)\.value = "us_standard"/);
  assert.match(scriptSource, /el\("toId"\)\.value = "oct_2026"/);
  assert.ok(FEE_SCHEDULE_PRESETS.us_standard && FEE_SCHEDULE_PRESETS.oct_2026);
});

test("every input the script reads exists in the markup", () => {
  const read = [...scriptSource.matchAll(/value\("(\w+)"\)/g)].map((m) => m[1]);
  assert.ok(read.length >= 10, `expected the form to be read, found ${read.length} fields`);
  for (const id of read) {
    assert.match(markup, new RegExp(`id="${id}"`), `script reads ${id} but no such input`);
  }
});

test("the FAQ numbers match the shipped arithmetic", () => {
  const impact = feeChangeImpact(shipped());

  // $0.78 affiliate / $0.45 organic / ~$190 a month / $21.94 / $11.73 -> $10.93
  assert.equal(impact.affiliate.extraCostPerOrder.toFixed(2), "0.78");
  assert.equal(impact.organic.extraCostPerOrder.toFixed(2), "0.45");
  assert.ok(Math.abs(impact.extraCostPerMonth - 190) < 1, `monthly was ${impact.extraCostPerMonth}`);
  assert.equal(impact.priceToHoldMargin.toFixed(2), "21.94");
  assert.equal(impact.heldMargin.toFixed(1), "27.7");
  assert.equal(impact.maxBuyCostBefore.toFixed(2), "11.73");
  assert.equal(impact.maxBuyCostAfter.toFixed(2), "10.93");

  const faq = html.match(/"FAQPage"[\s\S]*?<\/script>/);
  assert.ok(faq, "no FAQ block found");
  for (const figure of ["$0.78", "$0.45", "$190", "$21.94", "27.7%", "$11.73", "$10.93"]) {
    assert.ok(faq[0].includes(figure), `FAQ no longer states ${figure}`);
  }

  // The form ships the inputs those figures came from.
  for (const value of ['value="19.99"', 'value="4.99"', 'value="15"', 'value="8"']) {
    assert.ok(markup.includes(value), `the worked example no longer ships ${value}`);
  }
  assert.match(feeChangeNote(impact), /holds your 27\.7% margin/);
});
