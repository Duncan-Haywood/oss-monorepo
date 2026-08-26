import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reviewFuelSurcharge } from "./audit.mjs";

const html = readFileSync(new URL("./does-this-fuel-surcharge-match-the-contract.html", import.meta.url), "utf8");

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

const { scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");

test("fuel page raw-text elements are closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("fuel page imports the review it claims to run", () => {
  assert.match(scriptSource, /reviewFuelSurcharge/);
  assert.match(scriptSource, /fuelSurchargeNote/);
  assert.match(scriptSource, /countUsage\("fuel_surcharge_compared"\)/);
});

test("disclaimer, no-SLA, and optional sponsors are visible on the fuel page", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
});

test("default fuel demo matches the FAQ copy", () => {
  const result = reviewFuelSurcharge({
    linehaul: 1200,
    contractPercent: 28,
    billedAmount: 412,
    indexPercent: 26,
    indexAdder: 2,
  });
  assert.match(html, /\$1,200\.00 linehaul/);
  assert.match(html, /\$336\.00/);
  assert.match(html, /\$412\.00/);
  assert.match(html, /34\.33% of[\s\S]*linehaul/);
  assert.match(html, /\$76\.00 above the contract/);
  assert.match(html, /26% plus 2 points/);
  assert.equal(result.expectedFromContract, 336);
  assert.equal(result.varianceVsContract, 76);
  assert.equal(result.billedPercent, 34.33);
  assert.equal(result.indexAppliedPercent, 28);
});

test("fuel copy stays observational", () => {
  assert.doesNotMatch(html, /must dispute|should refuse|you should dispute/i);
  assert.match(html, /not a determination that the charge is wrong/);
  assert.match(html, /does not fetch DOE/);
});
