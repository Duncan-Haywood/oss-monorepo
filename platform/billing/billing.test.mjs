import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { cleanKey, verifyLicence, onSale, newClaim, fetchKey, checkKey, wireBuy } from "./client.mjs";
import { verifyPaddleSignature, signLicence, licenceForTransaction, handleBilling, claimHash, TOLERANCE_SEC } from "./server.mjs";
import { CATALOGUE, productConfig, productForPrice } from "./catalogue.mjs";
import { plan } from "./sync.mjs";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const PUB = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
const PRIV = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const other = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const OTHER_PRIV = b64u(await crypto.subtle.exportKey("pkcs8", other.privateKey));

const NOW = 1_800_000_000;
const CAT = {
  ...CATALOGUE,
  clientToken: "test_0123456789abcdef",
  publicKey: PUB,
  products: {
    "wall-framing-takeoff": { name: "Bid", billing: "subscription", priceId: "pri_01subscription00" },
    "shed-designer": { name: "Shed", billing: "one-off", priceId: "pri_01oneoff0000000" },
  },
};
const SECRET = "pdl_ntfset_test_secret";
const sign = (raw, ts = NOW) => `ts=${ts};h1=${createHmac("sha256", SECRET).update(`${ts}:${raw}`).digest("hex")}`;

function memStore() {
  const claims = new Map(), subs = new Map();
  return {
    claims, subs,
    async putClaim(h, key) { if (!claims.has(h)) claims.set(h, key); },
    async getClaim(h) { return claims.get(h) ?? null; },
    async putSub(id, key, exp) { const c = subs.get(id); if (!c || c.exp < exp) subs.set(id, { key, exp }); },
    async getSub(id) { return subs.get(id) ?? null; },
  };
}
const ENV = { PADDLE_WEBHOOK_SECRET: SECRET, LICENCE_SIGNING_KEY: PRIV };
const hook = (body, sig) => new Request("https://edge.test/billing/paddle", { method: "POST", headers: { "paddle-signature": sig ?? sign(body) }, body });
const oneOffTx = (claim, extra = {}) => ({ id: "txn_01oneoff00000000000", status: "completed", items: [{ price: { id: "pri_01oneoff0000000" } }], custom_data: { claim, product: "wall-framing-takeoff" }, ...extra });
const subTx = (claim, endsAt, id = "txn_01sub000000000000000") => ({ id, status: "completed", subscription_id: "sub_01abcdefghijklmn", items: [{ price_id: "pri_01subscription00" }], billing_period: { starts_at: "2027-01-15T00:00:00Z", ends_at: endsAt }, custom_data: claim ? { claim } : null });

test("Paddle signature: good, rotated, tampered, stale, missing, no secret", async () => {
  const raw = '{"event_type":"transaction.completed"}';
  assert.equal((await verifyPaddleSignature(sign(raw), raw, SECRET, NOW)).ok, true);
  const rotated = `ts=${NOW};h1=${createHmac("sha256", "old").update(`${NOW}:${raw}`).digest("hex")};h1=${sign(raw).split("h1=")[1]}`;
  assert.equal((await verifyPaddleSignature(rotated, raw, SECRET, NOW)).ok, true);
  assert.equal((await verifyPaddleSignature(sign(raw), raw + " ", SECRET, NOW)).reason, "signature mismatch");
  assert.match((await verifyPaddleSignature(sign(raw), raw, SECRET, NOW + TOLERANCE_SEC + 1)).reason, /tolerance/);
  assert.match((await verifyPaddleSignature("ts=abc;h1=00", raw, SECRET, NOW)).reason, /tolerance/);
  assert.match((await verifyPaddleSignature(null, raw, SECRET, NOW)).reason, /missing/);
  assert.match((await verifyPaddleSignature(sign(raw), raw, "", NOW)).reason, /no webhook secret/);
});

test("a signed key verifies offline; a wrong product, a wrong signer, tampering and expiry do not", async () => {
  const key = await signLicence({ v: 1, p: "shed-designer", t: "one-off", s: "txn_x", iat: NOW }, PRIV);
  assert.ok(cleanKey(key));
  assert.equal((await verifyLicence(key, { product: "shed-designer", publicKey: PUB })).valid, true);
  assert.equal((await verifyLicence(" " + key.slice(0, 30) + "\n" + key.slice(30), { product: "shed-designer", publicKey: PUB })).valid, true, "pasted with line breaks");
  assert.match((await verifyLicence(key, { product: "wall-framing-takeoff", publicKey: PUB })).reason, /another tool/);
  const forged = await signLicence({ v: 1, p: "shed-designer", t: "one-off", s: "txn_x", iat: NOW }, OTHER_PRIV);
  assert.equal((await verifyLicence(forged, { product: "shed-designer", publicKey: PUB })).reason, "key not recognised");
  const [pre, body, sig] = key.split(".");
  const swapped = Buffer.from(JSON.stringify({ v: 1, p: "wall-framing-takeoff", t: "one-off", s: "txn_x", iat: NOW })).toString("base64url");
  assert.equal((await verifyLicence([pre, swapped, sig].join("."), { publicKey: PUB })).valid, false);
  assert.equal((await verifyLicence([pre, body, sig].join("."), { publicKey: "" })).reason, "licence check unavailable");
  const sub = await signLicence({ v: 1, p: "wall-framing-takeoff", t: "subscription", s: "sub_x", iat: NOW, exp: NOW + 10 }, PRIV);
  assert.equal((await verifyLicence(sub, { publicKey: PUB, now: NOW })).valid, true);
  assert.match((await verifyLicence(sub, { publicKey: PUB, now: NOW + 11 })).reason, /expired/);
});

test("cleanKey refuses junk before any decoding; never throws", async () => {
  for (const k of ["", null, undefined, "abc", "ms1..", "ms2.aaaaaaaaaaaaaaaaaaaaaaa." + "a".repeat(86), "ms1.<script>.x", "ms1." + "a".repeat(30) + "." + "a".repeat(85)]) {
    assert.equal(cleanKey(k), null);
    assert.equal((await verifyLicence(k, { publicKey: PUB })).valid, false);
  }
  const rnd = "ms1." + "A".repeat(40) + "." + "B".repeat(86);
  assert.equal((await verifyLicence(rnd, { publicKey: PUB })).valid, false);
});

test("the product comes from the paid price, never from custom_data", () => {
  const claim = newClaim();
  const got = licenceForTransaction(oneOffTx(claim), CAT, NOW);
  assert.equal(got.claims.p, "shed-designer");
  assert.equal(got.claim, claim);
  assert.equal(got.claims.exp, undefined, "a one-off key never expires");
  assert.equal(got.subscription, null);
  assert.match(licenceForTransaction(oneOffTx(claim, { items: [{ price: { id: "pri_01notours0000000" } }] }), CAT, NOW).skip, /no catalogue price/);
  assert.match(licenceForTransaction(oneOffTx(claim, { status: "past_due" }), CAT, NOW).skip, /status/);
  assert.match(licenceForTransaction(oneOffTx("short"), CAT, NOW).skip, /no claim code/);
  assert.match(licenceForTransaction(null, CAT, NOW).skip, /no transaction/);
});

test("subscriptions: the key expires a grace week after the paid period; renewals carry no claim", () => {
  const got = licenceForTransaction(subTx(newClaim(), "2027-02-15T00:00:00Z"), CAT, NOW);
  assert.equal(got.claims.s, "sub_01abcdefghijklmn");
  assert.equal(got.claims.exp, Date.parse("2027-02-15T00:00:00Z") / 1000 + 7 * 86400);
  const renewal = licenceForTransaction(subTx(null, "2027-03-15T00:00:00Z"), CAT, NOW);
  assert.equal(renewal.claim, null);
  assert.equal(renewal.subscription, "sub_01abcdefghijklmn");
  assert.match(licenceForTransaction({ ...subTx(null, "x"), billing_period: null }, CAT, NOW).skip, /billing period/);
});

test("webhook to claim to unlock, end to end, with retries idempotent", async () => {
  const store = memStore();
  const claim = newClaim();
  const body = JSON.stringify({ event_type: "transaction.completed", data: oneOffTx(claim) });
  const ask = () => handleBilling(new Request("https://edge.test/billing/claim?c=" + claim), ENV, { store, catalogue: CAT, nowSec: NOW });
  assert.equal((await ask()).status, 404, "before the webhook: not yet");
  assert.equal((await handleBilling(hook(body), ENV, { store, catalogue: CAT, nowSec: NOW })).status, 200);
  const first = (await (await ask()).json()).key;
  assert.equal((await handleBilling(hook(body), ENV, { store, catalogue: CAT, nowSec: NOW + 5 })).status, 200, "Paddle's retry");
  assert.equal((await (await ask()).json()).key, first, "a retry does not replace the key");
  assert.equal((await verifyLicence(first, { product: "shed-designer", publicKey: PUB })).valid, true);
  assert.equal(store.claims.has(await claimHash(claim)), true, "stored by hash, not the claim itself");
  assert.equal([...store.claims.keys()].includes(claim), false);
});

test("webhook refusals: unsigned, unconfigured, oversized, bad JSON; other events are acknowledged", async () => {
  const store = memStore();
  const body = JSON.stringify({ event_type: "transaction.completed", data: oneOffTx(newClaim()) });
  assert.equal((await handleBilling(hook(body, "ts=1;h1=00"), ENV, { store, catalogue: CAT, nowSec: NOW })).status, 401);
  assert.equal((await handleBilling(hook(body), {}, { store, catalogue: CAT, nowSec: NOW })).status, 503);
  const big = "x".repeat(300 * 1024);
  assert.equal((await handleBilling(hook(big), ENV, { store, catalogue: CAT, nowSec: NOW })).status, 413);
  assert.equal((await handleBilling(hook("{"), ENV, { store, catalogue: CAT, nowSec: NOW })).status, 400);
  const other = JSON.stringify({ event_type: "subscription.updated", data: {} });
  const r = await handleBilling(hook(other), ENV, { store, catalogue: CAT, nowSec: NOW });
  assert.equal(r.status, 200);
  assert.equal(store.claims.size + store.subs.size, 0);
  assert.equal(await handleBilling(new Request("https://edge.test/hit"), ENV, { store }), null, "not a billing path");
  assert.equal((await handleBilling(new Request("https://edge.test/billing/claim?c=../../x"), ENV, { store })).status, 400);
});

test("a lapsed subscription key renews from the Worker; a one-off key cannot ask", async () => {
  const store = memStore();
  const claim = newClaim();
  const o = { store, catalogue: CAT, nowSec: NOW };
  await handleBilling(hook(JSON.stringify({ event_type: "transaction.completed", data: subTx(claim, "2027-02-15T00:00:00Z") })), ENV, o);
  const key1 = (await (await handleBilling(new Request("https://edge.test/billing/claim?c=" + claim), ENV, o)).json()).key;
  const renew = (key) => handleBilling(new Request("https://edge.test/billing/renew", { method: "POST", body: JSON.stringify({ key }) }), ENV, o);
  assert.equal((await renew(key1)).status, 404, "no renewal yet");
  await handleBilling(hook(JSON.stringify({ event_type: "transaction.completed", data: subTx(null, "2027-03-15T00:00:00Z", "txn_01renewal00000000000") })), ENV, o);
  const key2 = (await (await renew(key1)).json()).key;
  assert.notEqual(key2, key1);
  // An old event arriving late does not roll the subscription back.
  await handleBilling(hook(JSON.stringify({ event_type: "transaction.completed", data: subTx(null, "2027-02-15T00:00:00Z", "txn_01late0000000000000") })), ENV, o);
  assert.equal((await (await renew(key1)).json()).key, key2);

  // The page's check: key1 lapsed, so it fetches key2 once.
  const cfg = { product: "wall-framing-takeoff", publicKey: PUB, edge: "https://edge.test" };
  const fetchVia = async (url, init) => handleBilling(new Request(url, init), ENV, o);
  let renewed = "";
  const lapsed = Date.parse("2027-02-25T00:00:00Z") / 1000;
  const v = await checkKey(key1, cfg, { fetch: fetchVia, now: lapsed, onRenewed: (k) => { renewed = k; } });
  assert.equal(v.valid, true);
  assert.equal(renewed, key2);

  const oneOff = await signLicence({ v: 1, p: "shed-designer", t: "one-off", s: "txn_y", iat: NOW }, PRIV);
  assert.equal((await renew(oneOff)).status, 400);
  assert.equal((await renew("nonsense")).status, 400);
});

test("fetchKey polls until the key lands, and stops on a hard error", async () => {
  let n = 0;
  const key = await signLicence({ v: 1, p: "shed-designer", t: "one-off", s: "txn_z", iat: NOW }, PRIV);
  const f = async () => (++n < 3 ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ key }), { status: 200 }));
  assert.equal(await fetchKey("c", { edge: "https://e.test", fetch: f, waitMs: 1 }), key);
  assert.equal(n, 3);
  assert.equal(await fetchKey("c", { edge: "https://e.test", fetch: async () => new Response("", { status: 500 }), waitMs: 1 }), null);
  assert.equal(await fetchKey("c", { edge: "https://e.test", fetch: async () => { throw new Error("offline"); }, tries: 2, waitMs: 1 }), null);
});

test("dark until every public value is set and well formed", () => {
  const live = { ...productConfig("shed-designer", CAT) };
  assert.equal(onSale(live), true);
  for (const [k, bad] of [["priceId", ""], ["priceId", "price_123"], ["clientToken", "pdl_sk_secretkey123"], ["publicKey", "short"], ["edge", "http://e.test"], ["edge", "https://e.test/?k=1"], ["environment", "live"], ["product", "../x"]]) {
    assert.equal(onSale({ ...live, [k]: bad }), false, `${k}=${bad}`);
  }
  assert.equal(onSale(null), false);
  // A button for a dark pack stays hidden and gets no handler.
  const el = { hidden: true, addEventListener() { throw new Error("must not wire"); } };
  assert.equal(wireBuy(el, { ...live, priceId: "" }, { onKey() {} }), false);
  assert.equal(el.hidden, true);
});

test("the committed catalogue holds no secret, and is dark as committed or fully set", () => {
  const src = fs.readFileSync(new URL("./catalogue.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /pdl_(sk|apikey|ntfset)_|sk_live|-----BEGIN|apikey_/i, "only public values belong here");
  assert.ok(CATALOGUE.clientToken === "" || /^(live|test)_/.test(CATALOGUE.clientToken));
  assert.ok(CATALOGUE.publicKey === "" || /^[A-Za-z0-9_-]{43}$/.test(CATALOGUE.publicKey));
  for (const [slug, p] of Object.entries(CATALOGUE.products)) {
    assert.ok(["one-off", "subscription"].includes(p.billing), slug);
    assert.ok(p.priceId === "" || /^pri_/.test(p.priceId), slug);
    assert.ok(fs.existsSync(new URL(`../../ventures/${slug}/`, import.meta.url)), `ventures/${slug} exists`);
  }
  assert.equal(productForPrice("", CAT), null);
});

test("every venture's paddle.mjs and checkout.mjs match the catalogue (node platform/billing/sync.mjs)", () => {
  for (const { file, want } of plan()) assert.equal(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null, want, file);
});

test("the D1 schema has the two tables the store writes", () => {
  const sql = fs.readFileSync(new URL("../edge/schema.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS licences \(/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS licence_subs \(/);
});
