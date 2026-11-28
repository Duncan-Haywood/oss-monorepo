import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOUSES, PITCHES, SHINGLE, count, coursePieces, planes, ruleBundles, spread, table } from "./shingle-bench.mjs";
import { layoutRoof, sampleRoof } from "./roof.mjs";
import { samplePlan } from "./engine.mjs";

const html = readFileSync(new URL("./how-many-bundles-of-shingles.html", import.meta.url), "utf8");
const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
const rows = table();

/** The sample plan's boards plus 20 to 32 ft lengths, so long hip rafters lay out. */
function benchPlan() {
  const plan = samplePlan();
  const sizes = [...new Set(plan.stock.map((s) => s.size))];
  return { ...plan, stock: [...plan.stock, ...sizes.flatMap((size) => [240, 288, 384].map((length) => ({ size, length, price: 30 })))] };
}

test("16 roofs; the bench's surface equals roof.mjs's squares, gable and hip", () => {
  assert.equal(rows.length, HOUSES.length * PITCHES.length);
  const plan = benchPlan();
  for (const r of rows) for (const shape of /** @type {const} */ (["gable", "hip"])) {
    const l = /** @type {any} */ (layoutRoof({ ...sampleRoof(), width: r.w * 12, length: r.len * 12, pitch: r.pitch, overhang: 12, gableOverhang: 12, shape }, plan));
    assert.ok(l.ok, `${r.w} x ${r.len} at ${r.pitch}, ${shape}: ${l.errors?.[0]}`);
    assert.ok(Math.abs(l.roofing.squares * 100 - r[shape].thrown.area) < 0.01, `${r.w} x ${r.len} at ${r.pitch}, ${shape}`);
    // roof.mjs's default order is the rule the page quotes.
    assert.equal(l.roofing.shingleBundles, r[shape].rule, `${r.w} x ${r.len} at ${r.pitch}, ${shape} rule`);
  }
});

test("every layout buys at least the surface, and reuse never adds a shingle", () => {
  const exposed = (SHINGLE.length * SHINGLE.exposure) / 144;
  for (const r of rows) for (const shape of /** @type {const} */ (["gable", "hip"])) {
    const { thrown, reused } = r[shape];
    assert.ok(reused.shingles * exposed >= reused.area, `${shape} reused under the surface`);
    assert.ok(reused.shingles <= thrown.shingles);
  }
});

test("hand check: a 24 x 36 ft gable at 4:12 has 30 courses of 456 in", () => {
  // Slope (12 + 1 ft) x 12 x sqrt(1 + 1/9) = 164.4 in, / 5-5/8 = 29.2, so 30 courses; eave 36 + 2 ft.
  const [p] = planes(24, 36, 4, "gable");
  const cs = coursePieces(p);
  assert.equal(cs.length, 30);
  for (const c of cs) {
    const ends = c.ends.reduce((t, e) => t + e.length, 0);
    assert.ok(Math.abs(c.whole * SHINGLE.length + ends - 456) < 1e-6, `course ${c.course}`);
    assert.ok(c.ends.every((e) => !e.diag));
  }
  // Course 0 starts on the rake with a whole shingle; course 1 with a 6-1/2 in piece.
  assert.ok(Math.abs(cs[1].ends[0].length - 6.5) < 1e-9);
});

test("hand check: hip courses shorten by slope / slope factor at each end and their ends are diagonal", () => {
  const ps = planes(24, 36, 6, "hip");
  const k = Math.sqrt(1 + 0.25);
  for (const p of ps) for (const c of coursePieces(p)) {
    const y = c.course * SHINGLE.exposure;
    const len = c.whole * SHINGLE.length + c.ends.reduce((t, e) => t + e.length, 0);
    assert.ok(Math.abs(len - (p.eave - 2 * y / k)) < 1e-6, `${p.name} course ${c.course}`);
    assert.ok(c.ends.every((e) => e.diag));
  }
});

test("thrown counts one shingle per end piece", () => {
  const c = count(28, 40, 8, "hip", false);
  const whole = planes(28, 40, 8, "hip").reduce((t, p) => t + p.count * coursePieces(p).reduce((u, x) => u + x.whole, 0), 0);
  assert.equal(c.shingles, whole + c.endPieces);
  assert.equal(ruleBundles(1000, 0.1), 33);
});

test("every row of the page's table equals the benchmark's", () => {
  for (const r of rows) {
    const g = r.gable, h = r.hip;
    const cells = [`${r.pitch}:12`, String(Math.round(g.thrown.area)), String(g.rule), ...[g.thrown, g.reused].map((m) => `${m.bundles} (${pct(m.extra)})`), String(h.rule), ...[h.thrown, h.reused].map((m) => `${m.bundles} (${pct(m.extra)})`)];
    const row = `<tr><td>${r.w} x ${r.len} ft</td><td class="n">${cells.join('</td><td class="n">')}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
});

test("the ranges, averages and counts in the text follow from the benchmark", () => {
  const say = (/** @type {"gable"|"hip"} */ s, /** @type {"thrown"|"reused"} */ w) => { const x = spread(rows.map((r) => r[s][w].extra)); return [`${pct(x.min).replace("%", "")} to ${pct(x.max)}`, pct(x.mean)]; };
  assert.deepEqual(say("gable", "thrown"), ["5.4 to 11.4%", "8.0%"]);
  assert.deepEqual(say("gable", "reused"), ["0.7 to 3.7%", "1.7%"]);
  assert.deepEqual(say("hip", "thrown"), ["12.0 to 21.4%", "16.5%"]);
  assert.deepEqual(say("hip", "reused"), ["2.3 to 5.3%", "3.6%"]);
  for (const s of ["5.4 to 11.4% over the surface with every end cut from a new shingle, 8.0% on average", "0.7 to 3.7% with the offcuts reused, 1.7% on average", "12.0 to 21.4% with every end from a new shingle, 16.5% on average", "2.3 to 5.3%, 3.6% on average"]) assert.ok(html.includes(s), s);
  const range = (/** @type {(r: any) => number} */ f) => { const x = rows.map(f); return `${Math.min(...x)} to ${Math.max(...x)}`; };
  const short = rows.filter((r) => r.hip.rule < r.hip.thrown.bundles);
  assert.equal(short.length, 5); assert.ok(html.includes("ran short on 5 of the 16, by 1 or 2 bundles, all on the two smaller houses"));
  assert.deepEqual([...new Set(short.map((r) => r.hip.thrown.bundles - r.hip.rule))].sort(), [1, 2]);
  assert.ok(short.every((r) => r.w <= 28));
  assert.equal(rows.filter((r) => r.gable.rule < r.gable.thrown.bundles).length, 0); assert.ok(html.includes("+ 10% was never short"));
  assert.equal(range((r) => r.gable.rule - r.gable.reused.bundles), "3 to 10"); assert.ok(html.includes("bought 3 to 10 bundles more than the reused layout"));
  assert.equal(range((r) => r.gable.rule - r.gable.thrown.bundles), "0 to 6"); assert.ok(html.includes("bought 0 to 6 bundles more than that layout"));
  assert.equal(range((r) => r.hip.rule - r.hip.reused.bundles), "3 to 13"); assert.ok(html.includes("15% bought 3 to 13 bundles too many"));
  assert.equal(range((r) => r.hip.reused.bundles - r.gable.reused.bundles), "0 to 2");
  assert.equal(range((r) => r.hip.thrown.bundles - r.gable.thrown.bundles), "3 to 6"); assert.ok(html.includes("0 to 2 more bundles than the gable with offcuts reused on both, and 3 to 6 more"));
  assert.equal(range((r) => r.gable.thrown.bundles - r.gable.reused.bundles), "2 to 4");
  assert.equal(range((r) => r.hip.thrown.bundles - r.hip.reused.bundles), "5 to 9"); assert.ok(html.includes("saved 2 to 4 bundles on the gables and 5 to 9 on the hips"));
  assert.ok(Math.abs((3 * SHINGLE.perBundle * SHINGLE.length * SHINGLE.exposure) / 144 - 101.5) < 0.05); assert.ok(html.includes("101.5 sq ft"));
});

test("the page is wired: sitemap, llms.txt, more-tools, FAQ matches JSON-LD, disclaimer, no MIT claim", () => {
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /<loc>\.\/how-many-bundles-of-shingles\.html<\/loc>/);
  assert.match(readFileSync(new URL("./llms.txt", import.meta.url), "utf8"), /how-many-bundles-of-shingles\.html/);
  assert.match(readFileSync(new URL("./more-tools.mjs", import.meta.url), "utf8"), /how-many-bundles-of-shingles\.html/);
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
