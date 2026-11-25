import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

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
    assert.match(html, /in development, with early access<\/strong>; nothing is for sale yet/, name);
    assert.match(html, /href="https:\/\/marisstella\.app\/industries\/construction\/"/, name);
    assert.match(html, /<title>[^<]{3,60}<\/title>/, name);
    const desc = /<meta name="description" content="([^"]*)"/.exec(html);
    assert.ok(desc && desc[1].length <= 160, `${name}: meta description must be 160 characters or fewer`);
  }
});

test("no page sends anything anywhere or loads remote scripts", () => {
  for (const name of [...PAGES, "calc.mjs", "colog.mjs", "retlog.mjs", "billing.mjs", "check.mjs", "waivers.mjs", "sworn.mjs", "usage.mjs"]) {
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
  const guides = PAGES.filter((name) => name !== "index.html" && name !== "change-order-log.html" && name !== "lien-waiver-log.html" && name !== "retainage-tracker.html");
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
  const official = /^https:\/\/(www\.azleg\.gov|www\.leg\.state\.nv\.us|statutes\.capitol\.texas\.gov|le\.utah\.gov|www\.flsenate\.gov|www\.legislature\.mi\.gov|wyoleg\.gov|leginfo\.legislature\.ca\.gov)\//;
  for (const [, state, href] of rows) assert.match(href, official, state);
  assert.match(html, /2026-11-25/);
});

test("the QuickBooks guide cites Intuit's own pages, says it is not Intuit, and its calculator is labelled", () => {
  const html = page("retainage-in-quickbooks.html");
  const links = [...html.matchAll(/href="(https:[^"]+)"/g)].map((m) => m[1]).filter((h) => !/marisstella|github\.com\/sponsors/.test(h));
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

