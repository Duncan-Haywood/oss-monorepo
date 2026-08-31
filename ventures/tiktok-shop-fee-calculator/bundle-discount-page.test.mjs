import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareBundleDiscount, bundleDiscountNote } from "./calc.mjs";

const html = readFileSync(
  new URL("./should-i-bundle-tiktok-shop-orders.html", import.meta.url),
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

const worked = () => ({
  itemPrice: 19.99,
  bundleQuantity: 2,
  bundleDiscountPct: 10,
  referralRate: 6,
  affiliateRate: 15,
  returnRate: 12,
  cogs: 5.5,
  fulfillmentCost: 4.28,
  otherPerOrder: 0.4,
  adSpend: 1.5,
  unsellableRate: 80,
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

test("every input the script reads exists in the markup", () => {
  const read = [...scriptSource.matchAll(/value\("(\w+)"\)/g)].map((m) => m[1]);
  assert.ok(read.length >= 8, `expected the form to be read, found ${read.length} fields`);
  for (const id of read) {
    assert.match(markup, new RegExp(`id="${id}"`), `script reads ${id} but no such input`);
  }
});

test("the landing copy names the mechanism and the disclaimers", () => {
  assert.match(markup, /flat per-order costs/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /id="usageOptOut"/);
  assert.match(markup, /href="\."/);
});

test("the comparison table has one row per path and shows the winner", () => {
  const table = markup.match(/<table>[\s\S]*?<\/table>/);
  assert.ok(table, "comparison table missing");
  assert.match(scriptSource, /comparison\.separateTotal/);
  assert.match(scriptSource, /comparison\.bundle\.expectedProfit/);
  assert.match(scriptSource, /winner-row/);
});

test("the FAQ numbers match the shipped arithmetic", () => {
  const comparison = compareBundleDiscount(worked());
  assert.equal(comparison.separateTotal.toFixed(2), "3.92");
  assert.equal(comparison.bundle.expectedProfit.toFixed(2), "1.62");
  assert.equal((comparison.separateTotal - comparison.bundle.expectedProfit).toFixed(2), "2.30");
  assert.equal(comparison.breakEvenDiscountPct.toFixed(1), "1.5");
  assert.equal(comparison.winner, "separate");

  const faq = html.match(/"FAQPage"[\s\S]*?<\/script>/);
  assert.ok(faq, "no FAQ block found");
  for (const figure of ["$2.30", "$1.62", "$3.92", "1.5%", "$0.40"]) {
    assert.ok(faq[0].includes(figure), `FAQ no longer states ${figure}`);
  }
  assert.match(bundleDiscountNote(comparison), /Dropping the discount to about 1.5%/);
});

test("a bundle discount deep enough to lose money is flagged, not silently shown as a win", () => {
  const comparison = compareBundleDiscount({ ...worked(), bundleDiscountPct: 10 });
  assert.equal(comparison.winner, "separate");
  assert.ok(comparison.bundleGain < 0);
});
