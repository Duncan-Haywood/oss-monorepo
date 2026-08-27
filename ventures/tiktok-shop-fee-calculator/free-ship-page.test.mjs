import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareFreeShipping, freeShippingNote } from "./calc.mjs";

const html = readFileSync(
  new URL("./should-i-offer-free-shipping-on-tiktok-shop.html", import.meta.url),
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
    ["Charge vs free shipping leftover", /compareFreeShipping/],
    ["same-customer-total affiliate trap", /affiliateOnItemOnly/],
    ["extra orders to match", /extraOrdersForRaised/],
    ["expected profit after returns", /expectedProfit/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the script never uses ${rendered}`);
  }
});

test("the landing copy names the affiliate-on-item trap and the disclaimer", () => {
  assert.match(markup, /creators are paid on the item/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /id="usageOptOut"/);
  assert.match(markup, /href="\."/);
});

test("the comparison table headers match the rendered row template", () => {
  const table = markup.match(/<table>[\s\S]*?<\/table>/);
  assert.ok(table, "comparison table missing");
  const headers = [...table[0].matchAll(/<th\b/g)];
  assert.equal(headers.length, 5, `expected 5 headers, found ${headers.length} in ${table[0]}`);
  assert.match(scriptSource, /path\.result\.referralFee/);
  assert.match(scriptSource, /path\.result\.affiliateFee/);
  assert.match(scriptSource, /path\.result\.expectedProfit/);
});

test("the FAQ numbers match the shipped comparison", () => {
  const comparison = compareFreeShipping({
    itemPrice: 19.99,
    shippingCharged: 4.99,
    referralRate: 6,
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
  assert.equal(comparison.referralTie, true);
  assert.ok(comparison.absorbRaisesAffiliate > 0);
  assert.ok(comparison.charged.result.expectedProfit > comparison.absorb.result.expectedProfit);
  assert.match(freeShippingNote(comparison), /item price only/);
  assert.match(html, /\$19\.99/);
  assert.match(html, /\$4\.99/);
  assert.match(html, /15%/);
});
