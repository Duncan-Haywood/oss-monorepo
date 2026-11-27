import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { APP_URL, apply as applyCta } from "./cta.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
// Read from the folder, not a literal list: parallel PRs that each add a page
// all edited the same one-line array and conflicted on every merge of main.
const PAGES = readdirSync(new URL("./", import.meta.url)).filter((f) => f.endsWith(".html")).sort();

test("every page carries the no-warranty clause, sponsor link, opt-out and honest CTA", () => {
  for (const name of PAGES) {
    const html = page(name);
    assert.match(html, /No warranty\./, name);
    assert.match(html, /not legal/, name);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, name);
    assert.match(html, /id="optout"/, name);
    // The CTA's lead and status come from cta.mjs (one switch at launch); run `node cta.mjs`.
    assert.equal(applyCta(html, name), html, `${name}: CTA out of date, run node cta.mjs`);
    if (!APP_URL) {
      assert.match(html, /in development, with early access<\/strong>; nothing is for sale yet/, name);
      assert.match(html, /href="https:\/\/marisstella\.app\/industries\/construction\/"/, name);
    }
    assert.match(html, /<title>[^<]{3,60}<\/title>/, name);
    const desc = /<meta name="description" content="([^"]*)"/.exec(html);
    assert.ok(desc && desc[1].length <= 160, `${name}: meta description must be 160 characters or fewer`);
  }
});

test("no page sends anything anywhere or loads remote scripts", () => {
  for (const name of [...PAGES, "calc.mjs", "colog.mjs", "retlog.mjs", "billing.mjs", "check.mjs", "waivers.mjs", "sworn.mjs", "stored.mjs", "shortpay.mjs", "frontload.mjs", "joint.mjs", "forecast.mjs", "millerbond.mjs", "prelim.mjs", "tmlog.mjs", "punch.mjs", "progress.mjs", "usage.mjs", "sumview.mjs", "gcportal.mjs"]) {
    const src = page(name);
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, name);
    assert.doesNotMatch(src, /<script[^>]+src=["']https?:/, name);
  }
});

test("pages that mention the AIA say they are not the AIA form", () => {
  for (const name of PAGES) {
    const html = page(name);
    if (/G702/.test(html)) assert.match(html, /Not affiliated with the American Institute of Architects/, name);
  }
});

test("calculator inputs are labelled", () => {
  const html = page("index.html");
  for (const id of ["ret-work", "ret-stored", "released", "prev-cert"]) assert.match(html, new RegExp(`<label for="${id}">`));
});

test("the retainage table covers at least 10 states, each linked to an official legislature site, with a read date", () => {
  const html = page("retainage-explained.html");
  const table = html.slice(html.indexOf('id="state-table"'), html.indexOf("</table>", html.indexOf('id="state-table"')));
  const rows = [...table.matchAll(/<tr[^>]*><td[^>]*>([A-Z][a-z]+(?: [A-Z][a-z]+)?)<\/td><td[^>]*><a href="([^"]+)"/g)];
  assert.ok(rows.length >= 16, `only ${rows.length} states`);
  const official = /^https:\/\/(leginfo\.legislature\.ca\.gov|statutes\.capitol\.texas\.gov|www\.leg\.state\.fl\.us|www\.nysenate\.gov|www\.palegis\.us|www\.ilga\.gov|www\.ncleg\.gov|www\.legislature\.mi\.gov|law\.lis\.virginia\.gov|app\.leg\.wa\.gov|malegislature\.gov|www\.azleg\.gov|www\.revisor\.mn\.gov|www\.leg\.state\.nv\.us|www\.oregonlegislature\.gov|le\.utah\.gov)\//;
  for (const [, state, href] of rows) assert.match(href, official, state);
  assert.match(html, /2026-11-24/);
  assert.match(html, /2026-11-25/);
});

test("change order log inputs are labelled and the guide pages link to it", () => {
  const html = page("change-order-log.html");
  for (const id of ["project", "original", "asof", "stale", "log", "file"]) assert.match(html, new RegExp(`<label for="${id}">`));
  for (const name of ["index.html", "change-orders-schedule-of-values.html"]) assert.match(page(name), /href="change-order-log\.html"/, name);
  // Its rows are built in script, so the phone card labels live in the row template.
  const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
  assert.match(table, /^<table class="stack compact" role="table">/);
  const heads = [...table.matchAll(/<th role="columnheader" scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1].trim());
  const row = /\$\("#rows"\)\.innerHTML = [^\n]*/.exec(html)[0];
  const labels = [...row.matchAll(/<td data-label="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, heads);
});

test("robots and sitemap list every page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  const sitemap = page("sitemap.xml");
  for (const name of PAGES) assert.match(sitemap, new RegExp(name.replace(".", "\\.")));
});

// Phone layout for the guide tables (style.css, "Guide tables on a phone"): each body row becomes a
// card whose cells show their column header from data-label. A row added without labels would
// show bare values on a phone, so every cell must carry its own column's header, in order.
test("guide tables stack on a phone, every cell labelled with its column header", () => {
  // change-order-log.html fills its rows from script; its own test below checks the labels.
  const guides = PAGES.filter((name) => name !== "index.html" && name !== "change-order-log.html" && name !== "lien-waiver-log.html" && name !== "retainage-tracker.html" && name !== "paid-short.html" && name !== "pay-app-cash-forecast.html" && name !== "miller-act-payment-bond-claims.html");
  for (const name of guides) {
    const html = page(name);
    const at = html.indexOf("<main>");
    const table = html.slice(html.indexOf("<table", at), html.indexOf("</table>", at));
    assert.match(table, /^<table(?: id="[^"]*")? class="stack( compact)?" role="table">/, name);
    // Headers are plain text (no markup), so the captured text is the label as written.
    const thead = table.split("</thead>")[0];
    const heads = [...thead.matchAll(/<th role="columnheader" scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1].trim());
    assert.equal(heads.length, (thead.match(/<th /g) || []).length, `${name}: a column header holds markup`);
    const rows = table.split("</thead>")[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
    assert.ok(rows.length >= 2, name);
    for (const row of rows) {
      const cells = [...row.matchAll(/<(td|th)([^>]*)>/g)];
      assert.equal(cells.length, heads.length, `${name}: ${row.slice(0, 80)}`);
      cells.forEach(([, tag, attrs], i) => {
        if (tag === "th") return assert.match(attrs, /scope="row"/, name);
        assert.equal(/data-label="([^"]*)"/.exec(attrs)?.[1], heads[i].replace(/"/g, "&quot;"), `${name}: ${row.slice(0, 80)}`);
      });
    }
  }
  const css = page("style.css");
  assert.match(css, /@media \(max-width: 600px\) \{\s*table\.stack thead/, "stacking is phone-only");
  assert.doesNotMatch(css, /table\.stack td \{[^}]*display: grid/, "a grid splits inline <strong>/<a> into separate items");
});

test("the waiver-forms table links each state to its official legislature site, with a read date", () => {
  const html = page("lien-waiver-forms-by-state.html");
  const start = html.indexOf('id="state-table"');
  const table = html.slice(start, html.indexOf("</table>", start));
  const rows = [...table.matchAll(/<tr[^>]*><td[^>]*>([A-Z][a-z]+)<\/td><td[^>]*><a href="([^"]+)"/g)];
  assert.ok(rows.length >= 7, `only ${rows.length} states`);
  const official = /^https:\/\/(www\.azleg\.gov|www\.leg\.state\.nv\.us|statutes\.capitol\.texas\.gov|le\.utah\.gov|www\.flsenate\.gov|www\.legislature\.mi\.gov|wyoleg\.gov|revisor\.mo\.gov|malegislature\.gov|gov\.georgia\.gov|billstatus\.ls\.state\.ms\.us|leginfo\.legislature\.ca\.gov)\//;
  for (const [, state, href] of rows) assert.match(href, official, state);
  assert.match(html, /2026-11-25/);
});

test("the QuickBooks guide cites Intuit's own pages, says it is not Intuit, and its calculator is labelled", () => {
  const html = page("retainage-in-quickbooks.html");
  const links = [...html.matchAll(/href="(https:[^"]+)"/g)].map((m) => m[1]).filter((h) => !/marisstella|github\.com\/sponsors/.test(h) && !h.startsWith(APP_URL ?? "\0"));
  assert.ok(links.length >= 5, `only ${links.length} sources`);
  for (const h of links) assert.match(h, /^https:\/\/quickbooks\.intuit\.com\//, h);
  assert.match(html, /Not affiliated with Intuit\./);
  assert.match(html, /accountant/);
  for (const id of ["qb-billed", "qb-rate", "qb-held", "qb-released"]) assert.match(html, new RegExp(`<label for="${id}">`));
});

test("the QuickBooks lines table, built in the browser, labels its cells for the phone layout", () => {
  const html = page("retainage-in-quickbooks.html");
  for (const label of ["QuickBooks item", "Posts to", "Amount"]) {
    assert.equal(html.split(`, "${label}")`).length - 1, 2, `${label}: a line row and the total row`);
  }
});

test("the prompt payment table links each state to its official legislature site, with a read date, and the calculator is labelled", () => {
  const html = page("prompt-payment-laws.html");
  const start = html.indexOf('id="state-table"');
  const table = html.slice(start, html.indexOf("</table>", start));
  const rows = [...table.matchAll(/<tr[^>]*><td[^>]*>([A-Z][a-z]+(?: [A-Z][a-z]+)?)<\/td><td[^>]*><a href="([^"]+)"/g)];
  assert.ok(rows.length >= 7, `only ${rows.length} states`);
  const official = /^https:\/\/(statutes\.capitol\.texas\.gov|leginfo\.legislature\.ca\.gov|www\.ilga\.gov|www\.ncleg\.gov|www\.legis\.state\.pa\.us|law\.lis\.virginia\.gov|www\.leg\.state\.fl\.us)\//;
  for (const [, state, href] of rows) assert.match(href, official, state);
  assert.match(html, /2026-11-25/);
  for (const id of ["pp-state", "pp-amount", "pp-received", "pp-paid", "pp-days", "pp-rate", "pp-per", "pp-method"]) assert.match(html, new RegExp(`<label for="${id}">`));
});

test("stored materials page: inputs labelled, script rows carry the column labels, linked from the guides", () => {
  const html = page("stored-materials-billing.html");
  for (const id of ["ret-work", "ret-stored", "log", "file"]) assert.match(html, new RegExp(`<label for="${id}">`));
  const at = html.indexOf('id="result"');
  const table = html.slice(html.indexOf("<table", at), html.indexOf("</table>", at));
  const heads = [...table.matchAll(/<th role="columnheader" scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1].trim());
  const row = /\$\("#rows"\)\.innerHTML = [^\n]*/.exec(html)[0];
  assert.deepEqual([...row.matchAll(/<td data-label="([^"]*)"/g)].map((m) => m[1]), heads);
  assert.match(html, /href="https:\/\/www\.acquisition\.gov\/far\/52\.232-5"/);
  for (const name of ["index.html", "how-to-fill-out-a-pay-application.html"]) assert.match(page(name), /href="stored-materials-billing\.html"/, name);
});

test("the software comparison dates its prices, marks aggregator prices, and links each portal fee to the vendor's help site", () => {
  const html = page("pay-application-software-compared.html");
  assert.match(html, /2026-11-25/);
  const opts = html.slice(html.indexOf('id="options"'), html.indexOf("</table>", html.indexOf('id="options"')));
  // A review-site price must say so in its own row.
  for (const row of opts.match(/<tr role="row">[\s\S]*?<\/tr>/g)) {
    if (/toolradar\.com|capterra\.com|g2\.com|getapp\.com|softwareadvice\.com/.test(row)) assert.match(row, /aggregator/, row.slice(0, 80));
  }
  const start = html.indexOf('id="portals"');
  const portals = html.slice(start, html.indexOf("</table>", start));
  const rows = [...portals.matchAll(/<tr role="row"><td[^>]*>([^<]+)<\/td><td[^>]*>[^]*?<a href="([^"]+)"/g)];
  assert.equal(rows.length, 3);
  for (const [, name, href] of rows) assert.match(href, /^https:\/\/(docs\.oracle\.com|support\.procore\.com|help\.trimble\.com)\//, name);
  assert.match(html, /not affiliated with any company named here/);
  for (const id of ["pf-portal", "pf-contract", "pf-jobs", "pf-before", "pf-subtier", "pf-gcpays"]) assert.match(html, new RegExp(`<label for="${id}">`));
});

test("retainage release page: inputs labelled, letter output present, links the statute table rather than restating it", () => {
  const html = page("retainage-release.html");
  for (const id of ["rr-held", "rr-released", "rr-trigger", "rr-days", "rr-today", "rr-basis", "rr-project", "rr-to", "rr-from"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(html, /id="rr-letter"/);
  assert.match(html, /href="retainage-explained\.html#state-table"/);
  assert.match(html, /not a legal notice/);
});

test("pay application checker: inputs labelled, linked from the how-to guide and the calculator", () => {
  const html = page("pay-application-checker.html");
  for (const id of ["last", "draft", "l-ret", "l-ret-stored", "l-released", "d-ret", "d-ret-stored", "d-released", "d-prev", "project"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(html, /id="findings"/);
  assert.match(html, /not an approval/);
  for (const name of ["index.html", "how-to-fill-out-a-pay-application.html"]) assert.match(page(name), /href="pay-application-checker\.html"/, name);
});

test("overbilling page: inputs labelled, entry and summary present, links the WIP schedule and the change order log", () => {
  const html = page("overbilling-underbilling.html");
  for (const id of ["ou-contract", "ou-est", "ou-cost", "ou-billed", "ou-ret", "ou-next"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  for (const id of ["ou-entry", "ou-summary"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /href="https:\/\/marisstella\.app\/contractor-wip-schedule\/"/);
  assert.match(html, /href="change-order-log\.html"/);
  assert.match(page("index.html"), /href="overbilling-underbilling\.html"/);
});

test("joint checks page: inputs labelled, the secondary source said so, the California opinion linked, linked from the waiver guide", () => {
  const html = page("joint-checks.html");
  for (const id of ["jc-check", "jc-state", "jc-suppliers", "jc-project", "jc-payer", "jc-sub", "jc-no"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(html, /secondary source/);
  assert.match(html, /agc\.org\/sites\/default\/files\/pdf\/Handout/);
  assert.match(html, /scocal\.stanford\.edu\/opinion\/post-bros-constr-co-v-yoder-28055/);
  assert.match(html, /2026-11-25/);
  assert.match(page("conditional-vs-unconditional-lien-waivers.html"), /href="joint-checks\.html"/);
});

test("retainage tracker inputs are labelled, its script rows carry the column labels, and the retainage guides link to it", () => {
  const html = page("retainage-tracker.html");
  for (const id of ["asof", "days", "rate", "jobs", "file"]) assert.match(html, new RegExp(`<label for="${id}">`));
  for (const name of ["index.html", "retainage-explained.html", "retainage-release.html", "retainage-in-quickbooks.html"]) assert.match(page(name), /href="retainage-tracker\.html"/, name);
  const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
  const heads = [...table.matchAll(/<th role="columnheader" scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1].trim());
  const row = /\$\("#rows"\)\.innerHTML = [^\n]*/.exec(html)[0];
  const labels = [...row.matchAll(/<td data-label="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, heads);
});

test("lien waiver log: inputs labelled, phone labels match headers, linked from the waiver guide and the calculator", () => {
  const html = page("lien-waiver-log.html");
  for (const id of ["project", "asof", "chase", "next", "log", "file"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
  const heads = [...table.matchAll(/<th role="columnheader" scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1].trim());
  const row = /\$\("#rows"\)\.innerHTML = [^\n]*/.exec(html)[0];
  assert.deepEqual([...row.matchAll(/<td data-label="([^"]*)"/g)].map((m) => m[1]), heads);
  for (const name of ["index.html", "conditional-vs-unconditional-lien-waivers.html"]) assert.match(page(name), /href="lien-waiver-log\.html"/, name);
  assert.match(html, /does not decide|Not decided here/);
});

// nav.mjs: every page carries the same grouped list of every page, so no page is an orphan.
// A new page fails here until it is added to GROUPS and `node nav.mjs` is run.
test("every page is in the all-guides list and carries the current block", async () => {
  const { readdirSync } = await import("node:fs");
  const { GROUPS, block, listed } = await import("./nav.mjs");
  const files = readdirSync(new URL("./", import.meta.url)).filter((f) => f.endsWith(".html")).sort();
  assert.deepEqual([...listed()].sort(), files, "add the page to GROUPS in nav.mjs, then run node nav.mjs");
  assert.equal(new Set(listed()).size, listed().length, "a page is listed twice");
  assert.ok(GROUPS.every(([, links]) => links.length));
  for (const name of files) {
    const html = page(name);
    assert.ok(html.includes(block(name)), `${name}: run node nav.mjs`);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1, name);
  }
});

test("the line-remove column has a header a screen reader can read and nothing clips", () => {
  assert.match(page("index.html"), /<th scope="col"><span class="vh">Remove line<\/span><\/th>/);
  assert.match(page("style.css"), /\.vh \{ position: absolute;/);
});
test("sworn statement page: inputs labelled, both statutes linked to the official sites with a read date, linked from the guides", () => {
  const html = page("sworn-statement.html");
  for (const id of ["list", "state", "contract-sum", "requested", "project", "through"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.match(html, /href="https:\/\/www\.ilga\.gov\/legislation\/ilcs\/fulltext\.asp\?DocName=077000600K5"/);
  assert.match(html, /href="https:\/\/www\.legislature\.mi\.gov\/Laws\/MCL\?objectName=mcl-570-1110"/);
  assert.match(html, /2026-11-25/);
  assert.match(html, /does not supply the statutory wording or the oath/);
  // Rows are built in script: their phone labels come from HEADS, which must match the header row.
  const heads = [...html.slice(html.indexOf('id="builder"')).matchAll(/<th role="columnheader" scope="col">([^<]*)<\/th>/g)].slice(0, 7).map((m) => m[1]);
  assert.ok(html.includes(`const HEADS = ${JSON.stringify(heads).replaceAll('","', '", "')};`), "HEADS matches the header row");
  for (const name of ["index.html", "how-to-fill-out-a-pay-application.html", "conditional-vs-unconditional-lien-waivers.html"]) assert.match(page(name), /href="sworn-statement\.html"/, name);
});


test("paid-short page: inputs labelled, phone labels match the header row, never suggests waiving money not received, linked from the guides", () => {
  const html = page("paid-short.html");
  for (const id of ["applied", "certified", "number", "project", "gc", "checks", "deductions"]) assert.match(html, new RegExp(`<label for="${id}">`));
  const heads = [...html.slice(html.indexOf('id="reconciler"')).matchAll(/<th role="columnheader" scope="col">([^<]*)<\/th>/g)].slice(0, 6).map((m) => m[1]);
  assert.ok(html.includes(`const HEADS = ${JSON.stringify(heads).replaceAll('","', '", "')};`), "HEADS matches the header row");
  assert.match(html, /Don't waive what you were not paid/);
  for (const name of ["conditional-vs-unconditional-lien-waivers.html", "prompt-payment-laws.html"]) assert.match(page(name), /href="paid-short\.html"/, name);
});

// The calculator's header once listed 15 guides, pushing step 1 below the fold on a 390 px phone
// (844 px down), and the waiver guide's listed 10. Every page now keeps a few picks in its header;
// the full list is the generated all-guides block (id="all-guides"), which the calculator and the
// waiver guide jump to.
test("every header keeps at most six links; the calculator and waiver guide jump to every guide", () => {
  for (const name of PAGES) {
    const html = page(name);
    const at = html.indexOf('<nav class="guides"');
    if (at < 0) continue;
    const links = html.slice(at, html.indexOf("</nav>", at)).match(/<a /g) || [];
    assert.ok(links.length <= 6, `${name}: header has ${links.length} links; add pages to nav.mjs GROUPS instead`);
  }
  for (const name of ["index.html", "conditional-vs-unconditional-lien-waivers.html"]) {
    const html = page(name);
    const nav = html.slice(html.indexOf('<nav class="guides"'), html.indexOf("</nav>", html.indexOf('<nav class="guides"')));
    assert.ok((nav.match(/<a /g) || []).length <= 5, `${name}: at most five header links`);
    assert.match(nav, /href="#all-guides"/, name);
    assert.match(html, /<nav class="all-guides" id="all-guides"/, name);
  }
});

test("waiver guide links the lien deadline calculator and the waiver checker, and the calculator links back", () => {
  const html = page("conditional-vs-unconditional-lien-waivers.html");
  assert.match(html, /href="\.\.\/mechanics-lien-deadline-calculator\/"/);
  assert.match(html, /href="\.\.\/lien-waiver-checker\/"/);
  const calc = readFileSync(new URL("../mechanics-lien-deadline-calculator/index.html", import.meta.url), "utf8");
  for (const p of ["conditional-vs-unconditional-lien-waivers.html", "prompt-payment-laws.html", "miller-act-payment-bond-claims.html"]) assert.ok(calc.includes(`href="../pay-app-guides/${p}"`), p);
});

test("Miller Act page: inputs labelled, statute and FAR linked with a read date, linked from the guides", () => {
  const html = page("miller-act-payment-bond-claims.html");
  for (const id of ["tier", "last-day", "today", "contract", "claimant", "furnished-to", "prime", "amount", "project", "contract-no"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(html, /href="https:\/\/www\.law\.cornell\.edu\/uscode\/text\/40\/3133"/);
  assert.match(html, /href="https:\/\/www\.acquisition\.gov\/far\/28\.102-1"/);
  assert.match(html, /read 2026-11-25/);
  assert.match(html, /federal jobs only/);
  for (const name of ["prompt-payment-laws.html", "joint-checks.html", "conditional-vs-unconditional-lien-waivers.html"]) assert.match(page(name), /href="miller-act-payment-bond-claims\.html"/, name);
});

// Guides that carry FAQPage markup (polish, 2026-11-25; every guide since the
// second pass the same day). The list may only
// grow: a guide that answers the question people search should keep saying
// so in a form an answer engine can lift. Each question must also be an h3 in
// the page's visible "Common questions" section.
const FAQ_PAGES = [
  "california-preliminary-notice.html", "florida-notice-to-owner.html", "texas-lien-notice.html", "certificate-of-insurance-for-subcontractors.html", "change-order-log.html", "change-orders-schedule-of-values.html",
  "conditional-vs-unconditional-lien-waivers.html", "gc-portal-billing.html",
  "front-loading-schedule-of-values.html", "how-to-fill-out-a-pay-application.html", "progress-billing.html",
  "how-to-write-an-rfi.html", "index.html", "joint-checks.html", "lien-waiver-forms-by-state.html",
  "lien-waiver-log.html", "miller-act-payment-bond-claims.html",
  "overbilling-underbilling.html", "paid-short.html", "pay-app-cash-forecast.html",
  "pay-application-checker.html", "pay-application-software-compared.html", "coconstruct-alternatives.html",
  "pay-if-paid-clauses.html", "prompt-payment-laws.html", "retainage-explained.html",
  "retainage-in-quickbooks.html", "retainage-release.html", "retainage-tracker.html",
  "schedule-of-values-template.html", "stored-materials-billing.html",
  "sworn-statement.html", "tm-tickets.html", "punch-list.html",
  // state-forms.mjs: one page per state with statutory waiver forms
  ...["arizona", "california", "florida", "georgia", "massachusetts", "michigan", "mississippi", "missouri", "nevada", "texas", "utah", "wyoming"].map((s) => `${s}-lien-waiver-forms.html`),
];

test("guides with an FAQ keep FAQPage markup that matches visible questions", () => {
  // Compare in the HTML's own escaped form: no tag stripping or entity decoding here.
  const escape = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const name of FAQ_PAGES) {
    const html = page(name);
    const block = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .flatMap((m) => { const d = JSON.parse(m[1]); return Array.isArray(d) ? d : d["@graph"] || [d]; })
      .find((d) => d["@type"] === "FAQPage");
    assert.ok(block, `${name}: no FAQPage JSON-LD`);
    const faq = html.match(/<section[^>]*id="faq"[^>]*>([\s\S]*?)<\/section>/);
    if (!faq) continue; // index.html: questions are derived by the site build from its own markup
    const visible = [...faq[1].matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map((m) => m[1].trim());
    for (const q of block.mainEntity) assert.ok(visible.includes(escape(q.name)), `${name}: "${q.name}" not shown on the page`);
  }
});

test("every guide page carries an FAQ (a new guide ships with one)", () => {
  const all = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".html"));
  const missing = all.filter((f) => !FAQ_PAGES.includes(f));
  assert.deepEqual(missing, [], `add a "Common questions" section and FAQPage JSON-LD, then list the page in FAQ_PAGES: ${missing.join(", ")}`);
});

test("certificate of insurance guide: says the certificate is not the coverage, names each endorsement, cites and dates its sources", () => {
  const html = page("certificate-of-insurance-for-subcontractors.html");
  assert.match(html, /confers no rights on the certificate holder/);
  for (const form of ["CG 20 10", "CG 20 37", "CG 24 04", "CG 20 01"]) assert.match(html, new RegExp(form), form);
  assert.match(html, /read 2026-11-27/);
  assert.match(html, /secondary sources/);
  const links = [...html.matchAll(/href="(https:[^"]+)"/g)].map((m) => m[1]).filter((h) => !/marisstella|github\.com\/sponsors/.test(h) && !h.startsWith(APP_URL ?? "\0"));
  assert.ok(links.length >= 5, `only ${links.length} sources`);
  assert.match(page("index.html"), /href="certificate-of-insurance-for-subcontractors\.html"/);
});

test("RFI guide: drafter inputs labelled, wired to rfi.mjs, linked from the tools and the T&M page", () => {
  const html = page("how-to-write-an-rfi.html");
  for (const id of ["number", "project", "to", "from", "sent", "subject", "drawings", "spec", "question", "proposal", "impact", "due", "reason", "attachments", "out"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(html, /from "\.\/rfi\.mjs"/);
  assert.match(html, /does not authorize extra work/);
  assert.match(html, /record\("guide_rfi_viewed"\)/);
  assert.match(html, /No warranty/);
  assert.match(page("tm-tickets.html"), /href="how-to-write-an-rfi\.html"/);
});

test("punch list page: inputs labelled, wired to punch.mjs, linked from retainage release and the construction page", () => {
  const html = page("punch-list.html");
  for (const id of ["pl-text", "pl-file", "pl-asof", "pl-ret", "em-gc", "em-pm", "em-project", "em-sub"]) assert.match(html, new RegExp(`<label for="${id}"`), id);
  assert.match(html, /from "\.\/punch\.mjs"/);
  assert.match(html, /record\("guide_punch_list_viewed"\)/);
  assert.match(html, /does not say your subcontract's conditions for payment or retainage are met/);
  assert.match(page("retainage-release.html"), /href="punch-list\.html"/);
  assert.match(readFileSync(new URL("../../platform/pages/industry-construction.mjs", import.meta.url), "utf8"), /pay-app-guides\/punch-list\.html/);
});
