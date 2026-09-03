import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareReplica, replicaNote } from "./calc.mjs";

const html = readFileSync(new URL("./does-a-replica-beat-cross-region-pull.html", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const cdn = readFileSync(new URL("./does-a-cdn-cut-s3-egress.html", import.meta.url), "utf8");

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
  assert.match(scriptSource, /compareReplica/);
  assert.match(scriptSource, /replicaNote/);
  assert.match(scriptSource, /replica_compared/);
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
    ["Keep-pulling vs replica monthly bill", /compareReplica|pull\.monthly|replica\.monthly/],
    ["seed payback months", /monthsToRecoverSeed|replicaNote/],
    ["horizon total including seed", /horizonSavings|horizon/],
    ["break-even monthly pull", /breakEvenPullGb|replicaNote/],
  ];
  for (const [claim, pattern] of claims) {
    assert.match(featureList[1], new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html + scriptSource, pattern, `${claim} is listed but never used`);
  }
});

test("default demo figures in the copy match the calculator", () => {
  const result = compareReplica({
    replicaGb: 500,
    pullGbPerMonth: 800,
    crossRegionRate: 0.02,
    storageRate: 0.023,
    seedGb: 500,
    seedRate: 0.02,
    changeGbPerMonth: 20,
    changeRate: 0.02,
    horizonMonths: 12,
  });
  assert.equal(result.pull.monthly, 16);
  assert.equal(result.replica.monthly, 11.9);
  assert.equal(result.replica.horizon, 152.8);
  assert.equal(result.pull.horizon, 192);
  assert.match(html, /\$16\.00/);
  assert.match(html, /\$11\.90/);
  assert.match(html, /\$10\.00/);
  assert.match(html, /\$4\.10/);
  assert.match(html, /2\.4 months/);
  assert.match(html, /\$152\.80/);
  assert.match(html, /\$192\.00/);
  assert.match(html, /\$39\.20/);
  assert.match(html, /595 GB/);
  assert.match(html, /\$8\.00/);
  assert.equal(replicaNote(result).includes("the replica path is $4.10 cheaper"), true);
});

test("copy does not tell the operator to turn replication on", () => {
  assert.doesNotMatch(html, /should (add|enable|turn)|must enable|turn replication on/i);
});

test("index, CDN page, and replica page link each other", () => {
  assert.match(index, /does-a-replica-beat-cross-region-pull\.html/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /does-a-cdn-cut-s3-egress\.html/);
  assert.match(cdn, /does-a-replica-beat-cross-region-pull\.html/);
});
