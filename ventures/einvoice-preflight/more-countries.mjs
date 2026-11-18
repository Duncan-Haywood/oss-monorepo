// The "More countries" block at the foot of every country page, kept in one
// place.
//
// Until 2026-11-18 each of the 93 country pages carried a hand-pasted copy of
// this list, and the copies had drifted: a page linked between 17 and 52 of
// the other 92 countries, five pages (Bangladesh, Benin, Ethiopia, Malawi,
// Namibia) were linked from no other country page at all, 25 more from just
// one, and three links (Armenia, Azerbaijan, Georgia)
// carried the label "Moldova". Grouping by region also turns a flat run of 92
// names into something a reader can scan.
//
//   node ventures/einvoice-preflight/more-countries.mjs          # check, exit 1 on drift
//   node ventures/einvoice-preflight/more-countries.mjs --write  # rewrite every page's block
//
// A new country page goes into REGIONS below, then run --write. The test
// (more-countries.test.mjs) fails while any page's block differs from this list,
// or while a *-e-invoice-mandate.html page is missing from it.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const HUB = "e-invoicing-mandates-by-country.html";

export const REGIONS = [
  ["European Union", [
    ["austria-e-invoice-mandate.html", "Austria"],
    ["belgium-e-invoice-mandate.html", "Belgium"],
    ["bulgaria-e-invoice-mandate.html", "Bulgaria"],
    ["croatia-e-invoice-mandate.html", "Croatia"],
    ["cyprus-e-invoice-mandate.html", "Cyprus"],
    ["czech-republic-e-invoice-mandate.html", "Czech Republic"],
    ["denmark-e-invoice-mandate.html", "Denmark"],
    ["estonia-e-invoice-mandate.html", "Estonia"],
    ["finland-e-invoice-mandate.html", "Finland"],
    ["france-e-invoice-mandate.html", "France"],
    ["germany-e-invoice-mandate.html", "Germany"],
    ["greece-mydata-e-invoice-mandate.html", "Greece"],
    ["hungary-e-invoice-mandate.html", "Hungary"],
    ["ireland-e-invoice-mandate.html", "Ireland"],
    ["italy-sdi-e-invoice-mandate.html", "Italy"],
    ["latvia-e-invoice-mandate.html", "Latvia"],
    ["lithuania-e-invoice-mandate.html", "Lithuania"],
    ["luxembourg-e-invoice-mandate.html", "Luxembourg"],
    ["malta-e-invoice-mandate.html", "Malta"],
    ["netherlands-e-invoice-mandate.html", "Netherlands"],
    ["poland-ksef-e-invoice-mandate.html", "Poland"],
    ["portugal-e-invoice-mandate.html", "Portugal"],
    ["romania-e-factura-e-invoice-mandate.html", "Romania"],
    ["slovakia-e-invoice-mandate.html", "Slovakia"],
    ["slovenia-e-invoice-mandate.html", "Slovenia"],
    ["spain-verifactu-e-invoice-mandate.html", "Spain"],
    ["sweden-e-invoice-mandate.html", "Sweden"],
  ]],
  ["Rest of Europe and Central Asia", [
    ["albania-e-invoice-mandate.html", "Albania"],
    ["armenia-src-e-invoice-mandate.html", "Armenia"],
    ["azerbaijan-e-qaime-e-invoice-mandate.html", "Azerbaijan"],
    ["georgia-rs-e-invoice-mandate.html", "Georgia"],
    ["kazakhstan-is-esf-e-invoice-mandate.html", "Kazakhstan"],
    ["moldova-e-factura-e-invoice-mandate.html", "Moldova"],
    ["norway-e-invoice-mandate.html", "Norway"],
    ["serbia-e-invoice-mandate.html", "Serbia"],
    ["switzerland-e-invoice-mandate.html", "Switzerland"],
    ["turkey-e-invoice-mandate.html", "Turkey"],
    ["ukraine-erpn-e-invoice-mandate.html", "Ukraine"],
    ["uk-e-invoice-mandate.html", "United Kingdom"],
    ["uzbekistan-soliq-e-invoice-mandate.html", "Uzbekistan"],
  ]],
  ["Middle East", [
    ["israel-allocation-number-e-invoice-mandate.html", "Israel"],
    ["jordan-jofotara-e-invoice-mandate.html", "Jordan"],
    ["oman-fawtara-e-invoice-mandate.html", "Oman"],
    ["qatar-e-invoice-mandate.html", "Qatar"],
    ["saudi-arabia-zatca-e-invoice-mandate.html", "Saudi Arabia"],
    ["uae-e-invoice-mandate.html", "United Arab Emirates"],
  ]],
  ["Africa", [
    ["benin-e-mecef-e-invoice-mandate.html", "Benin"],
    ["cote-divoire-fne-e-invoice-mandate.html", "Côte d'Ivoire"],
    ["egypt-eta-e-invoice-mandate.html", "Egypt"],
    ["ethiopia-eis-e-invoice-mandate.html", "Ethiopia"],
    ["ghana-e-vat-e-invoice-mandate.html", "Ghana"],
    ["kenya-etims-e-invoice-mandate.html", "Kenya"],
    ["malawi-mra-eis-e-invoice-mandate.html", "Malawi"],
    ["mauritania-stt-e-invoice-mandate.html", "Mauritania"],
    ["mauritius-e-invoice-mandate.html", "Mauritius"],
    ["morocco-e-invoice-mandate.html", "Morocco"],
    ["namibia-namra-e-invoice-mandate.html", "Namibia"],
    ["nigeria-mbs-e-invoice-mandate.html", "Nigeria"],
    ["rwanda-eis-e-invoice-mandate.html", "Rwanda"],
    ["tanzania-efd-vfd-e-invoice-mandate.html", "Tanzania"],
    ["tunisia-el-fatoora-e-invoice-mandate.html", "Tunisia"],
    ["uganda-efris-e-invoice-mandate.html", "Uganda"],
    ["zambia-smart-invoice-e-invoice-mandate.html", "Zambia"],
  ]],
  ["Asia and Pacific", [
    ["australia-e-invoice-mandate.html", "Australia"],
    ["bangladesh-nbr-e-invoice-mandate.html", "Bangladesh"],
    ["china-fapiao-e-invoice-mandate.html", "China"],
    ["india-gst-e-invoice-mandate.html", "India"],
    ["indonesia-coretax-e-invoice-mandate.html", "Indonesia"],
    ["japan-invoice-system-e-invoice-mandate.html", "Japan"],
    ["malaysia-myinvois-e-invoice-mandate.html", "Malaysia"],
    ["new-zealand-e-invoice-mandate.html", "New Zealand"],
    ["pakistan-fbr-e-invoice-mandate.html", "Pakistan"],
    ["philippines-bir-eis-e-invoice-mandate.html", "Philippines"],
    ["singapore-invoicenow-e-invoice-mandate.html", "Singapore"],
    ["south-korea-e-invoice-mandate.html", "South Korea"],
    ["taiwan-gui-e-invoice-mandate.html", "Taiwan"],
    ["thailand-rd-e-invoice-mandate.html", "Thailand"],
    ["vietnam-e-invoice-mandate.html", "Vietnam"],
  ]],
  ["Americas", [
    ["argentina-arca-e-invoice-mandate.html", "Argentina"],
    ["bolivia-sin-e-invoice-mandate.html", "Bolivia"],
    ["brazil-nfe-e-invoice-mandate.html", "Brazil"],
    ["chile-sii-e-invoice-mandate.html", "Chile"],
    ["colombia-dian-e-invoice-mandate.html", "Colombia"],
    ["costa-rica-hacienda-e-invoice-mandate.html", "Costa Rica"],
    ["dominican-republic-dgii-e-invoice-mandate.html", "Dominican Republic"],
    ["ecuador-sri-e-invoice-mandate.html", "Ecuador"],
    ["el-salvador-dte-e-invoice-mandate.html", "El Salvador"],
    ["guatemala-sat-fel-e-invoice-mandate.html", "Guatemala"],
    ["mexico-cfdi-e-invoice-mandate.html", "Mexico"],
    ["panama-dgi-sfep-e-invoice-mandate.html", "Panama"],
    ["paraguay-dnit-e-invoice-mandate.html", "Paraguay"],
    ["peru-sunat-e-invoice-mandate.html", "Peru"],
    ["uruguay-dgi-e-invoice-mandate.html", "Uruguay"],
  ]],
];

// The generated block, or (until a page is first rewritten) the hand-pasted
// <section><h2>More countries</h2><p>…</p></section> it replaces.
export const BLOCK_RE = /<section class="more-countries"[\s\S]*?<\/section>|<section>\s*<h2>More countries<\/h2>[\s\S]*?<\/section>/;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&#x27;");

export const COUNTRY_COUNT = REGIONS.reduce((n, [, links]) => n + links.length, 0);

// The block for one page: every region, minus the page itself. Inline styles,
// because each page has its own <style> block; the <section> keeps the page's
// card look. Regions are short runs of links rather than lists, so 92 names
// stay about one phone screen tall.
export function moreCountries(page) {
  const parts = [
    '<section class="more-countries" aria-labelledby="more-countries-h">',
    '<h2 id="more-countries-h">More countries</h2>',
    `<p>All ${COUNTRY_COUNT} countries side by side, with dates and formats: <a href="${HUB}">e-invoicing mandates by country</a>.</p>`,
  ];
  // A name never breaks across lines, and the separator stays on the line
  // of the name before it, so no line starts with a dot. Two columns of
  // regions on a wide screen, one on a phone.
  parts.push('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:0 28px">');
  for (const [title, links] of REGIONS) {
    const items = links.filter(([href]) => href !== page);
    if (!items.length) continue;
    const runs = items.map(([href, label]) => `<a href="${href}" style="white-space:nowrap">${esc(label)}</a>`).join("&nbsp;· ");
    parts.push(`<div><h3 style="font-size:1rem;margin:14px 0 2px">${esc(title)}</h3><p style="margin:0;line-height:1.9">${runs}</p></div>`);
  }
  parts.push("</div>", "</section>");
  return parts.join("\n");
}

const DIR = new URL("./", import.meta.url);

export const isCountryPage = (f) => f.endsWith("-e-invoice-mandate.html");

export function countryPages() {
  return readdirSync(DIR).filter(isCountryPage).sort();
}

// [{ page, problem }] for every page whose block is missing or stale.
export function drift() {
  const out = [];
  for (const page of countryPages()) {
    const html = readFileSync(new URL(page, DIR), "utf8");
    const m = html.match(BLOCK_RE);
    if (!m) out.push({ page, problem: "no More countries block" });
    else if (m[0] !== moreCountries(page)) out.push({ page, problem: "block differs from REGIONS" });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) {
    let n = 0;
    for (const { page, problem } of drift()) {
      if (problem === "no More countries block") { console.error(`${page}: no block to replace; add one by hand`); process.exitCode = 1; continue; }
      const file = new URL(page, DIR);
      writeFileSync(file, readFileSync(file, "utf8").replace(BLOCK_RE, moreCountries(page)));
      n++;
    }
    console.log(`rewrote ${n} page(s)`);
  } else {
    const d = drift();
    for (const { page, problem } of d) console.log(`${page}: ${problem}`);
    console.log(d.length ? `${d.length} page(s) out of date: run with --write` : "every page's block matches REGIONS");
    process.exitCode = d.length ? 1 : 0;
  }
}
