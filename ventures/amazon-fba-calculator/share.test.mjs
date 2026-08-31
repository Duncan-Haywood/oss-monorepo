// A shared link that quietly loses a field is worse than no link at all: the
// reader lands on a page showing this calculator's defaults as if they were
// their own numbers, and prices a restock on them. Nothing goes red.
//
// That is not hypothetical. `where-to-sell-calculator`'s own share module
// shipped with a hand-maintained field allowlist that omitted `quantity` and
// `targetMargin`, so the recipient computed a different profit than the sender
// saw. `ebay-fee-calculator`'s fell behind `calc.mjs` twice for the same
// reason. So the round-trip below is driven by the calculator's own field
// list, and a separate test checks that list against the page's actual inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { decodeInputs, encodeInputs, ENUM_FIELDS } from "./share.mjs";
import { FULFILLMENT_VALUES, INPUT_FIELDS, TOGGLE_FIELDS, CATEGORY_PRESETS, STORAGE_PRESETS } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// The link carries everything, and nothing else
// ---------------------------------------------------------------------------

test("round-trips every numeric field the calculator accepts", () => {
  const scenario = Object.fromEntries(INPUT_FIELDS.map((field, index) => [field, index + 1]));
  assert.deepEqual(decodeInputs(encodeInputs(scenario)), scenario);
});

test("round-trips the checkboxes in both positions", () => {
  for (const value of [true, false]) {
    const toggles = Object.fromEntries(TOGGLE_FIELDS.map((field) => [field, value]));
    assert.deepEqual(decodeInputs(encodeInputs(toggles)), toggles);
  }
});

test("round-trips the fulfilment path, which decides which column is the answer", () => {
  for (const method of FULFILLMENT_VALUES) {
    assert.equal(decodeInputs(encodeInputs({ fulfillmentMethod: method })).fulfillmentMethod, method);
  }
});

// ---------------------------------------------------------------------------
// The list cannot drift from the page
// ---------------------------------------------------------------------------

test("every number input on the page is in INPUT_FIELDS", () => {
  // Anything the page asks for but the link cannot carry is a field a shared
  // scenario silently reverts to its default.
  const known = new Set([...INPUT_FIELDS, ...TOGGLE_FIELDS]);
  // Inputs that are page furniture rather than scenario values.
  const notScenario = new Set(["usageOptOut", "scenarioName"]);
  const missing = [];
  for (const match of html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const [tag, id] = match;
    if (notScenario.has(id) || known.has(id)) continue;
    if (/type="(number|checkbox)"/.test(tag)) missing.push(id);
  }
  assert.deepEqual(missing, [], `these inputs cannot travel in a shared link: ${missing.join(", ")}`);
});

test("every field in INPUT_FIELDS is an input the page actually has", () => {
  const absent = INPUT_FIELDS.filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(absent, [], `INPUT_FIELDS names inputs the page does not have: ${absent.join(", ")}`);
});

// ---------------------------------------------------------------------------
// A partial link is a valid link
// ---------------------------------------------------------------------------

test("a two-field handoff carries those two and claims nothing else", () => {
  // This is the shape `where-to-sell-calculator` sends: it knows the price and
  // what the seller paid, and nothing about size tiers or storage.
  const restored = decodeInputs("#salePrice=42.5&costOfGoods=11");
  assert.deepEqual(restored, { salePrice: 42.5, costOfGoods: 11 });
});

test("a blank optional field is omitted rather than pinned to zero", () => {
  // `fulfillmentFee` blank means "derive it from the size tier". Writing 0
  // would assert free fulfilment, which is a different and wrong answer.
  const query = encodeInputs({ salePrice: 20, fulfillmentFee: "", lowPriceSalePrice: null });
  assert.equal(new URLSearchParams(query).has("fulfillmentFee"), false);
  assert.equal(new URLSearchParams(query).has("lowPriceSalePrice"), false);
  assert.deepEqual(decodeInputs(query), { salePrice: 20 });
});

test("reads a query string as well as a fragment", () => {
  assert.deepEqual(decodeInputs("?salePrice=19.99"), { salePrice: 19.99 });
});

// ---------------------------------------------------------------------------
// A corrupted link shows this page's own numbers rather than nonsense
// ---------------------------------------------------------------------------

test("junk, negatives, and unknown keys are dropped, not guessed at", () => {
  const restored = decodeInputs(
    "#salePrice=abc&referralRate=-5&costOfGoods=12&somethingElse=9&weightLb=NaN",
  );
  assert.deepEqual(restored, { costOfGoods: 12 });
});

test("a checkbox spelled anything but 1 or 0 is ignored", () => {
  // Guessing would silently flip a scenario on or off for the reader.
  assert.deepEqual(decodeInputs("#lowPriceEligible=true"), {});
  assert.deepEqual(decodeInputs("#lowPriceEligible=0"), { lowPriceEligible: false });
});

test("an unknown fulfilment path is ignored rather than accepted", () => {
  assert.deepEqual(decodeInputs("#fulfillmentMethod=warehouse"), {});
});

test("empty and malformed input yields an empty object rather than throwing", () => {
  for (const value of ["", "#", "?", null, undefined, "#=&=&", "%%%"]) {
    assert.deepEqual(decodeInputs(value), {});
  }
});

// ---------------------------------------------------------------------------
// The page is wired to it
// ---------------------------------------------------------------------------

test("the page offers the link and reads one on arrival", () => {
  assert.match(html, /id="copyLink"/);
  assert.match(html, /import \{ decodeInputs, encodeInputs, ENUM_FIELDS \} from "\.\/share\.mjs"/);
  assert.match(html, /applySharedLink\(\);/);
});

test("the page says the values stay in the fragment", () => {
  // The claim in the UI has to stay true to the mechanism: a reader deciding
  // whether to paste a link into a chat is relying on it.
  assert.match(html, /Browsers never send that part to a server/);
  assert.match(html, /location\.hash = query;/);
});

test("the page imports its field list rather than keeping a second copy", () => {
  assert.match(html, /import \{ INPUT_FIELDS as ids, TOGGLE_FIELDS as toggleIds \} from "\.\/calc\.mjs"/);
  assert.doesNotMatch(html, /const ids = \[/);
});

// ---------------------------------------------------------------------------
// The two preset selects, and the rates a restore used to lose
// ---------------------------------------------------------------------------
//
// Found by driving the page in Chromium rather than by reading it: a link
// copied after changing the category came back with the placement fees reset to
// the size-tier defaults, because `applySharedLink` wrote the restored values
// without marking them hand-entered and `syncPlacementRates` then treated them
// as still automatic. The referral and storage rates travelled correctly the
// whole time; the labels above them did not, so the recipient's page read
// "Home & kitchen (15%)" over a 17% rate.

test("carries the category and storage season, so labels and rates agree", () => {
  const restored = decodeInputs(encodeInputs({ salePrice: 30, category: "jewelry", storageSeason: "peak" }));
  assert.equal(restored.category, "jewelry");
  assert.equal(restored.storageSeason, "peak");
});

test("a category the calculator has no rate for is refused", () => {
  assert.deepEqual(decodeInputs("#category=antiques&storageSeason=summer"), {});
  assert.equal(encodeInputs({ salePrice: 30, category: "antiques" }), "salePrice=30");
});

test("the option lists come from the presets rather than a copy", () => {
  assert.deepEqual([...ENUM_FIELDS.category], Object.keys(CATEGORY_PRESETS));
  assert.deepEqual([...ENUM_FIELDS.storageSeason], Object.keys(STORAGE_PRESETS));
});

test("a restored rate is marked hand-entered so a preset cannot overwrite it", () => {
  assert.ok(html.includes('if (autoFields.has(id) || placementAutoFields.has(id)) field.dataset.auto = "0";'));
});

test("the selects are assigned without dispatching, so a preset cannot fire", () => {
  const apply = html.slice(html.indexOf("function applySharedLink"), html.indexOf("function applySharedLink") + 1800);
  assert.match(apply, /document\.getElementById\(id\)\.value = shared\[id\];/);
  assert.doesNotMatch(apply, /dispatchEvent/);
});
