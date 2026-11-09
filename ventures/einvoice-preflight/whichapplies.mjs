// "Which e-invoice duty applies to me, and from when?" For seven countries whose
// start date depends on the business's size, the size cut-offs below are the
// ones the repo's own country pages cite (each rule names its page). A
// business is placed in a wave by one typed number; nothing is looked up.
//   node whichapplies.mjs                 write which-e-invoice-mandate-applies.html
//   node whichapplies.mjs --check         exit 1 if the page is stale
//   node whichapplies.mjs DE 500000       print the answer for Germany, EUR 500,000
// Cut-offs come from secondary guides on the country pages (several are marked
// there as unread primary texts); confirm with the tax authority. Not advice.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(`./${f}`, import.meta.url));
const PAGE = "which-e-invoice-mandate-applies.html";
const SITE = "https://example.invalid/einvoice-preflight/";

// Each wave: [label, test(x) -> boolean] in order; the first true wins.
// `x` is the annual figure in the country's own currency, or "large"/"small"
// for France where the law uses employee and balance-sheet classes, not one number.
export const COUNTRIES = {
  DE: { name: "Germany", currency: "EUR", input: "number", prompt: "Prior-year turnover (EUR)", page: "germany-e-invoice-mandate.html",
    always: "Receiving structured e-invoices is required of every business since 1 January 2025.",
    waves: [
      { when: (x) => x > 800000, date: "2027-01-01", what: "You must issue structured e-invoices for domestic B2B sales (prior-year turnover above EUR 800,000)." },
      { when: () => true, date: "2028-01-01", what: "You must issue structured e-invoices for domestic B2B sales; until then you may use other formats (prior-year turnover of EUR 800,000 or less)." } ] },
  ES: { name: "Spain", currency: "EUR", input: "number", prompt: "Prior-year turnover (EUR)", page: "spain-verifactu-e-invoice-mandate.html",
    always: "Invoicing-software rules (Verifactu) are a separate duty with their own dates; see the country page.",
    waves: [
      { when: (x) => x > 8000000, date: "2027-10-06", what: "B2B e-invoicing starts (prior-year turnover above EUR 8 million), under Order HAC/1028/2026." },
      { when: () => true, date: "2028-10-06", what: "B2B e-invoicing starts for all other businesses." } ] },
  AE: { name: "United Arab Emirates", currency: "AED", input: "number", prompt: "Annual revenue (AED)", page: "uae-e-invoice-mandate.html",
    always: "The format is Peppol-based PINT AE, sent through an accredited service provider.",
    waves: [
      { when: (x) => x >= 50000000, date: "2027-01-01", what: "E-invoicing is mandatory (revenue of AED 50 million or more)." },
      { when: () => true, date: "2027-07-01", what: "E-invoicing is mandatory for the rest." } ] },
  PL: { name: "Poland", currency: "PLN", input: "number", prompt: "Prior-year sales (PLN, including VAT)", page: "poland-ksef-e-invoice-mandate.html",
    always: "KSeF covers B2B invoices between Polish VAT payers; B2C stays outside it.",
    note: "The smallest wave (monthly invoiced sales up to PLN 10,000 and single invoices up to PLN 450) is due 1 January 2027; it is defined by monthly sales, so this page cannot place you in it from a yearly figure.",
    waves: [
      { when: (x) => x > 200000000, date: "2026-02-01", what: "KSeF was mandatory for you from 1 February 2026 (sales above PLN 200 million)." },
      { when: () => true, date: "2026-04-01", what: "KSeF was mandatory for you from 1 April 2026 (most other VAT payers), unless you are in the smallest wave described below." } ] },
  OM: { name: "Oman", currency: "OMR", input: "number", prompt: "Annual supplies (OMR)", page: "oman-fawtara-e-invoice-mandate.html",
    always: "Reported only from secondary sources; the Gazette text is unread on the country page.",
    waves: [
      { when: (x) => x > 5000000, date: "2027-04-01", what: "Fawtara is reported as mandatory (annual supplies above OMR 5 million), Decision 189/2026." },
      { when: () => true, date: "2027-10-01", what: "Fawtara is reported as mandatory for the others." } ] },
  MY: { name: "Malaysia", currency: "MYR", input: "number", prompt: "Annual turnover (MYR)", page: "malaysia-myinvois-e-invoice-mandate.html",
    always: "Documents go to LHDN's MyInvois system, which validates them; sources disagree on the smallest wave and a relaxation period is reported to run to 31 December 2027.",
    waves: [
      { when: (x) => x > 100000000, date: "2024-08-01", what: "MyInvois e-invoicing started for you (turnover above RM100 million)." },
      { when: (x) => x >= 25000000, date: "2025-01-01", what: "MyInvois e-invoicing started for you (turnover RM25 million to RM100 million)." },
      { when: (x) => x >= 5000000, date: "2025-07-01", what: "MyInvois e-invoicing started for you (turnover RM5 million to RM25 million)." },
      { when: (x) => x >= 1000000, date: "2026-01-01", what: "MyInvois e-invoicing started for you (turnover RM1 million to RM5 million, Phase 4 announced June 2025)." },
      { when: () => true, date: "2026-07-01", what: "Reported start for turnover up to RM1 million, with a RM500,000 exemption announced; some sources say businesses below RM1 million are exempt. Check LHDN." } ] },
  FR: { name: "France", currency: "", input: "class", prompt: "Company size", page: "france-e-invoice-mandate.html",
    always: "Every business must be able to receive e-invoices from 1 September 2026.",
    note: "France defines size by headcount and balance sheet, not one number; pick the class your accountant uses.",
    waves: [
      { when: (x) => x === "large", date: "2026-09-01", what: "You must issue e-invoices for domestic B2B sales from 1 September 2026 (large and mid-size companies, ETI) and report other transactions." },
      { when: () => true, date: "2027-09-01", what: "You must issue e-invoices from 1 September 2027 (small and micro businesses)." } ] },
};

const FRESH = /^\d{4}-\d{2}-\d{2}$/;
export function answer(code, x) {
  const c = COUNTRIES[code];
  if (!c) throw new Error(`unknown country ${code}`);
  if (c.input === "number") {
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0) throw new Error("turnover must be a number of at least 0");
  } else if (x !== "large" && x !== "small") throw new Error('size must be "large" or "small"');
  const w = c.waves.find((v) => v.when(x));
  if (!FRESH.test(w.date)) throw new Error("bad date");
  return { country: c.name, date: w.date, what: w.what, always: c.always, note: c.note ?? null, page: c.page };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function render() {
  const hub = fs.readFileSync(here("e-invoicing-mandates-by-country.html"), "utf8");
  const style = hub.match(/<style>[\s\S]*?<\/style>/)[0];
  const icon = hub.match(/<link rel="icon"[^>]*>/)[0];
  const title = "Which e-invoicing deadline applies to my business? Check by country and size";
  const desc = "Type your country and yearly turnover and see the date your e-invoicing duty starts in Germany, Spain, the UAE, Poland, Oman, Malaysia or France. Runs in your browser; nothing is sent.";
  const data = Object.fromEntries(Object.entries(COUNTRIES).map(([k, c]) => [k, {
    name: c.name, input: c.input, prompt: c.prompt, always: c.always, note: c.note ?? null, page: c.page,
    waves: c.waves.map((w) => ({ date: w.date, what: w.what, test: w.when.toString() })) }]));
  const rows = Object.entries(COUNTRIES).map(([k, c]) => `<tr><th scope="row"><a href="${c.page}">${esc(c.name)}</a></th><td>${c.waves.map((w) => `${esc(w.date)}: ${esc(w.what)}`).join("<br>")}</td></tr>`).join("\n");
  const options = Object.entries(COUNTRIES).map(([k, c]) => `<option value="${k}">${esc(c.name)}</option>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">${icon}<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | E-invoice Preflight</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${SITE}${PAGE}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${PAGE}">
${style}
<style>label{display:block;margin:.8rem 0 .2rem}select,input{font:inherit;padding:.4rem;max-width:100%}#out{margin-top:1rem;padding:.8rem 1rem;border-left:4px solid #2b6cb0;background:#eef4fa}table{border-collapse:collapse;width:100%}td{border-top:1px solid #ccd;padding:.4rem;vertical-align:top}</style>
</head>
<body>
<main>
<p class="eyebrow"><a href="./">&larr; E-invoice Preflight</a></p>
<header>
<h1>Which e-invoicing deadline applies to me?</h1>
<p class="lede">Pick a country and type one number. You get the start date for your size, and a link to the country page with the sources.</p>
</header>
<form id="f" onsubmit="return false">
<label for="c">Country</label><select id="c">${options}</select>
<label for="x" id="xl">Prior-year turnover (EUR)</label>
<input id="x" type="number" min="0" step="any" inputmode="decimal" value="500000">
<select id="s" aria-label="Company size" hidden><option value="large">Large or mid-size (ETI)</option><option value="small">Small or micro</option></select>
</form>
<div id="out" role="status" aria-live="polite"></div>
<section>
<h2>The cut-offs this page uses</h2>
<table>
${rows}
</table>
<p class="fine">Cut-offs are those on each country page, which cite public guidance and say where it is only secondary. Other countries' dates do not depend on size and are in the <a href="e-invoicing-mandates-by-country.html">hub table</a>.</p>
</section>
<section>
<h2>Then test a file</h2>
<p>Open the <a href="./">checker</a>, drop your JSON, UBL, CII or Factur-X file and it runs the official EN 16931 rules in your browser, with a rule ID and a plain fix for each finding. Nothing is uploaded.</p>
</section>
<footer>
<p><strong>No warranty.</strong> This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or accounting advice, and it does not replace a qualified professional. <strong>You are responsible for reviewing and verifying its output before you rely on it.</strong> A rule can be defined by headcount, a related group, or a different year's figure than the one you type; confirm with your tax authority.</p>
<p><strong>Nothing leaves your browser.</strong> No tracking, no cookies.</p>
<p class="support">Free and open source. The <a href="LICENSE" rel="noopener">code is under an MIT licence</a>; <a href="https://github.com/sponsors/Duncan-Haywood">GitHub Sponsors</a> is optional and never changes what the tool does.</p>
</footer>
</main>
<script>
const D=${JSON.stringify(data).replace(/</g, "\\u003c")};
const $=(i)=>document.getElementById(i);
function go(){const c=D[$("c").value];$("xl").textContent=c.prompt;
 const isNum=c.input==="number";$("x").hidden=!isNum;$("s").hidden=isNum;
 const v=isNum?Number($("x").value):$("s").value;
 if(isNum&&(!Number.isFinite(v)||v<0||$("x").value==="")){$("out").textContent="Type a number of 0 or more.";return;}
 const w=c.waves.find((w)=>new Function("x","return ("+w.test+")(x)")(v));
 const d=new Date(w.date+"T00:00:00Z"),t=new Date();const days=Math.round((d-Date.UTC(t.getFullYear(),t.getMonth(),t.getDate()))/864e5);
 const when=days>0?days+" days from today":days===0?"today":(-days)+" days ago";
 $("out").replaceChildren();
 const add=(tag,txt)=>{const e=document.createElement(tag);e.textContent=txt;$("out").appendChild(e);return e};
 add("p",c.name+": "+w.date+" ("+when+")").style.fontWeight="700";
 add("p",w.what);add("p",c.always);if(c.note)add("p",c.note);
 const a=add("a","Sources and details for "+c.name);a.href=c.page;}
$("f").addEventListener("input",go);go();
</script>
</body></html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === "--check") {
    const h = render();
    if (!fs.existsSync(here(PAGE)) || fs.readFileSync(here(PAGE), "utf8") !== h) { console.error(`${PAGE} is stale: run node whichapplies.mjs`); process.exit(1); }
  } else if (a.length === 2) {
    const r = answer(a[0].toUpperCase(), COUNTRIES[a[0].toUpperCase()]?.input === "class" ? a[1] : Number(a[1]));
    console.log(`${r.country}: ${r.date}\n${r.what}\n${r.always}${r.note ? "\n" + r.note : ""}`);
  } else { fs.writeFileSync(here(PAGE), render()); console.log(`wrote ${PAGE}`); }
}
