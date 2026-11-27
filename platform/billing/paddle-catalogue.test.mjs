import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CATALOGUE } from "./catalogue.mjs";
import { PRICES } from "./prices.mjs";
import { TAG, API, wanted, plan, priceBody, withPriceIds, escapeRegExp, sync, client, keyMatches, describe } from "./paddle-catalogue.mjs";

const CAT = {
  ...CATALOGUE,
  products: {
    "shed-designer": { name: "Branded shed build pack", billing: "one-off", priceId: "" },
    "wall-framing-takeoff": { name: "Branded bid package", billing: "subscription", priceId: "" },
    "ai-bookkeeper": { name: "Branded close pack", billing: "one-off", priceId: "" },
  },
};
const P = {
  "shed-designer": { cents: 1500, currency: "USD", interval: null, basis: "t" },
  "wall-framing-takeoff": { cents: 7900, currency: "USD", interval: "year", basis: "t" },
  "ai-bookkeeper": { cents: null, currency: "USD", interval: null, basis: "t" },
};
const ours = (product, extra = {}) => ({ catalogue: TAG, product, ...extra });

test("every catalogue product has a price row whose billing kind matches, inside its models.yaml band", () => {
  const { wants, skips } = wanted(CATALOGUE, PRICES);
  for (const slug of Object.keys(CATALOGUE.products)) assert.ok(Object.hasOwn(PRICES, slug), `${slug} has no row in prices.mjs`);
  assert.ok(wants.length >= 6);
  assert.deepEqual(skips.map((s) => s.slug), ["ai-bookkeeper"], "only the unpriced pack is skipped");
  for (const p of Object.values(PRICES)) assert.ok(p.basis.length > 10, "every price says where it came from");
});

test("wanted refuses prices that must never reach Paddle", () => {
  const bad = (slug, over) => () => wanted({ ...CAT, products: { [slug]: CAT.products[slug] } }, { [slug]: { ...P[slug], ...over } });
  assert.throws(bad("shed-designer", { cents: 15.5 }), /whole number/);
  assert.throws(bad("shed-designer", { cents: 10 }), /whole number/);
  assert.throws(bad("shed-designer", { currency: "GBP" }), /USD or EUR/);
  assert.throws(bad("shed-designer", { interval: "month" }), /interval/);
  assert.throws(bad("shed-designer", { interval: "year" }), /says one-off, prices.mjs says subscription/);
  assert.throws(() => wanted({ ...CAT, products: { "Bad Slug": { name: "x", billing: "one-off", priceId: "" } } }, {}), /bad product slug/);
});

test("plan: an empty Paddle account gets one product per priced pack, and nothing for the unpriced one", () => {
  const { wants } = wanted(CAT, P);
  const a = plan(wants, [], []);
  assert.deepEqual(a.map((x) => [x.kind, x.slug]), [["create-product", "shed-designer"], ["create-product", "wall-framing-takeoff"]]);
  assert.deepEqual(a[0].body.custom_data, { catalogue: TAG, product: "shed-designer" });
});

test("plan: matching prices are kept, a changed amount makes a new price and archives the old, others' items are never touched", () => {
  const { wants } = wanted(CAT, P);
  const products = [
    { id: "pro_shed", name: "Branded shed build pack", status: "active", custom_data: ours("shed-designer") },
    { id: "pro_wft", name: "Old name", status: "active", custom_data: ours("wall-framing-takeoff") },
    { id: "pro_other", name: "Branded shed build pack", status: "active", custom_data: { app: "grants", product: "shed-designer" } },
  ];
  const prices = [
    { id: "pri_shed1", product_id: "pro_shed", status: "active", unit_price: { amount: "1500", currency_code: "USD" }, billing_cycle: null, custom_data: ours("shed-designer") },
    { id: "pri_wftold", product_id: "pro_wft", status: "active", unit_price: { amount: "4900", currency_code: "USD" }, billing_cycle: { interval: "year", frequency: 1 }, custom_data: ours("wall-framing-takeoff") },
    { id: "pri_other", product_id: "pro_other", status: "active", unit_price: { amount: "1", currency_code: "USD" }, billing_cycle: null, custom_data: { app: "grants" } },
  ];
  const a = plan(wants, products, prices);
  assert.deepEqual(a.map((x) => [x.kind, x.slug, x.priceId || x.productId || ""]), [
    ["keep-price", "shed-designer", "pri_shed1"],
    ["rename-product", "wall-framing-takeoff", "pro_wft"],
    ["create-price", "wall-framing-takeoff", ""],
    ["archive-price", "wall-framing-takeoff", "pri_wftold"],
  ]);
  // a one-off price that grew a billing cycle is not a match
  const cyc = plan(wants.slice(0, 1), products, [{ ...prices[0], billing_cycle: { interval: "year", frequency: 1 } }]);
  assert.deepEqual(cyc.map((x) => x.kind), ["create-price", "archive-price"]);
});

test("priceBody: one-off has no billing cycle, yearly has one, quantity is exactly one, tagged for the sync", () => {
  const [shed, wft] = wanted(CAT, P).wants;
  const one = priceBody(shed, "pro_1");
  assert.equal("billing_cycle" in one, false);
  assert.deepEqual(one.unit_price, { amount: "1500", currency_code: "USD" });
  assert.deepEqual(one.quantity, { minimum: 1, maximum: 1 });
  assert.match(one.description, /USD 15\.00 one-off/);
  assert.equal(one.custom_data.catalogue, TAG);
  assert.deepEqual(priceBody(wft, "pro_2").billing_cycle, { interval: "year", frequency: 1 });
});

test("withPriceIds writes only that product's priceId, and reports a product it cannot find", () => {
  const src = fs.readFileSync(new URL("./catalogue.mjs", import.meta.url), "utf8");
  const id = "pri_01h0000000000000000000000a";
  const { source, missing } = withPriceIds(src, { "shed-designer": id, "not-there": "pri_01h0000000000000000000000b" });
  assert.deepEqual(missing, ["not-there"]);
  const changed = source.split("\n").filter((l, i) => l !== src.split("\n")[i]);
  assert.equal(changed.length, 1);
  assert.match(changed[0], /"shed-designer":.*priceId: "pri_01h0000000000000000000000a"/);
  assert.throws(() => withPriceIds(src, { "shed-designer": 'x" + evil + "' }), /not a Paddle price id/);
});

test("withPriceIds treats a slug literally, backslashes and metacharacters included", () => {
  for (const slug of ["a\\b", "a.b", "a-b", "(x)", "a\\", "[q]", "a|b"]) assert.ok(new RegExp(`^${escapeRegExp(slug)}$`).test(slug), slug);
  const src = '  "a.b": { priceId: "" },\n  "axb": { priceId: "" },\n  "c\\\\d": { priceId: "" },\n';
  const id = "pri_01h0000000000000000000000a";
  assert.deepEqual(withPriceIds(src, { "a.b": id }).source.split("\n").slice(0, 2), [`  "a.b": { priceId: "${id}" },`, '  "axb": { priceId: "" },']);
  assert.deepEqual(withPriceIds(src, { "c\\d": id }).missing, ["c\\d"]);
  assert.doesNotThrow(() => withPriceIds(src, { "a\\": id }));
});

/** A fake Paddle that records calls and keeps state. */
function fakePaddle() {
  const state = { products: [], prices: [], calls: [] };
  let n = 0;
  const f = async (url, init) => {
    const u = new URL(url), method = init.method;
    state.calls.push(`${method} ${u.pathname}`);
    assert.match(init.headers.Authorization, /^Bearer k_sdbx_test$/);
    const ok = (data, extra = {}) => ({ ok: true, status: 200, json: async () => ({ data, ...extra }) });
    if (method === "GET" && u.pathname === "/products") return ok(state.products, { meta: { pagination: { has_more: false } } });
    if (method === "GET" && u.pathname === "/prices") return ok(state.prices, { meta: { pagination: { has_more: false } } });
    const body = JSON.parse(init.body);
    if (method === "POST" && u.pathname === "/products") { const p = { id: `pro_${++n}`, status: "active", ...body }; state.products.push(p); return ok(p); }
    if (method === "POST" && u.pathname === "/prices") { const p = { id: `pri_${String(++n).padStart(26, "0")}`, status: "active", billing_cycle: null, ...body }; state.prices.push(p); return ok(p); }
    if (method === "PATCH" && u.pathname.startsWith("/prices/")) { const p = state.prices.find((x) => x.id === u.pathname.slice(8)); Object.assign(p, body); return ok(p); }
    return { ok: false, status: 404, json: async () => ({ error: { code: "not_found" } }) };
  };
  return { state, f };
}

test("sync: dry run changes nothing; apply creates products then prices, and a second apply is a no-op", async () => {
  const { state, f } = fakePaddle();
  const c = client("k_sdbx_test", "sandbox", f);
  const log = [];
  const dry = await sync(c, { apply: false, cat: CAT, prices: P, log: (s) => log.push(s) });
  assert.deepEqual(dry.ids, {});
  assert.ok(state.calls.every((x) => x.startsWith("GET ")), "a dry run only reads");
  assert.match(log.join("\n"), /would shed-designer: create product/);
  const first = await sync(c, { apply: true, cat: CAT, prices: P, log: () => {} });
  assert.equal(state.products.length, 2);
  assert.equal(state.prices.length, 2);
  assert.deepEqual(Object.keys(first.ids).sort(), ["shed-designer", "wall-framing-takeoff"]);
  const before = state.calls.length;
  const again = await sync(c, { apply: true, cat: CAT, prices: P, log: () => {} });
  assert.deepEqual(again.ids, first.ids, "same ids on a re-run");
  assert.ok(state.calls.slice(before).every((x) => x.startsWith("GET ")), "nothing created twice");
  // a price change: new price, old archived, id moves
  const raised = await sync(c, { apply: true, cat: CAT, prices: { ...P, "shed-designer": { ...P["shed-designer"], cents: 1900 } }, log: () => {} });
  assert.notEqual(raised.ids["shed-designer"], first.ids["shed-designer"]);
  assert.equal(state.prices.find((p) => p.id === first.ids["shed-designer"]).status, "archived");
});

test("client: errors name the call, never the key, and pagination never leaves the Paddle API", async () => {
  const leak = client("k_sdbx_test", "sandbox", async () => ({ ok: false, status: 403, json: async () => ({ error: { detail: "forbidden" } }) }));
  await assert.rejects(leak.products(), (e) => /Paddle GET \/products answered 403: forbidden/.test(e.message) && !e.message.includes("k_sdbx_test"));
  const offsite = client("k_sdbx_test", "sandbox", async () => ({ ok: true, status: 200, json: async () => ({ data: [], meta: { pagination: { has_more: true, next: "https://evil.example/products" } } }) }));
  await assert.rejects(offsite.products(), /refusing to follow a link off the Paddle API/);
  assert.equal(API.sandbox, "https://sandbox-api.paddle.com");
  assert.throws(() => client("k", /** @type {any} */ ("staging")), /unknown environment/);
});

test("keyMatches refuses a key for the other environment", () => {
  assert.equal(keyMatches("pdl_live_apikey_x", "sandbox"), false);
  assert.equal(keyMatches("pdl_sdbx_apikey_x", "production"), false);
  assert.equal(keyMatches("pdl_sdbx_apikey_x", "sandbox"), true);
  assert.equal(keyMatches("0123abcd", "production"), true);
});

test("describe covers every action kind", () => {
  for (const a of [{ kind: "skip", slug: "s", reason: "r" }, { kind: "keep-price", slug: "s", priceId: "p" }, { kind: "archive-price", slug: "s", priceId: "p", reason: "r" }]) assert.match(describe(/** @type {any} */ (a)), /^s: /);
});

test("the owner runs this, never a workflow: nothing in Actions names the script", () => {
  // The paid apps' deploys read their own Paddle key secrets (priv-paddle-key-check.yml); this script is
  // the packs' path, which keeps the owner's key on the owner's machine (README, "Where the billing Worker runs").
  const wf = new URL("../../.github/workflows/", import.meta.url);
  for (const f of fs.readdirSync(wf)) assert.doesNotMatch(fs.readFileSync(new URL(f, wf), "utf8"), /platform\/billing\/paddle-catalogue/, f);
  assert.doesNotMatch(fs.readFileSync(new URL("./paddle-catalogue.mjs", import.meta.url), "utf8"), /\bpdl_(live|sdbx)_apikey_[A-Za-z0-9]{10,}/);
});
