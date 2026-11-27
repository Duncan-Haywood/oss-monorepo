// Page bodies (the <main> content). Everything renders to static HTML at build time, except the
// early-access page, which the Worker re-renders with the visitor's values when the form has errors.
// Copy rules (see README): the product is in development; describe what it will do, never claim
// customers, results, time saved, certifications or compliance.

import {
  CONSENT_TEXT,
  type FieldErrors,
  type FormValues,
  LIMITS,
  PROCESSES,
  RFQ_VOLUMES,
  ROLES,
} from "@shared/early-access";
import { ANNUAL_DISCOUNT, EARLY_ACCESS_PLAN, formatUsd, PLANS } from "@shared/plans";
import { CMMC_SITE_URL, CONTACT_EMAIL, PUBLISHER, SITE_NAME } from "./config";
import { type Html, html } from "./html";

export interface RenderContext {
  /** "" or a path like "/jobshop": prefixed to every internal link. */
  basePath: string;
}

export const href = (ctx: RenderContext, path: string): string =>
  `${ctx.basePath}${path === "/" ? "/" : path}`;

const check = html`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function ctaBand(ctx: RenderContext, heading: string, body: string): Html {
  return html`<section class="band band-cta" aria-labelledby="cta-heading">
  <div class="container narrow">
    <h2 id="cta-heading">${heading}</h2>
    <p>${body}</p>
    <p class="actions"><a class="btn btn-primary" href="${href(ctx, "/early-access")}">Request early access</a></p>
  </div>
</section>`;
}

/** Illustration only: clearly labelled sample data, not a real customer, quote or result. */
function quoteMock(): Html {
  const lines = [
    {
      part: "Mounting bracket",
      detail: "6061-T6 aluminum · qty 50",
      source: "Drawing p.1",
      price: "Priced from your rates",
    },
    {
      part: "Spacer, Ø0.750 bore",
      detail: "303 stainless · qty 200",
      source: "Drawing p.2",
      price: "Priced from your rates",
    },
    {
      part: "Bore tolerance on spacer",
      detail: "Note unreadable in the scan",
      source: "Flagged",
      price: "Needs estimator",
      flag: true,
    },
  ];
  return html`<figure class="mock" aria-label="Illustration of a draft quote, with sample data">
  <div class="mock-head">
    <span class="mock-title">Draft quote · RFQ from email</span>
    <span class="pill pill-warn">Waiting for your review</span>
  </div>
  <ul class="mock-lines">
    ${lines.map(
      (l) => html`<li class="${l.flag ? "mock-line flagged" : "mock-line"}">
      <div><strong>${l.part}</strong><span>${l.detail}</span></div>
      <div class="mock-meta"><span class="${l.flag ? "tag tag-warn" : "tag"}">${l.source}</span><span>${l.price}</span></div>
    </li>`,
    )}
  </ul>
  <figcaption>Illustration with sample data, not a real quote.</figcaption>
</figure>`;
}

export function homePage(ctx: RenderContext): Html {
  const from = formatUsd(Math.min(...PLANS.map((p) => p.monthlyPrice)));
  const promises = [
    "Prices come from your rate table, not from the AI",
    "Every line shows where it came from: a drawing page or one of your rates",
    "Anything it can't read is flagged for your estimator, never guessed",
  ];
  return html`<section class="hero" aria-labelledby="hero-heading">
  <div class="container hero-grid">
    <div>
      <p class="eyebrow"><span class="dot" aria-hidden="true"></span>For CNC and fabrication job shops · In development</p>
      <h1 id="hero-heading">Work through the RFQ backlog without hiring another estimator.</h1>
      <p class="lead">Forward an RFQ email or drop in a PDF drawing. ${SITE_NAME} reads the parts, quantities,
      materials and tolerances, prices them with your machine rates, setup charges and markups, and hands
      your estimator a draft quote to check. Nothing goes to a customer until you send it.</p>
      <ul class="checks">${promises.map((p) => html`<li>${check}<span>${p}</span></li>`)}</ul>
      <p class="actions">
        <a class="btn btn-primary" href="${href(ctx, "/early-access")}">Request early access</a>
        <a class="btn btn-secondary" href="${href(ctx, "/how-it-works")}">See how it works</a>
      </p>
      <p class="fineprint">In development. Early access is free; proposed plans from ${from} a month.</p>
    </div>
    ${quoteMock()}
  </div>
</section>

<section class="band" aria-labelledby="backlog-heading">
  <div class="container narrow">
    <h2 id="backlog-heading">The quoting pile is the bottleneck nobody hired for</h2>
    <p>In a job shop, quoting usually lands on the owner or one estimator. Every RFQ means opening the
    email, reading each drawing, working out stock, setups and cycle times, looking up material and outside
    processing, and applying your rates. That work happens between running the floor and answering the
    phone, and while RFQs wait, the customers who sent them wait too.</p>
    <p>${SITE_NAME} is being built to do the reading and the arithmetic, so your estimator's time goes on
    the judgment calls: the tricky features, the quantity breaks, and whether you want the job.</p>
  </div>
</section>

<section class="band band-muted" aria-labelledby="split-heading">
  <div class="container">
    <h2 id="split-heading" class="center">What it does, and what stays yours</h2>
    <div class="cols-2">
      <div class="card">
        <h3>${SITE_NAME} does the legwork</h3>
        <ul class="checks">
          <li>${check}<span>Reads RFQ emails and PDF drawings: parts, quantities, material, finish, tolerances and notes</span></li>
          <li>${check}<span>Checks what it read a second time against the drawing and flags anything it can't confirm</span></li>
          <li>${check}<span>Proposes setups and cycle times with its reasoning shown, so they're quick to correct</span></li>
          <li>${check}<span>Applies your rates, minimums and markups with plain arithmetic: same inputs, same price</span></li>
          <li>${check}<span>Lists the sent quotes due for a follow-up each morning and keeps a log of every call, so no quote goes quiet</span></li>
          <li>${check}<span>Dates every material price, warns when one is past your limit, and lists the open quotes priced before your supplier's price moved</span></li>
          <li>${check}<span>Imports your supplier's price sheet showing each price change and the open quotes it touches before you save, and keeps the supplier and date in each price's history</span></li>
        </ul>
      </div>
      <div class="card">
        <h3>Your shop keeps control</h3>
        <ul class="checks">
          <li>${check}<span>Your rate table sets every price; corrections your estimator makes become shop rules</span></li>
          <li>${check}<span>Your estimator reviews every line and decides what gets quoted</span></li>
          <li>${check}<span>Quotes are never sent automatically</span></li>
          <li>${check}<span>Your drawings and rates are never used to train AI models</span></li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="band" aria-labelledby="steps-heading">
  <div class="container">
    <h2 id="steps-heading" class="center">From inbox to draft quote</h2>
    <ol class="steps">
      <li><h3>Set your rates once</h3><p>Machines and hourly rates, setup charges, material, outside processing, minimums.</p></li>
      <li><h3>Send in the RFQ</h3><p>Forward the email or upload the PDF drawings.</p></li>
      <li><h3>Read and double-checked</h3><p>Every value is checked against the drawing; gaps are flagged.</p></li>
      <li><h3>Review and send</h3><p>Your estimator fixes what needs fixing and sends the quote themselves.</p></li>
    </ol>
    <p class="center"><a class="link" href="${href(ctx, "/how-it-works")}">The full walkthrough →</a></p>
  </div>
</section>

<section class="band band-muted" aria-labelledby="status-heading">
  <div class="container narrow">
    <h2 id="status-heading">Where it stands</h2>
    <p>${SITE_NAME} is in development. There are no customers yet and no results to quote, so you won't
    find testimonials or time-saved figures here. Early-access shops try it on their own RFQs for free
    and tell us where it gets things wrong, and that decides what gets built first.</p>
    <p>Shops that handle defense work: read <a class="link" href="${href(ctx, "/for-cmmc-shops")}">what early access means for CUI and export-controlled drawings</a> first.</p>
  </div>
</section>

${ctaBand(ctx, "Try it on your own RFQs", `Tell us what you quote and how many RFQs you see. Early access is free, up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month.`)}`;
}

export function howItWorksPage(ctx: RenderContext): Html {
  const steps: { title: string; body: Html }[] = [
    {
      title: "Set up your rates once",
      body: html`<p>You enter how your shop prices work: each machine or work center and its hourly rate,
      setup charges, material costs or markups, outside processes such as anodizing, plating or heat treat
      with what your vendors charge, minimum order values, quantity breaks and how you round. This rate
      table is the only place prices come from.</p>`,
    },
    {
      title: "Send in the RFQ",
      body: html`<p>Forward the customer's email to your shop's intake address, or upload the PDF drawings
      directly. It reads email text and PDF drawings, including scans, and CAD files: a STEP solid's size,
      volume and holes, and a DXF flat pattern's cut length, pierces and bend lines. From those it suggests
      the blank, the parts per sheet and, where you have entered the rate, a roughing, drilling, tapping, cutting or bending time, each labelled with
      how it was worked out. IGES, STL and native SolidWorks files are stored but not measured yet.</p>`,
    },
    {
      title: "It reads the drawing, then checks itself",
      body: html`<p>For each part it pulls out material, stock size, features, tolerances, finish, quantity
      and due date. A second, separate pass checks every extracted value against the drawing. A value it
      can't confirm, like a smudged tolerance or a missing material callout, is flagged for your estimator
      with the page it came from. It is never filled in with a guess.</p>`,
    },
    {
      title: "Priced by your rules",
      body: html`<p>Setup and cycle-time estimates are the hard part of quoting, so ${SITE_NAME} proposes them
      with its reasoning written out (operations, tools, approximate times) for your estimator to accept
      or correct. The dollar figures are then plain arithmetic on your rate table: the same inputs always
      give the same price, and every line shows which rate it used. Corrections your estimator makes are
      saved as rules for your shop, so the next similar part starts closer.</p>`,
    },
    {
      title: "Your estimator reviews and sends",
      body: html`<p>The draft quote lists every part, its price build-up and anything flagged. Your
      estimator edits what needs editing and approves it. You then download it as a PDF on your letterhead
      or copy it into your own email or ERP. ${SITE_NAME} never sends a quote on its own.</p>`,
    },
  ];
  const wont = [
    "Make up a dimension, tolerance, material or quantity that isn't on the drawing or in the email",
    "Price anything with a rate you didn't set",
    "Send anything to your customers",
    "Use your drawings, rates or quotes to train AI models",
    "Share one shop's rates or drawings with another shop",
  ];
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>How it works</p>
    <h1>From an RFQ in your inbox to a quote your estimator trusts</h1>
    <p class="lead">This is the product we're building. Early-access shops use it on real RFQs and shape
    what it does first, so details may change; this page will change with them.</p>
  </div>
</section>
<section class="band">
  <div class="container narrow">
    <ol class="walkthrough">
      ${steps.map((s, i) => html`<li><h2><span class="num">${i + 1}</span>${s.title}</h2>${s.body}</li>`)}
    </ol>
  </div>
</section>
<section class="band band-muted" aria-labelledby="wont-heading">
  <div class="container narrow">
    <h2 id="wont-heading">What it will not do</h2>
    <ul class="checks">${wont.map((w) => html`<li>${check}<span>${w}</span></li>`)}</ul>
    <p>Defense work: see <a class="link" href="${href(ctx, "/for-cmmc-shops")}">CUI and export-controlled drawings</a> before sending any.</p>
  </div>
</section>
${ctaBand(ctx, "Help decide what it reads first", "Tell us the RFQs you get and the way you quote today. Early-access shops set the order of the work.")}`;
}

export function pricingPage(ctx: RenderContext): Html {
  const pct = Math.round(ANNUAL_DISCOUNT * 100);
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Pricing</p>
    <h1>Free while it's in development. Simple once it isn't.</h1>
    <p class="lead">Nothing is for sale yet. Early access is free. The plans below are what we propose to
    charge when ${SITE_NAME} is ready, so you can judge whether it would be worth it to your shop.</p>
  </div>
</section>
<section class="band">
  <div class="container">
    <div class="plans">
      <article class="plan plan-featured" aria-labelledby="plan-early">
        <p class="pill">Open now</p>
        <h2 id="plan-early">${EARLY_ACCESS_PLAN.name}</h2>
        <p class="price"><span>$0</span> while in development</p>
        <ul class="checks">
          <li>${check}<span>Up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month</span></li>
          <li>${check}<span>${EARLY_ACCESS_PLAN.seats} people from your shop</span></li>
          <li>${check}<span>Direct line to the person building it</span></li>
          <li>${check}<span>No card, no commitment; leave any time</span></li>
        </ul>
        <p><a class="btn btn-primary block" href="${href(ctx, "/early-access")}">Request early access</a></p>
      </article>
      ${PLANS.map(
        (p) => html`<article class="plan" aria-labelledby="plan-${p.key}">
        <p class="pill pill-muted">Proposed</p>
        <h2 id="plan-${p.key}">${p.name}</h2>
        <p class="price"><span>${formatUsd(p.monthlyPrice)}</span> a month</p>
        <p class="fineprint">or ${formatUsd(p.annualPrice)} a year (${pct}% off)</p>
        <p>${p.summary}</p>
        <ul class="checks">
          <li>${check}<span>Up to ${p.rfqsPerMonth} RFQs a month</span></li>
          <li>${check}<span>${p.seats} people from your shop</span></li>
          <li>${check}<span>Your rate table, shop rules and quote history</span></li>
        </ul>
        <p class="fineprint">Not on sale yet.</p>
      </article>`,
      )}
    </div>
  </div>
</section>
<section class="band band-muted" aria-labelledby="why-heading">
  <div class="container narrow">
    <h2 id="why-heading">How these prices were set</h2>
    <p>Each plan is priced from what it costs us to run: the AI reading each drawing and checking
    itself, hosting and storing drawings, payment fees, a refund reserve and support time, for a shop
    that uses its whole allowance. The price is that cost plus a margin of roughly one and a half to two
    and a half times, and RFQ allowances are set so no plan sells below that.</p>
    <h3>What counts as an RFQ</h3>
    <p>One customer request, with any number of parts, up to 10 drawing pages. Bigger packages count once
    per 10 pages. Re-reading, editing and re-pricing the same RFQ doesn't count again.</p>
    <h3>Early-access shops</h3>
    <p>We'll tell early-access shops the final prices before anything is charged, and nobody is moved
    onto a paid plan without choosing it.</p>
  </div>
</section>
${ctaBand(ctx, "Start free on your own RFQs", "Early access costs nothing while it's in development.")}`;
}

export function cmmcPage(ctx: RenderContext): Html {
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>For defense and CMMC-conscious shops</p>
    <h1>Quoting help, without putting controlled drawings at risk</h1>
    <p class="lead">Many machine shops quote for defense primes and their suppliers. If some of your RFQs
    carry Controlled Unclassified Information (CUI) or export-controlled technical data, here is exactly
    where ${SITE_NAME} stands.</p>
  </div>
</section>
<section class="band">
  <div class="container narrow prose">
    <h2>During early access: don't send CUI or ITAR/EAR drawings</h2>
    <p>${SITE_NAME} early access is not set up to hold CUI or export-controlled technical data. Contractors
    that store covered defense information with a cloud service are expected to use one that meets
    security requirements equivalent to the FedRAMP Moderate baseline
    (<a class="link" href="https://www.acquisition.gov/dfars/252.204-7012-safeguarding-covered-defense-information-and-cyber-incident-reporting">DFARS 252.204-7012</a>),
    and export-controlled drawings have their own rules. We don't claim either, so please use early
    access only for commercial RFQs and drawings with no CUI or export-control markings.</p>
    <p>If you're not sure whether a drawing is controlled, treat it as controlled and leave it out. The
    early-access form asks only about your shop, never for drawings.</p>

    <h2>Why we're building for these shops anyway</h2>
    <p>CMMC requirements started appearing in Department of Defense contracts on 10 November 2025
    (<a class="link" href="https://meritalk.com/articles/dod-begins-rollout-of-cmmc-on-nov-10-heres-what-you-need-to-know/">MeriTalk</a>);
    check the current rollout schedule for what applies to your contracts. The shops that quote defense
    work are often the same small CNC and fabrication shops that ${SITE_NAME} is for, and they need the
    paperwork side handled too.</p>

    <h2>Coming: a CMMC workspace for small shops</h2>
    <p>Alongside ${SITE_NAME} we're building a separate workspace for CMMC Level 1 and Level 2
    self-assessments: the System Security Plan, the plan of action and milestones, and the SPRS score
    across the NIST SP 800-171 controls. It is not available yet, it will not certify anyone (only an
    authorized assessor can), and its site isn't live yet.</p>
    <p><a class="link" href="${CMMC_SITE_URL}">The CMMC workspace (coming)</a></p>
    <p>Want to hear when either is ready for controlled work? Say so in the notes on the early-access form.</p>
  </div>
</section>
${ctaBand(ctx, "Start with your commercial RFQs", "Early access is free and asks only about your shop.")}`;
}

export const FAQS: readonly { q: string; a: string }[] = [
  {
    q: `Can I use ${SITE_NAME} today?`,
    a: `It's in development. Shops can request free early access and try it on their own RFQs as it comes together; there's nothing to buy yet.`,
  },
  {
    q: "Does the AI decide my prices?",
    a: "No. Prices come only from the rates, minimums and markups you set. The AI reads the RFQ and drawings and proposes setups and cycle times with its reasoning shown; your estimator accepts or corrects them, and the dollar math is plain arithmetic on your rate table.",
  },
  {
    q: "How does it price material: by weight, by the bar or by the foot?",
    a: "Whichever way you buy it. Each material on your rate table is priced by weight (your price per lb or per cwt and density, plus scrap), by the stock piece (a sheet or a cut blank), or by length for bar, tube and extrusion: your price per foot or per metre, a cut allowance for kerf and facing, and, if you buy in fixed bars, the bar length and remnant, so a line is charged the whole bars its parts need. You can import these from your supplier's price list as a spreadsheet: before you save, each row shows its price change and the open quotes priced at the old price, and the supplier and the list's date are kept in each price's history. A price per cwt or per metre is kept exactly as your supplier quotes it, so $412.50/cwt prices at $4.125/lb, not a rounded $4.13.",
  },
  {
    q: "What does it read?",
    a: "RFQ email text and PDF drawings, including scans, plus STEP and DXF files. A STEP solid gives the blank size and, with your machine's measured removal rate, a roughing time; with your seconds per hole and, if you enter one, your drill feed for each hole's depth, a drilling time that counts a counterbored hole once, flags holes deeper than 3× their diameter and leaves bores over 1 in to you; tick which hole sizes are threaded and, with your seconds per tapped hole, it adds a tapping time. A DXF flat pattern gives a laser, waterjet or plasma cutting time from its cut length and pierces at your cut speed (one per machine, or your own speed for each material and thickness from your cut charts), and a press-brake time from its bend lines; on a material sold by the sheet, with your sheet size and nest gap, it counts how many flat blanks fit on one sheet (a rectangular nest, so a nesting program may fit more, never fewer). IGES, STL and native SolidWorks files are not measured yet.",
  },
  {
    q: "What happens when a drawing is unclear?",
    a: "The value is flagged for your estimator with the drawing page it came from. It is never filled in with a guess.",
  },
  {
    q: "Will it send quotes to my customers?",
    a: "No. Your estimator reviews and approves every quote and sends it themselves, as a PDF or copied into your own email or ERP.",
  },
  {
    q: "Will you use my drawings to train AI models?",
    a: "No. Your drawings, rates and quotes are used only to quote for your shop. They are never used to train AI models and never shared with another shop.",
  },
  {
    q: "Can I send CUI or export-controlled (ITAR/EAR) drawings?",
    a: "Not during early access: it isn't set up for controlled data. Use it only for commercial RFQs. The page for CMMC-conscious shops explains why and what's coming.",
  },
  {
    q: "Does it connect to my ERP or quoting system?",
    a: "Not yet. At first you'll download the quote or copy it across. Tell us which system you use on the early-access form; that decides which connection gets built first.",
  },
  {
    q: "What will it cost?",
    a: `Early access is free. Proposed plans start at ${formatUsd(Math.min(...PLANS.map((p) => p.monthlyPrice)))} a month, priced from what it costs to run. Nobody is moved onto a paid plan without choosing it.`,
  },
  {
    q: "Who is building it?",
    a: `${PUBLISHER}, a small software company that also makes Grant Autopilot for nonprofits.`,
  },
];

export function faqPage(ctx: RenderContext): Html {
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>FAQ</p>
    <h1>Frequently asked questions</h1>
  </div>
</section>
<section class="band">
  <div class="container narrow faq">
    ${FAQS.map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}
    <p>Something else? Email <a class="link" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  </div>
</section>
${ctaBand(ctx, "Try it on your own RFQs", "Early access is free while it's in development.")}`;
}

export interface EarlyAccessState {
  errors?: FieldErrors;
  values?: FormValues;
}

export function earlyAccessPage(ctx: RenderContext, state: EarlyAccessState = {}): Html {
  const errors = state.errors ?? {};
  const v = state.values ?? {};
  const errorCount = Object.keys(errors).length;
  const err = (field: keyof FieldErrors) =>
    errors[field] ? html`<p class="field-error" id="${field}-error">${errors[field]}</p>` : "";
  const aria = (field: keyof FieldErrors) =>
    errors[field] ? html` aria-invalid="true" aria-describedby="${field}-error"` : "";
  const selected = (current: string | undefined, value: string) =>
    current === value ? html` selected` : "";
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Early access</p>
    <h1>Try ${SITE_NAME} on your own RFQs</h1>
    <p class="lead">Free while it's in development, up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month.
    Tell us about your shop and we'll be in touch by email as places open. Please don't attach drawings
    here.</p>
  </div>
</section>
<section class="band">
  <div class="container narrow">
    ${
      errorCount > 0
        ? html`<div class="alert" role="alert"><h2>Please fix ${errorCount === 1 ? "one thing" : `${errorCount} things`}</h2>
      <ul>${Object.entries(errors).map(([k, m]) => html`<li><a href="#${k === "processes" ? "processes-milling" : k}">${m}</a></li>`)}</ul></div>`
        : ""
    }
    <form class="form" method="post" action="${href(ctx, "/api/early-access")}" novalidate>
      <div class="field">
        <label for="name">Your name</label>
        <input id="name" name="name" autocomplete="name" required maxlength="${LIMITS.name}" value="${v.name ?? ""}"${aria("name")}>
        ${err("name")}
      </div>
      <div class="field">
        <label for="email">Work email</label>
        <input id="email" name="email" type="email" autocomplete="email" required maxlength="${LIMITS.email}" value="${v.email ?? ""}"${aria("email")}>
        ${err("email")}
      </div>
      <div class="field">
        <label for="shop">Shop or company</label>
        <input id="shop" name="shop" autocomplete="organization" required maxlength="${LIMITS.shop}" value="${v.shop ?? ""}"${aria("shop")}>
        ${err("shop")}
      </div>
      <div class="field">
        <label for="role">Your role</label>
        <select id="role" name="role" required${aria("role")}>
          <option value="">Choose one</option>
          ${Object.entries(ROLES).map(([k, label]) => html`<option value="${k}"${selected(v.role, k)}>${label}</option>`)}
        </select>
        ${err("role")}
      </div>
      <fieldset class="field"${aria("processes")}>
        <legend>What do you quote? <span class="hint">Choose all that apply.</span></legend>
        ${Object.entries(PROCESSES).map(
          ([k, label]) =>
            html`<label class="choice"><input type="checkbox" id="processes-${k}" name="processes" value="${k}"${v.processes?.includes(k) ? html` checked` : ""}> ${label}</label>`,
        )}
        ${err("processes")}
      </fieldset>
      <div class="field">
        <label for="rfqsPerWeek">RFQs per week, roughly</label>
        <select id="rfqsPerWeek" name="rfqsPerWeek" required${aria("rfqsPerWeek")}>
          <option value="">Choose one</option>
          ${Object.entries(RFQ_VOLUMES).map(([k, label]) => html`<option value="${k}"${selected(v.rfqsPerWeek, k)}>${label}</option>`)}
        </select>
        ${err("rfqsPerWeek")}
      </div>
      <div class="field">
        <label for="quotingToday">How do you quote today? <span class="hint">Optional. A spreadsheet, your ERP, by hand…</span></label>
        <input id="quotingToday" name="quotingToday" maxlength="${LIMITS.quotingToday}" value="${v.quotingToday ?? ""}"${aria("quotingToday")}>
        ${err("quotingToday")}
      </div>
      <div class="field">
        <label for="notes">Anything else? <span class="hint">Optional. What would make this worth it for you?</span></label>
        <textarea id="notes" name="notes" rows="4" maxlength="${LIMITS.notes}"${aria("notes")}>${v.notes ?? ""}</textarea>
        ${err("notes")}
      </div>
      <div class="hp" aria-hidden="true">
        <label for="website">Leave this empty</label>
        <input id="website" name="website" tabindex="-1" autocomplete="off">
      </div>
      <div class="field">
        <label class="choice"><input type="checkbox" id="consent" name="consent" value="yes" required${v.consent ? html` checked` : ""}${aria("consent")}> ${CONSENT_TEXT}</label>
        ${err("consent")}
      </div>
      <p class="fineprint">We store what you enter here to contact you about early access and to decide
      what to build. See the <a class="link" href="${href(ctx, "/privacy")}">privacy notice</a>.</p>
      <p><button class="btn btn-primary" type="submit">Request early access</button></p>
    </form>
  </div>
</section>`;
}

export function thanksPage(ctx: RenderContext): Html {
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Early access</p>
    <h1>Thanks, your request is in</h1>
    <p class="lead">A person reads every request. We'll email you as early-access places open, starting
    with shops whose RFQs match what ${SITE_NAME} can read today. You won't be added to any other list.</p>
    <p>Changed your mind, or want your details removed? Email
    <a class="link" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
    <p class="actions"><a class="btn btn-secondary" href="${href(ctx, "/how-it-works")}">Read how it works</a></p>
  </div>
</section>`;
}

export function privacyPage(_ctx: RenderContext): Html {
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Privacy</p>
    <h1>Early-access privacy notice</h1>
    <p class="lead">This covers the early-access form only. ${SITE_NAME} itself will have its own terms
    and privacy policy before anyone uploads a drawing.</p>
  </div>
</section>
<section class="band">
  <div class="container narrow prose">
    <h2>What we store</h2>
    <p>What you type into the form: your name, work email, shop name, role, the kinds of work you quote,
    roughly how many RFQs you get, how you quote today and any notes, plus the version of the consent
    wording you saw and when you sent it. To limit abuse we also keep a one-way hash of your IP address,
    never the address itself.</p>
    <h2>Why</h2>
    <p>To contact you about early access and to decide what to build first. Nothing else: no newsletter,
    no sharing, no selling.</p>
    <h2>Who can see it</h2>
    <p>Only the people who run ${SITE_NAME} can see the list of requests: your name, email address, the
    page you sent the form from, and the date. Each time they view it, that view is logged.</p>
    <h2>Where</h2>
    <p>In a database on Cloudflare, which hosts this site. The site sets no tracking cookies and loads no
    third-party scripts.</p>
    <h2>How long, and how to remove it</h2>
    <p>Until early access ends or you ask us to delete it, whichever comes first. Email
    <a class="link" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from the address you signed up with
    and we'll delete your request.</p>
    <h2>Who we are</h2>
    <p>${PUBLISHER}.</p>
  </div>
</section>`;
}

/** Path → body renderer. The Worker uses earlyAccessPage directly for error re-renders. */
export const PAGE_BODIES: Record<string, (ctx: RenderContext) => Html> = {
  "/": homePage,
  "/how-it-works": howItWorksPage,
  "/pricing": pricingPage,
  "/for-cmmc-shops": cmmcPage,
  "/faq": faqPage,
  "/early-access": (ctx) => earlyAccessPage(ctx),
  "/early-access/thanks": thanksPage,
  "/privacy": privacyPage,
};
