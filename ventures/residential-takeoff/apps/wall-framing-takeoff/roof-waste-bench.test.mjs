import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WAYS, allCases, pct, range, rowCells } from "./roof-waste-bench.mjs";

const html = readFileSync(new URL("./roof-sheathing-waste-factor.html", import.meta.url), "utf8");
const all = allCases();
const waste = (k) => all.map((c) => c.ways[k].waste);

test("a hip roof has the gable roof's area on the same footprint, pitch and overhangs", () => {
  assert.equal(all.length, 16);
  for (const c of all) for (const k of WAYS) assert.ok(Math.abs(c.ways[k].area - c.area) < 1e-6, `${c.footprint} ${c.pitch}:12 ${k}`);
});

test("no layout buys fewer sheets than the area, and reusing the hip offcuts never costs a sheet", () => {
  for (const c of all) {
    for (const k of WAYS) assert.ok(c.ways[k].sheets >= Math.ceil(c.minimum - 1e-9), `${c.footprint} ${k}`);
    assert.ok(c.ways["hip, offcuts reused"].sheets < c.ways["hip, cut course by course"].sheets, c.footprint);
  }
});

test("every row of the page's table equals the benchmark's", () => {
  for (const c of all) {
    const row = `<tr><td>${c.footprint}</td><td>${c.pitch}:12</td><td class="n">${rowCells(c).join('</td><td class="n">')}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
});

test("the ranges and counts in the text follow from the benchmark", () => {
  // "3.4 to 16.6%": the low end written without its percent sign.
  const [g, hc, hr] = WAYS.map((k) => { const [lo, hi] = range(waste(k)).map(pct); return `${lo.replace("%", "")} to ${hi}`; });
  assert.ok(html.includes(`a gable roof needed ${g} more sheets`));
  assert.ok(html.includes(`a hip roof ${hr} when the triangles`));
  assert.ok(html.includes(`but ${hc} when every course`));
  assert.ok(html.includes(`content="Roof sheathing waste on 16 roofs laid out sheet by sheet: gable ${g}, hip ${hr} with the hip offcuts reused, ${hc} without.">`));
  assert.ok(html.includes(`the hip roofs wasted ${hc}`) && html.includes(`brought them to ${hr}`) && html.includes(`The gable roofs ranged from ${g.replace(" to ", "% to ")}`));
  const saved = range(all.map((c) => c.ways["hip, cut course by course"].sheets - c.ways["hip, offcuts reused"].sheets));
  assert.ok(html.includes(`saved ${saved[0]} to ${saved[1]} sheets a roof`));
  const d = all.map((c) => c.ways["hip, offcuts reused"].sheets - c.ways.gable.sheets);
  assert.equal(Math.min(...d), -1);
  assert.ok(html.includes(`within 1 fewer to ${Math.max(...d)} more sheets`));
  assert.ok(html.includes(`no more than the gable on ${d.filter((x) => x <= 0).length} of the 16`));
  assert.ok(html.includes(`needed no more on ${d.filter((x) => x <= 0).length} of them`));
  const short = waste("gable").filter((x) => x > 0.1).length, twice = waste("gable").filter((x) => x < 0.05).length;
  assert.ok(html.includes(`ran short on ${short} of the 16`));
  assert.ok(html.includes(`more than twice the need on ${twice}`));
  assert.ok(html.includes(`(${waste("hip, cut course by course").filter((x) => x > 0.15).length} of the 16 needed more)`));
  assert.ok(html.includes(`(${waste("hip, offcuts reused").filter((x) => x > 0.15).length} of the 16 needed more)`));
});

test("the top-course examples are the roofs' own strips", () => {
  const strip = (wFt, pitch) => Math.round((((wFt * 6 + 12) * Math.sqrt(1 + (pitch / 12) ** 2)) % 48) * 16) / 16;
  assert.equal(strip(28, 8), 24.3125);
  assert.equal(strip(32, 8), 5.1875);
  assert.ok(html.includes("a strip 24-5/16 in wide") && html.includes("the strip is 5-3/16 in and nine come from one sheet"));
  assert.equal(Math.floor((48 + 0.125) / (5.1875 + 0.125)), 9);
});

test("the page is wired: FAQ matches JSON-LD, disclaimer, a link into the app", () => {
  const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.match(html, /No warranty/);
  assert.match(html, /<a class="cta" href="index\.html">/);
  assert.ok(html.match(/<meta name="description" content="([^"]*)"/)[1].length <= 160);
});
