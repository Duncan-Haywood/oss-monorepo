import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, EXAMPLE } from "./calc.mjs";
import { menuData, menuPage, classify } from "./menupage.mjs";

const a = analyse(EXAMPLE, "uk");
const dish = (p) => menuData(a).dishes.find((x) => x.name.startsWith(p));

test("menuData keeps declared and ask (check + may) and drops dishes with errors", () => {
  const bad = analyse("# Bad dish\nflour [notanallergen]\n\n# Good\nrice", "uk");
  assert.deepEqual(menuData(bad).dishes.map((x) => x.name), ["Good"]);
  const wrap = dish("Chicken");
  assert.ok(wrap.contains.includes("eggs") && wrap.contains.includes("fish"));
  assert.ok(wrap.ask.includes("peanuts"), "may-contain goes to ask staff");
});

test("classify: contains beats ask beats none; a 'check' allergen never reads as clear", () => {
  assert.equal(classify(dish("Hummus"), ["sesame"]).status, "ask");
  assert.equal(classify(dish("Vegan"), ["milk"]).status, "none");
  assert.equal(classify(dish("Vegan"), ["celery"]).status, "ask");
  assert.equal(classify(dish("Carrot"), ["milk", "eggs"]).status, "contains");
});

test("the script in the page carries the same classify rule as the module", () => {
  const html = menuPage(a);
  const m = html.match(/function classify[\s\S]*?\n}\n/)[0];
  const f = new Function(`${m}; return classify;`)();
  for (const d of menuData(a).dishes) for (const k of ["milk", "eggs", "sesame", "celery", "peanuts", "fish"]) {
    assert.deepEqual(f(d, [k]), classify(d, [k]));
  }
});

test("the page never says safe or free from, and keeps the ask-staff line", () => {
  const html = menuPage(a, { business: "Daisy's Cafe", updated: "7 Nov 2026" });
  assert.doesNotMatch(html, /\bsafe\b|allergen[- ]free|free from/i);
  assert.match(html, /Tell us about any allergy/);
  assert.match(html, /always check with staff/);
  assert.match(html, /Daisy&#39;s Cafe|Daisy's Cafe/);
});

test("hostile names cannot break out of the markup or the embedded script", () => {
  const evil = analyse("# </script><img src=x onerror=alert(1)>\nrice, egg", "uk");
  const html = menuPage(evil, { business: "<b>x</b>" });
  assert.doesNotMatch(html, /<img src=x/);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test("self-contained: no network, no external files", () => {
  assert.doesNotMatch(menuPage(a), /fetch\(|XMLHttpRequest|sendBeacon|<script[^>]+src=|<link /);
});

test("US list uses the nine", () => {
  assert.equal(menuData(analyse(EXAMPLE, "us")).allergens.length, 9);
});
