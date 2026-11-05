import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newDesign, applyOp } from "./design.mjs";
import { EXAMPLE_SUPPLIER } from "./suppliers.mjs";
import { economics, quantityBreaks } from "./costing.mjs";

const read = f => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const PAGES = ["index.html", "for-independent-clothing-designers.html", "how-much-does-it-cost-to-make-a-t-shirt.html", "sunglasses.html", "wardrobe.html", "fit.html", "quotes.html", "labels.html", "prices.html", "preorder.html"];

test("every page carries the no-warranty clause, a sponsor link and its own title and description", () => {
  for (const f of PAGES) {
    const html = read(f);
    assert.match(html, /No warranty\./, f);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, f);
    assert.match(html, /<title>[^<]{20,}<\/title>/, f);
    assert.match(html, /<meta name="description" content="[^"]{60,}"/, f);
    assert.match(html, /application\/ld\+json/, f);
  }
});

test("the tools' controls have labels the assistant and agents can read", () => {
  for (const page of ["index.html", "sunglasses.html", "wardrobe.html"]) {
  const html = read(page);
  const ids = [...html.matchAll(/<(?:input|select)[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
  for (const id of ids) {
    const labelled = new RegExp(`for="${id}"`).test(html) || new RegExp(`id="${id}"[^>]*aria-label=`).test(html) || new RegExp(`<label[^>]*>[^<]*<input id="${id}"`).test(html) || new RegExp(`<label[^>]*><input id="${id}"`).test(html);
    assert.ok(labelled, `${page}: ${id} has no label`);
  }
  assert.match(html, /<output id="results" aria-live="polite">/);
  }
});

test("the worked example page matches what the costing code computes", () => {
  let d = newDesign({ quantity: 100, price: 45 });
  d = applyOp(d, { op: "add", kind: "motif", motif: "halo", method: "high-density", colours: 1, w: 20 });
  d = applyOp(d, { op: "add", kind: "text", text: "AVE MARIA", area: "back", method: "screen" });
  const e = economics(d, EXAMPLE_SUPPLIER, { salesTaxPct: 20, channelFeePct: 0, paymentFeePct: 3, paymentFixed: 0.3, unsoldPct: 10, marketingBudget: 500, targetMarginPct: 60 });
  const html = read("how-much-does-it-cost-to-make-a-t-shirt.html");
  for (const v of [e.cost.landed, e.profitPerSale, e.priceForTargetMargin, e.feesPerSale]) assert.ok(html.includes(v.toFixed(2)), `missing ${v}`);
  assert.ok(html.includes(`${e.marginPct}%`));
  assert.ok(html.includes(`${e.breakEvenUnits} sales`));
  assert.ok(html.includes(e.cashUpFront.toLocaleString("en")));
  for (const q of quantityBreaks(d, EXAMPLE_SUPPLIER)) assert.ok(html.includes(q.landed.toFixed(2)), `break ${q.quantity}`);
  const pitch = read("for-independent-clothing-designers.html");
  assert.ok(pitch.includes(e.cost.landed.toFixed(2)) && pitch.includes(`${e.marginPct}%`) && pitch.includes(`${e.breakEvenUnits} sales`));
});

test("placeholder prices are called placeholders wherever they appear", () => {
  assert.match(read("how-much-does-it-cost-to-make-a-t-shirt.html"), /placeholder/);
  assert.match(read("for-independent-clothing-designers.html"), /placeholders, not quotes/);
  assert.match(read("index.html"), /placeholder numbers, not a quote/);
});

test("llms.txt and sitemap list every page", () => {
  const llms = read("llms.txt");
  const sitemap = read("sitemap.xml");
  assert.match(llms, /\d{4}-\d{2}-\d{2}/);
  for (const f of PAGES.slice(1)) {
    assert.ok(llms.includes(f), f);
    assert.ok(sitemap.includes(f), f);
  }
});

test("the studio page offers the storefront download and warns before publishing", () => {
  const html = read("index.html");
  for (const id of ["sh-brand", "sh-email", "sh-link", "sh-ship", "sh-ret", "sh-dl", "sh-add", "sh-shelf"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /import \{ storefront \} from "\.\/storefront\.mjs"/);
  assert.match(html, /we hold no keys/);
});
