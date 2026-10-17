import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const guide = readFileSync(new URL("./why-the-irs-tests-your-s-corp-salary.html", import.meta.url), "utf8");
const vsPage = readFileSync(new URL("./vs-rcreports-and-a-paid-valuation-report.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("the entry page wires the form, result panel, and factor checklist without a build step", () => {
  assert.match(html, /from '\.\/calc\.mjs'/);
  assert.match(html, /id="entry-form"/);
  assert.match(html, /name="plannedSalary"/);
  assert.match(html, /name="marketWageFullTime"/);
  assert.match(html, /id="filingStatus"/);
  assert.match(html, /id="factors"/);
  assert.match(html, /assessed/);
  assert.match(html, /sample_loaded/);
});

test("the entry page carries the standard disclaimer, privacy, and sponsor clauses", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /Nothing is uploaded/);
});

test("the entry page never claims to be a determination and disclaims the safe-harbor myth", () => {
  assert.match(html, /not a determination/);
  assert.match(html, /no IRS safe-harbor percentage|no IRS-published safe-harbor/i);
  assert.doesNotMatch(html, /this tool guarantees|we guarantee/i);
});

test("every element toggled by [hidden] and using flex/grid layout has an explicit [hidden] override rule", () => {
  const hiddenIds = ["result", "row"];
  for (const id of hiddenIds) {
    assert.match(html, new RegExp(`\\.${id}\\[hidden\\]\\s*\\{\\s*display:\\s*none`), `missing [hidden] override for .${id}`);
  }
});

test("the usage-counting control is opt-in and honours Do Not Track and Global Privacy Control", () => {
  assert.match(html, /off by default/);
  assert.match(html, /navigator\.doNotTrack/);
  assert.match(html, /navigator\.globalPrivacyControl/);
});

test("index links to the explainer and comparison pages", () => {
  assert.match(html, /href="why-the-irs-tests-your-s-corp-salary\.html"/);
  assert.match(html, /href="vs-rcreports-and-a-paid-valuation-report\.html"/);
  assert.match(html, /href="vs-picking-a-round-number\.html"/);
});

test("the comparison page links back to the calculator, carries the trademark disclaimer, and valid FAQPage JSON-LD matching visible text", () => {
  assert.match(vsPage, /href="\.\/"/);
  assert.match(vsPage, /not\s+affiliated\s+with/i);
  assert.match(vsPage, /RCReports/);
  const blocks = [...vsPage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the comparison page");
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(vsPage.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(vsPage.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test("the comparison page carries the no-warranty clause and is listed in the venture sitemap", () => {
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /Nothing leaves your browser/);
  assert.match(sitemap, /vs-rcreports-and-a-paid-valuation-report\.html/);
});

test("no module in this venture can reach the network", () => {
  const calc = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(calc, /\bfetch\(/);
  assert.doesNotMatch(calc, /XMLHttpRequest/);
  assert.doesNotMatch(html, /\bfetch\(/);
});

test("the guide page stays crawlable, is listed in the sitemap, and links back to the tool", () => {
  assert.match(guide, /<title>Why Does the IRS Test Your S-Corp Salary\?/);
  assert.match(guide, /name="description"/);
  assert.match(guide, /rel="canonical"/);
  assert.match(guide, /href="\.\/"/);
  assert.match(sitemap, /why-the-irs-tests-your-s-corp-salary\.html/);
});

test("both pages carry FAQPage JSON-LD that parses as valid JSON", () => {
  for (const page of [html, guide]) {
    const matches = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(matches.length >= 1, "expected at least one JSON-LD block");
    for (const match of matches) {
      assert.doesNotThrow(() => JSON.parse(match[1]));
    }
  }
});

test("the entry page renders the factor checklist from calc.mjs's NINE_FACTORS rather than a second, restated copy", () => {
  assert.match(html, /import \{ assess, FILING_STATUS_OPTIONS, NINE_FACTORS, loadState \} from '\.\/calc\.mjs'/);
  assert.match(html, /NINE_FACTORS\.map/);
});
