// Writes br-fr-error-codes.html, every French BR-FR and BR-FR-CDV message in English, from the
// compiled rule sets and their translation table (plain/cius-fr-*.json, plain/cdar-fr.json,
// plain/br-fr-en.json), so the page and the checker cannot drift apart:
//   node build-br-fr-codes-page.mjs
// br-fr-codes-page.test.mjs fails when the committed page is not what this writes.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const load = (name) => JSON.parse(readFileSync(new URL(`./plain/${name}.json`, import.meta.url), "utf8"));
const manifest = JSON.parse(readFileSync(new URL("./plain/manifest.json", import.meta.url), "utf8"));
const SETS = [["cius-fr-ubl", "UBL"], ["cius-fr-cii", "CII"], ["cdar-fr", "CDAR"]];

// Same tidying as the checker's report (plain-schematron.mjs): no code prefix, no empty value slot.
export const tidy = (t) => t.replace(/^\[[^\]]+\]\s*[-:,]*\s*/, "").replace(/^(?:\w{1,20} : )?\[?BR-FR[^:]{0,40}:\s*/, "").replace(/\s*(?:Current value|Valeur actuelle)\s*:\s*""\.?/g, "").trim();
// The rule's code as FNFE writes it at the head of the message ("BR-FR-01/BT-1"), else the check id.
const codeOf = (c) => (c.text.match(/^\[?((?:BR-FR)[\w-]*(?:\/[\w-]+)*)/)?.[1] || c.id.replace(/_/, "/")).replace(/\/$/, "");
const family = (code) => code.match(/^BR-FR-(CDV|MV|BD|CO|DEC)/)?.[1] || (/^BR-FR-\d/.test(code) ? "core" : "other");

export function collect() {
  const rows = new Map();
  for (const [name, syntax] of SETS) {
    for (const p of load(name).patterns) for (const r of p.rules) for (const c of r.checks) {
      const code = codeOf(c);
      const en = tidy(c.en || c.text);
      const key = `${code}|${en}`;
      if (!rows.has(key)) rows.set(key, { code, id: c.id, en, fr: tidy(c.text), flag: c.flag, syntaxes: new Set() });
      rows.get(key).syntaxes.add(syntax);
    }
  }
  const num = (code) => code.replace(/\d+/g, (d) => d.padStart(4, "0"));
  return [...rows.values()].sort((a, b) => num(a.code).localeCompare(num(b.code)) || a.en.localeCompare(b.en));
}

const GROUPS = [
  ["core", "Core invoice rules (BR-FR-01 to BR-FR-32)", "Invoice number format, dates, French document types and billing frameworks (BT-23), SIREN and SIRET, VAT categories and rates, electronic addresses and notes."],
  ["CO", "Coherence rules (BR-FR-CO)", "Fields that must agree with each other: identifiers and their schemes, credit notes and the invoices they correct, the parties' roles."],
  ["DEC", "Amount format (BR-FR-DEC)", "How amounts are written: at most two decimals, a dot as separator, 19 characters."],
  ["MV", "Multi-vendor invoices (BR-FR-MV)", "Invoices whose GROUP lines carry their own seller (billing frameworks S8, B8, M8)."],
  ["BD", "Sub-lines and prior invoices (BR-FR-BD)", "GROUP lines with sub-lines, and the S9, B9, M9 frameworks that reference an earlier invoice."],
  ["CDV", "Life-cycle status messages (BR-FR-CDV, CDAR)", "The status messages (CDAR, D22B) a platform sends back: deposited, rejected, refused, in dispute, approved, paid, and the reason codes each allows."],
  ["other", "Other rules", ""],
];

const FAQ = [
  ["What is a BR-FR error?", "BR-FR rules are the French controls (AFNOR XP Z12-012, the \"Flux 2\" controls) that approved platforms (plateformes agréées, PA) apply to invoices exchanged under France's e-invoicing reform, on top of the EN 16931 rules. FNFE-MPE publishes them as Schematron files with French messages; a platform that rejects an invoice usually quotes the code, such as BR-FR-08/BT-23."],
  ["Is this the official English text?", "No. FNFE-MPE publishes the messages in French only. The English on this page was translated for this tool from FNFE-MPE's BR-FR Schematron and is shown beside the French original, which remains the reference. A platform may word its own rejection differently."],
  ["Can I check an invoice against these rules before sending it?", "Yes. Open the checker, tick \"Also apply the French rules\" and \"official Schematron\", and drop a UBL, CII or Factur-X file, or a CDAR status message. The BR-FR rules run in your browser, the file is not uploaded, and each finding is shown in English with FNFE-MPE's French under it."],
];

export function renderPage() {
  const rows = collect();
  const fr = manifest.sets["cius-fr-ubl"]?.source || "FNFE-MPE BR-FR";
  const version = fr.match(/\) ([\d.]+),/)?.[1] || "";
  const count = new Set(rows.map((r) => r.code)).size;
  const schema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const anchors = new Set();
  const anchor = (code) => { const a = `r-${code.replace(/[^\w-]+/g, "-")}`; if (anchors.has(a)) return ""; anchors.add(a); return ` id="${a}"`; };
  const body = GROUPS.map(([key, title, lede]) => {
    const list = rows.filter((r) => family(r.code) === key);
    if (!list.length) return "";
    return `<section>
<h2>${esc(title)}</h2>
${lede ? `<p class="note">${esc(lede)}</p>` : ""}
<div class="table-wrap"><table class="stack">
<thead><tr><th>Rule</th><th>What it checks (English)</th><th>FNFE-MPE text (French)</th><th>Applies to</th></tr></thead>
<tbody>
${list.map((r) => `<tr${anchor(r.code)}><td><strong>${esc(r.code)}</strong>${r.flag === "warning" ? " <em>warning</em>" : ""}</td><td>${esc(r.en)}</td><td lang="fr">${esc(r.fr)}</td><td>${[...r.syntaxes].join(", ")}</td></tr>`).join("\n")}
</tbody></table></div>
</section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%237e551b'/%3E%3Ctext%20x='16'%20y='23'%20font-size='20'%20font-family='system-ui,sans-serif'%20font-weight='700'%20text-anchor='middle'%20fill='%23fff'%3EE%3C/text%3E%3C/svg%3E">
<title>BR-FR error codes in English: France's e-invoice rules explained</title>
<meta name="description" content="All ${count} French BR-FR and BR-FR-CDV rule codes (FNFE-MPE ${version}, XP Z12-012) in English beside the French original, with a free offline check.">
<link rel="canonical" href="https://example.invalid/einvoice-preflight/br-fr-error-codes.html">
<meta property="og:title" content="BR-FR error codes in English">
<meta property="og:description" content="What each French e-invoicing rule (BR-FR, BR-FR-CDV) checks, in English, and a free offline checker that runs them.">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<style>:root{color-scheme:light;font-family:system-ui,sans-serif;color:#15202b;background:#eef2f6}body{max-width:1100px;margin:auto;padding:1.5rem 16px}a{color:#0b5f8a;overflow-wrap:anywhere}.eyebrow{font-weight:700;letter-spacing:.04em;color:#0b5f8a;font-size:.85rem}h1{font-size:clamp(1.7rem,5vw,2.5rem);line-height:1.08;margin:.3rem 0;max-width:28ch}.lede{font-size:1.05rem;max-width:66ch;color:#3d4f5f}section{background:#fff;border:1px solid #d3dbe4;border-radius:14px;padding:1.1rem 1.3rem;box-shadow:0 8px 24px #15202b10;margin:1rem 0}h2{margin-top:0}.table-wrap{overflow-x:auto}table{width:100%;min-width:760px;border-collapse:collapse;margin:.6rem 0;font-size:.88rem}th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #d3dbe4;vertical-align:top}td:first-child{white-space:nowrap}@media(max-width:600px){table.stack{min-width:0}table.stack td:first-child{white-space:normal}}td[lang=fr]{color:#3d4f5f}th{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:#3d4f5f}tr:target{background:#fff6d6}.note{font-size:.88rem;color:#3d4f5f}footer{color:#3d4f5f;font-size:.86rem}</style>
</head><body><main>
<header>
<p class="eyebrow">E-invoice Preflight · France</p>
<h1>BR-FR error codes in English</h1>
<p class="lede">France's approved platforms check every invoice against the BR-FR rules (AFNOR XP Z12-012, the "Flux 2" controls) and every life-cycle status message against BR-FR-CDV. FNFE-MPE publishes these rules with French messages only. Below are all ${count} rule codes from FNFE-MPE's Schematron ${esc(version)}, each with an English translation made for this tool beside FNFE's French. Have a file? The <a href="./">checker</a> runs the same rules in your browser and reports each finding in English.</p>
</header>
${body}
<section>
<h2>Reading a BR-FR code</h2>
<p>A code such as <code>BR-FR-08/BT-23</code> names the rule (<code>BR-FR-08</code>) and the EN 16931 business term it checks (<code>BT-23</code>, the business process, which France uses for its billing frameworks B1, S1, M1 and so on). <code>EXT-FR-FE-</code> terms are France's extensions to EN 16931, and <code>MDT-</code> and <code>MDG-</code> terms belong to the CDAR status message. A platform may quote the code with its own wording; the code is what to look up here.</p>
<p class="note">The empty <code>""</code> in some messages is where FNFE's Schematron prints the value from your file; the checker's report names the element's path instead. See also the <a href="france-e-invoice-mandate.html">France mandate page</a> and the <a href="what-does-this-e-invoice-error-code-mean.html">EN 16931 rule reference</a>.</p>
</section>
<section id="faq">
<h2>Common questions</h2>
${FAQ.map(([q, a]) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join("\n")}
</section>
<footer>
<p><strong>No warranty.</strong> This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or accounting advice, and it does not replace a qualified professional. <strong>You are responsible for reviewing and verifying its output before relying on it</strong>, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.</p>
<p><strong>Unofficial translation.</strong> The French messages are FNFE-MPE's (${esc(fr)}); the English is this project's translation, not FNFE-MPE's, and the French text and the platform that receives your invoice remain the authority.</p>
<p class="support">Free to use and source available. The <a href="LICENSE" rel="noopener">code is under the FSL-1.1-MIT licence</a> — <a href="https://github.com/sponsors/Duncan-Haywood">GitHub Sponsors</a> is optional and never changes what the tool does.</p>
</footer>
</main></body></html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(new URL("./br-fr-error-codes.html", import.meta.url), renderPage());
  console.log("wrote br-fr-error-codes.html");
}
