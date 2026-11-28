import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boardName, workedTakeoff } from "./takeoff-example.mjs";

const html = readFileSync(new URL("./how-to-do-a-framing-takeoff.html", import.meta.url), "utf8");
const cell = (label, n) => `<tr><td>${label}</td><td class="n">${n}</td></tr>`;
const t16 = workedTakeoff(16);
const t24 = workedTakeoff(24);

test("wall schedule, corners and tees on the page equal the plan's", () => {
  const w = t16.walls;
  assert.ok(html.includes(`<tr><td>Exterior</td><td class="n">${w.exterior}</td><td class="n">${w.exteriorFeet}</td></tr>`));
  assert.ok(html.includes(`<tr><td>Interior</td><td class="n">${w.interior}</td><td class="n">${w.interiorFeet}</td></tr>`));
  assert.ok(html.includes(`<tr><td>Total</td><td class="n">${w.exterior + w.interior}</td><td class="n">${w.totalFeet}</td></tr>`));
  assert.ok(html.includes(`${t16.corners} exterior corners and ${t16.tees} places`));
  assert.ok(html.includes(`${t16.openings.doors} doors and ${t16.openings.windows} windows`));
  assert.ok(html.includes(`house's ${t16.openings.doors + t16.openings.windows} openings`));
  assert.equal(t16.openings.wide, 3);
  assert.ok(html.includes("Three doors are wider than 4 ft"));
});

test("plate feet and piece counts per member equal the engine's layout", () => {
  assert.ok(html.includes(cell("Treated 2x4 bottom plate (exterior walls)", Math.round(t16.plateFeet["2x4 PT"]))));
  assert.ok(html.includes(cell("2x4 top plates, cap plates and interior bottom plates", Math.round(t16.plateFeet["2x4"]))));
  const c = t16.count;
  assert.ok(html.includes(`That is ${c.plate} plate pieces`));
  assert.ok(html.includes(`<strong>${c.stud} layout and end studs</strong> at 16 inches on center (${t24.count.stud} at 24)`));
  for (const [label, n] of [["King studs", c.king], ["Jack studs", c.jack], ["Header plies (2x10, two per opening)", c.header], ["Cripples (above headers and under sills)", c.cripple], ["Rough sills", c.sill]]) {
    assert.ok(html.includes(cell(label, n)), label);
  }
  assert.ok(html.includes(`There are ${c.king} kings, not ${2 * (t16.openings.doors + t16.openings.windows)}`));
  assert.ok(html.includes(`<strong>${c.corner} corner and ${c.tee} tee backing studs</strong>`));
  assert.equal(c.stud + c.king + c.corner + c.tee, t16.fullHeight);
  assert.equal(Object.values(c).reduce((a, b) => a + b, 0), t16.pieces);
  assert.ok(html.includes(`<strong>${t16.pieces} pieces</strong>, ${t16.fullHeight} of them full-height`));
});

test("the order table, totals, waste and bound equal the engine's order", () => {
  for (const l of t16.lines) assert.ok(html.includes(cell(`${l.size}, ${boardName(l)}`, l.qty)), `${l.size} ${l.length}`);
  const rows = [...html.matchAll(/<tr><td>2x(?:4|10)(?: PT)?, [^<]*<\/td><td class="n">\d+<\/td><\/tr>/g)].length;
  assert.equal(rows, t16.lines.length);
  assert.equal(t16.lines.reduce((s, l) => s + l.qty, 0), t16.boards);
  const precut = t16.lines.find((l) => l.label === "precut stud");
  assert.ok(html.includes(`precut studs (${precut?.qty} here)`));
  const ft = (x) => Math.round(x).toLocaleString("en-US");
  assert.ok(html.includes(`${t16.boards} boards, about ${ft(t16.boughtFeet)} lineal feet for ${ft(t16.neededFeet)} feet`));
  assert.ok(html.includes(`${(t16.waste * 100).toFixed(2)}% cutting waste, within ${(t16.gap * 100).toFixed(2)}%`));
});

test("the 24 inch and stud-per-foot comparisons follow from the layouts", () => {
  assert.ok(html.includes(`studs from ${t16.count.stud} to ${t24.count.stud} and the cripples from ${t16.count.cripple} to ${t24.count.cripple}`));
  const ft = (x) => Math.round(x).toLocaleString("en-US");
  const less = Math.round(100 * (1 - t24.boughtFeet / t16.boughtFeet));
  assert.ok(html.includes(`from about ${ft(t16.boughtFeet)} to ${ft(t24.boughtFeet)} lineal feet, ${less}% less`));
  assert.ok(html.includes(`the rule says ${t16.walls.totalFeet} studs; the layout has ${t16.fullHeight} full-height members plus ${t16.count.jack} jacks and ${t16.count.cripple} cripples`));
  assert.ok(html.includes(`One stud per foot says ${t16.walls.totalFeet}; the layout has ${t16.fullHeight} full-height members`));
});

test("the page is wired: sitemap, llms.txt, FAQ and HowTo JSON-LD match the text, disclaimer, licence notice", () => {
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /<loc>\.\/how-to-do-a-framing-takeoff\.html<\/loc>/);
  const llms = readFileSync(new URL("./llms.txt", import.meta.url), "utf8");
  assert.match(llms, /how-to-do-a-framing-takeoff\.html/);
  assert.ok(llms.includes(`${t16.pieces} pieces bought as ${t16.boards} boards at ${(t16.waste * 100).toFixed(2)}%`));
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.equal(blocks.find((b) => b["@type"] === "HowTo")?.step.length, 6);
  assert.match(html, /No warranty/);
  assert.match(html, /all-rights-reserved notice/);
  assert.doesNotMatch(html, /MIT licence/);
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  assert.ok(desc.length <= 160, `description ${desc.length} chars`);
});
