import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGES = ["index", "cmmc-level-1-self-assessment", "cmmc-scoping-worksheet", "sprs-score-calculator", "nist-800-171-ssp-template", "dfars-7012-incident-reporting", "cmmc-affirmation-dates", "cmmc-cost", "stock-size-from-step-file", "job-shop-quote-calculator", "rfq-review", "drawing-review", "first-article-inspection", "cmmc-level-1-vs-level-2", "cmmc-subcontractor-flow-down", "ssp-and-poam", "how-to-price-a-machined-part", "quote-vs-actual", "machine-shop-quoting-software", "machining-quote-template", "machine-hour-rate"];
const read = (p) => readFileSync(new URL(`./${p}.html`, import.meta.url), "utf8");

for (const p of PAGES) {
  test(`${p}: disclaimer, no-SLA, non-affiliation, CTA and usage tracking`, () => {
    const html = read(p);
    assert.match(html, /<title>[^<]{10,}<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{50,}"/);
    assert.match(html, /No warranty\./);
    assert.match(html, /Best-effort hosting, no SLA\./);
    assert.match(html, /Not affiliated with or endorsed by the Department of Defense/);
    assert.match(html, /In development — early access/);
    assert.match(html, /https:\/\/marisstella\.app\/industries\/manufacturing\//);
    assert.match(html, /recordUsage\(/);
    assert.match(html, /id="usage-toggle"/);
  });

  test(`${p}: makes no certification or endorsement claim`, () => {
    const text = read(p).replace(/<[^>]+>/g, " ");
    for (const bad of [/\bCMMC[- ]certified\b/i, /\bget certified\b/i, /\bDoD[- ]approved\b(?! medium assurance certificate)/i, /\bendorsed by the DoD\b(?![^.]*Not affiliated)/i, /\bguarantee(d|s)? (compliance|a score|certification)\b/i]) {
      assert.doesNotMatch(text, bad, `${p} matches ${bad}`);
    }
  });
}

test("the quote calculator ships no rates: every money field starts empty", () => {
  const html = read("job-shop-quote-calculator");
  for (const name of ["materialPerPart", "scrapPct", "setupHours", "setupRate", "programHours", "programRate", "cycleMinutes", "machineRate", "markupPct", "setupFactor", "cycleFactor"]) {
    const m = html.match(new RegExp(`<input name="${name}"[^>]*>`));
    assert.ok(m, name);
    assert.doesNotMatch(m[0], /value=/, `${name} has a default value`);
  }
});

test("pricing guide contains no dollar figures", () => {
  let text = read("how-to-price-a-machined-part");
  let prev;
  do { prev = text; text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ""); } while (text !== prev);
  assert.doesNotMatch(text, /\$\s?\d/);
});

test("CMMC guide carries a dated status check", () => {
  const html = read("cmmc-level-1-vs-level-2");
  assert.match(html, /Status check, 24 November 2026/);
  assert.match(html, /suspended by the Department of War on 13 July 2026/);
});

test("the stock page ships no material price and keeps the file in the browser", () => {
  const html = read("stock-size-from-step-file");
  for (const name of ["price", "roughWidth", "roughDepth", "roughFeed", "finishStepover", "finishFeed", "allowancePct", "loadMinutes"]) {
    const m = html.match(new RegExp(`<input name="${name}"[^>]*>`));
    assert.ok(m, name);
    assert.doesNotMatch(m[0], /value=/, `${name} has a default value`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/, "the page must not transmit the file");
  assert.match(html, /never uploaded/);
});

test("quote-vs-actual page ships no benchmark: no dollar or hour figure outside the invented example", () => {
  let text = read("quote-vs-actual");
  let prev;
  do { prev = text; text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ""); } while (text !== prev);
  assert.doesNotMatch(text, /\$\s?\d/);
  assert.match(text, /Load an invented example/);
  assert.match(text, /href="job-shop-quote-calculator.html"/);
});

test("incident page builds the DOM from text, never innerHTML, and keeps nothing by default", () => {
  const html = read("dfars-7012-incident-reporting");
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /id="keep-draft"(?![^>]*checked)/);
  assert.match(html, /https:\/\/dibnet\.dod\.mil/);
  assert.match(html, /within 72 hours of discovery of any cyber incident/);
});

test("customer quote section: built from text, keeps nothing by default, never keeps customer details", () => {
  const html = read("job-shop-quote-calculator");
  assert.match(html, /id="cq"/);
  assert.match(html, /id="keep-cq"(?![^>]*checked)/);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /import \{ META_FIELDS, reviewQuote, quoteToHtml, quoteToText \} from "\.\/quote-doc\.mjs"/);
  const kept = html.match(/const shopOnly = Object\.fromEntries\(\[([^\]]+)\]/);
  assert.ok(kept, "shop-only key list");
  for (const k of ["customer", "rfqRef", "partNumber", "quoteNumber"]) assert.doesNotMatch(kept[1], new RegExp(`"${k}"`));
});

test("RFQ review page keeps pasted text out of storage and renders findings as text", () => {
  const html = read("rfq-review");
  assert.doesNotMatch(html, /localStorage|setItem\(/);
  assert.doesNotMatch(html, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /recordUsage\("rfq-review"\)/);
});

test("quote calculator accepts quantity breaks handed over from the RFQ review", () => {
  assert.match(read("job-shop-quote-calculator"), /get\("breaks"\)/);
  assert.match(read("rfq-review"), /job-shop-quote-calculator\.html\?breaks=/);
});

test("scoping worksheet: built from text, keeps nothing by default, quotes the rule verbatim", async () => {
  const html = read("cmmc-scoping-worksheet");
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(html, /id="keep-draft"(?![^>]*checked)/);
  const { QUOTES } = await import("./scope.mjs");
  const quoted = [...html.matchAll(/<q>([^<]+)<\/q>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  assert.ok(quoted.length >= 12);
  const rule = Object.values(QUOTES);
  for (const q of quoted) assert.ok(rule.some((r) => r === q || r.includes(q)), `not a pinned quote: ${q}`);
});

test("first article page keeps pasted results out of storage and renders them as text", () => {
  const html = read("first-article-inspection");
  assert.doesNotMatch(html, /localStorage|setItem\(/);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(html, /recordUsage\("fai-check"\)/);
  assert.match(html, /does not reproduce it/);
});

test("drawing review page reads the file in the browser, keeps nothing and renders findings as text", () => {
  const html = read("drawing-review");
  assert.doesNotMatch(html, /localStorage|setItem\(/);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/, "the page must not transmit the drawing");
  assert.match(html, /never uploaded/);
  assert.match(html, /recordUsage\("drawing-review"\)/);
  assert.match(html, /import \{ readDrawing, FIELDS, NOTE_TAGS, faiLink, drawingCsv \} from "\.\/drawing\.mjs"/);
});

test("first article page takes the drawing review's hand-over: general tolerances and the # list", () => {
  const html = read("first-article-inspection");
  assert.match(html, /for \(const k of \["g1", "g2", "g3", "g4", "ga"\]\)/);
  assert.match(html, /location\.hash\.slice\(1\)\)\.get\("chars"\)/);
});

// Every page answers the questions people search, visibly and as FAQPage JSON-LD (polish,
// 2026-11-25). Both come from faq.mjs; run `node faq.mjs` after editing it.
test("every page carries its generated FAQ, up to date, inside <main>", async () => {
  const { FAQ, apply } = await import("./faq.mjs");
  const { readdirSync } = await import("node:fs");
  const pages = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".html"));
  for (const name of pages) {
    const html = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    assert.ok(FAQ[name], `${name}: add it to FAQ in faq.mjs`);
    assert.ok(FAQ[name].length >= 3, `${name}: at least three questions`);
    assert.equal(apply(html, name), html, `${name}: FAQ out of date, run node faq.mjs`);
    assert.ok(html.indexOf('id="faq"') < html.indexOf("</main>"), `${name}: FAQ outside <main>`);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const faqLd = ld.filter((d) => d["@type"] === "FAQPage");
    // index.html is an entry page: the site build derives its FAQPage, so none is hand-written.
    assert.equal(faqLd.length, name === "index.html" ? 0 : 1, `${name}: FAQPage blocks`);
    for (const [q] of FAQ[name]) assert.ok(q.endsWith("?"), `${name}: "${q}" is not a question`);
  }
});

test("index footer links every page", () => {
  const html = read("index");
  const foot = html.slice(html.indexOf("<footer>"));
  for (const p of PAGES.filter((p) => p !== "index")) assert.match(foot, new RegExp(`href="${p}\\.html"`), p);
});

test("affirmation page: every <q> is a recorded quote, DOM from text, keeps nothing by default", async () => {
  const { QUOTES } = await import("./affirm.mjs");
  const html = read("cmmc-affirmation-dates");
  const known = new Set(Object.values(QUOTES));
  const qs = [...html.matchAll(/<q>([\s\S]*?)<\/q>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  assert.ok(qs.length >= 4);
  for (const q of qs) assert.ok(known.has(q), `not a recorded quote: ${q}`);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /id="keep-draft"(?![^>]*checked)/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

// The comparison page names other vendors' products and prices (2026-11-26). Every price row
// links the listing it came from, the page says no vendor page was read, and our own product
// shows no price until one is set (platform/pages/industry-manufacturing.mjs keeps the same rule).
test("quoting software comparison: every listed price has its source, ours has none", () => {
  const html = read("machine-shop-quoting-software");
  assert.match(html, /No vendor's own pricing page could be read/);
  assert.match(html, /as that listing showed it on 24 November 2026/);
  const table = html.slice(html.indexOf("<h2>Listed prices"), html.indexOf("<h2>Questions"));
  const rows = [...table.matchAll(/<tr><td>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  assert.ok(rows.length >= 4);
  for (const r of rows) {
    if (/\$\d/.test(r.replace(/Series B/, ""))) assert.match(r, /<a href="https:\/\/[^"]+" rel="nofollow">/, r);
  }
  const ours = html.slice(html.indexOf("<h2>What we are building"));
  let text = ours; let prev;
  do { prev = text; text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ""); } while (text !== prev);
  assert.doesNotMatch(text.slice(0, text.indexOf('id="faq"') > 0 ? text.indexOf('id="faq"') : text.length), /\$\s?\d/);
  assert.match(html, /none paid to be listed/);
});

test("flow-down page: every quote is word for word from the eCFR text saved in fixtures/flow-down", () => {
  const html = read("cmmc-subcontractor-flow-down");
  const rule = ["32-cfr-170.23.txt", "dfars-252.204-7021.txt"].map((f) => readFileSync(new URL(`./fixtures/flow-down/${f}`, import.meta.url), "utf8"));
  const quoted = [...html.matchAll(/<q>([^<]+)<\/q>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  assert.ok(quoted.length >= 9, `only ${quoted.length} quotes`);
  for (const q of quoted) assert.ok(rule.some((r) => r.includes(q)), `not in the eCFR text: ${q}`);
  // The levels in the table are the rule's own: FCI only is Level 1, CUI at least Level 2, C3PAO above.
  assert.match(html, /<td>FCI only \(no CUI\)<\/td><td>Level 1 \(Self\)<\/td>/);
  assert.match(html, /Level 3 \(DIBCAC\)<\/td><td>Level 2 \(C3PAO\)<\/td>/);
  assert.match(rule[0], /Level 3 \(DIBCAC\), then the CMMC Status of Level 2 \(C3PAO\) is the minimum/);
});

test("machine hour rate page ships no rates and builds its rows from text", () => {
  const html = read("machine-hour-rate");
  assert.doesNotMatch(html, /<input name="(overheadPerYear|rentPerSqft|powerPrice|markupPct)"[^>]*value=/);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
  assert.match(html, /Load an invented example/);
});

test("the quote calculator takes a machine rate from the machine hour rate page", () => {
  assert.match(read("job-shop-quote-calculator"), /\["setupFactor", "cycleFactor", "machineRate"\]/);
});

// The cost page quotes DoD's regulatory impact analysis (2026-11-27). Every <q> is a pinned sentence
// in cost.mjs (which cost.test.mjs finds in fixtures/cost/), every dollar figure in the prose is one
// the rule prints, and the rows are built from text.
test("CMMC cost page: quotes pinned, figures from the rule, DOM from text, nothing kept or sent", async () => {
  const { QUOTES } = await import("./cost.mjs");
  const html = read("cmmc-cost");
  const rule = readFileSync(new URL("./fixtures/cost/89-fr-83092-cost.txt", import.meta.url), "utf8").replace(/\s+/g, " ");
  const known = new Set(Object.values(QUOTES));
  const qs = [...html.matchAll(/<q>([\s\S]*?)<\/q>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  assert.ok(qs.length >= 4);
  for (const q of qs) assert.ok(known.has(q), `not a pinned quote: ${q}`);
  let text = html; let prev;
  do { prev = text; text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ""); } while (text !== prev);
  for (const [fig] of text.matchAll(/\$[\d,]+(\.\d+)?/g)) assert.ok(rule.includes(fig), `${fig} is not printed in the rule`);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|setItem\(/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
  for (const name of ["c3paoQuote", "gapOneTime", "gapYearly"]) assert.doesNotMatch(html.match(new RegExp(`<input name="${name}"[^>]*>`))[0], /value=/);
});
