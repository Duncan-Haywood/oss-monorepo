// Page bodies (the <main> content). Everything renders to static HTML at build time, except the
// early-access page, which the Worker re-renders with the visitor's values when the form has errors.
// Copy rules (see README): say only what the hosted app does today (LAUNCH in ./config says which
// parts are switched on), never claim customers, results, time saved, certifications or compliance.

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
import { appLink, CMMC_SITE_URL, CONTACT_EMAIL, type Launch, PUBLISHER, SITE_NAME } from "./config";
import { EXAMPLE as CYCLE_EXAMPLE, cycleTimeExample, DEEP_HOLE_RATIO } from "./cycle-time-example";
import { EXAMPLE as FAI_EXAMPLE, type FaiVariant, priceFaiExample } from "./fai-example";
import { type Html, html } from "./html";
import {
  type MarkupBreak,
  marginFromMarkup,
  markupFromMargin,
  pct1,
  priceAllPolicies,
  RATE_COST_CENTS,
  RATE_MARGIN,
  TABLE_MARGINS,
  TABLE_MARKUPS,
} from "./markup-example";
import {
  LB_PER_IN3_PER_G_PER_CM3,
  EXAMPLE as MATERIAL_EXAMPLE,
  METHODS,
  materialCostExample,
  markupCents as materialMarkupCents,
} from "./material-cost-example";
import { MODULES } from "./module-data";
import { EXAMPLE as OUTSIDE_EXAMPLE, priceOutsideExample } from "./outside-processing-example";
import { BREAK_QUANTITIES, EXAMPLE as BREAKS_EXAMPLE, quantityBreaks } from "./quantity-breaks";
import { priceExample, EXAMPLE as QUOTE_EXAMPLE, usdCents } from "./quote-example";
import { CSV_COLUMNS, CSV_FILE, exampleQuote, TERMS_CHECKLIST } from "./quote-template";
import { RFQ_CHECKS, RFQ_CSV_COLUMNS, RFQ_CSV_FILE, RFQ_SECTIONS } from "./rfq-checklist";
import { compareRush, RUSH, rushLine } from "./rush-example";
import { flatBlank, priceSheetExample, EXAMPLE as SHEET_EXAMPLE } from "./sheet-metal-example";
import {
  EMPLOYER_FICA,
  EXAMPLE,
  shopRate,
  US_COMMERCIAL_POWER_CENTS,
  UTILISATION_HOURS,
  usd,
} from "./shop-rate";
import {
  ISO2768_RANGES,
  ISO2768_ROWS,
  inchZone,
  BANDS as TOLERANCE_BANDS,
  CALLOUTS as TOLERANCE_CALLOUTS,
} from "./tolerance-example";
import { priceTurningExample, EXAMPLE as TURN_EXAMPLE } from "./turning-example";
import { priceWeldingExample, STEEL_LB_PER_IN3, EXAMPLE as WELD_EXAMPLE } from "./welding-example";

export interface RenderContext {
  /** "" or a path like "/jobshop": prefixed to every internal link. */
  basePath: string;
  /** What the hosted app does today (LAUNCH in ./config). */
  launch: Launch;
  /** The route being rendered ("/pricing"), so its Start free links say which page sent the visit. */
  page?: string;
}

export const href = (ctx: RenderContext, path: string): string =>
  `${ctx.basePath}${path === "/" ? "/" : path}`;

const check = html`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * The app's sign-up address, tagged `from=jobshop-site/<page>` so the app can count which page of
 * this site sent each new account (apps/jobshop-quote/src/shared/signup-source.ts). The home page is
 * `jobshop-site/home`; outside a page render the link carries no tag.
 */
export function signUpLink(ctx: RenderContext): string {
  const url = appLink(ctx.launch, "/sign-up");
  if (!ctx.page) return url;
  const page = ctx.page === "/" ? "home" : ctx.page.replace(/^\/+|\/+$/g, "").toLowerCase();
  return `${url}?from=${encodeURIComponent(`jobshop-site/${page}`)}`;
}

/** The one call to action: sign up in the app once the site is open, else the early-access list. */
export function primaryCta(ctx: RenderContext, cls = "btn btn-primary"): Html {
  return ctx.launch.open
    ? html`<a class="${cls}" href="${signUpLink(ctx)}">Start free</a>`
    : html`<a class="${cls}" href="${href(ctx, "/early-access")}">Request early access</a>`;
}

/** Said wherever the site describes AI reading, while the hosted app has it switched off. */
export const AI_OFF =
  "Reading RFQ emails and PDF drawings with AI is built but not switched on in the hosted app yet. Until it is, the app reads them by fixed rules: labelled lines (Part number, Qty, Material, Finish, Due) and parts tables with a header row, each value shown with the line it came from. You check those and enter the rest yourself.";
const INBOUND_OFF =
  "RFQs by email to a shop address are not switched on in the hosted app yet: upload the files instead.";

const aiNote = (ctx: RenderContext): Html | "" =>
  ctx.launch.aiReading ? "" : html`<p class="fineprint">${AI_OFF}</p>`;

/** Free-plan line under a call to action. */
function freePlanLine(ctx: RenderContext): string {
  const from = formatUsd(Math.min(...PLANS.map((p) => p.monthlyPrice)));
  if (!ctx.launch.open)
    return `In development. Early access is free; proposed plans from ${from} a month.`;
  return `Free Early access plan: up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month, no card. Paid plans from ${from} a month${ctx.launch.paidPlans ? "" : ", not on sale yet"}.`;
}

export function ctaBand(ctx: RenderContext, heading: string, body: string): Html {
  return html`<section class="band band-cta" aria-labelledby="cta-heading">
  <div class="container narrow">
    <h2 id="cta-heading">${heading}</h2>
    <p>${body}</p>
    <p class="actions">${primaryCta(ctx)}</p>
  </div>
</section>`;
}

/**
 * Screenshots of the app itself (public/shots/), captured by `pnpm stills` in apps/jobshop-quote
 * (test/stills/capture.stills.ts) from the real app running offline. The shop, customer and part are
 * made up, and the quote's figures are asserted there against a hand check before the shot is taken.
 * Only what the hosted app does today is shown: the part is entered by hand, not read by AI.
 */
export const SHOTS = {
  quoteLine: {
    file: "quote-line-desktop.webp",
    width: 1280,
    height: 860,
    alt: "Job Shop Quote on a laptop: a draft quote line for part BRK-1001 Rev B, a motor mount bracket in 6061-T6 aluminum plate, from a 4 by 3 by 0.5 inch blank with one operation, Op 10 mill on a Haas VF-2, 60 minutes setup and 12 minutes a part, and black anodize. The price table beside it shows quantities 10, 50 and 100 at $46.40, $26.80 and $25.85 a part ($464.00, $1,340.00 and $2,585.00), with the material, setup, run and finish cost of each, and a breakdown saying which rate each figure came from.",
  },
  quotePhone: {
    file: "quote-phone.webp",
    width: 390,
    height: 311,
    alt: "The same quote line on a phone: the price table for quantities 10, 50 and 100 (material, setup, run, finish and extras; swipe for unit price and total), and the breakdown: 0.585 lb of 6061-T6 a part at $4.50/lb plus 10% scrap, 60 minutes setup and 12 minutes a part at $95.00 an hour, anodize at $3.00 a part with a $150.00 lot minimum, and 0% markups.",
  },
  rateCard: {
    file: "rate-card-desktop.webp",
    width: 1280,
    height: 860,
    alt: "The rate card in Job Shop Quote: two machines (a Haas VF-2 mill at $95.00 an hour and an Okuma LB3000 lathe at $105.00 an hour) and two materials (303 stainless bar at $6.20/lb and 6061-T6 aluminum plate at $4.50/lb, each with its density, 10% scrap, a minimum charge and the date the price was set), with the forms for adding more.",
  },
  customerPdf: {
    file: "customer-pdf.webp",
    width: 1275,
    height: 750,
    alt: "The top of the quote PDF the customer receives, on the shop's letterhead: a made-up logo (a hexagon and the words Example Precision), the shop's name, address, phone and email, and QUOTE with quote number Q-1001, the date and a valid-until date a month later; prepared for Example Robotics LLC, Dana Example, with a lead time of 3-4 weeks ARO; part BRK-1001 Rev B, motor mount bracket, at 10, 50 and 100 pieces for $46.40, $26.80 and $25.85 each ($464.00, $1,340.00 and $2,585.00); and the shop's terms, Net 30, FOB our dock. No costs, rates or markup appear.",
  },
  customerPage: {
    file: "customer-quote-phone.webp",
    width: 390,
    height: 1082,
    alt: "The customer's page for the same quote on a phone, opened from a link with no account: the shop's name and contact lines, the quote number, dates and lead time, a link to the PDF as sent, and an Accept this quote form where the buyer picks 10, 50 or 100 of BRK-1001 at the quoted prices or not ordering the part, sees the total, types their name, email, PO number and a note, and accepts the quote or declines it, with the shop's terms below.",
  },
  quoteLog: {
    file: "quote-log-desktop.webp",
    width: 1280,
    height: 860,
    alt: "The quote log in Job Shop Quote for a made-up shop: totals for open quotes (1), win rate (50%, 1 won of 2 decided), won ($536.25) and quoted ($1,635.25); a follow-up card with one follow-up coming up in the next 7 days and the days-after-sending setting; and four quotes, Q-1004 draft for Example Robotics LLC ($422.12), Q-1003 lost on lead time to Demo Aero Components ($635.00), Q-1002 won from Sample Fluidics Inc. ($536.25) and Q-1001 sent to Example Robotics LLC ($464.00).",
  },
} as const;

type Shot = (typeof SHOTS)[keyof typeof SHOTS];

function shotImg(ctx: RenderContext, s: Shot): Html {
  return html`<img src="${href(ctx, `/shots/${s.file}`)}" width="${s.width}" height="${s.height}" loading="lazy" decoding="async" alt="${s.alt}">`;
}

/** A full-width still that opens at full size, with a caption. */
export function shotFigure(ctx: RenderContext, s: Shot, caption: string): Html {
  return html`<figure class="shot">
  <a class="shot-link" href="${href(ctx, `/shots/${s.file}`)}">${shotImg(ctx, s)}</a>
  <figcaption>${caption}</figcaption>
</figure>`;
}

function appShots(ctx: RenderContext): Html {
  return html`<section class="band band-muted" id="in-the-app" aria-labelledby="shots-heading">
  <div class="container">
    <h2 id="shots-heading" class="center">What a quote looks like in the app</h2>
    <p class="center shots-lead">Screenshots of ${SITE_NAME} itself. The shop, customer and part are made up; the prices are what the app worked out from the rate card typed in for them.</p>
    <div class="shots">
      <figure class="shot shot-wide">
        <a class="shot-link" href="${href(ctx, `/shots/${SHOTS.quoteLine.file}`)}">${shotImg(ctx, SHOTS.quoteLine)}</a>
        <figcaption>One quote line: the blank, the operation and the finish on the left, every quantity break priced on the right, and under the table which rate each figure came from.</figcaption>
      </figure>
      <figure class="shot shot-phone">
        ${shotImg(ctx, SHOTS.quotePhone)}
        <figcaption>The same line on a phone.</figcaption>
      </figure>
    </div>
    <h3 class="center shots-sub">What your customer gets</h3>
    <div class="shots">
      <figure class="shot shot-wide">
        <a class="shot-link" href="${href(ctx, `/shots/${SHOTS.customerPdf.file}`)}">${shotImg(ctx, SHOTS.customerPdf)}</a>
        <figcaption>The quote PDF on your letterhead: your logo and contact lines, prices for each quantity break, the dates, the lead time and your terms. The costs, rates and markup behind them stay in the app.</figcaption>
      </figure>
      <figure class="shot shot-phone">
        ${shotImg(ctx, SHOTS.customerPage)}
        <figcaption>The link you can send with it: the customer picks a quantity, adds a PO number and accepts, or declines, with no account.</figcaption>
      </figure>
    </div>
    <h3 class="center shots-sub">After it's sent</h3>
    ${shotFigure(ctx, SHOTS.quoteLog, "The quote log: every quote with its status and value, your win rate, and the sent quotes due for a follow-up, so an open quote doesn't go quiet. Four made-up quotes for three made-up customers.")}
    <p class="center"><a class="link" href="${href(ctx, "/how-it-works")}">How the price is built, step by step →</a></p>
  </div>
</section>`;
}

/** Illustration only: clearly labelled sample data, not a real customer, quote or result. */
function quoteMock(aiReading: boolean): Html {
  // With AI reading off, the sample shows what the app does today: rates and CAD measurements,
  // with an estimator check, not values read from an emailed drawing.
  const lines = aiReading
    ? [
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
      ]
    : [
        {
          part: "Mounting bracket",
          detail: "6061-T6 aluminum · qty 50",
          source: "STEP: blank, 6 holes",
          price: "Priced from your rates",
        },
        {
          part: "Side panel",
          detail: "14 ga CRS · qty 120",
          source: "DXF: cut length, 2 bends",
          price: "Priced from your rates",
        },
        {
          part: "Setup on the 5-axis",
          detail: "No setup time on your rate card",
          source: "Check",
          price: "Needs estimator",
          flag: true,
        },
      ];
  return html`<figure class="mock" aria-label="Illustration of a draft quote, with sample data">
  <div class="mock-head">
    <span class="mock-title">${aiReading ? "Draft quote · RFQ from email" : "Draft quote · 2 parts"}</span>
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
  const { open, aiReading } = ctx.launch;
  const promises = aiReading
    ? [
        "Prices come from your rate table, not from the AI",
        "Every line shows where it came from: a drawing page or one of your rates",
        "Anything it can't read is flagged for your estimator, never guessed",
      ]
    : [
        "Prices come from your rate table, never from a guess",
        "Every line shows which of your rates it used",
        "Quantity breaks, minimums and markups applied the same way every time",
      ];
  const lead = aiReading
    ? html`Forward an RFQ email or drop in a PDF drawing. ${SITE_NAME} reads the parts, quantities,
      materials and tolerances, prices them with your machine rates, setup charges and markups, and hands
      your estimator a draft quote to check. Nothing goes to a customer until you send it.`
    : html`Set your machine rates, setup charges, material prices and markups once. Add an RFQ's parts,
      attach its STEP or DXF files, and ${SITE_NAME} prices every line from your rates, measures what the
      CAD files can tell it, and builds the quote PDF for your estimator to check and send. Nothing goes
      to a customer until you send it.`;
  const ai = (text: string): string =>
    aiReading ? text : `${text} (AI reading: not switched on yet)`;
  return html`<section class="hero" aria-labelledby="hero-heading">
  <div class="container hero-grid">
    <div>
      <p class="eyebrow"><span class="dot" aria-hidden="true"></span>For CNC and fabrication job shops · ${open ? "Free to start" : "In development"}</p>
      <h1 id="hero-heading">Work through the RFQ backlog without hiring another estimator.</h1>
      <p class="lead">${lead}</p>
      <ul class="checks">${promises.map((p) => html`<li>${check}<span>${p}</span></li>`)}</ul>
      <p class="actions">
        ${primaryCta(ctx)}
        <a class="btn btn-secondary" href="${href(ctx, "/how-it-works")}">See how it works</a>
      </p>
      <p class="fineprint">${freePlanLine(ctx)}</p>
    </div>
    ${quoteMock(aiReading)}
  </div>
</section>

${appShots(ctx)}

<section class="band" aria-labelledby="backlog-heading">
  <div class="container narrow">
    <h2 id="backlog-heading">The quoting pile is the bottleneck nobody hired for</h2>
    <p>In a job shop, quoting usually lands on the owner or one estimator. Every RFQ means opening the
    email, reading each drawing, working out stock, setups and cycle times, looking up material and outside
    processing, and applying your rates. That work happens between running the floor and answering the
    phone, and while RFQs wait, the customers who sent them wait too.</p>
    <p>${
      open
        ? `${SITE_NAME} does the arithmetic and the paperwork${aiReading ? " and the reading" : ""}, so your estimator's time goes on the judgment calls: the tricky features, the quantity breaks, and whether you want the job.`
        : `${SITE_NAME} is being built to do the reading and the arithmetic, so your estimator's time goes on the judgment calls: the tricky features, the quantity breaks, and whether you want the job.`
    }</p>
  </div>
</section>

<section class="band band-muted" aria-labelledby="split-heading">
  <div class="container">
    <h2 id="split-heading" class="center">What it does, and what stays yours</h2>
    <div class="cols-2">
      <div class="card">
        <h3>${SITE_NAME} does the legwork</h3>
        <ul class="checks">
          <li>${check}<span>${ai("Reads RFQ emails and PDF drawings: parts, quantities, material, finish, tolerances and notes")}</span></li>
          <li>${check}<span>${ai("Checks what it read a second time against the drawing and flags anything it can't confirm")}</span></li>
          <li>${check}<span>Measures STEP, IGES, STL and DXF files: blank size, holes, cut length, pierces and bends, for roughing, drilling, cutting and bending times you can correct</span></li>
          <li>${check}<span>Applies your rates, minimums and markups with plain arithmetic: same inputs, same price</span></li>
          <li>${check}<span>Lists the sent quotes due for a follow-up each morning and keeps a log of every call, so no quote goes quiet</span></li>
          <li>${check}<span>Dates every material price, warns when one is past your limit, and lists the open quotes priced before your supplier's price moved</span></li>
          <li>${check}<span>Puts your won jobs on your machines by due date, shows which ones run past their date, and gives each new quote a lead time from your real backlog</span></li>
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
    <h2 id="steps-heading" class="center">From RFQ to quote</h2>
    <ol class="steps">
      <li><h3>Set your rates once</h3><p>Machines and hourly rates, setup charges, material, outside processing, minimums.</p></li>
      ${
        aiReading
          ? html`<li><h3>Send in the RFQ</h3><p>Forward the email or upload the PDF drawings.</p></li>
      <li><h3>Read and double-checked</h3><p>Every value is checked against the drawing; gaps are flagged.</p></li>`
          : html`<li><h3>Add the RFQ</h3><p>Enter the parts and quantities; attach the drawings and any STEP or DXF files.</p></li>
      <li><h3>Priced by your rules</h3><p>Setups, cycle times you can correct, material and outside processing, all from your rates.</p></li>`
      }
      <li><h3>Review and send</h3><p>Your estimator fixes what needs fixing and sends the quote themselves.</p></li>
    </ol>
    <p class="center"><a class="link" href="${href(ctx, "/how-it-works")}">The full walkthrough →</a></p>
  </div>
</section>

<section class="band band-muted" aria-labelledby="status-heading">
  <div class="container narrow">
    <h2 id="status-heading">Where it stands</h2>
    ${
      open
        ? html`<p>${SITE_NAME} is open: any shop can sign up and use it on the free Early access plan. It is
    new. There are no customers yet and no results to quote, so you won't find testimonials or
    time-saved figures here. The first shops on it tell us where it gets things wrong, and that decides
    what gets built next.</p>
    <p>Working today: the rate card (imported from your spreadsheet or entered by hand), parts and
    routings, STEP and DXF measurements, quantity breaks, quote PDFs and quote email, customer links to
    accept or decline, follow-up and expiry reminders, job travelers, and the won/lost log.</p>
    <p>Not switched on yet: ${[
      aiReading ? "" : "reading RFQ emails and drawings with AI",
      ctx.launch.inboundEmail ? "" : "RFQs forwarded by email",
      ctx.launch.paidPlans ? "" : "the paid plans",
      "the QuickBooks Online connection",
    ]
      .filter(Boolean)
      .join(", ")}. Each is built; the hosted app turns it on when it is ready to run safely.</p>`
        : html`<p>${SITE_NAME} is in development. There are no customers yet and no results to quote, so you won't
    find testimonials or time-saved figures here. Early-access shops try it on their own RFQs for free
    and tell us where it gets things wrong, and that decides what gets built first.</p>`
    }
    <p>Shops that handle defense work: read <a class="link" href="${href(ctx, "/for-cmmc-shops")}">what early access means for CUI and export-controlled drawings</a> first.</p>
  </div>
</section>

${ctaBand(
  ctx,
  "Try it on your own RFQs",
  open
    ? `Sign up and set up your rate card. The Early access plan is free, up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month, no card.`
    : `Tell us what you quote and how many RFQs you see. Early access is free, up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month.`,
)}`;
}

export function howItWorksPage(ctx: RenderContext): Html {
  const { open, aiReading, inboundEmail } = ctx.launch;
  const steps: { title: string; body: Html }[] = [
    {
      title: "Set up your rates once",
      body: html`<p>You enter how your shop prices work: each machine or work center and its hourly rate,
      setup charges, material costs or markups, outside processes such as anodizing, plating or heat treat
      with what your vendors charge, minimum order values, quantity breaks and how you round. This rate
      table is the only place prices come from. Not sure what an hour on a machine costs you?
      <a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">Work out a machine's hourly rate</a>.</p>
      ${shotFigure(ctx, SHOTS.rateCard, "The rate card: each machine's hourly rate, each material's price, density, scrap and minimum, and the date every price was set. Made-up shop.")}`,
    },
    {
      title: "Send in the RFQ",
      body: html`<p>Forward the customer's email to your shop's intake address, or upload the PDF drawings
      directly. It reads email text and PDF drawings, including scans, and CAD files: a STEP solid's size,
      volume and holes, an IGES solid's size and holes, an STL mesh's size and volume, and a DXF flat pattern's cut length, pierces and bend lines. From those it suggests
      the blank, the parts per sheet and, where you have entered the rate, a roughing, drilling, tapping, cutting or bending time, each labelled with
      how it was worked out. Native SolidWorks files are stored but not measured yet.</p>
      ${inboundEmail ? "" : html`<p class="fineprint">${INBOUND_OFF}</p>`}${aiNote(ctx)}`,
    },
    {
      title: "It reads the drawing, then checks itself",
      body: html`<p>For each part it pulls out material, stock size, features, tolerances, finish, quantity
      and due date. A second, separate pass checks every extracted value against the drawing. A value it
      can't confirm, like a smudged tolerance or a missing material callout, is flagged for your estimator
      with the page it came from. It is never filled in with a guess.</p>${aiNote(ctx)}`,
    },
    {
      title: "Priced by your rules",
      body: html`<p>Setup and cycle-time estimates are the hard part of quoting, so ${SITE_NAME} proposes them
      with its reasoning written out (operations, tools, approximate times) for your estimator to accept
      or correct. The dollar figures are then plain arithmetic on your rate table: the same inputs always
      give the same price, and every line shows which rate it used. Corrections your estimator makes are
      saved as rules for your shop, so the next similar part starts closer.</p>
      ${shotFigure(ctx, SHOTS.quoteLine, "A priced line: one operation and a finish on a made-up bracket, every quantity break worked out, and the rate behind each figure listed under the table.")}`,
    },
    {
      title: "Your estimator reviews and sends",
      body: html`<p>The draft quote lists every part, its price build-up and anything flagged. Your
      estimator edits what needs editing and approves it. You then download it as a PDF on your letterhead
      or have ${SITE_NAME} email it from your estimator's send button. It never sends a quote on its own.
      With it can go a link where the customer picks a quantity and accepts, with a PO number, or
      declines; the answer shows on the quote, which is marked won or lost.</p>
      ${shotFigure(ctx, SHOTS.customerPdf, "What the customer receives, on your letterhead: your logo and contact lines, prices for every quantity break, the dates, lead time and terms, and none of the costs, rates or markup behind them. Made-up shop, logo and customer.")}`,
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
    <p class="lead">${
      open
        ? `This is how ${SITE_NAME} works. It is new, and the first shops on it shape what it does next, so details may change; this page will change with them.${aiReading ? "" : " Steps marked as not switched on yet are built but off in the hosted app."}`
        : "This is the product we're building. Early-access shops use it on real RFQs and shape what it does first, so details may change; this page will change with them."
    }</p>
  </div>
</section>
<section class="band">
  <div class="container narrow">
    <ol class="walkthrough">
      ${steps.map((s, i) => html`<li><h2><span class="num">${i + 1}</span>${s.title}</h2>${s.body}</li>`)}
    </ol>
  </div>
</section>
<section class="band" aria-labelledby="parts-heading">
  <div class="container narrow">
    <h2 id="parts-heading">Each part of the app</h2>
    <ul>${MODULES.map((m) => html`<li><a class="link" href="${href(ctx, m.path)}">${m.label}</a>: ${m.description}</li>`)}</ul>
  </div>
</section>
<section class="band band-muted" aria-labelledby="wont-heading">
  <div class="container narrow">
    <h2 id="wont-heading">What it will not do</h2>
    <ul class="checks">${wont.map((w) => html`<li>${check}<span>${w}</span></li>`)}</ul>
    <p>Defense work: see <a class="link" href="${href(ctx, "/for-cmmc-shops")}">CUI and export-controlled drawings</a> before sending any.</p>
  </div>
</section>
${
  open
    ? ctaBand(
        ctx,
        "Set up your rate card and quote a real RFQ",
        "Free to start, no card. Tell us what it gets wrong and that is what gets fixed first.",
      )
    : ctaBand(
        ctx,
        "Help decide what it reads first",
        "Tell us the RFQs you get and the way you quote today. Early-access shops set the order of the work.",
      )
}`;
}

export function pricingPage(ctx: RenderContext): Html {
  const pct = Math.round(ANNUAL_DISCOUNT * 100);
  const { open, paidPlans } = ctx.launch;
  const head = open
    ? html`<h1>Free to start. Simple when you grow.</h1>
    <p class="lead">Start on the free Early access plan. ${
      paidPlans
        ? "Move to a paid plan from the billing page in the app when you need more RFQs or people."
        : "The paid plans below are what we will charge; they are not on sale yet, and nobody is moved onto one without choosing it."
    }</p>`
    : html`<h1>Free while it's in development. Simple once it isn't.</h1>
    <p class="lead">Nothing is for sale yet. Early access is free. The plans below are what we propose to
    charge when ${SITE_NAME} is ready, so you can judge whether it would be worth it to your shop.</p>`;
  const notOnSale = !paidPlans;
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Pricing</p>
    ${head}
  </div>
</section>
<section class="band">
  <div class="container">
    <div class="plans">
      <article class="plan plan-featured" aria-labelledby="plan-early">
        <p class="pill">Open now</p>
        <h2 id="plan-early">${EARLY_ACCESS_PLAN.name}</h2>
        <p class="price"><span>$0</span> ${open ? "no card" : "while in development"}</p>
        <ul class="checks">
          <li>${check}<span>Up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month</span></li>
          <li>${check}<span>${EARLY_ACCESS_PLAN.seats} people from your shop</span></li>
          <li>${check}<span>Direct line to the person building it</span></li>
          <li>${check}<span>No card, no commitment; leave any time</span></li>
        </ul>
        <p>${primaryCta(ctx, "btn btn-primary block")}</p>
      </article>
      ${PLANS.map(
        (p) => html`<article class="plan" aria-labelledby="plan-${p.key}">
        <p class="pill pill-muted">${notOnSale ? (open ? "Coming" : "Proposed") : "Paid"}</p>
        <h2 id="plan-${p.key}">${p.name}</h2>
        <p class="price"><span>${formatUsd(p.monthlyPrice)}</span> a month</p>
        <p class="fineprint">or ${formatUsd(p.annualPrice)} a year (${pct}% off)</p>
        <p>${p.summary}</p>
        <ul class="checks">
          <li>${check}<span>Up to ${p.rfqsPerMonth} RFQs a month</span></li>
          <li>${check}<span>${p.seats} people from your shop</span></li>
          <li>${check}<span>Your rate table, shop rules and quote history</span></li>
        </ul>
        ${notOnSale ? html`<p class="fineprint">Not on sale yet.</p>` : ""}
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
    <h3>${open ? "Shops on the free plan" : "Early-access shops"}</h3>
    <p>${open ? "We'll tell you about any price change before anything is charged" : "We'll tell early-access shops the final prices before anything is charged"}, and nobody is moved
    onto a paid plan without choosing it.</p>
  </div>
</section>
${ctaBand(ctx, "Start free on your own RFQs", open ? "The Early access plan costs nothing and needs no card." : "Early access costs nothing while it's in development.")}`;
}

export function cmmcPage(ctx: RenderContext): Html {
  const { open } = ctx.launch;
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
    (<a class="link" href="https://www.acquisition.gov/dfars/252.204-7012-safeguarding-covered-defense-information-and-cyber-incident-reporting.">DFARS 252.204-7012</a>),
    and export-controlled drawings have their own rules. We don't claim either, so please use early
    access only for commercial RFQs and drawings with no CUI or export-control markings.</p>
    <p>If you're not sure whether a drawing is controlled, treat it as controlled and leave it out. ${
      open
        ? "Signing up asks for your name, email and shop, never for drawings."
        : "The early-access form asks only about your shop, never for drawings."
    }</p>

    <h2>Why we're building for these shops anyway</h2>
    <p>CMMC requirements started appearing in Department of Defense contracts on 10 November 2025
    (<a class="link" href="https://meritalk.com/articles/dod-begins-rollout-of-cmmc-on-nov-10-heres-what-you-need-to-know/">MeriTalk</a>);
    check the current rollout schedule for what applies to your contracts. The shops that quote defense
    work are often the same small CNC and fabrication shops that ${SITE_NAME} is for, and they need the
    paperwork side handled too.</p>

    <h2>Also from us: a CMMC workspace for small shops</h2>
    <p>Alongside ${SITE_NAME} we make a separate workspace for CMMC Level 1 and Level 2
    self-assessments: the System Security Plan, the plan of action and milestones, and the SPRS score
    across the NIST SP 800-171 controls. It is open on a free Level 1 plan. It does not certify anyone
    (only an authorized assessor can), and your assessment stays yours to make and sign.</p>
    <p><a class="link" href="${CMMC_SITE_URL}">About CMMC Workspace</a></p>
    <p>Want to hear when either is ready for controlled work? ${
      open
        ? html`Email <a class="link" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.`
        : "Say so in the notes on the early-access form."
    }</p>
  </div>
</section>
${ctaBand(ctx, "Start with your commercial RFQs", open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * Other ways shops quote, for /compare. Every price is quoted with its source and the date it was
 * read, because most vendors here do not publish a price list and third-party listings disagree
 * (portfolio/monetization/bets.md, "re-check a price on the vendor's page before pricing against
 * it"). A row with no source we could read says so rather than guessing a number.
 */
export interface Alternative {
  name: string;
  kind: string;
  price: string;
  /** Where the price was read; omitted when no price was found. */
  source?: { label: string; url: string; read: string };
  fits: string;
}

export const ALTERNATIVES: readonly Alternative[] = [
  {
    name: "A spreadsheet",
    kind: "Your own Excel or Google Sheets workbook",
    price: "Free, or the cost of the office suite you already have",
    fits: "One estimator, a handful of RFQs a week, and a workbook only they need to understand.",
  },
  {
    name: "Paperless Parts",
    kind: "Dedicated quoting software for machine shops and fabricators",
    price: "No public price list; custom pricing, per the listing",
    source: {
      label: "G2 pricing page",
      url: "https://www.g2.com/products/paperless-parts/pricing",
      read: "2026-11-27",
    },
    fits: "Shops with a steady RFQ flow that want a mature, widely used quoting product and will take a sales call to get a price.",
  },
  {
    name: "QuotedPart",
    kind: "Dedicated quoting software, priced per shop",
    price: "$199 a month per shop, as listed",
    source: {
      label: "Toolradar",
      url: "https://toolradar.com/tools/quotedpart",
      read: "2026-11-24",
    },
    fits: "Shops that want a flat per-shop price rather than per-seat fees.",
  },
  {
    name: "JobBOSS\u00b2",
    kind: "Job-shop ERP with quoting as one module",
    price: "About $3,000 a year, as listed",
    source: {
      label: "SoftwareConnect",
      url: "https://softwareconnect.com/manufacturing-estimating-quoting",
      read: "2026-11-24",
    },
    fits: "Shops that want quoting, scheduling, job tracking and invoicing in one system and are ready for an ERP rollout.",
  },
  {
    name: "ProShop",
    kind: "Shop-floor ERP and quality system with quoting built in",
    price: "$650 to $715 a month, as listed",
    source: {
      label: "G2 pricing page",
      url: "https://www.g2.com/products/proshop/pricing",
      read: "2026-11-24",
    },
    fits: "Shops that also want paperless work orders, quality records and traceability in the same place.",
  },
];

export function comparePage(ctx: RenderContext): Html {
  const { open, aiReading, paidPlans } = ctx.launch;
  const from = formatUsd(Math.min(...PLANS.map((p) => p.monthlyPrice)));
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Compare</p>
    <h1>Machine shop quoting software, compared honestly</h1>
    <p class="lead">Most CNC and fabrication shops quote in one of three ways: a spreadsheet, the quoting
    module of their ERP, or dedicated quoting software. Here is what each
    costs where a price is published, what it is good at, and where ${SITE_NAME} fits, including what it
    does not do.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>The options side by side</h2>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">Prices as listed by the source named, on the date given. Vendors change
        prices and most quote by shop size, so check with the vendor before you decide.</caption>
        <thead>
          <tr><th scope="col">Option</th><th scope="col">What it is</th><th scope="col">Price</th><th scope="col">Fits when</th></tr>
        </thead>
        <tbody>
          ${ALTERNATIVES.map(
            (a) => html`<tr>
            <th scope="row">${a.name}</th>
            <td>${a.kind}</td>
            <td>${a.price}${
              a.source
                ? html`<br><span class="fineprint">(<a class="link" href="${a.source.url}" rel="nofollow">${a.source.label}</a>, read ${a.source.read})</span>`
                : ""
            }</td>
            <td>${a.fits}</td>
          </tr>`,
          )}
          <tr>
            <th scope="row">${SITE_NAME}</th>
            <td>Quoting only: prices RFQs from your own rate card and builds the quote</td>
            <td>Free for up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month, ${EARLY_ACCESS_PLAN.seats} people, no card. Paid plans from ${from} a month${paidPlans ? "" : ", not on sale yet"}</td>
            <td>Shops that want quoting help without an ERP project, and want to try it on real RFQs before paying anything.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>What ${SITE_NAME} does today</h2>
    <ul>
      <li>Prices each part from the machines, rates, materials, minimums and markups on your rate card.
      The math is plain arithmetic you can check line by line; no model sets a price.</li>
      <li>Measures CAD files: a STEP or IGES solid's blank size and hole locations (for roughing and
      drilling time at your machine's rates), an STL's size and volume, and a DXF flat pattern's cut
      length, pierces and bend lines (for laser, waterjet, plasma and press-brake time, and parts per
      sheet).</li>
      <li>Imports your rate card and your supplier's price list from a spreadsheet.</li>
      <li>Builds the quote PDF, emails it when your estimator sends it, keeps revisions, and logs each
      quote as won or lost so you can see your win rate by estimator, routing, part family and month.</li>
    </ul>

    <h2>What it does not do</h2>
    <ul>
      <li>It is not an ERP: no scheduling, work orders, inventory, shop-floor tracking or quality records.
      If you need those, JobBOSS\u00b2 or ProShop are built for it.</li>
      ${aiReading ? "" : html`<li>${AI_OFF}</li>`}
      <li>No connection to an ERP yet. A QuickBooks Online connection is built and switches on once Intuit
      approves it.</li>
      <li>Not for CUI or export-controlled drawings during early access (<a class="link" href="${href(ctx, "/for-cmmc-shops")}">why</a>).</li>
      <li>It is new. The products above have years of shops behind them; ${SITE_NAME} does not yet, and we
      won't pretend otherwise.</li>
    </ul>

    <h2>How to choose</h2>
    <ol>
      <li><strong>Count your RFQs.</strong> A few a week rarely justifies more than a good spreadsheet.
      Dozens a week, with parts that repeat, is where quoting software pays for the estimator's time.</li>
      <li><strong>Decide whether you need an ERP.</strong> If you already run one, try its quoting module
      first. If you don't, buying an ERP just to quote is a large project; quoting-only tools are smaller.</li>
      <li><strong>Know your rates first.</strong> Every tool prices from your hourly rates, so a rate that
      is too low gives a wrong quote in all of them (<a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">how to work one out</a>).</li>
      <li><strong>Price it on your own work.</strong> Quote last month's RFQs in any tool you trial and compare
      the numbers with what you actually charged and what the jobs cost.</li>
      <li><strong>Check who owns your data.</strong> Ask whether your drawings are used to train AI models and
      whether you can export your rate card and quote history. (${SITE_NAME}: never used for training,
      and your rate card exports as a spreadsheet.)</li>
    </ol>
    <p class="fineprint">Product names belong to their owners. ${PUBLISHER} is not affiliated with any of them.
    Descriptions are from each product's public listings and may be out of date; tell us at
    <a class="link" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> if one is wrong and we will fix it.</p>
  </div>
</section>
${ctaBand(ctx, "Try it on last month's RFQs", open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at a search estimators and owners make ("machine shop hourly rate", "how to calculate
 * CNC shop rate"). Method only: every figure is from the made-up shop in ./shop-rate, computed there,
 * and labelled as made up. No industry averages are quoted, since we have no source we can cite for them.
 */
export function shopRatePage(ctx: RenderContext): Html {
  const e = EXAMPLE;
  const r = shopRate(e);
  const tended = shopRate({ ...e, machinesPerOperator: 2 });
  const naive = shopRate({ ...e, billableHoursPerYear: e.paidHoursPerYear });
  const pct = (f: number) => `${Math.round(f * 100)}%`;
  const pct1 = (f: number) => `${Math.round(f * 10000) / 100}%`;
  const byHours = UTILISATION_HOURS.map((h) => ({
    h,
    r: shopRate({ ...e, billableHoursPerYear: h }),
  }));
  const rows: [string, string, string][] = [
    [
      "Machine ownership",
      `(${usd(e.machinePrice, false)} − ${usd(e.resaleValue, false)} resale) ÷ ${e.yearsOfUse} years`,
      `${usd(r.ownershipPerYear, false)} a year`,
    ],
    [
      "Running the machine",
      "maintenance, tooling, coolant, power",
      `${usd(e.runningCostPerYear, false)} a year`,
    ],
    [
      "Its share of overhead",
      "rent, insurance, office, software",
      `${usd(e.overheadSharePerYear, false)} a year`,
    ],
    [
      "Machine and overhead",
      `${usd(r.machineAndOverheadPerYear, false)} ÷ ${e.billableHoursPerYear.toLocaleString("en-US")} billable hours`,
      `${usd(r.machinePerBillableHour)} an hour`,
    ],
    [
      "Operator, per paid hour",
      `${usd(e.operatorWage)} wage + ${pct(e.laborBurden)} taxes, insurance and benefits`,
      `${usd(r.operatorPerPaidHour)} an hour`,
    ],
    [
      "Operator, per billable hour",
      `${usd(r.operatorPerPaidHour)} × ${e.paidHoursPerYear.toLocaleString("en-US")} paid ÷ ${e.billableHoursPerYear.toLocaleString("en-US")} billable`,
      `${usd(r.operatorPerBillableHour)} an hour`,
    ],
    [
      "Cost of a billable hour",
      "machine and overhead + operator",
      `${usd(r.costPerBillableHour)} an hour`,
    ],
    [
      `Rate at a ${pct(e.margin)} margin`,
      `${usd(r.costPerBillableHour)} ÷ (1 − ${e.margin})`,
      `${usd(r.rateAtMargin)} an hour`,
    ],
  ];
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to work out a machine shop hourly rate</h1>
    <p class="lead">The hourly rate on a quote has to pay for the machine, the operator, the building and a
    profit, out of the hours a customer actually pays for. Here is a method that starts from your own
    books, a worked example, and the mistakes that make a rate too low.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>The method in five steps</h2>
    <ol>
      <li><strong>What the machine costs you each year.</strong> Take the installed price, subtract what you
      expect to sell it for, and divide by the years you will run it. Add a year of maintenance, tooling,
      coolant and power for that machine. If you financed it, the interest belongs here too. Power is
      hours run × average draw in kW (well under the nameplate) × your price per kWh; the US average
      commercial price was ${US_COMMERCIAL_POWER_CENTS.value}¢ in September 2026
      (<a class="link" href="${US_COMMERCIAL_POWER_CENTS.url}" rel="nofollow">${US_COMMERCIAL_POWER_CENTS.label}</a>,
      read ${US_COMMERCIAL_POWER_CENTS.read}), and states differ a lot, so use your own bill.</li>
      <li><strong>Its share of overhead.</strong> Rent, insurance, utilities, the office, the estimator, software
      and everything else that does not belong to one machine, split across your machines. Splitting by
      floor space or by the hours each runs is fairer than an even split when machines differ a lot.</li>
      <li><strong>Billable hours, honestly counted.</strong> Not the hours the doors are open: the hours the
      machine spends on work a customer pays for. Setups you don't charge, maintenance, prove-outs, scrap
      remakes and idle time all come out. Your job records are the best source; a guess here moves the
      rate more than any other number.</li>
      <li><strong>The operator.</strong> Wage plus payroll taxes, workers' comp, insurance and benefits gives
      the cost of a paid hour. The employer's Social Security and Medicare alone are
      ${pct1(EMPLOYER_FICA.value)} of wages (<a class="link" href="${EMPLOYER_FICA.url}" rel="nofollow">${EMPLOYER_FICA.label}</a>,
      read ${EMPLOYER_FICA.read}); your payroll reports give the rest as a percentage. The operator is paid for more hours than the machine bills, so spread the
      whole paid year over the billable hours. One operator tending two machines splits that cost between them.</li>
      <li><strong>Add the profit.</strong> Divide the cost of a billable hour by one minus your margin. A 20%
      margin means dividing by 0.8, which is not the same as adding 20%.</li>
    </ol>

    <h2>A worked example</h2>
    <p>One 3-axis mill, one operator, one shift. <strong>Every number here is made up to show the
    arithmetic</strong>; they are not typical figures for any region or trade. Use your own.</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">Made-up shop: ${e.paidHoursPerYear.toLocaleString("en-US")} paid operator hours, of which the mill bills ${e.billableHoursPerYear.toLocaleString("en-US")} (${pct(r.utilisation)}).</caption>
        <thead><tr><th scope="col">Line</th><th scope="col">Worked out as</th><th scope="col">Amount</th></tr></thead>
        <tbody>
          ${rows.map((row) => html`<tr><th scope="row">${row[0]}</th><td>${row[1]}</td><td>${row[2]}</td></tr>`)}
        </tbody>
      </table>
    </div>
    <p>Two variations on the same shop show which inputs matter most:</p>
    <ul>
      <li>If the operator tends two such mills, each mill carries half the operator and its cost falls from
      ${usd(r.costPerBillableHour)} to ${usd(tended.costPerBillableHour)} an hour.</li>
      <li>Divide by every paid hour instead of billable hours (the common shortcut of about 2,000 hours a
      year) and the cost comes out at ${usd(naive.costPerBillableHour)} an hour: ${usd(r.costPerBillableHour - naive.costPerBillableHour)} an hour short, on every hour you bill.</li>
    </ul>

    <h2>Utilization moves the rate most</h2>
    <p>The same made-up mill and costs, billing more or fewer of the operator's ${e.paidHoursPerYear.toLocaleString("en-US")} paid hours:</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">Only billable hours change; the margin stays ${pct(e.margin)}.</caption>
        <thead><tr><th scope="col">Billable hours</th><th scope="col">Utilization</th><th scope="col">Cost an hour</th><th scope="col">Rate at ${pct(e.margin)} margin</th></tr></thead>
        <tbody>
          ${byHours.map(
            ({ h, r: v }) =>
              html`<tr><th scope="row">${h.toLocaleString("en-US")}${h === e.billableHoursPerYear ? " (the example)" : ""}</th><td>${pct(v.utilisation)}</td><td>${usd(v.costPerBillableHour)}</td><td>${usd(v.rateAtMargin)}</td></tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>Almost every cost is fixed for the year, so each hour you cannot bill is paid for by the hours you
    can. A rate set for a busy year loses money in a slow one; set it on the utilization your job records
    show, and rework it when the backlog changes.</p>

    <h2>Mistakes that make a rate too low</h2>
    <ul>
      <li><strong>Counting open hours as billable.</strong> The step above: the rate is only as good as the
      billable-hours figure, so check it against last year's jobs.</li>
      <li><strong>One rate for every machine.</strong> A 5-axis machine and a manual lathe cost very different
      amounts to own. A blended rate overprices the simple work you lose and underprices the complex work
      you win.</li>
      <li><strong>Mixing up margin and markup.</strong> In the example a 20% markup gives
      ${usd(r.rateAtSameMarkup)} an hour, a 20% margin ${usd(r.rateAtMargin)}. Decide which one your
      targets mean.</li>
      <li><strong>Leaving setup in the hourly rate.</strong> Setup time is real machine time. Charging it as its
      own line, or at its own rate, keeps small runs from being priced like large ones.</li>
      <li><strong>Never revisiting it.</strong> Wages, rent and power change. Rework the rate when they do,
      and at least once a year.</li>
    </ul>

    <h2>Where the rate goes next</h2>
    <p>A rate is half of a quote; the other half is how long the part takes
    (<a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to quote a machining job</a>,
    with this rate in a worked example). In ${SITE_NAME} each machine
    on your rate card has its own hourly rate and, if you want one, a separate setup rate. A quote line is
    then the time on each machine at that machine's rate, plus material, outside processes, minimums and
    your markup, with every figure showing the rate it used. You can
    <a class="link" href="${href(ctx, "/how-it-works")}">see how a quote is built</a> or import your
    existing rate sheet from a spreadsheet.</p>
    <p class="fineprint">This page explains a common costing method. It is not accounting, tax or financial
    advice; your accountant can tell you how depreciation, financing and overhead are treated in your own
    books, and those may differ from the simple straight-line figures used here.</p>
  </div>
</section>
${ctaBand(ctx, "Put your rates on a rate card", ctx.launch.open ? "The Early access plan is free and needs no card. Enter each machine's rate once and quote real RFQs from it." : "Early access is free and asks only about your shop.")}`;
}

export interface Faq {
  q: string;
  a: string;
}

/** The FAQ for a launch state (the page and its FAQPage JSON-LD are built from the same list). */
export function faqs(launch: Launch): readonly Faq[] {
  const from = formatUsd(Math.min(...PLANS.map((p) => p.monthlyPrice)));
  if (!launch.open) return [CLOSED_TODAY, ...CORE_FAQS(launch), CLOSED_ERP, closedCost(from), WHO];
  return [openToday(launch), ...CORE_FAQS(launch), openErp(launch), openCost(launch, from), WHO];
}

const CLOSED_TODAY: Faq = {
  q: `Can I use ${SITE_NAME} today?`,
  a: `It's in development. Shops can request free early access and try it on their own RFQs as it comes together; there's nothing to buy yet.`,
};

function openToday(launch: Launch): Faq {
  return {
    q: `Can I use ${SITE_NAME} today?`,
    a: `Yes. Sign up free at ${appLink(launch, "/sign-up")}. The Early access plan covers up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month for ${EARLY_ACCESS_PLAN.seats} people, with no card. It prices the parts you enter, and what it measures from STEP, IGES, STL and DXF files, from your rate card, builds the quote PDF, emails it when your estimator sends it, and keeps the won/lost log.${launch.aiReading ? "" : ` ${AI_OFF}`}`,
  };
}

const CLOSED_ERP: Faq = {
  q: "Does it connect to my ERP or quoting system?",
  a: "Not yet. At first you'll download the quote or copy it across. Tell us which system you use on the early-access form; that decides which connection gets built first.",
};

function openErp(_launch: Launch): Faq {
  return {
    q: "Does it connect to my ERP or quoting system?",
    a: `Not yet in the hosted app: download the quote PDF or copy it across. A QuickBooks Online connection, which turns a won quote into an invoice, is built and switches on once Intuit approves it. Tell us which system you use at ${CONTACT_EMAIL}; that decides what gets connected next.`,
  };
}

function closedCost(from: string): Faq {
  return {
    q: "What will it cost?",
    a: `Early access is free. Proposed plans start at ${from} a month, priced from what it costs to run. Nobody is moved onto a paid plan without choosing it.`,
  };
}

function openCost(launch: Launch, from: string): Faq {
  return {
    q: "What does it cost?",
    a: `The Early access plan is free, with no card. Paid plans start at ${from} a month, priced from what it costs to run${launch.paidPlans ? "" : "; they are not on sale yet"}. Nobody is moved onto a paid plan without choosing it.`,
  };
}

const WHO: Faq = {
  q: "Who is building it?",
  a: `${PUBLISHER}, a small software company that also makes Grant Autopilot for nonprofits.`,
};

const CORE_FAQS = (launch: Launch): Faq[] => [
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
    a: `${launch.aiReading ? "" : "The STEP, IGES, STL and DXF measurements work today; reading email text and PDF drawings with AI is not switched on in the hosted app yet. "}RFQ email text and PDF drawings, including scans, plus STEP and DXF files. A STEP solid gives the blank size and, with your machine's measured removal rate, a roughing time; with your seconds per hole and, if you enter one, your drill feed for each hole's depth, a drilling time that counts a counterbored hole once, flags holes deeper than 3× their diameter and leaves bores over 1 in to you; tick which hole sizes are threaded and, with your seconds per tapped hole, it adds a tapping time. A DXF flat pattern gives a laser, waterjet or plasma cutting time from its cut length and pierces at your cut speed (one per machine, or your own speed for each material and thickness from your cut charts), and a press-brake time from its bend lines; on a material sold by the sheet, with your sheet size and nest gap, it counts how many flat blanks fit on one sheet (a rectangular nest, so a nesting program may fit more, never fewer). An IGES solid gives the blank size and hole locations like a STEP file (no volume: send STEP for that). An STL mesh gives its size and, when closed, its volume; an STL carries no units, so your estimator picks millimetres or inches. Native SolidWorks files are not measured yet.`,
  },
  {
    q: "What happens when a drawing is unclear?",
    a: "The value is flagged for your estimator with the drawing page it came from. It is never filled in with a guess.",
  },
  {
    q: "Will it send quotes to my customers?",
    a: "No. Your estimator reviews and approves every quote and sends it themselves: by email from the app, as a PDF, or copied into your own email or ERP.",
  },
  {
    q: "Will you use my drawings to train AI models?",
    a: "No. Your drawings, rates and quotes are used only to quote for your shop. They are never used to train AI models and never shared with another shop.",
  },
  {
    q: "Can I send CUI or export-controlled (ITAR/EAR) drawings?",
    a: "Not during early access: it isn't set up for controlled data. Use it only for commercial RFQs. The page for CMMC-conscious shops explains why.",
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
    ${faqs(ctx.launch).map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}
    <p>Something else? Email <a class="link" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  </div>
</section>
${ctaBand(ctx, "Try it on your own RFQs", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free while it's in development.")}`;
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

export function privacyPage(ctx: RenderContext): Html {
  if (ctx.launch.open) return sitePrivacyPage(ctx);
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
    <p>In a database on Cloudflare, which hosts this site. The site sets no tracking cookies; its only
    third-party script is Cloudflare's cookieless Web Analytics, which counts visits.</p>
    <h2>How long, and how to remove it</h2>
    <p>Until early access ends or you ask us to delete it, whichever comes first. Email
    <a class="link" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from the address you signed up with
    and we'll delete your request.</p>
    <h2>Who we are</h2>
    <p>${PUBLISHER}.</p>
  </div>
</section>`;
}

/** The open site has no forms: it stores nothing, and the app's own policy covers the app. */
function sitePrivacyPage(ctx: RenderContext): Html {
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Privacy</p>
    <h1>Site privacy notice</h1>
    <p class="lead">These pages have no forms and set no cookies, so they store nothing that identifies
    you. Visits are counted by cookieless Cloudflare Web Analytics.</p>
  </div>
</section>
<section class="band">
  <div class="container narrow prose">
    <h2>The app has its own policy</h2>
    <p>When you sign up, ${SITE_NAME} stores your account, your shop's rates, RFQs, files and quotes. What
    it keeps, why and for how long is in its
    <a class="link" href="${appLink(ctx.launch, "/legal/privacy")}">privacy policy</a>, alongside the
    <a class="link" href="${appLink(ctx.launch, "/legal/terms")}">terms of service</a>.</p>
    <h2>Hosting</h2>
    <p>The site is served by Cloudflare, which, like any web host, sees the requests your browser
    makes to it.</p>
    <h2>Visit counts</h2>
    <p>Like the rest of marisstella.app, these pages load Cloudflare Web Analytics, which counts page
    views, the page you came from and how fast pages load. It sets no cookies and keeps no identifier for
    you, so the counts are aggregate. Blocking scripts from <code>static.cloudflareinsights.com</code>
    stops it and the pages still work. The site's
    <a class="link" href="https://marisstella.app/privacy/">privacy policy</a> has the details.</p>
    <h2>Earlier early-access requests</h2>
    <p>If you asked for early access through an earlier form and want your request deleted, email
    <a class="link" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from the address you used.</p>
    <h2>Who we are</h2>
    <p>${PUBLISHER}.</p>
  </div>
</section>`;
}

/**
 * A guide aimed at the search estimators and owners make when they start quoting or doubt their
 * quotes ("how to quote CNC machining", "machining quote formula", "how to price a machined part").
 * Method plus one made-up job, priced in ./quote-example to the cent the app's engine gives (checked
 * by apps/jobshop-quote/test/unit/site-quote-example.test.ts). No industry figures are quoted.
 */
export function quoteGuidePage(ctx: RenderContext): Html {
  const e = QUOTE_EXAMPLE;
  const r = priceExample(e);
  const [one, ten, hundred] = r.breaks;
  if (!one || !ten || !hundred)
    throw new Error("the quoting guide example quotes three quantities");
  const noFallout = priceExample({ ...e, falloutBps: 0 });
  const hundredNoFallout = noFallout.breaks[2];
  if (!hundredNoFallout) throw new Error("the quoting guide example quotes three quantities");
  const rate = usdCents(e.hourlyRateCents);
  const pctBps = (bps: number) => `${bps / 100}%`;
  const lines: [string, (b: (typeof r.breaks)[number]) => string][] = [
    ["Parts started", (b) => b.starts.toLocaleString("en-US")],
    ["Material", (b) => usdCents(b.materialCents)],
    ["Setup", (b) => usdCents(b.setupCents)],
    ["Run time", (b) => usdCents(b.runCents)],
    ["Anodize (outside)", (b) => usdCents(b.finishingCents)],
    ["Cost", (b) => usdCents(b.costCents)],
    ["Markup", (b) => usdCents(b.markupCents)],
    ["Price each", (b) => usdCents(b.unitPriceCents)],
    ["Line total", (b) => usdCents(b.totalCents)],
  ];
  const setupShare = (b: (typeof r.breaks)[number]) =>
    `${Math.round((b.setupCents / b.quantity / b.unitPriceCents) * 100)}%`;
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to quote a CNC machining job</h1>
    <p class="lead">A machining quote is a handful of numbers added up the same way every time: material,
    setup, run time, outside processes and your markup, priced at each quantity the customer asks for.
    Here is the method, a worked example at 1, 10 and 100 parts, and the mistakes that lose money on jobs
    you win.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>The method in six steps</h2>
    <ol>
      <li><strong>Read the RFQ for what changes the price.</strong> Material and temper, quantities,
      tolerances tighter than your usual, finishes and platings, certifications, inspection reports and the
      delivery date. Anything missing is a question to the customer, not a guess.</li>
      <li><strong>Price the material from the blank, not the part.</strong> Size the stock you will
      actually cut: the part's envelope plus facing and clamping allowance, rounded to a size you can buy.
      Weight times price per pound, plus a share for saw kerf and drop, or the price of a whole bar or
      plate when that is how you buy it. Keep the supplier's minimum charge. (The
      <a class="link" href="${href(ctx, "/machining-material-cost")}">material cost guide</a> works one
      part through all four ways of buying stock.)</li>
      <li><strong>List the operations and time each one.</strong> For each setup, the minutes to load the
      program, set work offsets, touch off tools and run a first article; for each part, the cycle time
      plus loading and deburring. Programming is real time too: count it once per job as a setup-only
      operation. To build the cycle time up from feeds, removal rate and holes, see
      <a class="link" href="${href(ctx, "/how-to-estimate-cnc-machining-time")}">how to estimate CNC
      machining time</a>.</li>
      <li><strong>Price time at that machine's rate.</strong> Setup minutes ÷ 60 × rate once per lot, cycle
      minutes ÷ 60 × rate for every part started. A rate built from your own costs is the foundation
      (<a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">how to work one out</a>).</li>
      <li><strong>Add outside processes with their lot minimums.</strong> Anodize, plating, heat treat and
      passivation vendors usually charge per part with a minimum per batch, and for small lots the minimum
      is the price.</li>
      <li><strong>Plan for scrap, add markup, and quote every quantity.</strong> Start enough parts to ship
      the order good, add your markup on material and purchased services, apply a minimum per line, and
      repeat the whole sum at each quantity break, since setup and minimums spread differently at each.</li>
    </ol>

    <h2>A worked example</h2>
    <p>A ${e.partName} in ${e.materialName}, two milling setups and a deburr, anodized by a vendor.
    <strong>Every number here is made up to show the arithmetic</strong>; they are not typical prices,
    times or rates for any region or trade. Use your own.</p>
    <ul>
      <li><strong>Blank:</strong> ${e.blank.lengthIn} × ${e.blank.widthIn} × ${e.blank.thicknessIn} in
      at ${e.densityLbPerIn3} lb/in³ = ${r.blankWeightLb.toFixed(2)} lb, at ${usdCents(e.pricePerLbCents)}
      a pound plus ${pctBps(e.scrapBps)} for kerf and facing, with a ${usdCents(e.materialMinChargeCents)}
      minimum.</li>
      <li><strong>Time on the ${e.machineName}</strong> at ${rate} an hour (the rate the
      <a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">hourly rate guide</a> works out,
      profit included, so labor carries no further markup):
        <ul>
          ${e.operations.map(
            (o) =>
              html`<li>${o.label}: ${o.setupMinutes} min setup, ${o.cycleMinutesPerPart} min per part</li>`,
          )}
        </ul>
        ${r.setupMinutes} setup minutes for the lot and ${r.cycleMinutesPerPart} minutes per part.</li>
      <li><strong>${e.finishingName}:</strong> ${usdCents(e.finishingPerPartCents)} a part, minimum
      ${usdCents(e.finishingLotChargeCents)} a lot.</li>
      <li><strong>Fallout:</strong> ${pctBps(e.falloutBps)} of parts started are expected to scrap, so
      each lot starts enough to ship the order good.</li>
      <li><strong>Markup:</strong> ${pctBps(e.materialMarkupBps)} on material and on the outside service;
      a ${usdCents(e.minimumLineCents)} minimum per line.</li>
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The made-up bracket at three quantities. Each component is rounded to the cent, then summed; the price each is rounded up to the cent.</caption>
        <thead><tr><th scope="col">Line</th>${r.breaks.map((b) => html`<th scope="col">${b.quantity.toLocaleString("en-US")} ${b.quantity === 1 ? "part" : "parts"}</th>`)}</tr></thead>
        <tbody>
          ${lines.map(
            ([label, cell]) =>
              html`<tr><th scope="row">${label}</th>${r.breaks.map((b) => html`<td>${cell(b)}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>What the table shows:</p>
    <ul>
      <li><strong>Setup is the price of a small order.</strong> The same ${usdCents(one.setupCents)} of
      setup is ${setupShare(one)} of the price of one part, ${setupShare(ten)} at ten and ${setupShare(hundred)}
      at a hundred. That is why the price each falls from ${usdCents(one.unitPriceCents)} to
      ${usdCents(ten.unitPriceCents)} to ${usdCents(hundred.unitPriceCents)}.</li>
      <li><strong>Minimums decide the small lots.</strong> At one and ten parts the anodizer's
      ${usdCents(e.finishingLotChargeCents)} lot minimum is the whole finishing charge, and one part's
      material is the ${usdCents(e.materialMinChargeCents)} minimum, not the few dollars the metal weighs.</li>
      <li><strong>Fallout is not free on small lots.</strong> At ${pctBps(e.falloutBps)} expected fallout,
      shipping one good part means starting ${one.starts}, and shipping a hundred means starting
      ${hundred.starts}. Leave fallout out and the hundred-part line comes to
      ${usdCents(hundredNoFallout.totalCents)} instead of ${usdCents(hundred.totalCents)}:
      ${usdCents(hundred.totalCents - hundredNoFallout.totalCents)} you would otherwise pay for yourself
      when the scrap happens.</li>
    </ul>

    <h2>Mistakes that lose money on jobs you win</h2>
    <ul>
      <li><strong>Pricing from the finished part.</strong> The customer pays for the blank you cut, not the
      metal left in the part. Price the stock size you will buy.</li>
      <li><strong>Folding setup into the run rate.</strong> A per-part price that hides setup is right at one
      quantity only. Price setup once per lot and the breaks work out by themselves.</li>
      <li><strong>Forgetting the time that isn't cutting.</strong> Programming, first-article inspection,
      deburring, part marking and paperwork take machine or operator time on every job.</li>
      <li><strong>Quoting a reorder at the first order's price.</strong> A repeat job with a proven program
      and fixtures has less setup; a reorder at a smaller quantity may need a higher price each, not the old one.</li>
      <li><strong>No record of how the price was built.</strong> When a customer asks why the price changed,
      or a job loses money, the basis of every figure is what lets you answer. Keep it with the quote.</li>
      <li><strong>Never comparing quotes with actual jobs.</strong> Check the estimated hours against the
      traveler on jobs you win. Times that are always short are a rate problem in disguise.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>${SITE_NAME} prices a quote line exactly this way. Your rate card holds each machine's hourly rate
    (and a setup rate if you use one), your materials by the pound, by the foot or by the stock piece,
    your finishing and outside services with their lot minimums, your markups and line minimum. The
    estimator enters the blank, the operations and their times, and the quantity breaks; the price at each
    break follows, every figure showing the rate it came from, and a line missing a time or a material is
    blocked rather than priced as if it were free. The example above is priced to the cent the app gives
    for the same inputs, checked by a test in its code. You can
    <a class="link" href="${href(ctx, "/how-it-works")}">see how a quote is built</a> or
    <a class="link" href="${href(ctx, "/compare")}">compare it with other quoting software</a>. Laser,
    plasma or press-brake work: see <a class="link" href="${href(ctx, "/how-to-quote-sheet-metal")}">how to
    quote sheet metal and laser cut parts</a>; welded frames and fabrications:
    <a class="link" href="${href(ctx, "/how-to-quote-welding")}">how to quote welding jobs</a>. What to put on the quote you send, with a template to
    download: <a class="link" href="${href(ctx, "/machine-shop-quote-template")}">machine shop quote
    template</a>. A customer who needs the parts sooner:
    <a class="link" href="${href(ctx, "/how-to-price-a-rush-job")}">how to price a rush job</a>.</p>
    <p class="fineprint">This page explains a common costing method. It is not accounting, tax or
    financial advice, and the prices, times and rates in it are made up. Check every quote before you send
    it.</p>
  </div>
</section>
${ctaBand(ctx, "Quote your next RFQ this way", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches fabrication shops make ("how to quote laser cutting", "sheet metal
 * quoting", "how to price sheet metal parts"). Method plus one made-up laser-cut, bent and
 * powder-coated bracket, priced in ./sheet-metal-example to the cent the app's DXF suggestions,
 * nester and costing engine give (apps/jobshop-quote/test/unit/site-sheet-metal-example.test.ts).
 * No industry figures are quoted.
 */
export function sheetMetalGuidePage(ctx: RenderContext): Html {
  const e = SHEET_EXAMPLE;
  const r = priceSheetExample(e);
  const [small, mid, large] = r.breaks;
  if (!small || !mid || !large)
    throw new Error("the sheet-metal guide example quotes three quantities");
  const blank = flatBlank(e);
  const pctBps = (bps: number) => `${bps / 100}%`;
  const rateOf = (i: number) => usdCents(e.machines[i]?.hourlyRateCents ?? 0);
  const machineName = (i: number) => e.machines[i]?.name ?? "";
  const lines: [string, (b: (typeof r.breaks)[number]) => string][] = [
    ["Parts started", (b) => b.starts.toLocaleString("en-US")],
    ["Sheets", (b) => b.sheets.toLocaleString("en-US")],
    ["Material", (b) => usdCents(b.materialCents)],
    ["Setup and programming", (b) => usdCents(b.setupCents)],
    ["Run time", (b) => usdCents(b.runCents)],
    ["Powder coat (outside)", (b) => usdCents(b.finishingCents)],
    ["Cost", (b) => usdCents(b.costCents)],
    ["Markup", (b) => usdCents(b.markupCents)],
    ["Price each", (b) => usdCents(b.unitPriceCents)],
    ["Line total", (b) => usdCents(b.totalCents)],
  ];
  const lastSheetParts = large.starts - (large.sheets - 1) * e.partsPerSheet;
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to quote sheet metal and laser cut parts</h1>
    <p class="lead">A sheet-metal quote comes from the flat pattern: how long the cut path is, how many
    times the head pierces, how many bends, and how many parts nest on a sheet you buy whole. Here is the
    method, a worked example at ${small.quantity}, ${mid.quantity} and ${large.quantity} parts, and the
    mistakes that lose money on jobs you win.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>The method in six steps</h2>
    <ol>
      <li><strong>Read the RFQ for what changes the price.</strong> Material, gauge and finish,
      quantities, hardware to insert, weld or powder-coat requirements, flatness and tolerance callouts,
      certifications and the delivery date. A missing gauge or grade is a question to the customer, not a
      guess.</li>
      <li><strong>Measure the flat pattern.</strong> From the DXF: the blank's overall size, the total
      cut length (outline plus every hole and slot), the number of pierces (one per closed contour) and the
      bend lines. A STEP model of a bent part has to be unfolded first; quote from the flat.</li>
      <li><strong>Nest the blank and count sheets.</strong> How many blanks fit on the sheet size you
      stock at the gap your material needs. Material is the number of sheets the lot uses, bought whole,
      unless you have a real use for the remnant.</li>
      <li><strong>Time the cut at your own speed for that material and gauge.</strong> Cut minutes = cut
      length ÷ cutting speed, plus pierces × pierce time. Cutting speed changes several-fold with alloy
      and thickness, so one speed per machine is wrong for most parts; use your machine's cut chart.</li>
      <li><strong>Time the bends and the rest.</strong> Seconds per bend times the bends, a brake setup
      per lot, programming and nesting once per job, deburring and inspection per part, each at that
      machine's or bench's own rate.</li>
      <li><strong>Add outside processes, plan for scrap, add markup and quote every quantity.</strong>
      Powder coat and plating carry lot minimums; start enough parts to ship the order good; repeat the
      sum at each break, since sheets, setups and minimums spread differently at each.</li>
    </ol>

    <h2>A worked example</h2>
    <p>A ${e.partName} in ${e.materialName}, laser cut, bent twice, deburred and powder coated by a vendor.
    <strong>Every number here is made up to show the arithmetic</strong>; they are not typical speeds,
    prices or rates for any machine, region or trade. Use your own.</p>
    <ul>
      <li><strong>Flat pattern</strong> (from the DXF): ${e.flat.widthIn} × ${e.flat.heightIn} in overall,
      ${e.flat.cutLengthIn} in of cut path, ${e.flat.pierceCount} pierces (the outline and six holes),
      ${e.flat.bendLines} bend lines. Rounded up to the next 1/8 in, the blank is ${blank.widthIn} ×
      ${blank.lengthIn} in.</li>
      <li><strong>Material:</strong> ${e.sheetDescription} at ${usdCents(e.sheetPriceCents)} a sheet. A
      rectangular nest at a ${e.sheet.gapIn} in gap fits ${e.partsPerSheet} blanks a sheet.</li>
      <li><strong>${machineName(e.laserMachine)}</strong> at ${rateOf(e.laserMachine)} an hour:
      ${e.laser.cutSpeedInPerMin} in/min in this gauge and ${e.laser.pierceSeconds} s a pierce, so
      ${e.flat.cutLengthIn} ÷ ${e.laser.cutSpeedInPerMin} + ${e.flat.pierceCount} × ${e.laser.pierceSeconds}
      s = ${r.cutMinutesExact.toFixed(3)} min, rounded up to ${r.cutMinutes.toFixed(2)} min a part;
      ${e.laser.setupMinutes} min to load the sheet program, plus a one-time
      ${e.otherOperations[0]?.setupMinutes ?? 0} min to program and nest the job.</li>
      <li><strong>${machineName(e.brakeMachine)}</strong> at ${rateOf(e.brakeMachine)} an hour:
      ${e.flat.bendLines} bends × ${e.brake.secondsPerBend} s = ${r.bendMinutes.toFixed(2)} min a part,
      ${e.brake.setupMinutes} min to set up the tooling and back gauge.</li>
      <li><strong>${machineName(e.otherOperations[1]?.machine ?? 2)}</strong> at
      ${rateOf(e.otherOperations[1]?.machine ?? 2)} an hour: deburr and inspect,
      ${e.otherOperations[1]?.cycleMinutesPerPart ?? 0} min a part.</li>
      <li><strong>${e.finishingName}:</strong> ${usdCents(e.finishingPerPartCents)} a part, minimum
      ${usdCents(e.finishingLotChargeCents)} a lot.</li>
      <li><strong>Fallout:</strong> ${pctBps(e.falloutBps)} of parts started are expected to scrap.</li>
      <li><strong>Markup:</strong> ${pctBps(e.materialMarkupBps)} on material,
      ${pctBps(e.outsideServiceMarkupBps)} on the outside service, none on labor (the machine rates are
      taken to hold the margin already); a ${usdCents(e.minimumLineCents)} minimum per line.</li>
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The made-up bracket at three quantities. Each component is rounded to the cent, then summed; the price each is rounded up to the cent.</caption>
        <thead><tr><th scope="col">Line</th>${r.breaks.map((b) => html`<th scope="col">${b.quantity.toLocaleString("en-US")} parts</th>`)}</tr></thead>
        <tbody>
          ${lines.map(
            ([label, cell]) =>
              html`<tr><th scope="row">${label}</th>${r.breaks.map((b) => html`<td>${cell(b)}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>What the table shows:</p>
    <ul>
      <li><strong>Small lots buy a whole sheet.</strong> ${small.starts} parts need one sheet that holds
      ${e.partsPerSheet}: the ${usdCents(small.materialCents)} sheet is the material charge whether you
      cut ${small.starts} blanks or ${e.partsPerSheet}. At ${large.quantity} parts the same material is
      ${large.sheets} sheets, and the last one carries only ${lastSheetParts} parts.</li>
      <li><strong>The vendor's minimum decides the small lot.</strong> At ${small.quantity} parts the powder
      coater's ${usdCents(e.finishingLotChargeCents)} lot minimum is
      ${Math.round((small.finishingCents / small.costCents) * 100)}% of the cost; at ${large.quantity} the
      per-part charge has long passed it.</li>
      <li><strong>Fixed charges spread out.</strong> The same ${usdCents(small.setupCents)} of setup and
      programming, the first sheet and the coater's minimum are shared by ${small.quantity},
      ${mid.quantity} or ${large.quantity} parts. Together they are why the price each falls from
      ${usdCents(small.unitPriceCents)} to ${usdCents(mid.unitPriceCents)} to
      ${usdCents(large.unitPriceCents)}, while the run time per part stays the same.</li>
      <li><strong>Laser time is short; it still adds up.</strong> ${r.cutMinutes.toFixed(2)} min a part is
      ${usdCents(Math.round((r.cutMinutes / 60) * (e.machines[e.laserMachine]?.hourlyRateCents ?? 0)))} at
      this rate. Leave out the pierces and the cut drops to
      ${(e.flat.cutLengthIn / e.laser.cutSpeedInPerMin).toFixed(3)} min; on thick plate, where a pierce
      takes seconds, the pierces can be most of the cut.</li>
    </ul>

    <h2>Mistakes that lose money on jobs you win</h2>
    <ul>
      <li><strong>Pricing material by the part's area.</strong> You buy sheets. Unless the skeleton and
      remnant really go back on the rack and get used, the lot pays for the sheets it consumes.</li>
      <li><strong>One cutting speed for everything.</strong> A speed from thin mild steel will badly
      under-time stainless or thick plate. Keep speeds per material and gauge.</li>
      <li><strong>Forgetting pierces.</strong> A part with many small holes can spend more time piercing
      than cutting, especially in thicker material.</li>
      <li><strong>Leaving out programming and nesting.</strong> It is real time on every new part number,
      once per job, not per part.</li>
      <li><strong>Ignoring the brake setup.</strong> A new tool change and back-gauge setup is the same on
      ten parts or a thousand; price it once per lot.</li>
      <li><strong>Quoting from a 3D model nobody unfolded.</strong> The flat pattern sets the blank, the cut
      length and the bends; check the bend allowance your brake actually gives.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>${SITE_NAME} reads an ASCII DXF flat pattern attached to the RFQ by fixed rules in its own code,
    with no AI involved: the overall size, the cut length, the pierces and the bend lines drawn on a layer
    named for bends. On your rate card each machine can carry a cutting speed, a pierce time and seconds
    per bend, and a cutting machine can carry its own speed per material and gauge (typed, or imported
    from your cut chart as a spreadsheet). A quote line then starts with a "Cut from DXF" and a "Bend from
    DXF" operation timed exactly as above, a blank sized from the flat pattern and, for a material you buy
    by the sheet, the parts per sheet from a rectangular nest at your gap. Every figure shows the rate it
    came from, the estimator can change any of them, and nothing is suggested when the drawing was read
    with low confidence or two machines could run the job. The example above is priced to the cent the
    app gives for the same inputs, checked by a test in its code.</p>
    <p>No account needed to try the arithmetic: the free
    <a class="link" href="https://marisstella.app/dxf-nesting/">DXF nesting tool</a> nests your parts in the
    browser and prices the nest from your rates. For machined parts, see
    <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to quote a CNC machining job</a>;
    for welded assemblies, <a class="link" href="${href(ctx, "/how-to-quote-welding")}">how to quote
    welding and fabrication jobs</a>; for what goes on the quote you send, the
    <a class="link" href="${href(ctx, "/machine-shop-quote-template")}">machine shop quote template</a>.</p>
    <p class="fineprint">This page explains a common costing method. It is not accounting, tax or
    financial advice, and the speeds, prices, times and rates in it are made up. Check every quote before
    you send it.</p>
  </div>
</section>
${ctaBand(ctx, "Quote your next sheet-metal RFQ this way", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches fabrication shops make ("how to quote welding jobs", "how to estimate
 * welding cost", "welding cost per inch", "fabrication quote"). Method plus one made-up square-tube
 * cart frame: arc time from the weld length and travel speed, welder time from the operator factor,
 * filler wire from the fillet size, priced in ./welding-example to the cent the app's costing engine
 * gives (apps/jobshop-quote/test/unit/site-welding-example.test.ts). No industry figures are quoted.
 */
export function weldingGuidePage(ctx: RenderContext): Html {
  const e = WELD_EXAMPLE;
  const r = priceWeldingExample(e);
  const [small, mid, large] = r.breaks;
  if (!small || !mid || !large)
    throw new Error("the welding guide example quotes three quantities");
  const pctBps = (bps: number) => `${bps / 100}%`;
  const rateOf = (i: number) => usdCents(e.machines[i]?.hourlyRateCents ?? 0);
  const machineName = (i: number) => e.machines[i]?.name ?? "";
  const weldRate = e.machines[e.weld.machine]?.hourlyRateCents ?? 0;
  const weldLaborCents = Math.round((r.weldMinutes / 60) * weldRate);
  const arcOnlyCents = Math.round((r.arcMinutes / 60) * weldRate);
  const grind = e.otherOperations[0];
  const firstArticle = e.otherOperations[1];
  const lines: [string, (b: (typeof r.breaks)[number]) => string][] = [
    ["Material (tube)", (b) => usdCents(b.materialCents)],
    ["Setup, fixture and first article", (b) => usdCents(b.setupCents)],
    ["Run time", (b) => usdCents(b.runCents)],
    ["Wire and gas", (b) => usdCents(b.extrasCents)],
    ["Powder coat (outside)", (b) => usdCents(b.finishingCents)],
    ["Cost", (b) => usdCents(b.costCents)],
    ["Markup", (b) => usdCents(b.markupCents)],
    ["Price each", (b) => usdCents(b.unitPriceCents)],
    ["Line total", (b) => usdCents(b.totalCents)],
  ];
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to quote welding and fabrication jobs</h1>
    <p class="lead">A weldment quote is mostly time: cutting and fitting the pieces, building the fixture,
    and the welder's hours, of which the arc is lit for only part. Here is the method, a worked example at
    ${small.quantity}, ${mid.quantity} and ${large.quantity} frames, and the mistakes that lose money on
    jobs you win.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>The method in six steps</h2>
    <ol>
      <li><strong>Read the drawing for what changes the price.</strong> Material and section sizes, every
      weld symbol (type, size, length, all-around), the process and any welding code or procedure it
      calls for, welder qualifications, weld inspection or testing, flatness and finish. A missing weld size
      or code is a question to the customer, not a guess.</li>
      <li><strong>Make the cut list.</strong> Each piece, its length, end cuts (square, miter, cope) and
      section. Add the lengths per section and allow for kerf, squaring cuts and the drop at the end of
      each stick.</li>
      <li><strong>Add up the weld.</strong> Total inches of each weld size from the symbols. Arc minutes =
      weld length ÷ travel speed for that size, position and process.</li>
      <li><strong>Turn arc time into welder time.</strong> Welder minutes = arc minutes ÷ operator factor,
      the share of the welder's time with the arc lit. The rest is positioning, changing angles, cleaning
      between passes and moving the part; use the figure you measure in your own shop.</li>
      <li><strong>Price fit-up, the fixture and the rest.</strong> Fitting and tacking per part, building
      the fixture once per job, saw cuts per piece, grinding, cleaning and inspection per part, each at
      that station's own rate. Add the filler wire (from the weld metal, at your deposition efficiency)
      and shielding gas.</li>
      <li><strong>Add outside processes, markup and quote every quantity.</strong> Galvanizing, powder
      coat and paint carry lot minimums; repeat the sum at each break, since the fixture, the first
      article and the coater's minimum spread differently at each.</li>
    </ol>

    <h2>A worked example</h2>
    <p>A steel ${e.partName}: ${e.tube.pieces} pieces of ${e.tube.description}, sawn, fitted and tacked in
    a fixture, MIG welded, ground and powder coated by a vendor. <strong>Every number here is made up to
    show the arithmetic</strong>; they are not typical speeds, prices, rates or operator factors for any
    process, region or trade. Use your own.</p>
    <ul>
      <li><strong>Material:</strong> ${e.tube.pieces} pieces, ${e.tube.totalLengthIn} in of tube
      (${e.tube.totalLengthIn / 12} ft) a frame, at ${usdCents(e.pricePerFootCents)} a foot plus
      ${pctBps(e.scrapBps)} for kerf, squaring and drop: ${usdCents(small.materialCents)} a frame.</li>
      <li><strong>${machineName(e.saw.machine)}</strong> at ${rateOf(e.saw.machine)} an hour:
      ${e.tube.pieces} cuts × ${e.saw.minutesPerCut} min = ${r.sawMinutes} min a frame (load, measure,
      cut, deburr the end), ${e.saw.setupMinutes} min to set the stop and the miter.</li>
      <li><strong>Fixture, fit and tack</strong> in the ${machineName(e.weld.machine)} at
      ${rateOf(e.weld.machine)} an hour: ${e.weld.fixtureSetupMinutes} min to build the fixture once for
      the job, ${e.weld.fitUpMinutesPerPart} min a frame to load, square and tack.</li>
      <li><strong>Weld out:</strong> ${e.weld.lengthIn} in of ${e.weld.legLabel} in
      fillet at ${e.weld.travelInPerMin} in/min is ${r.arcMinutes.toFixed(2)} arc minutes. At a
      ${pctBps(e.weld.operatorFactorBps)} operator factor the welder spends ${r.arcMinutes.toFixed(2)} ÷
      ${e.weld.operatorFactorBps / 10_000} = ${r.weldMinutesExact.toFixed(3)} min, rounded up to
      ${r.weldMinutes.toFixed(2)} min a frame.</li>
      <li><strong>${machineName(grind?.machine ?? 2)}</strong> at ${rateOf(grind?.machine ?? 2)} an hour:
      grind, clean and inspect, ${grind?.cycleMinutesPerPart ?? 0} min a frame; a
      ${firstArticle?.setupMinutes ?? 0} min first-article check once per job.</li>
      <li><strong>Wire and gas:</strong> a ${e.weld.legLabel} in fillet
      is a triangle of ${(e.weld.legIn ** 2 / 2).toFixed(4)} sq in, so ${e.weld.lengthIn} in of it is
      ${r.weldMetalLb.toFixed(3)} lb of steel at ${STEEL_LB_PER_IN3} lb/cu in. At
      ${pctBps(e.depositionEfficiencyBps)} deposition efficiency that is ${r.wireLb.toFixed(3)} lb of wire
      at ${usdCents(e.wirePricePerLbCents)} a lb (${usdCents(Math.round(r.wireCents))}), plus
      ${e.gasCfh} cu ft/h of gas for ${r.arcMinutes.toFixed(2)} arc minutes, ${r.gasCf.toFixed(2)} cu ft at
      ${usdCents(e.gasPricePerCfCents)} (${usdCents(Math.round(r.gasCents))}): ${usdCents(r.consumablesCents)}
      a frame.</li>
      <li><strong>${e.finishingName}:</strong> ${usdCents(e.finishingPerPartCents)} a frame, minimum
      ${usdCents(e.finishingLotChargeCents)} a lot.</li>
      <li><strong>Markup:</strong> ${pctBps(e.materialMarkupBps)} on material and consumables,
      ${pctBps(e.outsideServiceMarkupBps)} on the outside service, none on labor (the shop rates are taken
      to hold the margin already); a ${usdCents(e.minimumLineCents)} minimum per line.</li>
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The made-up cart frame at three quantities. Each component is rounded to the cent, then summed; the price each is rounded up to the cent.</caption>
        <thead><tr><th scope="col">Line</th>${r.breaks.map((b) => html`<th scope="col">${b.quantity.toLocaleString("en-US")} ${b.quantity === 1 ? "frame" : "frames"}</th>`)}</tr></thead>
        <tbody>
          ${lines.map(
            ([label, cell]) =>
              html`<tr><th scope="row">${label}</th>${r.breaks.map((b) => html`<td>${cell(b)}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>What the table shows:</p>
    <ul>
      <li><strong>The operator factor is the biggest single assumption.</strong> Priced on arc time alone,
      the weld would be ${usdCents(arcOnlyCents)} a frame; priced on the welder's time it is
      ${usdCents(weldLaborCents)}. Guess the factor high and every frame you win loses the difference.</li>
      <li><strong>Consumables are small next to labor.</strong> Wire and gas are ${usdCents(r.consumablesCents)}
      a frame against ${usdCents(weldLaborCents)} of welding. A price built up from pounds of wire misses
      most of the cost.</li>
      <li><strong>The fixture and the coater's minimum decide the one-off.</strong> At
      ${small.quantity} frame the ${usdCents(small.setupCents)} of fixture, saw setup and first article and
      the ${usdCents(e.finishingLotChargeCents)} coating minimum are
      ${Math.round(((small.setupCents + small.finishingCents) / small.costCents) * 100)}% of the cost. At
      ${large.quantity} the same setups are ${usdCents(Math.round(large.setupCents / large.quantity))} a frame.
      That is why the price each falls from ${usdCents(small.unitPriceCents)} to
      ${usdCents(mid.unitPriceCents)} to ${usdCents(large.unitPriceCents)}.</li>
      <li><strong>At volume it is run time and tube.</strong> At ${large.quantity} frames, run time
      (${usdCents(large.runCents)}) and tube (${usdCents(large.materialCents)}) are
      ${Math.round(((large.runCents + large.materialCents) / large.costCents) * 100)}% of the cost; a
      faster fixture or a better cut list is where a lower price would come from.</li>
    </ul>

    <h2>Mistakes that lose money on jobs you win</h2>
    <ul>
      <li><strong>Pricing weld by arc time.</strong> The welder is paid for every minute, not just the
      ones with the arc lit. Measure your operator factor on real jobs and use it.</li>
      <li><strong>One travel speed for every weld.</strong> Weld size, position, process and the number of
      passes change it several-fold; a vertical or overhead weld or a multi-pass fillet is far slower than
      a flat single pass.</li>
      <li><strong>Leaving out fit-up and tacking.</strong> On small weldments it can take as long as the
      welding.</li>
      <li><strong>Forgetting the fixture.</strong> It is real time once per job, and it is the reason a
      one-off costs so much more than the tenth piece.</li>
      <li><strong>Leaving out grinding, cleanup and distortion.</strong> Weld spatter, blending and
      straightening a frame that pulled out of square all take time per part.</li>
      <li><strong>Missing a code or inspection callout.</strong> A welding procedure, qualified welders,
      or visual, dye-penetrant or other testing called out on the drawing add time and paperwork that the
      weld length alone does not show.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>${SITE_NAME} does not read weld symbols or measure weld length: you work out the times above and
    type them in. Each quote line then carries the tube from your rate card priced by the foot (the
    frame's total length as the blank length, kerf and drop as the row's scrap allowance), one operation
    per station at that machine's rate (saw, fit and tack, weld, grind), the fixture as a setup that is
    charged once per quantity break, wire and gas as an extra per part, and the powder coat as an
    outside service with its lot minimum. Every quantity break then follows, every figure showing the rate
    it came from, and a line missing a time or a material is blocked rather than priced as if it were
    free. The example above is priced to the cent the app gives for the same inputs, checked by a test in
    its code. You can <a class="link" href="${href(ctx, "/how-it-works")}">see how a quote is built</a>.</p>
    <p>For your shop rate itself, see <a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">how
    to work out a machine shop hourly rate</a>. Laser-cut and bent parts:
    <a class="link" href="${href(ctx, "/how-to-quote-sheet-metal")}">how to quote sheet metal</a>;
    machined parts: <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to quote a CNC
    machining job</a>; what goes on the quote you send: the
    <a class="link" href="${href(ctx, "/machine-shop-quote-template")}">machine shop quote template</a>.</p>
    <p class="fineprint">This page explains a common costing method. It is not accounting, tax,
    engineering or financial advice, does not say what a welding code requires, and the speeds, factors,
    prices, times and rates in it are made up. Check every quote before you send it.</p>
  </div>
</section>
${ctaBand(ctx, "Quote your next weldment this way", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches lathe shops make ("how to quote CNC turning", "how to quote lathe
 * work", "turned parts cost", "bar stock cost per part"). Method plus one made-up stainless pin: rpm
 * from surface speed, minutes per pass from the feed per revolution, roughing passes from the stock to
 * remove, parts per 12 ft bar after the cut allowance and remnant, priced in ./turning-example to the
 * cent the app's costing engine gives, with whole bars and by the length used
 * (apps/jobshop-quote/test/unit/site-turning-example.test.ts). No industry figures are quoted.
 */
export function turningGuidePage(ctx: RenderContext): Html {
  const e = TURN_EXAMPLE;
  const r = priceTurningExample(e);
  const [small, mid, large] = r.breaks;
  const [smallLen, , largeLen] = r.lengthUsedBreaks;
  if (!small || !mid || !large || !smallLen || !largeLen)
    throw new Error("the turning guide example quotes three quantities");
  const [face, rough, finish, partOff] = r.cuts;
  if (!face || !rough || !finish || !partOff) throw new Error("the turning example has four cuts");
  const pctBps = (bps: number) => `${bps / 100}%`;
  const rateOf = (i: number) => usdCents(e.machines[i]?.hourlyRateCents ?? 0);
  const machineName = (i: number) => e.machines[i]?.name ?? "";
  const deburr = e.otherOperations[0];
  const firstArticle = e.otherOperations[1];
  const barCents = (e.barLengthIn / 12) * e.pricePerFootCents;
  const radialStock = (e.barDiameterIn - e.finishDiameterIn) / 2;
  const cutMin = r.cuts.reduce((s, c) => s + c.minutes, 0);
  const [smallBars, midBars, largeBars] = r.bars;
  const cutLine = (c: (typeof r.cuts)[number], what: string) =>
    html`<li><strong>${c.label}:</strong> ${c.sfm} sfm on ${c.diameterIn} in is ${Math.round(c.rpm)} rpm;
      ${c.passes === 1 ? "" : html`${c.passes} passes × `}${c.lengthIn} in ${what} at ${c.iprIn} in/rev =
      ${c.minutes.toFixed(3)} min.</li>`;
  const lines: [string, (b: (typeof r.breaks)[number]) => string][] = [
    ["Bars pulled", (b) => String(r.bars[r.breaks.indexOf(b)] ?? "")],
    ["Material (whole bars)", (b) => usdCents(b.materialCents)],
    ["Setup and first article", (b) => usdCents(b.setupCents)],
    ["Run time", (b) => usdCents(b.runCents)],
    ["Passivation (outside)", (b) => usdCents(b.finishingCents)],
    ["Cost", (b) => usdCents(b.costCents)],
    ["Markup", (b) => usdCents(b.markupCents)],
    ["Price each", (b) => usdCents(b.unitPriceCents)],
    ["Line total", (b) => usdCents(b.totalCents)],
  ];
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to quote CNC turning and lathe parts</h1>
    <p class="lead">A turned part's quote comes down to three numbers: the cycle time, the setup, and how
    much bar the order really uses, which is the easiest of the three to undercount. Here is the
    method, a worked example at ${small.quantity}, ${mid.quantity} and ${large.quantity} pins, and the
    mistakes that lose money on jobs you win.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>The method in six steps</h2>
    <ol>
      <li><strong>Read the drawing for what changes the price.</strong> Material and bar size, the
      diameters and their tolerances, surface finish, threads, cross holes and flats (a second operation
      or live tooling), concentricity and runout callouts, and the finish or plating. A missing material
      grade or finish is a question to the customer, not a guess.</li>
      <li><strong>Pick the bar and the cut length.</strong> The smallest standard bar that cleans up the
      largest diameter. Each part takes its finished length plus the part-off tool's width and a facing
      allowance off the bar.</li>
      <li><strong>Count parts per bar.</strong> Parts per bar = (bar length − the remnant the chuck or bar
      feeder leaves) ÷ cut length, rounded down. Bars for the order = parts to start ÷ parts per bar,
      rounded up.</li>
      <li><strong>Time each cut.</strong> rpm = surface speed (sfm) × 12 ÷ (π × diameter); minutes =
      length of cut ÷ (feed per rev × rpm), times the passes. Roughing passes = radial stock to remove,
      less what you leave to finish, ÷ depth of cut, rounded up. Add facing, finishing, drilling,
      threading and the part-off, then the time between cuts: tool indexes, rapids and the bar pull, timed
      on your own machines.</li>
      <li><strong>Add setup, secondary operations and outside processes.</strong> Loading the program,
      setting tools and proving out the first part once per job; deburring, inspection, any milling
      after the lathe; plating, passivation or heat treat with their lot minimums.</li>
      <li><strong>Add fallout and markup, then quote every quantity.</strong> Start enough parts to ship
      the good ones, and repeat the sum at each break, since the setup, the first bar and the vendor's
      minimum spread differently at each.</li>
    </ol>

    <h2>A worked example</h2>
    <p>A ${e.partName}: ${e.materialName}, faced, turned from ${e.barDiameterIn} in to ${e.finishDiameterIn}
    in over ${e.turnLengthIn} in, parted off at ${e.partLengthIn} in long, deburred, inspected and
    passivated by a vendor. <strong>Every number here is made up to show the arithmetic</strong>; they are
    not recommended speeds, feeds, prices or rates for any material, machine or region. Use your own
    tooling maker's data and your own timing.</p>
    <h3>The cycle time</h3>
    <ul>
      ${cutLine(face, "radial")}
      <li><strong>Roughing passes:</strong> (${e.barDiameterIn} − ${e.finishDiameterIn}) ÷ 2 =
      ${radialStock} in of radial stock, less ${e.finishStockIn} in left to finish, is
      ${(radialStock - e.finishStockIn).toFixed(3)} in at ${e.roughDepthIn} in a pass: ${rough.passes}
      passes.</li>
      ${cutLine(rough, "long")}
      ${cutLine(finish, "long")}
      ${cutLine(partOff, "radial")}
      <li><strong>Between cuts:</strong> ${e.handlingMinutesPerPart} min a part for tool indexes, rapids
      and the bar pull. Cycle = ${cutMin.toFixed(3)} min cutting + ${e.handlingMinutesPerPart} =
      ${r.cycleMinutesExact.toFixed(3)} min, rounded up to ${r.cycleMinutes.toFixed(2)} min a part.</li>
    </ul>
    <p>The facing and part-off times are worked on the bar's diameter: on a lathe holding constant surface
    speed the spindle speeds up as the tool moves to the centre, up to the machine's limit, so a cut
    timed at the starting rpm errs long.</p>
    <h3>The bar</h3>
    <ul>
      <li><strong>Cut length:</strong> ${e.partLengthIn} in + ${e.cutAllowanceIn} in for the part-off
      tool and facing = ${r.cutLengthIn} in a part.</li>
      <li><strong>Parts per bar:</strong> ${e.barLengthIn} in bars (${e.barLengthIn / 12} ft) less a
      ${e.barRemnantIn} in remnant is ${e.barLengthIn - e.barRemnantIn} in usable ÷ ${r.cutLengthIn} in =
      ${r.partsPerBar} parts a bar.</li>
      <li><strong>Price:</strong> ${usdCents(e.pricePerFootCents)} a foot, ${usdCents(barCents)} a bar.
      With ${pctBps(e.falloutBps)} fallout, ${small.quantity} pins start ${small.starts} (${smallBars}
      bar), ${mid.quantity} start ${mid.starts} (${midBars} bars) and ${large.quantity} start
      ${large.starts} (${largeBars} bars).</li>
    </ul>
    <h3>The rest</h3>
    <ul>
      <li><strong>${machineName(e.lathe.machine)}</strong> at ${rateOf(e.lathe.machine)} an hour:
      ${e.lathe.setupMinutes} min setup, ${r.cycleMinutes.toFixed(2)} min a part.</li>
      <li><strong>${machineName(deburr?.machine ?? 1)}</strong> at ${rateOf(deburr?.machine ?? 1)} an
      hour: deburr and inspect, ${deburr?.cycleMinutesPerPart ?? 0} min a part; a
      ${firstArticle?.setupMinutes ?? 0} min first-article check once per job.</li>
      <li><strong>${e.finishingName}:</strong> ${usdCents(e.finishingPerPartCents)} a part, minimum
      ${usdCents(e.finishingLotChargeCents)} a lot.</li>
      <li><strong>Markup:</strong> ${pctBps(e.materialMarkupBps)} on material,
      ${pctBps(e.outsideServiceMarkupBps)} on the outside service, none on labor (the shop rates are taken
      to hold the margin already); a ${usdCents(e.minimumLineCents)} minimum per line.</li>
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The made-up stainless pin at three quantities, with whole bars charged. Each component is rounded to the cent, then summed; the price each is rounded up to the cent.</caption>
        <thead><tr><th scope="col">Line</th>${r.breaks.map((b) => html`<th scope="col">${b.quantity.toLocaleString("en-US")} pins</th>`)}</tr></thead>
        <tbody>
          ${lines.map(
            ([label, cell]) =>
              html`<tr><th scope="row">${label}</th>${r.breaks.map((b) => html`<td>${cell(b)}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>What the table shows:</p>
    <ul>
      <li><strong>On a short run the bar decides more than the metal in the part.</strong> ${small.quantity}
      pins use ${small.starts} × ${r.cutLengthIn} in = ${small.starts * r.cutLengthIn} in of a
      ${e.barLengthIn} in bar. Charged by the length used, the material is ${usdCents(smallLen.materialCents)}
      and the price each ${usdCents(smallLen.unitPriceCents)}; charged the whole bar, it is
      ${usdCents(small.materialCents)} and ${usdCents(small.unitPriceCents)}. Which is right depends on
      whether the rest of that bar will be used on another job soon; decide it per material, not per
      quote.</li>
      <li><strong>Setup is the price of a small order.</strong> The ${usdCents(small.setupCents)} of setup
      and first article and the ${usdCents(e.finishingLotChargeCents)} passivation minimum are
      ${Math.round(((small.setupCents + small.finishingCents) / small.costCents) * 100)}% of the cost at
      ${small.quantity} pins; at ${large.quantity} the same setup is
      ${usdCents(Math.round(large.setupCents / large.quantity))} a pin. That is why the price each falls from ${usdCents(small.unitPriceCents)} to
      ${usdCents(mid.unitPriceCents)} to ${usdCents(large.unitPriceCents)}.</li>
      <li><strong>At volume it is cycle time and bar.</strong> At ${large.quantity} pins, run time
      (${usdCents(large.runCents)}) and bar (${usdCents(large.materialCents)}) are
      ${Math.round(((large.runCents + large.materialCents) / large.costCents) * 100)}% of the cost. Each
      second off the cycle is worth ${usdCents(Math.round((1 / 60 / 60) * (e.machines[e.lathe.machine]?.hourlyRateCents ?? 0) * large.starts))}
      on this order, and whole bars matter less: priced by the length used, the ${large.quantity} would be
      ${usdCents(largeLen.unitPriceCents)} each instead of ${usdCents(large.unitPriceCents)}.</li>
    </ul>

    <h2>Mistakes that lose money on jobs you win</h2>
    <ul>
      <li><strong>Pricing the metal in the part.</strong> The part-off tool, the facing stock and the
      remnant at the end of every bar are bought too. On a short part they can be a large share of the
      bar.</li>
      <li><strong>Counting only cutting time.</strong> Tool indexes, rapids, the bar pull and the
      spindle coming up to speed are time on the machine on every part; time a real cycle and add them.</li>
      <li><strong>One roughing pass where the stock needs three.</strong> Work the passes out from the
      stock to remove and the depth your tooling takes in that material.</li>
      <li><strong>Forgetting the second operation.</strong> Cross holes, flats, hex features and back-side
      work need live tooling, a sub-spindle or a trip to the mill, each with its own setup and cycle.</li>
      <li><strong>Leaving out deburring and inspection.</strong> Hand deburring threads and cross holes
      and checking tight diameters take time on every part.</li>
      <li><strong>Missing the outside minimum.</strong> Plating, passivation and heat treat have lot
      charges; on a small order the minimum is the whole charge.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>${SITE_NAME} does not compute lathe cycle times: you work out the times above and type them in.
    What it does do is the bar. A rate-card material can be priced by the foot, with the cut allowance,
    the bar length the shop buys and the remnant each bar leaves. A quote line with a round blank then
    counts parts per bar, charges whole bars for the parts started (or, with no bar length, the length
    used plus the row's scrap), prints the arithmetic ("${e.partLengthIn} in blank + ${e.cutAllowanceIn}
    in cut allowance = ${r.cutLengthIn} in per part ... ${r.partsPerBar} parts per bar"), and puts the cut list
    and the bars to pull on the job traveler once the quote is won. Fallout, the lathe and bench at their
    own rates, the passivation with its lot minimum and every quantity break follow, and a line missing
    a time or a material is blocked rather than priced as if it were free. The example above is priced to
    the cent the app gives for the same inputs, both ways, checked by a test in its code. You can
    <a class="link" href="${href(ctx, "/how-it-works")}">see how a quote is built</a> or read about
    <a class="link" href="${href(ctx, "/material-price-tracking")}">material price tracking</a>.</p>
    <p>For milled parts, see <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to
    quote a CNC machining job</a> and <a class="link" href="${href(ctx, "/how-to-estimate-cnc-machining-time")}">how
    to estimate CNC machining time</a>; for your shop rate,
    <a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">how to work out a machine shop hourly
    rate</a>; for what goes on the quote you send, the
    <a class="link" href="${href(ctx, "/machine-shop-quote-template")}">machine shop quote template</a>.</p>
    <p class="fineprint">This page explains a common costing method. It is not accounting, tax,
    engineering or financial advice, and the speeds, feeds, prices, times and rates in it are made up.
    Check every quote before you send it.</p>
  </div>
</section>
${ctaBand(ctx, "Quote your next turned part this way", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches estimators make for work sent to a vendor ("how to quote outside
 * processing", "heat treat cost per pound", "how to quote anodizing", "outside service markup machine
 * shop", "plating lot charge"). Method plus one made-up steel block hardened by a heat treater who
 * charges by the pound and black oxided by a second vendor, priced in ./outside-processing-example to
 * the cent the app's costing engine gives, next to the "naive" quote that multiplies the vendors'
 * per-part prices by the quantity (apps/jobshop-quote/test/unit/site-outside-processing-example.test.ts).
 * No industry prices are quoted.
 */
export function outsideProcessingGuidePage(ctx: RenderContext): Html {
  const e = OUTSIDE_EXAMPLE;
  const r = priceOutsideExample(e);
  const [small, mid, large] = r.breaks;
  const [nSmall, nMid, nLarge] = r.naiveBreaks;
  const [heat, coat] = r.charges;
  const [heatSvc, coatSvc] = r.services;
  if (!small || !mid || !large || !nSmall || !nMid || !nLarge)
    throw new Error("the outside processing guide example quotes three quantities");
  if (!heat || !coat || !heatSvc || !coatSvc)
    throw new Error("the example has two outside services");
  const pctBps = (bps: number) => `${bps / 100}%`;
  const pctOf = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
  const rateOf = (i: number) => usdCents(e.machines[i]?.hourlyRateCents ?? 0);
  const machineName = (i: number) => e.machines[i]?.name ?? "";
  const qty = (n: number) => n.toLocaleString("en-US");
  const outsideOf = (b: (typeof r.breaks)[number]) => b.finishingCents + b.extrasCents;
  const extrasTotal = e.extras.reduce((s, x) => s + x.lotCents, 0);
  const lines: [string, (b: (typeof r.breaks)[number], i: number) => string][] = [
    ["Parts started", (b) => qty(b.starts)],
    ["Material", (b) => usdCents(b.materialCents)],
    ["Setup and first article", (b) => usdCents(b.setupCents)],
    ["Run time", (b) => usdCents(b.runCents)],
    [
      "Heat treat (outside)",
      (_b, i) => `${usdCents(heat.cents[i] ?? 0)}${heat.atMinimum[i] ? " (minimum)" : ""}`,
    ],
    [
      "Black oxide (outside)",
      (_b, i) => `${usdCents(coat.cents[i] ?? 0)}${coat.atMinimum[i] ? " (minimum)" : ""}`,
    ],
    ["Freight and certificate", (b) => usdCents(b.extrasCents)],
    ["Cost", (b) => usdCents(b.costCents)],
    ["Markup", (b) => usdCents(b.markupCents)],
    ["Price each", (b) => usdCents(b.unitPriceCents)],
    ["Line total", (b) => usdCents(b.totalCents)],
  ];
  const naiveRow = (label: string, f: (n: (typeof r.naiveBreaks)[number], i: number) => string) =>
    html`<tr><th scope="row">${label}</th>${r.naiveBreaks.map((n, i) => html`<td>${f(n, i)}</td>`)}</tr>`;
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to quote outside processing: heat treat, anodize and plating</h1>
    <p class="lead">Work you send out is the one part of a quote whose price someone else sets, and the
    vendor's minimum charge is easy to miss. On a short run it can be most of the price. Here is the
    method, a worked example at ${small.quantity}, ${mid.quantity} and ${large.quantity} parts, and what
    the quote looks like if you just multiply the vendor's per-part price by the quantity.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>The method in six steps</h2>
    <ol>
      <li><strong>Read the drawing for every process after machining.</strong> Heat treat and the
      hardness, anodize type, class and colour, plating and thickness, black oxide, passivation, paint or
      powder coat, and the spec each one calls out (for example MIL-A-8625 for anodize or AMS 2759 for
      steel heat treat). Note masked surfaces, threads to protect and any certificate the customer wants
      back. A finish with no spec is a question to the customer, not a guess.</li>
      <li><strong>Get each vendor's price in the unit they bill.</strong> Heat treaters often price by the
      pound of parts, platers and anodizers by the part, the rack or the area, and nearly all of them
      have a minimum charge per lot. Ask for masking, racking, stripping and certificate charges and the
      turnaround as well.</li>
      <li><strong>Turn it into a price per part and a lot minimum.</strong> A per-pound price times the
      finished part's weight (what goes in the furnace, not the blank) is the per-part charge. The
      vendor bills the larger of per-part × parts sent and the lot minimum.</li>
      <li><strong>Count the parts you send, not the parts you ship.</strong> With fallout, you machine
      and send more parts than the order, and the vendor charges for each one.</li>
      <li><strong>Add the cost of getting it there and back.</strong> Freight or the driver's time to each
      vendor and back, packaging, and the certificates. These are per lot, so they hit a small order
      hardest.</li>
      <li><strong>Mark it up and quote every quantity.</strong> A markup on outside work pays for
      chasing the vendor, the parts' time off your floor and the risk of a rejected lot. Repeat the sum
      at each break: the minimums spread differently at each.</li>
    </ol>

    <h2>A worked example</h2>
    <p>A ${e.partName}: ${e.materialName}, milled from a ${e.blank.lengthIn} × ${e.blank.widthIn} ×
    ${e.blank.thicknessIn} in blank in two setups, deburred and inspected, then hardened and tempered
    by a heat treater who charges by the pound and black oxided by a second vendor.
    <strong>Every number here is made up to show the arithmetic</strong>; they are not prices, rates
    or minimums for any vendor, process or region. Use your own vendors' quotes.</p>
    <h3>The outside services</h3>
    <ul>
      <li><strong>${heatSvc.name}:</strong> ${usdCents(e.heatTreatPerLbCents)} a pound. The machined
      block weighs ${e.finishedWeightLb} lb (from the model; the blank was ${r.blankWeightLb.toFixed(2)}
      lb), so ${e.finishedWeightLb} × ${usdCents(e.heatTreatPerLbCents)} = ${usdCents(heatSvc.perPartCents)}
      a part, with a ${usdCents(heatSvc.lotChargeCents)} minimum a lot. The minimum stops binding at
      ${usdCents(heatSvc.lotChargeCents)} ÷ ${usdCents(heatSvc.perPartCents)} = ${heat.crossoverStarts}
      parts sent.</li>
      <li><strong>${coatSvc.name}:</strong> ${usdCents(coatSvc.perPartCents)} a part, minimum
      ${usdCents(coatSvc.lotChargeCents)} a lot, which stops binding at ${coat.crossoverStarts} parts.</li>
      ${e.extras.map((x) => html`<li><strong>${x.label}:</strong> ${usdCents(x.lotCents)} a lot.</li>`)}
    </ul>
    <h3>The rest</h3>
    <ul>
      <li><strong>Material:</strong> ${r.blankWeightLb.toFixed(2)} lb a blank at
      ${usdCents(e.pricePerLbCents)} a pound plus ${pctBps(e.scrapBps)} for kerf and facing, at least
      ${usdCents(e.materialMinChargeCents)} a line.</li>
      ${e.operations.map(
        (o) =>
          html`<li><strong>${o.label}</strong> on the ${machineName(o.machine).toLowerCase()} at
          ${rateOf(o.machine)} an hour: ${[
            o.setupMinutes ? `${o.setupMinutes} min setup` : "",
            o.cycleMinutesPerPart ? `${o.cycleMinutesPerPart} min a part` : "",
          ]
            .filter(Boolean)
            .join(", ")}.</li>`,
      )}
      <li><strong>Fallout:</strong> ${pctBps(e.falloutBps)}, so ${small.quantity} parts start
      ${small.starts}, ${mid.quantity} start ${mid.starts} and ${large.quantity} start ${large.starts},
      and both vendors are paid on the parts started.</li>
      <li><strong>Markup:</strong> ${pctBps(e.outsideServiceMarkupBps)} on the outside services,
      ${pctBps(e.materialMarkupBps)} on material, freight and the certificate (bought-in costs), none on
      labor (the shop rates are taken to hold the margin already); a ${usdCents(e.minimumLineCents)}
      minimum per line.</li>
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The made-up steel block at three quantities. "(minimum)" marks a vendor's lot minimum setting the charge. Each component is rounded to the cent, then summed; the price each is rounded up to the cent.</caption>
        <thead><tr><th scope="col">Line</th>${r.breaks.map((b) => html`<th scope="col">${qty(b.quantity)} parts</th>`)}</tr></thead>
        <tbody>
          ${lines.map(
            ([label, cell]) =>
              html`<tr><th scope="row">${label}</th>${r.breaks.map((b, i) => html`<td>${cell(b, i)}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </div>

    <h2>The quote you get by multiplying</h2>
    <p>The common shortcut is to take each vendor's per-part price, multiply it by the quantity and add
    it at cost: no minimums, no freight, no certificate, no markup. Priced that way, with everything
    else the same:</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The same block with the outside work priced as per-part × parts only. Shortfall = the full quote's line total less this one's.</caption>
        <thead><tr><th scope="col">Line</th>${r.naiveBreaks.map((n) => html`<th scope="col">${qty(n.quantity)} parts</th>`)}</tr></thead>
        <tbody>
          ${naiveRow("Outside work", (n) => usdCents(n.finishingCents))}
          ${naiveRow("Price each", (n) => usdCents(n.unitPriceCents))}
          ${naiveRow("Line total", (n) => usdCents(n.totalCents))}
          ${naiveRow("Shortfall", (n, i) => usdCents((r.breaks[i]?.totalCents ?? 0) - n.totalCents))}
        </tbody>
      </table>
    </div>
    <p>What the two tables show:</p>
    <ul>
      <li><strong>On a short run the minimums are the outside price.</strong> At ${small.quantity} parts
      the vendors would bill ${usdCents(heatSvc.perPartCents * small.starts)} and
      ${usdCents(coatSvc.perPartCents * small.starts)} by the part; they bill
      ${usdCents(heatSvc.lotChargeCents)} and ${usdCents(coatSvc.lotChargeCents)}. With freight and the
      certificate, outside costs are ${usdCents(outsideOf(small))}, ${pctOf(outsideOf(small), small.costCents)}
      of the cost. The multiplied quote comes to ${usdCents(nSmall.totalCents)} against
      ${usdCents(small.totalCents)}: ${pctOf(nSmall.totalCents, small.totalCents)} of what the job
      should be priced at.</li>
      <li><strong>The minimums still bind at ${mid.quantity}.</strong> ${mid.starts} parts sent is below
      both break-even counts (${coat.crossoverStarts} and ${heat.crossoverStarts}), so the outside
      charge is the same ${usdCents(mid.finishingCents)} as at ${small.quantity}. The shortfall is
      ${usdCents(mid.totalCents - nMid.totalCents)}, about ${usdCents(Math.round((mid.totalCents - nMid.totalCents) / mid.quantity))}
      a part, which is easy to miss in a ${usdCents(mid.totalCents)} quote.</li>
      <li><strong>At volume the gap is the freight and the markup.</strong> At ${large.quantity} parts
      both vendors bill by the part, so the multiplied outside cost is right; what is still missing is
      ${usdCents(extrasTotal)} of freight and certificate and the markup on outside work, a shortfall of
      ${usdCents(large.totalCents - nLarge.totalCents)}.</li>
      <li><strong>The price each falls</strong> from ${usdCents(small.unitPriceCents)} to
      ${usdCents(mid.unitPriceCents)} to ${usdCents(large.unitPriceCents)}, and the lot minimums and
      freight are a large part of why. When a customer orders small lots of a repeat part, it can pay to
      offer a larger run held in stock, or to send it out with other jobs going to the same vendor.</li>
    </ul>

    <h2>Mistakes that lose money on jobs you win</h2>
    <ul>
      <li><strong>Pricing the vendor's per-part rate without the lot minimum.</strong> Above: the
      smaller the order, the bigger the miss.</li>
      <li><strong>Weighing the blank, or nothing.</strong> A per-pound price applies to what goes in the
      furnace. Use the finished weight, and include any fixture or basket weight the vendor charges
      for.</li>
      <li><strong>Sending the order quantity.</strong> Spares for fallout and first articles go through
      the vendor too, and are billed.</li>
      <li><strong>Forgetting the trip.</strong> Freight or a driver's half day each way, packaging, and the
      certificate are real costs on every lot.</li>
      <li><strong>Quoting a stale vendor price.</strong> Platers and heat treaters change prices and
      minimums; keep their current quotes on file and date them.</li>
      <li><strong>Leaving vendor days out of the lead time.</strong> The parts are off your floor for the
      vendor's turnaround plus the trips. Add it to the date you promise; see
      <a class="link" href="${href(ctx, "/machine-shop-lead-time")}">quoting lead times from shop
      load</a>.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>In ${SITE_NAME} each finishing step is a rate-card entry with a per-part charge and a lot minimum,
    marked as an outside service or done in house. Outside services take their own markup, separate
    from labor and material, and freight, certificates and other bought-in items go on a line as extras,
    per part or per lot. A quote line prices each break the way the tables above do: the vendor's charge
    is the larger of per-part × parts started and the lot minimum, and the quote's basis prints each
    finish's per-part charge and minimum. ${SITE_NAME} does not price a finish by the pound or by area: type
    the per-part charge you work out from the vendor's quote. The example above is priced to the cent
    the app gives for the same inputs, both ways, checked by a test in its code. Finishing entries can
    be imported from a CSV with the rest of the rate card, and a
    won quote's <a class="link" href="${href(ctx, "/job-traveler-software")}">job traveler</a> lists the
    finishing and outside services after the operations.</p>
    <p>For the rest of the quote, see <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how
    to quote a CNC machining job</a>, <a class="link" href="${href(ctx, "/how-to-quote-cnc-turning")}">how
    to quote turned parts</a> and <a class="link" href="${href(ctx, "/how-to-quote-sheet-metal")}">sheet
    metal</a>; for your shop rate, <a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">how to
    work out a machine shop hourly rate</a>; for what goes on the quote you send, the
    <a class="link" href="${href(ctx, "/machine-shop-quote-template")}">machine shop quote template</a>.</p>
    <p class="fineprint">This page explains a common costing method. It is not accounting, tax,
    engineering or financial advice, and the prices, minimums, times and rates in it are made up.
    Check every quote before you send it.</p>
  </div>
</section>
${ctaBand(ctx, "Quote your next outside-processed part this way", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches estimators make for machining time ("how to estimate CNC machining
 * time", "CNC cycle time calculation", "machining time formula", "material removal rate"). Method plus
 * one made-up manifold block: spindle speed and feed from surface speed and chip load, removal rate
 * from width and depth of cut, then the roughing, drilling and tapping minutes the app suggests from a
 * STEP model, computed in ./cycle-time-example and checked against the app's own suggestions
 * (apps/jobshop-quote/test/unit/site-cycle-time-example.test.ts). No feeds, speeds or industry figures
 * are recommended.
 */
export function cycleTimeGuidePage(ctx: RenderContext): Html {
  const e = CYCLE_EXAMPLE;
  const r = cycleTimeExample(e);
  const ro = e.roughing;
  const d = e.drilling;
  const rate = usdCents(e.hourlyRateCents);
  const f2 = (n: number) => n.toFixed(2);
  const runCents = (min: number) => Math.round((min / 60) * e.hourlyRateCents);
  const setupCents = runCents(e.setupMinutes);
  const [few, many] = e.quantities;
  if (few === undefined || many === undefined)
    throw new Error("the cycle time guide example quotes two quantities");
  const tenPctMissCents = Math.round(
    ((r.cycleMinutesPerPart * 0.1) / 60) * e.hourlyRateCents * many,
  );
  const roughShare = Math.round((r.roughing.cycleMinutesPerPart / r.cycleMinutesPerPart) * 100);
  const nonCutMinutes = e.typed
    .filter((t) => !t.label.startsWith("Finish"))
    .reduce((s, t) => s + t.cycleMinutesPerPart, 0);
  const rows: [string, string, number][] = [
    [
      r.roughing.label,
      `${f2(r.removedIn3)} in³ ÷ ${f2(r.removalRateIn3PerMin)} in³/min, to the tenth (suggested by the app)`,
      r.roughing.cycleMinutesPerPart,
    ],
    [
      r.drill.label,
      `${r.holeLocations} × ${d.secondsPerHole} s + ${f2(r.totalDepthIn)} in ÷ ${f2(r.drillFeedInPerMin)} in/min + ${r.extraPecks} pecks × ${d.secondsPerPeck} s, up to the hundredth (suggested)`,
      r.drill.cycleMinutesPerPart,
    ],
    [
      r.tap.label,
      `${r.tappedHoles} × ${e.secondsPerTappedHole} s (suggested once the size is marked threaded)`,
      r.tap.cycleMinutesPerPart,
    ],
    ...e.typed.map((t): [string, string, number] => [
      t.label,
      `${t.basis} (typed)`,
      t.cycleMinutesPerPart,
    ]),
  ];
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to estimate CNC machining time for a quote</h1>
    <p class="lead">Cycle time is the number a machining quote rests on: every minute of it is billed on
    every part. Here is how to build it up from the cut, the holes and the time the spindle isn't cutting,
    a worked example, and the mistakes that make a won job lose money.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>The method in five steps</h2>
    <ol>
      <li><strong>Work out the feed from the tool.</strong> Spindle speed (rpm) = surface speed (SFM) ×
      12 ÷ (π × tool diameter), the familiar SFM × 3.82 ÷ D. Feed (in/min) = rpm × flutes × chip load.
      Take surface speed and chip load from your tooling supplier's data for the material, and cap rpm at
      your spindle's limit.</li>
      <li><strong>Turn the feed into a removal rate.</strong> Material removal rate (in³/min) = width of
      cut × depth of cut × feed. That is the rate while the tool is in the cut. A real roughing path also
      ramps, steps over, lifts and moves between pockets, so keep the share of it you see on your own
      jobs: time a few and divide the volume removed by the minutes.</li>
      <li><strong>Rough time = volume removed ÷ removal rate.</strong> The blank's volume less the finished
      part's (your CAD system measures the part), at the rate for that machine and material.</li>
      <li><strong>Time the holes one by one.</strong> Each hole costs a fixed time (position, spot, rapid
      in and out) plus its depth at the drill's feed (rpm × feed per revolution). Holes deeper than about
      ${DEEP_HOLE_RATIO} diameters are usually pecked: count the extra retracts and time each. Taps add a
      fixed time per tapped hole.</li>
      <li><strong>Add what isn't roughing or drilling.</strong> Finishing passes (toolpath length ÷ finish
      feed), tool changes (count × chip-to-chip time), and loading, unloading and cleaning the part. On
      small parts these can be as large as the cutting.</li>
    </ol>

    <h2>A worked example</h2>
    <p>A ${e.partName} in ${e.materialName}, roughed from a ${e.blank.lengthIn} × ${e.blank.widthIn} ×
    ${e.blank.thicknessIn} in blank on a ${e.machineName} at ${rate} an hour (the rate the
    <a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">hourly rate guide</a> works out).
    <strong>Every number here is made up to show the arithmetic</strong>; they are not recommended feeds,
    speeds, chip loads or times for any tool, material or machine. Use your tooling data and your own
    timings.</p>
    <ul>
      <li><strong>Feed:</strong> a ${ro.toolLabel} at ${ro.surfaceFeetPerMin} SFM is
      ${ro.surfaceFeetPerMin} × 12 ÷ (π × ${ro.toolDiameterIn}) = ${Math.round(r.rpm).toLocaleString("en-US")}
      rpm; at ${ro.chipLoadIn} in a tooth on ${ro.flutes} flutes that is ${r.feedInPerMin.toFixed(1)} in/min.</li>
      <li><strong>Removal rate:</strong> ${ro.widthOfCutIn} in wide × ${ro.depthOfCutIn} in deep ×
      ${r.feedInPerMin.toFixed(1)} in/min = ${f2(r.theoreticalRemovalIn3PerMin)} in³/min in the cut. The
      shop's timed jobs keep ${ro.pathEfficiencyBps / 100}% of that over a whole roughing path, so
      ${f2(r.removalRateIn3PerMin)} in³/min goes on the rate card for this mill and material.</li>
      <li><strong>Roughing:</strong> the blank is ${f2(r.blankVolumeIn3)} in³ and the model
      ${e.partVolumeIn3} in³, so ${f2(r.removedIn3)} in³ comes out: ${f2(r.removedIn3)} ÷
      ${f2(r.removalRateIn3PerMin)} = ${r.roughing.cycleMinutesPerPart.toFixed(1)} min.</li>
      <li><strong>Holes:</strong> ${e.holes.map((h) => `${h.count} × ${h.label}`).join("; ")}. The drill
      runs at ${d.drillRpm.toLocaleString("en-US")} rpm × ${d.feedPerRevIn} in/rev = ${f2(r.drillFeedInPerMin)}
      in/min. All ${r.deepHoles} holes are deeper than ${DEEP_HOLE_RATIO} diameters, so they are pecked every
      ${d.peckDepthDiameters} × D: ${r.extraPecks} extra retracts at ${d.secondsPerPeck} s. Drilling comes
      to ${r.drill.cycleMinutesPerPart} min and tapping to ${r.tap.cycleMinutesPerPart} min.</li>
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The made-up manifold block, per part. Run cost is minutes ÷ 60 × ${rate}, rounded to the cent.</caption>
        <thead><tr><th scope="col">Operation</th><th scope="col">How</th><th scope="col">Minutes</th><th scope="col">Run cost</th></tr></thead>
        <tbody>
          ${rows.map(
            ([label, how, min]) =>
              html`<tr><th scope="row">${label}</th><td>${how}</td><td>${f2(min)}</td><td>${usdCents(runCents(min))}</td></tr>`,
          )}
          <tr><th scope="row">Cycle per part</th><td></td><td>${f2(r.cycleMinutesPerPart)}</td><td>${usdCents(r.runCentsPerPart)}</td></tr>
        </tbody>
      </table>
    </div>
    <p>What the table shows:</p>
    <ul>
      <li><strong>Roughing is the largest single line, not the whole cycle.</strong> It is
      ${roughShare}% of the ${f2(r.cycleMinutesPerPart)} minutes; tool changes and loading alone add
      ${f2(nonCutMinutes)} min a part that no feeds-and-speeds formula shows.</li>
      <li><strong>A small miss is a big one at volume.</strong> Underestimate this cycle by 10% and the
      ${many}-part order gives away ${usdCents(tenPctMissCents)} of mill time.</li>
      <li><strong>Setup is a separate line.</strong> The ${e.setupMinutes} min setup
      (${usdCents(setupCents)}) is ${usdCents(Math.round(setupCents / few))} a part at ${few} and
      ${usdCents(Math.round(setupCents / many))} at ${many}; keep it out of the cycle time so it spreads
      over the lot.</li>
    </ul>

    <h2>Mistakes that make a won job lose money</h2>
    <ul>
      <li><strong>Using the theoretical removal rate.</strong> The rate in the cut is not the rate over
      the path. Measure the share your own toolpaths keep, per machine and material.</li>
      <li><strong>One rate for every material.</strong> Stainless and titanium rough at a fraction of
      aluminum's rate; a rate measured in 6061 badly underprices 304.</li>
      <li><strong>Timing holes by depth alone.</strong> Positioning and peck retracts can be most of a
      drilled hole's time: in the example they are ${Math.round(((r.holeLocations * d.secondsPerHole + r.extraPecks * d.secondsPerPeck) / (r.holeLocations * d.secondsPerHole + r.extraPecks * d.secondsPerPeck + (r.totalDepthIn / r.drillFeedInPerMin) * 60)) * 100)}% of it.</li>
      <li><strong>Leaving out what isn't cutting.</strong> Tool changes, probing, loading, blowing off
      chips and in-process checks are billed time too.</li>
      <li><strong>Trusting CAM's cycle time as the whole answer.</strong> A CAM estimate is good for the
      cut itself, but it leaves out loading and often your machine's real rapid and tool-change times;
      compare it with a timed run.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>Put each machine's removal rate per material, its seconds per hole, drill feed per material, peck
    depth and seconds per peck, and its seconds per tapped hole on the rate card once. When an RFQ comes
    with a STEP model, ${SITE_NAME} measures the part's volume and its holes and suggests the roughing,
    drilling and tapping operations above, each labelled with the figures it came from; you mark which
    hole sizes are threaded, since a model rarely says. It does not work out speeds and feeds, finishing
    passes, tool changes or loading: you type those, and a line missing a time is blocked rather than
    priced as if it were free. The suggested minutes in the example are the ones the app gives for the
    same inputs, checked by a test in its code. You can
    <a class="link" href="${href(ctx, "/how-it-works")}">see how a quote is built</a>.</p>
    <p>For the rest of the price (material, setups, outside processes and quantity breaks), see
    <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to quote a CNC machining job</a>;
    for the rate the minutes are billed at,
    <a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">how to work out a machine shop hourly
    rate</a>.</p>
    <p class="fineprint">This page explains a common estimating method. It is not engineering, accounting
    or financial advice, it does not recommend feeds, speeds or tooling, and the figures in it are made up.
    Check every quote before you send it.</p>
  </div>
</section>
${ctaBand(ctx, "Quote your next machined part this way", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches estimators make for a quote form ("machine shop quote template",
 * "CNC quote template", "machining quote form"): what goes on a quote and why, what stays off it,
 * the terms to decide once, a filled-in example (the CNC guide's bracket at its engine-checked
 * prices, ./quote-template) and a CSV template to download. Nothing here is legal advice, and the
 * terms are listed as decisions, never as wording to copy.
 */
export function markupGuidePage(ctx: RenderContext): Html {
  const e = QUOTE_EXAMPLE;
  const results = priceAllPolicies();
  const [split, atCost, passThrough, flat] = results;
  if (!split || !atCost || !passThrough || !flat)
    throw new Error("the markup guide compares four policies");
  const [s1, s10, s100] = split.breaks;
  const [p1, , p100] = passThrough.breaks;
  const [f1, , f100] = flat.breaks;
  if (!s1 || !s10 || !s100 || !p1 || !p100 || !f1 || !f100)
    throw new Error("the markup guide quotes three quantities");
  const pctBps = (bps: number) => `${bps / 100}%`;
  const qtys = split.breaks.map((b) => b.quantity.toLocaleString("en-US"));
  const bucketRows: [string, (b: MarkupBreak) => string][] = [
    ["Material (cost)", (b) => usdCents(b.materialCents)],
    [`Material markup, ${pctBps(e.materialMarkupBps)}`, (b) => usdCents(b.materialMarkupCents)],
    ["Setup and run (at the mill's rate)", (b) => usdCents(b.setupCents + b.runCents)],
    [`Labor markup, ${pctBps(e.laborMarkupBps)}`, (b) => usdCents(b.laborMarkupCents)],
    ["Anodize (vendor's charge)", (b) => usdCents(b.finishingCents)],
    [
      `Outside-service markup, ${pctBps(e.outsideServiceMarkupBps)}`,
      (b) => usdCents(b.outsideMarkupCents),
    ],
    ["Line total", (b) => usdCents(b.totalCents)],
    ["Markup over the quote's costs", (b) => pct1(b.markupOnCost)],
    ["Margin over your full cost", (b) => pct1(b.marginOnFullCost)],
  ];
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>Machine shop markup and margin</h1>
    <p class="lead">How much to mark up material, shop labor and outside processing on a machining
    quote, the difference between markup and margin, and what four common markup policies do to the price
    of one job at 1, 10 and 100 parts.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>Markup and margin are not the same number</h2>
    <p>Markup is added to the cost: a part that costs $100 with a 25% markup sells for $125. Margin is the
    share of the price you keep: $25 of $125 is a 20% margin. So a 25% markup and a 20% margin are the
    same price, and a shop that says "we work on 20%" has to know which it means, because a 20% markup
    keeps only ${pct1(marginFromMarkup(0.2))} of the price.</p>
    <ul>
      <li><strong>Margin from markup:</strong> markup ÷ (1 + markup).</li>
      <li><strong>Markup for a margin:</strong> margin ÷ (1 − margin).</li>
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">Exact conversions, rounded to one decimal.</caption>
        <thead><tr><th scope="col">Markup on cost</th><th scope="col">Margin it gives</th><th scope="col">Margin you want</th><th scope="col">Markup it needs</th></tr></thead>
        <tbody>
          ${TABLE_MARKUPS.map((m, i) => {
            const g = TABLE_MARGINS[i] ?? 0;
            return html`<tr><th scope="row">${pct1(m)}</th><td>${pct1(marginFromMarkup(m))}</td><th scope="row">${pct1(g)}</th><td>${pct1(markupFromMargin(g))}</td></tr>`;
          })}
        </tbody>
      </table>
    </div>

    <h2>Three markups, not one</h2>
    <p>A quote line has costs of different kinds, and each carries a different risk and a different amount
    of your money for a different time. Most quoting systems, ${SITE_NAME} included, keep a separate markup
    for each:</p>
    <ul>
      <li><strong>Shop labor (setup and run).</strong> If your hourly rate was worked out as cost divided by one
      minus a margin (<a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">how to work out a
      machine shop hourly rate</a>), the profit is already in the rate and the labor markup is 0%. If your rate
      is the bare cost of a billable hour, the labor markup is where the profit goes. Doing both charges the
      margin twice; doing neither works for nothing.</li>
      <li><strong>Material.</strong> You buy it before the job, carry the cash until the customer pays, pay for
      the saw cut and the drop, and eat the bar that turns out bad. A markup on material pays for that.
      Some shops pass material through at cost on large customer-specified buys to stay competitive; that
      is a decision to make per customer, not by default.</li>
      <li><strong>Outside services (anodize, plating, heat treat, passivation).</strong> The vendor's lot
      minimum, the freight both ways, the chasing, and the parts that come back wrong are yours. The
      markup pays for handling them. Hardware, certificates and crating you buy for the job are purchased
      items like material.</li>
    </ul>
    <p>Then two floors under the whole line: the <strong>vendor's lot minimum</strong> on each outside service
    (a $150 anodize lot costs $150 for one part or forty) and your own <strong>line minimum</strong>, the
    smallest price you will open a job for.</p>

    <h2>A worked example</h2>
    <p>The anodized 6061 bracket from <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to
    quote a CNC machining job</a>: two milling setups, a deburr, an outside clear anodize at
    ${usdCents(e.finishingPerPartCents)} a part with a ${usdCents(e.finishingLotChargeCents)} lot minimum, ${pctBps(e.falloutBps)}
    fallout, on a mill at ${usdCents(e.hourlyRateCents)} an hour, which is the hourly-rate guide's
    ${usdCents(RATE_COST_CENTS)} cost of a billable hour at a ${pct1(RATE_MARGIN)} margin. <strong>Every number
    is made up to show the arithmetic</strong>; none is a typical figure. Here is where its markup comes from:</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">${split.policy.note} Each markup rounded to the cent; the price each rounded up to the cent, as the app does.</caption>
        <thead><tr><th scope="col">Quantity</th>${qtys.map((q) => html`<th scope="col">${q}</th>`)}</tr></thead>
        <tbody>
          ${bucketRows.map(([label, f]) => html`<tr><th scope="row">${label}</th>${split.breaks.map((b) => html`<td>${f(b)}</td>`)}</tr>`)}
        </tbody>
      </table>
    </div>
    <p>Two things to read from it. First, the markup line looks thin: ${pct1(s1.markupOnCost)} over the quote's
    costs at one part, ${pct1(s100.markupOnCost)} at a hundred. That is because the profit is in the mill's rate,
    not in the markup line, and your margin over your full cost (labor at ${usdCents(RATE_COST_CENTS)} an hour) is
    ${pct1(s1.marginOnFullCost)} to ${pct1(s100.marginOnFullCost)}. Judge a quote by that, not by its markup line.
    Second, it never reaches the rate's ${pct1(RATE_MARGIN)}: material and the anodize are marked up
    ${pctBps(e.materialMarkupBps)}, which is a ${pct1(marginFromMarkup(e.materialMarkupBps / 10_000))} margin, so the more of the
    price they make up, the lower the blend. At one part the anodize lot alone is
    ${Math.round((s1.finishingCents / s1.totalCents) * 100)}% of the price.</p>

    <h2>Four markup policies on the same job</h2>
    <p>The same bracket, priced by ${SITE_NAME}'s costing engine under four settings:</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">Line totals; margin over the shop's full cost (labor at ${usdCents(RATE_COST_CENTS)} an hour) underneath.</caption>
        <thead><tr><th scope="col">Policy</th>${qtys.map((q) => html`<th scope="col">${q} part${q === "1" ? "" : "s"}</th>`)}</tr></thead>
        <tbody>
          ${results.map(
            (r) =>
              html`<tr><th scope="row">${r.policy.label}<br><span class="fineprint">${r.policy.note}</span></th>${r.breaks.map((b) => html`<td>${usdCents(b.totalCents)}<br><span class="fineprint">${pct1(b.marginOnFullCost)} margin</span></td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <ul>
      <li><strong>Rate at cost with a 25% labor markup</strong> lands on the same prices as the first card, to
      the cent or within one: a ${pct1(RATE_MARGIN)} margin in the rate and a 25% markup on a cost rate are the same
      thing. Pick one way of writing it and use it everywhere.</li>
      <li><strong>Passing material and the anodize through at cost</strong> takes ${usdCents(s1.totalCents - p1.totalCents)}
      off the one-off and ${usdCents(s100.totalCents - p100.totalCents)} off the hundred, and the margin falls to
      ${pct1(p1.marginOnFullCost)} at one part, where the vendor's lot charge is a large share of the price.</li>
      <li><strong>One 15% markup on everything</strong> charges the margin twice on labor: ${usdCents(f1.totalCents - s1.totalCents)}
      more on the one-off and ${usdCents(f100.totalCents - s100.totalCents)} more on the hundred. That can be a fair
      price for a hot job; on a competitive RFQ it is the quote that loses without anyone telling you why.</li>
    </ul>

    <h2>Mistakes that cost margin</h2>
    <ul>
      <li><strong>Calling a markup a margin.</strong> The table above: a 20% markup is a ${pct1(marginFromMarkup(0.2))} margin.</li>
      <li><strong>Adding a labor markup to a rate that already has the profit in it</strong>, or neither.</li>
      <li><strong>Outside work at cost.</strong> The lot minimum, the freight and the rework when a batch comes back
      wrong are real costs; a markup on outside services is how they get paid.</li>
      <li><strong>Forgetting the lot minimum.</strong> A plating vendor's minimum spread over two parts is most of
      their price; quote it as a lot charge, not as a per-part figure from a big run.</li>
      <li><strong>No line minimum.</strong> Opening a job, programming, paperwork and shipping cost the same for
      a one-off as for a run. A minimum per line keeps the smallest jobs from being done at a loss; in the example it
      does not bind, because the bracket's setup and anodize lot already put it well above
      ${usdCents(e.minimumLineCents)}.</li>
      <li><strong>Judging by the markup line.</strong> Look at what is left after your full cost, at each
      quantity, because the share each cost takes changes with quantity.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>${SITE_NAME}'s rate card holds a labor markup, a material markup, an outside-service markup and a line
    minimum, and each finishing operation is marked as in-house (marked up as labor) or outside (marked up
    at the outside-service rate) with its own lot charge. Hardware, certificates and other purchased extras
    take the material markup. Every quote line shows the markup it used next to the cost, at every quantity,
    and the customer's PDF never prints any of it. You can
    <a class="link" href="${href(ctx, "/how-it-works")}">see how a quote is built</a>.</p>
    <p class="fineprint">This page explains common costing arithmetic. It is not accounting, tax or financial
    advice, and the example's numbers are made up. What markup the market will bear depends on your
    customers, your work and your competitors.</p>
  </div>
</section>
${ctaBand(ctx, "Set your markups once, quote every RFQ from them", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

export function quoteTemplatePage(ctx: RenderContext): Html {
  const q = exampleQuote();
  const fields: [string, string][] = [
    [
      "Your shop's name, address, phone and email",
      "So the buyer can reach the person who quoted, and a purchase order goes to the right place.",
    ],
    [
      "Quote number and revision",
      "One number per quote, and a revision label when you re-quote, so a PO names exactly which prices it accepts.",
    ],
    [
      "Date and valid-until date",
      "Material and machine time get repriced; a quote without an end date can be held against you a year later.",
    ],
    [
      "Customer company, contact and their RFQ number",
      "Buyers send many RFQs; their reference is how they match your quote to theirs.",
    ],
    [
      "Part number and drawing revision for every line",
      "The price is for that revision. When the drawing changes, the revision on your quote shows which one you priced.",
    ],
    [
      "Description: material, finish and anything else priced in",
      "The buyer compares quotes line by line; saying “6061-T6, clear anodize, certs included” stops a cheaper quote that left them out looking like the same thing.",
    ],
    [
      "Every quantity asked for, with unit and extended price",
      "Setup and lot minimums spread differently at each quantity, so each break gets its own price, not one price each.",
    ],
    [
      "Lead time, counted from the order",
      "“3 weeks after receipt of order” holds; a calendar date goes stale while the buyer decides.",
    ],
    [
      "Notes: assumptions and exceptions",
      "Anything you assumed (a tolerance, a material substitute, an inspection level) written down before the PO, not argued about after.",
    ],
    [
      "Terms",
      "Payment, shipping, overruns and the rest, decided once and printed on every quote (list below).",
    ],
  ];
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>Machine shop quote template</h1>
    <p class="lead">What a CNC or fabrication quote needs on it, what to keep off it, the terms to decide
    once, a filled-in example and a free template to download. The buyer reads a quote to compare it with
    two others and to write a purchase order from it; every field below serves one of those.</p>
    <p class="actions"><a class="btn btn-secondary" href="${href(ctx, `/${CSV_FILE}`)}" download>Download the template (CSV)</a></p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>What goes on a machine shop quote</h2>
    <div class="table-wrap">
      <table class="compare">
        <thead><tr><th scope="col">Field</th><th scope="col">Why it is there</th></tr></thead>
        <tbody>
          ${fields.map(([f, why]) => html`<tr><th scope="row">${f}</th><td>${why}</td></tr>`)}
        </tbody>
      </table>
    </div>

    <h2>What stays off it</h2>
    <p>Your cost basis. The customer sees a price for each part at each quantity; your hourly rates, setup
    and cycle minutes, material cost and markup stay in your own records. A quote that shows them invites
    the buyer to negotiate each one, and tells a competitor your rates. Keep the basis with the quote on
    your side, so you can answer when a reorder is priced differently
    (<a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how a machining price is built</a>).</p>

    <h2>A filled-in example</h2>
    <p><strong>The shop, customer, part, dates and prices are made up.</strong> The prices are the worked
    example in <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to quote a CNC
    machining job</a>, priced at three quantities.</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">${q.shopName}: quote ${q.quoteLabel}, dated ${q.issuedOn}, valid until
        ${q.validUntil}. Prepared for ${q.customerCompany}, ${q.customerContact}. Lead time: ${q.leadTime}.</caption>
        <thead><tr><th scope="col">Part</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Extended</th></tr></thead>
        <tbody>
          ${q.lines.map((line) =>
            line.breaks.map(
              (b, i) =>
                html`<tr>${i === 0 ? html`<th scope="row" rowspan="${line.breaks.length}">${line.partNumber} Rev ${line.revision}<br><span class="fineprint">${line.description}. ${line.material}, ${line.finish.toLowerCase()}.</span></th>` : ""}<td>${b.quantity.toLocaleString("en-US")}</td><td>${usdCents(b.unitPriceCents)}</td><td>${usdCents(b.totalCents)}</td></tr>`,
            ),
          )}
        </tbody>
      </table>
    </div>
    <p><strong>Notes</strong></p>
    <ul>
      ${q.notes.map((n) => html`<li>${n}</li>`)}
    </ul>

    <p>What to check on the RFQ before you price it, so the notes catch every assumption:
    the <a class="link" href="${href(ctx, "/rfq-review-checklist")}">RFQ review checklist</a>.</p>

    <h2>Terms to decide once</h2>
    <p>Each of these is a question your terms should answer. Decide them for your shop, put them in one
    paragraph and print it on every quote. They are prompts, not wording to copy: have your own terms
    and conditions reviewed by someone qualified where you do business.</p>
    <ul>
      ${TERMS_CHECKLIST.map((t) => html`<li><strong>${t.term}.</strong> ${t.question}</li>`)}
    </ul>

    <h2>The template</h2>
    <p><a class="link" href="${href(ctx, `/${CSV_FILE}`)}" download>${CSV_FILE}</a> opens in Excel,
    Google Sheets or LibreOffice. It has the columns ${CSV_COLUMNS.join(", ")}: one row per quantity
    break, so a part quoted at three quantities takes three rows with the same line number. The example
    rows are marked; delete them. It holds plain values, no formulas: work out the extended price as
    quantity × unit price, and put your shop's header, the customer, the dates and your terms above the
    table when you print it.</p>
    <p>A spreadsheet works for a few quotes a week. It stops working when you need to find what you quoted
    a part at last time, re-quote a revision, see which quotes are about to expire or remember to follow up.</p>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>${SITE_NAME} builds this quote as a PDF from your rate card: your shop's name, logo and contact
    lines, a quote number with revisions (“Q-1001 Rev 2, replaces Q-1001”), the date, a valid-until
    date from your default number of days, the customer, a lead time from your default, every part with its
    revision and description, a row per quantity break with unit and extended prices, the quote's notes and
    your terms, saved once in the rate card. It never prints your rates, times or markup. The estimator
    checks and sends it; the customer gets a link to accept or decline, and the app reminds you about
    follow-ups and quotes about to expire. You can
    <a class="link" href="${href(ctx, "/how-it-works")}">see how a quote is built</a>.</p>
    ${shotFigure(ctx, SHOTS.customerPdf, "A quote from the app, on a made-up shop's letterhead: the same header, customer, quantity breaks and terms as the template, filled in from the rate card.")}
    <p class="fineprint">This page describes common practice for job-shop quotes. It is not legal, tax or
    financial advice, and the example's names, dates and prices are made up. Check every quote before you
    send it.</p>
  </div>
</section>
${ctaBand(ctx, "Send your next quote from your own rate card", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches estimators and quality managers make before pricing
 * ("RFQ review checklist", "contract review checklist machine shop"): the checks in ./rfq-checklist,
 * grouped, each with why it matters and, where the hosted app helps, what it does. Names ISO 9001 /
 * AS9100 clause 8.2.3 without claiming the list meets it; export control and flowdowns say to ask
 * someone qualified. Not legal advice.
 */
export function rfqChecklistPage(ctx: RenderContext): Html {
  const helped = RFQ_CHECKS.filter((c) => c.inApp);
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>RFQ review checklist for machine shops</h1>
    <p class="lead">${RFQ_CHECKS.length} things to check on a request for quote before you price it: the
    documents, the part, the quantities and dates, the paperwork and the terms. Most costly quoting
    mistakes are not arithmetic; they are a revision, a callout or a clause nobody read. A free checklist to
    download and fill in per RFQ is at the end.</p>
    <p class="actions"><a class="btn btn-secondary" href="${href(ctx, `/${RFQ_CSV_FILE}`)}" download>Download the checklist (CSV)</a></p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>Why review an RFQ before quoting it</h2>
    <p>A quote is an offer: once the buyer sends a purchase order against it, you have agreed to make that
    revision, in that material, to those callouts, by that date, at that price. Reviewing the request first
    is where you find what the price must cover and whether you can deliver it at all. ISO 9001:2015 and
    AS9100D both ask for this step under clause 8.2.3, “review of the requirements for products and
    services”, before a shop commits to supply. This list is a practical start for that review; it does not
    by itself meet either standard, and your own quality manual decides what your review records.</p>
    <p>In short: <a class="link" href="#documents">documents</a>, <a class="link" href="#part">the part</a>,
    <a class="link" href="#quantity">quantity and timing</a>, <a class="link" href="#quality">quality and
    paperwork</a>, <a class="link" href="#terms">commercial terms and restrictions</a>.</p>
    ${RFQ_SECTIONS.map(
      (sec) => html`<h2 id="${sec.id}">${sec.title}</h2>
    <div class="table-wrap">
      <table class="compare">
        <thead><tr><th scope="col">Check</th><th scope="col">Ask</th><th scope="col">Why it matters</th></tr></thead>
        <tbody>
          ${sec.checks.map((c) => html`<tr><th scope="row">${c.check}</th><td>${c.question}</td><td>${c.why}</td></tr>`)}
        </tbody>
      </table>
    </div>`,
    )}

    <h2>When the answer is “I don't know”</h2>
    <p>Ask the buyer before you quote, in one email listing every open question, rather than one question at
    a time. Where the buyer will not answer in time, quote with the assumption written in the quote's notes
    (“quoted to Rev B; drawing governs; material certs included, first-article report not included”), so
    the PO accepts your reading or the buyer corrects it before work starts. The
    <a class="link" href="${href(ctx, "/machine-shop-quote-template")}">machine shop quote template</a> has a
    notes field for exactly this, and the terms worth deciding once.</p>

    <h2>The checklist</h2>
    <p><a class="link" href="${href(ctx, `/${RFQ_CSV_FILE}`)}" download>${RFQ_CSV_FILE}</a> opens in Excel,
    Google Sheets or LibreOffice: a line at the top for the RFQ, who reviewed it and when, then one row per
    check with the columns ${RFQ_CSV_COLUMNS.join(", ")}. Save one copy per RFQ with the quote. It holds plain
    values, no formulas. Drop the rows that never apply to your work and add your own.</p>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>${SITE_NAME} does not replace the review; it puts the facts in front of the estimator and keeps the
    record. For ${helped.length} of the checks above, the hosted app does this today:</p>
    <ul>
      ${helped.map((c) => html`<li><strong>${c.check}.</strong> ${c.inApp}</li>`)}
    </ul>
    <p>${
      ctx.launch.aiReading
        ? "The AI read and the rule reader both show"
        : "Reading is by rules today (AI reading is not switched on yet), and shows"
    } each value it took next to the RFQ text it came from, unconfirmed until the estimator confirms the
    part. When something a price needs is missing, the quote shows a blocking issue instead of a guess. The
    pricing then follows your rate card:
    <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how a machining quote is built</a>.</p>
    <p class="fineprint">This page describes common practice for reviewing job-shop RFQs. It is not legal,
    export-control, tax or quality-certification advice; the standards and regulations named are for you to
    read in their current text. Check every quote before you send it.</p>
  </div>
</section>
${ctaBand(ctx, "Review and quote your next RFQ in one place", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches estimators make for material pricing ("CNC material cost",
 * "how to calculate material cost for machining", "price per pound aluminum plate quote"): sizing the
 * blank, weight from density, the four ways a shop buys stock (plate by the pound, bar by the foot,
 * whole bars, a precut piece), minimums, fallout and markup, with a worked example whose charges the
 * app's engine checks to the cent (./material-cost-example and its test in apps/jobshop-quote).
 */
export function materialCostGuidePage(ctx: RenderContext): Html {
  const e = MATERIAL_EXAMPLE;
  const r = materialCostExample(e);
  const [one, ten, hundred] = r.breaks;
  if (!one || !ten || !hundred)
    throw new Error("the material cost example quotes three quantities");
  const pctBps = (bps: number) => `${bps / 100}%`;
  const f3 = (n: number) => n.toFixed(3);
  const lbPrice = usdCents(r.pricePerLbCents);
  const barCents = (e.bar.barLengthIn / 12) * e.bar.pricePerFootCents;
  const labels: Record<(typeof METHODS)[number], string> = {
    plate: `Plate by the pound (${lbPrice}/lb, ${pctBps(e.plate.scrapBps)} scrap, ${usdCents(e.plate.minChargeCents)} minimum)`,
    barByFoot: `Flat bar by the foot used (${usdCents(e.bar.pricePerFootCents)}/ft, ${pctBps(e.bar.scrapBps)} scrap)`,
    wholeBars: `Flat bar in whole ${e.bar.barLengthIn / 12} ft bars (${r.partsPerBar} parts a bar)`,
    blankPiece: `Precut blank (${usdCents(e.blankPiece.priceCents)} each)`,
  };
  const perPart = (cents: number, q: number) => usdCents(Math.ceil(cents / q));
  const withMarkup = (cents: number) => cents + materialMarkupCents(e, cents);
  const unusedBarIn = hundred.bars * r.partsPerBar * r.cutLengthIn - hundred.starts * r.cutLengthIn;
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to calculate material cost for a machining quote</h1>
    <p class="lead">Material is the line on a machining quote that is easiest to get roughly right and
    easiest to get quietly wrong: a blank sized from the part instead of the stock, a price from last
    quarter, a supplier minimum left off a one-piece order. Here is the method, the four ways shops buy
    stock, one bracket priced all four ways at 1, ${ten.quantity} and ${hundred.quantity}, and what the
    numbers show.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>The method in five steps</h2>
    <ol>
      <li><strong>Size the blank, not the part.</strong> Take the part's envelope (its bounding box) and add
      stock on every side for facing, clamping and cleanup, then round up to a size you can buy or saw.
      Turned parts add a cut-off and facing allowance to the length and take the next bar diameter up.</li>
      <li><strong>Weigh it.</strong> Weight = length × width × thickness (or π × r² × length for round bar) ×
      density in lb/in³. Take the density from the alloy's datasheet or your supplier; a figure in g/cm³
      converts by × ${LB_PER_IN3_PER_G_PER_CM3.toFixed(7)} (16.387064 cm³ per in³ ÷ 453.59237 g per lb).</li>
      <li><strong>Price it the way you buy it.</strong> Plate cut to size is often priced by weight (per
      pound or per hundredweight, 100 lb). Bar, tube and extrusion are priced by length, and either you bill
      the length each part uses or, when the rest of the bar has no other job to go to, the whole bars the
      order needs. Precut blanks and sheets are priced per piece. Add a share for saw kerf and drop where you
      price by weight or by length used.</li>
      <li><strong>Price the parts you start, not the parts you ship.</strong> If you expect some parts to
      scrap, the order needs more blanks: parts started = parts shipped ÷ (1 − fallout), rounded up.</li>
      <li><strong>Keep the minimum and add your markup.</strong> Suppliers have minimum charges and cut
      charges; a one-off part still pays them. Then the markup on material: handling, ordering, storage and
      the cash tied up until the customer pays.</li>
    </ol>

    <h2>A worked example</h2>
    <p>A 6061 aluminum ${e.partName} whose model measures ${e.bbox.xIn} × ${e.bbox.yIn} × ${e.bbox.zIn} in,
    quoted at ${one.quantity}, ${ten.quantity} and ${hundred.quantity} with ${pctBps(e.falloutBps)} expected
    fallout and a ${pctBps(e.materialMarkupBps)} material markup. <strong>Every price, allowance and scrap
    share here is made up to show the arithmetic</strong>; they are not market prices for any metal,
    supplier or region. Use your supplier's current prices.</p>
    <ul>
      <li><strong>Blank:</strong> ${e.allowancePerSideIn} in a side on ${e.bbox.xIn} × ${e.bbox.yIn} ×
      ${e.bbox.zIn} in, rounded up to the next 1/8 in, is ${r.blank.lengthIn} × ${r.blank.widthIn} ×
      ${r.blank.thicknessIn} in: ${f3(r.blankVolumeIn3)} in³, and at ${e.plate.densityLbPerIn3} lb/in³,
      ${f3(r.blankWeightLb)} lb.</li>
      <li><strong>Plate:</strong> ${e.plate.name}, quoted by the supplier at
      ${usdCents(e.plate.pricePerCwtCents)} per hundredweight, which is ${lbPrice} a pound, plus
      ${pctBps(e.plate.scrapBps)} for kerf and drop and a ${usdCents(e.plate.minChargeCents)} minimum
      charge.</li>
      <li><strong>Flat bar:</strong> ${e.bar.sizeLabel} ${e.bar.name} at ${usdCents(e.bar.pricePerFootCents)}
      a foot, sold in ${e.bar.barLengthIn / 12} ft bars (${usdCents(barCents)} a bar). Each part takes
      ${r.blank.lengthIn} in plus ${e.bar.cutAllowanceIn} in for the saw and facing, ${r.cutLengthIn} in; after
      a ${e.bar.barRemnantIn} in end that cannot become a part, one bar gives ${r.partsPerBar} blanks.</li>
      <li><strong>Precut blank:</strong> ${e.blankPiece.name}, ${usdCents(e.blankPiece.priceCents)} a piece,
      one part each.</li>
      <li><strong>Starts:</strong> at ${pctBps(e.falloutBps)} fallout, ${one.quantity} part needs
      ${one.starts} starts, ${ten.quantity} need ${ten.starts} and ${hundred.quantity} need
      ${hundred.starts}.</li>
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">Material for the made-up bracket, before markup, for the whole line, and per part shipped (rounded up to the cent). Checked to the cent against ${SITE_NAME}'s costing engine.</caption>
        <thead><tr><th scope="col">Bought as</th>${r.breaks.map((b) => html`<th scope="col">${b.quantity} (${b.starts} started)</th>`)}</tr></thead>
        <tbody>
          ${METHODS.map(
            (m) =>
              html`<tr><th scope="row">${labels[m]}</th>${r.breaks.map(
                (b) =>
                  html`<td>${usdCents(b.materialCents[m])}<br><span class="fineprint">${perPart(b.materialCents[m], b.quantity)} a part</span></td>`,
              )}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>What the table shows:</p>
    <ul>
      <li><strong>At one part, the minimum is the price.</strong> Two plate blanks come to
      ${usdCents(one.rawCents.plate)} by weight, but the ${usdCents(e.plate.minChargeCents)} minimum is what the
      supplier bills, so it is what the quote must carry. Leave it off and a one-piece order loses it.</li>
      <li><strong>Whole bars cost the most on small orders.</strong> Buying a ${e.bar.barLengthIn / 12} ft bar
      for ${one.starts} blanks puts ${usdCents(one.materialCents.wholeBars)} on the quote against
      ${usdCents(one.materialCents.barByFoot)} for the length used. Which one is right depends on whether the
      rest of that bar has another job to go to; if it will sit on the rack, bill the bar.</li>
      <li><strong>At volume, the drop is in the bar count.</strong> ${hundred.starts} blanks at
      ${r.partsPerBar} a bar need ${hundred.bars} bars, and the last one is only partly used: it has room
      for ${hundred.bars * r.partsPerBar - hundred.starts} more blanks, about ${Math.round(unusedBarIn)} in, billed with
      the order.</li>
      <li><strong>Precut blanks cost more per part and save saw time.</strong> At ${hundred.quantity} they
      are ${usdCents(hundred.materialCents.blankPiece)} against ${usdCents(hundred.materialCents.plate)} from
      plate, a gap that has to be weighed against the sawing, squaring and handling time the plate needs,
      which belongs on the routing, not in the material line.</li>
      <li><strong>Markup comes last.</strong> At ${pctBps(e.materialMarkupBps)}, the ${hundred.quantity}-part
      plate line goes from ${usdCents(hundred.materialCents.plate)} to
      ${usdCents(withMarkup(hundred.materialCents.plate))}.</li>
    </ul>

    <h2>Mistakes that lose money on material</h2>
    <ul>
      <li><strong>Pricing from the finished part.</strong> The model's volume is what is left after
      machining; you buy the blank. On a pocketed part the blank can weigh several times the part.</li>
      <li><strong>An old price.</strong> Metal prices move from month to month. A rate card typed in once
      quotes last season's metal; date every price and check the old ones before you send.</li>
      <li><strong>Pricing the parts shipped.</strong> At 3% fallout, a hundred parts shipped means
      a hundred and four blanks bought.</li>
      <li><strong>Dropping the minimum and cut charges.</strong> They are small on a big order and most of
      the cost on a small one.</li>
      <li><strong>Mixing up the two kinds of scrap.</strong> Kerf and drop are material lost from each
      blank; fallout is whole parts lost. Count each once.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>Put each material on the rate card once, the way you buy it: by weight (a price per pound or per
    hundredweight, kept exactly as the supplier quotes it, with the density and a scrap share), by length (a
    price per foot or per metre, the cut allowance and, if you buy fixed bars, the bar length and remnant,
    so a line is charged the whole bars it needs), or by the stock piece with how many parts it yields; each
    with its minimum charge. When an RFQ comes with a STEP model, ${SITE_NAME} suggests the blank from the
    part's bounding box as above, and you can change it. Each line is priced on the parts started at the
    line's fallout, with the material markup from your rate card, and a material with no price or no blank
    size blocks the line instead of pricing it as free. Every price keeps the date it was set, and a draft
    quote warns when it prices from one older than your limit; see
    <a class="link" href="${href(ctx, "/material-price-tracking")}">material price tracking</a>. The
    charges in the table are the ones the app gives for the same inputs, checked by a test in its code.</p>
    <p>For the rest of the price (setups, cycle time, outside processes and quantity breaks), see
    <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to quote a CNC machining job</a>
    and <a class="link" href="${href(ctx, "/how-to-estimate-cnc-machining-time")}">how to estimate CNC
    machining time</a>.</p>
    <p class="fineprint">This page explains a common estimating method. It is not engineering, accounting
    or financial advice, it does not quote metal prices, and the figures in it are made up. Check every
    quote before you send it.</p>
  </div>
</section>
${ctaBand(ctx, "Price your material the way you buy it", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches shops make when they set price breaks ("quantity price breaks",
 * "machining price breaks", "how to set quantity breaks on a quote", "volume pricing machined parts").
 * The CNC guide's made-up bracket at eight quantities, the most one line in the app carries, priced in
 * ./quantity-breaks to the cent the app's costing engine gives
 * (apps/jobshop-quote/test/unit/site-quantity-breaks.test.ts). No industry figures are quoted.
 */
export function quantityBreaksGuidePage(ctx: RenderContext): Html {
  const e = BREAKS_EXAMPLE;
  const r = quantityBreaks();
  const byQ = (q: number) => {
    const b = r.breaks.find((x) => x.quantity === q);
    const s = r.shares.find((x) => x.quantity === q);
    if (!b || !s) throw new Error(`the quantity breaks guide quotes ${q}`);
    return { b, s };
  };
  const one = byQ(1);
  const hundred = byQ(100);
  const last = byQ(BREAK_QUANTITIES[BREAK_QUANTITIES.length - 1] ?? 1);
  const ib = r.inBetween;
  const releases = last.b.quantity / hundred.b.quantity;
  const releasesTotal = hundred.b.totalCents * releases;
  const pctOf = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
  const each = (c: number) => usdCents(Math.round(c));
  const qty = (q: number) => q.toLocaleString("en-US");
  const rows: [string, (q: number) => string][] = [
    ["Parts started", (q) => qty(byQ(q).b.starts)],
    ["Setup each", (q) => each(byQ(q).s.setupEach)],
    ["Run time each", (q) => each(byQ(q).s.runEach)],
    ["Material each", (q) => each(byQ(q).s.materialEach)],
    ["Anodize each", (q) => each(byQ(q).s.finishingEach)],
    ["Markup each", (q) => each(byQ(q).s.markupEach)],
    ["Price each", (q) => usdCents(byQ(q).b.unitPriceCents)],
    ["Line total", (q) => usdCents(byQ(q).b.totalCents)],
    ["Setup share of the price", (q) => pctOf(byQ(q).s.setupShare, 1)],
    ["Above the long-run floor", (q) => pctOf(byQ(q).s.overFloor, 1)],
  ];
  const lineMinimumNote =
    r.lineMinimumBreaks.length === 0
      ? html`The ${usdCents(e.minimumLineCents)} line minimum never applies here: even one bracket costs more
      than that. On a cheaper part it lifts the smallest breaks to the same total, so a buyer pays the
      same for one part as for several; quote those breaks anyway, so the buyer sees why.`
      : html`The ${usdCents(e.minimumLineCents)} line minimum lifts the ${r.lineMinimumBreaks.join(", ")}
      break${r.lineMinimumBreaks.length === 1 ? "" : "s"} to the same total.`;
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to set quantity price breaks on machined parts</h1>
    <p class="lead">The price each falls with quantity because some costs are paid once per lot and the rest
    once per part. Work out which is which and you can tell where a break earns its place, where the price
    has stopped falling, and what to charge for an order between two breaks. Here is the method and one part
    worked at ${BREAK_QUANTITIES.length} quantities.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>Why the price each falls</h2>
    <p>Every cost on a machined part belongs to one of two kinds:</p>
    <ul>
      <li><strong>Once per lot:</strong> programming, setups, the first-article check, and the minimum
      charges (the anodizer's lot charge, the supplier's material minimum, your own minimum per line). They
      cost the same for one part or five hundred.</li>
      <li><strong>Once per part:</strong> cycle time, loading and deburring, the blank, the vendor's per-part
      charge. They grow with every part started, scrap included.</li>
    </ul>
    <p>So the price each is roughly <em>per-part cost + once-per-lot cost ÷ quantity</em>. The first term is
    a floor the price never goes below; the second falls fast and then hardly at all. A quantity break is
    worth quoting where the second term still matters.</p>

    <h2>A worked example at ${BREAK_QUANTITIES.length} quantities</h2>
    <p>The same ${e.partName} as in <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to
    quote a CNC machining job</a>: ${e.materialName}, two milling setups and a deburr on a
    ${e.machineName} at ${usdCents(e.hourlyRateCents)} an hour, clear anodize by a vendor at
    ${usdCents(e.finishingPerPartCents)} a part with a ${usdCents(e.finishingLotChargeCents)} lot charge,
    a ${usdCents(e.materialMinChargeCents)} material minimum, ${e.falloutBps / 100}% expected fallout, and a
    ${usdCents(e.minimumLineCents)} minimum per line. <strong>Every number is made up to show the
    arithmetic</strong>; none is a typical price, time or rate. Use your own.</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The made-up bracket at each break, per part shipped. Each component is priced for the whole lot, rounded to the cent, then divided by the quantity; the price each is rounded up to the cent. The floor is the price each as the quantity grows without end (${each(r.floorEachCents)}).</caption>
        <thead><tr><th scope="col">Per part</th>${BREAK_QUANTITIES.map((q) => html`<th scope="col">${qty(q)}</th>`)}</tr></thead>
        <tbody>
          ${rows.map(
            ([label, cell]) =>
              html`<tr><th scope="row">${label}</th>${BREAK_QUANTITIES.map((q) => html`<td>${cell(q)}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>What the table shows:</p>
    <ul>
      <li><strong>Fallout rounds up to whole parts.</strong> ${e.falloutBps / 100}% expected scrap means
      starting ${one.b.starts} brackets to ship one, so the one-off pays run time on
      ${one.b.starts} parts (${each(one.s.runEach)}, against ${each(hundred.s.runEach)} each at
      ${qty(hundred.b.quantity)}). On small lots the extra part is the honest price of the risk; leave it out
      and a one-off that scraps is made twice and paid for once.</li>
      <li><strong>Setup decides the small breaks.</strong> At one part, setup is
      ${pctOf(one.s.setupShare, 1)} of the price; it falls under a tenth of the price each from
      ${qty(r.setupTenthAt)} parts. Most of the fall from ${usdCents(one.b.unitPriceCents)} to
      ${usdCents(hundred.b.unitPriceCents)} each happens before then.</li>
      <li><strong>Each minimum stops applying at its own quantity.</strong> The material minimum covers
      orders under ${qty(r.materialMinimumEndsAt)}; the anodizer's lot charge covers every order under
      ${qty(r.lotChargeEndsAt)}, so up to ${qty(r.lotChargeEndsAt - 1)} parts the anodize costs the same
      ${usdCents(e.finishingLotChargeCents)} in all. ${lineMinimumNote}</li>
      <li><strong>Past a point the breaks stop meaning much.</strong> The floor is ${each(r.floorEachCents)}
      a part: run time, the blank and the per-part anodize, marked up, over the
      ${100 - e.falloutBps / 100}% that ship good. At ${qty(hundred.b.quantity)} the price is
      ${pctOf(hundred.s.overFloor, 1)} above it, at ${qty(last.b.quantity)} ${pctOf(last.s.overFloor, 1)}.
      A lower price at volume has to come from a shorter cycle, a better blank or a cheaper vendor, not
      from the break.</li>
    </ul>

    <h2>Choosing which breaks to quote</h2>
    <ol>
      <li><strong>Quote what the RFQ asks for first.</strong> The buyer's quantities, and the yearly or
      release quantity if the RFQ gives one. A break nobody will order is noise on the quote.</li>
      <li><strong>Add the small lot you would rather not run.</strong> One or a few parts, priced honestly,
      shows the buyer what a short run costs and stops a one-off being ordered at the volume price.</li>
      <li><strong>Put breaks just past where a minimum ends.</strong> Here the lot charge stops applying at
      ${qty(r.lotChargeEndsAt)}: a break at ${qty(r.lotChargeEndsAt - 1)} still pays the whole lot charge,
      one at ${qty(ib.upper.quantity)} spreads it as far as it goes.</li>
      <li><strong>Stop where the price stops falling.</strong> Once a break is within a few percent of the
      floor, a larger one tells the buyer little; a separate quote for a blanket order is clearer.</li>
    </ol>

    <h2>Orders that fall between two breaks</h2>
    <p>The buyer saw ${qty(ib.lower.quantity)} at ${usdCents(ib.lower.unitPriceCents)} and
    ${qty(ib.upper.quantity)} at ${usdCents(ib.upper.unitPriceCents)}, and sends a PO for
    ${qty(ib.quantity)}. Three ways to price it:</p>
    <ul>
      <li><strong>At the lower break's price each:</strong> ${qty(ib.quantity)} × ${usdCents(ib.lower.unitPriceCents)}
      = ${usdCents(ib.atLowerTotalCents)}. Safe for the shop, and the usual written rule.</li>
      <li><strong>Priced on its own:</strong> ${usdCents(ib.own.unitPriceCents)} each,
      ${usdCents(ib.own.totalCents)}, by the same arithmetic as the breaks
      (${qty(ib.own.starts)} parts started).</li>
      <li><strong>At the upper break's price each,</strong> which is what a buyer will ask for:
      ${usdCents(ib.atUpperTotalCents)}, ${usdCents(ib.own.totalCents - ib.atUpperTotalCents)} under the
      order's own price. The setup and the lot charge are spread over fewer parts than that price
      assumed.</li>
    </ul>
    <p>Whichever you choose, write it in the quote's terms ("quantities between breaks are priced at the
    next lower break") so the PO accepts it before work starts. The
    <a class="link" href="${href(ctx, "/machine-shop-quote-template")}">machine shop quote template</a>
    lists the other terms worth deciding once, overruns and underruns among them; add this one beside
    them.</p>

    <h2>Releases are lots too</h2>
    <p>A buyer who orders ${qty(last.b.quantity)} but takes them in ${releases} releases of
    ${qty(hundred.b.quantity)} pays you for ${releases} setups. Priced as ${releases} runs of
    ${qty(hundred.b.quantity)}, the order is ${usdCents(releasesTotal)}; as one run of
    ${qty(last.b.quantity)}, ${usdCents(last.b.totalCents)}. The ${usdCents(releasesTotal - last.b.totalCents)}
    difference is the setups and smaller spreads you would give away by quoting the yearly quantity's
    price for release-sized runs. Price the run you will actually make, or quote the yearly price on the
    condition that the shop runs the whole quantity at once and holds the stock.</p>

    <h2>Mistakes that lose money</h2>
    <ul>
      <li><strong>Discounting by a percentage table.</strong> "10% off at 50, 20% off at 100" ignores where
      your costs actually sit; on this part the price each at ${qty(hundred.b.quantity)} is
      ${pctOf(1 - hundred.b.unitPriceCents / one.b.unitPriceCents)} below the one-off, and on a part with a
      short setup it would be far less.</li>
      <li><strong>Pricing every break from the one-off's starts.</strong> Fallout and scrap are per part
      started; each break needs its own count.</li>
      <li><strong>Forgetting the vendor's minimum below its break-even.</strong> Under the lot charge's
      quantity, the outside service is a fixed cost, not a per-part one.</li>
      <li><strong>Letting a PO quantity pick its own price.</strong> Without a written rule the buyer reads
      the nearest break in their favour.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>Each quote line in ${SITE_NAME} carries up to eight quantity breaks, each priced on its own parts
    started, with the material, setup, run time, finishing, markup and line minimum worked out per break and
    the rate behind every figure listed under the table; the same quantity twice is refused. The quote PDF
    prints the price each at every break and none of the costs. A customer accepting the quote online can
    pick only the breaks it carries; any other quantity needs a new quote, so a PO never picks its own
    price. The example above is priced to the cent the app gives for the same inputs, checked by a test in
    its code. You can <a class="link" href="${href(ctx, "/how-it-works")}">see how a quote is built</a>.</p>
    <p>For the rate behind the setup and run time, see
    <a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">how to work out a machine shop hourly
    rate</a>; for the cycle time itself,
    <a class="link" href="${href(ctx, "/how-to-estimate-cnc-machining-time")}">how to estimate CNC machining
    time</a>.</p>
    <p class="fineprint">This page explains a common costing method. It is not accounting, tax, legal or
    financial advice, and the prices, times and rates in it are made up. Check every quote before you send
    it.</p>
  </div>
</section>
${ctaBand(ctx, "Quote every break from your own rates", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches shops make when a customer needs parts sooner than the normal lead
 * time ("how to price a rush job", "expedite fee machine shop", "rush charge CNC", "how much to charge
 * for rush orders"). The CNC guide's made-up bracket quoted twice, normal and rush, with the rush costs
 * as their own lines (overtime rate, the bumped job, same-day material, the anodizer's expedite),
 * priced in ./rush-example to the cent the app's costing engine gives
 * (apps/jobshop-quote/test/unit/site-rush-example.test.ts), and set against a flat surcharge.
 */
export function rushGuidePage(ctx: RenderContext): Html {
  const r = RUSH;
  const rows = compareRush(r);
  const [one, ten, hundred] = rows;
  if (!one || !ten || !hundred) throw new Error("the rush guide example quotes three quantities");
  const line = rushLine(r);
  const normalRate = line.machines[0]?.hourlyRateCents ?? 0;
  const overtimeRate = line.machines[1]?.hourlyRateCents ?? 0;
  const otOps = r.overtimeOperations
    .map((i) => line.operations[i]?.label ?? "")
    .filter(Boolean)
    .map((l) => `“${l}”`);
  const pctBps = (bps: number) =>
    `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  const qty = (q: number) => `${q.toLocaleString("en-US")} ${q === 1 ? "part" : "parts"}`;
  const bumpedCents = Math.round((r.bumpedJobMinutes / 60) * normalRate);
  const under = rows.filter((c) => c.flatMinusRushCents < 0);
  const over = rows.filter((c) => c.flatMinusRushCents > 0);
  const lines: [string, (c: (typeof rows)[number]) => string][] = [
    ["Normal lead time: line total", (c) => usdCents(c.normal.totalCents)],
    ["Rush: setups (incl. the bumped job)", (c) => usdCents(c.rush.setupCents)],
    ["Rush: run time", (c) => usdCents(c.rush.runCents)],
    ["Rush: anodize, expedited", (c) => usdCents(c.rush.finishingCents)],
    ["Rush: same-day plate delivery", (c) => usdCents(c.rush.extrasCents)],
    ["Rush: line total", (c) => usdCents(c.rush.totalCents)],
    ["What the rush adds", (c) => `${usdCents(c.premiumCents)} (${pctBps(c.premiumBps)})`],
    [`Normal + flat ${pctBps(r.flatSurchargeBps)}`, (c) => usdCents(c.flatCents)],
    [
      "Flat surcharge vs the costed rush",
      (c) =>
        c.flatMinusRushCents < 0
          ? `${usdCents(-c.flatMinusRushCents)} short`
          : `${usdCents(c.flatMinusRushCents)} over`,
    ],
  ];
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to price a rush job in a machine shop</h1>
    <p class="lead">A rush costs the shop real money: overtime, the job it pushes aside, material and
    outside processing bought fast. A flat expedite fee guesses at that. Here is how to cost a rush the
    way you cost any job, a worked example at ${one.quantity}, ${ten.quantity} and ${hundred.quantity}
    parts, and why one percentage cannot be right at every quantity.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>What a rush actually costs</h2>
    <ol>
      <li><strong>Hours at a higher rate.</strong> Work done on overtime, a second shift or a weekend
      costs the operator's premium and the payroll costs on it. Price those hours at a second rate for
      the same machine, not by stretching the cycle time.</li>
      <li><strong>The job it bumps.</strong> If another customer's job is set up on the machine you
      need, pulling it off means tearing it down now and setting it up again later. That setup is paid
      twice, and the rush is what causes it.</li>
      <li><strong>Material bought fast.</strong> Same-day or next-day delivery, a cut-to-size charge
      from a distributor's counter, or a price above your usual supplier's for stock that is on a shelf
      today.</li>
      <li><strong>Outside processing expedited.</strong> Platers, anodizers, heat treaters and coaters
      often run an expedited service at a higher price or a higher lot minimum. Ask them; their quote
      is the number to use.</li>
      <li><strong>Inspection and paperwork on the same clock.</strong> A first article, certs or a
      customer's source inspection still have to happen, now inside the shorter window.</li>
      <li><strong>The promises you move.</strong> Other jobs ship later. That is not a line on this
      quote, but it is a reason to decide whether to take the rush at all, and what lead time you can
      actually promise without breaking the others.</li>
    </ol>

    <h2>A worked example</h2>
    <p>The ${QUOTE_EXAMPLE.partName} from the <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">CNC
    quoting guide</a>, quoted at its normal lead time there, and here again as a rush.
    <strong>Every number is made up to show the arithmetic</strong>; none is a typical overtime premium,
    expedite price or surcharge for any region or trade. Use your own.</p>
    <ul>
      <li><strong>Overtime:</strong> ${otOps.join(", ")} run on overtime, at the mill's
      ${usdCents(normalRate)} an hour plus a ${usdCents(r.overtimePremiumCents)} premium =
      ${usdCents(overtimeRate)} an hour. Programming and the first-article check stay on the normal shift
      at ${usdCents(normalRate)}.</li>
      <li><strong>The bumped job:</strong> ${r.bumpedJobMinutes} min to tear down the job that was on the
      mill and set it up again later, at the normal rate: ${usdCents(bumpedCents)}, once per order.</li>
      <li><strong>Material:</strong> the same plate and price per pound, plus
      ${usdCents(r.materialDeliveryCents)} for same-day delivery, once per order.</li>
      <li><strong>${r.finishing.name}:</strong> ${usdCents(r.finishing.perPartCents)} a part, minimum
      ${usdCents(r.finishing.lotChargeCents)} a lot (the normal service in the CNC guide is cheaper).</li>
      <li><strong>Markups:</strong> as in the CNC guide; the delivery charge is a purchased item, so it
      takes the material markup.</li>
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The made-up bracket, normal and rush, at three quantities. Each component is rounded to the cent, then summed; the price each is rounded up to the cent.</caption>
        <thead><tr><th scope="col">Line</th>${rows.map((c) => html`<th scope="col">${qty(c.quantity)}</th>`)}</tr></thead>
        <tbody>
          ${lines.map(
            ([label, cell]) =>
              html`<tr><th scope="row">${label}</th>${rows.map((c) => html`<td>${cell(c)}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>What the table shows:</p>
    <ul>
      <li><strong>The rush adds a different share at every quantity.</strong> Costed line by line it
      adds ${pctBps(one.premiumBps)} at ${qty(one.quantity)}, ${pctBps(ten.premiumBps)} at
      ${qty(ten.quantity)} and ${pctBps(hundred.premiumBps)} at ${qty(hundred.quantity)}. The bumped
      setup, the delivery and the anodizer's higher minimum are fixed per order, so they weigh most on a
      small lot; the overtime premium grows with the hours, so it is most of the rush on a large one.</li>
      <li><strong>A flat ${pctBps(r.flatSurchargeBps)} is wrong both ways.</strong> It comes up
      ${under.map((c) => `${usdCents(-c.flatMinusRushCents)} short at ${qty(c.quantity)}`).join(" and ")}${
        over.length
          ? html`, and charges ${over.map((c) => `${usdCents(c.flatMinusRushCents)} more than the rush costs at ${qty(c.quantity)}`).join(" and ")}`
          : ""
      }. Short means the shop pays for the customer's deadline; over means the shop is easier to beat
      on the next rush.</li>
      <li><strong>If you want a margin for the disruption, add it on purpose.</strong> Cost the rush,
      then add a premium you choose for the promises it moves. Then you know what the premium is and
      what is just cost.</li>
    </ul>

    <h2>Before you say yes</h2>
    <ul>
      <li><strong>Check the machines, not your memory.</strong> Which jobs are on the machines this
      operation needs, and when do they finish? A rush that only fits by making two other jobs late is
      a decision, not a quote.</li>
      <li><strong>Call the outside vendors first.</strong> An anodizer or heat treater who cannot do it
      in time sets the lead time, whatever your own shop can do.</li>
      <li><strong>Quote the rush and the normal lead time side by side.</strong> Two lines, two dates,
      two prices. The customer picks, and the rush price reads as a choice, not a penalty.</li>
      <li><strong>Write the date as a condition.</strong> "Ships N working days after the order and the
      approved drawing" protects the date from a purchase order that arrives two days late.</li>
      <li><strong>Keep the rush in its own lines.</strong> Priced as separate lines, or as its own
      revision of the quote, the rush can be taken off again: when the same part comes back on a normal
      lead time, it is the normal price that gets reused, not last time's expedite.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>${SITE_NAME} has no rush switch: a rush is priced like any other line, with the rush costs typed
    in. Add the overtime rate as a second machine on your rate card ("${line.machines[1]?.name ?? ""}"),
    put the operations that run on overtime on it, add the bumped job as an operation with setup only,
    the expedited service as its own finishing operation with its lot minimum, and the delivery as an
    extra per order. Every quantity break then follows, each figure showing the rate it came from. The
    example above is priced to the cent the app gives for the same inputs, checked by a test in its code.
    To see whether a date needs a rush at all, the app's
    <a class="link" href="${href(ctx, "/machine-shop-lead-time")}">shop load and lead time</a> page
    places your open jobs on the machines and gives each quantity break a lead time behind them. Revise a
    sent quote to offer the rush as a second version.</p>
    <p>The rest of the price: <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">how to
    quote a CNC machining job</a>, <a class="link" href="${href(ctx, "/machine-shop-hourly-rate")}">how
    to work out a machine shop hourly rate</a>, and what goes on the quote you send, the
    <a class="link" href="${href(ctx, "/machine-shop-quote-template")}">machine shop quote template</a>.</p>
    <p class="fineprint">This page explains a common costing method. It is not accounting, tax, legal or
    financial advice, it does not say what overtime pay the law requires, and the rates, premiums,
    prices and times in it are made up. Check every quote before you send it.</p>
  </div>
</section>
${ctaBand(ctx, "Quote your next rush with every cost on it", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/**
 * A guide aimed at the searches aerospace and defense job shops make about first articles ("how to
 * quote first article inspection", "AS9102 FAI cost", "first article inspection charge"): what an
 * AS9102 first article is and is not, what the work takes, when a partial one is due, and how to put
 * it on the quote, with a worked example whose prices the app's engine checks to the cent
 * (./fai-example and its test in apps/jobshop-quote).
 */
export function faiGuidePage(ctx: RenderContext): Html {
  const e = FAI_EXAMPLE;
  const results = priceFaiExample(e);
  const byKey = (k: FaiVariant["key"]) => {
    const r = results.find((x) => x.key === k);
    const v = e.variants.find((x) => x.key === k);
    if (!r || !v) throw new Error(`the first-article example has no ${k} variant`);
    return { r, v };
  };
  const none = byKey("none");
  const full = byKey("full");
  const delta = byKey("delta");
  const [one, ten, hundred] = full.r.breaks;
  if (!one || !ten || !hundred)
    throw new Error("the first-article example quotes three quantities");
  const b = e.base;
  const rate = usdCents(e.inspectionHourlyRateCents);
  const firstPiece = b.operations.find((o) => /first-article/i.test(o.label));
  const addedTotal = (k: FaiVariant["key"], j: number) =>
    (byKey(k).r.breaks[j]?.totalCents ?? 0) - (none.r.breaks[j]?.totalCents ?? 0);
  const addedUnit = (k: FaiVariant["key"], j: number) =>
    (byKey(k).r.breaks[j]?.unitPriceCents ?? 0) - (none.r.breaks[j]?.unitPriceCents ?? 0);
  const certMarkup = Math.round(
    full.v.extras.reduce((s, x) => s + x.lotCents, 0) * (b.materialMarkupBps / 10_000),
  );
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How to quote first article inspection (AS9102)</h1>
    <p class="lead">An aerospace PO that calls for a first article inspection report asks for hours of
    work that never touch a machine: ballooning the drawing, measuring every characteristic on the first
    part and filling in the forms. On a small order that work can cost more than the machining, and it is
    the line shops most often leave off. Here is what the work is, when a partial first article is due,
    and one part priced with and without it at ${one.quantity}, ${ten.quantity} and
    ${hundred.quantity}.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>What a first article is, and what it is not</h2>
    <p>AS9102 is the aerospace standard for first article inspection (FAI): a documented check, on a part
    from the first production run, that every design characteristic on the drawing and every requirement
    on the PO was met. It is recorded on three forms:</p>
    <ul>
      <li><strong>Form 1, part number accountability:</strong> the part, its drawing and revision, and any
      sub-assemblies.</li>
      <li><strong>Form 2, product accountability:</strong> the raw material, the specifications, the special
      processes (plating, anodizing, heat treat and the like) and any functional tests, each with the
      certificate that proves it.</li>
      <li><strong>Form 3, characteristic accountability:</strong> every dimension, tolerance and note on
      the drawing, numbered (ballooned) on the drawing and listed with its measured result.</li>
    </ul>
    <p>A first-piece check is not a first article. Measuring the critical features of the first part off
    the machine before running the rest is part of the setup, and the
    <a class="link" href="${href(ctx, "/how-to-quote-cnc-machining")}">CNC quoting guide</a> prices it as
    such (${firstPiece?.setupMinutes ?? 0} minutes on the mill). An AS9102 report is a separate job with a
    separate deliverable, and it stays on the routing in every variant below. Which revision of AS9102
    applies, and whether the customer accepts their own form or software output, is set by the PO and
    its quality clauses: read them before you price.</p>

    <h2>What the work takes</h2>
    <ol>
      <li><strong>Balloon the drawing.</strong> Number every characteristic: each dimension, tolerance,
      thread, surface finish, note and flag note. A busy drawing can carry well over a hundred.</li>
      <li><strong>Plan the inspection.</strong> Decide which gauge or CMM program checks each one; a CMM
      program written for the first article is time too.</li>
      <li><strong>Measure the first part.</strong> Every characteristic, with the result written down, not
      just a pass.</li>
      <li><strong>Collect the certificates.</strong> Mill certs for the material and a certificate from
      every special-process vendor, some of whom charge for one.</li>
      <li><strong>Fill in the forms and file them.</strong> And answer the customer's questions when their
      quality team reviews the package.</li>
    </ol>
    <p>None of that scales with quantity: it is the same for one part as for a thousand, so it belongs in
    the quote as a charge per line or per order, not per part.</p>

    <h2>A worked example</h2>
    <p>The anodized 6061 ${b.partName} from the CNC quoting guide, now for a customer whose PO calls for
    an AS9102 first article. Inspection time is charged at ${rate} an hour (a CMM and bench rate of its
    own, lower than the mill's ${usdCents(b.hourlyRateCents)}). <strong>Every time, rate and price here is
    made up to show the arithmetic</strong>; none of it is a benchmark for what a first article takes or
    costs, and AS9102 sets no price.</p>
    <ul>
      ${[full, delta].map(
        ({ r, v }) =>
          html`<li><strong>${v.label}:</strong> ${v.inspection.map((o) => `${o.label.charAt(0).toLowerCase() + o.label.slice(1)} (${o.setupMinutes} min)`).join(", ")}${
            v.extras.length > 0
              ? html`, plus the ${v.extras.map((x) => `${x.label.charAt(0).toLowerCase()}${x.label.slice(1)} (${usdCents(x.lotCents)})`).join(", ")}`
              : ""
          }: ${r.inspectionMinutes} minutes, ${usdCents(r.faiCostCents)} before markup.</li>`,
      )}
    </ul>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">The made-up bracket's price per part and for the line, by first-article variant. Checked to the cent against ${SITE_NAME}'s costing engine.</caption>
        <thead><tr><th scope="col">Variant</th>${full.r.breaks.map((br) => html`<th scope="col">${br.quantity}</th>`)}</tr></thead>
        <tbody>
          ${[none, full, delta].map(
            ({ r, v }) =>
              html`<tr><th scope="row">${v.label}</th>${r.breaks.map(
                (br) =>
                  html`<td>${usdCents(br.unitPriceCents)} each<br><span class="fineprint">${usdCents(br.totalCents)} for the line</span></td>`,
              )}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>What the table shows:</p>
    <ul>
      <li><strong>On one part, the first article is ${Math.round((100 * addedTotal("full", 0)) / (full.r.breaks[0]?.totalCents ?? 1))}% of the price.</strong> The full report adds
      ${usdCents(addedTotal("full", 0))} to a ${usdCents(none.r.breaks[0]?.totalCents ?? 0)} part
      (${usdCents(full.r.faiCostCents)} of inspection and certificate, and ${usdCents(certMarkup)} of markup
      on the certificate). Quote it without that line and the shop does that work for nothing.</li>
      <li><strong>Spread over the order, it fades.</strong> At ${ten.quantity} parts it adds
      ${usdCents(addedUnit("full", 1))} a part; at ${hundred.quantity}, ${usdCents(addedUnit("full", 2))}. The
      charge is the same; only the share each part carries changes.</li>
      <li><strong>A partial first article is a smaller charge, not none.</strong> After a revision that
      changes a few characteristics, re-ballooning and measuring only those, and updating the forms, adds
      ${usdCents(addedTotal("delta", 0))} to the line here, against ${usdCents(addedTotal("full", 0))} for a
      full one.</li>
    </ul>

    <h2>When a new or partial first article is due</h2>
    <p>Once a part has a complete first article, repeat orders do not need another, until something
    changes. The events AS9102 lists include a change to the design that affects the part's
    characteristics, a change in the manufacturing source, process, inspection method, location,
    tooling or materials, and a lapse in production (two years in the standard). The customer can ask for
    more. A partial ("delta") first article covers only what the change affected. So check, on every repeat
    RFQ: has the revision changed, has anything about how you make it changed, and when did you last ship
    it? Your own records answer the last two; the drawing answers the first.</p>

    <h2>How to put it on the quote</h2>
    <ul>
      <li><strong>Price it as time, at an inspection rate.</strong> Minutes on the inspection bench or the
      CMM, charged once per line, the same way you charge a setup.</li>
      <li><strong>Say it on the quote.</strong> "Includes AS9102 first article report" or "first article
      report not included" in the notes settles the question before the PO arrives, not after. When a
      customer wants it priced separately, give it a line of its own at quantity one.</li>
      <li><strong>Carry the vendors' certificate charges.</strong> They are small and easy to forget.</li>
      <li><strong>Do not charge it again on a repeat order that does not need it,</strong> and do not
      forget the partial one when the revision changes.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>Add your inspection bench or CMM to the rate card as a machine with its own rate. On a quote line,
    add the first article as operations on that machine with setup minutes and a cycle time of zero (the
    app accepts zero for setup-only work such as programming or a first article), and a certificate
    charge as an extra with a lot amount. The app then charges it once for the line, spreads it across
    each quantity break, and prints the per-part prices. The prices in the table are the ones the app gives
    for the same inputs, checked by a test in its code. Once the RFQ's drawing PDF is in, the RFQ page
    also has a "First article list" download: a draft of Form 3's characteristic list read from the
    drawing's text (toleranced dimensions with their limits, geometric tolerances, threads, finishes,
    numbered notes, material and finish), numbered so the numbers can be the balloon numbers. It is a
    draft to check against the drawing: a dimension with no text on the PDF, or a scanned drawing,
    is not in it. ${SITE_NAME} does not fill in Forms 1 and 2, draw the balloons or record results. The
    <a class="link" href="${href(ctx, "/rfq-review-checklist")}">RFQ review checklist</a> has the question
    to ask before you price: is a first article required, and to which standard?</p>
    <p class="fineprint">This page explains a common estimating approach and summarises a published
    standard in plain words. It is not quality, legal or engineering advice, it is not a substitute for
    the standard or your customer's requirements, and the figures in it are made up. Check every quote
    before you send it.</p>
  </div>
</section>
${ctaBand(ctx, "Put the first article on the quote, every time", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

export function toleranceGuidePage(ctx: RenderContext): Html {
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Guide</p>
    <h1>How tolerances change a machining quote</h1>
    <p class="lead">Two drawings of the same part can cost very different amounts to make, and the
    difference is often one callout: a bore at ±.005 is a drill and a pass, the same bore at ±.0005 can be
    a reamer, a slower finish, a gauge and a check on every part. Here is how to read a tolerance as a
    zone, the four bands estimators sort them into, what ISO 2768 and fits like H7 mean in inches, and
    where the cost goes on the quote.</p>
  </div>
</section>
<section class="band">
  <div class="container prose">
    <h2>Read a tolerance as a zone</h2>
    <p>A tolerance is the room a dimension has to vary. What decides how hard it is to hold is the full
    width of that room, the <strong>tolerance zone</strong>, not how it is written. ±.001 is a zone of
    .002 in; +.002/-.000 is a zone of .002 in too, with all of it on one side. A tight one-sided tolerance
    can be as hard as a looser-looking bilateral one, so convert every callout to its zone before you
    compare them. On a drawing, the tightest zone usually sets the process, the machine and the inspection
    for the whole part.</p>

    <h2>Four bands, and what each asks of the shop</h2>
    <p>Estimators sort tolerances into rough bands. The limits below are shop-floor rules of thumb, not a
    standard: what counts as tight depends on the material, the feature, its size and your machines. They
    are the defaults ${SITE_NAME}'s tolerance check uses.</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">Tolerance bands by zone, in inches. Rules of thumb, not a standard.</caption>
        <thead><tr><th scope="col">Band</th><th scope="col">Tolerance</th><th scope="col">What it usually asks</th></tr></thead>
        <tbody>
          ${TOLERANCE_BANDS.map((b) => html`<tr><th scope="row">${b.label}</th><td>${b.range}</td><td>${b.asks}</td></tr>`)}
        </tbody>
      </table>
    </div>

    <h2>Callouts as they arrive, read as zones</h2>
    <p>RFQs bring tolerances in every form: thousandths in an email, millimetres with a comma decimal from
    a European customer, a general tolerance class in the title block, a fit symbol on a bore. Each row
    below is read by the same code that reads an RFQ in ${SITE_NAME}, and a test in the app checks that
    this table matches what it shows.</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">Each callout's full zone in inches and millimetres, and its band. * The zone depends on the feature's size; shown for the size named.</caption>
        <thead><tr><th scope="col">Callout</th><th scope="col">Means</th><th scope="col">Zone</th><th scope="col">Band</th></tr></thead>
        <tbody>
          ${TOLERANCE_CALLOUTS.map(
            (c) =>
              html`<tr><th scope="row"><code>${c.callout}</code></th><td>${c.means}</td><td>${inchZone(c.zoneIn)} in<br><span class="fineprint">${(c.zoneIn * 25.4).toFixed(3)} mm</span>${c.sizeAssumed ? " *" : ""}</td><td>${TOLERANCE_BANDS.find((b) => b.band === c.band)?.label ?? c.band}</td></tr>`,
          )}
        </tbody>
      </table>
    </div>

    <h2>ISO 2768: the general tolerance in the title block</h2>
    <p>A drawing that says "ISO 2768-m" (often with a second letter, K, H or L, for the geometric
    tolerances) sets the tolerance of every dimension that has none of its own. The value grows with the
    size of the dimension. The linear values from ISO 2768-1, in millimetres either way:</p>
    <div class="table-wrap">
      <table class="compare">
        <caption class="fineprint">ISO 2768-1 general tolerances for linear dimensions, ± mm, by nominal size in mm. Larger sizes are in the standard.</caption>
        <thead><tr><th scope="col">Class</th>${ISO2768_RANGES.map((r) => html`<th scope="col">over ${r}</th>`)}</tr></thead>
        <tbody>
          ${ISO2768_ROWS.map(
            (r) =>
              html`<tr><th scope="row">${r.cls} (${r.name})</th>${r.plusMinusMm.map((v) => html`<td>${v === null ? "—" : `±${v}`}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </div>
    <p>The first column starts at 0.5 mm and the others start just above the size named, so "over 6–30"
    means over 6 up to 30 mm. A general class rarely sets the price on its own: "fine" on a 20 mm dimension
    is ±0.1 mm, about ±.004 in, a close tolerance most CNC work holds. The dimensions toleranced on their
    own are the ones to look for.</p>

    <h2>Fits: H7, g6 and the rest</h2>
    <p>A letter and number on a bore or a pin (H7, h6, H7/g6) is an ISO 286 fit. The letter places the
    zone relative to the nominal size; the number is the IT grade, which sets its width, and that width
    grows with the size. On an 18 to 30 mm feature, IT6 is 13 µm (about .0005 in) and IT7 is 21 µm
    (about .0008 in): an H7 bore of that size is a precision feature by the bands above, which is why it
    usually means a reamer or a boring bar and a bore gauge, not a drill. Look up the size you have in
    the standard's tables before you quote it.</p>

    <h2>Where the cost goes on the quote</h2>
    <p>Tolerance has no price of its own. It costs money through the work it adds, and that work belongs
    on the quote line where you can see it:</p>
    <ul>
      <li><strong>Run time.</strong> Finish passes at a lighter cut, a slower feed, a spring pass, tool
      changes to keep wear in check. Add the minutes to the operation's cycle time; the
      <a class="link" href="${href(ctx, "/how-to-estimate-cnc-machining-time")}">machining time guide</a>
      shows how cycle time builds up.</li>
      <li><strong>An extra operation.</strong> Reaming, honing or grinding to size is an operation of its
      own, in house or as an
      <a class="link" href="${href(ctx, "/how-to-quote-outside-processing")}">outside process</a>.</li>
      <li><strong>Inspection.</strong> A gauge you need to buy or calibrate, a CMM program, checking every
      part instead of a sample. Inspection time is setup minutes on an inspection machine, charged once
      per line, the same way the
      <a class="link" href="${href(ctx, "/how-to-quote-first-article-inspection")}">first article guide</a>
      prices it.</li>
      <li><strong>Fallout.</strong> The tighter the zone, the more parts land outside it. Start more parts
      than the order: a fallout percentage on the line does this.</li>
      <li><strong>Or a question.</strong> A tolerance tighter than the part's function needs is common.
      Asking the customer whether ±.0005 on a clearance hole could be ±.002 can be worth more than
      pricing it.</li>
    </ul>

    <h2>Doing it in ${SITE_NAME}</h2>
    <p>The RFQ review reads the tolerance text from the customer's email or drawing (the AI reader keeps it
    exactly as written) and, when the tightest tolerance is tighter than ±.005 in, names it with its zone
    and band and says what to check: "Precision: +.0005/-.0000, a 0.00050 in (0.013 mm) zone." It reads
    ±, +/-, one-sided limits, inches and millimetres (comma decimals too), ISO 2768 classes and ISO 286 fits,
    and skips angles. It never changes a price: the minutes, operations and fallout above are yours to
    add, and the quote is priced from your rate card. Fits and ISO 2768 classes are read at a typical size
    (the note says which), because the RFQ does not say how big the feature is. The
    <a class="link" href="${href(ctx, "/rfq-review-checklist")}">RFQ review checklist</a> has the
    tolerance questions to ask before you price.</p>
    <p class="fineprint">This page explains common estimating practice and summarises published
    standards in plain words. It is not engineering advice and not a substitute for ISO 2768, ISO 286 or
    your customer's drawing. The band limits are rules of thumb. Check every quote before you send it.</p>
  </div>
</section>
${ctaBand(ctx, "See the tightest tolerance before you price the part", ctx.launch.open ? "The Early access plan is free and needs no card." : "Early access is free and asks only about your shop.")}`;
}

/** Path → body renderer. The Worker uses earlyAccessPage directly for error re-renders. */
export const PAGE_BODIES: Record<string, (ctx: RenderContext) => Html> = {
  "/": homePage,
  "/how-it-works": howItWorksPage,
  "/pricing": pricingPage,
  "/for-cmmc-shops": cmmcPage,
  "/compare": comparePage,
  "/machine-shop-hourly-rate": shopRatePage,
  "/machine-shop-markup": markupGuidePage,
  "/how-to-quote-cnc-machining": quoteGuidePage,
  "/how-to-quote-sheet-metal": sheetMetalGuidePage,
  "/how-to-quote-welding": weldingGuidePage,
  "/quantity-price-breaks": quantityBreaksGuidePage,
  "/how-to-quote-cnc-turning": turningGuidePage,
  "/how-to-quote-outside-processing": outsideProcessingGuidePage,
  "/how-to-estimate-cnc-machining-time": cycleTimeGuidePage,
  "/machine-shop-quote-template": quoteTemplatePage,
  "/machining-material-cost": materialCostGuidePage,
  "/rfq-review-checklist": rfqChecklistPage,
  "/how-to-price-a-rush-job": rushGuidePage,
  "/how-to-quote-first-article-inspection": faiGuidePage,
  "/machining-tolerances": toleranceGuidePage,
  "/faq": faqPage,
  "/early-access": (ctx) => earlyAccessPage(ctx),
  "/early-access/thanks": thanksPage,
  "/privacy": privacyPage,
};
