// The chain-name layer (brands.mjs from OpenStreetMap's name-suggestion-index, brands-build.mjs).
// Descriptions are in the shapes real exports print (eval/brand-lines.mjs, eval/durham-pcard.mjs);
// amounts are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest, brandAccount, BRAND } from "./categorize.mjs";
import { build, CATEGORY_MAP, EXCLUDE, transitName, TRANSIT_EXCLUDE } from "./brands-build.mjs";
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

test("a chain name that is also a person's name needs a store number after it", async () => {
  const { BRAND_PERSON_NAMES } = await import("./brands.mjs");
  for (const n of ["albert", "baxter", "hampton", "michaels", "krystal", "oreilly"]) assert.ok(BRAND_PERSON_NAMES.includes(n), n);
  // People, independent firms and places that share a chain's one-word name.
  for (const desc of ["Albert", "Baxter Storey", "The Hampton Social", "Hampton Chutney", "Michael's Phone", "Alex Forbes & Son", "SANTA BARBARA Santa Barbara CA"])
    assert.notEqual(out(desc).source, "brand", desc);
  // The chain's card line, with its store number, or its longer name.
  for (const [desc, account] of [["KRYSTAL #0412 CHATTANOOGA TN", "6130"], ["MICHAELS #1234", "6100"], ["O'REILLY 1938", "6160"], ["ALBERT HEIJN 1234 AMSTERDAM", "6130"]])
    assert.equal(out(desc).account, account, desc);
  // Switched off, the bare name speaks again.
  assert.equal(out("Baxter Storey", { ...empty, skip: new Set(["brand-names"]) }).source, "brand");
});

test("the builder lists one-word mapped names that are people's names, and only those", async () => {
  const { personNames } = await import("./brands-build.mjs");
  const m = new Map([["albert", "6130"], ["albert heijn", "6130"], ["heron foods", "6130"], ["dennis", ""], ["wolseley", "6100"]]);
  assert.deepEqual(personNames(m, new Set(["albert", "dennis", "heijn"])), ["albert"]);
});

// Transit networks and operators from NSI's transit/route/* (2026-11-16, README "Public transport
// from OpenStreetMap"). Descriptions in the shapes card and bank exports print; amounts made up.
test("a fare to a transit network or operator these books have never seen is travel, for review only", () => {
  for (const desc of ["LONG ISLAND RAIL ROAD TVM", "Long Island Rail Road", "MERSEYRAIL TICKET OFFICE", "TORONTO TRANSIT COMMISSION",
    "STAGECOACH SOUTH WEST", "WASHINGTON STATE FERRIES", "BC FERRIES"]) {
    const s = out(desc);
    assert.equal(s.source, "brand", desc);
    assert.equal(s.account, "6120", desc);
    assert.ok(s.confidence < 0.85, "never auto-posts");
    assert.match(s.reason, /public transport/);
  }
  assert.equal(out("RENFREWSHIRE COUNCIL").source, "none", "a bare place used as a network name is not listed");
  assert.equal(brandAccount("NETWORK RAIL INFRASTRUCTURE"), null, "an infrastructure owner sells no fares");
  assert.equal(suggest({ desc: "MERSEYRAIL REFUND", cents: 1234 }, empty).source, "none", "money in: the layer says nothing");
});

test("transit names: a transport word is required, departments and bare places are not names", () => {
  for (const n of ["Long Island Rail Road", "Metrolink", "Flixbus", "King County Metro", "Beaumont Municipal Transit", "BC Ferries", "ScotRail"]) assert.ok(transitName(n), n);
  for (const n of ["Renfrewshire", "Isle of Wight", "SEPTA", "Maine Department of Transportation", "Nova Scotia Department of Public Works",
    "City of Santa Monica", "ar:municipal", "Ferrara", "Network Rail", "", undefined]) assert.ok(!transitName(n), String(n));
  for (const n of TRANSIT_EXCLUDE) assert.ok(!transitName(n), n);
});

test("the builder adds transit names as travel, under the chains' filters, and never re-files a chain as travel", () => {
  const nsi = { nsi: {
    "brands/amenity/restaurant": { items: [{ displayName: "Zorbo Bus Diner", tags: { name: "Zorbo Bus Diner" } }] },
    "transit/route/bus": { items: [{ tags: { network: "Zorbo Bus Diner", operator: "Quux Transit", "operator:short": "QT" } }, { tags: { network: "Plimsoll" } }] },
    "transit/route/train": { items: [{ tags: { network: "Metro", operator: "Wexford Department of Transport" } }] },
    "transit/highway/bus_stop": { items: [{ tags: { network: "Stoplight Transit" } }] },
  } };
  const m = build(nsi, new Set(["metro"]));
  assert.equal(m.get("quux transit"), "6120");
  assert.equal(m.has("zorbo bus diner"), false, "a chain's name and a network's: two kinds of place, says nothing");
  assert.equal(m.has("qt"), false, "under four letters");
  assert.equal(m.has("plimsoll"), false, "no transport word");
  assert.equal(m.has("metro"), false, "a common word");
  assert.equal(m.has("wexford department transport"), false, "a department");
  assert.equal(m.has("stoplight transit"), false, "stops are not read, only routes");
  const off = build(nsi, new Set(["metro"]), { transitRoutes: false });
  assert.equal(off.has("quux transit"), false);
  assert.equal(off.get("zorbo bus diner"), "6130", "without the transit names the restaurant chain is meals");
});

test("the shipped transit names took no suggestion away from a chain", async () => {
  // Built from the same release with and without transit/route/*: every chain name keeps its
  // account (checked when brands.mjs was rebuilt on 2026-11-16); here, the shipped list carries
  // the chains' own names next to the transit names.
  for (const [desc, account] of [["HERON FOODS BISHOP A", "6130"], ["Wolseley Uk", "6100"], ["CANDLEWOOD SUITES BRMNHM", "6120"]]) assert.equal(brandAccount(desc)?.account, account, desc);
  assert.ok(BRAND_KINDS["6120"].includes("long island rail road"));
});
