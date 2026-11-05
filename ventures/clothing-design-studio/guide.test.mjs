import test from "node:test";
import assert from "node:assert/strict";
import { listen } from "./guide.mjs";
import { planWardrobe } from "./wardrobe.mjs";

test("the interview's brief becomes a profile", () => {
  const { profile, asks } = listen("A unisex line for women and men around 30, hot Mediterranean summers, art and sacred paintings, casual and evenings out, premium, 10 pieces");
  assert.equal(profile.fit, "unisex"); assert.equal(profile.ageBand, "25-34");
  assert.equal(profile.climate, "warm"); assert.equal(profile.season, "spring-summer");
  assert.equal(profile.style, "statement"); assert.equal(profile.tier, "premium");
  assert.deepEqual(profile.occasions.sort(), ["casual", "evening"]); assert.equal(profile.size, 10);
  assert.deepEqual(asks, []);
  assert.equal(planWardrobe(profile).items.length, 10);
});
test("women and men together is unisex, not men's", () => {
  assert.equal(listen("clothes for women and men").profile.fit, "unisex");
  assert.equal(listen("for women").profile.fit, "womens");
  assert.equal(listen("for men").profile.fit, "mens");
});
test("age ranges and decades", () => {
  assert.equal(listen("aged 19").profile.ageBand, "18-24");
  assert.equal(listen("ages 40-50").profile.ageBand, "45+");
  assert.equal(listen("in their 40s").profile.ageBand, "35-44");
});
test("unsaid fields are asked about and keep their value; heard words are reported", () => {
  const r = listen("luxury minimal");
  assert.equal(r.profile.tier, "luxury"); assert.equal(r.profile.style, "minimal");
  assert.ok(r.asks.length >= 3 && r.heard.every(h => h.from));
  assert.equal(r.profile.climate, "temperate");
});
test("empty input changes nothing", () => {
  const r = listen("");
  assert.equal(r.heard.length, 0); assert.equal(r.asks.length, 6);
});
test("a conversation: answered questions are not asked again and bare replies are read", () => {
  let r = listen("luxury minimal");
  assert.ok(r.askFields.includes("ageBand") && !r.askFields.includes("tier"));
  assert.equal(r.pending, "ageBand");
  r = listen("30", r.profile, r);
  assert.equal(r.profile.ageBand, "25-34");
  assert.ok(!r.askFields.includes("ageBand") && !r.askFields.includes("tier") && !r.askFields.includes("style"));
  assert.equal(r.pending, "fit");
  r = listen("both", r.profile, r);
  assert.equal(r.profile.fit, "unisex");
  r = listen("hot summers", r.profile, r);
  assert.ok(!r.askFields.includes("climate"));
  r = listen("office and weekend", r.profile, r);
  assert.deepEqual(r.asks, []); assert.equal(r.pending, null);
});
test("a bare number is not an age unless age was the question", () => {
  assert.equal(listen("30").heard.length, 0);
});
