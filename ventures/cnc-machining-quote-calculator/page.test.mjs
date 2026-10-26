import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { BREAK_QUANTITIES, STOCK_FORMS, computeMachiningJob } from "./calculator.mjs";

const INDEX = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const GUIDE = readFileSync(
  new URL("./setup-fee-or-in-the-part-price.html", import.meta.url),
  "utf8",
);
const VERSUS = readFileSync(
  new URL("./vs-quoting-in-a-spreadsheet.html", import.meta.url),
  "utf8",
);
const PAGES = {
  "index.html": INDEX,
  "setup-fee-or-in-the-part-price.html": GUIDE,
  "vs-quoting-in-a-spreadsheet.html": VERSUS,
};

/** Every id the page's own script reads out of the form. Kept here rather than
 *  imported, so a field silently renamed in one place and not the other fails. */
const FORM_FIELDS = [
  "quantity", "pricePerPart", "setupFeeCharged", "scrapPct",
  "stockUnitCost", "partLengthIn",
  "barLengthIn", "barEndLossIn", "partingAllowanceIn",
  "sheetLengthIn", "sheetWidthIn", "partWidthIn", "nestGapIn",
  "materialCostPerPart",
  "cycleMinutesPerPart", "handlingMinutesPerPart", "machineBurdenPerHour",
  "hourlyWage", "burdenRate", "overheadRate", "targetMargin",
  "setupHours", "programmingHours", "amortiseProgrammingOverParts", "firstArticleHours",
  "toolCostPerCuttingEdge", "partsPerCuttingEdge", "inspectionMinutesPerPart",
  "outsideCostPerPart", "outsideLotMinimum",
];

test("every field the script reads exists as an input on the page", () => {
  for (const id of FORM_FIELDS) {
    assert.match(
      INDEX,
      new RegExp(`<input[^>]*\\bid="${id}"`),
      `no input with id="${id}" on the page`,
    );
  }
});

test("every input the script reads is declared in its FIELDS list", () => {
  const declared = INDEX.match(/const FIELDS = \[([\s\S]*?)\];/);
  assert.ok(declared, "the script must declare a FIELDS list");
  const listed = new Set([...declared[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]));
  for (const id of FORM_FIELDS) {
    assert.ok(listed.has(id), `${id} is on the page but missing from FIELDS`);
  }
  // And nothing in FIELDS is absent from the form, which would read as NaN.
  for (const id of listed) {
    assert.match(INDEX, new RegExp(`\\bid="${id}"`), `FIELDS names ${id} but the form has no such input`);
  }
});

test("every input has a label bound to it", () => {
  for (const id of FORM_FIELDS) {
    assert.match(
      INDEX,
      new RegExp(`<label for="${id}"`),
      `id="${id}" has no <label for>, so a screen reader announces it as a bare number field`,
    );
  }
  assert.match(INDEX, /<label for="stockForm"/, "the stock form select needs a label too");
});

test("number inputs are constrained so a typo is caught by the browser", () => {
  for (const id of FORM_FIELDS) {
    const field = INDEX.match(new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`))[0];
    assert.match(field, /type="number"/, `${id} should be a number input`);
    assert.match(field, /\bmin="/, `${id} needs a min`);
    assert.match(field, /\bstep="/, `${id} needs a step`);
  }
});

// Added after #4975, which found the form unsubmittable in its default state:
// `firstArticleHours` shipped `value="1.2"` against `step="0.25"`, and a number
// input whose value is not a whole number of steps above `min` fails HTML5
// validation — so `requestSubmit` did nothing and the button appeared dead.
// Nothing here caught it: the tests asserted that `min` and `step` exist,
// never that the shipped value satisfies them. This checks every field, and
// checks the example preset too, because "Load the worked example" writes
// values into the same inputs and the identical mismatch would break it while
// the default state stayed fine.
test("every input's default value is a whole number of steps above its min", () => {
  for (const tag of INDEX.match(/<input[^>]*>/g)) {
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    const step = tag.match(/\bstep="([^"]+)"/)?.[1];
    const value = tag.match(/\bvalue="([^"]+)"/)?.[1];
    if (!id || !step || value === undefined) continue;
    const min = Number(tag.match(/\bmin="([^"]+)"/)?.[1] ?? 0);
    assert.ok(
      isWholeSteps(Number(value) - min, Number(step)),
      `${id}: value ${value} is not a whole number of ${step} steps above min ${min}, so the form will not submit`,
    );
  }
});

test("the worked example's values also satisfy their inputs' steps", () => {
  const block = INDEX.match(/const EXAMPLE = \{([\s\S]*?)\};/);
  assert.ok(block, "the script must declare an EXAMPLE preset");
  const example = Object.fromEntries(
    [...block[1].matchAll(/(\w+):\s*(-?[\d.]+)/g)].map((m) => [m[1], Number(m[2])]),
  );
  assert.ok(Object.keys(example).length > 20, "the example should fill the form");
  for (const [id, value] of Object.entries(example)) {
    const tag = INDEX.match(new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`))?.[0];
    if (!tag) continue; // stockForm is a select, not an input
    const step = Number(tag.match(/\bstep="([^"]+)"/)[1]);
    const min = Number(tag.match(/\bmin="([^"]+)"/)?.[1] ?? 0);
    assert.ok(
      isWholeSteps(value - min, step),
      `EXAMPLE.${id} = ${value} is not a whole number of ${step} steps above min ${min}`,
    );
  }
});

/** Whether `offset` is a whole multiple of `step`, compared in integer units to
 *  keep binary floating point out of it — 1.2 / 0.1 is 11.999999999999998, and
 *  a naive modulo would report a valid value invalid. */
function isWholeSteps(offset, step) {
  if (!(step > 0)) return true;
  const scale = 10 ** 6;
  return Math.round(offset * scale) % Math.round(step * scale) === 0;
}

test("the margin field cannot be set to a value the arithmetic rejects", () => {
  // A 100% margin is a division by zero. The shared shop-rate carry uses the
  // same ceiling, so a restored value can never prefill a field the tool rejects.
  const field = INDEX.match(/<input[^>]*\bid="targetMargin"[^>]*>/)[0];
  assert.match(field, /max="99\.9"/);
});

test("the four shared shop-rate fields use the portfolio's canonical ids", () => {
  // These exact ids are what platform/pages/rates.mjs carries between tools, so
  // a visitor who saved them on another calculator opens this one filled in.
  for (const id of ["hourlyWage", "burdenRate", "overheadRate", "targetMargin"]) {
    assert.match(INDEX, new RegExp(`<input[^>]*\\bid="${id}"`), `${id} must keep its shared id`);
  }
});

test("the stock-form select offers exactly the forms the module supports", () => {
  const select = INDEX.match(/<select id="stockForm">([\s\S]*?)<\/select>/);
  assert.ok(select, "the page needs a stockForm select");
  const values = [...select[1].matchAll(/value="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, STOCK_FORMS);
});

test("each stock form has a fieldset the script can show and hide", () => {
  for (const id of ["fs-stock", "fs-bar", "fs-plate", "fs-supplied"]) {
    assert.match(INDEX, new RegExp(`id="${id}"`), `no container with id="${id}"`);
  }
  // Only the default form's fields are visible on load.
  assert.match(INDEX, /id="fs-plate" hidden/);
  assert.match(INDEX, /id="fs-supplied" hidden/);
});

test("a hidden grid group actually hides", () => {
  // `display:grid` outranks the user agent's `[hidden]{display:none}`, so the
  // stock-form groups the script hides would render anyway without this rule —
  // the plate and supplied fields would both be on screen on first load.
  // platform/pages/check.mjs catches it at build time; this catches it here.
  assert.match(INDEX, /\.grid\[hidden\]\s*\{\s*display:\s*none/);
});

test("the page imports only its own local modules", () => {
  const imports = [...INDEX.matchAll(/import\s+[^"']*from\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imports.length > 0, "the page must import its calculator");
  for (const specifier of imports) {
    assert.ok(
      specifier.startsWith("./"),
      `${specifier} is not a local module — this page takes no dependency`,
    );
  }
  assert.ok(imports.includes("./calculator.mjs"));
  assert.ok(imports.includes("./usage.mjs"));
  assert.ok(imports.includes("./share.mjs"));
});

test("a shareable link and the save/forget draft can coexist without one clobbering the other", () => {
  // The exact defect check_shared_link_clears.py exists to catch: a decoded
  // link handed straight to the writer, or merged into an object literal
  // alongside the saved draft, leaves a field the link omitted showing the
  // *recipient's* saved value instead of being cleared. formValues(fromLink)
  // is the wrapped-call shape that is safe.
  assert.match(INDEX, /const fromLink = decodeInputs\(/);
  assert.match(INDEX, /writeInputs\(formValues\(fromLink\)\)/);
  assert.doesNotMatch(INDEX, /\.\.\.\s*\w+\s*,\s*\.\.\.\s*fromLink\b/);
});

test("copying a link records an event and says nothing was uploaded", () => {
  assert.match(INDEX, /id="copyLink"/);
  assert.match(INDEX, /id="link-status"/);
  assert.match(INDEX, /recordUsage\("link_copied"\)/);
});

test("nothing on any page reaches the network", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    assert.doesNotMatch(html, /\bfetch\s*\(/, `${name} must not fetch`);
    assert.doesNotMatch(html, /XMLHttpRequest|navigator\.sendBeacon|new WebSocket|EventSource/, `${name} must not transmit`);
    assert.doesNotMatch(html, /<script[^>]+src=/, `${name} must not load a remote script`);
    assert.doesNotMatch(html, /<link[^>]+href="https?:/, `${name} must not load a remote stylesheet`);
    // The only absolute URLs permitted are the sponsor link and schema.org.
    for (const url of [...html.matchAll(/https?:\/\/[^\s"'<)]+/g)].map((m) => m[0])) {
      assert.ok(
        /^https?:\/\/(github\.com\/sponsors\/Duncan-Haywood|schema\.org|www\.w3\.org|www\.sitemaps\.org)/.test(url),
        `${name} references an unexpected external URL: ${url}`,
      );
    }
  }
});

test("both pages carry the no-warranty clause and say what the tool is not advice about", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    assert.match(html, /No warranty\./, `${name} is missing the no-warranty clause`);
    assert.match(html, /without warranty of any kind, express or implied/, `${name}`);
    assert.match(
      html,
      /You are responsible for reviewing and verifying its output before relying on it/,
      `${name}`,
    );
    assert.match(html, /accept no liability/, `${name}`);
    // The clause has to name what it is not advice about, which is the venture's
    // own statement to make and the one part the build cannot inject.
    assert.match(html, /not tax, financial, engineering, or business advice/, `${name}`);
  }
});

test("the tool page states the privacy position and offers the off switch", () => {
  assert.match(INDEX, /Everything runs in your browser/);
  assert.match(INDEX, /never uploaded/);
  assert.match(INDEX, /no accounts, cookies, or analytics vendors/);
  assert.match(INDEX, /Do Not Track and Global Privacy Control turn counting off automatically/);
  assert.match(INDEX, /id="optout"/, "the opt-out control must be on the page");
  // The events named in the privacy note are the events the script records.
  const recorded = new Set(
    [...INDEX.matchAll(/recordUsage\("([a-z_]+)"\)/g)].map((m) => m[1]),
  );
  assert.deepEqual(
    [...recorded].sort(),
    ["example_loaded", "inputs_saved", "link_copied", "quote"],
  );
  for (const event of recorded) {
    assert.match(
      INDEX,
      new RegExp(`<code>${event}</code>`),
      `the privacy note must name the ${event} event it counts`,
    );
  }
});

test("the sponsor link is present, optional, and points at the portfolio's own page", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/, `${name}`);
    assert.match(html, /entirely optional and never changes what the tool does/, `${name}`);
  }
});

test("both pages declare a title, description, canonical and Open Graph tags", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    const title = html.match(/<title>([^<]+)<\/title>/);
    assert.ok(title, `${name} has no title`);
    assert.ok(title[1].length > 20 && title[1].length < 110, `${name} title length ${title[1].length}`);
    const description = html.match(/<meta name="description" content="([^"]+)"/);
    assert.ok(description, `${name} has no meta description`);
    assert.ok(description[1].length > 80, `${name} description is too short to be useful`);
    assert.match(html, /<link rel="canonical"/, `${name} has no canonical`);
    assert.match(html, /property="og:title"/, `${name} has no og:title`);
    assert.match(html, /property="og:description"/, `${name} has no og:description`);
    assert.match(html, /<html lang="en">/, `${name} has no lang`);
    assert.match(html, /<meta name="viewport"/, `${name} has no viewport`);
  }
});

test("the search phrase the niche types is in the tool page's title and description", () => {
  const title = INDEX.match(/<title>([^<]+)<\/title>/)[1].toLowerCase();
  assert.ok(title.includes("cnc machining"), "the title must carry the search phrase");
  const description = INDEX.match(/<meta name="description" content="([^"]+)"/)[1].toLowerCase();
  for (const phrase of ["cnc machining", "cost per part", "job shop"]) {
    assert.ok(description.includes(phrase), `the description should carry "${phrase}"`);
  }
});

test("every JSON-LD block on every page parses", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    const blocks = [
      ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ].map((m) => m[1]);
    assert.ok(blocks.length > 0, `${name} has no JSON-LD`);
    for (const block of blocks) {
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(block);
      }, `${name} has JSON-LD that does not parse`);
      assert.equal(parsed["@context"], "https://schema.org");
      assert.ok(parsed["@type"], `${name} JSON-LD needs an @type`);
    }
  }
});

test("the tool page declares itself a free SoftwareApplication", () => {
  const app = [...INDEX.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((b) => b["@type"] === "SoftwareApplication");
  assert.ok(app, "no SoftwareApplication block");
  assert.equal(app.offers.price, "0");
  assert.equal(app.offers.priceCurrency, "USD");
  assert.ok(app.description.length > 100);
});

test("the tool page carries visible questions and hand-writes no FAQ schema", () => {
  // build.mjs derives the entry page's FAQPage block from the visible copy, so
  // hand-writing one here is how the schema and the page drift apart — the same
  // import-don't-restate rule the repo records elsewhere. What this page owes is
  // question-shaped headings with real answers under them; faq-coverage.mjs
  // fails the build if they are missing.
  const blocks = [...INDEX.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  assert.ok(
    !blocks.some((b) => b["@type"] === "FAQPage"),
    "the tool page must not hand-write a FAQPage — build.mjs derives it",
  );

  const questions = [...INDEX.matchAll(/<h3>([^<]*\?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)];
  assert.ok(questions.length >= 5, `only ${questions.length} question-shaped headings`);
  const names = questions.map((m) => m[1]);
  assert.equal(names.length, new Set(names).size, "a question is repeated");
  for (const [, question, answer] of questions) {
    assert.ok(
      answer.replace(/\s+/g, " ").trim().length > 120,
      `"${question}" is answered too thinly to be worth indexing`,
    );
  }
});

test("the guide page's FAQ JSON-LD answers are non-trivial and uniquely named", () => {
  // The guide is a secondary page rather than an entry page, so it carries its
  // own FAQPage — pinned against its visible copy by the next test and by the
  // platform's faq-visible suite.
  const faq = [...GUIDE.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "the guide has no FAQPage block");
  const names = faq.mainEntity.map((q) => q.name);
  assert.equal(names.length, new Set(names).size, "the guide repeats a question");
  for (const entry of faq.mainEntity) {
    assert.equal(entry["@type"], "Question");
    assert.equal(entry.acceptedAnswer["@type"], "Answer");
    assert.ok(
      entry.acceptedAnswer.text.length > 120,
      `"${entry.name}" is answered too thinly to be worth indexing`,
    );
  }
});

test("the guide page's questions are visible on it, matching its JSON-LD exactly", () => {
  // faq-visible.test.mjs in the platform suite pins this too; asserting it here
  // means it fails in the venture's own CI rather than on main after a merge.
  const faq = [...GUIDE.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((b) => b["@type"] === "FAQPage");
  const text = GUIDE.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  const squash = (s) => s.replace(/\s+/g, " ").trim();
  const visible = squash(text);
  for (const entry of faq.mainEntity) {
    assert.ok(visible.includes(squash(entry.name)), `question not visible: ${entry.name}`);
    assert.ok(
      visible.includes(squash(entry.acceptedAnswer.text)),
      `answer not visible verbatim for: ${entry.name}`,
    );
  }
});

test("the guide page and the tool page link to each other", () => {
  assert.match(INDEX, /href="\.\/setup-fee-or-in-the-part-price\.html"/, "the tool must link to the guide");
  assert.match(GUIDE, /href="\.\/index\.html"/, "the guide must link back to the tool");
});

test("the guide page does not compete with the tool page for the same query", () => {
  const toolTitle = INDEX.match(/<title>([^<]+)<\/title>/)[1];
  const guideTitle = GUIDE.match(/<title>([^<]+)<\/title>/)[1];
  assert.notEqual(toolTitle, guideTitle);
  // The guide is question-shaped; the tool is named after what it is.
  assert.match(guideTitle, /\?$/);
  assert.doesNotMatch(toolTitle, /\?$/);
});

test("the break table header count matches what the script renders", () => {
  const headers = INDEX.match(/<tbody id="breaks">/);
  assert.ok(headers, "the break table needs a tbody the script can fill");
  const row = INDEX.match(/id="breaks"[\s\S]*?<\/table>/);
  assert.ok(row);
  // Every tier the module exposes must be reachable: the script maps the table
  // straight off BREAK_QUANTITIES, so the page cannot go out of step, but the
  // caption promising "every lot size" should not outrun the data.
  assert.ok(BREAK_QUANTITIES.length >= 6, "the promise of a curve needs enough points");
});

test("results are hidden until something has been computed", () => {
  assert.match(INDEX, /<section class="card" id="results" hidden>/);
});

test("the page reports a bad quantity rather than rendering nonsense", () => {
  assert.match(INDEX, /id="form-error"/);
  assert.match(INDEX, /role="alert"/);
  assert.match(INDEX, /Enter how many good parts the order is for/);
});

test("user-supplied finding text is escaped before it reaches innerHTML", () => {
  // Findings are built from numbers, but they pass through innerHTML, so the
  // escape helper has to exist and be applied to both halves of each finding.
  assert.match(INDEX, /const escape = /);
  assert.match(INDEX, /escape\(f\.title\)/);
  assert.match(INDEX, /escape\(f\.detail\)/);
});

test("the tool page tells the visitor what it will not do", () => {
  assert.match(INDEX, /What it does not do/);
  assert.match(INDEX, /does not know what your market pays/);
});

// Closest sibling: the same flat-setup-plus-machine-time-plus-material
// arithmetic for a batch of manufactured units, in a different trade. Both sit
// in `services`, which is large enough that the related-tool chrome rotates, so
// without an explicit one-hop a crawler on either page may never reach the
// other. platform/pages/siblings.mjs counts the pair; closing it in both
// directions is what keeps this venture off the crawlable-orphan list.
test("index links one hop to the apparel-decoration-price-calculator sibling", () => {
  assert.match(
    INDEX,
    /href="\.\.\/apparel-decoration-price-calculator\/"/,
    "index must link ../apparel-decoration-price-calculator/ so crawlers reach it in one hop",
  );
  assert.match(INDEX, /apparel decoration price calculator/i);
});

test("index links one hop to the tools it defers to", () => {
  // shop-rate-calculator derives the burdened hourly rate this page consumes,
  // and cut-list-optimizer does the real nesting the plate-yield figure here
  // only estimates. Both claims are made in the footer, so both need to resolve.
  assert.match(INDEX, /href="\.\.\/shop-rate-calculator\/"/);
  assert.match(INDEX, /href="\.\.\/cut-list-optimizer\/"/);
});

test("robots.txt allows crawlers and points at the sitemap", () => {
  const robots = readFileSync(new URL("./robots.txt", import.meta.url), "utf8");
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.doesNotMatch(robots, /Disallow: \/\s*$/m);
  assert.match(robots, /Sitemap:/);
});

/** The form exactly as a first-time visitor meets it: every input's shipped
 *  `value` plus the selected `<option>`. Read out of the markup rather than
 *  restated, so this cannot drift from the page the way a copied constant
 *  would -- and deliberately NOT the page's `EXAMPLE` block, which is the
 *  separate "load the worked example" set and uses different figures.
 *  The comparison page's whole break table is drawn from these defaults. */
function shippedFormDefaults() {
  const values = {};
  for (const id of FORM_FIELDS) {
    const tag = new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`).exec(INDEX);
    assert.ok(tag, `no input with id="${id}" on the page`);
    const value = /\bvalue="([^"]*)"/.exec(tag[0]);
    assert.ok(value, `#${id} ships no default value`);
    values[id] = Number(value[1]);
  }
  const select = /<select id="stockForm">([\s\S]*?)<\/select>/.exec(INDEX);
  assert.ok(select, "no stockForm select on the page");
  const selected = /<option value="([^"]+)"[^>]*\bselected\b/.exec(select[1]);
  assert.ok(selected, "no stockForm option is selected by default");
  values.stockForm = selected[1];
  return values;
}

// The comparison page was added after the venture shipped, by a different
// session than the one that built the calculator. Everything it claims is
// arithmetic this module produces, so it is pinned here rather than trusted to
// stay true: a page quoting figures that drifted from `calculator.mjs` is worse
// than no page, because it is the surface a stranger reads first.
test("the comparison page's break table is exactly what computeMachiningJob returns", () => {
  const job = computeMachiningJob(shippedFormDefaults());
  const shown = [
    { quantity: 1, starts: 2, costPerPart: "$374.80", margin: "886.3%" },
    { quantity: 5, starts: 6, costPerPart: "$81.94", margin: "115.6%" },
    { quantity: 10, starts: 11, costPerPart: "$45.34", margin: "19.3%" },
    { quantity: 25, starts: 26, costPerPart: "$23.37", margin: "38.5%" },
    { quantity: 50, starts: 52, costPerPart: "$16.17", margin: "57.4%" },
    { quantity: 100, starts: 104, costPerPart: "$12.71", margin: "66.6%" },
    { quantity: 250, starts: 258, costPerPart: "$10.59", margin: "72.1%" },
    { quantity: 500, starts: 516, costPerPart: "$9.90", margin: "73.9%" },
  ];
  assert.equal(job.table.length, shown.length, "the break table changed shape");
  for (const [i, row] of job.table.entries()) {
    assert.equal(row.quantity, shown[i].quantity);
    assert.equal(row.starts, shown[i].starts, `starts at qty ${row.quantity}`);
    assert.equal(
      `$${row.costPerPart.toFixed(2)}`,
      shown[i].costPerPart,
      `cost per part at qty ${row.quantity}`,
    );
    assert.equal(
      `${Math.abs(row.marginAtQuotedPrice).toFixed(1)}%`,
      shown[i].margin,
      `margin at qty ${row.quantity}`,
    );
    for (const figure of [shown[i].costPerPart, shown[i].margin]) {
      assert.ok(
        VERSUS.includes(figure),
        `the comparison page is missing ${figure} from the qty ${row.quantity} row`,
      );
    }
  }
});

test("the comparison page's headline claim is the sign flip the model actually produces", () => {
  const job = computeMachiningJob(shippedFormDefaults());
  const at = (q) => job.table.find((row) => row.quantity === q);
  // The whole point of the page: one carried part price is profitable at one
  // lot size and loss-making at another, so it must really change sign.
  assert.ok(at(50).marginAtQuotedPrice > 0, "the 50-piece row should be profitable");
  assert.ok(at(10).marginAtQuotedPrice < 0, "the 10-piece row should be a loss");
  assert.match(VERSUS, /57\.4% margin at 50 pieces and a <strong>19\.3% loss<\/strong> at 10/);
  assert.match(INDEX, /57\.4% margin at 50 pieces and losing 19\.3% at 10/);
});

test("the comparison page's per-lot and stock-yield figures come from the model", () => {
  const job = computeMachiningJob(shippedFormDefaults());
  const at = (q) => job.table.find((row) => row.quantity === q);
  assert.equal(at(1).perLotCostPerPart.toFixed(2), "189.42");
  assert.equal(at(500).perLotCostPerPart.toFixed(2), "0.59");
  assert.ok(VERSUS.includes("$189.42"));
  assert.ok(VERSUS.includes("$0.59"));
  // The material step function, which is the error the page's third section is
  // about: one bar at 50 parts, two at 100, so the 54th part buys a new bar.
  assert.equal(job.partsPerStockUnit, 53);
  assert.equal(at(50).stockUnitsNeeded, 1);
  assert.equal(at(100).stockUnitsNeeded, 2);
  assert.match(VERSUS, /yields 53 parts/);
  // Scrap as an integer: 3% entered, 4% actually paid at 50.
  assert.equal(job.effectiveScrapPct, 4);
  assert.match(VERSUS, /starting 52, an effective 4%/);
});

test("the comparison page compares against a method and names no product", () => {
  // PRODUCT_PLAYBOOK.md 5f: a page naming a trademark needs the
  // not-affiliated clause. This one deliberately names none, and says so, which
  // is what its entry in COMPARISON_DISCLAIMER_EXEMPT rests on.
  assert.match(VERSUS, /a method,\s+not a product/);
  assert.match(VERSUS, /names no spreadsheet\s+application/);
  assert.doesNotMatch(VERSUS, /\bExcel\b|\bGoogle Sheets\b|\bLibreOffice\b|\bNumbers\b/);
});

test("the comparison page says what the spreadsheet is better at, not only what it is worse at", () => {
  // A comparison that reads as an attack is both dishonest and a legal exposure
  // on a page that costs nothing to make fair. See PRODUCT_PLAYBOOK.md 5f.
  assert.match(VERSUS, /this page is not an argument that you should/);
  assert.match(VERSUS, /Keep the spreadsheet\./);
  assert.match(VERSUS, /the spreadsheet is your record/);
});

test("the comparison page and the tool page link to each other in one hop", () => {
  assert.match(INDEX, /href="\.\/vs-quoting-in-a-spreadsheet\.html"/);
  assert.match(VERSUS, /href="\.\/index\.html"/);
  // And it reaches the venture's other content page, so a crawler landing on
  // any one of the three can walk to the other two.
  assert.match(VERSUS, /href="\.\/setup-fee-or-in-the-part-price\.html"/);
});

test("every .html file in the venture is listed in sitemap.xml", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  for (const name of readdirSync(new URL("./", import.meta.url))) {
    if (!name.endsWith(".html")) continue;
    assert.ok(sitemap.includes(name), `${name} is missing from sitemap.xml`);
  }
});
