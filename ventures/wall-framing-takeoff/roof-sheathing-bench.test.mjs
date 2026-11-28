import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cases, pitchFactor, ruleSheets } from "./roof-sheathing-bench.mjs";

const html = readFileSync(new URL("./roof-sheathing-sheets.html", import.meta.url), "utf8");
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const range = (xs, f) => [Math.min(...xs), Math.max(...xs)].map(f);

test("the rule is area / 32 plus 10%, rounded up", () => {
  assert.equal(ruleSheets(320), 11);
  assert.equal(ruleSheets(32), 2);
});

test("every row of the sheet table equals the benchmark", () => {
  const all = cases();
  assert.equal(all.length, 20);
  for (const c of all) {
    const d = c.rule - c.counted;
    const row = `<tr><td>${c.wFt} x ${c.lFt} ft</td><td class="n">${c.pitch}/12</td><td class="n">${Math.round(c.area)}</td><td class="n">${c.counted}</td><td class="n">${c.rule} (${d > 0 ? "+" : ""}${d})</td><td class="n">${pct(c.waste)}</td><td class="n">${c.topCourse.toFixed(1)}</td></tr>`;
    assert.ok(html.includes(row), row);
    // counted sheets cover the area, and the area is footprint-with-overhangs x pitch factor
    assert.ok(c.counted * 32 >= c.area - 1e-9);
    assert.ok(Math.abs(c.area - (c.wFt + 2) * (c.lFt + 2) * pitchFactor(c.pitch)) < 1e-6, `${c.wFt}x${c.lFt} ${c.pitch}`);
  }
});

test("every row of the pitch factor table is sqrt(1 + (p/12)^2)", () => {
  for (let p = 1; p <= 12; p++) {
    const f = Math.sqrt(1 + (p / 12) ** 2);
    assert.ok(html.includes(`<tr><td>${p}/12</td><td class="n">${f.toFixed(3)}</td><td class="n">${Math.round(1000 * f)}</td></tr>`), `${p}/12`);
  }
});

test("the summary sentences follow from the benchmark", () => {
  const all = cases();
  const over = all.filter((c) => c.rule > c.counted), short = all.filter((c) => c.rule < c.counted);
  assert.equal(over.length + short.length, all.length);
  assert.equal(over.length, 16);
  assert.equal(short.length, 4);
  const [o1, o2] = range(over.map((c) => c.rule - c.counted), String);
  const [s1, s2] = range(short.map((c) => c.counted - c.rule), String);
  const [ow1, ow2] = range(over.map((c) => c.waste), pct);
  const [sw1, sw2] = range(short.map((c) => c.waste), pct);
  const [t1, t2] = range(short.map((c) => c.topCourse), (x) => x.toFixed(1));
  assert.ok(html.includes(`In 16 of the 20 roofs, area / 32 + 10% bought ${o1} to ${o2} sheets more`));
  assert.ok(html.includes(`was ${ow1.replace("%", "")} to ${ow2},`));
  assert.ok(html.includes(`(by ${s1} to ${s2} sheets) all had a top course between ${t1} and ${t2} in wide`));
  assert.ok(html.includes(`the counted waste was ${sw1.replace("%", "")} to ${sw2}.`));
  // the explanation: every short case has a top course too wide to pair (over 24 in less a kerf) and under 31 in
  for (const c of short) assert.ok(c.topCourse > 24 && c.topCourse < 31);
  // and no over case's top course sits in that band
  for (const c of over) assert.ok(!(c.topCourse >= t1 - 1e-9 && c.topCourse <= Number(t2) + 1e-9));
});

test("the page is wired: sitemap, llms.txt, roof calculator link, FAQ matches JSON-LD, disclaimer", () => {
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /<loc>\.\/roof-sheathing-sheets\.html<\/loc>/);
  assert.match(readFileSync(new URL("./llms.txt", import.meta.url), "utf8"), /roof-sheathing-sheets\.html/);
  assert.match(readFileSync(new URL("./roof-calculator.html", import.meta.url), "utf8"), /href="roof-sheathing-sheets\.html"/);
  const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.match(html, /No warranty/);
});
