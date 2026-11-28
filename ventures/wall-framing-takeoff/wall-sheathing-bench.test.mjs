import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verticalCases, horizontalCases, ruleSheets, windowsFor } from "./wall-sheathing-bench.mjs";

const html = readFileSync(new URL("./wall-sheathing-sheets.html", import.meta.url), "utf8");
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const d = (a, b) => { const x = a - b; return `${a} (${x > 0 ? "+" : ""}${x})`; };
const inch = (x) => ({ 96: "96", 97.125: "97-1/8", 109.125: "109-1/8", 121.125: "121-1/8", 48: "48", 12: "12", 13.125: "13-1/8", 25.125: "25-1/8" })[x];
const range = (xs) => [Math.min(...xs), Math.max(...xs)];
const V = verticalCases(), H = horizontalCases();

test("the rule is area / sheet area plus 10%, rounded up", () => {
  assert.equal(ruleSheets(320, 32), 11);
  assert.equal(ruleSheets(480, 48), 11);
  assert.deepEqual([[40, 24], [48, 28], [60, 32], [70, 36]].map(([l, w]) => windowsFor(l, w)), [11, 13, 15, 18]);
});

test("every row of both tables equals the benchmark", () => {
  assert.equal(V.length, 16);
  assert.equal(H.length, 16);
  for (const c of V) {
    const row = `<tr><td>${c.lFt} x ${c.wFt} ft</td><td>${c.height.replace("ft", " ft")}</td><td class="n">${inch(c.cover)}</td><td>${c.sheet}</td><td class="n">${c.quarter}</td><td class="n">${c.counted}</td><td class="n">${d(c.grossRule, c.counted)}</td><td class="n">${d(c.netRule, c.counted)}</td><td class="n">${pct(c.waste)}</td></tr>`;
    assert.ok(html.includes(row), row);
    assert.equal(c.courses, 1);
    // the sheets bought cover what is left on the wall
    assert.ok(c.counted * 4 * (c.cover / 12) >= c.net - 1e-6);
  }
  for (const c of H) {
    assert.ok(inch(c.cover) && inch(c.topCourse), `${c.cover} ${c.topCourse}`);
    const row = `<tr><td>${c.lFt} x ${c.wFt} ft</td><td>${c.height.replace("ft", " ft")}</td><td class="n">${inch(c.cover)}</td><td class="n">${c.courses}</td><td class="n">${inch(c.topCourse)}</td><td class="n">${c.counted}</td><td class="n">${d(c.grossRule, c.counted)}</td><td class="n">${d(c.netRule, c.counted)}</td><td class="n">${pct(c.waste)}</td></tr>`;
    assert.ok(html.includes(row), row);
    assert.equal(c.sheet, "4x8");
  }
});

test("the summary sentences follow from the benchmark", () => {
  // standing up, the count depends on the footprint only
  const byHouse = [...new Set(V.map((c) => c.counted))];
  assert.deepEqual(byHouse, [32, 39, 47, 55]);
  assert.ok(html.includes("took 32, 39, 47 and 55 sheets at every wall height"));
  const [q1, q2] = range(V.map((c) => c.counted - c.quarter));
  assert.ok(html.includes(`rounded up, plus ${q1} to ${q2} where`));
  // the net rule is short everywhere
  assert.ok([...V, ...H].every((c) => c.netRule < c.counted));
  const [nv1, nv2] = range(V.map((c) => c.counted - c.netRule));
  const [nh1, nh2] = range(H.map((c) => c.counted - c.netRule));
  assert.ok(html.includes(`short on all 32 cases: by ${nv1} to ${nv2} sheets standing up and ${nh1} to ${nh2} laid flat`));
  assert.ok(html.includes(`was ${nv1} to ${nv2} sheets short of the counted layout on all 16 vertical cases and ${nh1} to ${nh2} short on all 16 horizontal ones`));
  const over = (xs) => range(xs.map((c) => c.grossRule - c.counted));
  const short = (xs) => range(xs.map((c) => c.counted - c.grossRule));
  const v8 = V.filter((c) => c.sheet === "4x8"), v12 = V.filter((c) => c.sheet === "4x12");
  assert.ok(html.includes(`bought ${over(v8).join(" to ")} sheets too many; with 4x12s on 10 ft walls it was ${short(v12).join(" to ")} short`));
  const h96 = H.filter((c) => c.cover === 96), h8 = H.filter((c) => c.cover === 97.125), h9 = H.filter((c) => c.cover === 109.125), h10 = H.filter((c) => c.cover === 121.125);
  assert.ok(html.includes(`the rule was ${over(h96).join(" to ")} sheets over`));
  assert.ok(over(h9).every((x) => Math.abs(x) <= 1) && html.includes("on 9 ft walls: within 1"));
  assert.ok(html.includes(`8 ft wall: ${short(h8).join(" to ")} short`));
  assert.ok(html.includes(`too tall to take two from one sheet: ${short(h10).join(" to ")} short`));
  assert.ok(html.includes(`they took ${short(h10).join(" to ")} sheets more than the area rule`));
  assert.ok(html.includes(`that took ${short(h8).join(" to ")} sheets more than area / 32 + 10%`));
  // flat at 96 in against standing up at 96 in, house by house
  const diff = h96.map((c, i) => c.counted - v8[i].counted);
  assert.ok(diff.every((x) => x > 0) && html.includes(`two courses took ${range(diff).join(" to ")} sheets more than the same sheets standing up`));
  const w = (xs) => range(xs.map((c) => c.waste)).map(pct);
  assert.ok(html.includes(`was ${w(v8)[0].replace("%", "")} to ${w(v8)[1]} for 4x8s standing up`));
  assert.ok(html.includes(`${w(V.filter((c) => c.sheet !== "4x8")).map((s, i) => (i ? s : s.replace("%", ""))).join(" to ")} for taller sheets standing up`));
  const [o1, o2] = range(V.map((c) => c.openings));
  assert.ok(html.includes(`the openings are ${Math.round(o1)} to ${Math.round(o2)} sq ft`));
});

test("the page is wired: sitemap, llms.txt, calculator link, FAQ matches JSON-LD, disclaimer, licence", () => {
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /<loc>\.\/wall-sheathing-sheets\.html<\/loc>/);
  assert.match(readFileSync(new URL("./llms.txt", import.meta.url), "utf8"), /wall-sheathing-sheets\.html/);
  assert.match(readFileSync(new URL("./sheathing-calculator.html", import.meta.url), "utf8"), /href="wall-sheathing-sheets\.html"/);
  const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.match(html, /No warranty/);
  // the venture's LICENSE is all rights reserved; no page may call it MIT
  for (const page of ["wall-sheathing-sheets.html", "roof-sheathing-sheets.html", "lumber-waste-factor.html"]) {
    assert.doesNotMatch(readFileSync(new URL(`./${page}`, import.meta.url), "utf8"), /MIT licence/, page);
  }
});
