// Every prerendered page: { path, title, description, body, jsonLd, noindex?, text }. `text` is the
// page as Markdown for llms-full.txt (written from the same content, so the two never disagree).
import {
  EARLY_ACCESS_SUBSCRIBE_MESSAGE,
  FAQ,
  FEATURES,
  NOT_TAX_ADVICE,
  PLATFORMS,
  SCHEDULE_C_LINES,
  SITE_NAME,
  SITE_URL,
  SUMMARY,
  TAGLINE,
  TIERS,
} from "./content.mjs";
import { breadcrumbs, canonicalUrl, earlyAccessForm, esc, href, webPage } from "./html.mjs";

const IRS_SCHEDULE_C = "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040";
const IRS_MILEAGE = "https://www.irs.gov/tax-professionals/standard-mileage-rates";
const IRS_1099K = "https://www.irs.gov/businesses/understanding-your-form-1099-k";

const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
const mdList = (items) => items.map((i) => `- ${i}`).join("\n");
const usd = (n) => `$${n.toLocaleString("en-US")}`;

const notTaxAdvice = `<p class="note">${esc(NOT_TAX_ADVICE)}</p>`;

function home() {
  const path = "/";
  const title = `${SITE_NAME}: ${TAGLINE}`;
  const description =
    "Bookkeeping for resellers on eBay, Poshmark, Mercari, Whatnot, Depop and Etsy: true profit after fees and cost of goods, sourcing miles, and a Schedule C worksheet. Early access.";
  const features = FEATURES.map(
    (f) => `<div class="card"><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></div>`,
  ).join("\n");
  const platformLinks = PLATFORMS.map(
    (p) =>
      `<li><a href="${href(`/platforms/${p.slug}`)}">${esc(p.name)}</a> <span class="muted">${esc(p.what)}</span></li>`,
  ).join("");
  const body = `<section class="hero wrap">
  <p class="eyebrow">Early access</p>
  <h1>Know what you actually made on every sale</h1>
  <p class="lead">${esc(SUMMARY)}</p>
  <p><a class="button" href="${href("/early-access")}">Join early access</a> <a class="button ghost" href="${href("/pricing")}">See proposed pricing</a></p>
</section>
<section class="wrap" aria-labelledby="problem-h">
  <h2 id="problem-h">Payout is not profit</h2>
  <p>A platform payout is the sale minus that platform's fees. It doesn't know what you paid for the item at the thrift store, the shipping supplies you bought, the miles you drove to source, or the sale you made on a different app the same day. Profit needs all of it in one place.</p>
  <div class="worked">
    <p class="muted">An invented example, to show the arithmetic:</p>
    <table>
      <tbody>
        <tr><th scope="row">Buyer paid for the item</th><td>$40.00</td></tr>
        <tr><th scope="row">Platform fees on this sale</th><td>−$6.10</td></tr>
        <tr><th scope="row">Shipping label you paid</th><td>−$5.25</td></tr>
        <tr><th scope="row">What the item cost you</th><td>−$8.00</td></tr>
        <tr class="total"><th scope="row">Profit on the sale</th><td>$20.65</td></tr>
      </tbody>
    </table>
    <p class="muted">The payout for this sale would show $33.90 before the label, or $28.65 after it. Neither is the profit: the platform doesn't know the item cost you $8.</p>
  </div>
</section>
<section class="wrap" aria-labelledby="what-h">
  <h2 id="what-h">What ${esc(SITE_NAME)} will do</h2>
  <p>${esc(SITE_NAME)} is being built now. This is what early-access members will get.</p>
  <div class="grid">
${features}
  </div>
</section>
<section class="wrap" aria-labelledby="platforms-h">
  <h2 id="platforms-h">Six platforms, one set of books</h2>
  <ul class="platform-list">${platformLinks}</ul>
</section>
<section class="wrap" aria-labelledby="honest-h">
  <h2 id="honest-h">What it won't do</h2>
  <ul>
    <li>It won't file your taxes or tell you what to deduct. ${esc(NOT_TAX_ADVICE)}</li>
    <li>It won't guess your fees from a published rate. It uses what each platform actually charged you.</li>
    <li>It won't invent a cost for an item you didn't record. Missing costs are flagged for you to fill in.</li>
  </ul>
</section>
<div class="wrap">${earlyAccessForm(path, { idPrefix: "home" })}</div>`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: SUMMARY,
      url: `${SITE_URL}/`,
      audience: { "@type": "BusinessAudience", audienceType: "Resellers on online marketplaces" },
    },
  ];
  const text = `# ${title}

${SUMMARY}

## Payout is not profit

A platform payout is the sale minus that platform's fees. It doesn't include what you paid for the item, shipping supplies, sourcing miles, or sales on other platforms. Profit needs all of it in one place.

## What ${SITE_NAME} will do

${FEATURES.map((f) => `### ${f.title}\n\n${f.body}`).join("\n\n")}

## What it won't do

- File your taxes or tell you what to deduct. ${NOT_TAX_ADVICE}
- Guess your fees from a published rate.
- Invent a cost for an item you didn't record.`;
  return { path, title, description, body, jsonLd, text };
}

function platformsIndex() {
  const path = "/platforms";
  const title = "Reseller bookkeeping by platform";
  const description =
    "How fees, payouts and cost of goods work on eBay, Poshmark, Mercari, Whatnot, Depop and Etsy, and how Seller Books puts them in one ledger.";
  const cards = PLATFORMS.map(
    (p) =>
      `<a class="card link-card" href="${href(`/platforms/${p.slug}`)}"><h2>${esc(p.name)}</h2><p>${esc(p.what)}</p></a>`,
  ).join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Every platform pays you differently: different fees, different reports, different timing. ${esc(SITE_NAME)} reads each one and puts the sales in one ledger.</p>
  <div class="grid">
${cards}
  </div>
</section>`;
  const text = `# ${title}\n\n${PLATFORMS.map((p) => `- [${p.name}](${canonicalUrl(`/platforms/${p.slug}`)}): ${p.what}`).join("\n")}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [webPage(path, title, description), breadcrumbs([{ name: "Platforms", path }])],
    text,
  };
}

function platformPage(p) {
  const path = `/platforms/${p.slug}`;
  const title = `${p.name} seller profit, fees and bookkeeping`;
  const description = `Track true profit on ${p.name} sales: the fees ${p.name} actually charged, what each item cost you, shipping and miles, in one ledger with your other platforms. Early access.`;
  const others = PLATFORMS.filter((o) => o.slug !== p.slug)
    .map((o) => `<a href="${href(`/platforms/${o.slug}`)}">${esc(o.name)}</a>`)
    .join(", ");
  const body = `<section class="wrap">
  <p class="eyebrow"><a href="${href("/platforms")}">Platforms</a></p>
  <h1>${esc(p.name)}: profit after fees and cost of goods</h1>
  <p class="lead">${esc(p.name)} is a marketplace for ${esc(p.what)}. ${esc(SITE_NAME)} brings your ${esc(p.name)} sales into the same books as everything else you sell, with each sale's fees and cost attached.</p>
  <h2>What comes out of a ${esc(p.name)} sale</h2>
  ${list(p.fees)}
  <p>${esc(SITE_NAME)} doesn't apply a published rate to these. It reads the amounts on your own ${esc(p.name)} records (${esc(p.report)}), so a change in ${esc(p.name)}'s fees shows up in your books the day it shows up in your account.</p>
  <h2>What's particular about ${esc(p.name)}</h2>
  ${list(p.quirks)}
  <h2>Where it lands on the worksheet</h2>
  <p>${esc(p.name)} sales go to gross receipts, refunds to returns and allowances, ${esc(p.name)}'s fees to commissions and fees, and each item's cost to cost of goods sold. See <a href="${href("/schedule-c-worksheet")}">the Schedule C worksheet</a> for the full grouping.</p>
  ${notTaxAdvice}
  <p>Also on: ${others}.</p>
</section>
<div class="wrap">${earlyAccessForm(path, { heading: `Get early access for your ${p.name} books`, idPrefix: p.slug })}</div>`;
  const text = `# ${title}

${p.name} is a marketplace for ${p.what}. ${SITE_NAME} brings your ${p.name} sales into the same books as your other platforms.

## What comes out of a ${p.name} sale

${mdList(p.fees)}

${SITE_NAME} reads the amounts on your own records (${p.report}) instead of applying a published rate.

## What's particular about ${p.name}

${mdList(p.quirks)}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([
        { name: "Platforms", path: "/platforms" },
        { name: p.name, path },
      ]),
    ],
    text,
  };
}

function scheduleC() {
  const path = "/schedule-c-worksheet";
  const title = "A Schedule C worksheet for resellers";
  const description =
    "How a reseller's sales, fees, cost of goods, inventory and miles group onto Schedule C (Form 1040), and what the Seller Books year-end worksheet shows.";
  const rows = SCHEDULE_C_LINES.map(
    (l) =>
      `<tr><td>${esc(l.line)}</td><th scope="row">${esc(l.label)}</th><td>${esc(l.from)}</td></tr>`,
  ).join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">If you buy things to resell, the IRS treats it as a business, and the profit usually goes on Schedule C (Form 1040). At year end ${esc(SITE_NAME)} gives you your totals grouped the way the form asks for them: a worksheet to file from, or to hand to your tax preparer.</p>
  <h2>How the totals group</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Schedule C line</th><th scope="col">What it is</th><th scope="col">What goes in it</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table></div>
  <p class="muted">Line numbers are from the current Schedule C. Check <a href="${IRS_SCHEDULE_C}">the IRS Schedule C page</a> for the form and instructions for your tax year. Where a particular cost belongs (for example, shipping labels as other expenses or as part of cost of goods) is a choice you or your tax preparer make, and the worksheet lets you set it.</p>
  <h2>Cost of goods sold and inventory</h2>
  <p>Cost of goods sold is not what you spent on inventory this year. It is what you had at the start of the year, plus what you bought, minus what was still unsold at the end. Items bought in December and sold in March count in the year they sell. ${esc(SITE_NAME)} tracks each item's cost from purchase to sale, so the year-end inventory figure is a list of real items, not a guess.</p>
  <h2>Mileage</h2>
  <p>Driving to source inventory or to drop off packages can be business mileage. You can deduct either the IRS standard mileage rate for business miles or your actual car expenses, under the IRS rules for choosing between them. The IRS sets the rate and can change it during a year (it did in 2026), so the worksheet uses the rate in effect on each trip's date. See <a href="${IRS_MILEAGE}">the IRS standard mileage rates</a>.</p>
  <h2>Form 1099-K</h2>
  <p>For federal reporting, a payment platform sends a Form 1099-K when your payments for the year are over $20,000 and more than 200 transactions; some states require it at lower amounts. The form reports gross payments, before fees and refunds, so it will be larger than your profit. Your own books are how you match it. See <a href="${IRS_1099K}">the IRS page on Form 1099-K</a>.</p>
  ${notTaxAdvice}
</section>
<div class="wrap">${earlyAccessForm(path, { idPrefix: "schc" })}</div>`;
  const text = `# ${title}

If you buy things to resell, the profit usually goes on Schedule C (Form 1040). At year end ${SITE_NAME} gives you your totals grouped the way the form asks for them.

## How the totals group

| Schedule C line | What it is | What goes in it |
| --- | --- | --- |
${SCHEDULE_C_LINES.map((l) => `| ${l.line} | ${l.label} | ${l.from} |`).join("\n")}

Check the IRS Schedule C instructions for your tax year: ${IRS_SCHEDULE_C}

## Cost of goods sold and inventory

Cost of goods sold is beginning inventory plus purchases minus ending inventory, not what you spent this year.

## Mileage

Standard mileage rate or actual expenses, per IRS rules; the rate can change mid-year (it did in 2026), so each trip uses the rate on its date. ${IRS_MILEAGE}

## Form 1099-K

Federal threshold: payments over $20,000 and more than 200 transactions in a year; some states are lower. The form reports gross payments, not profit. ${IRS_1099K}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Schedule C worksheet", path }]),
    ],
    text,
  };
}

function pricing() {
  const path = "/pricing";
  const title = "Pricing";
  const description =
    "Proposed Seller Books plans, priced by how many orders you ship and how many platforms you sell on, from $15 a month. Nothing is charged during early access.";
  const cards = TIERS.map(
    (t) => `<div class="card tier${t.featured ? " featured" : ""}">
  <h2>${esc(t.name)}</h2>
  <p class="muted">${esc(t.for)}</p>
  <p class="price"><span class="amount">${usd(t.monthly)}</span> a month</p>
  <p class="muted">or ${usd(t.annual)} a year · ${esc(t.platforms)}</p>
  ${list(t.includes)}
</div>`,
  ).join("\n");
  const top = TIERS[TIERS.length - 1];
  const body = `<section class="wrap">
  <h1>Proposed pricing</h1>
  <p class="lead">Priced by what you sell, not by feature checklists: how many orders you ship each month across all platforms, and how many platforms you sell on. These are proposed prices for launch; during early access nothing is charged and we don't ask for payment details.</p>
  <div class="grid tiers">
${cards}
  </div>
  <p>Shipping more than ${top.orders.toLocaleString("en-US")} orders a month? <a href="mailto:hello@marisstella.app">Email us</a> and we'll talk about it.</p>
  <h2>How the limits work</h2>
  <ul>
    <li>An order is one sale on one platform, whatever the number of items in it.</li>
    <li>If you go over your plan's orders in a busy month, nothing stops working. If it keeps happening we'll suggest the next plan; you choose.</li>
    <li>Annual plans cost ten times the monthly price.</li>
    <li>Early-access members will see the final price before they're asked to pay anything.</li>
  </ul>
  ${notTaxAdvice}
</section>
<div class="wrap">${earlyAccessForm(path, { idPrefix: "pricing" })}</div>`;
  const text = `# Proposed pricing

Priced by orders per month across all platforms and by number of platforms. Proposed for launch; nothing is charged during early access.

${TIERS.map((t) => `## ${t.name}: ${usd(t.monthly)} a month (${usd(t.annual)} a year)\n\n${t.for}. ${t.platforms}.\n\n${mdList(t.includes)}`).join("\n\n")}

More than ${top.orders.toLocaleString("en-US")} orders a month: email hello@marisstella.app.`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [webPage(path, title, description), breadcrumbs([{ name: "Pricing", path }])],
    text,
  };
}

function faq() {
  const path = "/faq";
  const title = "Questions";
  const description =
    "Answers about Seller Books: availability, platforms, fees, Form 1099-K, pricing and data.";
  const items = FAQ.map(
    (f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`,
  ).join("\n");
  const body = `<section class="wrap">
  <h1>Questions</h1>
  <div class="faq">
${items}
  </div>
</section>`;
  const jsonLd = [
    webPage(path, title, description),
    breadcrumbs([{ name: "Questions", path }]),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
  const text = `# Questions\n\n${FAQ.map((f) => `## ${f.q}\n\n${f.a}`).join("\n\n")}`;
  return { path, title, description, body, jsonLd, text };
}

function earlyAccess() {
  const path = "/early-access";
  const title = "Join early access";
  const description =
    "Join the Seller Books early-access list. We'll email you an invite when it's ready. No payment details asked.";
  const body = `<section class="wrap narrow">
  <h1>Join early access</h1>
  <p class="lead">${esc(SITE_NAME)} is being built now. Join the list and we'll email you an invite when there's a place for you. Telling us where you sell and how much helps us decide what to build first and check the proposed prices.</p>
  ${earlyAccessForm(path, { heading: "Your details", idPrefix: "page" })}
</section>`;
  const text = `# Join early access\n\nJoin the list at ${canonicalUrl(path)}. We'll email an invite when it's ready. No payment details asked.`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [webPage(path, title, description), breadcrumbs([{ name: "Early access", path }])],
    text,
  };
}

function thanks() {
  const path = "/early-access/thanks";
  const title = "Check your email";
  return {
    path,
    title,
    description: "Confirm your early-access signup from the email we sent.",
    noindex: true,
    body: `<section class="wrap narrow">
  <h1>Check your email</h1>
  <p class="lead">${esc(EARLY_ACCESS_SUBSCRIBE_MESSAGE)}</p>
  <p><a href="${href("/")}">Back to ${esc(SITE_NAME)}</a></p>
</section>`,
  };
}

function privacy() {
  const path = "/privacy";
  const title = "Privacy";
  const description =
    "What the Seller Books early-access list stores, why, how long, and how to leave it.";
  const body = `<section class="wrap narrow">
  <h1>Privacy</h1>
  <p class="lead">This page covers the early-access list, which is the only thing this site collects. The product will have its own privacy policy before anyone puts their books in it.</p>
  <h2>What we store</h2>
  <ul>
    <li>Your email address.</li>
    <li>The platforms and monthly order range you chose, if you chose any.</li>
    <li>The page you signed up on, the version of the consent wording you saw, and when you signed up and confirmed.</li>
    <li>A salted hash of your IP address as a record of consent. We don't store the address itself.</li>
  </ul>
  <h2>What we use it for</h2>
  <p>To email you about early access to ${esc(SITE_NAME)}, and to count (not profile) which platforms and order volumes people want, so we can decide what to build and how to price it. We don't sell or share the list. No analytics or advertising scripts run on this site.</p>
  <h2>Who can see it</h2>
  <p>Only the people who run ${esc(SITE_NAME)} can see the list: your email address, the page you signed up on, whether you confirmed, and the date. Each time they view it, that view is logged.</p>
  <h2>How long</h2>
  <p>Signups that aren't confirmed are deleted after 30 days. If you unsubscribe, we keep your address only so we never email it again, and delete the rest.</p>
  <h2>Leaving</h2>
  <p>Every email has an unsubscribe link. To have your address deleted entirely, email <a href="mailto:hello@marisstella.app">hello@marisstella.app</a>.</p>
</section>`;
  const text = `# Privacy (early-access list)\n\nStores: email, optional platforms and order range, signup page, consent wording version, timestamps, salted hash of IP. Used only for early-access emails and aggregate counts. Only the people who run the site can see the list (email, signup page, confirmed or not, date); each view is logged. Unconfirmed signups deleted after 30 days. Unsubscribe link in every email; deletion on request at hello@marisstella.app.`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [webPage(path, title, description), breadcrumbs([{ name: "Privacy", path }])],
    text,
  };
}

function notFound() {
  return {
    path: "/404",
    title: "Page not found",
    description: "This page doesn't exist.",
    noindex: true,
    body: `<section class="wrap narrow">
  <h1>Page not found</h1>
  <p><a href="${href("/")}">Go to the ${esc(SITE_NAME)} home page</a>.</p>
</section>`,
  };
}

/** Every page, in sitemap order. */
export function allPages() {
  return [
    home(),
    platformsIndex(),
    ...PLATFORMS.map(platformPage),
    scheduleC(),
    pricing(),
    faq(),
    earlyAccess(),
    privacy(),
    thanks(),
    notFound(),
  ];
}
