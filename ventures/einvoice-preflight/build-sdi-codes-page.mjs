// Writes sdi-error-codes.html from the code table in sdi-receipt.mjs, so the page and
// the receipt reader cannot drift apart: node build-sdi-codes-page.mjs
// sdi-codes-page.test.mjs fails when the committed page is not what this writes.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { SDI_CODES } from "./sdi-receipt.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const GROUPS = [
  ["File name, size and signature (00001-00107)", (c) => /^00[01]/.test(c)],
  ["Format: the XSD schema (00200-00201)", (c) => /^002/.test(c)],
  ["Tax ids, destination code and the register (00300-00330)", (c) => /^003/.test(c)],
  ["Content and arithmetic (00400-00477)", (c) => /^004/.test(c)],
];
const OFFLINE = { yes: "Yes", partly: "In part", no: "No" };

const FAQ = [
  ["What is an SdI ricevuta di scarto?", "It is the rejection receipt Italy's Sistema di Interscambio sends back when a FatturaPA file fails one of its checks. Its file name ends in _NS_ and a number, and its ListaErrori gives one five-digit code per fault. Under the Agenzia delle Entrate's technical specification 1.9 (section 1.6) a rejected invoice counts as not issued."],
  ["Which SdI errors can I catch before sending?", "The format errors (00200) and most content errors (00400 to 00476) can be seen in the file itself, and this checker raises them offline. Errors that depend on the tax register (00300 to 00326), SdI's archive (00404) or the signature (00100 to 00107) cannot be seen in a file; for tax ids the checker catches only numbers that fail their check digit."],
  ["Can I check an SdI receipt with this tool?", "Yes. Drop the receipt (NS, RC, MC, NE, DT or AT) into the checker, together with the invoice if you have it. Each error code is explained in English, the receipt is paired with the invoice by file name or SHA-256 hash, and each code is marked as reproduced or not by the checker on that file. Nothing is uploaded."],
];

const rows = (test) => Object.entries(SDI_CODES).filter(([c]) => test(c)).map(([code, c]) =>
  `<tr id="e${code}"><td><strong>${code}</strong></td><td>${esc(c.what)}</td><td>${esc(c.fix)}</td><td>${Object.hasOwn(OFFLINE, c.offline) ? OFFLINE[c.offline] : c.offline}${c.rules.length ? ` (${c.rules.join(", ")})` : ""}</td></tr>`).join("\n");

export function renderPage() {
  const schema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const count = Object.keys(SDI_CODES).length;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%237e551b'/%3E%3Ctext%20x='16'%20y='23'%20font-size='20'%20font-family='system-ui,sans-serif'%20font-weight='700'%20text-anchor='middle'%20fill='%23fff'%3EE%3C/text%3E%3C/svg%3E">
<title>SdI error codes: every FatturaPA rejection code (00001-00477)</title>
<meta name="description" content="All ${count} Italian SdI rejection codes (ricevuta di scarto) from specification 1.9, in English: what each means, how to fix it, and whether a file check catches it.">
<link rel="canonical" href="https://example.invalid/einvoice-preflight/sdi-error-codes.html">
<meta property="og:title" content="SdI error codes explained: every FatturaPA rejection code">
<meta property="og:description" content="What each SdI rejection code means, how to fix it, and which ones a free offline checker catches before you send.">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<style>:root{color-scheme:light;font-family:system-ui,sans-serif;color:#15202b;background:#eef2f6}body{max-width:1000px;margin:auto;padding:1.5rem 16px}a{color:#0b5f8a;overflow-wrap:anywhere}.eyebrow{font-weight:700;letter-spacing:.04em;color:#0b5f8a;font-size:.85rem}h1{font-size:clamp(1.7rem,5vw,2.5rem);line-height:1.08;margin:.3rem 0;max-width:28ch}.lede{font-size:1.05rem;max-width:66ch;color:#3d4f5f}section{background:#fff;border:1px solid #d3dbe4;border-radius:14px;padding:1.1rem 1.3rem;box-shadow:0 8px 24px #15202b10;margin:1rem 0}h2{margin-top:0}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;margin:.6rem 0;font-size:.9rem}th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #d3dbe4;vertical-align:top}th{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:#3d4f5f}tr:target{background:#fff6d6}.note{font-size:.88rem;color:#3d4f5f}footer{color:#3d4f5f;font-size:.86rem}</style>
</head><body><main>
<header>
<p class="eyebrow">E-invoice Preflight · Italy</p>
<h1>SdI error codes explained</h1>
<p class="lede">The ${count} codes Italy's Sistema di Interscambio can put in a rejection receipt (<em>ricevuta di scarto</em>, a file ending in <code>_NS_001.xml</code>), read from the Agenzia delle Entrate's technical specification 1.9 (Allegato A, Appendix 1) and put in plain English. For each: what SdI refused, how to fix it, and whether a file-only check can catch it before you send. Have a receipt? Drop it into the <a href="./">checker</a> with the invoice and it explains every code and says whether the checker reproduces it on that file.</p>
</header>
${GROUPS.map(([title, test]) => `<section>
<h2>${title}</h2>
<div class="table-wrap"><table>
<thead><tr><th>Code</th><th>What SdI refused</th><th>How to fix it</th><th>Caught offline?</th></tr></thead>
<tbody>
${rows(test)}
</tbody></table></div>
</section>`).join("\n")}
<section>
<h2>Reading a receipt</h2>
<p>SdI answers every file it receives. A <strong>rejection</strong> (NS) means the invoice counts as not issued; fix it and send it under a new file name, because SdI refuses a name it has already seen (00002). A <strong>delivery receipt</strong> (RC) means the invoice passed SdI's checks and reached the buyer. A <strong>could-not-deliver receipt</strong> (MC) means it passed but SdI could not reach the buyer's channel and put it in the buyer's reserved area. For public bodies there are also the buyer's outcome (NE: EC01 accepted, EC02 refused, with the buyer's reason), the deadline notice (DT) and the transmission attestation (AT).</p>
<p>A receipt's <code>Hash</code> is the SHA-256 of the file SdI received. The checker compares it with the invoice you drop beside it, so you know whether you are looking at exactly the file SdI saw.</p>
<p class="note">Rule ids such as IT-003 are this tool's own, listed in the <a href="italy-sdi-e-invoice-mandate.html">Italy page</a> and the <a href="what-does-this-e-invoice-error-code-mean.html">rule reference</a>. Tested on 33 public SdI receipts and notices: the Agenzia's example messages and the receipts AgID's EeISI project received in 2019, including a real 00305 rejection that the checker reproduces on the rejected file.</p>
</section>
<section id="faq">
<h2>Common questions</h2>
${FAQ.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join("\n")}
</section>
<footer>
<p><strong>No warranty.</strong> This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or accounting advice, and it does not replace a qualified professional. <strong>You are responsible for reviewing and verifying its output before relying on it</strong>, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.</p>
<p><strong>Nothing leaves your browser.</strong> The explanations paraphrase the Italian text of specification 1.9; the Agenzia delle Entrate's own documents (agenziaentrate.gov.it) are the authority, and SdI alone decides whether a file is accepted.</p>
<p class="support">Free to use and source available. The <a href="LICENSE" rel="noopener">code is under the FSL-1.1-MIT licence</a> — <a href="https://github.com/sponsors/Duncan-Haywood">GitHub Sponsors</a> is optional and never changes what the tool does.</p>
</footer>
</main></body></html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(new URL("./sdi-error-codes.html", import.meta.url), renderPage());
  console.log("wrote sdi-error-codes.html");
}
