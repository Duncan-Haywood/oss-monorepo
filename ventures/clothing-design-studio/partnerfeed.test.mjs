import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseFeed, priceCatalogue, multiBrandShopHtml, catalogueCsv } from "./partnerfeed.mjs";

const FEED = `Title,Retail,Colors,Sizes,Link,SKU
"Halo tee, washed",61,"Black|Ecru",S|M|L,https://aurea.example/halo,A1
Wool cap,36.60,Navy,,javascript:alert(1),A2
,12,,,,
Free,0,,,,`;

test("parseCsv handles quoted commas, doubled quotes, CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, ""y""",2\r\n'), [["a", "b"], ['x, "y"', "2"]]);
});

test("parseFeed maps aliases, drops bad rows and non-https links", () => {
  const f = parseFeed(FEED, "Aurea");
  assert.equal(f.ok, true);
  assert.equal(f.products.length, 2);
  assert.equal(f.products[0].name, "Halo tee, washed");
  assert.deepEqual(f.products[0].colours, ["Black", "Ecru"]);
  assert.equal(f.products[0].url, "https://aurea.example/halo");
  assert.equal(f.products[1].url, "");
  assert.equal(f.warnings.filter(w => /skipped/.test(w)).length, 2);
  assert.ok(f.warnings.some(w => /not an https/.test(w)));
});

test("parseFeed rejects missing columns, empty brand, empty body", () => {
  assert.equal(parseFeed("a,b\n1,2", "X").ok, false);
  assert.equal(parseFeed(FEED, " ").ok, false);
  assert.equal(parseFeed("name,price", "X").ok, false);
});

test("duplicate SKUs are renamed", () => {
  const f = parseFeed("sku,name,price\nA,x,10\nA,y,12", "B");
  assert.deepEqual(f.products.map(p => p.sku), ["A", "A-2"]);
});

test("payouts by hand: 61 incl 22% VAT, 20% commission, shop pays fees", () => {
  // net 50; commission 10; card fee 61*0.03+0.3 = 2.13; brand 40; shop 10-2.13 = 7.87
  const f = parseFeed("name,price\nTee,61", "Aurea");
  const c = priceCatalogue([f], { commissionPct: 20, vatPct: 22, paymentFeePct: 3, paymentFixed: 0.3, feeBearer: "shop" });
  assert.equal(c.items[0].brandPayout, 40);
  assert.equal(c.items[0].shopKeeps, 7.87);
  assert.equal(c.brands[0].avgShopKeeps, 7.87);
  assert.equal(c.warnings.length, 0);
});

test("flags a piece that pays the brand nothing and a repeated name; bad terms fail", () => {
  const f = parseFeed("name,price\nTee,0.3\nTee,30", "Aurea");
  const c = priceCatalogue([f], { commissionPct: 20, vatPct: 0, paymentFeePct: 3, paymentFixed: 0.3, feeBearer: "brand" });
  assert.ok(c.warnings.some(w => /nothing or less/.test(w)));
  assert.ok(c.warnings.some(w => /listed twice/.test(w)));
  assert.equal(priceCatalogue([f], { commissionPct: 99 }).ok, false);
});

test("shop page escapes text, has no script, lists each brand, https links only", () => {
  const f = parseFeed('name,price,link\n"<img src=x onerror=alert(1)>",10,https://b.example/x', "A&B");
  const html = multiBrandShopHtml(priceCatalogue([f], {}), { name: "<b>Shop</b>", currency: "usd" });
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("A&amp;B") && html.includes("&lt;b&gt;Shop") && html.includes("USD 10.00"));
  assert.ok(html.includes('href="https://b.example/x"'));
});

test("CSV neutralises formula cells", () => {
  const c = priceCatalogue([parseFeed("name,price\n=SUM(A1),10", "X")], {});
  assert.match(catalogueCsv(c), /'=SUM\(A1\)/);
});
