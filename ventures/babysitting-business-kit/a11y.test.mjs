// Accessibility checks that need no browser: tab keyboard order, the colour pairs the
// app uses against WCAG 2 contrast, and the CSS for focus rings and touch targets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextTab, contrast } from "./tabs.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("arrow keys wrap around the tab bar; Home and End jump to the ends; other keys are ignored", () => {
  assert.equal(nextTab(0, "ArrowRight", 9), 1);
  assert.equal(nextTab(8, "ArrowRight", 9), 0);
  assert.equal(nextTab(0, "ArrowLeft", 9), 8);
  assert.equal(nextTab(4, "ArrowUp", 9), 3);
  assert.equal(nextTab(4, "ArrowDown", 9), 5);
  assert.equal(nextTab(4, "Home", 9), 0);
  assert.equal(nextTab(4, "End", 9), 8);
  assert.equal(nextTab(4, "Enter", 9), -1);
  assert.equal(nextTab(0, "ArrowRight", 0), -1);
});

test("contrast() matches known WCAG values", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#fff", "#fff"), 1);
  assert.equal(contrast("#767676", "#ffffff"), 4.54);
});

test("every text colour pair in the app's palette meets WCAG AA (4.5:1), and input borders meet 3:1", () => {
  const v = Object.fromEntries([...html.match(/:root \{([^}]*)\}/)[1].matchAll(/--(\w+):(#[0-9a-f]{3,6})/gi)].map((m) => [m[1], m[2]]));
  const pairs = [
    [v.ink, v.bg, "body text"], [v.soft, v.bg, "notes"], [v.soft, v.card, "notes on cards"], [v.accent, v.bg, "links"],
    [v.accent, v.accent2, "tabs and secondary buttons"], ["#fff", v.accent, "selected tab and primary buttons"],
    [v.ok, "#dcefdc", "good pill"], [v.warn, "#fdf0d5", "warm pill"], ["#1f4a5d", "#e3e9ef", "cool pill"], [v.bad, "#f8d9d6", "bad pill"],
    [v.ink, "#faf5f8", "message boxes"],
  ];
  for (const [fg, bg, what] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${what}: ${fg} on ${bg} is ${contrast(fg, bg)}`);
  const border = /input, select, textarea \{[^}]*border: 1px solid (#[0-9a-f]{6})/.exec(html)[1];
  assert.ok(contrast(border, "#ffffff") >= 3, `input border ${border} is ${contrast(border, "#ffffff")}:1`);
});

test("focus is always visible, and on phones the tab bar sits at the bottom with 44 px targets", () => {
  assert.match(html, /:focus-visible \{ outline: 3px solid/);
  const phone = html.slice(html.indexOf("@media (max-width: 720px) {\n"));
  assert.match(phone, /nav \{ position: fixed;[^}]*bottom: 0/);
  assert.match(phone, /overflow-x: auto/);
  assert.match(phone, /button, input, select \{ min-height: 44px; \}/);
  assert.match(phone, /button\.small \{ min-height: 44px; min-width: 44px;/);
  assert.match(html, /viewport-fit=cover/);
});

test("the tab bar is wired for keyboards and screen readers", () => {
  assert.match(html, /<nav role="tablist" aria-label="Sections">/);
  assert.match(html, /import \{ enhanceTabs \} from "\.\/tabs\.mjs"/);
  assert.match(html, /enhanceTabs\(document, show\)/);
});
