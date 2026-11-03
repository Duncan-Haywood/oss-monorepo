// Builds e-invoicing-deadlines-2027.html from mandate-dates.json, the same
// dated milestones the hub table, the .ics feed and the countdown use, so
// the page cannot drift from the hub.
//   node deadlines-page.mjs           write the page
//   node deadlines-page.mjs --check   exit 1 if the written page is stale
// Only full day-month-year dates are listed (see mandate-calendar.mjs). A
// date that is already past is dropped by FROM, which is fixed in this file
// so the output is reproducible; move it when the page is refreshed.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(`./${f}`, import.meta.url));
export const FROM = "2026-11-02";
export const TO = "2027-12-31";
const SITE = "https://example.invalid/einvoice-preflight/";
const PAGE = "e-invoicing-deadlines-2027.html";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const human = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const quarter = (iso) => { const [y, m] = iso.split("-").map(Number); return `${y} Q${Math.ceil(m / 3)}`; };

export function pick(events) {
  return events.filter((e) => e.date >= FROM && e.date <= TO);
}

export function render(events) {
  const list = pick(events);
  const countries = new Set(list.map((e) => e.country));
  const groups = new Map();
  for (const e of list) (groups.get(quarter(e.date)) ?? groups.set(quarter(e.date), []).get(quarter(e.date))).push(e);
  const title = "E-invoicing deadlines from November 2026 to the end of 2027, by date";
  const desc = `${list.length} dated e-invoicing mandate milestones in ${countries.size} countries between ${human(FROM)} and the end of 2027, in date order with the status and a link to each country page. Free, generated from one table.`;
  const sections = [...groups].map(([q, es]) => `<section>
<h2>${q}</h2>
<ul class="dl">
${es.map((e) => `<li><strong>${human(e.date)}</strong> <a href="${e.page}">${esc(e.country)}</a>: ${esc(e.note)} <span class="status">${esc(e.status)}</span></li>`).join("\n")}
</ul>
</section>`).join("\n");
  const ld = { "@context": "https://schema.org", "@type": "ItemList", name: title, numberOfItems: list.length,
    itemListElement: list.map((e, i) => ({ "@type": "ListItem", position: i + 1, name: `${e.country}: ${human(e.date)}`, url: SITE + e.page })) };
  const hub = fs.readFileSync(here("e-invoicing-mandates-by-country.html"), "utf8");
  const style = hub.match(/<style>[\s\S]*?<\/style>/)[0];
  const icon = hub.match(/<link rel="icon"[^>]*>/)[0];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">${icon}<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | E-invoice Preflight</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${SITE}${PAGE}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${PAGE}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
${style}
<style>.dl{padding-left:1.1rem}.dl li{margin:.55rem 0}.status{display:inline-block;margin-left:.3rem;padding:.05rem .45rem;border-radius:99px;background:#dbe7f1;font-size:.8rem}</style>
</head>
<body>
<main>
<p class="eyebrow"><a href="./">&larr; E-invoice Preflight</a></p>
<header>
<h1>E-invoicing deadlines to the end of 2027</h1>
<p class="lede">${list.length} dated milestones in ${countries.size} countries, from ${human(FROM)} on, in date order. Pulled from the same table as the <a href="e-invoicing-mandates-by-country.html">mandates hub</a>, so the two cannot disagree.</p>
</header>
<p class="fine">Track them: <a href="mandate-calendar.ics">subscribe to the calendar (.ics)</a> or read the <a href="mandate-dates.json">JSON</a>. Only full day-month-year dates are listed. Rules that start in a month or a year without a day (Germany's 2027 and 2028 issuing steps, for one) are in the <a href="e-invoicing-mandates-by-country.html">hub table</a> and on each country page.</p>
${sections}
<section>
<h2>Test a file before your date arrives</h2>
<p>Open the <a href="./">checker</a>, drop your JSON, UBL, CII or Factur-X file and it runs the official EN 16931 rules in your browser, with a rule ID and a plain fix for each finding. Nothing is uploaded.</p>
</section>
<footer>
<p><strong>No warranty.</strong> This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or accounting advice, and it does not replace a qualified professional. <strong>You are responsible for reviewing and verifying its output before you rely on it.</strong> Dates come from the country pages, which cite public guidance and say where sources disagree; confirm with your tax authority.</p>
<p><strong>Nothing leaves your browser.</strong> This page is static.</p>
<p class="support">Free and open source. The <a href="LICENSE" rel="noopener">code is under an MIT licence</a>; <a href="https://github.com/sponsors/Duncan-Haywood">GitHub Sponsors</a> is optional and never changes what the tool does.</p>
</footer>
</main>
</body></html>
`;
}

export function build() {
  const events = JSON.parse(fs.readFileSync(here("mandate-dates.json"), "utf8")).events;
  return render(events);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = build();
  if (process.argv[2] === "--check") {
    if (!fs.existsSync(here(PAGE)) || fs.readFileSync(here(PAGE), "utf8") !== html) { console.error(`${PAGE} is stale: run node deadlines-page.mjs`); process.exit(1); }
  } else { fs.writeFileSync(here(PAGE), html); console.log(`wrote ${PAGE}`); }
}
