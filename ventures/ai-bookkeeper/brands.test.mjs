// The chain-name layer (brands.mjs from OpenStreetMap's name-suggestion-index, brands-build.mjs).
// Descriptions are in the shapes real exports print (eval/brand-lines.mjs, eval/durham-pcard.mjs);
// amounts are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest, brandAccount, BRAND } from "./categorize.mjs";
import { build, CATEGORY_MAP, EXCLUDE } from "./brands-build.mjs";
import { BRAND_KINDS, BRANDS_VERSION } from "./brands.mjs";

const empty = { rules: [], codes: null };
const out = (desc, model = empty) => suggest({ desc, cents: -1234 }, model);

test("a chain these books have never seen gets its kind of place, for review only", () => {
  for (const [desc, account] of [["HERON FOODS BISHOP A", "6130"], ["Wolseley Uk", "6100"], ["CUBESMART 0441", "6080"],
    ["PURCHASE AUTHORIZED ON 08/14 10304D CAVA CLIFT 256-666-0036", "6130"], ["O'REILLY 1938", "6160"], ["CANDLEWOOD SUITES BRMNHM", "6120"]]) {
    const s = out(desc);
    assert.equal(s.source, "brand", desc);
    assert.equal(s.account, account, desc);
    assert.ok(s.confidence < 0.85, "never auto-posts");
    assert.match(s.reason, /OpenStreetMap/);
  }
});

test("money in, an unknown name, a person and a switched-off layer say nothing", () => {
  assert.equal(suggest({ desc: "HERON FOODS REFUND", cents: 500 }, empty).source === "brand", false);
  assert.equal(out("JOHN SMITH").source, "none");
  assert.equal(brandAccount("JOHN DEERE FINANCIAL"), null, "a chain's finance arm is a loan");
  assert.equal(out("HERON FOODS", { ...empty, skip: new Set(["brand"]) }).source === "brand", false);
});

test("a chart without the account gets nothing from the layer", () => {
  const s = out("HERON FOODS", { ...empty, codes: new Set(["6100"]) });
  assert.notEqual(s.source, "brand");
});

test("the keywords' own exceptions stand: Iceland Travel is not the grocer, the grocer's website is", () => {
  assert.equal(out("Iceland Travel").account, null);
  assert.equal(out("WWW.ICELAND.CO.UK").account, "6130");
});

test("the hand-written keywords still win where they speak", () => {
  assert.equal(out("TESCO STORES 3221").source, "built-in");
  assert.equal(out("AUTOZONE #123").source, "built-in");
});

test("the longest listed name wins, and an unmapped longer name blocks a mapped shorter one", () => {
  const nsi = { nsi: {
    "brands/amenity/fuel": { items: [{ displayName: "Zorbo", tags: { name: "Zorbo" } }] },
    "brands/shop/alcohol": { items: [{ displayName: "Zorbo Wine", tags: { name: "Zorbo Wine" } }] },
    "brands/shop/clothes": { items: [{ displayName: "Quuxly", tags: { name: "Quuxly" } }] },
    "brands/shop/supermarket": { items: [{ displayName: "Access", tags: { name: "Access" } }, { displayName: "Halfords", tags: {} }, { displayName: "Bim", tags: {} }] },
    "brands/amenity/restaurant": { items: [{ displayName: "Plonk", matchNames: ["plonk grill"] }] },
    "brands/shop/convenience": { items: [{ displayName: "Plonk" }] },
  } };
  const m = build(nsi, new Set(["access"]));
  assert.equal(m.get("zorbo"), "6160");
  assert.equal(m.get("zorbo wine"), "", "kept to block the fuel brand");
  assert.equal(m.has("quuxly"), false, "unmapped and blocks nothing: dropped");
  assert.equal(m.has("access"), false, "a common word");
  assert.equal(m.has("halfords"), false, "measured and dropped from the keywords");
  assert.equal(m.has("bim"), false, "under four letters");
  assert.equal(m.get("plonk"), "6130", "two kinds of place, one account");
  assert.equal(m.get("plonk grill"), "6130");
});

test("the shipped list: built from a pinned release, every account in the default chart, no excluded name", () => {
  assert.match(BRANDS_VERSION, /^\d+\.\d+\.\d+$/);
  const accounts = new Set(Object.values(CATEGORY_MAP));
  for (const a of Object.keys(BRAND_KINDS)) assert.ok(a === "" || accounts.has(a), a);
  const all = Object.values(BRAND_KINDS).flat();
  assert.ok(all.length > 5000);
  for (const n of all) assert.ok(!EXCLUDE.has(n.split(" ")[0]), n);
  assert.equal(brandAccount("Halfords 123"), null);
  assert.equal(BRAND.version, BRANDS_VERSION);
});
