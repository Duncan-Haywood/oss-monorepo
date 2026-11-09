import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newDesign, applyOp } from "./design.mjs";
import { EXAMPLE_SUPPLIER } from "./suppliers.mjs";
import { economics, quantityBreaks } from "./costing.mjs";

const read = f => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const PAGES = ["index.html", "for-independent-clothing-designers.html", "how-much-does-it-cost-to-make-a-t-shirt.html", "sunglasses.html", "wardrobe.html", "fit.html", "quotes.html", "labels.html", "prices.html", "preorder.html", "duty.html", "import-duty-on-clothing.html", "clothing-minimum-order-quantity.html", "sunglasses-profit-margin.html", "wholesale.html", "reorder.html", "orderlines.html", "returns.html", "cashflow.html", "tna.html", "salestax.html", "eutax.html", "discount.html", "bundle.html", "spec.html", "timeline.html", "tiers.html", "startup.html", "testing.html", "launch.html", "adspend.html", "colour.html"];

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

test("the import-duty guide matches what duty.mjs computes", async () => {
  const { compareDestinations, landedByDestination } = await import("./duty.mjs");
  const i = { product: "tee-cotton", quantity: 500, factoryPrice: 5, freightTotal: 600, insuranceTotal: 0 };
  const html = read("import-duty-on-clothing.html");
  for (const r of compareDestinations(i)) {
    assert.ok(html.includes(r.landedPerGarment.toFixed(2)), `landed ${r.destination}`);
    assert.ok(html.includes(r.duty.toFixed(2)), `duty ${r.destination}`);
    assert.ok(html.includes(r.customsValue.toLocaleString("en", { minimumFractionDigits: 2 })), `value ${r.destination}`);
  }
  const eu = compareDestinations(i)[1];
  assert.ok(html.includes(eu.importVat.toFixed(2)));
  const bd = landedByDestination({ ...i, destination: "EU", origin: "Bangladesh", haveOriginProof: true });
  assert.ok(html.includes(bd.landedPerGarment.toFixed(2)));
  assert.match(html, /placeholders and unchecked defaults/);
  assert.match(html, /No warranty/);
});

test("the MOQ guide matches what preorder.mjs computes", async () => {
  const { planPreorder } = await import("./preorder.mjs");
  const base = { price: 35, landed: 12, moq: 300, taxPct: 20, conversionPct: 2, days: 30, fixedCosts: 800 };
  const html = read("clothing-minimum-order-quantity.html");
  const money = v => Math.abs(v).toLocaleString("en");
  const paid = planPreorder({ ...base, cpc: 0.4, visitorsPerDay: 150 });
  const free = planPreorder({ ...base, cpc: 0, visitorsPerDay: 150 });
  const fast = planPreorder({ ...base, cpc: 0, visitorsPerDay: 400 });
  assert.ok(html.includes(`${paid.ordersNeeded} orders`));
  assert.ok(html.includes(paid.visitorsNeeded.toLocaleString("en")));
  assert.ok(html.includes(`day ${paid.dayReached}`) && html.includes(`day ${fast.dayReached}`));
  assert.ok(paid.profitIfFunded < 0 && html.includes(`-${money(paid.profitIfFunded)}`));
  assert.ok(html.includes(money(paid.lossIfFails)));
  assert.ok(html.includes(money(free.profitIfFunded)) && html.includes(money(free.lossIfFails)));
  assert.ok(html.includes(paid.breakEvenPrice.toFixed(2)));
  assert.ok(html.includes(money(paid.adCost)));
  assert.equal(fast.pFunded < 0.001, true);
  assert.match(html, /an assumption typed for illustration/);
});

test("the sunglasses profit page matches what returns.mjs computes", async () => {
  const { returnsPlan } = await import("./returns.mjs");
  const html = read("sunglasses-profit-margin.html");
  const landed = Math.round((21.5 + 21.5 * 0.029) * 100) / 100;
  assert.equal(landed, 22.12);
  const run = (shelf, returnPct, extra = {}) => returnsPlan({ price: Math.round((shelf / 1.21) * 100) / 100, landed, shipOut: 4, feePct: 2.9, feeFixed: 0.3, returnPct, exchangePct: 0, resaleablePct: 90, salvagePct: 20, returnLabel: 5, handling: 1.5, ...extra });
  for (const shelf of [60, 65, 70]) for (const rp of [5, 12, 20]) {
    const r = run(shelf, rp);
    assert.ok(html.includes(`<td class="num">${r.perOrder.profit.toFixed(2)}</td>`), `${shelf}/${rp}`);
  }
  const main = run(65, 12);
  assert.equal(main.perOrder.profit, 20.96);
  assert.ok(html.includes(`${main.perOrder.profit.toFixed(2)} per order`) && html.includes(`${main.marginPct}% of the net price`));
  assert.equal(Math.round((65 - 65 / 1.21) * 100) / 100, 11.28);
  assert.equal(Math.round((25 - main.perOrder.profit) * 100) / 100, 4.04);
  assert.equal(Math.round((run(65, 5).perOrder.profit - run(65, 20).perOrder.profit) * 100) / 100, 5.98);
  assert.equal(Math.round((run(70, 12).perOrder.profit - run(60, 12).perOrder.profit) * 100) / 100, 7.03);
  const target = run(65, 12, { targetProfit: 10 }).priceForTarget;
  assert.ok(html.includes((Math.round(target * 1.21 * 100) / 100).toFixed(2)), "price for target");
  assert.match(html, /an assumption typed for illustration/);
});
