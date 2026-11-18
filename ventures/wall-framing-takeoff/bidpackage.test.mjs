import test from "node:test";
import assert from "node:assert/strict";
import { proposal } from "./bidletter.mjs";
import { bidPackageHtml, cleanLogo, cleanAccent } from "./bidpackage.mjs";
import { buyLink, cleanKey, interpret, checkLicence } from "./licence.mjs";
import { CHECKOUT_URL } from "./checkout.mjs";
import { readFileSync } from "node:fs";

const b = {
  lines: [
    { section: "Sheathing", item: "Wall sheets", qty: 10, unit: "sheets", unitPrice: 30, amount: 300 },
    { section: "Labor", item: "Wall framing", qty: 100, unit: "ft", unitPrice: 5, amount: 500 },
  ],
  sections: [{ name: "Sheathing", subtotal: 300, unpriced: 0 }, { name: "Labor", subtotal: 500, unpriced: 0 }],
  materials: 300, tax: 0, contingency: 0, total: 800, bid: 800, unpriced: [],
};
const q = proposal(b, { client: "A. Buyer", project: "Garage" });

test("branded package carries letterhead and quantities, never unit prices or labor", () => {
  const h = bidPackageHtml(q, b, { company: "Ace <Framing>", phone: "555-0100", licenseNo: "L-1", accent: "#aa0000" });
  assert.match(h, /Ace &lt;Framing&gt;/);
  assert.match(h, /Licence L-1/);
  assert.match(h, /Wall sheets<\/td><td class="n">10/);
  assert.doesNotMatch(h, /Wall framing/);
  assert.doesNotMatch(h, />30\.00</);
  assert.match(h, /#aa0000/);
});
test("a failed proposal falls back to the plain refusal page", () => {
  assert.match(bidPackageHtml({ ok: false, error: "x" }, b, {}), /Proposal not issued/);
});
test("logo and accent are sanitised", () => {
  assert.equal(cleanLogo("data:image/svg+xml;base64,AAAA"), "");
  assert.equal(cleanLogo("javascript:alert(1)"), "");
  assert.equal(cleanLogo("http://x.test/a.png"), "");
  assert.equal(cleanLogo("https://x.test/a.png"), "https://x.test/a.png");
  assert.match(cleanLogo("data:image/png;base64,iVBOR=="), /^data:image\/png/);
  assert.equal(cleanAccent("red;}</style>"), "#1f3a5f");
});
test("licence: link, key and answer handling", async () => {
  assert.equal(buyLink("http://x.test"), null);
  assert.equal(buyLink("https://u:p@x.test"), null);
  assert.ok(buyLink("https://shop.test/checkout/abc"));
  assert.equal(cleanKey("a b"), null);
  assert.equal(cleanKey("ABCD-1234-EFGH"), "ABCD-1234-EFGH");
  assert.equal(interpret({ valid: true, license_key: { status: "active" } }).valid, true);
  assert.equal(interpret({ valid: true, license_key: { status: "disabled" } }).valid, false);
  assert.equal(interpret({ valid: "true" }).valid, false);
  assert.equal(interpret(null).valid, false);
  const ok = async (url, init) => { assert.match(init.body, /^license_key=ABCD-1234-EFGH$/); return { json: async () => ({ valid: true, license_key: { status: "active" } }) }; };
  assert.equal((await checkLicence("ABCD-1234-EFGH", { fetch: ok, url: "https://v.test/validate" })).valid, true);
  const down = async () => { throw new Error("net"); };
  assert.equal((await checkLicence("ABCD-1234-EFGH", { fetch: down, url: "https://v.test/validate" })).valid, false);
  assert.equal((await checkLicence("bad key", { fetch: ok, url: "https://v.test/validate" })).valid, false);
  assert.equal((await checkLicence("ABCD-1234-EFGH", { fetch: ok, url: "" })).valid, false);
});
test("dark by default: no checkout link ships and the page gates the button on it", () => {
  assert.match(CHECKOUT_URL, /^(https:\/\/\S+)?$/); // empty (dark) or an https link (live)
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /buyLink\(CHECKOUT_URL\)/);
});
