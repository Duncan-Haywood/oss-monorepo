// Structural tests for index.html. calc.test.mjs never looks at the page, so
// a promo table that advertises five columns and emits four cells would stay
// green. Same class of defect as where-to-sell-calculator/page.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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
const promoRow = scriptSource.match(/<tr><td>\$\{row\.label\}[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the promo row template exists", () => {
  assert.ok(promoRow, "could not find the promo <tr> template in update()");
});

test("promo table columns match the row template", () => {
  const headerBlock = markup.match(/<tbody id="promos"><\/tbody>/);
  assert.ok(headerBlock, "promos tbody missing");
  const promoTable = markup.match(
    /<h2>Same order, four checkout offers<\/h2>[\s\S]*?<thead>[\s\S]*?<\/thead>/,
  );
  assert.ok(promoTable, "promo table thead missing");
  const headers = [...promoTable[0].matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  const cells = (promoRow[0].match(/<t[hd][\s>]/g) || []).length;
  assert.deepEqual(headers, ["Offer", "Revenue", "Fees", "Profit", "vs list"]);
  assert.equal(cells, headers.length, `row emits ${cells} cells for ${headers.length} columns`);
});

test("advertised promo comparison is actually computed and rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList");
  assert.match(featureList[1], /free-shipping promo comparison/i);
  assert.match(scriptSource, /comparePromos/);
  assert.match(scriptSource, /promoComparisonSummary/);
  assert.match(scriptSource, /promos_compared/);
  assert.match(markup, /id="percentOff"/);
  assert.match(markup, /id="amountOff"/);
});
