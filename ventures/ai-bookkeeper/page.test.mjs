import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const script = () => page("index.html").match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not modelled:/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const blocks = [...page("index.html").matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
});

test("every form control has a label", () => {
  const html = page("index.html");
  for (const id of ["bank", "file", "auto", "paste", "invert", "dayfirst", "accept-min", "provider", "model", "apikey", "baseurl", "remember", "from", "to", "open", "rules", "coa"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
});

test("the page itself never calls the network; only the opt-in AI module may", () => {
  for (const f of ["engine.mjs", "bank.mjs", "ledger.mjs", "categorize.mjs", "example-data.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
  assert.doesNotMatch(script(), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(page("index.html"), /<script[^>]+src=["']https?:/);
});

test("statement text is never written as HTML", () => {
  assert.doesNotMatch(script(), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("the module scripts import only local files, and every imported name exists", async () => {
  const s = script();
  for (const m of s.matchAll(/import \{([^}]+)\} from "(\.\/[^"]+)"/g)) {
    const mod = await import(m[2]);
    for (const n of m[1].split(",").map((x) => x.trim())) assert.ok(n in mod, `${n} from ${m[2]}`);
  }
  assert.deepEqual([...s.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).filter((x) => !x.startsWith("./")), []);
});

test("the inline script parses once its imports are removed", () => {
  assert.doesNotThrow(() => new Function(script().replace(/^\s*import .*$/gm, "")));
});

test("every element id the script reads exists in the markup", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of script().matchAll(/\$\("#([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), `#${m[1]}`);
});

test("the measured claims on the page match the README", () => {
  const html = page("index.html"), readme = page("README.md");
  for (const claim of ["1,300 of 2,164", "542 of 642", "2,892 lines"]) { assert.ok(html.includes(claim), claim); assert.ok(readme.includes(claim), `README: ${claim}`); }
});

test("the invoice and bill loader and rule suggestions are wired to controls that exist", () => {
  const html = page("index.html");
  for (const id of ["docs-file", "docs-paste"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(script(), /addDocuments\(books/);
  assert.match(script(), /suggestRules\(books\)/);
});

test("the page offers a write-off button for open invoices", () => {
  assert.match(script(), /writeOff\(books, o\.id\)/);
});

test("a multi-account OFX file gets a per-account mapping on the page", () => {
  const html = page("index.html");
  assert.match(html, /id="ofx-map"/);
  assert.match(script(), /importOfxAccounts\(books/);
  assert.match(script(), /splitOfx\(text\)/);
});

test("the page shows the cash flow statement from the engine", () => {
  assert.match(page("index.html"), /id="cf"/);
  assert.match(script(), /r\.cashFlow/);
});

test("the page has an equipment register card wired to the engine", () => {
  const html = page("index.html");
  for (const id of ["fa-name", "fa-date", "fa-cost", "fa-life"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(script(), /addAsset\(books/);
  assert.match(script(), /disposeAsset\(books/);
  assert.match(script(), /register\(books\)/);
});

test("the page shows recurring payments and a cash forecast from the engine", () => {
  assert.match(page("index.html"), /id="recurring"/);
  assert.match(page("index.html"), /id="forecast"/);
  assert.match(script(), /detectRecurring\(books\)/);
  assert.match(script(), /forecastCash\(books\)/);
});

test("the page shows the UK VAT return worksheet from the engine", () => {
  assert.match(page("index.html"), /id="vat"/);
  assert.match(script(), /vatReturn\(books/);
});

test("the page has a reconcile-to-statement card wired to the engine", () => {
  const html = page("index.html");
  for (const id of ["recon-account", "recon-date", "recon-balance", "recon-check", "recon"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(script(), /reconcile\(books, \{ account: \$\("#recon-account"\)\.value/);
});

test("the page has a processor-payouts card wired to the engine", () => {
  const html = page("index.html");
  for (const id of ["po-file", "po-paste", "po-plan", "po-post", "po-result"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(script(), /planPayouts\(books, readPayoutReport\(text\)\)/);
  assert.match(script(), /applyPayouts\(books, plan\)/);
});

test("every module the page loads, transitively, is free of node: imports", () => {
  const seen = new Set(), bad = [];
  const walk = (src, name) => {
    for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s+"([^"]+)"/g)) {
      const spec = m[1];
      if (spec.startsWith("node:")) { bad.push(`${name} -> ${spec}`); continue; }
      if (!spec.startsWith("./") || seen.has(spec)) continue;
      seen.add(spec); walk(page(spec.slice(2)), spec.slice(2));
    }
  };
  walk(script(), "index.html");
  assert.ok(seen.size > 5, "walked the page's modules");
  assert.deepEqual(bad, [], "a browser cannot load node: modules, so the whole page script would die");
});

test("the payroll card is labelled and wired to the payroll engine", () => {
  const html = page("index.html");
  for (const id of ["pr-file", "pr-paste", "pr-year", "pr-q"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.match(script(), /addPayroll\(books/);
  assert.match(script(), /applyPayroll\(books, planPayroll\(books\)\)/);
  assert.match(script(), /form941\(books/);
});

test("the tax estimate card exists, its ids are labelled, and estimatedTax is imported", () => {
  const html = page("index.html");
  for (const id of ["est-filing", "est-months", "est-wages", "est-other", "est-withheld", "est-paid", "est-prior", "est-prior-agi", "est-health", "est-retire", "est-children", "est-other-deps", "est-over65", "est-blind", "est-eitc", "est-bizwages", "est-state-rate", "est-state-ded", "est-state-wh"]) assert.match(html, new RegExp(`<label[^>]*>[^<]*<(input|select) id="${id}"`), id);
  assert.match(script(), /import \{ estimatedTax \} from "\.\/estimatedtax\.mjs"/);
  assert.match(html, /A worksheet, not tax advice/);
  assert.match(script(), /import \{ annualizedInstallments \} from "\.\/annualized\.mjs"/);
  assert.match(html, /id="est-annual"/);
  assert.match(html, /id="annual"/);
  for (const id of ["scorp-salary", "scorp-cost"]) assert.match(html, new RegExp(`<label[^>]*>[^<]*<input id="${id}"`), id);
  assert.match(script(), /import \{ scorpFromBooks \} from "\.\/scorp\.mjs"/);
  assert.match(html, /id="est-scorp"/);
  assert.match(html, /id="scorp"/);
});

test("installable app: manifest, icons and an offline shell covering every module the page imports", () => {
  const html = page("index.html");
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /serviceWorker\.register\("sw\.js"\)/);
  const man = JSON.parse(page("manifest.webmanifest"));
  assert.equal(man.display, "standalone");
  for (const i of man.icons) assert.ok(existsSync(new URL(`./${i.src}`, import.meta.url)), i.src);
  assert.ok(man.icons.some((i) => i.purpose === "maskable"));
  const sw = page("sw.js");
  const shell = new Set([...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]));
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    const t = page(f), src = f.endsWith(".html") ? script() : t;
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']\.\/([^"']+)["']/g)) walk(m[1]);
  };
  walk("index.html");
  for (const f of seen) assert.ok(shell.has(f), `${f} missing from the service worker shell`);
  for (const f of shell) if (f) assert.ok(existsSync(new URL(`./${f}`, import.meta.url)), `${f} does not exist`);
  assert.doesNotMatch(sw, /fetch\(["'`]https?:|importScripts/);
});

test("the reports card shows a cash-basis profit and loss when the books carry invoices or bills", () => {
  const html = page("index.html");
  assert.match(html, /id="cashpnl"/);
  assert.match(script(), /import \{ cashBasis \} from "\.\/cashbasis\.mjs"/);
  assert.match(script(), /cashBasis\(books, \{ from:/);
});

test("the sales tax return worksheet is on the page and shares its spec parsers with the CLI", () => {
  const html = page("index.html");
  for (const id of ["str-freq", "str-state", "str-rate", "str-disc"]) assert.match(html, new RegExp(`<label for="${id}"`), id);
  assert.match(script(), /import \{ salesTaxReturn, parseRateSpecs, parseDiscountSpecs,/);
  assert.match(html, /id="str-box" hidden/);
});

test("tax-calendar page has the disclaimer, a labelled form and no network calls", () => {
  const html = page("tax-calendar.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  for (const id of ["year", "state", "freq"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
});
