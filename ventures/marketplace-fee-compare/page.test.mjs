// Structural tests for index.html.
//
// calc.test.mjs imports calc.mjs directly and never looks at the page, so it
// stays green for a whole class of defect this page is exposed to: a control
// the script wires to an id the markup does not carry, a table header count
// that does not match the row template, a featureList claim nothing renders,
// or an initial paint that logs a bounce as usage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORY_PRESETS, CHANNELS, EXCLUDED_CHANNELS } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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

// Prose in the markup is hard-wrapped, so a sentence assertion has to be made
// against collapsed whitespace or it fails on where the line happened to break
// rather than on whether the sentence is there.
const prose = markup.replace(/\s+/g, " ");

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("every id the script reads exists in the markup or is built by the script", () => {
  const markupIds = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const read = new Set([...scriptSource.matchAll(/\bel\("([^"]+)"\)/g)].map((m) => m[1]));
  for (const id of read) {
    assert.ok(markupIds.has(id), `the script reads #${id}, which the page never renders`);
  }
});

test("the rate-override inputs the script reads are the ones it also builds", () => {
  // These ids are generated from CHANNELS rather than written in the markup, so
  // the check is that both sides derive from the same list.
  assert.match(scriptSource, /id="rate-\$\{escapeHtml\(channel\.id\)\}"/);
  assert.match(scriptSource, /el\(`rate-\$\{channel\.id\}`\)/);
});

test("the results table header count matches the row template", () => {
  const headers = (markup.match(/<th scope="col">/g) ?? []).length;
  const rowTemplate = scriptSource.slice(
    scriptSource.indexOf('el("rows").innerHTML'),
    scriptSource.indexOf("}).join(\"\");", scriptSource.indexOf('el("rows").innerHTML')),
  );
  const cells =
    (rowTemplate.match(/<th scope="row">/g) ?? []).length +
    (rowTemplate.match(/<td/g) ?? []).length;
  assert.equal(cells, headers, `${headers} column headers but ${cells} cells per row`);
});

test("the page renders a first result without counting a bounce as usage", () => {
  assert.match(scriptSource, /\bpaint\(\);/);
  assert.doesNotMatch(
    scriptSource,
    /count\([^)]+\);\s*paint\(\);?\s*$/,
    "the initial paint() must not sit behind a count()",
  );
  const firstPaint = scriptSource.indexOf("\n  paint();");
  const firstCount = scriptSource.indexOf('count("comparison_run")');
  assert.ok(firstPaint > 0, "the page must paint once on load");
  assert.ok(
    firstCount > firstPaint,
    "counting must be wired after the uncounted first paint, not before it",
  );
});

test("keystroke bursts settle into one event rather than counting per character", () => {
  assert.match(scriptSource, /setTimeout\([\s\S]{0,120}count\("comparison_run"\)/);
  assert.match(scriptSource, /clearTimeout\(settleTimer\)/);
});

test("usage counting is opt-out from the page and honors the checkbox", () => {
  assert.match(markup, /id="usageOptOut"/);
  assert.match(scriptSource, /recordUsage\(localStorage, el\("usageOptOut"\)\.checked/);
});

test("visitor-supplied values are escaped before they reach innerHTML", () => {
  assert.match(scriptSource, /(?:function escapeHtml|const escapeHtml\s*=)/);
  // The only free-text values that reach the table come from the model, but the
  // category and channel labels are interpolated the same way, so the guard has
  // to be on the path rather than on the current contents of the model.
  assert.match(scriptSource, /escapeHtml\(row\.label\)/);
  assert.match(scriptSource, /escapeHtml\(preset\.label\)/);
});

test("the page carries the non-warranty and no-SLA disclaimers", () => {
  assert.match(prose, /No warranty\.<\/strong>/);
  assert.match(prose, /without warranty of any kind, express or implied/);
  assert.match(prose, /not tax, financial, or business advice/);
  assert.match(prose, /Best-effort hosting, no SLA/);
});

test("the page states that nothing is uploaded and what is counted", () => {
  assert.match(prose, /never uploaded/);
  assert.match(prose, /Do Not Track and Global Privacy Control/);
});

test("the fee rates are presented as editable inputs, not a live schedule", () => {
  assert.match(prose, /not a live fee schedule/);
  assert.match(prose, /Fee rates change/);
});

test("the own-store demand caveat is in the markup, not only in prose", () => {
  assert.match(markup, /id="demandCaveat"/);
  assert.match(scriptSource, /demandIncluded/);
  assert.match(prose, /A marketplace fee buys buyers/);
});

test("every channel and the excluded one link to their deep calculator", () => {
  for (const channel of [...CHANNELS, ...EXCLUDED_CHANNELS]) {
    assert.ok(
      scriptSource.includes("../${escapeHtml(channel.deepTool)}/"),
      "deep-tool links must be generated from the model",
    );
  }
  // Two generated link lists: the per-channel caveats and the excluded note.
  assert.equal(
    (scriptSource.match(/\.\.\/\$\{escapeHtml\(channel\.deepTool\)\}\//g) ?? []).length,
    2,
  );
});

test("the category dropdown is generated from the model rather than hand-listed", () => {
  assert.match(scriptSource, /Object\.entries\(CATEGORY_PRESETS\)/);
  const hardCoded = [...markup.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hardCoded, [], "categories must not be duplicated into the markup");
  assert.ok(Object.keys(CATEGORY_PRESETS).length >= 5);
});

test("the advertised feature list matches what the page actually does", () => {
  const featureList = /"featureList": "([^"]+)"/.exec(html)?.[1] ?? "";
  for (const claim of ["break-even", "Side-by-side net profit", "editable fee rates"]) {
    assert.ok(
      featureList.toLowerCase().includes(claim.toLowerCase()),
      `featureList is missing "${claim}"`,
    );
  }
  assert.match(scriptSource, /breakEvenPrice/);
  assert.match(prose, /Break-even price/);
});

test("the page declares a canonical URL and is indexable", () => {
  assert.match(markup, /<link rel="canonical" href="\.">/);
  assert.match(markup, /<meta name="robots" content="index, follow">/);
});

test("the copy action reports clipboard failure instead of silently doing nothing", () => {
  assert.match(scriptSource, /Couldn't access the clipboard/);
  assert.match(scriptSource, /count\("comparison_copied"\)/);
});

test("an input error hides the stale table instead of leaving a wrong answer up", () => {
  assert.match(scriptSource, /el\("resultSection"\)\.classList\.add\("hidden"\)/);
  assert.match(scriptSource, /lastRun = null/);
});

test("a shared link is applied before the first paint, not after", () => {
  const applyIndex = scriptSource.indexOf("applyShare(decodeShare(location.hash))");
  const firstPaintIndex = scriptSource.indexOf("\n  paint();");
  assert.ok(applyIndex > 0, "the page must decode a shared link on load");
  assert.ok(
    applyIndex < firstPaintIndex,
    "a shared link must be applied before the uncounted first paint, or the recipient sees the default flash before their shared comparison",
  );
});

test("the share link button copies a URL, updates the address bar, and counts the action", () => {
  assert.match(markup, /id="copyShare"/);
  assert.match(scriptSource, /encodeShare\(readItem\(\), readOverrides\(\)\)/);
  assert.match(scriptSource, /history\.replaceState\(null, "", `#\$\{hash\}`\)/);
  assert.match(scriptSource, /count\("share_link_copied"\)/);
});

test("the share button reports clipboard failure instead of silently doing nothing", () => {
  const shareHandler = scriptSource.slice(scriptSource.indexOf('el("copyShare")'));
  assert.match(shareHandler, /Couldn't access the clipboard/);
});

test("the privacy section explains where a share link travels", () => {
  assert.match(prose, /share link.*URL fragment|URL fragment.*share link|share link.*never sends|never sends.*share link/i);
});

test("the dynamic result regions are announced to screen readers", () => {
  // #resultSection, #errors and #copyStatus all rewrite their own content on
  // every keystroke or copy click without a page reload; without
  // aria-live="polite" a screen-reader user hears nothing when the ranking,
  // an input error, or a copy confirmation changes.
  assert.match(markup, /<p id="errors" class="errors" role="status" aria-live="polite">/);
  assert.match(markup, /<section id="resultSection" aria-live="polite">/);
  assert.match(markup, /<span id="copyStatus" class="fine" role="status" aria-live="polite">/);
});

test("the sharing FAQ answer matches between JSON-LD and the visible section", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let answer = null;
  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      continue;
    }
    if (parsed?.["@type"] !== "FAQPage") continue;
    const entry = (parsed.mainEntity ?? []).find(
      (q) => q.name === "Can I share this comparison with someone else?",
    );
    if (entry) answer = entry.acceptedAnswer?.text;
  }
  assert.ok(answer, "the sharing question must be in the FAQPage JSON-LD");
  assert.ok(
    prose.includes(answer.replace(/\s+/g, " ")),
    "the JSON-LD answer text must also be visible on the page",
  );
});

// where-to-sell-calculator ranks the same one-item shape after returns and
// shelf time (and covers Reverb / a local sale). Without a crawlable reverse
// link, a crawler entering here never reaches that sibling hub — same
// one-way orphan class as #3639 / #3650 / #3658.
test("index links to the related where-to-sell calculator", () => {
  assert.match(
    markup,
    /href="\.\.\/where-to-sell-calculator\/"/,
    "index must link ../where-to-sell-calculator/ so crawlers can reach the returns/shelf-time ranking",
  );
});
