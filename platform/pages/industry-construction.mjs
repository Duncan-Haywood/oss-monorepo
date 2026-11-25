/**
 * The construction industry landing page: `industries/construction/`.
 *
 * Who it is for (specialty subcontractors, small GCs, remodelers, roofers,
 * framers, estimators, schedulers), the jobs that eat their week (monthly pay
 * apps and retainage, lien waivers, change orders, takeoff and estimating,
 * schedule updates, model checks), the paid products being built for those
 * jobs, the free tools on this site that already do part of each job, and the
 * construction research, labelled as research.
 *
 * Honesty rules this page keeps (prompts/goals.md, "Guardrails"):
 * - every paid product is shown as in development (early access) until it is
 *   verified live; no price is quoted because none is set;
 * - no invented statistics or testimonials: the two market facts carry their
 *   source link (both from portfolio/monetization/bets.md);
 * - a free tool is linked only when the build published it (`liveSlugs`), so a
 *   renamed or excluded tool drops off instead of leaving a dead link.
 *
 * Product data is defined here for now. When the site foundation's
 * `platform/pages/business.mjs` lands, the PRODUCTS entries should be read
 * from it instead (follow-up noted in the PR).
 *
 * Pure: `renderConstructionPage` takes everything it needs as arguments, and
 * `build.mjs` passes the shared disclaimer and footer in, so this module never
 * imports `build.mjs`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { REPO_URL, withSiteHeader } from './site-nav.mjs';

export const CONSTRUCTION_PATH = 'industries/construction/';

/** Product status words, and what each promises. Only `live` claims a sale. */
export const STATUS_LABELS = {
  'early-access': 'In development · early access',
  planned: 'Planned module',
  live: 'Available',
};

export const PRODUCTS = [
  {
    id: 'pay-apps',
    name: 'Pay-app suite',
    status: 'early-access',
    for: 'Specialty subcontractors and small general contractors',
    summary:
      'Monthly pay applications in the G702/G703 format from your schedule of values, retainage tracked line by line until release, lien waivers collected and checked against each payment, and change orders logged so approved work reaches the next bill.',
    planned: ['QuickBooks sync', 'Job costing', 'RFIs', 'Estimating'],
    freeToday: ['pay-application-generator', 'pay-app-guides', 'retainage-cashflow-calculator', 'lien-waiver-checker'],
  },
  {
    id: 'residential-takeoff',
    name: 'Residential takeoff',
    status: 'early-access',
    for: 'Remodelers, roofers, siding contractors and framers',
    summary:
      'Roof, siding and framing material lists from plan PDFs: scale read from the drawing, quantities measured once, and an order list priced from your own supplier rates.',
    planned: ['Feeds estimates into the pay-app suite'],
    freeToday: ['wall-framing-takeoff', 'pdf-plan-takeoff'],
  },
  {
    id: 'schedule-check',
    name: 'Schedule checking',
    status: 'planned',
    for: 'Schedulers and project controls on GC and owner jobs',
    summary:
      'A module of the contractor suite: check each Primavera P6 or Microsoft Project update before it goes to the owner, and see what changed since the last one.',
    planned: [],
    freeToday: ['xer-schedule-check'],
  },
  {
    id: 'bim-check',
    name: 'BIM model checking',
    status: 'planned',
    for: 'Firms that receive or deliver IFC models',
    summary:
      'A module of the contractor suite: check IFC models against the client’s information requirements (buildingSMART IDS) and pull quantities from the geometry.',
    planned: [],
    freeToday: ['ids-model-check', 'ifc-quantity-takeoff'],
  },
];

/**
 * The jobs, in the order the trade meets them each month. `product` names a
 * PRODUCTS id; `tools` are venture slugs published at `/<slug>/`.
 */
export const PROBLEMS = [
  {
    id: 'pay-apps',
    title: 'Monthly pay applications and retainage',
    who: 'Subcontractors and small GCs',
    pain:
      'Every month the schedule of values is rolled forward by hand: percent complete per line, stored materials, retainage held, previous certificates, current payment due. One wrong cell and the GC sends it back, and the payment slips another cycle. Retainage then sits unpaid until close-out.',
    product: 'pay-apps',
    tools: [
      ['pay-application-generator', 'Pay application generator', 'Paste a schedule of values, set retainage, get the G702-style summary and line table.'],
      ['pay-app-guides', 'Schedule of values calculator', 'Roll the continuation sheet forward: work completed, stored materials, retainage, balance to finish and payment due, with over-billed lines flagged.'],
      ['pay-app-guides/pay-application-checker.html', 'Pay application checker', 'Paste last month’s approved SOV and this month’s draft; see the carry-forward and retainage errors a GC would send back.'],
      ['pay-app-guides/schedule-of-values-template.html', 'Schedule of values template (Excel)', 'A free continuation-sheet spreadsheet and a filled-in example.'],
      ['pay-app-guides/how-to-fill-out-a-pay-application.html', 'How to fill out a pay application', 'The continuation sheet column by column and the summary page line by line.'],
      ['pay-app-guides/front-loading-schedule-of-values.html', 'Front-loading check', 'Compare each schedule of values line’s markup with the job’s, see what a reviewer sees, and get a balanced SOV.'],
      ['pay-app-guides/stored-materials-billing.html', 'Billing stored materials', 'The monthly stored-materials rollforward, so installed material is billed once, and the backup reviewers ask for.'],
      ['pay-app-guides/retainage-explained.html', 'Retainage explained, with state caps', 'How retainage is calculated and released, and public retainage caps for 16 states, each linked to the statute.'],
      ['pay-app-guides/retainage-tracker.html', 'Retainage tracker', 'Retainage receivable across jobs: aging from your release terms, unbilled releases, totals by GC and a chase list.'],
      ['pay-app-guides/retainage-release.html', 'Retainage release', 'The closeout documents usually asked for, a release date, and a request letter.'],
      ['pay-app-guides/retainage-in-quickbooks.html', 'Retainage in QuickBooks Online', 'The account, item and invoice lines QuickBooks needs, since it has no retainage field.'],
      ['pay-app-guides/overbilling-underbilling.html', 'Overbilling and underbilling', 'Billed to date against cost-to-cost percent complete for one job, with the adjusting entry.'],
      ['retainage-cashflow-calculator', 'Retainage cash-flow calculator', 'How much retainage is held, what carrying it costs, and a follow-up draft.'],
      ['subcontractor-cashflow-planner', 'Subcontractor cash-flow planner', 'The funding gap that payment terms and retention open, and what closes it.'],
      ['contractor-wip-schedule', 'Contractor WIP schedule', 'Over- and underbilling across open jobs from your job list.'],
    ],
  },
  {
    id: 'lien-waivers',
    title: 'Lien waivers and lien deadlines',
    who: 'Subcontractors and suppliers',
    pain:
      'Each payment trades for a waiver: conditional or unconditional, progress or final. Signing the wrong one, or one that releases more than the payment covers, can give away rights. Preliminary-notice and lien-filing deadlines differ by state and are easy to miss.',
    product: 'pay-apps',
    tools: [
      ['lien-waiver-checker', 'Lien waiver checker', 'Paste the waiver you were sent and see what to fix before you sign.'],
      ['mechanics-lien-deadline-calculator', 'Mechanics lien deadline calculator', 'Notice and filing deadlines for a set of US states, from your dates on the job.'],
      ['pay-app-guides/lien-waiver-log.html', 'Lien waiver log', 'Waivers given and received matched by payment; unconditionals signed before the money cleared flagged; the next pay app’s waiver requests written.'],
      ['pay-app-guides/conditional-vs-unconditional-lien-waivers.html', 'Conditional vs unconditional lien waivers', 'The four waiver types and when to sign each.'],
      ['pay-app-guides/lien-waiver-forms-by-state.html', 'Statutory lien waiver forms by state', 'Which states require their own form, each linked to the statute.'],
      ['pay-app-guides/sworn-statement.html', 'Contractor’s sworn statement', 'The Illinois and Michigan sworn statement table from your subs and suppliers, with the totals checked.'],
    ],
  },
  {
    id: 'slow-payment',
    title: 'Slow payment and the contract terms behind it',
    who: 'Subcontractors waiting on the GC, and the GC waiting on the owner',
    pain:
      'The pay app was approved weeks ago and the money has not come. Whether the sub can push depends on a payment clause few people read closely and on a state prompt payment deadline that differs from job to job.',
    product: 'pay-apps',
    tools: [
      ['pay-app-guides/pay-if-paid-clauses.html', 'Pay-if-paid clause reader', 'Paste the payment clause from a subcontract and see whether it reads as pay-if-paid or pay-when-paid, quoting the words that decided it.'],
      ['pay-app-guides/prompt-payment-laws.html', 'Prompt payment laws', 'Deadlines after the GC is paid, by state, each linked to the statute, with a late-payment interest calculator.'],
      ['pay-app-guides/paid-short.html', 'Paid short? Reconcile the check', 'Split the gap between the pay app and the check into the certification cut, backcharges and the unexplained rest, and send the right waiver.'],
      ['pay-app-guides/joint-checks.html', 'Joint check splitter', 'Split a check payable to you and your supplier, see what an endorsing supplier risks, and write the split letter and waivers.'],
      ['pay-app-guides/miller-act-payment-bond-claims.html', 'Miller Act bond claim deadlines', 'Not paid on a federal job? Who can claim on the payment bond, the 90-day notice date, the one-year limit, and a notice to the prime.'],
      ['pay-app-guides/pay-app-cash-forecast.html', 'When will I get paid? Cash forecast', 'Each job’s pay-app cutoff and pay terms in; the week each payment lands, late money and your first short week out.'],
      ['pay-app-guides/pay-application-software-compared.html', 'Pay application software compared', 'Spreadsheet, QuickBooks, Knowify, PayAppHub, Trimble Pay and Siteline, and what GC portals charge the sub.'],
    ],
  },
  {
    id: 'change-orders',
    title: 'Change orders',
    who: 'Every trade, and the GC above them',
    pain:
      'Extra work gets done on a verbal OK, priced later, and argued over at the end of the job. A change order needs a price that covers loaded labor, materials, delay and markup, and a record of what was asked, when and by whom.',
    product: 'pay-apps',
    tools: [
      ['pay-app-guides/change-order-log.html', 'Change order log', 'Approved, pending and rejected totals, the revised contract sum, billing on unsigned changes flagged, approved changes written as SOV lines.'],
      ['pay-app-guides/tm-tickets.html', 'T&M ticket log', 'Price time-and-material tickets at your own markups, flag unsigned ones and signed ones with no change order, and draft the change order request.'],
      ['pay-app-guides/change-orders-schedule-of-values.html', 'Change orders and the schedule of values', 'How approved and deductive changes enter the SOV and the summary page.'],
      ['change-order-margin-calculator', 'Change order margin calculator', 'Price added work and see what a markup cap actually leaves you.'],
      ['scope-creep-change-order-calculator', 'Scope creep change order calculator', 'Price the small extra requests before they add up.'],
      ['construction-evidence-log', 'Construction daily log and evidence pack', 'A dated daily log and change-order evidence pack, kept in your browser.'],
      ['construction-delay-claim-calculator', 'Construction delay claim calculator', 'Extended time, Eichleay overhead and liquidated damages.'],
    ],
  },
  {
    id: 'takeoff',
    title: 'Takeoff and estimating',
    who: 'Estimators, remodelers, roofers and framers',
    pain:
      'Quantities are measured off plans by hand, sheet by sheet, then retyped into a spreadsheet to price. A misread scale or a forgotten waste factor shows up as a lost bid or a lost margin.',
    product: 'residential-takeoff',
    tools: [
      ['wall-framing-takeoff', 'Wall framing takeoff', 'Stud layout, kings, jacks, headers, cut list and the cheapest board lengths to buy.'],
      ['pdf-plan-takeoff', 'PDF plan takeoff', 'Lengths, areas and counts on a drawing PDF, with the printed scale checked.'],
      ['trade-bid-studio', 'Trade bid studio', 'Labor, materials, subs, overhead and margin into a price and a walk-away number.'],
      ['roofing-bid-calculator', 'Roofing bid calculator', 'Price a reroof by the square.'],
      ['siding-bid-calculator', 'Siding bid calculator', 'Price the squares and the waste.'],
      ['drywall-bid-calculator', 'Drywall bid calculator', 'Price by finish level, not just sheets.'],
      ['concrete-bid-calculator', 'Concrete bid calculator', 'Driveways and patios by the cubic yard.'],
      ['bid-leveling-worksheet', 'Bid leveling worksheet', 'Compare sub bids on the same scope, exclusions priced in.'],
    ],
  },
  {
    id: 'schedules',
    title: 'Schedule updates',
    who: 'Schedulers and project managers',
    pain:
      'Each month’s P6 or Project update goes to the owner and comes back with comments about logic gaps, constraints and float that nobody checked before sending it.',
    product: 'schedule-check',
    tools: [
      ['xer-schedule-check', 'XER schedule check', 'DCMA 14-point check of a P6 XER or Project XML file, with an update-to-update comparison.'],
    ],
  },
  {
    id: 'models',
    title: 'BIM model checks and quantities',
    who: 'Design-build firms, trade detailers and estimators working from IFC',
    pain:
      'A model arrives that is supposed to meet the client’s information requirements, and nobody can say whether it does without specialist software. Quantities in the model may not match its geometry.',
    product: 'bim-check',
    tools: [
      ['ids-model-check', 'IDS model check', 'Check an IFC model against a buildingSMART IDS file; export failures as BCF, CSV or JSON.'],
      ['ifc-quantity-takeoff', 'IFC quantity takeoff', 'A bill of quantities from an IFC model, volumes recomputed from the geometry.'],
    ],
  },
];

/** Market facts, each with the source it came from. Nothing here unsourced. */
export const FACTS = [
  {
    text: 'Specialty-trade contractors include more than 1.9 million independent contractors, 79% of specialty-trade establishments (NAHB analysis of Census data).',
    source: 'https://eyeonhousing.org/2025/08/most-home-builders-are-small-businesses/',
    sourceName: 'NAHB Eye on Housing, August 2025',
  },
  {
    text: 'CoConstruct, used by many remodelers and custom builders, is being folded into Buildertrend; no new CoConstruct projects can be started after 31 March 2027.',
    source: 'https://coconstruct.com/migration',
    sourceName: 'CoConstruct migration page',
  },
];

/** Construction research, shown as research and never as a product. */
export const RESEARCH = [
  {
    slug: 'build-data',
    title: 'Predicting permit and build durations from open permit records',
    summary:
      'Do open permit feeds (Chicago, San Francisco, Austin, Seattle) predict how long a permit and the build behind it take better than each city’s own averages? A multi-session study with published code and results, aimed at a paper.',
  },
  {
    slug: 'buildbot-sheathing',
    title: 'Robots on the residential site: sheathing a wood-frame wall',
    summary:
      'Can a robot hang a 4x8 sheet and land every nail where the panel maker and the code want it, and which error source decides it? Simulation and analysis only: no robot has been built or tested on a site.',
  },
];

/** The venture slug a tool entry belongs to. */
export const toolSlug = (tool) => tool.split('/')[0];

/** Link to a tool entry: a venture's index (`slug/`) or a page inside it. */
export const toolHref = (toRoot, tool) => `${toRoot}${tool.includes('/') ? tool : `${tool}/`}`;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const jsonLd = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/** Plain-text answers, shown on the page and repeated as FAQPage data. */
export const FAQ = [
  ['Can I buy the pay-app suite today?', 'Not yet. It is in development and taking early-access interest; no price is set. The free pay application generator, pay application checker, retainage tracker, change order log and lien waiver log work today.'],
  ['Are the free tools really free?', 'Yes. They run in your browser on this site with no account and no card, and their code is published (source available, FSL-1.1-MIT).'],
  ['Do the free tools replace an accountant, a lawyer or a scheduler?', 'No. They help you check numbers and documents before you send or sign them. Lien rights, contract terms and retainage rules depend on your state and your contract; check with a qualified professional.'],
  ['Is the construction research a product?', 'No. It is open research with code and results you can check. It may inform products later; nothing here sells it.'],
];

/**
 * The page. `liveSlugs` (a Set of published venture slugs) filters tool links
 * so none is dead; `null` keeps them all (tests, previews).
 */
export function renderConstructionPage({
  baseUrl = '',
  toRoot = '../../',
  disclaimer = '',
  footer = '',
  liveSlugs = null,
  researchSlugs = null,
  earlyAccessHref,
  shots = [],
} = {}) {
  // A tool is a venture slug (`pay-app-guides`) or a page inside one
  // (`pay-app-guides/retainage-tracker.html`); liveness is the venture's.
  const live = (tool) => !liveSlugs || liveSlugs.has(toolSlug(tool));
  const url = `${baseUrl}${CONSTRUCTION_PATH}`;
  const title = 'Software for construction subcontractors and small builders';
  const description =
    'Pay apps, retainage, lien waivers, change orders and takeoff for subcontractors, small GCs, remodelers and roofers. Free tools today; paid suite in development.';
  const cta = earlyAccessHref ?? `${toRoot}feedback/?type=idea`;
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const toolName = new Map(PROBLEMS.flatMap((p) => p.tools.map(([slug, name]) => [slug, name])));
  // Real stills of the free tools (showcase/capture.mjs, already filtered to
  // published tools by loadShowcase), keyed by venture slug.
  const still = new Map(shots.filter((s) => s && s.slug && s.file && live(s.slug)).map((s) => [s.slug, s]));
  // The close crop (600 x 375, text about 1.8x larger than the full still) when
  // there is one, with its 1,200 px twin for 2x and 3x screens.
  const figure = (shot, cls, lazy, sizes) => {
    const at = (file) => escapeHtml(`${toRoot}showcase/${file}`);
    const img = shot.hero
      ? `src="${at(shot.hero)}"${shot.heroWide ? ` srcset="${at(shot.hero)} 600w, ${at(shot.heroWide)} 1200w" sizes="${sizes}"` : ''} width="600" height="375"`
      : `src="${at(shot.file)}" width="960" height="600"`;
    return `
        <figure class="${cls}">
          <a href="${escapeHtml(toolHref(toRoot, shot.slug))}"><img ${img} alt="${escapeHtml(`${toolName.get(shot.slug) || shot.slug} with its worked example loaded: ${shot.caption}`)}" decoding="async"${lazy ? ' loading="lazy"' : ''}></a>
          <figcaption>${escapeHtml(shot.caption)}. The free <a href="${escapeHtml(toolHref(toRoot, shot.slug))}">${escapeHtml(toolName.get(shot.slug) || shot.slug)}</a>, with its example loaded.</figcaption>
        </figure>`;
  };
  const leadShot = still.get(byId['pay-apps'].freeToday.find((slug) => still.has(slug)));
  const toolLink = (slug) => `<a href="${escapeHtml(toolHref(toRoot, slug))}">${escapeHtml(toolName.get(slug) || slug)}</a>`;

  const problemHtml = PROBLEMS.map((p) => {
    const tools = p.tools.filter(([slug]) => live(slug));
    const product = byId[p.product];
    return `
      <section class="ic-problem" id="${escapeHtml(p.id)}">
        <h3>${escapeHtml(p.title)}</h3>
        <p class="ic-who">${escapeHtml(p.who)}</p>
        <p>${escapeHtml(p.pain)}</p>
        <p class="ic-answer"><strong>Being built:</strong> <a href="#product-${escapeHtml(product.id)}">${escapeHtml(product.name)}</a> <span class="ic-status ic-${escapeHtml(product.status)}">${escapeHtml(STATUS_LABELS[product.status])}</span></p>${tools.length ? `
        <p class="ic-free"><strong>Free today:</strong></p>
        <ul class="ic-tools">${tools.map(([slug, name, what]) => `
          <li><a href="${escapeHtml(toolHref(toRoot, slug))}">${escapeHtml(name)}</a>: ${escapeHtml(what)}</li>`).join('')}
        </ul>` : ''}
      </section>`;
  }).join('');

  const productHtml = PRODUCTS.map((p) => {
    const free = p.freeToday.filter(live);
    const shot = free.map((slug) => still.get(slug)).find(Boolean);
    return `
      <article class="ic-product" id="product-${escapeHtml(p.id)}">
        <h3>${escapeHtml(p.name)}</h3>
        <p><span class="ic-status ic-${escapeHtml(p.status)}">${escapeHtml(STATUS_LABELS[p.status])}</span></p>
        <p class="ic-who">${escapeHtml(p.for)}</p>
        <p>${escapeHtml(p.summary)}</p>${p.planned.length ? `
        <p class="ic-planned">Planned: ${escapeHtml(p.planned.join(', '))}.</p>` : ''}${free.length ? `
        <p class="ic-free">Try the free version of part of it now: ${free.map(toolLink).join(', ')}.</p>` : ''}${shot && shot !== leadShot ? figure(shot, 'ic-still', true, '(max-width: 640px) calc(100vw - 66px), 440px') : ''}
      </article>`;
  }).join('');

  const shownResearch = RESEARCH.filter((r) => !researchSlugs || researchSlugs.has(r.slug));
  const researchHtml = shownResearch.map((r) => `
        <li><a href="${escapeHtml(`${toRoot}research/${r.slug}/`)}">${escapeHtml(r.title)}</a>: ${escapeHtml(r.summary)}</li>`).join('');

  const factsHtml = FACTS.map((f) => `
        <li>${escapeHtml(f.text)} <span class="ic-src">Source: <a href="${escapeHtml(f.source)}" rel="noopener">${escapeHtml(f.sourceName)}</a>.</span></li>`).join('');

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  const social = baseUrl
    ? `<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(`${baseUrl}social-card.png`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:description" content="${escapeHtml(description)}">
`
    : '';

  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${social}<script type="application/ld+json">${jsonLd(ld)}</script>
<style>
:root{--ic-ink:var(--pfs-ink,#1d2530);--ic-muted:var(--pfs-muted,#4a5666);--ic-line:var(--pfs-line,#d3dce6);--ic-accent:var(--pfs-accent,#1f4e8c);--ic-panel:var(--pfs-panel,#fff);--ic-bg:#f6f7f9;--ic-amber:#8a5300;--ic-amber-bg:#fff3df}
@media (prefers-color-scheme:dark){:root{--ic-bg:#12171d;--ic-amber:#f5c37a;--ic-amber-bg:#3a2a12}}
body{margin:0;background:var(--ic-bg);color:var(--ic-ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.ic-wrap{max-width:960px;margin:0 auto;padding:24px 16px 48px}
.ic-wrap h1{font-size:clamp(1.6rem,4vw,2.3rem);line-height:1.2;margin:.2em 0 .4em}
.ic-wrap h2{margin-top:2em;font-size:1.35rem}
.ic-wrap h3{margin:.2em 0 .3em;font-size:1.1rem}
.ic-lede{font-size:1.1rem;color:var(--ic-muted);max-width:44em}
.ic-note{border-left:4px solid var(--ic-amber);background:var(--ic-amber-bg);padding:10px 14px;border-radius:4px}
.ic-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))}
.ic-problem,.ic-product{background:var(--ic-panel);border:1px solid var(--ic-line);border-radius:8px;padding:14px 16px}
.ic-who{color:var(--ic-muted);font-size:.93rem;margin:0 0 .5em}
.ic-status{display:inline-block;font-size:.8rem;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--ic-amber-bg);color:var(--ic-amber)}
.ic-tools{padding-left:1.2em;margin:.3em 0 0}
.ic-tools li{margin:.25em 0}
.ic-free{margin-bottom:0}
.ic-src{color:var(--ic-muted);font-size:.9rem}
.ic-cta a{display:inline-block;background:var(--ic-accent);color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600}
@media (prefers-color-scheme:dark){.ic-wrap .ic-cta a{color:#0b1622}}
.ic-wrap a{overflow-wrap:anywhere;color:var(--ic-accent)}
.ic-wrap .ic-cta a{color:#fff}
.ic-still{margin:14px 0 0}
.ic-still img{display:block;width:100%;height:auto;border:1px solid var(--ic-line);border-radius:8px;background:#fff}
.ic-still figcaption{color:var(--ic-muted);font-size:.9rem;margin-top:6px}
.ic-lead-still{max-width:720px;margin:24px 0 8px}
.ic-lead-still img{box-shadow:0 6px 24px rgba(20,30,45,.12)}
.ic-faq dt{font-weight:600;margin-top:1em}
.ic-faq dd{margin:.3em 0 0}
</style>
</head>
<body>
  <div class="ic-wrap">
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p class="ic-lede">For specialty subcontractors, small general contractors, remodelers, roofers, framers, estimators and schedulers: software for the paperwork that decides whether a job gets paid on time.</p>
      <p class="ic-note">The paid products on this page are <strong>in development</strong>, taking early-access interest; none is on sale yet and no price is set. The free tools linked below work today, in your browser.</p>
      <p class="ic-cta"><a href="${escapeHtml(cta)}">Ask for early access</a></p>
      <p class="ic-src">The early-access form is this site’s public feedback form: what you send is published in the project’s GitHub repository, so describe how you bill or estimate today and leave out names, prices and anything private.</p>${leadShot ? figure(leadShot, 'ic-still ic-lead-still', false, '(max-width: 752px) calc(100vw - 32px), 720px') : ''}

      <h2>The jobs that eat the week</h2>
      <div class="ic-grid">${problemHtml}
      </div>

      <h2>What is being built</h2>
      <p>One contractor suite, started from its sharpest job, monthly pay apps, and grown job by job. Each product below shows its real status.</p>
      <div class="ic-grid">${productHtml}
      </div>

      <h2>Why construction</h2>
      <ul>${factsHtml}
      </ul>
${shownResearch.length ? `
      <h2>Construction research</h2>
      <p>Open research, not products: questions studied over many sessions with the code and data published so anyone can check them. Produced with AI assistance.</p>
      <ul>${researchHtml}
      </ul>
` : ''}
      <h2>Questions</h2>
      <dl class="ic-faq">${FAQ.map(([q, a]) => `
        <dt>${escapeHtml(q)}</dt>
        <dd>${escapeHtml(a)}</dd>`).join('')}
      </dl>
      <p class="ic-src">This page is built by <a href="${escapeHtml(`${REPO_URL}/blob/main/platform/pages/industry-construction.mjs`)}">platform/pages/industry-construction.mjs</a>; product status changes there, in the open.</p>
    </main>
    <footer>
      ${disclaimer}
      ${footer}
    </footer>
  </div>
</body>
</html>
`, { toRoot, crumbs: [{ label: 'Construction' }] });
}

/** Writes the page into `outDir`; returns its path relative to the site root. */
export async function buildConstructionPage(outDir, options = {}) {
  const dir = path.join(outDir, CONSTRUCTION_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), renderConstructionPage(options));
  return CONSTRUCTION_PATH;
}
