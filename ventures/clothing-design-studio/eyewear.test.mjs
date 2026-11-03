import test from "node:test";
import assert from "node:assert/strict";
import { newEyewear, sizeLabel, frameWidth, eyewearNotes, eyewearCost, eyewearQuoteRequest, renderEyewear, FRAME_STYLES, EXAMPLE_EYEWEAR_SUPPLIER } from "./eyewear.mjs";
import { sellingSide } from "./costing.mjs";

test("size label and frame width follow the 52□18-145 convention", () => {
  const e = newEyewear();
  assert.equal(sizeLabel(e), "52□18-145");
  assert.equal(frameWidth(e), 52 * 2 + 18 + 12);
});

test("measurements outside a style's usual range are flagged as a question for the factory", () => {
  const ok = eyewearNotes(newEyewear());
  assert.ok(!ok.some(n => /outside the usual/.test(n)));
  const odd = eyewearNotes(newEyewear({ style: "aviator", bridge: 22 }));
  assert.ok(odd.some(n => /Bridge 22 mm is outside/.test(n)));
});

test("logo methods that do not fit the place or material are flagged", () => {
  const n = eyewearNotes(newEyewear({ material: "metal", logos: [{ where: "temple", text: "BRAND", method: "metal-plate" }, { where: "case", text: "X", method: "laser-engrave" }] }));
  assert.ok(n.some(x => /metal plate inlay is set into acetate/.test(x)));
  assert.ok(n.some(x => /Laser engraving is not usually used on the case/.test(x)));
});

test("every plan names the EU/UK and US test reports to ask for", () => {
  const n = eyewearNotes(newEyewear()).join(" ");
  assert.match(n, /EN ISO 12312-1/);
  assert.match(n, /drop-ball/);
  assert.match(eyewearQuoteRequest(newEyewear()), /EN ISO 12312-1/);
});

test("cost per pair by hand from the example sheet", () => {
  const e = newEyewear({ quantity: 100, logos: [{ where: "temple", text: "B", method: "laser-engrave" }, { where: "case", text: "B", method: "hot-stamp" }] });
  // acetate 9 + polarised 1.5 + laser (0.3 + 30/100) + hot stamp (0.3 + 60/100) + clamshell 2.5 + cloth 0.4 + packaging 0.6 + freight 1.2 = 16.7
  assert.equal(eyewearCost(e, EXAMPLE_EYEWEAR_SUPPLIER).landed, 16.7);
  assert.throws(() => eyewearCost(newEyewear({ material: "titanium" })), /titanium/);
});

test("the designer's own estimate: 20 to make, 65 to sell with 22% VAT", () => {
  const s = sellingSide({ landed: 20, price: 65, quantity: 100 }, { salesTaxPct: 22, channelFeePct: 0, paymentFeePct: 3, paymentFixed: 0.3, unsoldPct: 10, marketingBudget: 500, targetMarginPct: 60 });
  assert.equal(s.marginPct, 58.2);
  assert.equal(s.priceForTargetMargin, 68.15);
});

test("drawings render every style and escape the logo", () => {
  for (const style of Object.keys(FRAME_STYLES)) {
    const e = newEyewear({ style, logos: [{ where: "temple", text: "<b>", method: "laser-engrave" }, { where: "case", text: "A&B", method: "emboss" }, { where: "lens", text: "x", method: "laser-engrave" }] });
    const front = renderEyewear(e, { view: "front" });
    const side = renderEyewear(e, { view: "side" });
    assert.ok(front.startsWith("<svg") && side.startsWith("<svg"));
    assert.ok(!side.includes("<b>") && side.includes("&lt;b&gt;") && side.includes("A&amp;B"));
  }
});
