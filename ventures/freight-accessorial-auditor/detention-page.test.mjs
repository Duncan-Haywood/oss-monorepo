import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reviewDetention } from "./audit.mjs";

const html = readFileSync(new URL("./should-i-dispute-this-detention-charge.html", import.meta.url), "utf8");

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

test("detention page raw-text elements are closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("detention page imports the clock review it claims to run", () => {
  assert.match(scriptSource, /reviewDetention/);
  assert.match(scriptSource, /detentionNote/);
  assert.match(scriptSource, /countUsage\("detention_compared"\)/);
});

test("disclaimer, no-SLA, and optional sponsors are visible on the detention page", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
});

test("default detention demo matches the FAQ copy", () => {
  const result = reviewDetention({
    dockMinutes: 180,
    freeMinutes: 120,
    ratePerHour: 75,
    billedAmount: 300,
  });
  assert.match(html, /\$75\.00 expected/);
  assert.match(html, /\$300\.00/);
  assert.match(html, /\$225\.00 above the clock/);
  assert.match(html, /4\.00 hours/);
  assert.equal(result.expected, 75);
  assert.equal(result.variance, 225);
  assert.equal(result.impliedBilledHours, 4);
});

test("detention copy stays observational", () => {
  assert.doesNotMatch(html, /must dispute|should refuse|you should dispute/i);
  assert.match(html, /not a determination that the charge is wrong/);
});
