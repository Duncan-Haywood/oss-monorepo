import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comparePassThrough } from "./audit.mjs";

const html = readFileSync(new URL("./should-i-bill-this-accessorial-to-the-customer.html", import.meta.url), "utf8");

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

test("pass-through page raw-text elements are closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("pass-through page imports the compare it claims to run", () => {
  assert.match(scriptSource, /comparePassThrough/);
  assert.match(scriptSource, /passThroughNote/);
  assert.match(scriptSource, /countUsage\("pass_through_compared"\)/);
});

test("disclaimer, no-SLA, and optional sponsors are visible on the pass-through page", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
});

test("default pass-through demo matches the FAQ copy", () => {
  const result = comparePassThrough({
    billed: 300,
    expected: 75,
    collectedFreight: 180,
    backCharge: 300,
    reviewHours: 1.5,
    reviewRate: 42,
  });
  assert.match(html, /\$180\.00 already collected/);
  assert.match(html, /\$300\.00/);
  assert.match(html, /\$75\.00 supported/);
  assert.match(html, /\$225\.00/);
  assert.match(html, /\$42\.00/);
  assert.match(html, /\$63\.00 labor/);
  assert.match(html, /5\.36 hours/);
  assert.equal(result.eat, -120);
  assert.equal(result.billCustomer, 180);
  assert.equal(result.reviewCredit, 42);
  assert.equal(result.reviewNoCredit, -183);
  assert.equal(result.labor, 63);
});

test("pass-through copy stays observational", () => {
  assert.doesNotMatch(html, /must bill|should refuse|you should invoice|file a claim now/i);
  assert.match(html, /not a reason to invoice a customer or to file a claim/);
});
