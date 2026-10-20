import test from "node:test";
import assert from "node:assert/strict";
import { checkOne, main, notify, report } from "./watch.mjs";
import { SAMPLE_HTML } from "./extract.mjs";

const page = (price, av = "InStock") => SAMPLE_HTML.replace('"129.00"', `"${price}"`).replace("InStock", av);
const fakeFetch = (routes) => async (url) => {
  const hit = routes[url];
  if (hit === undefined) return { ok: false, status: 404, text: async () => "" };
  return { ok: true, status: 200, text: async () => hit };
};

test("checkOne reads a page, applies the target and records no state itself", async () => {
  const f = fakeFetch({ "https://s.test/robots.txt": "", "https://s.test/p": page("79.00") });
  const r = await checkOne({ url: "https://s.test/p", targetPrice: 80 }, { price: 129, availability: "in_stock" }, { fetchFn: f });
  assert.equal(r.cur.price, 79);
  assert.deepEqual(r.events.map((e) => e.type), ["price_drop", "target_hit"]);
});

test("checkOne skips robots-disallowed pages and non-http URLs, and reports HTTP errors", async () => {
  const f = fakeFetch({ "https://s.test/robots.txt": "User-agent: *\nDisallow: /p", "https://s.test/p": page("1") });
  assert.match((await checkOne({ url: "https://s.test/p" }, null, { fetchFn: f })).error, /robots/);
  assert.match((await checkOne({ url: "file:///etc/passwd" }, null, { fetchFn: f })).error, /http/);
  assert.match((await checkOne({ url: "nope" }, null, { fetchFn: f })).error, /valid URL/);
  assert.match((await checkOne({ url: "https://s.test/gone" }, null, { fetchFn: f })).error, /404/);
});

test("main: first run records state quietly, a later drop alerts through ntfy and webhooks", async () => {
  const files = { "watch.json": JSON.stringify({ items: [{ name: "Shoe", url: "https://s.test/p" }] }) };
  const sent = [];
  const mk = (price) => async (url, opts) => {
    if (opts?.method === "POST") { sent.push([url, opts.body]); return { ok: true, status: 200, text: async () => "" }; }
    return fakeFetch({ "https://s.test/p": page(price) })(url);
  };
  const io = (price) => ({ log() {}, err() {}, noDelay: true, fetchFn: mk(price), read: async (f) => { if (!(f in files)) throw new Error("missing"); return files[f]; }, write: async (f, t) => { files[f] = t; } });
  assert.equal(await main([], {}, io("129.00")), 0);
  assert.equal(JSON.parse(files["state.json"])["https://s.test/p"].price, 129);
  assert.equal(sent.length, 0);
  assert.equal(await main([], { NTFY_TOPIC: "my topic", WEBHOOK_URL: "https://hook.test/x" }, io("99.00")), 10);
  assert.equal(sent.length, 2);
  assert.match(sent[0][0], /ntfy\.sh\/my%20topic$/);
  assert.match(sent[0][1], /Price fell 129 -> 99/);
  assert.equal(JSON.parse(files["state.json"])["https://s.test/p"].price, 99);
});

test("main: --dry-run sends nothing and writes nothing; bad config exits 2", async () => {
  const files = { "watch.json": JSON.stringify([{ url: "https://s.test/p" }]), "state.json": JSON.stringify({ "https://s.test/p": { price: 200, availability: "in_stock" } }) };
  let wrote = false, posted = false;
  const io = { log() {}, err() {}, noDelay: true, read: async (f) => files[f], write: async () => { wrote = true; }, fetchFn: async (u, o) => { if (o?.method === "POST") posted = true; return fakeFetch({ "https://s.test/p": page("50") })(u); } };
  assert.equal(await main(["--dry-run"], { NTFY_TOPIC: "t" }, io), 10);
  assert.deepEqual([wrote, posted], [false, false]);
  assert.equal(await main([], {}, { ...io, read: async () => "{not json" }), 2);
  assert.equal(await main([], {}, { ...io, read: async (f) => (f === "watch.json" ? "{}" : "{}") }), 2);
});

test("report lists errors and flags in plain text", () => {
  const out = report([{ item: { name: "A", url: "u" }, error: "timed out" }, { item: { name: "B", url: "u" }, cur: { price: 5, currency: "USD", availability: "in_stock" }, events: [{ type: "price_drop", text: "Price fell" }] }]);
  assert.match(out, /A\*\*: could not check \(timed out\)/);
  assert.match(out, /USD 5, in stock — Price fell/);
});

test("notify with no channels configured sends nothing", async () => {
  assert.deepEqual(await notify("x", {}, async () => { throw new Error("no"); }), []);
});
