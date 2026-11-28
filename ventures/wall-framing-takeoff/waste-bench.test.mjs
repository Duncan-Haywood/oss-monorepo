import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MENUS, cases, headroom, menuStock, wasteByMenu } from "./waste-bench.mjs";
import { samplePlan } from "./engine.mjs";

const html = readFileSync(new URL("./lumber-waste-factor.html", import.meta.url), "utf8");
const pct = (x) => `${(x * 100).toFixed(1)}%`;

test("menus: 16 ft only keeps no 8 ft or precut stud-size board, header sizes keep every length", () => {
  const s = menuStock(samplePlan().stock, "16 ft only");
  assert.ok(s.filter((x) => x.size === "2x4").every((x) => x.length === 192));
  assert.equal(s.filter((x) => x.size === "2x10").length, 5);
  const e = menuStock(samplePlan().stock, "8/16 ft only").filter((x) => x.size === "2x6").map((x) => x.length).sort((a, b) => a - b);
  assert.deepEqual(e, [92.625, 96, 192]);
});

test("waste only grows as the board list shrinks, and no planning wastes most", () => {
  for (const [name, plan] of cases()) {
    const w = wasteByMenu(plan);
    assert.ok(w.ok, name);
    const m = /** @type {any} */ (w.menus);
    const order = [...MENUS, "one piece per board"].map((k) => m[k].waste);
    for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `${name}: ${order}`);
    for (const k of Object.keys(m)) assert.ok(m[k].bought >= m[k].used - 1e-9, `${name} ${k}`);
  }
});

test("every figure in the page's tables equals the benchmark's", () => {
  const all = cases();
  assert.equal(all.length, 3);
  for (const sp of [16, 24]) for (const [name, plan] of all) {
    const w = wasteByMenu({ ...plan, studSpacing: sp });
    assert.ok(w.ok, name);
    const m = /** @type {any} */ (w.menus);
    const cells = [String(Math.round(m["every length"].used)), ...[...MENUS, "one piece per board"].map((k) => `${Math.round(m[k].bought)} (${pct(m[k].waste)})`)];
    const row = `<td class="n">${cells.join('</td><td class="n">')}</td>`;
    assert.ok(html.includes(row), `${name} at ${sp} in: ${row}`);
  }
});

test("the 10% headroom and board-count claims follow from the benchmark", () => {
  const hs = [], fewer = [];
  for (const sp of [16, 24]) for (const [, plan] of cases()) {
    const m = /** @type {any} */ (wasteByMenu({ ...plan, studSpacing: sp }).menus);
    hs.push(headroom(m["every length"].waste, 0.1));
    fewer.push(1 - m["16 ft only"].boards / m["every length"].boards);
  }
  assert.equal(pct(Math.min(...hs)).replace("%", ""), "9.5");
  assert.equal(pct(Math.max(...hs)).replace("%", ""), "9.8");
  assert.ok(html.includes("left 9.5 to 9.8% for that"));
  assert.equal(Math.round(100 * Math.min(...fewer)), 36);
  assert.equal(Math.round(100 * Math.max(...fewer)), 39);
  assert.ok(html.includes("36 to 39% fewer boards"));
});

test("the page is wired: sitemap, llms.txt, FAQ matches JSON-LD, disclaimer", () => {
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /<loc>\.\/lumber-waste-factor\.html<\/loc>/);
  assert.match(readFileSync(new URL("./llms.txt", import.meta.url), "utf8"), /lumber-waste-factor\.html/);
  const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.match(html, /No warranty/);
});
