// Structural tests for the WFS size-tier repack page.
//
// The load-bearing one is the last group: every dollar figure printed in the
// copy and the FAQ is asserted against the live engine, so a fee-table edit
// cannot leave a published number behind. That is the drift the tiktok-shop
// page tests were added to catch, and it applies to any page that quotes its
// own defaults in prose a crawler will read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareWfsBox, wfsBoxNote, sizeTierGaps, STANDARD_TIER_LIMITS } from "./calc.mjs";

const html = readFileSync(new URL("./does-a-smaller-box-cut-wfs-fees.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");
const rowTemplate = scriptSource.match(/<tr class="\$\{winner[\s\S]*?<\/tr>/);

// Exactly the values the form ships with.
const defaults = {
  length: 19,
  width: 13,
  height: 7,
  weightLb: 3,
  newLength: 17.5,
  newWidth: 13,
  newHeight: 7,
  newWeightLb: 2.9,
  repackCostPerUnit: 0.35,
  monthlyUnits: 120,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareWfsBox/);
  assert.match(scriptSource, /wfsBoxNote/);
  assert.match(scriptSource, /wfs_box_compared/);
});

test("the form ships the defaults the copy quotes", () => {
  for (const [id, value] of Object.entries(defaults)) {
    const field = markup.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
    assert.ok(field, `no form field for ${id}`);
    assert.equal(Number(field[1]), value, `${id} default drifted from the copy`);
  }
});

test("every results column has a cell, and every cell has a column", () => {
  assert.ok(rowTemplate, "could not find the per-box <tr> template");
  const headers = [...markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim());
  const cells = (rowTemplate[0].match(/<t[hd][\s>]/g) || []).length;
  assert.equal(
    cells,
    headers.length,
    `table declares ${headers.length} columns (${headers.join(" | ")}) but the row emits ${cells} cells`,
  );
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  for (const claim of [
    "size tier for the carton as shipped",
    "per-measurement gap to the Standard ceiling",
    "fulfillment fee saving per unit",
    "repack cost netted off",
    "monthly saving at volume",
    "break-even repack cost",
  ]) {
    assert.ok(featureList[1].includes(claim), `featureList is missing "${claim}"`);
  }
  assert.match(scriptSource, /row\.tierLabel/);
  assert.match(scriptSource, /row\.cubicFeet/);
  assert.match(scriptSource, /row\.fulfillmentFee/);
  assert.match(scriptSource, /gaps\.blocking/);
  assert.match(scriptSource, /monthlySaving/);
});

test("the gap list renders the value, the overage and the ceiling", () => {
  // "Not Standard" is what a fee preview already says. The whole point of the
  // page is the three numbers behind it, so assert all three reach the DOM.
  assert.match(scriptSource, /row\.value\.toFixed/);
  assert.match(scriptSource, /row\.over\.toFixed/);
  assert.match(scriptSource, /row\.limit/);
  assert.match(scriptSource, /gaps\.clears/, "a box inside Standard needs its own branch");
});

test("the gap list describes the carton the seller ships, not the proposed repack", () => {
  // Found by driving the page, not by the unit suite. Reporting the repacked
  // box's gaps meant the shipped defaults — where the repack already clears —
  // rendered "nothing", so the one inch actually costing $3.85 a unit was never
  // named on the view every visitor lands on first.
  assert.match(scriptSource, /const gaps = result\.current\.gaps/);
  assert.match(scriptSource, /const repackGaps = result\.repacked\.gaps/);
  assert.match(markup, /What is keeping your carton out of Standard/);

  const result = compareWfsBox(defaults);
  assert.equal(result.current.gaps.clears, false, "the default carton misses Standard");
  assert.equal(result.repacked.gaps.clears, true, "and the default repack clears it");
});

test("the Standard ceilings quoted in the copy are the ones the engine enforces", () => {
  // The copy wraps across lines, so compare against a flattened copy of it.
  const flat = markup.replace(/\s+/g, " ");
  assert.match(flat, new RegExp(`longest side at or under ${STANDARD_TIER_LIMITS.longestIn} in`));
  assert.match(flat, new RegExp(`median at or under ${STANDARD_TIER_LIMITS.medianIn} in`));
  assert.match(flat, new RegExp(`shortest at or under ${STANDARD_TIER_LIMITS.shortestIn} in`));
  assert.match(flat, new RegExp(`weight at or under ${STANDARD_TIER_LIMITS.weightLb} lb`));
});

test("FAQ and body figures match the live comparison", () => {
  const result = compareWfsBox(defaults);
  assert.equal(result.winner, "repacked");
  assert.equal(result.current.tierLabel, "Oversize");
  assert.equal(result.repacked.tierLabel, "Standard");

  assert.match(html, new RegExp(`Oversize at \\$${result.current.fulfillmentFee.toFixed(2)}`));
  assert.match(html, new RegExp(`Standard at \\$${result.repacked.fulfillmentFee.toFixed(2)}`));
  assert.match(html, new RegExp(`\\$${result.feeSaving.toFixed(2)}`));
  assert.match(html, new RegExp(`\\$${result.netPerUnit.toFixed(2)} a unit`));
  assert.match(html, new RegExp(`\\$${result.monthlySaving.toFixed(2)} across ${result.monthlyUnits} units`));
  assert.match(wfsBoxNote(result), /falls \$3\.85 per unit/);
});

test("the copy's named blocking measurement is the one the engine blocks on", () => {
  const gaps = sizeTierGaps({ length: 19, width: 13, height: 7, weightLb: 3 });
  assert.deepEqual(gaps.blocking.map((row) => row.id), ["longest"]);
  assert.match(html, new RegExp(`longest side, by ${gaps.blocking[0].over.toFixed(2)} in`));
});

test("the two not-worth-it figures in the FAQ are real", () => {
  const noop = compareWfsBox({ ...defaults, newLength: 18.9, newWidth: 13, newHeight: 7, newWeightLb: 3 });
  assert.equal(noop.winner, "current");
  assert.match(html, new RegExp(`18\\.9 in is still Oversize and costs \\$${Math.abs(noop.monthlySaving).toFixed(2)} a month`));

  const pricey = compareWfsBox({ ...defaults, repackCostPerUnit: 5 });
  assert.equal(pricey.winner, "current");
  assert.match(html, new RegExp(`\\$${Math.abs(pricey.netPerUnit).toFixed(2)} a unit worse`));
  assert.match(html, new RegExp(`\\$${Math.abs(pricey.monthlySaving).toFixed(2)} a month`));
  assert.match(html, new RegExp(`break-even repack cost on the defaults is \\$${pricey.breakEvenRepackCost.toFixed(2)}`));
});

test("the sitemap and main calculator point at this page", () => {
  assert.match(sitemap, /does-a-smaller-box-cut-wfs-fees\.html/);
  assert.match(index, /does-a-smaller-box-cut-wfs-fees\.html/);
});

test("disclaimer and no-SLA clause are rendered markup", () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /Best-effort hosting, no SLA/);
});
