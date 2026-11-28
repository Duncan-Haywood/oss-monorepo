import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOUSES, PITCHES, benchPlan, spread, table } from "./roof-waste-bench.mjs";
import { layoutRoof, sampleRoof } from "../../../wall-framing-takeoff/roof.mjs";
import { layoutRoof as paidLayoutRoof } from "./roof.mjs";

const html = readFileSync(new URL("../../../wall-framing-takeoff/roof-sheathing-waste-factor.html", import.meta.url), "utf8");
const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
const rows = table();

test("16 roofs, every one lays out, and a gable and a hip of one house share one surface", () => {
  assert.equal(rows.length, HOUSES.length * PITCHES.length);
  for (const r of rows) {
    assert.ok(Math.abs(r.gable.area - r.thrown.area) < 1e-6 && Math.abs(r.gable.area - r.reused.area) < 1e-6, `${r.w} x ${r.len} at ${r.pitch}`);
    for (const k of /** @type {const} */ (["gable", "thrown", "reused"])) assert.ok(r[k].sheets * 32 >= r[k].area, `${k} buys less than the surface`);
  }
});

test("hand check: a 24 x 36 ft house at 4:12 has 1,041 sq ft of roof surface", () => {
  // Rafter run 12 ft + 1 ft overhang, times the slope factor sqrt(1 + (4/12)^2), both sides,
  // times the length 36 ft + 2 ft of rake overhang: 2 x 13 x 1.05409 x 38 = 1041.4.
  const r = rows.find((x) => x.w === 24 && x.len === 36 && x.pitch === 4);
  assert.ok(r);
  assert.ok(Math.abs(r.gable.area - 2 * 13 * Math.sqrt(1 + 1 / 9) * 38) < 1);
});

test("the paid layout with reuse off orders what the free edition orders, and reuse never adds a sheet", () => {
  const plan = benchPlan();
  for (const r of rows) {
    const roof = { ...sampleRoof(), width: r.w * 12, length: r.len * 12, pitch: r.pitch };
    const off = paidLayoutRoof({ ...roof, shape: "hip", hipStarts: false }, plan);
    assert.ok(off.ok);
    assert.equal(off.sheets.count, r.thrown.sheets, `${r.w} x ${r.len} at ${r.pitch}`);
    assert.equal(paidLayoutRoof({ ...roof, shape: "gable" }, plan).sheets.count, r.gable.sheets);
    assert.equal(layoutRoof({ ...roof, shape: "gable" }, plan).sheets.count, r.gable.sheets);
    assert.ok(r.reused.sheets <= r.thrown.sheets);
  }
});

test("every row of the page's table equals the benchmark's", () => {
  for (const r of rows) {
    const cells = [`${r.pitch}:12`, String(Math.round(r.gable.area)), ...[r.gable, r.thrown, r.reused].map((m) => `${m.sheets} (${pct(m.extra)})`)];
    const row = `<tr><td>${r.w} x ${r.len} ft</td><td class="n">${cells.join('</td><td class="n">')}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
});

test("the ranges, averages and counts in the text follow from the benchmark", () => {
  const say = (/** @type {"gable"|"thrown"|"reused"} */ k) => { const s = spread(rows.map((r) => r[k].extra)); return `${pct(s.min).replace("%", "")} to ${pct(s.max)}`; };
  const mean = (/** @type {"gable"|"thrown"|"reused"} */ k) => pct(spread(rows.map((r) => r[k].extra)).mean);
  assert.equal(say("gable"), "3.3 to 16.2%"); assert.equal(mean("gable"), "7.8%");
  assert.equal(say("thrown"), "12.7 to 30.4%"); assert.equal(mean("thrown"), "19.5%");
  assert.equal(say("reused"), "4.4 to 16.2%"); assert.equal(mean("reused"), "9.0%");
  for (const s of ["3.3 to 16.2% over the surface, 7.8% on average", "12.7 to 30.4%, 19.5% on average", "4.4 to 16.2%, 9.0% on average"]) assert.ok(html.includes(s), s);
  const short = (/** @type {"gable"|"thrown"} */ k, f) => rows.filter((r) => r[k].extra > f).length;
  assert.equal(short("gable", 0.1), 3); assert.ok(html.includes("covered the cutting on 13 of the 16 and ran short on 3"));
  assert.equal(short("thrown", 0.15), 14); assert.ok(html.includes("A flat 15% ran short on 14 of the 16"));
  const saved = rows.map((r) => r.thrown.sheets - r.reused.sheets);
  assert.equal(`${Math.min(...saved)} to ${Math.max(...saved)}`, "2 to 10"); assert.ok(html.includes("2 to 10 sheets fewer"));
  const vsGable = rows.map((r) => r.reused.sheets - r.gable.sheets);
  assert.equal(Math.min(...vsGable), -2); assert.equal(Math.max(...vsGable), 3);
  assert.ok(html.includes("between 2 fewer and 3 more sheets than the gable") && html.includes("within 3 sheets of the gable"));
  assert.equal(vsGable.filter((d) => d === 0).length, 6); assert.ok(html.includes("the same count on 6 of"));
  const thrownVsGable = rows.map((r) => r.thrown.sheets - r.gable.sheets);
  assert.equal(`${Math.min(...thrownVsGable)} to ${Math.max(...thrownVsGable)}`, "4 to 10"); assert.ok(html.includes("cost 4 to 10 more sheets than the gable"));
});

test("the page is wired: sitemap, llms.txt, more-tools, FAQ matches JSON-LD, disclaimer, no MIT claim", () => {
  assert.match(readFileSync(new URL("../../../wall-framing-takeoff/sitemap.xml", import.meta.url), "utf8"), /<loc>\.\/roof-sheathing-waste-factor\.html<\/loc>/);
  assert.match(readFileSync(new URL("../../../wall-framing-takeoff/llms.txt", import.meta.url), "utf8"), /roof-sheathing-waste-factor\.html/);
  assert.match(readFileSync(new URL("../../../wall-framing-takeoff/more-tools.mjs", import.meta.url), "utf8"), /roof-sheathing-waste-factor\.html/);
  const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.match(html, /No warranty\./);
  assert.match(html, /all-rights-reserved notice/);
  assert.doesNotMatch(html, /MIT licence/);
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  assert.ok(desc.length <= 160, `description ${desc.length} chars`);
});
