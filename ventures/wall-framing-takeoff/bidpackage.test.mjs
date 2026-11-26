import test from "node:test";
import assert from "node:assert/strict";
import { proposal } from "./bidletter.mjs";
import { bidPackageHtml, cleanLogo, cleanAccent } from "./bidpackage.mjs";
import * as licence from "./licence.mjs";
import { assertPackLicence } from "../../platform/billing/testkit.mjs";
import { PADDLE } from "./checkout.mjs";
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
test("logo: every base64 digit passes, the size cap is exact, and a clean logo reaches the page", () => {
  const digits = "data:image/png;base64,0123456789AZaz+/=";
  assert.equal(cleanLogo(digits), digits);
  const head = "data:image/png;base64,";
  const at = (n) => head + "A".repeat(n - head.length);
  assert.equal(cleanLogo(at(399999)), at(399999));
  assert.equal(cleanLogo(at(400000)), "");
  const h = bidPackageHtml(q, b, { company: "Ace", logo: "https://x.test/logo.png" });
  assert.match(h, /<img src="https:\/\/x\.test\/logo\.png"/);
  assert.doesNotMatch(bidPackageHtml(q, b, { company: "Ace", logo: "javascript:alert(1)" }), /<img/);
});
test("the page tells the buyer when a logo is too big or the wrong type, instead of dropping it silently", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const handler = html.split('$("#pkgLogo").addEventListener("change"')[1]?.split("\n")[0] || "";
  assert.match(handler, /cleanLogo\(/, "the logo handler checks the file with cleanLogo");
  assert.match(handler, /#pkgState/, "and says so in the package status line");
  assert.match(html, /import \{[^}]*\bcleanLogo\b[^}]*\} from "\.\/bidpackage\.mjs"/);
});
test("licence: dark until the catalogue is set; only a key signed for this pack unlocks; never throws", async () => {
  await assertPackLicence(licence, PADDLE, "wall-framing-takeoff");
});
test("the page gates the Buy button on the shared Paddle wiring", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /wireBuyButton\(\$\("#buyLink"\)/);
  assert.doesNotMatch(html, /lemonsqueezy|VALIDATE_URL/i);
});
