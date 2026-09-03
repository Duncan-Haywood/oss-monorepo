import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareStorageClass, storageClassNote } from "./calc.mjs";

const html = readFileSync(new URL("./does-infrequent-access-still-beat-standard.html", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const cdn = readFileSync(new URL("./does-a-cdn-cut-s3-egress.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

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
  assert.match(scriptSource, /compareStorageClass/);
  assert.match(scriptSource, /storageClassNote/);
  assert.match(scriptSource, /storage_class_compared/);
});

test("every results column has a cell, and every cell has a column", () => {
  assert.ok(rowTemplate, "could not find the per-class <tr> template");
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
    ["Standard vs infrequent monthly bill", /compareStorageClass|standard\.total/],
    ["retrieve-fee line", /retrieve|infrequentRetrieveRate/],
    ["restore-GB ceiling", /retrieveGbCeiling|storageClassNote/],
    ["annualized gap", /annualSavings|storageClassNote/],
  ];
  for (const [claim, pattern] of claims) {
    assert.match(featureList[1], new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html + scriptSource, pattern, `${claim} is listed but never used`);
  }
});

test("default demo figures in the copy match the calculator", () => {
  const result = compareStorageClass({
    storageGb: 500,
    retrieveGb: 150,
    standardStorageRate: 0.023,
    infrequentStorageRate: 0.0125,
    infrequentRetrieveRate: 0.04,
  });
  assert.equal(result.standard.total, 11.5);
  assert.equal(result.infrequent.total, 12.25);
  assert.match(html, /\$11\.50/);
  assert.match(html, /\$12\.25/);
  assert.match(html, /\$0\.75/);
  assert.match(html, /131\.3 GB/);
  assert.match(html, /\$10\.25/);
  assert.equal(storageClassNote(result).includes("standard class is $0.75 cheaper"), true);
});

test("copy does not tell the operator to change a storage class", () => {
  assert.doesNotMatch(html, /should move|must archive|enable infrequent|turn on IA|change (the |your )?storage class/i);
});

test("index, CDN page, and sitemap link the storage-class extra", () => {
  assert.match(index, /does-infrequent-access-still-beat-standard\.html/);
  assert.match(cdn, /does-infrequent-access-still-beat-standard\.html/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /does-a-cdn-cut-s3-egress\.html/);
  assert.match(html, /does-a-replica-beat-cross-region-pull\.html/);
  assert.match(sitemap, /does-infrequent-access-still-beat-standard\.html/);
});

test("disclaimer, no-SLA, and optional sponsors are visible", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
});
