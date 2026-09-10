import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { computeDecorationJob, METHODS } from "./calculator.mjs";

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

test("the disclaimer disclaims artwork rights, which this tool cannot know", () => {
  assert.match(
    html,
    /rights to reproduce any artwork/,
    "a decorator's main legal exposure is printing art they were not licensed to print",
  );
});

test("the privacy copy names every event counted and says nothing is uploaded", () => {
  for (const event of ["estimate", "example_loaded", "inputs_saved"]) {
    assert.match(html, new RegExp(`<code>${event}</code>`), `${event} must be disclosed`);
  }
  assert.match(html, /never transmitted/);
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
  assert.match(html, /<title>Screen Printing &amp; Embroidery Price Calculator[^<]*<\/title>/);
  assert.match(html, /<meta name="description" content="Free screen printing, embroidery and DTF pricing calculator/);
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
    assert.ok(visible.includes(entry.name), `question not visible on the page: ${entry.name}`);
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

test("index links one hop to the 3d-print-price-calculator sibling", () => {
  assert.ok(
    html.includes('href="../3d-print-price-calculator/"'),
    "index must link ../3d-print-price-calculator/ so a crawler reaches that tool in one hop",
  );
});

test("every field the calculator reads has a labelled input on the page", () => {
  const fields = [
    "quantity", "pricePerPiece", "setupFeeCharged", "locations", "targetMarginPct",
    "colorsPerLocation", "screenSetupCost", "pressPiecesPerHour", "inkCostPerPiecePerColor",
    "stitchCount", "digitizingCostPerLocation", "stitchesPerMinute", "heads",
    "hoopMinutesPerPiece", "threadCostPer1000Stitches", "backingCostPerPlacement",
    "artWidthIn", "artHeightIn", "filmCostPerSquareInch", "pressSecondsPerLocation",
    "blankCostPerPiece", "spoilagePct", "wagePerHour", "payrollLoadPct", "artMinutes",
    "finishMinutesPerPiece", "monthlyOverhead", "monthlyPieces",
  ];
  for (const field of fields) {
    assert.match(html, new RegExp(`<input type="number" id="${field}"`), `${field} needs an input`);
    assert.match(
      html,
      new RegExp(`<label for="${field}"`),
      `${field} needs a label, or a screen reader announces it as "edit, number" and nothing else`,
    );
  }
  const listed = html.match(/const FIELDS = \[([\s\S]*?)\];/)[1];
  for (const field of fields) {
    assert.ok(listed.includes(`"${field}"`), `${field} must be read back by the page script`);
  }
});

test("the method selector is labelled and offers exactly the methods the calculator knows", () => {
  assert.match(html, /<label for="method"/, "the select needs a label like every other control");
  const options = [...html.matchAll(/<option value="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...options].sort(),
    [...METHODS].sort(),
    "an option the calculator does not implement would silently fall back to screen printing",
  );
});

test("each method's fieldset exists so a saved draft round-trips every method", () => {
  for (const method of METHODS) {
    assert.match(html, new RegExp(`id="fs-${method}"`), `${method} needs its own fieldset`);
  }
  // Hidden, not removed: removing them would drop the other methods' numbers
  // from a saved draft the moment the shop switched method.
  assert.match(html, /\$\(`#fs-\$\{name\}`\)\.hidden = name !== method/);
});

test("the page's own default inputs compute a coherent, profitable example", () => {
  const defaults = Object.fromEntries(
    [...html.matchAll(/<input type="number" id="(\w+)"[^>]*value="([\d.]+)"/g)].map((m) => [
      m[1],
      Number(m[2]),
    ]),
  );
  const result = computeDecorationJob({ ...defaults, method: "screen-print" });
  assert.ok(result.costPerPiece > 0, "the shipped defaults must produce a real cost");
  assert.ok(
    defaults.pricePerPiece > result.breakEvenPricePerPiece,
    "the shipped example should not open on a loss-making price",
  );
  assert.ok(result.findings.some((f) => f.id === "rates-are-yours"));
});

test("the shipped defaults are coherent under every method, not only the default one", () => {
  const defaults = Object.fromEntries(
    [...html.matchAll(/<input type="number" id="(\w+)"[^>]*value="([\d.]+)"/g)].map((m) => [
      m[1],
      Number(m[2]),
    ]),
  );
  for (const method of METHODS) {
    const result = computeDecorationJob({ ...defaults, method });
    assert.ok(result.costPerPiece > 0, `${method} produced no cost`);
    assert.ok(Number.isFinite(result.breakEvenPricePerPiece), `${method} break-even not finite`);
    assert.ok(
      result.quantityBreaks.every((b) => Number.isFinite(b.costPerPiece)),
      `${method} break table has a non-finite row`,
    );
  }
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

test("the page imports the calculation and the usage counter rather than reimplementing them", () => {
  assert.match(html, /import \{ computeDecorationJob \} from "\.\/calculator\.mjs"/);
  assert.match(html, /import \{ recordUsage, setUsageOptOut, usageOptedOut \} from "\.\/usage\.mjs"/);
  assert.match(html, /run\("estimate"\)/, "calculating counts an estimate event");
  assert.match(html, /recordUsage\("inputs_saved"\)/, "saving a draft counts its own event");
});

test("every table wide enough to overflow a phone is in its own horizontal scroller", () => {
  const tables = [...html.matchAll(/<table>/g)].length;
  const scrollers = [...html.matchAll(/<div class="scroller">/g)].length;
  assert.equal(
    tables,
    scrollers,
    "each table needs a scroller wrapper, or the page body scrolls sideways at 360px",
  );
});
