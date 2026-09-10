import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { computeWashAndFold, INPUT_FIELDS } from "./calculator.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const html = page("index.html");

test("the page carries the no-warranty, no-SLA and privacy clauses and the sponsor link", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test("the privacy copy names every event counted and says nothing is uploaded", () => {
  for (const event of ["estimate", "example_loaded", "inputs_saved", "link_copied"]) {
    assert.match(html, new RegExp(`<code>${event}</code>`), `${event} must be disclosed`);
  }
  assert.match(html, /never uploaded/);
  assert.match(html, /Do Not Track and Global Privacy Control/);
  assert.match(html, /id="optout"/, "the opt-out control must be on the page");
});

test("saving to local storage is disclosed wherever it happens", () => {
  assert.match(html, /localStorage\.setItem\(DRAFT_KEY/, "the page saves inputs locally");
  assert.match(
    html,
    /this browser's local storage on this device only/,
    "the footer must say local storage is where a saved draft goes",
  );
  assert.match(html, /id="forget"/, "a saved draft must be deletable from the page");
});

test("the SEO head carries a title, description, canonical, OG tags and JSON-LD", () => {
  assert.match(html, /<title>Wash and Fold Price Per Pound Calculator[^<]*<\/title>/);
  assert.match(html, /<meta name="description" content="Free wash and fold pricing calculator/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /"@type":"SoftwareApplication"/);
  assert.match(html, /"@type":"FAQPage"/);
});

test("every FAQ answer in the JSON-LD is also visible copy on the page", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1].trim()))
    .filter((block) => block["@type"] === "FAQPage");
  assert.equal(blocks.length, 1);
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ");
  assert.ok(blocks[0].mainEntity.length >= 4, "at least four questions answered");
  for (const entry of blocks[0].mainEntity) {
    assert.ok(
      visible.includes(entry.name),
      `question not visible on the page: ${entry.name}`,
    );
    assert.ok(
      visible.includes(entry.acceptedAnswer.text.replace(/\s+/g, " ")),
      `answer not visible on the page: ${entry.name}`,
    );
  }
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("index links one hop to the dog-walking-route-pricing sibling", () => {
  assert.ok(
    html.includes('href="../dog-walking-route-pricing/"'),
    "index must link ../dog-walking-route-pricing/ so a crawler reaches that tool in one hop",
  );
});

test("every field the calculator reads has a labelled input on the page", () => {
  const fields = [
    "pricePerPound", "avgOrderPounds", "minimumCharge", "minimumOrderPounds",
    "laborMinutesPerPound", "fixedMinutesPerOrder", "wagePerHour", "payrollLoadPct",
    "poundsPerWasherLoad", "washCostPerLoad", "poundsPerDryerLoad", "dryCostPerLoad",
    "suppliesCostPerPound", "deliveryStopsPerOrder", "driveMinutesPerStop", "milesPerStop",
    "vehicleCostPerMile", "monthlyOverhead", "monthlyPounds", "targetMarginPct",
    "monthlyProfitGoal",
  ];
  for (const field of fields) {
    assert.match(html, new RegExp(`<input type="number" id="${field}"`), `${field} needs an input`);
    assert.match(
      html,
      new RegExp(`<label for="${field}"`),
      `${field} needs a label, or a screen reader announces it as "edit, number" and nothing else`,
    );
  }
  // The page reads its field list from calculator.mjs's INPUT_FIELDS rather
  // than a second, hand-typed array in the page script -- so a field added
  // to the arithmetic is read back and shareable the moment it exists,
  // instead of silently dropping out of sync the way a hardcoded copy would.
  assert.match(html, /const FIELDS = INPUT_FIELDS;/);
  for (const field of fields) {
    assert.ok(INPUT_FIELDS.includes(field), `${field} must be in calculator.mjs's INPUT_FIELDS`);
  }
});

test("the page's own default inputs compute a coherent, profitable example", () => {
  const defaults = Object.fromEntries(
    [...html.matchAll(/<input type="number" id="(\w+)"[^>]*value="([\d.]+)"/g)].map((m) => [
      m[1],
      Number(m[2]),
    ]),
  );
  const result = computeWashAndFold(defaults);
  assert.ok(result.costPerPound > 0, "the shipped defaults must produce a real cost");
  assert.ok(
    defaults.pricePerPound > result.costPerPound,
    "the shipped example should not open on a loss-making price",
  );
  assert.ok(result.findings.some((f) => f.id === "rates-are-yours"));
});

test("the page's EXAMPLE button values match the shipped input defaults", () => {
  const defaults = Object.fromEntries(
    [...html.matchAll(/<input type="number" id="(\w+)"[^>]*value="([\d.]+)"/g)].map((m) => [
      m[1],
      Number(m[2]),
    ]),
  );
  const block = html.match(/const EXAMPLE = \{([\s\S]*?)\};/)[1];
  const example = Object.fromEntries(
    [...block.matchAll(/(\w+):\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]),
  );
  assert.deepEqual(example, defaults);
});

test("the page imports the calculation, the usage counter, and the share codec rather than reimplementing them", () => {
  assert.match(html, /import \{ computeWashAndFold, INPUT_FIELDS \} from "\.\/calculator\.mjs"/);
  assert.match(html, /import \{ recordUsage, setUsageOptOut, usageOptedOut \} from "\.\/usage\.mjs"/);
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from "\.\/share\.mjs"/);
  assert.match(html, /run\("estimate"\)/, "calculating counts an estimate event");
  assert.match(html, /recordUsage\("inputs_saved"\)/, "saving a draft counts its own event");
  assert.match(html, /recordUsage\("link_copied"\)/, "copying a link counts its own event");
});

test("a shared link round-trips through the page's own encode/decode functions", async () => {
  const { encodeInputs, decodeInputs } = await import("./share.mjs");
  const sample = Object.fromEntries(INPUT_FIELDS.map((id, i) => [id, i + 1]));
  const encoded = encodeInputs(sample);
  assert.deepEqual(decodeInputs(`#${encoded}`), sample);
});

test("copying a link is wired to the id the page actually renders", () => {
  assert.match(html, /id="copy-link"/);
  assert.match(html, /\$\("#copy-link"\)\.addEventListener\("click"/);
});
