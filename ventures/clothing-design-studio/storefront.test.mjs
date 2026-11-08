import test from "node:test";
import assert from "node:assert/strict";
import { storefront, safeHttps } from "./storefront.mjs";
import { newDesign, applyOp } from "./design.mjs";

const tee = (name = "Halo Tee", price = 45) => applyOp(newDesign({ quantity: 100, price, name }), { op: "add", kind: "motif", motif: "halo", method: "screen", colours: 1 });
const terms = { brand: "North Atelier", email: "shop@example.com", shipping: "Ships from Lisbon, 5 to 8 working days, EUR 6 in the EU.", returns: "14 days to return unworn." };

test("safeHttps accepts https only", () => {
  assert.ok(safeHttps("https://buy.stripe.com/abc"));
  assert.equal(safeHttps("javascript:alert(1)"), null);
  assert.equal(safeHttps("http://example.com"), null);
  assert.equal(safeHttps("not a url"), null);
});

test("email checkout by default: no payment link means a mailto with the size", () => {
  const { html, warnings, products } = storefront([tee()], terms);
  assert.deepEqual(warnings, []);
  assert.equal(products[0].checkout, "email");
  assert.match(html, /href="mailto:shop@example\.com\?subject=Pre-order%3A%20Halo%20Tee/);
  assert.match(html, /size%20S/);
  assert.match(html, /€45\.00/);
  assert.ok(!/https:\/\/buy\./.test(html));
});

test("a payment link becomes the Buy button; unsafe links are dropped with a warning", () => {
  const ok = storefront([tee()], { ...terms, paymentLinks: { "halo-tee": "https://buy.stripe.com/test_123" } });
  assert.equal(ok.products[0].checkout, "payment-link");
  assert.match(ok.html, /href="https:\/\/buy\.stripe\.com\/test_123"/);
  const bad = storefront([tee()], { ...terms, paymentLinks: { "halo-tee": "javascript:alert(1)" } });
  assert.ok(!/javascript:/.test(bad.html));
  assert.equal(bad.products[0].checkout, "email");
  assert.ok(bad.warnings.some(w => /https/.test(w)));
});

test("names and brand are escaped, JSON-LD cannot close its script", () => {
  const evil = tee('<img src=x onerror=alert(1)></script>');
  const { html } = storefront([evil], { ...terms, brand: '"><script>alert(2)</script>' });
  assert.ok(!/<img src=x/.test(html));
  assert.ok(!/<script>alert/.test(html));
  const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
  JSON.parse(ld);
});

test("missing terms are flagged, never invented", () => {
  const { html, warnings } = storefront([tee()], { brand: "X" });
  assert.ok(warnings.some(w => /shipping/i.test(w)));
  assert.ok(warnings.some(w => /returns/i.test(w)));
  assert.ok(warnings.some(w => /no way to order/.test(w)));
  assert.ok(!/<h3>Shipping/.test(html));
  assert.match(html, /Ordering is not set up yet/);
});

test("structured data carries price, currency and pre-order availability", () => {
  const { html } = storefront([tee("A", 30), tee("B", 55)], { ...terms, currency: "GBP" });
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@graph"].length, 2);
  assert.equal(ld["@graph"][1].offers.price, "55.00");
  assert.equal(ld["@graph"][1].offers.priceCurrency, "GBP");
  assert.match(ld["@graph"][0].offers.availability, /PreOrder/);
  assert.match(html, /£30\.00/);
});

test("duplicate names are flagged and a back print shows both sides", () => {
  let d = applyOp(tee(), { op: "add", kind: "text", text: "AVE", area: "back", method: "screen" });
  const r = storefront([d, tee()], terms);
  assert.ok(r.warnings.some(w => /share the name/.test(w)));
  assert.equal((r.html.match(/<svg /g) || []).length >= 3, true);
});

test("email shops get a basket that totals and builds one order mail; payment-link shops get a cart, not an email basket", () => {
  const withBasket = storefront([tee("A", 30), tee("B", 55)], terms).html;
  assert.equal((withBasket.match(/data-add="/g) || []).length, 2);
  assert.match(withBasket, /id="basket"/);
  assert.match(withBasket, /mailto:/);
  const linked = storefront([tee()], { ...terms, email: "", paymentLinks: { "halo-tee": "https://buy.stripe.com/x" } }).html;
  assert.ok(!/data-add=/.test(linked) && !/id="basket"/.test(linked));
  assert.match(linked, /id="cart"/);
  assert.match(linked, /data-cart="halo-tee"[^>]*data-link="https:\/\/buy\.stripe\.com\/x"/);
  assert.ok(!/id="cart"/.test(withBasket), "email-only shop has no cart");
  // the inline script must parse
  const scripts = [...withBasket.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  for (const sc of scripts) new Function(sc);
});

test("the basket script adds, merges lines by size, totals and removes (DOM stub)", () => {
  const html = storefront([tee("A", 30)], terms).html;
  const sc = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).pop();
  const els = {};
  const mk = () => ({ children: [], hidden: true, href: "", textContent: "", listeners: {}, attrs: {},
    addEventListener(t, f) { this.listeners[t] = f; }, appendChild(c) { this.children.push(c); },
    getAttribute(k) { return this.attrs[k]; }, querySelector(q) { return q === "ul" ? (this._ul ??= Object.defineProperty(mk(), "textContent", { set(v) { this.children = []; }, get() { return ""; } })) : null; } });
  const basket = mk(), total = mk(), send = mk(), add = mk();
  Object.assign(add.attrs, { "data-add": "a", "data-name": "A", "data-price": "30.00" });
  const doc = {
    getElementById: id => ({ basket, "basket-total": total, "basket-send": send })[id],
    createElement: () => mk(),
    querySelectorAll: q => (q === "[data-add]" ? [add] : []),
    querySelector: () => ({ value: "M" }),
  };
  new Function("document", sc)(doc);
  add.listeners.click(); add.listeners.click();
  assert.equal(basket.hidden, false);
  assert.equal(total.textContent, "€60.00");
  assert.match(send.href, /^mailto:shop@example\.com\?subject=Pre-order%3A%201%20item/);
  assert.match(decodeURIComponent(send.href), /2 x A, size M/);
  assert.equal(basket._ul.children.length, 1);
  basket._ul.children[0].children[0].listeners.click();
  assert.equal(basket.hidden, true);
});
