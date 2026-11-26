import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cleanKey, verifyLicence, onSale, newClaim, fetchKey, checkKey, wireBuy } from "./client.mjs";
import { verifyPaddleSignature, signLicence, licenceForTransaction, handleBilling, claimHash, d1Store, TOLERANCE_SEC } from "./server.mjs";
import worker from "./worker.mjs";
import { CATALOGUE, productConfig, productForPrice } from "./catalogue.mjs";
import { plan, checkoutSource } from "./sync.mjs";

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
  edge: "https://billing.example",
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

test("red-team 2026-11-25 (server.mjs): a forged signature is refused, the window is 300 s, only transaction.completed mints", async () => {
  // A mismatch returning ok:true, a wider window and `||` turned to `&&` on the
  // event check each passed the suite before these lines.
  const raw = '{"event_type":"transaction.completed"}';
  const forged = `ts=${NOW};h1=${createHmac("sha256", "not-the-secret").update(`${NOW}:${raw}`).digest("hex")}`;
  assert.deepEqual(await verifyPaddleSignature(forged, raw, SECRET, NOW), { ok: false, reason: "signature mismatch" });
  assert.equal((await verifyPaddleSignature(sign(raw), raw + " ", SECRET, NOW)).ok, false, "tampered body");
  assert.equal(TOLERANCE_SEC, 300, "Paddle's replay window is five minutes");
  assert.equal((await verifyPaddleSignature(sign(raw, NOW - 300), raw, SECRET, NOW)).ok, true);
  assert.equal((await verifyPaddleSignature(sign(raw, NOW - 301), raw, SECRET, NOW)).ok, false);
  assert.equal((await verifyPaddleSignature(sign(raw, NOW + 301), raw, SECRET, NOW)).ok, false);

  const store = memStore();
  const o = { store, catalogue: CAT, nowSec: NOW };
  const claim = newClaim();
  const body = JSON.stringify({ event_type: "transaction.completed", data: oneOffTx(claim) });
  const wrong = `ts=${NOW};h1=${createHmac("sha256", "not-the-secret").update(`${NOW}:${body}`).digest("hex")}`;
  assert.equal((await handleBilling(hook(body, wrong), ENV, o)).status, 401, "fresh timestamp, wrong secret");
  assert.equal(store.claims.size, 0, "a forged webhook mints nothing");
  // Paddle also sends transaction.paid (and .updated) with the same data shape:
  // acknowledged, never a second key.
  for (const event_type of ["transaction.paid", "transaction.updated"]) {
    const r = await handleBilling(hook(JSON.stringify({ event_type, data: oneOffTx(claim) })), ENV, o);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ignored, event_type);
  }
  assert.equal(store.claims.size + store.subs.size, 0);
  assert.equal((await handleBilling(hook("null"), ENV, o)).status, 200, "a JSON null body is acknowledged, not a 500");
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

test("red-team 2026-11-25: a missing key never unlocks, the claim URL is exact, polls wait between tries", async () => {
  const [pre, body, sig] = (await signLicence({ v: 1, p: "shed-designer", t: "one-off", s: "txn_z", iat: NOW }, PRIV)).split(".");
  for (const publicKey of ["", undefined, "short", PUB + "x"]) {
    const v = await verifyLicence([pre, body, sig].join("."), { product: "shed-designer", publicKey });
    assert.deepEqual([v.valid, v.reason], [false, "licence check unavailable"], String(publicKey));
  }
  const urls = [];
  const f = async (u) => { urls.push(u); return new Response("{}", { status: 404 }); };
  const t0 = Date.now();
  assert.equal(await fetchKey("a+b/c", { edge: "https://e.test/", fetch: f, tries: 2, waitMs: 60 }), null);
  assert.ok(Date.now() - t0 >= 50, "waits between the two tries");
  assert.deepEqual(urls, ["https://e.test/billing/claim?c=a%2Bb%2Fc", "https://e.test/billing/claim?c=a%2Bb%2Fc"]);
  const live = { ...productConfig("shed-designer", CAT) };
  assert.equal(onSale({ ...live, product: "ab" }), true, "a two-letter slug is a slug");
  assert.equal(onSale({ ...live, product: "a" }), false);
  assert.equal(onSale({ ...live, clientToken: ["live", "2345678923"].join("_") }), true, "any digits in a client token");
  assert.equal(onSale(undefined), false);
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

// The sync's command line is what a run actually types after editing client.mjs or
// the catalogue. It ran untested: 6 of 6 seeded faults in it (a write that skips stale
// files, --check that always fails or never does, a wrong exit code) passed this suite
// (red-team 2026-11-26). This runs a copy in a scratch tree so the real ventures are
// never written.
test("sync.mjs on the command line: --check reports stale copies and writes nothing; a plain run writes them; both then agree", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "billing-sync-"));
  try {
    const bin = path.join(tmp, "platform", "billing");
    fs.mkdirSync(bin, { recursive: true });
    for (const f of ["sync.mjs", "catalogue.mjs", "client.mjs"]) fs.copyFileSync(new URL(`./${f}`, import.meta.url), path.join(bin, f));
    const slugs = Object.keys(CATALOGUE.products);
    for (const slug of slugs) fs.mkdirSync(path.join(tmp, "ventures", slug), { recursive: true });
    const run = (...args) => spawnSync(process.execPath, [path.join(bin, "sync.mjs"), ...args], { cwd: tmp, encoding: "utf8" });
    const files = slugs.flatMap((s) => [`ventures/${s}/paddle.mjs`, `ventures/${s}/checkout.mjs`]);
    const client = fs.readFileSync(new URL("./client.mjs", import.meta.url), "utf8");

    let r = run("--check");
    assert.equal(r.status, 1, "--check on a stale tree fails");
    assert.match(r.stderr, /^out of date \(run node platform\/billing\/sync\.mjs\):\n {2}/);
    for (const f of files) assert.ok(r.stderr.includes("\n  " + f), f + " listed");
    for (const f of files) assert.equal(fs.existsSync(path.join(tmp, f)), false, "--check wrote " + f);

    r = run();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "wrote:\n  " + files.join("\n  ") + "\n");
    for (const s of slugs) {
      assert.equal(fs.readFileSync(path.join(tmp, "ventures", s, "paddle.mjs"), "utf8"), client, s);
      assert.equal(fs.readFileSync(path.join(tmp, "ventures", s, "checkout.mjs"), "utf8"), checkoutSource(s), s);
    }

    r = run();
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "nothing to write\n");
    r = run("--check");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "billing copies in sync\n");

    // One stale copy: --check names just that file, and the write mends just that file.
    fs.writeFileSync(path.join(tmp, files[0]), "// hand-edited\n");
    r = run("--check");
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "out of date (run node platform/billing/sync.mjs):\n  " + files[0] + "\n");
    r = run();
    assert.equal(r.stdout, "wrote:\n  " + files[0] + "\n");
    assert.equal(fs.readFileSync(path.join(tmp, files[0]), "utf8"), client);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// plan() covers only catalogue products, so a pack dropped from the catalogue (or a copy
// pasted by hand into another venture) would keep a paddle.mjs no check compares with
// client.mjs and a checkout.mjs with stale prices.
test("only catalogue products carry a paddle.mjs or checkout.mjs", () => {
  const ventures = new URL("../../ventures/", import.meta.url);
  const stray = [];
  for (const d of fs.readdirSync(ventures, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name in CATALOGUE.products) continue;
    for (const f of ["paddle.mjs", "checkout.mjs"]) {
      if (fs.existsSync(new URL(`${d.name}/${f}`, ventures))) stray.push(`ventures/${d.name}/${f}`);
    }
  }
  assert.deepEqual(stray, [], "add the product to platform/billing/catalogue.mjs, or delete the copy");
});

test("the billing store runs against its real schema (node:sqlite standing in for D1)", async (t) => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); } catch { t.skip("node:sqlite not available"); return; }
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  // The slice of D1's API the store uses, with ?N placeholders as D1 takes them.
  const d1 = { prepare(sql) { return { bind(...a) { const s = db.prepare(sql); return { run: async () => s.run(...a), first: async () => s.get(...a) ?? null }; } }; } };
  const store = d1Store(d1);
  await store.putClaim("h1", "key-a", "shed-designer");
  await store.putClaim("h1", "key-b", "shed-designer");
  assert.equal(await store.getClaim("h1"), "key-a", "first key kept on a webhook retry");
  assert.equal(await store.getClaim("h2"), null);
  await store.putSub("sub_1", "k1", 100);
  await store.putSub("sub_1", "k2", 200);
  await store.putSub("sub_1", "k0", 50);
  assert.deepEqual(await store.getSub("sub_1"), { key: "k2", exp: 200 });
  assert.equal(await store.getSub("sub_2"), null);
});

test("the billing Worker: 503 until its secrets are set, CORS on reads, preflight allows the renew POST", async () => {
  const env = { DB: null, ALLOWED_ORIGIN: "https://marisstella.app" };
  const hookRes = await worker.fetch(new Request("https://b.test/billing/paddle", { method: "POST", body: "{}" }), env);
  assert.equal(hookRes.status, 503);
  const bad = await worker.fetch(new Request("https://b.test/billing/claim?c=nope", { headers: { origin: "https://marisstella.app" } }), env);
  assert.equal(bad.status, 400);
  assert.equal(bad.headers.get("access-control-allow-origin"), "https://marisstella.app");
  const pre = await worker.fetch(new Request("https://b.test/billing/renew", { method: "OPTIONS", headers: { origin: "https://marisstella.app" } }), env);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-methods"), /POST/);
  assert.equal((await worker.fetch(new Request("https://b.test/"), env)).status, 404);
});

test("the billing secrets stay out of the public site: the edge Worker does not mount /billing and nothing in Actions deploys this Worker", () => {
  const edge = fs.readFileSync(new URL("../edge/worker.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(edge, /\/billing\/|\.\.\/billing|PADDLE_WEBHOOK_SECRET|LICENCE_SIGNING_KEY/);
  const wf = new URL("../../.github/workflows/", import.meta.url);
  for (const f of fs.readdirSync(wf)) {
    assert.doesNotMatch(fs.readFileSync(new URL(f, wf), "utf8"), /platform\/billing\/worker|LICENCE_SIGNING_KEY|PADDLE_WEBHOOK_SECRET/, f);
  }
  assert.equal(fs.existsSync(new URL("./wrangler.toml", import.meta.url)), false, "only the example template lives here");
});
