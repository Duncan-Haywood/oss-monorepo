import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareCdn, cdnNote } from "./calc.mjs";

const html = readFileSync(new URL("./does-a-cdn-cut-s3-egress.html", import.meta.url), "utf8");
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

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareCdn/);
  assert.match(scriptSource, /cdnNote/);
  assert.match(scriptSource, /cdn_compared/);
});

test("every results column has a cell, and every cell has a column", () => {
  assert.ok(rowTemplate, "could not find the per-path <tr> template");
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
  const claims = [
    ["Origin-only vs CDN monthly bill", /compareCdn|originOnly/],
    ["miss-fetch gigabytes", /originFetch|missGb/],
    ["hit-rate floor", /hitRateFloorPercent|cdnNote/],
    ["annualized gap", /annualSavings|cdnNote/],
  ];
  for (const [claim, pattern] of claims) {
    assert.match(featureList[1], new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html + scriptSource, pattern, `${claim} is listed but never used`);
  }
});

test("default demo figures in the copy match the calculator", () => {
  const result = compareCdn({
    egressGb: 100,
    hitRatePercent: 80,
    originEgressRate: 0.09,
    cdnEgressRate: 0.085,
    originFetchRate: 0.09,
  });
  assert.equal(result.originOnly.total, 9);
  assert.equal(result.withCdn.total, 10.3);
  assert.match(html, /\$9\.00/);
  assert.match(html, /\$10\.30/);
  assert.match(html, /\$1\.30/);
  assert.match(html, /94\.4%/);
  assert.equal(cdnNote(result).includes("origin-only is $1.30 cheaper"), true);
});

test("copy does not tell the operator to turn a CDN on", () => {
  assert.doesNotMatch(html, /should add|must enable|turn (a )?CDN on|turn on CloudFront/i);
});

test("index and CDN page link each other", () => {
  assert.match(index, /does-a-cdn-cut-s3-egress\.html/);
  assert.match(html, /href="\.\/"/);
});
