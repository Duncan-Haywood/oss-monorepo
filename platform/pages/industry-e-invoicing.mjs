// The e-invoicing industry page (`industries/e-invoicing/`): who has to send
// structured e-invoices in Germany, France, Belgium and Poland, and by when;
// the problems small businesses and their accountants run into; and what this
// site offers for them: the free E-invoice Preflight checker (live) and the
// paid fix-and-explain product (in development, early access only). Bet #3 in
// `portfolio/monetization/bets.md`.
//
// Honesty rules this page keeps (CLAUDE.md, goals.md "Guardrails"):
//   - every deadline row names the official page it rests on and the date it
//     was last read, and HOW it was read (a search excerpt of the official page
//     when the page itself was unreachable from the build host);
//   - the paid product is described as in development, with no price promised
//     and no customer or review claimed;
//   - "not tax advice" is said in English, German and French.
//
// Kept apart from build.mjs (which is 14k lines) and importing only
// site-nav.mjs, so build.mjs can import it without a cycle. build.mjs passes
// in what only it knows: the shared disclaimer footer and the chrome script.
//
// Follow-up: the site-foundation session is adding `platform/pages/business.mjs`
// (shared product and industry data) and an `industries/` index. When that is
// on main, move PRODUCT below onto its record and link the index from the
// breadcrumb; until then this module carries its own data.

import { renderSiteHeader, renderSiteFooterNav, siteStyleLink, siteTitle, SITE_NAME } from './site-nav.mjs';

export const INDUSTRY_E_INVOICING_PATH = 'industries/e-invoicing/';

/** The day the deadline sources below were last read. */
export const SOURCES_CHECKED = '2026-11-24';

const CHECKER = 'einvoice-preflight/';
const EARLY_ACCESS_MAIL = 'hello@marisstella.app';

/** The paid product, as far as it exists today. Nothing here is a promise. */
export const PRODUCT = Object.freeze({
  name: 'E-invoice Fix & Explain',
  status: 'in development: early access only, not on sale yet',
  pitch: 'Each failed rule explained in plain German, French or English, with a corrected file you can check before you send it, and one workspace for an accountant with many clients.',
});

// How a source was read. A search excerpt is weaker than reading the page, so
// the page says which it was rather than calling both "checked".
const VIA_EXCERPT = 'search excerpt of the official page (the page itself was not reachable from our build host)';

/**
 * The deadlines table. One row per change, each with its official source.
 * `read` is SOURCES_CHECKED for every row today; a row re-read later gets its
 * own date. Dates are ISO so a test can sort and compare them.
 */
export const DEADLINES = Object.freeze([
  {
    country: 'Germany', code: 'DE', date: '2025-01-01',
    change: 'Every business must be able to receive an EN 16931 e-invoice (XRechnung or ZUGFeRD) from another German business.',
    source: { label: 'Bundesministerium der Finanzen, FAQ on the mandatory e-invoice', url: 'https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html' },
  },
  {
    country: 'Germany', code: 'DE', date: '2027-01-01',
    change: 'The general transition ends: a business whose prior-year turnover was above €800,000 must issue structured e-invoices for domestic B2B sales.',
    source: { label: 'Bundesministerium der Finanzen, FAQ on the mandatory e-invoice', url: 'https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html' },
  },
  {
    country: 'Germany', code: 'DE', date: '2028-01-01',
    change: 'The extended transition for turnover up to €800,000 (and for EDI that is not an e-invoice) ends with 2027, so every business issues structured e-invoices. A BMF letter of 15 October 2026 adjusts some transition rules: read it with your adviser.',
    source: { label: 'Bundesministerium der Finanzen, FAQ on the mandatory e-invoice', url: 'https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html' },
  },
  {
    country: 'France', code: 'FR', date: '2026-09-01',
    change: 'Every business must be able to receive e-invoices through a certified platform (plateforme agréée). Large companies and mid-size companies (ETI) must issue them and report other transactions (e-reporting).',
    source: { label: 'economie.gouv.fr, Tout savoir sur la facturation électronique', url: 'https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises' },
  },
  {
    country: 'France', code: 'FR', date: '2027-09-01',
    change: 'Small and medium businesses (PME) and micro-businesses, including those under the VAT franchise, must issue e-invoices and report transactions.',
    source: { label: 'economie.gouv.fr, Tout savoir sur la facturation électronique', url: 'https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises' },
  },
  {
    country: 'Belgium', code: 'BE', date: '2026-01-01',
    change: 'Almost every invoice between Belgian VAT-registered businesses must be a structured e-invoice, normally Peppol BIS Billing 3.0 sent over the Peppol network. It applies to invoices issued from that date, whenever the sale took place, and to small businesses under the exemption scheme.',
    source: { label: 'einvoice.belgium.be (FPS Finance and FPS BOSA), From when is e-invoicing mandatory?', url: 'https://einvoice.belgium.be/en/article/when-e-invoicing-mandatory' },
  },
  {
    country: 'Poland', code: 'PL', date: '2026-02-01',
    change: 'Taxpayers whose 2024 sales exceeded PLN 200 million must issue B2B invoices in KSeF, the national system. Receiving through KSeF became mandatory for everyone the same day.',
    source: { label: 'ksef.podatki.gov.pl (Ministry of Finance), Zakres obowiązkowego KSeF', url: 'https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/zakres-obowiazkowego-ksef/' },
  },
  {
    country: 'Poland', code: 'PL', date: '2026-04-01',
    change: 'All other VAT taxpayers must issue in KSeF, except sales of up to PLN 10,000 a month, which may stay outside it until the end of 2026.',
    source: { label: 'ksef.podatki.gov.pl (Ministry of Finance), Zakres obowiązkowego KSeF', url: 'https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/zakres-obowiazkowego-ksef/' },
  },
  {
    country: 'Poland', code: 'PL', date: '2027-01-01',
    change: 'The smallest taxpayers (invoiced sales up to PLN 10,000 a month) join KSeF. The Ministry\'s page names this as the date sanctions start; a bill to defer them to 2028 was reported in October 2026 and is not yet law as far as we know.',
    source: { label: 'podatki.gov.pl (Ministry of Finance), Ostatni etap wdrożenia KSeF', url: 'https://podatki.gov.pl/aktualnosci/ostatni-etap-wdrozenia-ksef-zmiany-od-1-stycznia-2027-r' },
  },
].map((row) => Object.freeze({ ...row, read: SOURCES_CHECKED, via: VIA_EXCERPT })));

/** Each country's longer page on the free checker, with the format notes. */
const COUNTRY_PAGES = Object.freeze({
  DE: 'germany-e-invoice-mandate.html',
  FR: 'france-e-invoice-mandate.html',
  BE: 'belgium-e-invoice-mandate.html',
  PL: 'poland-ksef-e-invoice-mandate.html',
});

/** The problems this page answers, each paired with what helps today and what the paid product adds. */
export const PROBLEMS = Object.freeze([
  {
    id: 'rejected',
    title: 'Invoices come back rejected',
    pain: 'A portal, a platform or the customer\'s software refuses the file, often days later, and the invoice is not paid until it is sent again.',
    free: 'Run the file through the checker before it goes out: the same EN 16931 and national rules a receiver applies, in your browser, with nothing uploaded.',
    paid: 'A corrected file for the faults that can be fixed safely (arithmetic, code lists, missing references), with every change listed so you can see what moved.',
  },
  {
    id: 'unreadable',
    title: 'The error messages are unreadable',
    pain: '"BR-CO-15", "[BR-DE-15] Das Element Buyer reference (BT-10) muss übermittelt werden", "PEPPOL-EN16931-R003": a rule ID and a line of schema jargon, not an answer to "what do I change?".',
    free: 'Each finding carries its rule ID, the field it is about and a fix in plain words; the rule reference explains every code.',
    paid: 'The explanation in German, French or English, written for the person who made the invoice rather than the developer who built the software.',
  },
  {
    id: 'formats',
    title: 'XRechnung, ZUGFeRD, Factur-X, Peppol, KSeF: which one?',
    pain: 'XRechnung is plain XML. ZUGFeRD and Factur-X are a PDF with the same kind of XML inside. Peppol BIS is what Belgium sends. KSeF wants Poland\'s own FA(3) XML. A PDF with no XML counts nowhere, and ZUGFeRD\'s Minimum and Basic WL profiles do not count in Germany.',
    free: 'Drop any of them into the checker: it reads the file\'s syntax (UBL, CII, a PDF with XML inside, FA(3)) and checks it against the rules you switch on for that country.',
    paid: 'For each client, which format each of their customers needs, so nobody guesses.',
  },
  {
    id: 'many-clients',
    title: 'An accountant has dozens of clients to get ready',
    pain: 'Each client has a different invoicing tool and different customers, and the deadlines differ by size and country. Checking them one file at a time does not scale.',
    free: 'The checker takes several files in one go, and its audit pack turns a check result into a document you can file for the client.',
    paid: 'A per-client workspace: each client\'s deadline, their last check, what is still failing, and a plan you can send them.',
  },
]);

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// JSON inside <script> must not be able to close the element.
const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** `2027-09-01` as `1 September 2027`. */
export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const FAQ = Object.freeze([
  ['Is the checker really free?', 'Yes. E-invoice Preflight runs in your browser at no cost and with no account. Your invoice is not uploaded anywhere.'],
  ['What is the paid product, and can I buy it?', `${PRODUCT.name} is in development and not on sale yet. It will add plain-language explanations in German, French and English, safely corrected files, and a workspace for accountants with many clients. Write to ${EARLY_ACCESS_MAIL} to be told when early access opens; there is no price or date to promise yet.`],
  ['Does a file that passes mean the invoice is legally correct?', 'No. The checker tests the published technical rules (EN 16931 and the national rules it names). It cannot tell whether the VAT treatment, the amounts or the parties are right for your transaction. This is not tax advice: confirm with your tax adviser.'],
  ['What is the difference between XRechnung, ZUGFeRD and Factur-X?', 'XRechnung is an XML file following the German rules on top of EN 16931. ZUGFeRD (Germany) and Factur-X (France) are the same idea: a readable PDF with a structured XML file embedded in it. In Germany a ZUGFeRD file from the EN 16931 profile upward counts as an e-invoice; a plain PDF does not.'],
  ['Where do these deadlines come from?', `From the official government pages linked in each row, last read on ${longDate(SOURCES_CHECKED)}. Rules change: check the linked page, or ask your adviser, before relying on a date.`],
]);

const PAGE_STYLE = `
  .ei-table{width:100%;border-collapse:collapse;margin:1rem 0}
  .ei-table th,.ei-table td{text-align:left;vertical-align:top;padding:.5rem .6rem;border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent)}
  .ei-table td.ei-date{white-space:nowrap;font-weight:600}
  .ei-src{font-size:.88em;opacity:.85}
  .ei-problems{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));padding:0;list-style:none}
  .ei-problems li{border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:10px;padding:1rem}
  .ei-problems h3{margin-top:0}
  .ei-cta{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.25rem 0}
  .ei-go,.ei-alt{display:inline-block;padding:.6rem 1rem;border-radius:8px;text-decoration:none;font-weight:600}
  .ei-go{background:#1d4ed8;color:#fff}
  .ei-alt{border:1px solid currentColor}
  .ei-badge{display:inline-block;font-size:.8em;padding:.1rem .45rem;border-radius:999px;border:1px solid currentColor;margin-left:.35rem;vertical-align:middle}
  .ei-summary{border-left:3px solid color-mix(in srgb,currentColor 35%,transparent);padding-left:1rem}
`;

/**
 * The page. `disclaimer` is build.mjs's shared footer block (it carries the
 * "No warranty" text check.mjs requires); `chromeScript` is the site chrome
 * and usage counter tag. Both default to empty so tests can render the page
 * on its own.
 */
export function renderEInvoicingIndustryPage({ baseUrl, disclaimer = '', chromeScript = '' } = {}) {
  const toRoot = '../../';
  const url = `${baseUrl}${INDUSTRY_E_INVOICING_PATH}`;
  const checker = `${toRoot}${CHECKER}`;
  const title = 'E-invoicing deadlines and fixes for SMEs and accountants: Germany, France, Belgium, Poland';
  const description = 'When German, French, Belgian and Polish businesses must send e-invoices, each date linked to the official source, and how to fix rejected XRechnung, ZUGFeRD, Factur-X and Peppol invoices. Free checker; paid fix-and-explain in early access.';
  const earlyAccess = `mailto:${EARLY_ACCESS_MAIL}?subject=${encodeURIComponent(`${PRODUCT.name}: early access`)}`;

  const rows = DEADLINES.map((r) => `
          <tr>
            <td>${escapeHtml(r.country)}</td>
            <td class="ei-date"><time datetime="${r.date}">${escapeHtml(longDate(r.date))}</time></td>
            <td>${escapeHtml(r.change)}<br><span class="ei-src">Source: <a href="${escapeHtml(r.source.url)}" rel="noopener">${escapeHtml(r.source.label)}</a>, read ${escapeHtml(longDate(r.read))}</span></td>
          </tr>`).join('');

  const problems = PROBLEMS.map((p) => `
        <li id="${p.id}">
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.pain)}</p>
          <p><strong>Free today:</strong> ${escapeHtml(p.free)}</p>
          <p><strong>In ${escapeHtml(PRODUCT.name)}</strong> <span class="ei-badge">in development</span>: ${escapeHtml(p.paid)}</p>
        </li>`).join('');

  const countryLinks = Object.entries(COUNTRY_PAGES).map(([code, file]) => {
    const name = DEADLINES.find((r) => r.code === code).country;
    return `<a href="${escapeHtml(`${checker}${file}`)}">${escapeHtml(name)}</a>`;
  });

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(siteTitle('E-invoicing deadlines and fixes for SMEs: DE, FR, BE, PL'))}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="alternate" hreflang="en" href="${escapeHtml(url)}">
  <link rel="icon" href="${toRoot}favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <script type="application/ld+json">${jsonLd(faqLd)}</script>
  <style>${PAGE_STYLE}</style>
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, crumbs: [{ label: 'Industries' }, { label: 'E-invoicing' }] })}
  <div class="wrap">
    <header class="pf-hero">
      <p class="eyebrow">For small businesses and accountants in Germany, France, Belgium and Poland</p>
      <h1>E-invoicing is mandatory. Make sure your invoices get through.</h1>
      <p class="lede">Belgium and Poland already require structured e-invoices, France started in September 2026 and Germany's issuing duty starts in January 2027. Below: who must do what and when, each date linked to the official source, the problems that hold invoices up, and how to fix them.</p>
      <p class="ei-cta">
        <a class="ei-go" href="${escapeHtml(checker)}">Check an invoice free</a>
        <a class="ei-alt" href="${escapeHtml(earlyAccess)}">Ask for early access to ${escapeHtml(PRODUCT.name)}</a>
      </p>
    </header>

    <main class="prose">
      <h2 id="deadlines">The deadlines</h2>
      <p>Domestic business-to-business invoices. Each row links the official page it rests on and the day we last read it. Those pages were not reachable from our build host on ${escapeHtml(longDate(SOURCES_CHECKED))}, so the rows rest on a search excerpt of each official page, read that day; follow the link to read the page itself. Exceptions exist in every country (sales to consumers, some exempt activities, small tickets). This is a summary, not tax advice.</p>
      <table class="ei-table">
        <thead><tr><th scope="col">Country</th><th scope="col">From</th><th scope="col">What changes</th></tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
      <p>More on each country, with the formats that count and what the checker tests: ${countryLinks.join(', ')}.</p>

      <h2 id="problems">The problems we hear about, and what helps</h2>
      <ul class="ei-problems">${problems}
      </ul>

      <h2 id="checker">The free checker: E-invoice Preflight <span class="ei-badge">live</span></h2>
      <p><a href="${escapeHtml(checker)}">E-invoice Preflight</a> checks UBL and CII XML, XRechnung, ZUGFeRD and Factur-X PDFs, Peppol BIS Billing 3.0 and Poland's FA(3) against the published EN 16931 rules and the German, French, Peppol and Polish rule sets you switch on. It runs in your browser: nothing is uploaded and no account is needed. It tests the technical rules only, not whether your VAT treatment is right.</p>

      <h2 id="product">${escapeHtml(PRODUCT.name)} <span class="ei-badge">in development</span></h2>
      <p>${escapeHtml(PRODUCT.pitch)} It is ${escapeHtml(PRODUCT.status)}: there is no price or launch date to promise yet. If you want it, or want to tell us what it must do for your clients, <a href="${escapeHtml(earlyAccess)}">write to ${escapeHtml(EARLY_ACCESS_MAIL)}</a> and we will tell you when early access opens. A corrected file will always list every change it made, and the final say on any invoice stays with you and your adviser.</p>

      <section class="ei-summary" lang="de" id="deutsch">
        <h2>Kurz auf Deutsch</h2>
        <p>Seit dem 1. Januar 2025 muss jedes Unternehmen in Deutschland E-Rechnungen (XRechnung oder ZUGFeRD ab Profil EN 16931) empfangen können. Ab dem 1. Januar 2027 müssen Unternehmen mit einem Vorjahresumsatz über 800.000 Euro E-Rechnungen ausstellen, ab dem 1. Januar 2028 alle (<a href="https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html" rel="noopener">BMF-FAQ</a>, gelesen am ${SOURCES_CHECKED.split('-').reverse().join('.')}).</p>
        <p>Mit dem kostenlosen <a href="${escapeHtml(checker)}">E-invoice Preflight</a> prüfen Sie eine Rechnung vor dem Versand im Browser, ohne Upload und ohne Konto. ${escapeHtml(PRODUCT.name)} erklärt jede Fehlermeldung verständlich und liefert eine korrigierte Datei; es ist noch in Entwicklung. Frühzugang: <a href="${escapeHtml(earlyAccess)}">${escapeHtml(EARLY_ACCESS_MAIL)}</a>. Keine Steuerberatung.</p>
      </section>

      <section class="ei-summary" lang="fr" id="francais">
        <h2>En bref, en français</h2>
        <p>Depuis le 1er septembre 2026, toutes les entreprises en France doivent pouvoir recevoir des factures électroniques via une plateforme agréée ; les grandes entreprises et les ETI doivent les émettre. Les PME et les micro-entreprises émettent à partir du 1er septembre 2027 (<a href="https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises" rel="noopener">economie.gouv.fr</a>, consulté le ${SOURCES_CHECKED.split('-').reverse().join('/')}). En Belgique, la facture électronique structurée est obligatoire entre entreprises depuis le 1er janvier 2026.</p>
        <p>Le vérificateur gratuit <a href="${escapeHtml(checker)}">E-invoice Preflight</a> contrôle une facture Factur-X, UBL ou CII dans votre navigateur, sans envoi ni compte. ${escapeHtml(PRODUCT.name)} explique chaque rejet en clair et propose un fichier corrigé ; il est encore en développement. Accès anticipé : <a href="${escapeHtml(earlyAccess)}">${escapeHtml(EARLY_ACCESS_MAIL)}</a>. Ceci n'est pas un conseil fiscal.</p>
      </section>

      <h2 id="faq">Questions</h2>
      <dl>${FAQ.map(([q, a]) => `
        <dt>${escapeHtml(q)}</dt>
        <dd>${escapeHtml(a)}</dd>`).join('')}
      </dl>
      <p class="ei-cta"><a class="ei-go" href="${escapeHtml(checker)}">Check an invoice free</a></p>
    </main>

    <footer>
      ${disclaimer}
      ${renderSiteFooterNav({ toRoot })}
    </footer>
  </div>
  ${chromeScript}
</body>
</html>
`;
}
