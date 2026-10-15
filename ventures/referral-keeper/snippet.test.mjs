import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { snippetSource } from "./snippet.mjs";

function run({ search = "", cookie = "", hrefs = [], tables = [], days } = {}) {
  const sets = [];
  const mk = (href) => ({ href, set(h) { this.href = h; } });
  const links = hrefs.map((h) => { const o = { href: h }; return o; });
  const attrs = tables.map(() => ({ a: {}, getAttribute(k) { return this.a[k] || null; }, setAttribute(k, v) { this.a[k] = v; } }));
  const doc = {
    _c: cookie, readyState: "complete",
    get cookie() { return this._c; }, set cookie(v) { sets.push(v); this._c = (this._c ? this._c + "; " : "") + v.split(";")[0]; },
    querySelectorAll: (sel) => (sel.startsWith("a[") ? links : attrs),
    addEventListener() {},
  };
  const win = { };
  const ctx = vm.createContext({ document: doc, location: { search, protocol: "https:" }, window: win, URL, URLSearchParams, decodeURIComponent, encodeURIComponent, setTimeout: () => 0 });
  vm.runInContext(snippetSource({ cookieDays: days }), ctx);
  return { sets, links, attrs, win, doc };
}

test("?ref= is stored for the configured lifetime and Stripe Payment Links get tagged", () => {
  const r = run({ search: "?ref=Ada", hrefs: ["https://buy.stripe.com/abc"], days: 30 });
  assert.equal(r.sets.length, 1);
  assert.match(r.sets[0], /rk_ref=ada; max-age=2592000; path=\/; SameSite=Lax; Secure/);
  assert.equal(r.links[0].href, "https://buy.stripe.com/abc?client_reference_id=rk_ada");
  assert.equal(r.win.referralCode(), "ada");
});

test("first touch wins: an existing referral cookie is not overwritten", () => {
  const r = run({ search: "?ref=bob", cookie: "rk_ref=ada" });
  assert.equal(r.sets.length, 0);
  assert.equal(r.win.referralCode(), "ada");
});

test("junk codes are ignored and nothing is tagged without a referral", () => {
  const r = run({ search: "?ref=<script>", hrefs: ["https://buy.stripe.com/abc"] });
  assert.equal(r.sets.length, 0);
  assert.equal(r.links[0].href, "https://buy.stripe.com/abc");
});

test("pricing tables and buy buttons get client-reference-id; existing ids are kept", () => {
  const r = run({ cookie: "rk_ref=ada", tables: [1], hrefs: ["https://buy.stripe.com/x?client_reference_id=mine"] });
  assert.equal(r.attrs[0].a["client-reference-id"], "rk_ada");
  assert.equal(r.links[0].href, "https://buy.stripe.com/x?client_reference_id=mine");
});
