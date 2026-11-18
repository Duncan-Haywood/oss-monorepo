import test from "node:test";
import assert from "node:assert/strict";
import { addToShelf, removeFromShelf, shelfToShop, loadShelf, MAX_SHELF } from "./shelf.mjs";
import { storefront } from "./storefront.mjs";
import { newDesign, sanitizeDesign } from "./design.mjs";

const d = (name, price = 40) => newDesign({ name, price, quantity: 100 });

test("adding the same name replaces; different names accumulate", () => {
  let s = addToShelf([], d("Halo Tee")).shelf;
  s = addToShelf(s, d("Saint Hoodie")).shelf;
  const r = addToShelf(s, d("halo tee", 55), "https://pay.example/halo");
  assert.equal(r.replaced, true);
  assert.equal(r.shelf.length, 2);
  assert.equal(r.shelf[0].design.price, 55);
});

test("add does not mutate and copies the design", () => {
  const des = d("A"); const s0 = [];
  const { shelf } = addToShelf(s0, des);
  des.price = 999;
  assert.equal(s0.length, 0);
  assert.notEqual(shelf[0].design.price, 999);
});

test("the shelf is capped", () => {
  let s = [];
  for (let i = 0; i < MAX_SHELF; i++) s = addToShelf(s, d("D" + i)).shelf;
  const r = addToShelf(s, d("one more"));
  assert.equal(r.full, true);
  assert.equal(r.shelf.length, MAX_SHELF);
});

test("remove is case-insensitive", () => {
  const s = addToShelf(addToShelf([], d("A")).shelf, d("B")).shelf;
  assert.deepEqual(removeFromShelf(s, "a").map(e => e.design.name), ["B"]);
});

test("a shelf makes one multi-product shop with a link per product", () => {
  let s = addToShelf([], d("Halo Tee"), "https://buy.example/halo").shelf;
  s = addToShelf(s, d("Saint Hoodie")).shelf;
  const { designs, paymentLinks } = shelfToShop(s);
  const r = storefront(designs, { brand: "N", email: "a@b.co", shipping: "x", returns: "y", paymentLinks });
  assert.deepEqual(r.products.map(p => p.checkout), ["payment-link", "email"]);
  assert.equal((r.html.match(/<article class="card"/g) || []).length, 2);
});

test("loadShelf drops junk and keeps good entries", () => {
  const good = { design: d("Ok"), link: "https://x.example" };
  const out = loadShelf([good, null, { design: 5 }, "x"], sanitizeDesign);
  assert.equal(out.length, 1);
  assert.equal(out[0].design.name, "Ok");
  assert.deepEqual(loadShelf("nope", sanitizeDesign), []);
});
