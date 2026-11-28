import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOUSES, PITCHES, STRIP, courses, planes, ruleBundles, spread, strips, surface, table } from "./shingle-bench.mjs";
import { layoutRoof, sampleRoof } from "./roof.mjs";
import { samplePlan } from "./engine.mjs";

const html = readFileSync(new URL("./shingle-bundles-for-a-roof.html", import.meta.url), "utf8");
const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
const rows = table();

test("the bench's surface and rule are the free roof calculator's own figures", () => {
  const plan = samplePlan();
  const sizes = [...new Set(plan.stock.map((s) => s.size))];
  plan.stock.push(...sizes.flatMap((size) => [240, 288, 384].map((length) => ({ size, length, price: 30 }))));
  for (const pitch of PITCHES) for (const [w, len] of HOUSES) for (const shape of /** @type {const} */ (["gable", "hip"])) {
    const l = layoutRoof({ ...sampleRoof(), width: w * 12, length: len * 12, pitch, shape }, plan);
    assert.ok(l.ok, `${w} x ${len} ${shape} at ${pitch}`);
    const area = surface(w, len, pitch, shape);
    assert.ok(Math.abs(l.sheets.area - area) < 1e-6, `${w} x ${len} ${shape} at ${pitch}: surface`);
    assert.equal(l.roofing.shingleBundles, ruleBundles(area, shape), `${w} x ${len} ${shape} at ${pitch}: rule`);
  }
});

test("hand check: a 24 x 36 ft gable at 4:12 has 30 courses of 456 in each plane", () => {
  // Slope length (12 ft run + 12 in overhang) x sqrt(1 + (4/12)^2) = 156 x 1.05409 = 164.44 in;
  // at 5-5/8 in exposure that is 29.2, so 30 courses; each course is 36 ft + 2 ft of rake = 456 in.
  const ps = planes(24, 36, 4, "gable");
  assert.ok(Math.abs(ps[0].slope - 156 * Math.sqrt(1 + 1 / 9)) < 1e-9);
  const cs = courses(ps);
  assert.equal(cs.length, 60);
  for (const c of cs) assert.ok(Math.abs(c.reduce((s, p) => s + p.length, 0) - 456) < 1e-9);
  // The eave course starts with a whole strip: 11 whole strips and a 22-7/8 in piece. The next starts 6 in short.
  assert.deepEqual(cs[0].map((p) => p.length), [...Array(11).fill(39.375), 456 - 11 * 39.375]);
  assert.equal(cs[2][0].length, 33.375);
  // Thrown away, each piece is a strip: 12 a course here.
  assert.equal(strips([cs[0]], false), 12);
});

test("a hip plane's courses shrink by exposure / slope factor at each end, and its pieces carry the hip cut", () => {
  const ps = planes(24, 36, 6, "hip");
  assert.equal(ps.length, 4);
  const k = Math.sqrt(1 + 0.25);
  const side = ps[0], end = ps[2];
  assert.ok(Math.abs(side.length(0) - 456) < 1e-9 && Math.abs(side.length(side.slope) - (432 - 288)) < 1e-9);
  assert.ok(Math.abs(end.length(0) - 312) < 1e-9 && Math.abs(end.length(end.slope)) < 1e-9);
  assert.ok(Math.abs(side.length(STRIP.exposure) - (456 - 2 * STRIP.exposure / k)) < 1e-9);
  const first = courses(ps)[0];
  assert.ok(first[0].wedge > 0 && first.at(-1).wedge > 0 && first[1].wedge === 0);
});

test("reusing offcuts never buys more, and every way covers the surface", () => {
  for (const r of rows) for (const shape of /** @type {const} */ (["gable", "hip"])) {
    const m = r[shape];
    assert.ok(m.reused.strips <= m.thrown.strips, `${r.w} x ${r.len} ${shape} at ${r.pitch}`);
    assert.ok(m.reused.extra > 0, "reused buys less than the surface");
  }
});

test("every row of the page's table equals the benchmark's", () => {
  for (const r of rows) {
    const f = (/** @type {ReturnType<typeof table>[number]["gable"]} */ m) => [String(m.rule), `${m.thrown.bundles} (${pct(m.thrown.extra)})`, `${m.reused.bundles} (${pct(m.reused.extra)})`];
    const cells = [`${r.pitch}:12`, (r.gable.area / 100).toFixed(1), ...f(r.gable), ...f(r.hip)];
    const row = `<tr><td>${r.w} x ${r.len} ft</td><td class="n">${cells.join('</td><td class="n">')}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
});

test("the ranges, averages and counts in the text follow from the benchmark", () => {
  const range = (/** @type {"gable"|"hip"} */ s, /** @type {"thrown"|"reused"} */ k) => { const x = spread(rows.map((r) => r[s][k].extra)); return `${pct(x.min).replace("%", "")} to ${pct(x.max)}`; };
  const mean = (/** @type {"gable"|"hip"} */ s, /** @type {"thrown"|"reused"} */ k) => pct(spread(rows.map((r) => r[s][k].extra)).mean);
  assert.equal(range("gable", "thrown"), "5.4 to 11.1%"); assert.equal(mean("gable", "thrown"), "7.6%");
  assert.equal(range("gable", "reused"), "1.0 to 4.2%"); assert.equal(mean("gable", "reused"), "2.2%");
  assert.equal(range("hip", "thrown"), "10.4 to 18.4%"); assert.equal(mean("hip", "thrown"), "14.7%");
  assert.equal(range("hip", "reused"), "2.1 to 4.9%"); assert.equal(mean("hip", "reused"), "3.4%");
  for (const s of ["5.4 to 11.1% over the surface with offcuts thrown away, 7.6% on average; 1.0 to 4.2% reused, 2.2% on average", "10.4 to 18.4% with offcuts thrown away, 14.7% on average; 2.1 to 4.9% reused, 3.4% on average", "14.7% against 7.6%"]) assert.ok(html.includes(s), s);
  const over = (/** @type {"gable"|"hip"} */ s, /** @type {"thrown"|"reused"} */ k) => { const d = rows.map((r) => r[s].rule - r[s][k].bundles); return [Math.min(...d), Math.max(...d)]; };
  assert.deepEqual(over("gable", "thrown"), [0, 6]); assert.ok(html.includes("0 to 6 bundles more than the strips thrown away needed, and 3 to 10 more than reused"));
  assert.deepEqual(over("gable", "reused"), [3, 10]);
  assert.deepEqual(over("hip", "thrown"), [-1, 5]);
  assert.equal(rows.filter((r) => r.hip.rule < r.hip.thrown.bundles).length, 2); assert.ok(html.includes("ran 1 bundle short on 2 of the 16 when nothing was reused"));
  assert.deepEqual(over("hip", "reused"), [3, 13]); assert.ok(html.includes("3 to 13 bundles more than the reused layout needed"));
  assert.ok(html.includes("from 1 bundle short to 13 over"));
  // Squares x 3 with no allowance.
  const bare = (/** @type {"gable"|"hip"} */ s, /** @type {"thrown"|"reused"} */ k) => rows.map((r) => Math.ceil((r[s].area / 100) * 3 - 1e-9) - r[s][k].bundles);
  assert.deepEqual([Math.min(...bare("gable", "thrown")), Math.max(...bare("gable", "thrown"))], [-4, -2]);
  assert.deepEqual([Math.min(...bare("hip", "thrown")), Math.max(...bare("hip", "thrown"))], [-8, -5]);
  assert.ok(html.includes("ran short on all 16 roofs of both shapes when offcuts were thrown away (2 to 4 bundles on a gable, 5 to 8 on a hip)"));
  assert.equal(bare("gable", "reused").filter((d) => d < 0).length, 3);
  assert.equal(bare("hip", "reused").filter((d) => d < 0).length, 14);
  assert.ok(Math.min(...bare("gable", "reused"), ...bare("hip", "reused")) === -1);
  assert.ok(html.includes("1 bundle short on 3 gables and 14 hips"));
});

test("the page is wired: sitemap, llms.txt, more-tools, FAQ matches JSON-LD, disclaimer, no MIT claim", () => {
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /<loc>\.\/shingle-bundles-for-a-roof\.html<\/loc>/);
  assert.match(readFileSync(new URL("./llms.txt", import.meta.url), "utf8"), /shingle-bundles-for-a-roof\.html/);
  assert.match(readFileSync(new URL("./more-tools.mjs", import.meta.url), "utf8"), /shingle-bundles-for-a-roof\.html/);
  const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq);
  assert.equal(faq.mainEntity.length, 4);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.ok(html.includes("10.4 to 18.4% (14.7% on average) thrown away and 2.1 to 4.9% (3.4% on average) reused"));
  assert.match(html, /No warranty\./);
  assert.match(html, /all-rights-reserved notice/);
  assert.doesNotMatch(html, /MIT licen[cs]e/);
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  assert.ok(desc.length <= 160, `description ${desc.length} chars`);
  assert.match(html, /<nav class="more-tools"[^>]*><h2>/);
});
