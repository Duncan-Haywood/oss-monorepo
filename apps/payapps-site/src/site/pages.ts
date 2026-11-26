// The <main> of every page and its JSON-LD. Copy rules (README.md): early access only; no customers,
// testimonials, logos, results or ratings; a feature is "built" only once it is in the app (apps/payapps
// ROADMAP.md, "Done"), everything else is "next"; no competitor claims.
import { formatUsd, limitText, PLANS } from "@shared/plans";
import {
  absoluteUrl,
  CONTENT_UPDATED,
  NOT_AIA_NOTE,
  PAGES,
  type PageKey,
  PRODUCT_NAME,
  type PublicPage,
} from "@shared/site";
import { type Html, href, html, type SiteContext } from "./html";

export interface Faq {
  q: string;
  a: string;
}

export interface BuiltPage {
  page: PublicPage;
  main: Html;
  jsonLd: Record<string, unknown>[];
}

// ---------- shared bits ----------

const earlyAccessCta = (ctx: SiteContext, label = "Join early access") =>
  html`<a class="btn" href="${href(ctx, PAGES.earlyAccess.path)}">${label}</a>`;

const faqList = (items: readonly Faq[]) =>
  html`<div class="faq">${items.map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}</div>`;

const notAiaNote = html`<p class="note" role="note">${NOT_AIA_NOTE}</p>`;

function webPage(ctx: SiteContext, page: PublicPage): Record<string, unknown> {
  return {
    "@type": "WebPage",
    "@id": `${absoluteUrl(ctx.siteUrl, page.path)}#webpage`,
    url: absoluteUrl(ctx.siteUrl, page.path),
    name: page.title,
    description: page.description,
    dateModified: CONTENT_UPDATED,
    isPartOf: { "@id": `${absoluteUrl(ctx.siteUrl, "/")}#website` },
    inLanguage: "en-US",
  };
}

function breadcrumbs(ctx: SiteContext, page: PublicPage): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [PAGES.home, page].map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.label,
      item: absoluteUrl(ctx.siteUrl, p.path),
    })),
  };
}

function faqPage(items: readonly Faq[]): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

// ---------- home ----------

export const HOME_FAQ: readonly Faq[] = [
  {
    q: `Can I use ${PRODUCT_NAME} today?`,
    a: `Not yet. ${PRODUCT_NAME} is in development: the pay app, retainage, change orders, lien waivers, the cash report and QuickBooks Online are built and in testing, and it is not open to the public. Join early access and we will email you when you can try it. Nothing is charged during early access.`,
  },
  {
    q: `Who is ${PRODUCT_NAME} for?`,
    a: "Subcontractors and specialty trades who bill general contractors every month with a schedule of values, retainage and lien waivers: electrical, mechanical, plumbing, framing, drywall, concrete, roofing and similar trades.",
  },
  {
    q: "Does it replace my GC's billing portal?",
    a: "No. Your GC decides how pay apps are submitted. It keeps your numbers and backup in one place and gives you the PDF and CSV, so the portal step is copying finished figures, not redoing them.",
  },
  {
    q: "Is it an AIA G702/G703 form?",
    a: NOT_AIA_NOTE,
  },
];

function home(ctx: SiteContext): BuiltPage {
  const page = PAGES.home;
  const main = html`
<section class="hero">
  <div class="wrap">
    <p class="eyebrow">Early access · in development</p>
    <h1>The monthly pay app, without the spreadsheet scramble.</h1>
    <p class="lede">${PRODUCT_NAME} is a pay-application tool we are building for subcontractors: your schedule of values, retainage, change orders and lien waivers in one place, so each month's pay app is a review instead of a rebuild.</p>
    <p class="cta-row">${earlyAccessCta(ctx)} <a class="link-strong" href="${href(ctx, PAGES.features.path)}">See what we're building</a></p>
  </div>
</section>

<section class="wrap section">
  <h2>What billing day looks like for a lot of subs</h2>
  <p>If you bill general contractors on a schedule of values, this list will be familiar. Every item is a place for a number to go wrong, and a wrong number can mean the pay app comes back and payment slips to the next cycle.</p>
  <div class="grid-3">
    <article class="card">
      <h3>Schedule of values</h3>
      <p>Percent complete on every line, work completed this period, materials stored, and totals that must match the GC's copy of your SOV to the cent.</p>
    </article>
    <article class="card">
      <h3>Retainage</h3>
      <p>Withheld on every line, sometimes at a different rate on stored materials or after a project milestone, depending on the contract. Tracking what is owed back across jobs is its own spreadsheet.</p>
    </article>
    <article class="card">
      <h3>Change orders</h3>
      <p>Approved changes become new SOV lines; pending ones usually can't be billed yet. Keeping both lists straight with the GC is a monthly back-and-forth.</p>
    </article>
    <article class="card">
      <h3>Lien waivers</h3>
      <p>A conditional waiver for this payment, an unconditional one for the last, sometimes on a form your state prescribes, sometimes notarized, and the same again from your suppliers.</p>
    </article>
    <article class="card">
      <h3>GC portals</h3>
      <p>Every general contractor has its own portal, cut-off date, required attachments and format. The numbers get typed in again, once per GC.</p>
    </article>
    <article class="card">
      <h3>QuickBooks</h3>
      <p>Then the same amounts go into your accounting system as invoices, with retainage receivable tracked separately, so the books match what you billed.</p>
    </article>
  </div>
</section>

<section class="section band">
  <div class="wrap">
    <h2>How ${PRODUCT_NAME} works</h2>
    <ol class="steps">
      <li><strong>Set up a job once.</strong> Import the schedule of values from your own spreadsheet or the PDF bid breakdown, with the contract sum, retainage rate and pay terms. Already billing the job? Start from your last application.</li>
      <li><strong>Update progress each month.</strong> Work this period and stored materials per line; the continuation-sheet math, retainage and "less previous certificates" are calculated for you.</li>
      <li><strong>Send it with its backup.</strong> The application and continuation sheet as PDF and CSV for the GC's portal or email, the waiver it needs, and the backup attached.</li>
      <li><strong>Get paid and keep the books straight.</strong> Record each check, see what is past due across every job, send the invoice and payment to QuickBooks Online, and bill the retainage when the work is done.</li>
    </ol>
    <p>All four steps work in the app today and are being tested before it opens to the public. The <a href="${href(ctx, PAGES.features.path)}">features page</a> marks what is built and what comes next.</p>
  </div>
</section>

<section class="wrap section">
  <h2>Questions</h2>
  ${faqList(HOME_FAQ)}
  ${notAiaNote}
  <p class="cta-row">${earlyAccessCta(ctx, "Tell us how you bill today")}</p>
</section>`;
  return {
    page,
    main,
    jsonLd: [
      webPage(ctx, page),
      {
        "@type": "WebSite",
        "@id": `${absoluteUrl(ctx.siteUrl, "/")}#website`,
        url: absoluteUrl(ctx.siteUrl, "/"),
        name: PRODUCT_NAME,
        inLanguage: "en-US",
      },
      {
        // No offers or ratings: nothing is for sale yet and there are no reviews.
        "@type": "SoftwareApplication",
        name: PRODUCT_NAME,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Construction pay applications",
        operatingSystem: "Web",
        description: `${page.description}`,
        audience: { "@type": "BusinessAudience", audienceType: "Construction subcontractors" },
        url: absoluteUrl(ctx.siteUrl, "/"),
      },
      faqPage(HOME_FAQ),
    ],
  };
}

// ---------- features ----------

type FeatureStatus = "built" | "next";

interface Feature {
  id: string;
  title: string;
  /** built = working in the app and in testing before launch; next = on the roadmap, not built. */
  status: FeatureStatus;
  body: string;
  bullets: readonly string[];
}

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  built: "Built · in testing",
  next: "Next",
};

// Every "built" item is in apps/payapps/ROADMAP.md, "Done". Keep it that way: a feature moves to
// "built" here only after it lands in the app.
export const FEATURES: readonly Feature[] = [
  {
    id: "schedule-of-values",
    title: "Schedule of values per job",
    status: "built",
    body: "Each job starts from the SOV in your subcontract, with the contract sum and retainage terms. Every pay app is built from it, so lines, scheduled values and totals stay the same from month to month, and the SOV locks once the first pay app goes out.",
    bullets: [
      "Import your own .xlsx, CSV or PDF bid breakdown (a PDF printed from Excel or an estimating program, or a scan saved as a searchable PDF, whose OCR text is read with a note to check it against the paper): the file is read in your browser and never uploaded, title blocks, division headings, subtotals and totals are left out (each listed with its row), and the sheet's own total is checked against its lines and the contract sum",
      "Or paste rows from Excel or Google Sheets, copy another job's lines, or type them in",
      "Starting mid-job? Enter your last application from the old spreadsheet or software as the opening balance and carry on from the next number",
      "GC on Procore asking for a detailed subcontractor SOV? Choose the CSV template the GC's commitment gives you, place each of your lines under one of their positions, see the totals against theirs, and download the filled template to import; save the placement with the job for the monthly Procore invoice. Columns and the GC's cells are kept as they are; built from Procore's published instructions, not yet tried on a live Procore project",
    ],
  },
  {
    id: "monthly-pay-app",
    title: "The monthly pay app",
    status: "built",
    body: "Enter work completed this period and materials presently stored per line; the continuation-sheet columns follow: total completed and stored, percent complete, balance to finish and retainage.",
    bullets: [
      "GC billing through Procore? Each pay app has a Procore invoice sheet: the Work Completed This Period and materials-stored amounts to type into the GC's Procore invoice, line by line, with copy buttons, so it matches the G702/G703 you send. If the GC's invoice lists their own SOV positions instead of your lines, save where your lines sit under those positions once (from the subcontractor SOV template) and every pay app's sheet totals by position, with change orders listed apart. Where the stored-materials balance fell and new deliveries can't be told apart, it says so instead of guessing. Built from Procore's published help, not yet tried on a live Procore project",
      "Summary page: original contract sum, net change by change orders, total completed and stored to date, retainage, less previous certificates, current payment due",
      "PDF in a familiar application-and-continuation-sheet layout (our own layout, not an AIA document), plus CSV",
      "Draft, submitted, certified and paid, with the GC's certified amount where it differs; history that can't be rewritten",
      "GC wants it notarized? Turn on the notary block for that job and the summary page carries a jurat with blanks and a seal box under your signature",
      "Attach the backup to each pay app: stored-material invoices, certified payroll, insurance certificates, photos, the signed copy the GC returns",
      "One PDF to send the GC: the application, an index of every attached file and the page it starts on, then the PDF and photo backup, every page numbered (files a PDF can't hold, like spreadsheets, are listed to send separately); change orders get the same packet with their pricing backup",
    ],
  },
  {
    id: "retainage",
    title: "Retainage, held and released",
    status: "built",
    body: "Retainage terms come from your contract, not from us. You set the rate per job, separately for work and for stored materials, and every pay app applies it.",
    bullets: [
      "Release a share of what is held (say 50% at substantial completion, or 100% on the final billing) or the dollar amount the GC approved, across all lines, the finished lines or the ones you pick; it is split by what each line holds and totals to the cent",
      "Retainage held to date, per job and across all jobs, and since when",
      "Jobs whose work is complete with retainage still held, flagged so you bill it",
    ],
  },
  {
    id: "change-orders",
    title: "Change orders",
    status: "built",
    body: "Approved change orders add to or deduct from existing lines, or create new ones, and flow into the next pay app, counted in the period they were approved so the summary page matches the GC's records.",
    bullets: ["The change-order log per job, with approval dates"],
  },
  {
    id: "cash",
    title: "What you're owed, across every job",
    status: "built",
    body: "One report of every application sent: billed, paid, still owed and retainage held, sorted by money owed, as a page and a CSV.",
    bullets: [
      "Record each check or transfer against an application, including partial payments; it turns paid when the payments reach the certified amount",
      "Due dates from each subcontract's pay terms (net days, days after the period end, or pay-when-paid with its outer limit): what is past due, and what to expect in the next 30 days",
      "Aged 0-30, 31-60, 61-90 and 90+ days, with the most overdue application named so you know who to call",
      "Each GC's billing cutoff (\"by the 25th\"): a reminder the week before when nothing has gone out yet, and a note when a draft missed it, so an application doesn't slip to next month's draw",
    ],
  },
  {
    id: "lien-waivers",
    title: "Lien waivers per pay app",
    status: "built",
    body: "Track the waiver each payment needs (conditional or unconditional, progress or final), prefilled from the job and the amount, and marked sent. Crew plan and up.",
    bullets: [
      "Prints the state's statutory form where we have checked the text against the statute: Arizona, California, Florida, Georgia, Michigan, Mississippi, Nevada, Texas, Utah and Wyoming, plus Missouri's residential final waiver and Massachusetts' partial waiver and subordination of lien (its pay-app lines filled from the application); a general form in states with no statutory form",
      "Once a payment arrives, a reminder for the unconditional waiver you now owe, for the amount actually paid",
      "Preliminary notices from the job page where the statute sets the wording or contents: California (private works) and Wyoming so far, prefilled from the job",
      "California: record each preliminary notice you give, see the 20-day deadline from the day you first furnished work, get a reminder until the owner and GC have one, print the § 8118 proof of notice declaration, and keep the mailing receipt and return receipt with each notice",
      "We don't tell you which waiver to sign or what it means for your rights: that is a question for your attorney",
    ],
  },
  {
    id: "quickbooks",
    title: "QuickBooks Online",
    status: "built",
    body: "Send each pay app to QuickBooks Online as an invoice to the GC, with retainage on its own line to a retainage receivable account, so receivables match what you billed. Crew plan and up.",
    bullets: [
      "Payments you record are applied to that invoice in QuickBooks, after checking its open balance matches",
      "A backcharge or short pay you close out goes over as a credit memo on that invoice, so the aging in QuickBooks matches yours",
      "Sent once: a retry finds the invoice instead of making a second one",
      "Only connected when an admin asks for it, and you can disconnect it at any time",
    ],
  },
  {
    id: "team",
    title: "Your office, with roles",
    status: "built",
    body: "Invite your office manager, project managers or bookkeeper by email as admin, editor or viewer.",
    bullets: [
      "Viewers can read and download; editors prepare pay apps; admins manage billing and people",
    ],
  },
  {
    id: "gc-portals",
    title: "A checklist for each general contractor",
    status: "next",
    body: "Each GC has its own portal, cut-off date, required attachments and format. Save them once per GC and every pay app for that GC starts with the right checklist and due date.",
    bullets: [
      "Cut-off dates on one calendar across all your GCs",
      "Export formats for the common GC portals",
      "Submitting into a GC's portal stays your step: we prepare the numbers and files",
    ],
  },
  {
    id: "roadmap",
    title: "Also next",
    status: "next",
    body: "In the order early-access subcontractors ask for them:",
    bullets: ["A past-due reminder email for applications your GC hasn't paid"],
  },
];

function features(ctx: SiteContext): BuiltPage {
  const page = PAGES.features;
  const main = html`
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">Features · in development</p>
    <h1>What ${PRODUCT_NAME} does</h1>
    <p class="lede">Items marked <strong>${STATUS_LABEL.built}</strong> work in the app today and are being tested before it opens to the public. Items marked <strong>${STATUS_LABEL.next}</strong> are planned, not built; subcontractors who join early access set their order.</p>
    <nav class="toc" aria-label="On this page"><ul>${FEATURES.map((f) => html`<li><a href="#${f.id}">${f.title}</a></li>`)}</ul></nav>
  </div>
</section>
<div class="wrap section">
  ${FEATURES.map(
    (f) => html`<section class="feature" id="${f.id}">
    <p class="eyebrow">${STATUS_LABEL[f.status]}</p>
    <h2>${f.title}</h2>
    <p>${f.body}</p>
    <ul>${f.bullets.map((b) => html`<li>${b}</li>`)}</ul>
  </section>`,
  )}
  <section class="feature">
    <h2>What it won't do</h2>
    <ul>
      <li>Give legal advice, interpret your contract or tell you which lien waiver to sign.</li>
      <li>Produce AIA Contract Documents. If your GC requires the AIA's own forms, you still use those.</li>
      <li>Promise faster payment. It can help you send a complete, correct pay app on time; when you get paid is up to your GC and owner.</li>
    </ul>
  </section>
  ${notAiaNote}
  <p class="cta-row">${earlyAccessCta(ctx)}</p>
</div>`;
  return { page, main, jsonLd: [webPage(ctx, page), breadcrumbs(ctx, page)] };
}

// ---------- pricing ----------

export const PRICING_FAQ: readonly Faq[] = [
  {
    q: "Is anything charged during early access?",
    a: "No. Early access is free and needs no card. These are the prices the app is set up to charge; if they change before billing starts we will say so here first, and you choose whether to subscribe.",
  },
  {
    q: "What is an active job?",
    a: "A job you haven't closed. When a job is finished, close it and its slot frees up; its pay apps, waivers and files stay in your account to read and download on every plan.",
  },
  {
    q: "What happens if I downgrade or stop paying?",
    a: "Nothing is hidden or deleted. You can still read, export and download everything on every job. Starting new pay apps or jobs past the Free limits needs a paid plan again.",
  },
  {
    q: "Why price by jobs and not by contract value?",
    a: "Our costs grow with the number of jobs we help you set up and bill, not with their dollar value, and a flat monthly price is easier to plan for than a percentage of what you bill.",
  },
  {
    q: "Is there an annual price?",
    a: "Yes: each paid plan is also offered yearly at 10% off twelve months.",
  },
  {
    q: "How were these prices set?",
    a: "Cost-plus: each paid plan is priced at 1.8 to 2 times what it costs us to serve a customer who uses all of it. Most of that cost is support time, helping set up schedules of values and answering why a total doesn't match the GC's; the rest is hosting, file storage and payment fees.",
  },
];

function pricing(ctx: SiteContext): BuiltPage {
  const page = PAGES.pricing;
  const main = html`
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">Pricing · in development</p>
    <h1>Simple monthly plans, sized by active jobs</h1>
    <p class="lede">Start free on one job. Paid plans add jobs, users, lien waivers and QuickBooks Online. Nothing is charged during early access.</p>
  </div>
</section>
<div class="wrap section">
  <div class="plans">
    ${PLANS.map(
      (p) => html`<article class="plan" aria-labelledby="plan-${p.key}">
      <h2 id="plan-${p.key}">${p.name}</h2>
      <p class="price"><span class="amount">${formatUsd(p.priceCents)}</span> <span class="per">/ month</span></p>
      ${p.annualPriceCents ? html`<p class="plan-annual">or ${formatUsd(p.annualPriceCents)} a year</p>` : null}
      <p class="plan-limits">${limitText(p.activeJobs, "active job")} · ${limitText(p.seats, "user")}</p>
      <p class="plan-summary">${p.summary}</p>
      <ul>${p.features.map((f) => html`<li>${f}</li>`)}</ul>
    </article>`,
    )}
  </div>
  <p class="note">Prices in US dollars, before any sales tax. No setup fee; cancel any time. The <a href="${href(ctx, PAGES.features.path)}">features page</a> marks what is built and what comes next.</p>
  <h2>Questions about pricing</h2>
  ${faqList(PRICING_FAQ)}
  <p class="cta-row">${earlyAccessCta(ctx)}</p>
</div>`;
  return {
    page,
    main,
    jsonLd: [webPage(ctx, page), breadcrumbs(ctx, page), faqPage(PRICING_FAQ)],
  };
}

// ---------- early access ----------

/** Consent text shown next to the checkbox; its version is stored with every sign-up. */
export const CONSENT_VERSION = "2026-11-24";
export const CONSENT_TEXT = `Email me about ${PRODUCT_NAME} early access. I can remove my sign-up at any time with the link in every email.`;

export const ROLE_OPTIONS = [
  ["owner", "Owner of a subcontracting business"],
  ["office", "Office manager / bookkeeper"],
  ["pm", "Project manager"],
  ["gc", "General contractor"],
  ["other", "Something else"],
] as const;

export const JOB_OPTIONS = [
  ["1-5", "1 to 5"],
  ["6-15", "6 to 15"],
  ["16-40", "16 to 40"],
  ["40+", "More than 40"],
] as const;

export const TOOL_OPTIONS = [
  ["spreadsheet", "Spreadsheets"],
  ["accounting", "My accounting software"],
  ["portal-only", "Straight into each GC's portal"],
  ["construction-software", "Construction billing software"],
  ["other", "Something else"],
] as const;

const select = (name: string, label: string, options: readonly (readonly [string, string])[]) =>
  html`<div class="field">
  <label for="${name}">${label} <span class="optional">(optional)</span></label>
  <select id="${name}" name="${name}">
    <option value="">Choose one</option>
    ${options.map(([v, l]) => html`<option value="${v}">${l}</option>`)}
  </select>
</div>`;

function earlyAccess(ctx: SiteContext): BuiltPage {
  const page = PAGES.earlyAccess;
  const main = html`
<section class="page-head">
  <div class="wrap narrow">
    <p class="eyebrow">Early access</p>
    <h1>Help us build the pay-app tool you'd actually use</h1>
    <p class="lede">${PRODUCT_NAME} is in development. Leave your email and, if you like, a little about how you bill today. We'll confirm your address once, then write when there's something to try. No card, no charge.</p>
  </div>
</section>
<div class="wrap narrow section">
  <form class="form" method="post" action="${href(ctx, "/api/early-access")}">
    <div class="field">
      <label for="email">Work email</label>
      <input id="email" name="email" type="email" autocomplete="email" required maxlength="254">
    </div>
    <div class="field">
      <label for="company">Company <span class="optional">(optional)</span></label>
      <input id="company" name="company" type="text" autocomplete="organization" maxlength="120">
    </div>
    ${select("role", "Your role", ROLE_OPTIONS)}
    ${select("jobs", "Jobs you bill in a typical month", JOB_OPTIONS)}
    ${select("tool", "How you prepare pay apps today", TOOL_OPTIONS)}
    <div class="field">
      <label for="message">What's the worst part of billing day? <span class="optional">(optional)</span></label>
      <textarea id="message" name="message" rows="4" maxlength="1000"></textarea>
    </div>
    <div class="hp" aria-hidden="true">
      <label for="website">Leave this empty</label>
      <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
    </div>
    <input type="hidden" name="consentVersion" value="${CONSENT_VERSION}">
    <div class="field check">
      <input id="consent" name="consent" type="checkbox" value="yes" required>
      <label for="consent">${CONSENT_TEXT}</label>
    </div>
    <button class="btn" type="submit">Join early access</button>
    <p class="fine">We store what you enter here and nothing else (no tracking, no cookies). See the <a href="${href(ctx, PAGES.privacy.path)}">privacy notice</a>.</p>
  </form>
</div>`;
  return { page, main, jsonLd: [webPage(ctx, page), breadcrumbs(ctx, page)] };
}

// ---------- privacy ----------

function privacy(ctx: SiteContext): BuiltPage {
  const page = PAGES.privacy;
  const main = html`
<section class="page-head">
  <div class="wrap narrow">
    <p class="eyebrow">Privacy</p>
    <h1>Privacy notice for early access</h1>
    <p class="lede">Last updated ${CONTENT_UPDATED}. This covers this website and the early-access list only.</p>
  </div>
</section>
<div class="wrap narrow section prose">
  <h2>What we store</h2>
  <p>When you join early access we store the email address you give, the optional answers on the form (company, role, number of jobs, how you bill today, your message), which version of the consent text you agreed to, and when you signed up and confirmed. We do not store your IP address. The site sets no cookies and runs no analytics or advertising scripts.</p>
  <h2>Why</h2>
  <p>To email you about ${PRODUCT_NAME} early access and to decide what to build first. We do not sell or share the list, and we do not add you to any other mailing list.</p>
  <h2>Confirmation</h2>
  <p>We send one email with a confirmation link. Until you use it you are not on the list, and an unconfirmed sign-up is deleted after 30 days.</p>
  <h2>Removing your sign-up</h2>
  <p>Every email we send has a link that deletes your sign-up and your answers straight away.</p>
  <h2>Where it's kept</h2>
  <p>The site and the list run on Cloudflare (Workers, D1 database, Email Service), in the United States.</p>
</div>`;
  return { page, main, jsonLd: [webPage(ctx, page), breadcrumbs(ctx, page)] };
}

// ---------- status pages (noindex) ----------

function statusPage(
  ctx: SiteContext,
  key: "checkEmail" | "confirmed" | "removed" | "notFound",
): BuiltPage {
  const page = PAGES[key];
  const bodies: Record<typeof key, Html> = {
    checkEmail: html`<h1>Check your email</h1>
<p class="lede">If the address you gave can receive mail, a confirmation link is on its way. Use it within 7 days to join the list. Nothing arrived? Check spam, or <a href="${href(ctx, PAGES.earlyAccess.path)}">try again</a> in ten minutes.</p>`,
    confirmed: html`<h1>You're on the early-access list</h1>
<p class="lede">Thank you. We'll write when there is something to try. Every email has a link to remove your sign-up.</p>
<p><a class="btn" href="${href(ctx, PAGES.features.path)}">See what we're building</a></p>`,
    removed: html`<h1>Your sign-up has been deleted</h1>
<p class="lede">Your email address and answers are gone. You will not hear from us again unless you sign up again.</p>`,
    notFound: html`<h1>Page not found</h1>
<p class="lede">There's nothing at this address. <a href="${href(ctx, "/")}">Go to the home page</a>.</p>`,
  };
  return {
    page,
    main: html`<section class="page-head"><div class="wrap narrow">${bodies[key]}</div></section>`,
    jsonLd: [],
  };
}

export function buildPage(ctx: SiteContext, key: PageKey): BuiltPage {
  switch (key) {
    case "home":
      return home(ctx);
    case "features":
      return features(ctx);
    case "pricing":
      return pricing(ctx);
    case "earlyAccess":
      return earlyAccess(ctx);
    case "privacy":
      return privacy(ctx);
    default:
      return statusPage(ctx, key);
  }
}
