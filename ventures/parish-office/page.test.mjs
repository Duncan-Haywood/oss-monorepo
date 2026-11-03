import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "mass-intention-rules.html", "parish-tools.html"];

test("every page carries the disclaimer and the sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not canonical, legal, tax, or financial advice/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
});

test("the tool page states privacy, labels its inputs, and posts nothing", () => {
  const html = page("index.html");
  assert.match(html, /Everything runs in your browser/);
  for (const id of ["offering", "perWeek", "warnDays", "iId", "iReceived", "iDonor", "iText", "iOffering", "iRequested", "mFrom", "mWeeks", "mCelebrant", "mTimes"]) {
    assert.match(html, new RegExp(`<label for="${id}"`), id);
  }
  assert.doesNotMatch(html, /XMLHttpRequest|sendBeacon|method:\s*"POST"/);
  // the only fetch is the sample book shipped next to the page
  assert.deepEqual([...html.matchAll(/fetch\("([^"]+)"/g)].map((m) => m[1]), ["./examples/sample-book.json"]);
});

test("every id the script reads exists in the markup", () => {
  const html = page("index.html");
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  for (const [, id] of script.matchAll(/\$\("(\w+)"\)/g)) assert.match(html, new RegExp(`id="${id}"`), id);
});

test("JSON-LD parses and the module script is valid syntax", () => {
  for (const p of ["index.html", "mass-intention-rules.html"]) {
    const html = page(p);
    for (const [, b] of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(b);
  }
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(page("index.html"));
  assert.doesNotThrow(() => new Function(m[1].replace(/^\s*import .*$/gm, "").replace(/\bawait\b/g, "")));
});

test("quoted canon text on the rules page matches the engine's quotes", async () => {
  const { CANONS } = await import("./intentions.mjs");
  const html = page("mass-intention-rules.html");
  for (const k of [948, 953, "955.2"]) assert.ok(html.includes(CANONS[k]), String(k));
});

// Closest sibling in the religious-organisations direction: the monastery
// website builder. Without a one-hop link a crawler may never reach it.
test("index links one hop to the monastery-site sibling", () => {
  assert.match(page("index.html"), /href="\.\.\/monastery-site\/"/);
  assert.match(page("index.html"), /website builder for monks and nuns/);
});
