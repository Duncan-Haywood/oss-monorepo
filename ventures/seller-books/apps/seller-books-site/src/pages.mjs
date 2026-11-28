// Every prerendered page: { path, title, description, body, jsonLd, noindex?, text }. `text` is the
// page as Markdown for llms-full.txt (written from the same content, so the two never disagree).
import {
  EARLY_ACCESS_SUBSCRIBE_MESSAGE,
  FEATURES,
  FREE_INCLUDES,
  faqItems,
  NOT_TAX_ADVICE,
  PLATFORMS,
  SCHEDULE_C_LINES,
  SITE_NAME,
  SITE_URL,
  summary,
  TAGLINE,
  TIERS,
} from "./content.mjs";
import {
  breadcrumbs,
  callToAction,
  canonicalUrl,
  earlyAccessForm,
  esc,
  href,
  webPage,
} from "./html.mjs";
import {
  COLUMNS,
  EXAMPLE_FILE,
  EXAMPLE_ITEMS,
  EXAMPLE_SUMMARY,
  STATUSES,
  summaryLines,
  TEMPLATE_FILE,
} from "./inventory-sheet.mjs";
import { appPrivacyUrl, launch, signupUrl } from "./launch.mjs";

const IRS_SCHEDULE_C = "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040";
const IRS_MILEAGE = "https://www.irs.gov/tax-professionals/standard-mileage-rates";
const IRS_1099K = "https://www.irs.gov/businesses/understanding-your-form-1099-k";
const IRS_1099K_INSTRUCTIONS = "https://www.irs.gov/instructions/i1099k";
// Box 1a's definition, quoted from the Instructions for Form 1099-K (revised 12/2026), read 2026-11-26.
const BOX_1A_QUOTE =
  "without regard to any adjustments for credits, cash equivalents, discount amounts, fees, refunded amounts, shipping amounts, or any other amounts";

const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
const mdList = (items) => items.map((i) => `- ${i}`).join("\n");
const usd = (n) => `$${n.toLocaleString("en-US")}`;
const num = (n) => n.toLocaleString("en-US");

/**
 * Stills of the real app (apps/seller-books/test/stills/capture.stills.ts, `pnpm stills` there), taken
 * from one invented Etsy shop whose figures that script asserts before each shot. Width and height
 * are the WebP's own; test/site.test.mjs checks them against the files.
 */
export const SHOTS = {
  profitDesktop: {
    file: "shot-profit-desktop.webp",
    width: 1280,
    height: 860,
    alt: "Seller Books' Profit & loss page for 2026: revenue $92.70, fees and postage $13.72, cost of goods $10.00, net profit $55.99, a warning that one order has no inventory item linked, and a by-platform table where Etsy nets $68.98 and a general supplies expense is $12.99.",
  },
  profitPhone: {
    file: "shot-profit-phone.webp",
    width: 390,
    height: 844,
    alt: "The same Profit & loss page on a phone: the four totals in two rows, revenue $92.70, fees and postage $13.72, cost of goods $10.00 and net profit $55.99.",
  },
  scheduleC: {
    file: "shot-schedule-c-desktop.webp",
    width: 1280,
    height: 860,
    alt: "The Schedule C worksheet for 2026: line 1 gross receipts $112.70, line 2 returns $20.00, line 4 cost of goods sold $10.00, line 9 car expenses $18.13 for 25 business miles at the IRS rate on the trip's date, with download buttons for a PDF, a CSV and a ZIP for a tax preparer.",
  },
  scheduleCPhone: {
    file: "shot-schedule-c-phone.webp",
    width: 358,
    height: 1246,
    alt: "The Schedule C worksheet's Parts I and II on a phone, line by line: gross receipts $112.70, returns $20.00, cost of goods sold $10.00, car expenses $18.13, commissions and fees $5.62, supplies $12.99, total expenses $44.84 and net profit $37.86.",
  },
  stock: {
    file: "shot-stock-desktop.webp",
    width: 1280,
    height: 860,
    alt: "The Stock report: 2 items in stock costing $20.00, 33% sell-through, 133 median days to sell, and an estate-sale lot that cost $30.00, sold 1 of 3 items for $39.23 after fees and so has recovered 131% of its cost.",
  },
  stockPhone: {
    file: "shot-stock-phone.webp",
    width: 358,
    height: 243,
    alt: "The Stock report's lot table on a phone, one line per figure: the estate-sale haul cost $30.00, 1 of 3 items sold, $39.23 proceeds, 131% recovered, $20.00 still in stock.",
  },
};

const shotImg = (s, cls = "") =>
  `<img${cls ? ` class="${cls}"` : ""} src="${href(`/assets/${s.file}`)}" width="${s.width}" height="${s.height}" alt="${esc(s.alt)}" loading="lazy" decoding="async">`;
const shotLink = (s, cls = "") => `<a href="${href(`/assets/${s.file}`)}">${shotImg(s, cls)}</a>`;
/** A desktop still with a phone crop served instead on narrow screens (only one is fetched). */
const shotPicture = (wide, phone) =>
  `<a href="${href(`/assets/${wide.file}`)}"><picture><source media="(max-width: 720px)" srcset="${href(`/assets/${phone.file}`)}" width="${phone.width}" height="${phone.height}">${shotImg(wide)}</picture></a>`;

function shotsSection() {
  return `<section class="wrap shots" aria-labelledby="shots-h">
  <h2 id="shots-h">What it looks like in the app</h2>
  <p>Screenshots of the app with one made-up Etsy shop: its orders file and monthly statement, a $30 estate-sale lot of three items, one supplies receipt and one sourcing trip. The shop and its numbers are invented; the arithmetic is the app's.</p>
  <figure class="shot-hero">
    <div class="shot-frame shot-wide">${shotLink(SHOTS.profitDesktop)}</div>
    <div class="shot-frame shot-phone">${shotLink(SHOTS.profitPhone)}</div>
    <figcaption>Profit &amp; loss: sales, the fees and postage Etsy actually charged, and what each item cost you, per platform and per month. An order with no cost recorded is flagged, not guessed.</figcaption>
  </figure>
  <div class="shot-pair">
    <figure>
      <div class="shot-frame">${shotPicture(SHOTS.scheduleC, SHOTS.scheduleCPhone)}</div>
      <figcaption>The Schedule C worksheet, line by line, with a PDF, a CSV and a ZIP of the records behind it for your tax preparer.</figcaption>
    </figure>
    <figure>
      <div class="shot-frame">${shotPicture(SHOTS.stock, SHOTS.stockPhone)}</div>
      <figcaption>The stock report: how long unsold items have sat, days to sell by platform, and whether each lot has paid for itself.</figcaption>
    </figure>
  </div>
</section>`;
}

const notTaxAdvice = `<p class="note">${esc(NOT_TAX_ADVICE)}</p>`;

function home() {
  const path = "/";
  const open = launch().open;
  const SUMMARY = summary();
  const title = `${SITE_NAME}: ${TAGLINE}`;
  const description =
    "Bookkeeping for resellers on eBay, Poshmark, Mercari, Etsy, Whatnot and more: true profit after fees and cost of goods, and a Schedule C worksheet.";
  const titleOf = new Map(guidePages().map((p) => [p.path, p.title]));
  const features = FEATURES.map((f) => {
    const guide = f.guide
      ? `<p class="feature-guide"><a href="${href(f.guide)}">${esc(titleOf.get(f.guide))}</a></p>`
      : "";
    return `<div class="card feature"><h3>${esc(f.title)}</h3><p>${esc(f.short)}</p><details><summary>How it works</summary><p>${esc(f.body)}</p></details>${guide}</div>`;
  }).join("\n");
  const platformLinks = PLATFORMS.map(
    (p) =>
      `<li><a href="${href(`/platforms/${p.slug}`)}">${esc(p.name)}</a> <span class="muted">${esc(p.what)}</span></li>`,
  ).join("");
  const body = `<section class="hero wrap">
  <p class="eyebrow">${open ? "Open now · free on one platform" : "Early access"}</p>
  <h1>Know what you actually made on every sale</h1>
  <p class="lead">${esc(SUMMARY)}</p>
  <p>${
    open
      ? `<a class="button" href="${esc(signupUrl("/hero"))}">Start free</a> <a class="button ghost" href="${href("/pricing")}">See the plans</a>`
      : `<a class="button" href="${href("/early-access")}">Join early access</a> <a class="button ghost" href="${href("/pricing")}">See proposed pricing</a>`
  }</p>
</section>
${open ? shotsSection() : ""}
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
  <h2 id="what-h">What ${esc(SITE_NAME)} ${open ? "does" : "will do"}</h2>
  <p>${open ? "Every part of this is in the app today, on the Free plan as well as the paid ones." : `${esc(SITE_NAME)} is being built now. This is what early-access members will get.`}</p>
  <div class="grid">
${features}
  </div>
</section>
<section class="wrap" aria-labelledby="platforms-h">
  <h2 id="platforms-h">${PLATFORMS.length} platforms, one set of books</h2>
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
<div class="wrap">${callToAction(path, { idPrefix: "home" })}</div>`;
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

## What ${SITE_NAME} ${open ? "does" : "will do"}

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
    "How fees, payouts and cost of goods work on eBay, Poshmark, Mercari, Etsy, Amazon and six more platforms, and how Seller Books puts them in one ledger.";
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

// The "<platform> taxes" page each platform page links to, as the sentence it shows.
const TAX_PAGE_LINKS = {
  poshmark: `Taxes on Poshmark sales, the 1099-K and the sales tax Poshmark collects, with one month worked through: <a href="${href("/poshmark-taxes")}">Poshmark taxes</a>.`,
  mercari: `Taxes on Mercari sales, why the 1099-K won't match your proceeds and which year a sale counts in, with three sales worked through: <a href="${href("/mercari-taxes")}">Mercari taxes</a>.`,
  ebay: `Taxes on eBay sales, the 1099-K and the sales tax eBay collects, with one Transaction report worked through: <a href="${href("/ebay-taxes")}">eBay taxes</a>.`,
  whatnot: `Taxes on Whatnot sales, the 1099-K, tips, giveaways and the sales tax Whatnot collects, with one week worked through: <a href="${href("/whatnot-taxes")}">Whatnot taxes</a>.`,
  amazon: `Taxes on Amazon sales, why deposits aren't income, FBA fees, reimbursements and the sales tax Amazon collects, with one month's report worked through: <a href="${href("/amazon-taxes")}">Amazon taxes</a>.`,
};
const taxLink = (slug) => {
  const sentence = Object.hasOwn(TAX_PAGE_LINKS, slug) ? TAX_PAGE_LINKS[slug] : "";
  return sentence ? `\n  <p>${sentence}</p>` : "";
};

function platformPage(p) {
  const path = `/platforms/${p.slug}`;
  const title = `${p.name} seller profit, fees and bookkeeping`;
  const description = `Profit on ${p.name} sales: the fees ${p.name} charged, what each item cost, shipping and miles, in one ledger with other platforms.${launch().open ? " Free on one platform." : ""}`;
  const others = PLATFORMS.filter((o) => o.slug !== p.slug)
    .map((o) => `<a href="${href(`/platforms/${o.slug}`)}">${esc(o.name)}</a>`)
    .join(", ");
  const body = `<section class="wrap">
  <p class="eyebrow"><a href="${href("/platforms")}">Platforms</a></p>
  <h1>${esc(p.name)}: profit after fees and cost of goods</h1>
  <p class="lead">${esc(p.intro ?? `${p.name} is a marketplace for ${p.what}.`)} ${esc(SITE_NAME)} brings your ${esc(p.name)} sales into the same books as everything else you sell, with each sale's fees and cost attached.</p>
  <h2>What comes out of a ${esc(p.name)} sale</h2>
  ${list(p.fees)}
  <p>${esc(SITE_NAME)} doesn't apply a published rate to these. It reads the amounts on your own ${esc(p.name)} records (${esc(p.report)}), so a change in ${esc(p.name)}'s fees shows up in your books the day it shows up in your account.</p>
  <h2>What's particular about ${esc(p.name)}</h2>
  ${list(p.quirks)}
  <h2>Where it lands on the worksheet</h2>
  <p>${esc(p.name)} sales go to gross receipts, refunds to returns and allowances, ${esc(p.name)}'s fees to commissions and fees, and each item's cost to cost of goods sold. See <a href="${href("/schedule-c-worksheet")}">the Schedule C worksheet</a> for the full grouping.</p>${taxLink(
    p.slug,
  )}
  ${notTaxAdvice}
  <p>Also on: ${others}.</p>
</section>
<div class="wrap">${callToAction(path, { heading: `Get early access for your ${p.name} books`, openHeading: `Try it on your ${p.name} report`, idPrefix: p.slug })}</div>`;
  const text = `# ${title}

${p.intro ?? `${p.name} is a marketplace for ${p.what}.`} ${SITE_NAME} brings your ${p.name} sales into the same books as your other platforms.

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
  <p>Cost of goods sold is not what you spent on inventory this year. It is what you had at the start of the year, plus what you bought, minus what was still unsold at the end. Items bought in December and sold in March count in the year they sell. ${esc(SITE_NAME)} tracks each item's cost from purchase to sale, so the year-end inventory figure is a list of real items, not a guess. The start of the year should match the end-of-year inventory on last year's return: enter that figure and the worksheet uses it, and tells you if your item records disagree. Line by line, with the IRS wording: <a href="${href("/cost-of-goods-sold")}">cost of goods sold for resellers</a>.</p>
  <h2>Mileage</h2>
  <p>Driving to source inventory or to drop off packages can be business mileage. You can deduct either the IRS standard mileage rate for business miles or your actual car expenses, under the IRS rules for choosing between them. The IRS sets the rate and can change it during a year (it did in 2026), so the worksheet uses the rate in effect on each trip's date. The rates, a worked 2026 example and the log to keep: <a href="${href("/mileage-deduction")}">mileage deduction for resellers</a>; and <a href="${IRS_MILEAGE}">the IRS standard mileage rates</a>.</p>
  <h2>Home office and equipment</h2>
  <p>Stock kept at home can put line 30 on the worksheet by the simplified method, and equipment you keep (a camera, a label printer, shelving) is split at the de minimis safe harbor: line 27a, or Form 4562 for larger purchases. The rules and a worked example: <a href="${href("/home-office-and-equipment")}">home office and equipment deductions for resellers</a>.</p>
  <h2>Every expense line</h2>
  <p>Fees, promoted listings, mailers, labels, a storage unit, software: which line each one goes on, and the mistakes that count a cost twice, in <a href="${href("/reseller-tax-deductions")}">reseller tax deductions by Schedule C line</a>.</p>
  <h2>Quarterly estimated tax</h2>
  <p>The same profit, read to the end of each payment period, sizes the four federal estimated payments: equal amounts against the 90% / 100% / 110% safe harbours, or the annualized method for a year whose sales come late. The 2026 dates and a worked example: <a href="${href("/quarterly-estimated-tax")}">quarterly estimated taxes for resellers</a>.</p>
  <h2>Form 1099-K</h2>
  <p>For federal reporting, a payment platform sends a Form 1099-K when your payments for the year are over $20,000 and more than 200 transactions; some states require it at lower amounts. The form reports gross payments, before fees and refunds, so it will be larger than your profit. Your own books are how you match it: <a href="${href("/1099-k")}">why your 1099-K is higher than your sales</a>, and the IRS page on <a href="${IRS_1099K}">Form 1099-K</a>.</p>
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "schc" })}</div>`;
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

// The 1099-K page: what box 1a counts, why it is above a seller's sales, and the check in the app.
// Every figure in the worked example is invented and labelled so; test/site.test.mjs holds its sums.
export const FORM_1099K_EXAMPLE = {
  itemSales: 21400,
  shippingPaid: 2310,
  refunds: 640,
  fees: 3050,
};

function form1099k() {
  const path = "/1099-k";
  const title = "Why your 1099-K is higher than your sales";
  const description =
    "A reseller's 1099-K counts gross payments before refunds and fees: what box 1a includes, why it rarely matches your sales, and how to check it by month.";
  const ex = FORM_1099K_EXAMPLE;
  const box1a = ex.itemSales + ex.shippingPaid;
  const net = box1a - ex.refunds - ex.fees;
  const faqs = [
    {
      q: "Why is my 1099-K higher than what I made?",
      a: `Box 1a is the gross amount of the payments, figured, in the words of the IRS instructions, \u201c${BOX_1A_QUOTE}.\u201d Refunds, platform fees and the shipping buyers paid are not taken off, and your cost of goods never appears on the form at all. So the form is almost always above your profit, and often above your item sales too.`,
    },
    {
      q: "Who gets a Form 1099-K?",
      a: "For federal reporting, a payment platform or marketplace files one when its payments to you for the year are over $20,000 and more than 200 transactions. Some states require one at lower amounts, so you may get a form below the federal threshold.",
    },
    {
      q: "If the form is wrong, do I report the form or my books?",
      a: "Business income is what your records show, whether or not a form agrees, and whether or not you get one. When the gap is a real error on the form, the platform that issued it is who corrects it. How to report a difference on your return is a question for your tax preparer.",
    },
  ];
  const reasons = [
    [
      "A month on the form with no orders in your books",
      "Most often that month's report was never imported.",
    ],
    [
      "Two months off by the same amount in opposite directions",
      "A sale on the 31st that you date by the order and the platform dates by the day it paid. The year's total is unaffected.",
    ],
    [
      "Monthly boxes that don't add up to box 1a",
      "Usually a typing slip. Check both against the form before reading further.",
    ],
    [
      "Your books are higher than the form",
      "The same sale imported from two reports, cancelled orders kept, or a second account counted.",
    ],
  ];
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">A marketplace's Form 1099-K usually shows more than a reseller thinks they made. The gap is rarely a mistake: the form counts what buyers paid, before anything came back out.</p>
  <h2>What box 1a counts</h2>
  <p>Box 1a is the gross amount of the payments made to you in the year. The <a href="${IRS_1099K_INSTRUCTIONS}">IRS instructions for Form 1099-K</a> say it is figured &ldquo;${esc(BOX_1A_QUOTE)}.&rdquo; So:</p>
  <ul>
    <li><strong>Refunds stay in.</strong> A sale you refunded in full is still counted.</li>
    <li><strong>Fees stay in.</strong> The platform's commission and payment processing are not taken off.</li>
    <li><strong>Shipping stays in.</strong> What buyers paid for shipping counts, even though you spent it on labels.</li>
    <li><strong>Your cost of goods isn't there at all.</strong> The platform never knew what you paid for the item.</li>
  </ul>
  <p>Whether a marketplace's box 1a also includes the sales tax it collected on your behalf is something we could not find stated on a page we could check, so ${esc(SITE_NAME)} doesn't assume it either way.</p>
  <div class="worked">
    <p class="muted">An invented example, to show the arithmetic:</p>
    <table>
      <tbody>
        <tr><th scope="row">Item sales in your books</th><td>${usd(ex.itemSales)}</td></tr>
        <tr><th scope="row">Shipping buyers paid</th><td>${usd(ex.shippingPaid)}</td></tr>
        <tr class="total"><th scope="row">Box 1a on the form</th><td>${usd(box1a)}</td></tr>
        <tr><th scope="row">Refunds you gave (not taken off by the form)</th><td>&minus;${usd(ex.refunds)}</td></tr>
        <tr><th scope="row">Platform fees (not taken off by the form)</th><td>&minus;${usd(ex.fees)}</td></tr>
        <tr class="total"><th scope="row">What reached you before labels and cost of goods</th><td>${usd(net)}</td></tr>
      </tbody>
    </table>
    <p class="muted">The form matches item sales plus shipping exactly, and is still ${usd(box1a - net)} above what the platform paid out. Profit is lower again once labels and what the items cost you come off.</p>
  </div>
  <h2>Who gets one</h2>
  <p>For federal reporting, a payment platform files a 1099-K when its payments to you for the year are over $20,000 and more than 200 transactions. Some states set lower thresholds, so a form can arrive below the federal line. Either way it is a report of payments, not a tax bill. See <a href="${IRS_1099K}">the IRS page on Form 1099-K</a>.</p>
  <p>Sold some of your own things in the same account? Personal items sold at a loss are in box 1a too, and are not income: see <a href="${href("/personal-items-or-business")}">personal items, a hobby or a business</a>. Selling locally on Facebook Marketplace? Who reports those sales depends on how the buyer paid: see <a href="${href("/facebook-marketplace-taxes")}">Facebook Marketplace taxes</a>.</p>
  <h2>When the months don't match</h2>
  <p>The form also has a box for each month (5a for January through 5l for December). Laid beside your books month by month, the gap usually has one of a few causes:</p>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">What you see</th><th scope="col">What it usually means</th></tr></thead>
    <tbody>
${reasons.map(([a, b]) => `      <tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td></tr>`).join("\n")}
    </tbody>
  </table></div>
  <h2>The check in ${esc(SITE_NAME)}</h2>
  <p>Type one platform's box 1a and ${esc(SITE_NAME)} adds up your books for that platform and year three ways: item sales, then with the shipping buyers paid, then with the sales tax the platform collected. The closest of the three is shown as the closest, not as what the platform includes. Type the monthly boxes too and the months that don't match are named, with the usual reasons above. Nothing you type into the check is saved.</p>
  <p>It works for every platform ${esc(SITE_NAME)} imports: ${PLATFORMS.map((p) => `<a href="${href(`/platforms/${p.slug}`)}">${esc(p.name)}</a>`).join(", ")}. The year's figures then group onto the <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a>: sales on line 1, refunds on line 2, fees on line 10.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "f1099k" })}</div>`;
  const text = `# ${title}

A marketplace's Form 1099-K usually shows more than a reseller thinks they made. The form counts what buyers paid, before anything came back out.

## What box 1a counts

The IRS instructions for Form 1099-K (${IRS_1099K_INSTRUCTIONS}) define box 1a's gross amount "${BOX_1A_QUOTE}". Refunds, fees and the shipping buyers paid stay in; cost of goods never appears. Whether a marketplace's box 1a includes the sales tax it collected is not stated on a page we could check, so ${SITE_NAME} doesn't assume it.

An invented example: item sales ${usd(ex.itemSales)} plus shipping paid ${usd(ex.shippingPaid)} is box 1a, ${usd(box1a)}. Refunds of ${usd(ex.refunds)} and fees of ${usd(ex.fees)} leave ${usd(net)} before labels and cost of goods.

## Who gets one

Federal: payments over $20,000 and more than 200 transactions in a year; some states are lower. ${IRS_1099K}

## When the months don't match

Boxes 5a to 5l give each month. Usual causes of a gap:

${mdList(reasons.map(([a, b]) => `${a}: ${b}`))}

## The check in ${SITE_NAME}

Type a platform's box 1a (and optionally the monthly boxes); the books for that platform and year are added up as item sales, with shipping, and with the sales tax collected, and the months that don't match are named. Nothing typed is saved.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Form 1099-K", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// The personal items page: the search a reseller's first 1099-K brings on ("I sold my own things, is
// this income?"). Read through search-engine excerpts of the official pages on 2026-11-27 (irs.gov is
// not reachable from the build environment): the 2025 Instructions for Form 1040 (a 1099-K amount for
// personal items sold at a loss, or sent in error, goes in the entry space at the top of Schedule 1; the
// $1,000 couch sold for $700; a gain goes on Form 8949 and Schedule D), the IRS Form 1099-K FAQs and
// "Actions to take if a Form 1099-K is received in error" (2022 to 2024 returns used lines 8z and 24z;
// fees go in the basis; gains are not offset by personal losses; more than a year is long-term), the
// general 1099-K FAQs ($20,000 and 200 transactions; a platform may still send a form below it), and the
// IRS hobby-or-business pages (all facts and circumstances, no one factor decides; hobby income on
// Schedule 1 line 8j; hobby expenses not deductible). The couch is the IRS's own example; nothing else
// on the page is a figure.
export const PERSONAL_ITEMS_CHECKED_ON = "2026-11-27";
export const PERSONAL_ITEM_EXAMPLE = { paid: 1000, sold: 700 };
const IRS_1040_INSTRUCTIONS = "https://www.irs.gov/instructions/i1040gi";
const IRS_1099K_FAQ_RECEIVED =
  "https://www.irs.gov/newsroom/form-1099-k-faqs-what-to-do-if-you-receive-a-form-1099-k";
const IRS_1099K_IN_ERROR =
  "https://www.irs.gov/newsroom/actions-to-take-if-a-form-1099-k-is-received-in-error-or-with-incorrect-information";
const IRS_1099K_FAQ_GENERAL = "https://www.irs.gov/newsroom/form-1099-k-faqs-general-information";
const IRS_HOBBY =
  "https://www.irs.gov/newsroom/heres-how-to-tell-the-difference-between-a-hobby-and-a-business-for-tax-purposes";

function personalItems() {
  const path = "/personal-items-or-business";
  const title = "Sold your own things? Personal items or a business";
  const description =
    "A 1099-K for things you sold at a loss is not income: where it goes on the 2025 return, when a personal sale is a gain, and when selling is a business.";
  const ex = PERSONAL_ITEM_EXAMPLE;
  const cases = [
    [
      "Your own things, sold for less than you paid",
      "Not taxable, and the loss is not deductible. If a Form 1099-K reported the sales, the 2025 Form 1040 instructions say to enter that amount in the entry space at the top of Schedule 1, so the form is accounted for without adding to your income.",
      "Nothing to Schedule C.",
    ],
    [
      "Your own things, sold for more than you paid",
      "A capital gain: Form 8949, then Schedule D. Held more than a year, long-term; a year or less, short-term. A loss on another personal item does not offset it.",
      "Nothing to Schedule C.",
    ],
    [
      "Selling as a hobby, not for profit",
      "The income goes on Schedule 1, line 8j (activity not engaged in for profit), and the IRS says the expenses of a hobby can no longer be deducted.",
      "Nothing to Schedule C.",
    ],
    [
      "Buying to resell, or selling as a business",
      "Business income on Schedule C: gross sales on line 1, the platform's fees and your other costs as deductions, and what the items cost you through cost of goods sold.",
      `This is what ${SITE_NAME} keeps the books for.`,
    ],
  ];
  const factors = [
    "whether you run it in a businesslike way, with complete and accurate books",
    "whether you depend on the income for your living",
    "whether it has made a profit in some years",
    "the time and effort you put in, and whether you have changed methods to make it pay",
  ];
  const faqs = [
    {
      q: "Do I have to pay taxes on selling my used clothes on Poshmark or eBay?",
      a: "Not on things you sold for less than you paid for them: a personal item sold at a loss is not income, and the loss is not deductible either. A personal item sold for more than you paid is a capital gain. Buying things in order to resell them is different again; that is a business, or a hobby, and its income is reported as such.",
    },
    {
      q: "I got a 1099-K for selling personal items at a loss. What do I do?",
      a: `For 2025 returns, the Form 1040 instructions say to enter the amount in the entry space at the top of Schedule 1. If the whole box 1a was personal items sold at a loss (or sent in error), that is the whole box 1a; if only part was, only that part, and the rest is reported where it belongs. Their example: a couch bought for ${usd(ex.paid)} and sold for ${usd(ex.sold)} is ${usd(ex.sold)} in that space. Returns for 2022 to 2024 used two offsetting lines instead, 8z and 24z. You can also report the sales on Form 8949. Check the instructions for the year you are filing.`,
    },
    {
      q: "I sold personal items and resold things I bought, in the same account. Now what?",
      a: `The 1099-K adds both together. Split them in your own records: the resale side is business income on Schedule C with its fees and cost of goods; the personal side is the Schedule 1 entry (a loss) or Form 8949 (a gain). ${SITE_NAME} keeps the business side only: delete an imported sale that was a personal item, and the 1099-K check shows the gap between the form and your business books, which is the part to account for elsewhere. Which side a sale belongs on is your call or your preparer's.`,
    },
    {
      q: "Is reselling a hobby or a business?",
      a: "The IRS decides it on all the facts and circumstances, and no one factor settles it. It asks, among other things, whether the activity is run in a businesslike way with complete books, whether you depend on the income, and whether it has made a profit in some years. A business deducts its costs on Schedule C; a hobby reports its income and cannot deduct its expenses.",
    },
    {
      q: "Do I owe anything if I did not get a 1099-K?",
      a: "The form only reports payments; it does not decide what is taxable. Federal reporting starts when a platform's payments to you are over $20,000 and more than 200 transactions, some states are lower, and a platform may send one below the line. Business or hobby income is reportable whether a form comes or not; personal items sold at a loss are not income either way.",
    },
  ];
  const caseRows = cases
    .map(
      ([a, b, c]) =>
        `      <tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td><td>${esc(c)}</td></tr>`,
    )
    .join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">A Form 1099-K counts payments, not profit, and it cannot tell the jacket you wore for five years from a jacket you bought to flip. What you owe depends on which one it was.</p>
  <h2>Four kinds of sale, four places on the return</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">What you sold</th><th scope="col">How it is taxed</th><th scope="col">Schedule C?</th></tr></thead>
    <tbody>
${caseRows}
    </tbody>
  </table></div>
  <h2>Personal items sold at a loss</h2>
  <p>Most things people own sell for less than they cost. That is not income, and the loss is not a deduction. The only work is when a platform sent a <a href="${href("/1099-k")}">Form 1099-K</a> for those sales: the IRS sees a payment and needs to see where it went. The <a href="${IRS_1040_INSTRUCTIONS}">2025 Instructions for Form 1040</a> say to enter the 1099-K amount for personal items sold at a loss in the entry space at the top of Schedule 1. If only part of box 1a was personal items, enter only that part.</p>
  <div class="worked">
    <p class="muted">The IRS's own example:</p>
    <table>
      <tbody>
        <tr><th scope="row">You paid for a couch</th><td>${usd(ex.paid)}</td></tr>
        <tr><th scope="row">You sold it, and box 1a reported</th><td>${usd(ex.sold)}</td></tr>
        <tr class="total"><th scope="row">Entered at the top of Schedule 1</th><td>${usd(ex.sold)}</td></tr>
      </tbody>
    </table>
    <p class="muted">The ${usd(ex.paid - ex.sold)} loss is not deducted anywhere.</p>
  </div>
  <p>For 2022 to 2024 returns the IRS asked for two offsetting entries instead, the proceeds on Schedule 1 line 8z and the same amount on line 24z (<a href="${IRS_1099K_FAQ_RECEIVED}">Form 1099-K FAQs</a>). Reporting the sales on Form 8949 is also allowed. Follow the instructions for the year you are filing.</p>
  <h2>Personal items sold at a gain</h2>
  <p>Sell something you own for more than you paid, a sneaker that rose in value or a vintage piece bought cheap years ago, and the difference is a capital gain, on Form 8949 and Schedule D. Held more than a year it is long-term. The IRS's <a href="${IRS_1099K_IN_ERROR}">guidance on 1099-Ks</a> says to count the selling and payment fees in your basis, and that a loss on another personal item does not reduce a gain. The 1099-K never knows what you paid, so the receipt or a note of it is your record.</p>
  <h2>A hobby or a business</h2>
  <p>Buying stock to sell at a profit is where the question changes. The IRS looks at <a href="${IRS_HOBBY}">all the facts and circumstances</a>, with no one factor deciding, including:</p>
  ${list(factors)}
  <p>A hobby's income goes on Schedule 1, line 8j, and its expenses are not deductible. A business reports gross sales on Schedule C and deducts what it cost to make them: marketplace fees, labels, mileage, and the cost of the items that sold. For someone who sources regularly, that is usually a large difference; whether your selling is a business is for you or your preparer to decide.</p>
  <h2>Who needs ${esc(SITE_NAME)}, and who does not</h2>
  <p>If all you did this year was clear out a closet at a loss, you do not need bookkeeping software: keep a note of what you sold and roughly what you paid, and make the Schedule 1 entry. ${esc(SITE_NAME)} is for the business side. It reads each platform's own report, keeps the fees and the cost of goods, and fills a <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a>. If one account had both, delete the imported sales that were your own things; an item you pulled out of stock to keep can be marked as taken for personal use, so its cost comes off purchases on line 36 instead of being deducted. The <a href="${href("/1099-k")}">1099-K check</a> then shows the gap between box 1a and your business books.</p>
  <p class="muted">Rules from the IRS pages linked here, read through search excerpts ${esc(PERSONAL_ITEMS_CHECKED_ON)}; the reporting threshold from the <a href="${IRS_1099K_FAQ_GENERAL}">general 1099-K FAQs</a>. Where a 1099-K amount goes has changed from year to year; check the current instructions before you file.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "personal" })}</div>`;
  const text = `# ${title}

A Form 1099-K counts payments, not profit, and cannot tell a personal item from one bought to resell.

## Four kinds of sale

${mdList(cases.map(([a, b, c]) => `${a}: ${b} ${c}`))}

## Personal items sold at a loss

Not income; the loss is not deductible. 2025 Instructions for Form 1040 (${IRS_1040_INSTRUCTIONS}): enter the 1099-K amount for personal items sold at a loss in the entry space at the top of Schedule 1 (only the part of box 1a that was). IRS example: a couch bought for ${usd(ex.paid)} and sold for ${usd(ex.sold)}; enter ${usd(ex.sold)}. 2022 to 2024 returns used Schedule 1 lines 8z and 24z (${IRS_1099K_FAQ_RECEIVED}). Form 8949 is also allowed.

## Personal items sold at a gain

Capital gain on Form 8949 and Schedule D; long-term if held more than a year; fees count in basis; personal losses do not offset it (${IRS_1099K_IN_ERROR}).

## A hobby or a business

All facts and circumstances, no one factor deciding (${IRS_HOBBY}):

${mdList(factors)}

Hobby income: Schedule 1 line 8j, expenses not deductible. Business: Schedule C, fees and cost of goods deducted.

## ${SITE_NAME}

For the business side only. Delete imported sales that were personal items; mark an item taken out of stock for personal use (its cost comes off line 36); the 1099-K check shows the gap between box 1a and the business books. Read through search excerpts of the IRS pages ${PERSONAL_ITEMS_CHECKED_ON}; threshold from ${IRS_1099K_FAQ_GENERAL}.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Personal items or a business", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// /facebook-marketplace-taxes: the search a reseller's local sales bring on ("do I pay tax on Facebook
// Marketplace sales?"). Facebook's own pages were read through search-engine excerpts on 2026-11-28
// (facebook.com is not reachable from the build environment): the Marketplace seller protection policy
// (a 10% selling fee per transaction on shipped checkout orders, $0.80 minimum, figured on the whole
// amount including shipping and applicable taxes; local pickup has no fee) and the Commerce Manager page
// on marketplace facilitator states (Facebook collects and remits the tax on checkout sales there). Older
// Commerce Manager pages still show 5% and $0.40; the policy page is the current one. The 1099-K threshold
// is the IRS general FAQ the other pages cite. The example's figures are invented and labelled so;
// test/site.test.mjs holds the arithmetic.
export const FACEBOOK_CHECKED_ON = "2026-11-28";
export const FACEBOOK_FEE = { rate: 0.1, minimumCents: 80 };
export const FACEBOOK_EXAMPLE = [
  { what: "Denim jacket, shipped, $40 plus $8 shipping", orderCents: 4800 },
  { what: "Paperback, shipped, $5 plus $1 shipping", orderCents: 600 },
];
/** Facebook's selling fee on a shipped checkout order of `orderCents` (the whole amount, before rounding rules we cannot see). */
export function facebookFeeCents(orderCents, fee = FACEBOOK_FEE) {
  return Math.max(Math.round(orderCents * fee.rate), fee.minimumCents);
}
const META_SELLER_POLICY = "https://www.facebook.com/legal/merchant_policies";
const META_MPF_STATES = "https://www.facebook.com/business/help/225860631518504";
const META_SELLER_POLICY_QUOTE =
  "The Selling Fee will be calculated based on the entire amount of the transaction (including the sale price(s) of good(s), any shipping fees and Applicable Taxes).";

function facebookMarketplace() {
  const path = "/facebook-marketplace-taxes";
  const title = "Facebook Marketplace taxes for resellers";
  const description =
    "Do you pay tax on Facebook Marketplace sales? Local pickup or shipped, who sends a 1099-K, the 10% fee on shipped orders, and keeping the books for both.";
  const cents = (c) => `$${(c / 100).toFixed(2)}`;
  const rows = FACEBOOK_EXAMPLE.map((r) => ({ ...r, feeCents: facebookFeeCents(r.orderCents) }));
  const ways = [
    [
      "Local pickup, paid in cash",
      "Facebook takes no fee and never touches the money. No platform reports the sale.",
      "Type the sale in: date, item, what the buyer paid.",
    ],
    [
      "Local pickup, paid by Venmo, PayPal or Cash App",
      "No Facebook fee. The payment app moved the money, so any Form 1099-K for it comes from that app, not from Facebook.",
      "Import the app's statement; do not also type the sale in.",
    ],
    [
      "Local pickup, paid by Zelle or a bank transfer",
      "No Facebook fee. The deposit is on your bank statement and nowhere else.",
      "Type the sale in; the bank statement check totals the deposits that name no platform, so a missed one shows.",
    ],
    [
      "Shipped, paid through Facebook checkout",
      "Facebook keeps a 10% selling fee (at least $0.80) and pays you the rest, so for these sales Facebook is the payment platform.",
      "Type the sale in with the selling fee and the postage you paid.",
    ],
  ];
  const faqs = [
    {
      q: "Do I have to pay taxes on Facebook Marketplace sales?",
      a: "It depends on what you sold, not on the site. Your own things sold for less than you paid are not income. Things you bought to resell are business (or hobby) income, whether the buyer paid in cash, by an app or through Facebook checkout, and whether or not any form arrives.",
    },
    {
      q: "Does Facebook Marketplace report my sales to the IRS?",
      a: "Facebook can only report money it handled, which means shipped orders paid through its checkout. A Form 1099-K is filed when a platform's payments to you for the year are over $20,000 and more than 200 transactions; some states are lower, and a platform may send one below the line. Local pickups paid in cash or by a payment app are not Facebook's to report; a payment app reports its own payments under the same rules.",
    },
    {
      q: "What does Facebook charge to sell?",
      a: `Local pickup is free. On shipped orders paid through checkout, Facebook's seller policy sets a selling fee of 10% per transaction with a $0.80 minimum, figured on the whole amount: “${META_SELLER_POLICY_QUOTE}” The fee is a business expense; on the Schedule C worksheet it sits with the other platform fees.`,
    },
    {
      q: "Do I charge sales tax on Facebook Marketplace?",
      a: "On shipped checkout orders to a marketplace facilitator state, Facebook says it collects and remits the tax for you. A local sale is a sale you made yourself, so whether tax is due on it is your state's rule, the same as at a flea market.",
    },
    {
      q: "The buyer paid by Venmo and I typed the sale in too. Is it counted twice?",
      a: `It would be. In ${SITE_NAME}, a sale paid by Venmo, PayPal or Cash App comes in from that app's statement, so leave it out of the typed-in sales; type in only what no statement covers: cash, Zelle, and Facebook checkout orders.`,
    },
  ];
  const wayRows = ways
    .map(
      ([a, b, c]) =>
        `      <tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td><td>${esc(c)}</td></tr>`,
    )
    .join("\n");
  const exRows = rows
    .map(
      (r) =>
        `        <tr><th scope="row">${esc(r.what)}</th><td>${cents(r.orderCents)}</td><td>${cents(r.feeCents)}</td><td>${cents(r.orderCents - r.feeCents)}</td></tr>`,
    )
    .join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Facebook Marketplace is where many resellers sell the bulky, the local and the cheap. The tax rules are the same as anywhere else; what changes is who handled the money, and so what paper you get.</p>
  <h2>Four ways a Marketplace sale gets paid</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">How it sold</th><th scope="col">Fees and forms</th><th scope="col">In ${esc(SITE_NAME)}</th></tr></thead>
    <tbody>
${wayRows}
    </tbody>
  </table></div>
  <h2>Is it taxable?</h2>
  <p>The site does not decide it; what you sold does. Clearing out your own things at a loss is not income (see <a href="${href("/personal-items-or-business")}">personal items or a business</a>). Buying furniture, tools or clothes to flip is business or hobby income, and a cash sale counts the same as a sale paid by app. A business reports gross sales on Schedule C and deducts what made them: the selling fee, postage, <a href="${href("/mileage-deduction")}">the miles</a> to pick up stock and to meet buyers, and the <a href="${href("/cost-of-goods-sold")}">cost of the items</a> that sold.</p>
  <h2>Who sends a 1099-K</h2>
  <p>Only a platform that paid you can report the payment. For a pickup paid in cash, nobody does. For a pickup paid through a payment app, the app does, under the same <a href="${IRS_1099K_FAQ_GENERAL}">federal rule</a> as any platform: payments over $20,000 and more than 200 transactions in the year (some states are lower, and a form can come below the line). For shipped orders paid through checkout, Facebook paid you, so any form for those comes from Facebook. Selling on several apps can mean several forms, each counting only its own payments, or none at all; the books have to hold every sale either way. When a form does come, <a href="${href("/1099-k")}">box 1a counts gross payments</a>, before fees and refunds.</p>
  <h2>The fee on shipped orders</h2>
  <p>Facebook's <a href="${META_SELLER_POLICY}">Marketplace seller policy</a> sets a selling fee of 10% per transaction, at least $0.80, on shipped checkout orders, figured on the whole amount: &ldquo;${esc(META_SELLER_POLICY_QUOTE)}&rdquo; Local pickup has no fee. Some older Facebook help pages still show 5% and $0.40; the policy is the current figure.</p>
  <div class="worked">
    <p class="muted">Two invented orders, with no sales tax on them, to show the minimum at work:</p>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Order</th><th scope="col">Buyer paid</th><th scope="col">Selling fee</th><th scope="col">Before postage</th></tr></thead>
      <tbody>
${exRows}
      </tbody>
    </table></div>
    <p class="muted">10% of ${cents(rows[1].orderCents)} is ${cents(Math.round(rows[1].orderCents * FACEBOOK_FEE.rate))}, under the minimum, so the fee is ${cents(FACEBOOK_FEE.minimumCents)}. On a taxed order the fee is figured on the tax as well. Your payout statement shows the fee actually charged; use that.</p>
  </div>
  <h2>Sales tax</h2>
  <p>Facebook's <a href="${META_MPF_STATES}">page on marketplace facilitator states</a> says that in those states it collects and remits the tax on checkout sales, so that tax is not yours to report. A local pickup is a sale you made yourself; whether tax is due on it is your state's rule. More in <a href="${href("/reseller-sales-tax")}">sales tax for resellers</a>.</p>
  <h2>Keeping the books in ${esc(SITE_NAME)}</h2>
  <p>Facebook has no sales report to import, so its sales are typed in on the Imports page as sales made off the marketplaces: the date, what sold, what the buyer paid (and any shipping they paid), the fee kept and the postage. Pick the item from your stock and its cost moves to cost of goods sold. Sales paid by <a href="${href("/platforms/venmo")}">Venmo</a>, <a href="${href("/platforms/paypal")}">PayPal</a> or <a href="${href("/platforms/cash-app")}">Cash App</a> come in from those apps' statements instead, so type in only what no statement covers. Then &ldquo;Did I import everything?&rdquo; sets your bank statement's deposits against the payouts the books expect and totals the money that names no platform; if some of that is sales (Zelle, cash paid in), those are the sales still to type in. Typed-in sales count toward the free plan's monthly orders but not toward its one platform.</p>
  <p class="muted">Facebook's figures are from its seller policy and Commerce Manager help, read through search excerpts ${esc(FACEBOOK_CHECKED_ON)}; Facebook changes its fees, so check the policy before relying on them. The 1099-K threshold is from the <a href="${IRS_1099K_FAQ_GENERAL}">IRS general FAQs</a>.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "fbm" })}</div>`;
  const text = `# ${title}

The tax rules for Facebook Marketplace are the same as anywhere else; what changes is who handled the money.

## Four ways a Marketplace sale gets paid

${mdList(ways.map(([a, b, c]) => `${a}: ${b} ${SITE_NAME}: ${c}`))}

## Is it taxable?

Personal items sold at a loss are not income. Items bought to resell are business or hobby income, cash or app alike. A business reports gross sales on Schedule C and deducts the selling fee, postage, mileage and cost of goods.

## Who sends a 1099-K

Only the platform that paid you: nobody for cash, the payment app for app payments, Facebook for shipped checkout orders. Federal threshold: over $20,000 and more than 200 transactions (${IRS_1099K_FAQ_GENERAL}); some states are lower.

## The fee on shipped orders

10% per transaction, $0.80 minimum, on the whole amount including shipping and taxes (${META_SELLER_POLICY}). Local pickup: no fee. Invented examples: ${rows.map((r) => `${r.what}: fee ${cents(r.feeCents)}, ${cents(r.orderCents - r.feeCents)} before postage`).join("; ")}.

## Sales tax

Facebook collects and remits on checkout sales in marketplace facilitator states (${META_MPF_STATES}). Local sales follow your state's rule.

## In ${SITE_NAME}

Facebook sales are typed in as sales made off the marketplaces, with the fee and postage; Venmo, PayPal and Cash App payments import from their statements, so type in only what no statement covers. The bank statement check totals deposits that name no platform. Read through search excerpts ${FACEBOOK_CHECKED_ON}.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Facebook Marketplace taxes", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// /poshmark-taxes: the search Poshmark sellers make ("do I have to pay taxes on Poshmark"). The worked
// example is the app's own Poshmark fixture (apps/seller-books/test/fixtures/poshmark-my-sales-report.csv,
// an invented My Sales Report) taken through the importer's arithmetic: Poshmark's fee is not a column, so
// it is Order Price - Seller Shipping Discount - Upgraded Shipping Label Fee - Texas Seller Fee Tax - Net
// Earnings (importers/poshmark.ts), the discount and label are postage (line 27a) and the fees line 10
// (services/books/schedule-c.ts). test/site.test.mjs re-reads the fixture and checks every figure.
// Poshmark's own fee article did not load on 2026-11-28 (503), so the page states no Poshmark rate as
// fact: it says what third-party pages report and that the seller's report is what counts. Sales tax:
// Poshmark's own Posh Remit release (28 Mar 2019), quoted. The 1099-K threshold: IRS general FAQs.
export const POSHMARK_CHECKED_ON = "2026-11-28";
export const POSH_REMIT_URL =
  "https://www.prnewswire.com/news-releases/poshmark-announces-posh-remit-simplifying-sales-tax-for-sellers-across-the-country-300820038.html";
export const POSH_REMIT_QUOTE =
  "calculates, collects and submits state and local sales tax on all eligible orders";
const POSHMARK_FEE_ARTICLE = "https://support.poshmark.com/s/article/297755057?language=en_US";
/** The four sold rows of the app's Poshmark fixture (the fifth, cancelled, is skipped as the importer skips it). */
export const POSHMARK_EXAMPLE = [
  {
    title: "Madewell Perry Street Tote",
    priceCents: 4800,
    discountCents: 0,
    texasCents: 0,
    netCents: 3840,
  },
  {
    title: "J.Crew sweater (bundle)",
    priceCents: 3000,
    discountCents: 199,
    texasCents: 0,
    netCents: 2201,
  },
  {
    title: "Gap tee (same bundle)",
    priceCents: 1000,
    discountCents: 0,
    texasCents: 0,
    netCents: 705,
  },
  { title: "Kids rain boots", priceCents: 1200, discountCents: 0, texasCents: 6, netCents: 899 },
];
/** Poshmark's fee on one row, as the importer derives it. */
export function poshmarkFeeCents(r) {
  return r.priceCents - r.discountCents - r.texasCents - r.netCents;
}
/** The example's Schedule C lines: 1 gross receipts, 10 fees (Poshmark's plus the Texas tax on it), 27a postage. */
export function poshmarkLines(rows = POSHMARK_EXAMPLE) {
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const line1 = sum((r) => r.priceCents);
  const poshFee = sum(poshmarkFeeCents);
  const texas = sum((r) => r.texasCents);
  const line27a = sum((r) => r.discountCents);
  const net = sum((r) => r.netCents);
  return { line1, poshFee, texas, line10: poshFee + texas, line27a, net };
}

function poshmarkTaxes() {
  const path = "/poshmark-taxes";
  const title = "Poshmark taxes for resellers";
  const description =
    "Do you pay taxes on Poshmark sales? What is taxable, when Poshmark sends a 1099-K, why your earnings are not your income, and the sales tax Poshmark collects.";
  const cents = (c) => `$${(c / 100).toFixed(2)}`;
  const L = poshmarkLines();
  const faqs = [
    {
      q: "Do I have to pay taxes on Poshmark sales?",
      a: "It depends on what you sold. Your own clothes sold for less than you paid for them are not income. Things you bought to resell are business (or hobby) income, whether or not Poshmark sends you a form.",
    },
    {
      q: "Does Poshmark send a 1099-K?",
      a: "For federal reporting, a platform files a Form 1099-K when its payments to you for the year are over $20,000 and more than 200 transactions. Some states require one at lower amounts, and a platform may send one below the line. Business income is reportable either way.",
    },
    {
      q: "Do I report the order price or my earnings?",
      a: `The order price. Poshmark pays you your earnings, the order price less its fee and any shipping discount you offered. Gross receipts start from the sale; the fee and the discount are expenses. In the example on this page, ${cents(L.net)} reached the seller's balance from ${cents(L.line1)} of sales.`,
    },
    {
      q: "Do I collect sales tax on Poshmark?",
      a: `No. Poshmark's Posh Remit, in Poshmark's words, “${POSH_REMIT_QUOTE}”, so the tax the buyer paid is not yours to report. A sale you make off Poshmark (cash at a market, a payment app) is your own, and follows your state's rule.`,
    },
    {
      q: "What is the Texas Seller Fee Tax on my report?",
      a: `A column on Poshmark's My Sales Report for some Texas sellers, a tax charged on Poshmark's fee, taken out of your earnings. ${SITE_NAME} reads it from the column and files it with Poshmark's fee as a cost of selling, so the earnings still add up.`,
    },
  ];
  const exRows = POSHMARK_EXAMPLE.map(
    (r) =>
      `        <tr><th scope="row">${esc(r.title)}</th><td>${cents(r.priceCents)}</td><td>${cents(r.discountCents)}</td><td>${cents(r.texasCents)}</td><td>${cents(r.netCents)}</td><td>${cents(poshmarkFeeCents(r))}</td></tr>`,
  ).join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Poshmark pays you what is left after its fee, so the number you see is not the number you report. Here is what is taxable, who sends a form, and how one month of a Poshmark report becomes Schedule C lines.</p>
  <h2>Is it taxable?</h2>
  <p>Selling your own closet for less than you paid is not income (see <a href="${href("/personal-items-or-business")}">personal items or a business</a>). Buying to resell is business or hobby income, whatever the forms say. A business reports its gross sales on Schedule C and deducts what made them: Poshmark's fee, shipping discounts it offered, <a href="${href("/cost-of-goods-sold")}">the cost of the items</a> that sold, <a href="${href("/mileage-deduction")}">the miles</a> to source them and to the post office.</p>
  <h2>When Poshmark sends a 1099-K</h2>
  <p>Under the <a href="${IRS_1099K_FAQ_GENERAL}">IRS general FAQs</a>, a platform files a Form 1099-K when its payments to you for the year are over $20,000 and more than 200 transactions; some states are lower, and a form can come below the line. When one comes, <a href="${href("/1099-k")}">box 1a counts gross payments</a>, before fees and refunds, so it will not match your earnings. No form does not mean no income.</p>
  <h2>Your earnings are not your income</h2>
  <p>Poshmark's My Sales Report gives each item's order price and your net earnings, but not the fee as its own figure. ${esc(SITE_NAME)} works the fee out from the report itself: order price, less the seller shipping discount, the upgraded label fee and the Texas seller fee tax, less net earnings. The buyer's shipping pays for Poshmark's label and never reaches you, so it is neither income nor your expense.</p>
  <div class="worked">
    <p class="muted">One invented month: the four sold rows of the sample report ${esc(SITE_NAME)}'s Poshmark importer is tested on (a fifth, cancelled, is skipped):</p>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Item</th><th scope="col">Order price</th><th scope="col">Shipping discount</th><th scope="col">Texas seller fee tax</th><th scope="col">Net earnings</th><th scope="col">Poshmark's fee (worked out)</th></tr></thead>
      <tbody>
${exRows}
      </tbody>
    </table></div>
    <p>On the Schedule C worksheet: line 1, gross receipts, <strong>${cents(L.line1)}</strong>; line 10, commissions and fees, <strong>${cents(L.line10)}</strong> (${cents(L.poshFee)} of Poshmark's fee and ${cents(L.texas)} of Texas tax on it); line 27a, postage, <strong>${cents(L.line27a)}</strong> (the shipping discount). Line 1 less those two is ${cents(L.line1 - L.line10 - L.line27a)}, exactly the earnings Poshmark paid out; the items' cost comes off after that.</p>
    <p class="muted">The fees worked out here, 20% on the two items of $15 or more and $2.95 on the two under it, match the rates third-party fee pages report for Poshmark. Poshmark's own <a href="${POSHMARK_FEE_ARTICLE}">fee article</a> did not load when we checked (${esc(POSHMARK_CHECKED_ON)}), so we state no rate as Poshmark's: your report's figures are what was charged.</p>
  </div>
  <h2>Sales tax</h2>
  <p>Poshmark's <a href="${POSH_REMIT_URL}">Posh Remit announcement</a> (28 March 2019) says the service &ldquo;${esc(POSH_REMIT_QUOTE)}&rdquo;. The Sales Tax column on your report is the buyer's tax, already handled: ${esc(SITE_NAME)} keeps it out of income and out of the sales tax you collected. More in <a href="${href("/reseller-sales-tax")}">sales tax for resellers</a>.</p>
  <h2>Keeping the books in ${esc(SITE_NAME)}</h2>
  <p>Request My Sales Report from your Poshmark account, import the CSV, and each row becomes a sale with its fee, discount and Texas tax beside it; a bundle stays one order, with each item's own cost. Link items to your stock and their cost moves to cost of goods sold. Sell on eBay, Mercari or Depop too? They go in the same books (see the <a href="${href("/platforms/poshmark")}">Poshmark page</a> and the others), and the worksheet adds them up.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "posh" })}</div>`;
  const text = `# ${title}

Poshmark pays you what is left after its fee, so the number you see is not the number you report.

## Is it taxable?

Personal items sold at a loss are not income. Items bought to resell are business or hobby income. A business reports gross sales on Schedule C and deducts Poshmark's fee, shipping discounts, cost of goods and mileage.

## When Poshmark sends a 1099-K

Federal threshold: over $20,000 and more than 200 transactions (${IRS_1099K_FAQ_GENERAL}); some states are lower. Box 1a is gross, before fees and refunds.

## Your earnings are not your income

Poshmark's fee is worked out from My Sales Report: order price − seller shipping discount − upgraded label fee − Texas seller fee tax − net earnings. Invented example (the importer's sample report): ${POSHMARK_EXAMPLE.map((r) => `${r.title}: ${cents(r.priceCents)}, fee ${cents(poshmarkFeeCents(r))}`).join("; ")}. Schedule C: line 1 ${cents(L.line1)}, line 10 ${cents(L.line10)}, line 27a ${cents(L.line27a)}; earnings ${cents(L.net)}. Poshmark's fee article did not load on ${POSHMARK_CHECKED_ON}; no rate is stated as Poshmark's.

## Sales tax

Posh Remit "${POSH_REMIT_QUOTE}" (${POSH_REMIT_URL}, 28 March 2019).

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Poshmark taxes", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// /ebay-taxes: the search eBay sellers make ("do I pay taxes on eBay sales", "eBay seller taxes"). The
// worked example is the app's own eBay fixture (apps/seller-books/test/fixtures/ebay-transaction-report.csv,
// an invented Transaction report) taken through the importer's arithmetic (importers/ebay.ts): an Order row's
// item subtotal and shipping are the sale, its fee columns are the fees, eBay-collected tax is kept out; a
// Refund row's gross less the tax refunded is the refund, with the fee credited back; a Shipping label row is
// postage and a Promoted Listings "Other fee" is advertising; Payout rows and non-USD rows are skipped. Lines
// from services/books/schedule-c.ts. test/site.test.mjs re-reads the fixture and checks every figure. The
// fixture's fees are invented and do not follow eBay's rates, so the page says so and works eBay's own
// published rate (fee page, quoted, read 2026-11-28) on one sale beside it.
export const EBAY_CHECKED_ON = "2026-11-28";
export const EBAY_FEES_URL =
  "https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822";
export const EBAY_FEES_QUOTE =
  "This fee is calculated as a percentage of the total amount of the sale, plus a per order fee. For orders $10.00 or less the per order fee is $0.30, for orders over $10.00 the per order fee is $0.40.";
export const EBAY_TOTAL_QUOTE =
  "includes the item price, any handling charges, any shipping costs collected from the buyer (some exceptions apply), sales tax, and any other applicable fees";
export const EBAY_MOST_CATEGORIES_RATE =
  "13.6% on total amount of the sale up to $7,500 calculated per item";
export const EBAY_TAX_URL =
  "https://www.ebay.com/help/selling/selling/taxes-import-charges?id=4121";
export const EBAY_TAX_QUOTE =
  "eBay calculates, collects, and remits sales tax on behalf of sellers for items shipped to customers in the states and territories listed below.";
export const EBAY_FEE_TAX_STATES =
  "Hawaii, New Mexico, South Dakota, Texas, Washington, and West Virginia";
/** The USD rows of the app's eBay fixture that reach the books (the payout and the GBP order are skipped). */
export const EBAY_EXAMPLE = {
  orders: [
    {
      title: "Vintage Levi's 501 jeans",
      itemCents: 4000,
      shippingCents: 500,
      taxCents: 330,
      feeCents: { fixed: 40, variable: 594, international: 0 },
      netCents: 3866,
    },
    {
      title: "Pyrex Butterprint bowl set (2)",
      itemCents: 125000,
      shippingCents: 0,
      taxCents: 7813,
      feeCents: { fixed: 40, variable: 16813, international: 1875 },
      netCents: 106272,
    },
  ],
  // The jeans came back: the buyer got $48.30, $3.30 of it eBay's tax; the variable fee was credited.
  refund: { grossCents: 4830, taxCents: 330, feeCreditCents: 594, netCents: -3906 },
  labelCents: 875,
  promotedCents: 1240,
};
const ebayOrderFees = (o) => o.feeCents.fixed + o.feeCents.variable + o.feeCents.international;
/** The example's Schedule C lines: 1 gross receipts, 2 returns, 8 advertising, 10 fees, 27a postage. */
export function ebayLines(ex = EBAY_EXAMPLE) {
  const line1 = ex.orders.reduce((a, o) => a + o.itemCents + o.shippingCents, 0);
  const line2 = ex.refund.grossCents - ex.refund.taxCents;
  const line10 = ex.orders.reduce((a, o) => a + ebayOrderFees(o), 0) - ex.refund.feeCreditCents;
  const tax = ex.orders.reduce((a, o) => a + o.taxCents, 0);
  const net =
    ex.orders.reduce((a, o) => a + o.netCents, 0) +
    ex.refund.netCents -
    ex.labelCents -
    ex.promotedCents;
  return { line1, line2, line8: ex.promotedCents, line10, line27a: ex.labelCents, tax, net };
}
/** eBay's published most-categories final value fee on one order's total: 13.6% plus the per order fee. */
export function ebayPublishedFeeCents(totalCents) {
  return Math.round(totalCents * 0.136) + (totalCents > 1000 ? 40 : 30);
}

function ebayTaxes() {
  const path = "/ebay-taxes";
  const title = "eBay taxes for resellers";
  const description =
    "Do you pay taxes on eBay sales? What is taxable, when eBay sends a 1099-K, the sales tax eBay collects, and how a Transaction report becomes Schedule C lines.";
  const cents = (c) => `$${(c / 100).toFixed(2)}`;
  const money = (c) =>
    `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const L = ebayLines();
  const jeans = EBAY_EXAMPLE.orders[0];
  const jeansTotal = jeans.itemCents + jeans.shippingCents + jeans.taxCents;
  const faqs = [
    {
      q: "Do I have to pay taxes on eBay sales?",
      a: "It depends on what you sold. Your own things sold for less than you paid for them are not income. Things you bought to resell are business (or hobby) income, whether or not eBay sends you a form.",
    },
    {
      q: "Does eBay send a 1099-K?",
      a: "For federal reporting, a platform files a Form 1099-K when its payments to you for the year are over $20,000 and more than 200 transactions. Some states require one at lower amounts, and a platform may send one below the line. Business income is reportable either way.",
    },
    {
      q: "Do I report my payouts or my sales?",
      a: `Your sales. A payout is money moving from eBay to your bank, after fees, refunds and labels have come out. Gross receipts are the item price and the shipping the buyer paid; the fees, labels and promoted listing charges are expenses. In the example on this page, ${money(L.net)} was left for the seller from ${money(L.line1)} of sales.`,
    },
    {
      q: "Do I report the sales tax eBay collected?",
      a: `No. In eBay's words, “${EBAY_TAX_QUOTE}” That tax is in the buyer's total and in eBay's fee base, but it is not your income, and ${SITE_NAME} keeps it out of gross receipts.`,
    },
    {
      q: "Where do promoted listing fees go?",
      a: 'On Schedule C line 8, advertising, not with eBay\'s selling fees on line 10. eBay lists them in the Transaction report as an "Other fee" row; Seller Books reads the description and files them as advertising.',
    },
  ];
  const orderRows = EBAY_EXAMPLE.orders
    .map(
      (o) =>
        `        <tr><th scope="row">${esc(o.title)}</th><td>${money(o.itemCents)}</td><td>${cents(o.shippingCents)}</td><td>${cents(o.taxCents)}</td><td>${money(ebayOrderFees(o))}</td><td>${money(o.netCents)}</td></tr>`,
    )
    .join("\n");
  const R = EBAY_EXAMPLE.refund;
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">eBay's payouts are what is left after fees, refunds and labels, and the buyer's total includes sales tax that was never yours. Here is what is taxable, who sends a form, and how a month of eBay's Transaction report becomes Schedule C lines.</p>
  <h2>Is it taxable?</h2>
  <p>Clearing out your own closet or garage for less than you paid is not income (see <a href="${href("/personal-items-or-business")}">personal items or a business</a>). Buying to resell is business or hobby income, whatever the forms say. A business reports its gross sales on Schedule C and deducts what made them: eBay's fees, shipping labels, promoted listings, <a href="${href("/cost-of-goods-sold")}">the cost of the items</a> that sold, <a href="${href("/mileage-deduction")}">the miles</a> to source them and to the post office.</p>
  <h2>When eBay sends a 1099-K</h2>
  <p>Under the <a href="${IRS_1099K_FAQ_GENERAL}">IRS general FAQs</a>, a platform files a Form 1099-K when its payments to you for the year are over $20,000 and more than 200 transactions; some states are lower, and a form can come below the line. When one comes, <a href="${href("/1099-k")}">box 1a counts gross payments</a>, before fees and refunds, so it will not match your payouts. No form does not mean no income.</p>
  <h2>Sales tax eBay collects</h2>
  <p>eBay's <a href="${EBAY_TAX_URL}">sales tax page</a> says &ldquo;${esc(EBAY_TAX_QUOTE)}&rdquo; The eBay collected tax column on your report is the buyer's tax, already handled: ${esc(SITE_NAME)} keeps it out of income and out of the sales tax you collected (<a href="${href("/reseller-sales-tax")}">sales tax for resellers</a>). The same page says eBay may also charge tax on its selling fees to sellers in ${esc(EBAY_FEE_TAX_STATES)}, shown on your tax invoice: that is part of the cost of selling.</p>
  <h2>A Transaction report, line by line</h2>
  <p>eBay's Transaction report (Seller Hub, Payments, Reports) has one row per ledger entry: an Order row carries the sale with its fees in their own columns, and refunds, shipping labels, other fees and payouts arrive as separate rows, often on other days. Payout rows are money moving to your bank and are left out, or the same sale would count twice.</p>
  <div class="worked">
    <p class="muted">One invented month: the rows of the sample report ${esc(SITE_NAME)}'s eBay importer is tested on that reach the books (a payout row and a sale in pounds are skipped). Its fees are made up, not eBay's rates:</p>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Order</th><th scope="col">Item subtotal</th><th scope="col">Shipping</th><th scope="col">eBay collected tax</th><th scope="col">eBay fees</th><th scope="col">Net amount</th></tr></thead>
      <tbody>
${orderRows}
      </tbody>
    </table></div>
    <p>Then the jeans came back: a Refund row of ${cents(R.grossCents)} to the buyer, ${cents(R.taxCents)} of it eBay's tax, with ${cents(R.feeCreditCents)} of the fee credited back (net &minus;${cents(-R.netCents)}). A Shipping label row charged ${cents(EBAY_EXAMPLE.labelCents)}, and an Other fee row, &ldquo;Promoted Listings - General fee&rdquo;, ${cents(EBAY_EXAMPLE.promotedCents)}.</p>
    <p>On the Schedule C worksheet: line 1, gross receipts, <strong>${money(L.line1)}</strong> (item subtotals plus shipping, without the ${cents(L.tax)} of tax); line 2, returns and allowances, <strong>${cents(L.line2)}</strong> (the refund less the tax that went back through eBay); line 8, advertising, <strong>${cents(L.line8)}</strong>; line 10, commissions and fees, <strong>${cents(L.line10)}</strong> (the order fees less the credit); line 27a, postage, <strong>${cents(L.line27a)}</strong>. Line 1 less those four is ${money(L.line1 - L.line2 - L.line8 - L.line10 - L.line27a)}, exactly the net of every row; the items' cost comes off after that.</p>
  </div>
  <h2>What eBay's own rate gives</h2>
  <p>eBay's <a href="${EBAY_FEES_URL}">selling fees page</a> (read ${esc(EBAY_CHECKED_ON)}): &ldquo;${esc(EBAY_FEES_QUOTE)}&rdquo; The total amount of the sale &ldquo;${esc(EBAY_TOTAL_QUOTE)}&rdquo;, and for most categories the rate is &ldquo;${esc(EBAY_MOST_CATEGORIES_RATE)}&rdquo;. On the jeans' total of ${cents(jeansTotal)}, that is ${cents(ebayPublishedFeeCents(jeansTotal) - 40)} plus $0.40, or ${cents(ebayPublishedFeeCents(jeansTotal))}. The fee is worked on the sales tax too, so it is a larger share of your price than the rate suggests. Rates differ by category and change; ${esc(SITE_NAME)} applies none of them and reads what your report says was charged.</p>
  <h2>Keeping the books in ${esc(SITE_NAME)}</h2>
  <p>Download the Transaction report from Seller Hub and import the CSV. Each order becomes a sale with its fees beside it, refunds and labels keep their order number, promoted listings go to advertising and payouts are skipped. Link items to your stock and their cost moves to cost of goods sold. Sell on Poshmark, Mercari or Whatnot too? They go in the same books (see the <a href="${href("/platforms/ebay")}">eBay page</a> and the others), and the worksheet adds them up.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "ebay" })}</div>`;
  const text = `# ${title}

eBay's payouts are what is left after fees, refunds and labels; the buyer's total includes sales tax that was never yours.

## Is it taxable?

Personal items sold at a loss are not income. Items bought to resell are business or hobby income. A business reports gross sales on Schedule C and deducts eBay's fees, labels, promoted listings, cost of goods and mileage.

## When eBay sends a 1099-K

Federal threshold: over $20,000 and more than 200 transactions (${IRS_1099K_FAQ_GENERAL}); some states are lower. Box 1a is gross, before fees and refunds.

## Sales tax eBay collects

"${EBAY_TAX_QUOTE}" (${EBAY_TAX_URL}). Not your income. eBay may charge tax on its fees to sellers in ${EBAY_FEE_TAX_STATES}.

## A Transaction report, line by line

Invented example (the importer's sample report; fees made up): ${EBAY_EXAMPLE.orders.map((o) => `${o.title}: ${money(o.itemCents)} + ${cents(o.shippingCents)} shipping, fees ${money(ebayOrderFees(o))}`).join("; ")}; a refund of ${cents(R.grossCents)} with ${cents(R.taxCents)} tax and ${cents(R.feeCreditCents)} fee credit; label ${cents(EBAY_EXAMPLE.labelCents)}; promoted listings ${cents(EBAY_EXAMPLE.promotedCents)}. Schedule C: line 1 ${money(L.line1)}, line 2 ${cents(L.line2)}, line 8 ${cents(L.line8)}, line 10 ${cents(L.line10)}, line 27a ${cents(L.line27a)}; net ${money(L.net)}. Payout rows are skipped.

## What eBay's own rate gives

"${EBAY_FEES_QUOTE}" (${EBAY_FEES_URL}, read ${EBAY_CHECKED_ON}). Most categories: ${EBAY_MOST_CATEGORIES_RATE}. On a ${cents(jeansTotal)} total: ${cents(ebayPublishedFeeCents(jeansTotal))}.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "eBay taxes", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// /whatnot-taxes: the search Whatnot sellers make ("do I have to pay taxes on Whatnot", "Whatnot 1099-K").
// The worked example is the app's own Whatnot fixture (apps/seller-books/test/fixtures/whatnot-orders-report.csv,
// an invented Seller Weekly Orders Report) taken through the importer's arithmetic (importers/whatnot.ts):
// an Order Earnings row's sale is Post Coupon Price, its fees are commission, payment processing and the
// taxes on them (line 10), seller-paid Shipping Fee (a giveaway's) and Shipping Charge rows are postage
// (line 27a), a tip is income, a refund is returns (line 2), and the CAD row is skipped
// (services/books/schedule-c.ts). test/site.test.mjs re-reads the fixture and checks every figure.
// Whatnot's own help articles, read 2026-11-28 through the help centre's public article API (the HTML
// pages answer automated readers with 403): the 1099-K (31543985599245), U.S. sales tax collection
// (360061196012), taxes on its commissions and fees (32083195713421) and giveaways (11329417780365).
export const WHATNOT_CHECKED_ON = "2026-11-28";
const WN_HELP = "https://help.whatnot.com/hc/en-us/articles/";
export const WHATNOT_1099K_URL = `${WN_HELP}31543985599245-2026-Form-1099-K-for-U-S-Sellers`;
export const WHATNOT_1099K_QUOTE =
  "The 1099-K issued by Whatnot will report all 2026 Whatnot earnings.";
export const WHATNOT_PAYPAL_QUOTE =
  "If you do not have a connected Stripe account linked to your Whatnot profile, i.e., you have exclusively used PayPal to process your cash-outs, you will not receive a 1099-K from Whatnot.";
export const WHATNOT_SALES_TAX_URL = `${WN_HELP}360061196012-U-S-Sales-Tax-Collection-on-Whatnot`;
export const WHATNOT_SALES_TAX_QUOTE =
  "Where required in the states and territories of the U.S., Whatnot collects sales taxes on behalf of sellers.";
export const WHATNOT_FEE_TAX_URL = `${WN_HELP}32083195713421-Taxes-on-Whatnot-commissions-and-fees`;
export const WHATNOT_FEE_TAX_QUOTE =
  "Taxes are deducted from U.S. sellers' order earnings and remitted to the applicable state by Whatnot.";
export const WHATNOT_GIVEAWAY_URL = `${WN_HELP}11329417780365-About-giveaways-on-Whatnot`;
export const WHATNOT_GIVEAWAY_QUOTE =
  "Giveaway shipping costs are deducted directly from the Seller's Whatnot balance when the Giveaway is run.";
/**
 * The USD rows of the app's Whatnot fixture, in file order (the seventh, in CAD, is skipped as the importer
 * skips it). kind: sale (Order Earnings), tip, giveaway (Order Earnings with Buy Format Giveaway), refund,
 * label (Shipping Charge). fees: commission + processing + the taxes on them.
 */
export const WHATNOT_EXAMPLE = [
  {
    title: "Pokemon booster pack (auction)",
    kind: "sale",
    priceCents: 2500,
    feesCents: 323,
    shipCents: 0,
    amountCents: 2177,
  },
  {
    title: "Vintage Starter jacket ($5 coupon)",
    kind: "sale",
    priceCents: 7500,
    feesCents: 907,
    shipCents: 0,
    amountCents: 6593,
  },
  {
    title: "Partial refund on the jacket",
    kind: "refund",
    priceCents: 0,
    feesCents: 0,
    shipCents: 0,
    amountCents: -4000,
  },
  {
    title: "Tip from a buyer",
    kind: "tip",
    priceCents: 500,
    feesCents: 45,
    shipCents: 0,
    amountCents: 455,
  },
  {
    title: "Sticker pack giveaway",
    kind: "giveaway",
    priceCents: 0,
    feesCents: 0,
    shipCents: 499,
    amountCents: -499,
  },
  {
    title: "Shipping label adjustment",
    kind: "label",
    priceCents: 0,
    feesCents: 0,
    shipCents: 125,
    amountCents: -125,
  },
];
/** The example's Schedule C lines: 1 gross receipts, 2 returns, 10 fees, 27a postage; net is the balance change. */
export function whatnotLines(rows = WHATNOT_EXAMPLE) {
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  return {
    line1: sum((r) => r.priceCents),
    line2: sum((r) => (r.kind === "refund" ? -r.amountCents : 0)),
    line10: sum((r) => r.feesCents),
    line27a: sum((r) => r.shipCents),
    net: sum((r) => r.amountCents),
  };
}

function whatnotTaxes() {
  const path = "/whatnot-taxes";
  const title = "Whatnot taxes for resellers";
  const description =
    "Do you pay taxes on Whatnot sales? When Whatnot sends a 1099-K, the sales tax it collects, and one week of tips, giveaways and fees worked to Schedule C.";
  const cents = (c) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;
  const L = whatnotLines();
  const faqs = [
    {
      q: "Do I have to pay taxes on Whatnot sales?",
      a: "On the profit from things you bought to resell, yes, whether or not a form arrives. Your own collection sold for less than you paid is not income. Sellers who buy to flip, rip packs or run regular shows are usually running a business and report it on Schedule C.",
    },
    {
      q: "Does Whatnot send a 1099-K?",
      a: `To U.S. sellers who cash out through Stripe and pass the reporting threshold: for 2026, more than $20,000 and more than 200 transactions federally, lower in some states. In Whatnot's words, “${WHATNOT_PAYPAL_QUOTE}” Those sellers may get one from PayPal instead. The income is reportable either way.`,
    },
    {
      q: "Are Whatnot tips taxable?",
      a: `A tip a buyer sends during your show is money your selling brought in, so it belongs in gross receipts with your sales. In the example on this page, a ${cents(500)} tip arrives as ${cents(455)} after processing: ${cents(500)} is income and ${cents(45)} a fee.`,
    },
    {
      q: "How do I handle giveaways?",
      a: `A giveaway brings in nothing, but it costs you its shipping and the item. Whatnot takes the shipping from your balance; in the books it is postage. The item's cost leaves your stock like any other item's. Neither is a sale.`,
    },
    {
      q: "Do I collect sales tax on Whatnot?",
      a: `No, not on Whatnot orders in the states Whatnot lists. Whatnot: “${WHATNOT_SALES_TAX_QUOTE}” Sales you make off Whatnot (a card show table, a payment app) follow your state's own rules.`,
    },
  ];
  const exRows = WHATNOT_EXAMPLE.map(
    (r) =>
      `        <tr><th scope="row">${esc(r.title)}</th><td>${r.priceCents ? cents(r.priceCents) : "—"}</td><td>${r.feesCents ? cents(r.feesCents) : "—"}</td><td>${r.shipCents ? cents(r.shipCents) : "—"}</td><td>${cents(r.amountCents)}</td></tr>`,
  ).join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">A live show turns into dozens of small rows: sales, tips, giveaways, a refund, a label adjustment. Whatnot pays you the net of all of them, so the money in your balance is not the number you report. Here is what is taxable, who sends a form, and one week of a Whatnot report worked into Schedule C lines.</p>
  <h2>Is it taxable?</h2>
  <p>Selling cards from your own collection for less than you paid is not income (see <a href="${href("/personal-items-or-business")}">personal items or a business</a>). Buying sealed product, lots or singles to resell is business or hobby income, whatever the forms say. A business reports gross sales on Schedule C and deducts what made them: Whatnot's fees, the shipping you paid, <a href="${href("/cost-of-goods-sold")}">the cost of the items</a> that sold or went out as giveaways, and <a href="${href("/mileage-deduction")}">the miles</a> to source them and to the post office.</p>
  <h2>When Whatnot sends a 1099-K</h2>
  <p>Whatnot's <a href="${WHATNOT_1099K_URL}">2026 Form 1099-K article</a> says it issues the form through Stripe to U.S. sellers who cashed out with Stripe and pass the threshold, in Seller Hub by 31 January 2027, and that &ldquo;${esc(WHATNOT_1099K_QUOTE)}&rdquo; The federal threshold is more than $20,000 and more than 200 transactions (<a href="${IRS_1099K_FAQ_GENERAL}">IRS general FAQs</a>); some states are lower. A seller who only cashed out through PayPal gets no Whatnot form, and may get one from PayPal. When one comes, <a href="${href("/1099-k")}">box 1a counts gross payments</a>, so it will not match what you cashed out. No form does not mean no income.</p>
  <h2>What one week looks like</h2>
  <p>Whatnot's Seller Weekly Orders Report (Seller Hub, Financials, Statements) has one row per transaction. Each sale's row gives the price after your coupons, the commission, the payment processing fee and any tax on those fees, and the Transaction Amount that reached your balance. Tips, refunds and label charges are rows of their own, and a giveaway is a row with no price and your shipping cost.</p>
  <div class="worked">
    <p class="muted">One invented week: the U.S. rows of the sample report ${esc(SITE_NAME)}'s Whatnot importer is tested on (a seventh row, paid in Canadian dollars, is skipped):</p>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Row</th><th scope="col">Sale or tip</th><th scope="col">Whatnot's fees</th><th scope="col">Shipping you paid</th><th scope="col">Transaction Amount</th></tr></thead>
      <tbody>
${exRows}
      </tbody>
    </table></div>
    <p>On the Schedule C worksheet: line 1, gross receipts, <strong>${cents(L.line1)}</strong> (two sales and the tip; the giveaway adds nothing); line 2, returns and allowances, <strong>${cents(L.line2)}</strong> (the partial refund); line 10, commissions and fees, <strong>${cents(L.line10)}</strong>; line 27a, postage, <strong>${cents(L.line27a)}</strong> (the giveaway's shipping and the label adjustment). Line 1 less those three is ${cents(L.line1 - L.line2 - L.line10 - L.line27a)}, exactly the week's Transaction Amounts added up; the items' cost comes off after that.</p>
    <p class="muted">The jacket's $5 coupon is not an expense: the sale is the price after it, which is also the price Whatnot charges commission on. The ${cents(13)} in the jacket's fees is tax on Whatnot's commission, which Whatnot charges sellers in some states (<a href="${WHATNOT_FEE_TAX_URL}">its article</a>: &ldquo;${esc(WHATNOT_FEE_TAX_QUOTE)}&rdquo;). It is a cost of selling, filed with the fee.</p>
  </div>
  <h2>Giveaways</h2>
  <p>Whatnot's <a href="${WHATNOT_GIVEAWAY_URL}">giveaway article</a>: &ldquo;${esc(WHATNOT_GIVEAWAY_QUOTE)}&rdquo; A show with ten giveaways can cost more in shipping than one sale earns, and none of it shows as a fee. In ${esc(SITE_NAME)} each giveaway row is a zero sale with its shipping as postage, so the show's real profit includes it; link the item given away and its cost leaves your stock with it.</p>
  <h2>Sales tax</h2>
  <p>Whatnot's <a href="${WHATNOT_SALES_TAX_URL}">sales tax article</a> says &ldquo;${esc(WHATNOT_SALES_TAX_QUOTE)}&rdquo; It lists the states and adds that sellers may still have their own reporting duties. The tax in the report's Buyer Paid column is the buyer's, already handled, so ${esc(SITE_NAME)} does not read it as income. More in <a href="${href("/reseller-sales-tax")}">sales tax for resellers</a>.</p>
  <h2>Keeping the books in ${esc(SITE_NAME)}</h2>
  <p>Download each week's orders report from Seller Hub and import the CSVs; every row is kept once by its ledger ID, so an overlapping week is not counted twice. Sales, tips, giveaways, refunds and label charges land on the right lines, and rows in another currency are set aside with a reason. Split a mystery lot's cost across its items, link the items to their sales, and cost of goods follows. Sell on eBay, Poshmark or Mercari too? They go in the same books (see the <a href="${href("/platforms/whatnot")}">Whatnot page</a>).</p>
  <p class="muted">Whatnot's articles were read on ${esc(WHATNOT_CHECKED_ON)}; rules and thresholds change, so check its help centre and the IRS before you file.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "wn" })}</div>`;
  const text = `# ${title}

Whatnot pays you the net of a show's sales, tips, giveaways, refunds and fees, so your balance is not the number you report.

## Is it taxable?

Personal items sold at a loss are not income. Items bought to resell are business or hobby income. A business reports gross sales on Schedule C and deducts Whatnot's fees, shipping it paid (giveaways included), cost of goods and mileage.

## When Whatnot sends a 1099-K

Through Stripe, to U.S. sellers who cashed out with Stripe and pass the threshold (${WHATNOT_1099K_URL}): "${WHATNOT_1099K_QUOTE}" "${WHATNOT_PAYPAL_QUOTE}" Federal threshold: more than $20,000 and more than 200 transactions (${IRS_1099K_FAQ_GENERAL}); some states are lower.

## One week worked through

Invented example (the importer's sample Seller Weekly Orders Report, U.S. rows): ${WHATNOT_EXAMPLE.map((r) => `${r.title}: amount ${cents(r.amountCents)}`).join("; ")}. Schedule C: line 1 ${cents(L.line1)}, line 2 ${cents(L.line2)}, line 10 ${cents(L.line10)}, line 27a ${cents(L.line27a)}; net ${cents(L.net)}, the Transaction Amounts' total.

## Giveaways

"${WHATNOT_GIVEAWAY_QUOTE}" (${WHATNOT_GIVEAWAY_URL}). Booked as a zero sale with the shipping as postage.

## Sales tax

"${WHATNOT_SALES_TAX_QUOTE}" (${WHATNOT_SALES_TAX_URL}). Taxes on Whatnot's own fees: "${WHATNOT_FEE_TAX_QUOTE}" (${WHATNOT_FEE_TAX_URL}). Read ${WHATNOT_CHECKED_ON}.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Whatnot taxes", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// /mercari-taxes: the search Mercari sellers make ("do I have to pay taxes on Mercari", "Mercari 1099-K").
// The worked example is the app's own Mercari fixture (apps/seller-books/test/fixtures/mercari-sales-report.csv,
// an invented Gross Sales Report with Mercari's own column names) taken through the importer's rules
// (importers/mercari.ts): cancelled and not-yet-completed rows are skipped, a sale is dated by Completed Date,
// the selling, payment processing and shipping adjustment fees are line 10, and the label (seller-paid plus
// buyer-paid shipping) is postage, line 27a, with the buyer's shipping also in gross receipts
// (services/books/schedule-c.ts). test/site.test.mjs re-reads the fixture and checks every figure. Mercari's
// rules are quoted from its help centre, read 2026-11-28: "1099-K related FAQs" (article 163) and "Sales Tax
// Policy" (article 465). No Mercari fee rate is stated: the report's charged amounts are what count.
export const MERCARI_CHECKED_ON = "2026-11-28";
export const MERCARI_1099K_URL = "https://www.mercari.com/us/help_center/article/163";
export const MERCARI_COMPLETED_QUOTE = "Only completed transactions are reported on the 1099-K.";
export const MERCARI_GROSS_QUOTE = "Payments are calculated based on unadjusted gross payments";
export const MERCARI_SALES_TAX_URL = "https://www.mercari.com/us/help_center/article/465";
export const MERCARI_SALES_TAX_QUOTE =
  "Mercari began calculating, collecting, reporting, and remitting applicable sales tax on behalf of our third-party sellers";
/** The three completed rows of the app's Mercari fixture, in the importer's order (the bad-date row is skipped). */
export const MERCARI_EXAMPLE = [
  {
    title: "Nintendo DS Lite (pink)",
    sold: "2026-02-01",
    completed: "2026-02-05",
    itemCents: 4500,
    buyerShipCents: 0,
    sellerShipCents: 750,
    feeCents: 450,
    adjustmentCents: 0,
    salesTaxCents: 360,
    netCents: 3300,
  },
  {
    title: "Lego minifig lot",
    sold: "2026-02-03",
    completed: "2026-02-08",
    itemCents: 2000,
    buyerShipCents: 599,
    sellerShipCents: 0,
    feeCents: 260,
    adjustmentCents: 125,
    salesTaxCents: 160,
    netCents: 1615,
  },
  {
    title: "Vintage tee, sold over New Year",
    sold: "2025-12-30",
    completed: "2026-01-03",
    itemCents: 1500,
    buyerShipCents: 0,
    sellerShipCents: 500,
    feeCents: 150,
    adjustmentCents: 0,
    salesTaxCents: 120,
    netCents: 850,
  },
];
/** The example's Schedule C lines as the worksheet adds them: 1 gross receipts, 10 fees, 27a postage. */
export function mercariLines(rows = MERCARI_EXAMPLE) {
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const items = sum((r) => r.itemCents);
  const buyerShip = sum((r) => r.buyerShipCents);
  return {
    items,
    buyerShip,
    line1: items + buyerShip,
    line10: sum((r) => r.feeCents + r.adjustmentCents),
    line27a: sum((r) => r.sellerShipCents + r.buyerShipCents),
    salesTax: sum((r) => r.salesTaxCents),
    net: sum((r) => r.netCents),
  };
}

function mercariTaxes() {
  const path = "/mercari-taxes";
  const title = "Mercari taxes for resellers";
  const description =
    "Do you pay taxes on Mercari sales? When Mercari sends a 1099-K, why it won't match your proceeds, which year a sale counts in, and Mercari's sales tax.";
  const cents = (c) => `$${(c / 100).toFixed(2)}`;
  const L = mercariLines();
  const tee = MERCARI_EXAMPLE[2];
  const faqs = [
    {
      q: "Do I have to pay taxes on Mercari sales?",
      a: "It depends on what you sold. Your own things sold for less than you paid for them are not income. Things you bought to resell are business (or hobby) income, whether or not Mercari sends you a form.",
    },
    {
      q: "Does Mercari send a 1099-K?",
      a: "For federal reporting, a platform files a Form 1099-K when its payments to you for the year are over $20,000 and more than 200 transactions. Some states require one at lower amounts. Business income is reportable either way.",
    },
    {
      q: "Why is my Mercari 1099-K higher than what I was paid?",
      a: `Mercari says ${MERCARI_GROSS_QUOTE.toLowerCase()}: its help page counts the item price, the shipping the buyer paid and the sales tax the buyer paid, before Mercari's fees and the labels you paid for. Your proceeds are after all of those. In the example on this page, ${cents(L.net)} reached the seller's balance, while the same three sales come to ${cents(L.line1 + L.salesTax)} as that help page describes the count.`,
    },
    {
      q: "Which year does a Mercari sale count in?",
      a: `Mercari's 1099-K help page says: “${MERCARI_COMPLETED_QUOTE}” ${SITE_NAME} dates each sale by its Completed Date, so an item sold on 30 December and completed on 3 January counts in the new year, the same year Mercari's form counts it.`,
    },
    {
      q: "Do I collect sales tax on Mercari?",
      a: `No, for sales Mercari handles. Its Sales Tax Policy says “${MERCARI_SALES_TAX_QUOTE}”, so the tax the buyer paid is not your income and not yours to send in. A sale you make off Mercari is your own, and follows your state's rule.`,
    },
  ];
  const exRows = MERCARI_EXAMPLE.map(
    (r) =>
      `        <tr><th scope="row">${esc(r.title)}</th><td>${esc(r.completed)}</td><td>${cents(r.itemCents)}</td><td>${cents(r.buyerShipCents)}</td><td>${cents(r.sellerShipCents)}</td><td>${cents(r.feeCents + r.adjustmentCents)}</td><td>${cents(r.netCents)}</td></tr>`,
  ).join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Mercari's 1099-K counts more than you were paid, and your proceeds count less than you earned. Here is what is taxable, which year a sale lands in, and how three sales from a Mercari report become Schedule C lines.</p>
  <h2>Is it taxable?</h2>
  <p>Selling your own things for less than you paid is not income (see <a href="${href("/personal-items-or-business")}">personal items or a business</a>). Buying to resell is business or hobby income, whatever the forms say. A business reports its gross sales on Schedule C and deducts what made them: Mercari's fees, the shipping labels, <a href="${href("/cost-of-goods-sold")}">the cost of the items</a> that sold and <a href="${href("/mileage-deduction")}">the miles</a> to source them.</p>
  <h2>When Mercari sends a 1099-K, and why it won't match</h2>
  <p>Under the <a href="${IRS_1099K_FAQ_GENERAL}">IRS general FAQs</a>, a platform files a Form 1099-K when its payments to you for the year are over $20,000 and more than 200 transactions; some states are lower. No form does not mean no income.</p>
  <p>Mercari's <a href="${MERCARI_1099K_URL}">1099-K FAQs</a> say two things that shape your books. First, &ldquo;${esc(MERCARI_GROSS_QUOTE)}&rdquo;: the item price, the shipping the buyer paid and the sales tax the buyer paid, before fees and labels. Second, &ldquo;${esc(MERCARI_COMPLETED_QUOTE)}&rdquo; So the form is gross of everything, and it follows the date a sale completed, not the date it sold. More on reading the form in <a href="${href("/1099-k")}">Form 1099-K for resellers</a>.</p>
  <h2>Three sales, worked to the worksheet</h2>
  <p>Mercari's Gross Sales Report lists each fee in its own column, so nothing needs working out. ${esc(SITE_NAME)} books only completed orders, because Mercari's fees are estimates until then and an order in progress can still be cancelled, and it dates each one by its Completed Date.</p>
  <div class="worked">
    <p class="muted">Invented sales: the three completed rows of the sample report ${esc(SITE_NAME)}'s Mercari importer is tested on (a cancelled order, one still in transit and a row with an impossible date are skipped and named on import):</p>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Item</th><th scope="col">Completed</th><th scope="col">Item price</th><th scope="col">Buyer paid shipping</th><th scope="col">Seller paid shipping</th><th scope="col">Mercari fees</th><th scope="col">Net proceeds</th></tr></thead>
      <tbody>
${exRows}
      </tbody>
    </table></div>
    <p>On the Schedule C worksheet: line 1, gross receipts, <strong>${cents(L.line1)}</strong> (${cents(L.items)} of items and the ${cents(L.buyerShip)} of shipping the buyer paid); line 10, commissions and fees, <strong>${cents(L.line10)}</strong> (selling fees and a shipping adjustment); line 27a, postage, <strong>${cents(L.line27a)}</strong> (every label, the buyer-paid one included, since Mercari bought it with that money). Line 1 less those two is ${cents(L.line1 - L.line10 - L.line27a)}, exactly the proceeds Mercari paid out; the items' cost comes off after that. The buyers' ${cents(L.salesTax)} of sales tax is on the report but in none of these lines.</p>
    <p>The tee sold on ${esc(tee.sold)} and completed on ${esc(tee.completed)}, so it is a ${esc(tee.completed.slice(0, 4))} sale in ${esc(SITE_NAME)}, as on Mercari's form. Booked by sold date it would land a year early, in the wrong year's return.</p>
    <p class="muted">We state no Mercari fee rate: Mercari has changed its fees several times, and the charged amounts on your report are what counts. Mercari's help pages were read ${esc(MERCARI_CHECKED_ON)}.</p>
  </div>
  <h2>Sales tax</h2>
  <p>Mercari's <a href="${MERCARI_SALES_TAX_URL}">Sales Tax Policy</a> says that under marketplace facilitator laws &ldquo;${esc(MERCARI_SALES_TAX_QUOTE)}&rdquo;. The Sales Tax Charged to Buyer column is the buyer's tax, already handled: ${esc(SITE_NAME)} keeps it out of income and out of the sales tax you collected. Columns ending &ldquo;Charged to Buyer&rdquo; are the buyer's too, and are never read as your fees. More in <a href="${href("/reseller-sales-tax")}">sales tax for resellers</a>.</p>
  <h2>Keeping the books in ${esc(SITE_NAME)}</h2>
  <p>Download the Gross Sales Report from your Mercari account, import the CSV, and each completed row becomes a sale with its fees and label beside it. Link items to your stock and their cost moves to cost of goods sold. Sell on eBay, Poshmark or Depop too? They go in the same books (see the <a href="${href("/platforms/mercari")}">Mercari page</a> and the others), and the worksheet adds them up.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "mercari-tax" })}</div>`;
  const text = `# ${title}

Mercari's 1099-K counts more than you were paid, and your proceeds count less than you earned.

## Is it taxable?

Personal items sold at a loss are not income. Items bought to resell are business or hobby income. A business reports gross sales on Schedule C and deducts Mercari's fees, shipping labels, cost of goods and mileage.

## When Mercari sends a 1099-K

Federal threshold: over $20,000 and more than 200 transactions (${IRS_1099K_FAQ_GENERAL}); some states are lower. Mercari (${MERCARI_1099K_URL}): "${MERCARI_GROSS_QUOTE}" (item price, buyer-paid shipping and buyer-paid sales tax), and "${MERCARI_COMPLETED_QUOTE}"

## Three sales, worked

Invented example (the importer's sample report, completed rows only, dated by Completed Date): ${MERCARI_EXAMPLE.map((r) => `${r.title}: completed ${r.completed}, item ${cents(r.itemCents)}, fees ${cents(r.feeCents + r.adjustmentCents)}, net ${cents(r.netCents)}`).join("; ")}. Schedule C: line 1 ${cents(L.line1)}, line 10 ${cents(L.line10)}, line 27a ${cents(L.line27a)}; proceeds ${cents(L.net)}. The tee sold ${tee.sold} and completed ${tee.completed}, so it counts in ${tee.completed.slice(0, 4)}. No Mercari fee rate is stated; help pages read ${MERCARI_CHECKED_ON}.

## Sales tax

Mercari (${MERCARI_SALES_TAX_URL}): "${MERCARI_SALES_TAX_QUOTE}".

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Mercari taxes", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// /amazon-taxes: the search Amazon sellers make ("do I pay taxes on Amazon sales", "Amazon FBA taxes",
// "Amazon seller 1099-K"). The worked example is the app's own Amazon fixture
// (apps/seller-books/test/fixtures/amazon-date-range-report.csv, an invented Date Range Report in the widely
// quoted US layout; the importer reads its columns by name) taken through the importer's rules
// (importers/amazon.ts) and the worksheet's (services/books/schedule-c.ts): an Order's product sales and
// promotional rebates are the item, its shipping and gift wrap credits are shipping charged (both line 1); a
// Refund's item and shipping are line 2 and the fees it credits back lower line 10; a Service Fee is the
// selling plan (line 27a, software and platform subscriptions) or advertising (line 8) by its description;
// FBA Inventory Fees and Adjustments are line 10 (a reimbursement is a credit there, with a warning); a
// Shipping Services label is line 27a postage; a Transfer, another marketplace and an unknown type are
// skipped and named. test/site.test.mjs re-reads the fixture and those rules. Amazon's sales tax rule is
// quoted from its Marketplace Tax Collection help page (amazon.com, nodeId 202211260), read 2026-11-28 in a
// browser. No Amazon fee rate is stated: the report's charged amounts are what count.
export const AMAZON_CHECKED_ON = "2026-11-28";
export const AMAZON_TAX_URL =
  "https://www.amazon.com/gp/help/customer/display.html?nodeId=202211260";
export const AMAZON_TAX_QUOTE =
  "As the marketplace facilitator, Amazon calculates, collects, remits, and refunds sales tax on third party sellers transactions destined to states where this legislation is enacted.";
/**
 * The amazon.com rows of the app's Amazon fixture that the importer books, in file order, with where each
 * lands on the worksheet (cents; a fee credited back is a negative line 10).
 */
export const AMAZON_EXAMPLE = [
  {
    date: "2026-03-03",
    type: "Order",
    what: "LEGO Technic set, sealed (sent in to FBA)",
    totalCents: 1705,
    line1: 2500,
    line10: 795,
  },
  {
    date: "2026-03-05",
    type: "Order",
    what: "First edition hardcover (shipped yourself, $1.00 promotion)",
    totalCents: 3811,
    line1: 4499,
    line10: 688,
  },
  {
    date: "2026-03-09",
    type: "Refund",
    what: "LEGO Technic set, sealed",
    totalCents: -2200,
    line2: 2500,
    line10: -300,
  },
  {
    date: "2026-03-01",
    type: "Service Fee",
    what: "Subscription",
    totalCents: -3999,
    software: 3999,
  },
  {
    date: "2026-03-08",
    type: "Service Fee",
    what: "Cost of Advertising",
    totalCents: -1234,
    line8: 1234,
  },
  {
    date: "2026-03-07",
    type: "FBA Inventory Fee",
    what: "FBA storage fee",
    totalCents: -321,
    line10: 321,
  },
  {
    date: "2026-03-07",
    type: "FBA Inventory Fee",
    what: "FBA storage fee",
    totalCents: -321,
    line10: 321,
  },
  {
    date: "2026-03-10",
    type: "Adjustment",
    what: "FBA Inventory Reimbursement - Lost:Warehouse",
    totalCents: 850,
    line10: -850,
  },
  {
    date: "2026-03-06",
    type: "Shipping Services",
    what: "Shipping label purchase",
    totalCents: -610,
    postage: 610,
  },
];
/** The rows the importer skips, and why, as the page names them. */
export const AMAZON_SKIPPED = [
  {
    type: "Transfer",
    what: "To account ending in: 123",
    totalCents: -20000,
    why: "a payout to the bank: money moving, not income",
  },
  {
    type: "Order",
    what: "First edition hardcover, on amazon.ca",
    totalCents: 3750,
    why: "another Amazon marketplace (only amazon.com, in USD)",
  },
];
/** Buyers' sales tax on the two orders, taken back out on the same rows as "marketplace withheld tax". */
export const AMAZON_WITHHELD_TAX_CENTS = 175 + 315;
/** The example's Schedule C lines as the worksheet adds them. */
export function amazonLines(rows = AMAZON_EXAMPLE) {
  const sum = (f) => rows.reduce((a, r) => a + (r[f] ?? 0), 0);
  return {
    line1: sum("line1"),
    line2: sum("line2"),
    line8: sum("line8"),
    line10: sum("line10"),
    postage: sum("postage"),
    software: sum("software"),
    net: sum("totalCents"),
  };
}

function amazonTaxes() {
  const path = "/amazon-taxes";
  const title = "Amazon seller taxes for resellers";
  const description =
    "Do you pay taxes on Amazon sales? Why deposits aren't income, where FBA fees, the selling plan and reimbursements go on Schedule C, and Amazon's sales tax.";
  const cents = (c) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;
  const L = amazonLines();
  const transfer = AMAZON_SKIPPED[0];
  const reimbursement = AMAZON_EXAMPLE.find((r) => r.type === "Adjustment");
  const where = (r) =>
    [
      r.line1 && `line 1 ${cents(r.line1)}`,
      r.line2 && `line 2 ${cents(r.line2)}`,
      r.line8 && `line 8 ${cents(r.line8)}`,
      r.line10 && `line 10 ${cents(r.line10)}`,
      r.postage && `line 27a postage ${cents(r.postage)}`,
      r.software && `line 27a subscriptions ${cents(r.software)}`,
    ]
      .filter(Boolean)
      .join(", ");
  const faqs = [
    {
      q: "Do I have to pay taxes on Amazon sales?",
      a: "On profit from things you bought to resell, yes: retail and online arbitrage, wholesale and book flips are business (or hobby) income, whether or not Amazon sends you a form. Your own things sold for less than you paid for them are not income.",
    },
    {
      q: "Does Amazon send a 1099-K?",
      a: "For federal reporting, a platform files a Form 1099-K when its payments to you for the year are over $20,000 and more than 200 transactions. Some states require one at lower amounts. Business income is reportable either way.",
    },
    {
      q: "Why doesn't my Amazon 1099-K match my deposits?",
      a: `The IRS instructions say box 1a is figured “${BOX_1A_QUOTE}”: refunds, fees and the shipping buyers paid stay in. Your deposits are after Amazon's fees, refunds, the selling plan, advertising and labels. Neither is your income: your books start from the orders, take out returns and expenses, and the deposits are only money moving to your bank. Whether Amazon's box 1a includes the sales tax it collected is not stated on a page we could check, so ${SITE_NAME} doesn't assume it.`,
    },
    {
      q: "Do I collect sales tax on Amazon?",
      a: `Not on the sales Amazon handles. Amazon's Marketplace Tax Collection page says: “${AMAZON_TAX_QUOTE}” So the tax on each order is not your income and not yours to send in. Sales you make off Amazon, on your own store or at a market, follow your state's rule.`,
    },
    {
      q: "Is an FBA reimbursement income?",
      a: `It is money Amazon paid you for stock it lost or damaged. ${SITE_NAME} books it as a credit against fees, so your profit is right, and tells you how many there were, because your preparer may want it on line 6 (other income) instead, with the lost items marked written off so their cost isn't counted twice. Ask them which.`,
    },
    {
      q: "Where do the selling plan and advertising go?",
      a: `${SITE_NAME} puts the monthly selling plan on line 27a with other software and platform subscriptions, Sponsored Products advertising on line 8, and FBA fulfillment and storage fees with the referral fees on line 10. It is a worksheet to check with your preparer, not a return.`,
    },
  ];
  const exRows = AMAZON_EXAMPLE.map(
    (r) =>
      `        <tr><td>${esc(r.date)}</td><th scope="row">${esc(r.type)}: ${esc(r.what)}</th><td>${cents(r.totalCents)}</td><td>${esc(where(r))}</td></tr>`,
  ).join("\n");
  const skipRows = AMAZON_SKIPPED.map(
    (r) => `<li>${esc(r.type)}, ${esc(r.what)} (${cents(r.totalCents)}): ${esc(r.why)}.</li>`,
  ).join("");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Amazon's deposits are not your income, and neither is its 1099-K. Here is what is taxable, where Amazon's many fees go, and how one month of a Date Range Report becomes Schedule C lines that add back up to the money that moved.</p>
  <h2>Is it taxable?</h2>
  <p>Buying to resell, whether retail arbitrage, online arbitrage, wholesale lots or used books, is business or hobby income, whatever the forms say. Selling your own things for less than you paid is not income (see <a href="${href("/personal-items-or-business")}">personal items or a business</a>). A business reports its gross sales on Schedule C and deducts what made them: Amazon's fees, the selling plan, advertising, labels, <a href="${href("/cost-of-goods-sold")}">the cost of the items</a> that sold, and <a href="${href("/mileage-deduction")}">the miles</a> driven to source them.</p>
  <h2>The 1099-K, and why deposits don't match it</h2>
  <p>Under the <a href="${IRS_1099K_FAQ_GENERAL}">IRS general FAQs</a>, a platform files a Form 1099-K when its payments to you for the year are over $20,000 and more than 200 transactions; some states are lower. No form does not mean no income.</p>
  <p>The <a href="${IRS_1099K_INSTRUCTIONS}">IRS instructions</a> say box 1a is figured &ldquo;${esc(BOX_1A_QUOTE)}.&rdquo; So a sale that was later refunded is still in it, and so is the shipping the buyer paid. Your deposits go the other way: they are what is left after every fee, refund and charge Amazon takes from your balance. The Date Range Report sits between the two, one row per order, refund, fee and payout, and that is what your books are built from. More on reading the form in <a href="${href("/1099-k")}">Form 1099-K for resellers</a>.</p>
  <h2>One month, worked to the worksheet</h2>
  <p>Each row of the report says what it added to or took from your balance (its total), with the item, shipping, tax and each kind of fee in its own column. ${esc(SITE_NAME)} reads every fee from its own column, never from a rate, and books each type of row in its place.</p>
  <div class="worked">
    <p class="muted">Invented sales: the sample Date Range Report ${esc(SITE_NAME)}'s Amazon importer is tested on, every row it books, in the report's order:</p>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Date</th><th scope="col">Row</th><th scope="col">Total</th><th scope="col">On the worksheet</th></tr></thead>
      <tbody>
${exRows}
      </tbody>
    </table></div>
    <p>Two more rows are left out, and the import names each:</p>
    <ul>${skipRows}</ul>
    <p class="muted">(The sample also has one row of a made-up type, there to test that a type the importer doesn't read yet is named on import rather than guessed at.)</p>
    <p>On the Schedule C worksheet: line 1, gross receipts, <strong>${cents(L.line1)}</strong> (items after the seller's own promotion, and the $5.99 of shipping the buyer paid); line 2, returns, <strong>${cents(L.line2)}</strong>; line 8, advertising, <strong>${cents(L.line8)}</strong>; line 10, commissions and fees, <strong>${cents(L.line10)}</strong> (referral and FBA fees, storage and the report's regulatory fee, less the ${cents(-AMAZON_EXAMPLE[2].line10)} of referral fee the refund credited back and the ${cents(reimbursement.totalCents)} reimbursement); line 27a, <strong>${cents(L.postage)}</strong> of postage and <strong>${cents(L.software)}</strong> for the selling plan.</p>
    <p>Line 1 less all of those is ${cents(L.line1 - L.line2 - L.line8 - L.line10 - L.postage - L.software)}, exactly the nine totals added up: the month cost this seller money before the items' cost even comes off. The ${cents(transfer.totalCents)} transfer is not in any line. Counting deposits as income would have put ${cents(-transfer.totalCents)} on line 1 for a month that lost money.</p>
    <p>The refund gave back ${cents(-AMAZON_EXAMPLE[2].line10)} of the ${cents(375)} referral fee charged on the sale; the report nets the two, and ${esc(SITE_NAME)} books what was actually credited. The ${cents(AMAZON_WITHHELD_TAX_CENTS)} of buyers' sales tax on the two orders is taken back out on the same rows as &ldquo;marketplace withheld tax&rdquo;, so it is in none of these lines.</p>
    <p class="muted">We state no Amazon fee rate: referral and FBA fees vary by category, size and date, and the charged amounts on your report are what count. Amazon's help page was read ${esc(AMAZON_CHECKED_ON)}. The sample uses the widely quoted US column layout; the importer matches columns by name and checks that each order's columns add up to its total.</p>
  </div>
  <h2>FBA reimbursements</h2>
  <p>When Amazon loses or damages stock you sent in, it pays you for it as an Adjustment. ${esc(SITE_NAME)} books that as a credit against fees, which keeps profit right, and the import warns you how many there were and what they came to. Your preparer may prefer it on line 6, other income; either way, mark the lost items written off in your stock so their cost leaves inventory once, not twice.</p>
  <h2>Sales tax</h2>
  <p>Amazon's <a href="${AMAZON_TAX_URL}">Marketplace Tax Collection</a> page says: &ldquo;${esc(AMAZON_TAX_QUOTE)}&rdquo; The tax on each order line is the buyer's, collected and taken back out by Amazon on the same row, and ${esc(SITE_NAME)} keeps it out of your income and out of the sales tax you collected. Your own sales off Amazon are different: see <a href="${href("/reseller-sales-tax")}">sales tax for resellers</a>.</p>
  <h2>Keeping the books in ${esc(SITE_NAME)}</h2>
  <p>In Seller Central, download the Date Range Report, transaction kind (Payments, then Reports Repository), import the CSV, and each order, refund, fee and reimbursement lands in its place, with the payouts and other marketplaces named and left out. Link items to your stock and their cost moves to cost of goods sold. Sell on eBay, Mercari or Poshmark too? They go in the same books (see the <a href="${href("/platforms/amazon")}">Amazon page</a> and the others), and the worksheet adds them up.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "amazon-tax" })}</div>`;
  const text = `# ${title}

Amazon's deposits are not your income, and neither is its 1099-K.

## Is it taxable?

Items bought to resell (retail or online arbitrage, wholesale, books) are business or hobby income. Personal items sold at a loss are not income. A business reports gross sales on Schedule C and deducts Amazon's fees, the selling plan, advertising, labels, cost of goods and mileage.

## The 1099-K

Federal threshold: over $20,000 and more than 200 transactions (${IRS_1099K_FAQ_GENERAL}); some states are lower. Box 1a is figured "${BOX_1A_QUOTE}" (${IRS_1099K_INSTRUCTIONS}). Deposits are after fees, refunds and charges. Neither is income; the books are built from the Date Range Report.

## One month, worked

Invented example (the importer's sample Date Range Report, the rows it books): ${AMAZON_EXAMPLE.map((r) => `${r.date} ${r.type}: ${r.what}, total ${cents(r.totalCents)} -> ${where(r)}`).join("; ")}. Skipped and named: ${AMAZON_SKIPPED.map((r) => `${r.type} (${r.what}, ${cents(r.totalCents)}): ${r.why}`).join("; ")}. Schedule C: line 1 ${cents(L.line1)}, line 2 ${cents(L.line2)}, line 8 ${cents(L.line8)}, line 10 ${cents(L.line10)}, line 27a postage ${cents(L.postage)} and selling plan ${cents(L.software)}; together ${cents(L.net)}, the sum of the booked rows' totals. The transfer is not income. Buyers' sales tax (${cents(AMAZON_WITHHELD_TAX_CENTS)}) is withheld by Amazon on the same rows. FBA reimbursements are booked against fees with a warning; a preparer may put them on line 6. No Amazon fee rate is stated; help page read ${AMAZON_CHECKED_ON}.

## Sales tax

Amazon (${AMAZON_TAX_URL}): "${AMAZON_TAX_QUOTE}"

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Amazon taxes", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// The cost of goods sold page: Schedule C Part III for a reseller, line by line. The IRS wording quoted
// here is from the Instructions for Schedule C (2025) and Publication 334 (2025), read on irs.gov
// 2026-11-26. Every figure in the worked example is invented and labelled so; test/site.test.mjs holds
// its sums.
const IRS_SC_INSTRUCTIONS = "https://www.irs.gov/instructions/i1040sc";
const IRS_PUB_334 = "https://www.irs.gov/publications/p334";
const IRS_PUB_583 = "https://www.irs.gov/publications/p583";
// Publication 583, "Supporting Business Documents", Inventory (read 2026-11-28).
const INVENTORY_DOCS_QUOTE =
  "Your supporting documents should show the amount paid and that the amount was for inventory.";
const INVENTORY_DOCS = [
  "Canceled checks",
  "Cash register tape receipts",
  "Credit card sales slips",
  "Invoices",
];
const IRS_FORM_3115 = "https://www.irs.gov/forms-pubs/about-form-3115";
// Schedule C instructions (2025), Part III, "Exception for small business taxpayers".
const NO_INVENTORY_QUOTE =
  "If you are a small business taxpayer, you can choose not to keep an inventory, but you must still use a method of accounting for inventory that clearly reflects income.";
// Same section: the gross receipts test.
const SMALL_BUSINESS_QUOTE =
  "have average annual gross receipts of $31 million or less for the 3 prior tax years (indexed for inflation)";
// Same section, "Treating inventory as nonincidental material or supplies".
const SUPPLIES_QUOTE = "in the year in which they are first used or consumed in your operations";
// Schedule C instructions (2025), line 33.
const VALUATION_QUOTE =
  "Your inventories can be valued at cost, the lower of cost or market, or any other method approved by the IRS.";
// Publication 334 (2025), chapter 6, line 39, "Freight-in".
const FREIGHT_IN_QUOTE =
  "Freight-in, express-in, and cartage-in on raw materials, supplies you use in production, and merchandise you purchase for sale are all part of cost of goods sold.";
// Publication 334 (2025), chapter 6, line 37.
const LABOR_QUOTE =
  "Small merchandisers (wholesalers, retailers, etc.) usually do not have labor costs that can properly be charged to cost of goods sold.";
// Publication 334 (2025), chapter 6, line 35.
const OPENING_QUOTE = "You must explain any difference in a schedule attached to your return.";

export const COGS_EXAMPLE = {
  opening: 1800,
  purchases: 6400,
  personalUse: 150,
  freightIn: 0,
  closing: 2250,
};

export function cogsLines(ex = COGS_EXAMPLE) {
  const line36 = ex.purchases - ex.personalUse;
  const line40 = ex.opening + line36 + ex.freightIn;
  return {
    line35: ex.opening,
    line36,
    line39: ex.freightIn,
    line40,
    line41: ex.closing,
    line42: line40 - ex.closing,
  };
}

function costOfGoodsSold() {
  const path = "/cost-of-goods-sold";
  const title = "Cost of goods sold for resellers";
  const description =
    "Schedule C Part III for resellers, lines 35 to 42: opening inventory, purchases, closing inventory and cost of goods sold, with a worked example.";
  const ex = COGS_EXAMPLE;
  const l = cogsLines(ex);
  const lines = [
    [
      "35",
      "Inventory at beginning of year",
      "Last year's line 41: the cost of what was on your shelves on January 1. If it differs from last year's closing figure, the IRS asks for an explanation attached to the return.",
    ],
    [
      "36",
      "Purchases less cost of items withdrawn for personal use",
      "What you paid for everything you bought to resell this year (thrift, retail, wholesale, bulk lots), less the cost of anything you took out of stock to keep or give away.",
    ],
    ["37", "Cost of labor", "Usually empty for a reseller. Never what you pay yourself."],
    [
      "38",
      "Materials and supplies",
      "Usually empty for a reseller: it is for materials used in making goods. Mailers and tape are shipping supplies, an expense on their own line.",
    ],
    ["39", "Other costs", "For example freight-in: what you paid to have stock delivered to you."],
    ["40", "Add lines 35 through 39", "Everything you could have sold this year, at cost."],
    [
      "41",
      "Inventory at end of year",
      "The cost of what is still unsold on December 31. It becomes next year's line 35.",
    ],
    [
      "42",
      "Cost of goods sold",
      "Line 40 minus line 41, carried to line 4 on the front of Schedule C.",
    ],
  ];
  const mistakes = [
    [
      "Deducting every purchase in the year you made it",
      "If you keep an inventory, an item's cost reaches line 42 the year it sells. Stock bought in December and sold in March counts in March's year.",
    ],
    [
      "A line 35 that isn't last year's line 41",
      `Publication 334 expects opening inventory to match the year before's closing inventory: “${OPENING_QUOTE}”`,
    ],
    [
      "Forgetting the items you kept",
      "The cost of things you pulled out of stock for yourself or as gifts comes off line 36; they are not a business cost.",
    ],
    [
      "Mixing up freight-in and outbound shipping",
      "Freight-in, what it cost to get stock delivered to you, is part of cost of goods (Publication 334, line 39). Labels to send orders to buyers are usually reported as a selling expense instead; where yours go is a choice you make with your preparer, and the worksheet lets you set it.",
    ],
    [
      "A sale that never took its item out of stock",
      `If a sale isn't matched to the item that sold, that item is still counted on line 41, which overstates closing inventory and understates cost of goods. ${SITE_NAME} names those sales before you use Part III.`,
    ],
  ];
  const faqs = [
    {
      q: "What counts as cost of goods sold for a reseller?",
      a: "What you paid for the items that sold during the year, worked out on Schedule C Part III as opening inventory, plus purchases (less anything you kept for yourself) and costs such as freight-in, minus the inventory still unsold at year end. Platform fees and mileage are expenses on their own lines, not cost of goods.",
    },
    {
      q: "Do I have to keep an inventory?",
      a: `Not always. The Schedule C instructions say: “${NO_INVENTORY_QUOTE}” You qualify as a small business taxpayer if you “${SMALL_BUSINESS_QUOTE}” and are not a tax shelter. Which method suits you, and whether changing method needs Form 3115, is a question for your tax preparer.`,
    },
    {
      q: "How do I split the cost of a bulk lot or a mystery box?",
      a: `${SITE_NAME} spreads a lot's total cost evenly over the items in it, unless you type a cost for an item yourself; the shares always add back up to what you paid. If one item in the lot is clearly worth more, give it its own cost and the rest is split over the others.`,
    },
    {
      q: "What value do I use for unsold stock at year end?",
      a: `The Schedule C instructions say: “${VALUATION_QUOTE}” ${SITE_NAME} values each item at what you paid for it.`,
    },
  ];
  const lineRows = lines
    .map(
      ([n, label, what]) =>
        `      <tr><td>${esc(n)}</td><th scope="row">${esc(label)}</th><td>${esc(what)}</td></tr>`,
    )
    .join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Cost of goods sold is not what you spent on inventory this year. It is the cost of what sold: what you started the year with, plus what you bought, minus what was still on the shelves at the end. On Schedule C it is Part III, lines 35 to 42.</p>
  <h2>Part III, line by line</h2>
  <p>The line names are the form's own, as reproduced in <a href="${IRS_PUB_334}">IRS Publication 334</a>, chapter 6. What goes in each is how a reseller usually fills it.</p>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Line</th><th scope="col">On the form</th><th scope="col">For a reseller</th></tr></thead>
    <tbody>
${lineRows}
    </tbody>
  </table></div>
  <p>Two lines are usually empty for resellers. On labor, Publication 334 says: &ldquo;${esc(LABOR_QUOTE)}&rdquo; On line 39 it says: &ldquo;${esc(FREIGHT_IN_QUOTE)}&rdquo;</p>
  <div class="worked">
    <p class="muted">An invented example, to show the arithmetic:</p>
    <table>
      <tbody>
        <tr><th scope="row">Line 35, stock on hand January 1, at cost</th><td>${usd(l.line35)}</td></tr>
        <tr><th scope="row">Bought to resell during the year</th><td>${usd(ex.purchases)}</td></tr>
        <tr><th scope="row">Less items kept for yourself, at cost</th><td>&minus;${usd(ex.personalUse)}</td></tr>
        <tr><th scope="row">Line 36</th><td>${usd(l.line36)}</td></tr>
        <tr class="total"><th scope="row">Line 40, lines 35 to 39</th><td>${usd(l.line40)}</td></tr>
        <tr><th scope="row">Line 41, still unsold December 31, at cost</th><td>&minus;${usd(l.line41)}</td></tr>
        <tr class="total"><th scope="row">Line 42, cost of goods sold</th><td>${usd(l.line42)}</td></tr>
      </tbody>
    </table>
    <p class="muted">${usd(ex.purchases)} was spent on stock, but only ${usd(l.line42)} is cost of goods sold this year. The ${usd(l.line41)} still on the shelves is next year's line 35, and becomes cost of goods when it sells.</p>
  </div>
  <h2>Bulk lots, bins and mystery boxes</h2>
  <p>Part III needs a cost for each item that sold and each item still unsold, but a lot is bought for one price. ${esc(SITE_NAME)} spreads a lot's cost evenly over the items in it unless you type a cost for an item yourself; leftover cents go to the first items, so the shares always add back up to exactly what you paid. Whether an even split suits a particular lot is your call: give the one valuable piece in a box its own cost and the rest is shared by the others. The stock report then shows <a href="${href("/reseller-sell-through-rate")}">whether each lot has paid for itself</a>, along with sell-through and days to sell. Keeping purchases in a spreadsheet for now? The free <a href="${href("/reseller-inventory-spreadsheet")}">reseller inventory spreadsheet</a> has a row per purchase, the lot rule and a year summary of these lines, and imports into ${esc(SITE_NAME)} later.</p>
  <h2>Receipts for what you paid</h2>
  <p>Line 36 is only as good as the records behind it. <a href="${IRS_PUB_583}">IRS Publication 583</a> on inventory: &ldquo;${esc(INVENTORY_DOCS_QUOTE)}&rdquo; The documents it names are ${esc(
    INVENTORY_DOCS.map((d) => d.toLowerCase())
      .join(", ")
      .replace(/, ([^,]*)$/, " and $1"),
  )}. A thrift-store or estate-sale receipt is the cash register tape; a pallet or wholesale order is the invoice. Photograph it the day you buy, because thermal paper fades.</p>
  <p>In ${esc(SITE_NAME)} the receipt goes on the purchase it paid for: a lot's receipt covers every item in the lot, and an item bought on its own carries its own. The Inventory page counts the year's items that have one and lists the costliest without, so you know which receipts to find before you file, and the year-end ZIP has them in a <code>purchase-receipts/</code> folder named by date, vendor and amount.</p>
  <h2>Keeping an inventory, or not</h2>
  <p>The <a href="${IRS_SC_INSTRUCTIONS}">Schedule C instructions</a> start Part III with the general rule, that a business selling merchandise must take inventories into account at the start and end of the year, then an exception: &ldquo;${esc(NO_INVENTORY_QUOTE)}&rdquo; You are a small business taxpayer if you &ldquo;${esc(SMALL_BUSINESS_QUOTE)}&rdquo; and are not a tax shelter.</p>
  <p>Without an inventory, the instructions name two methods the IRS accepts as clearly reflecting income: treating inventory as non-incidental materials and supplies, deducted &ldquo;${esc(SUPPLIES_QUOTE)},&rdquo; or following how your own books treat it. When goods bought to resell count as used or consumed is a point to settle with your preparer. Switching methods is a change of accounting method, made with <a href="${IRS_FORM_3115}">Form 3115</a>. Which method fits you is a question for your tax preparer.</p>
  <p>${esc(SITE_NAME)} keeps an inventory: each item at what you paid, tracked from purchase to the sale, write-off or personal use that takes it out of stock, so line 41 is a list of real items you can hand over. On value, the instructions say: &ldquo;${esc(VALUATION_QUOTE)}&rdquo; ${esc(SITE_NAME)} uses cost.</p>
  <h2>Mistakes that move line 42</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Mistake</th><th scope="col">Why it matters</th></tr></thead>
    <tbody>
${mistakes.map(([a, b]) => `      <tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td></tr>`).join("\n")}
    </tbody>
  </table></div>
  <h2>Part III in ${esc(SITE_NAME)}</h2>
  <p>Import your sales from ${PLATFORMS.map((p) => `<a href="${href(`/platforms/${p.slug}`)}">${esc(p.name)}</a>`).join(", ")}, record what you buy, and each sale is matched to the item that sold. At year end the <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a> fills lines 35, 36, 41 and 42 from those records, with the closing inventory listed item by item. Type in line 41 from last year's return and it becomes line 35, with a warning if your item records disagree. A refunded item that comes back goes back into stock at its cost. It is a worksheet for you or your tax preparer, not a filed return.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "cogs" })}</div>`;
  const text = `# ${title}

Cost of goods sold is the cost of what sold: opening inventory, plus purchases, minus closing inventory. On Schedule C it is Part III, lines 35 to 42 (line names from IRS Publication 334, chapter 6: ${IRS_PUB_334}).

## Part III, line by line

${mdList(lines.map(([n, label, what]) => `Line ${n}, ${label}: ${what}`))}

Publication 334 on labor: "${LABOR_QUOTE}" On line 39: "${FREIGHT_IN_QUOTE}"

An invented example: line 35 ${usd(l.line35)}; purchases ${usd(ex.purchases)} less ${usd(ex.personalUse)} kept for personal use is line 36, ${usd(l.line36)}; line 40 ${usd(l.line40)}; line 41 ${usd(l.line41)}; line 42, cost of goods sold, ${usd(l.line42)}.

## Bulk lots

${SITE_NAME} spreads a lot's cost evenly over its items unless an item has a typed-in cost; the shares add back up to the lot total.

## Receipts for what you paid

IRS Publication 583 (${IRS_PUB_583}) on inventory: "${INVENTORY_DOCS_QUOTE}" It names ${INVENTORY_DOCS.join(", ").toLowerCase()}. In ${SITE_NAME} a lot's receipt covers every item in it; an item bought alone carries its own. The Inventory page counts the year's items with and without one, and the year-end ZIP holds them in purchase-receipts/.

## Keeping an inventory, or not

Schedule C instructions (${IRS_SC_INSTRUCTIONS}): "${NO_INVENTORY_QUOTE}" A small business taxpayer has "${SMALL_BUSINESS_QUOTE}" and is not a tax shelter. The two accepted methods without an inventory: non-incidental materials and supplies, deducted "${SUPPLIES_QUOTE}", or your books' own treatment. A change of method uses Form 3115. Valuation: "${VALUATION_QUOTE}" ${SITE_NAME} keeps an inventory at cost.

## Mistakes that move line 42

${mdList(mistakes.map(([a, b]) => `${a}: ${b}`))}

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Cost of goods sold", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

function pricing() {
  const path = "/pricing";
  const title = "Pricing";
  const { open, paidOn } = launch();
  const description = !open
    ? "Proposed Seller Books plans, priced by how many orders you ship and how many platforms you sell on, from $15 a month. Nothing is charged during early access."
    : "Seller Books is free on one platform and up to 25 orders a month. Paid plans from $15 a month are sized by orders and platforms.";
  const paidNote = !open
    ? ""
    : paidOn
      ? ""
      : `<p class="note">Paid plans are not on sale yet: the app does not take payment details, and nothing is charged. Until they are, everyone is on the Free plan.</p>`;
  const freeCard = open
    ? `<div class="card tier">
  <h2>Free</h2>
  <p class="muted">See your own profit before you pay anything</p>
  <p class="price"><span class="amount">$0</span></p>
  <p class="muted">No card · one platform</p>
  ${list(FREE_INCLUDES)}
  <p><a class="button" href="${esc(signupUrl("/pricing/free"))}">Start free</a></p>
</div>`
    : "";
  const cards = TIERS.map(
    (t) => `<div class="card tier${t.featured ? " featured" : ""}">
  <h2>${esc(t.name)}</h2>
  <p class="muted">${esc(t.for)}</p>
  <p class="price"><span class="amount">${usd(t.monthly)}</span> a month</p>
  <p class="muted">or ${usd(t.annual)} a year · ${esc(t.platforms)}${open && !paidOn ? " · not on sale yet" : ""}</p>
  ${list(t.includes)}
</div>`,
  ).join("\n");
  const top = TIERS[TIERS.length - 1];
  const heading = open ? "Pricing" : "Proposed pricing";
  const lead = !open
    ? "Priced by what you sell, not by feature checklists: how many orders you ship each month across all platforms, and how many platforms you sell on. These are proposed prices for launch; during early access nothing is charged and we don't ask for payment details."
    : "Priced by what you sell, not by feature checklists: how many orders you ship each month across all platforms, and how many platforms you sell on. Start on the Free plan; every report is on it.";
  const body = `<section class="wrap">
  <h1>${heading}</h1>
  <p class="lead">${esc(lead)}</p>
  ${paidNote}
  <div class="grid tiers">
${freeCard}
${cards}
  </div>
  <p>Shipping more than ${top.orders.toLocaleString("en-US")} orders a month? <a href="mailto:hello@marisstella.app">Email us</a> and we'll talk about it.</p>
  <h2>How the limits work</h2>
  <ul>
    <li>An order is one sale on one platform, whatever the number of items in it.</li>
    <li>${open ? "On a paid plan, going over its orders in a busy month never locks anything; if it keeps happening the billing page suggests the next plan, and you choose. The Free plan's 25 orders a month is a hard limit: an import that would pass it is refused, with the reason." : "If you go over your plan's orders in a busy month, nothing stops working. If it keeps happening we'll suggest the next plan; you choose."}</li>
    <li>Annual plans cost ten times the monthly price.</li>
    <li>${open ? "Prices may change before paid plans go on sale; anyone on the Free plan sees the price before being asked to pay." : "Early-access members will see the final price before they're asked to pay anything."}</li>
  </ul>
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "pricing" })}</div>`;
  const text = `# ${heading}

${lead}${open && !paidOn ? " Paid plans are not on sale yet; nothing is charged." : ""}
${open ? `\n## Free: $0\n\n${mdList(FREE_INCLUDES)}\n` : ""}
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
  const FAQ = faqItems();
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
  if (launch().open) {
    // Kept so old links and the confirmation emails' back links still land somewhere useful.
    const title = "Seller Books is open";
    return {
      path,
      title,
      description:
        "Early access is over: Seller Books is open, free on one platform. Create an account.",
      noindex: true,
      body: `<section class="wrap narrow">
  <h1>Early access is over: ${esc(SITE_NAME)} is open</h1>
  <p class="lead">You no longer need an invite. Create an account and import one platform's report; the Free plan covers one platform and up to 25 orders a month, with no card.</p>
  <p><a class="button" href="${esc(signupUrl(path))}">Start free</a> <a class="button ghost" href="${href("/pricing")}">See the plans</a></p>
  <p class="muted">If you joined the early-access list, you can still leave it from the unsubscribe link in any email we sent.</p>
</section>`,
    };
  }
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
  <p class="lead">${
    launch().open
      ? `This page covers the early-access list, the only thing this site collected. Your books in the app are covered by <a href="${esc(appPrivacyUrl())}">the app's own privacy notice</a>.`
      : "This page covers the early-access list, which is the only thing this site collects. The product will have its own privacy policy before anyone puts their books in it."
  }</p>
  <h2>What we store</h2>
  <ul>
    <li>Your email address.</li>
    <li>The platforms and monthly order range you chose, if you chose any.</li>
    <li>The page you signed up on, the version of the consent wording you saw, and when you signed up and confirmed.</li>
    <li>A salted hash of your IP address as a record of consent. We don't store the address itself.</li>
  </ul>
  <h2>What we use it for</h2>
  <p>To email you about early access to ${esc(SITE_NAME)}, and to count (not profile) which platforms and order volumes people want, so we can decide what to build and how to price it. We don't sell or share the list. No advertising scripts run on this site.</p>
  <h2>Visit counts</h2>
  <p>Like the rest of marisstella.app, these pages load Cloudflare Web Analytics, which counts page views, the page you came from and how fast pages load. It sets no cookies and keeps no identifier for you, so the counts are aggregate. Blocking scripts from <code>static.cloudflareinsights.com</code> stops it and the pages still work. The site's <a href="../privacy/">privacy policy</a> has the details.</p>
  <h2>Who can see it</h2>
  <p>Only the people who run ${esc(SITE_NAME)} can see the list: your email address, the page you signed up on, whether you confirmed, and the date. Each time they view it, that view is logged.</p>
  <h2>How long</h2>
  <p>Signups that aren't confirmed are deleted after 30 days, or once the last confirmation link has expired if that is later (a link works for 7 days). If you unsubscribe, we keep your address only so we never email it again, and delete the rest.</p>
  <h2>Leaving</h2>
  <p>Every email has an unsubscribe link. To have your address deleted entirely, email <a href="mailto:hello@marisstella.app">hello@marisstella.app</a>.</p>
</section>`;
  const text = `# Privacy (early-access list)\n\nStores: email, optional platforms and order range, signup page, consent wording version, timestamps, salted hash of IP. Used only for early-access emails and aggregate counts. Visits are counted by cookieless Cloudflare Web Analytics, as on all of marisstella.app. Only the people who run the site can see the list (email, signup page, confirmed or not, date); each view is logged. Unconfirmed signups deleted after 30 days, or when the last 7-day confirmation link expires if later. Unsubscribe link in every email; deletion on request at hello@marisstella.app.`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [webPage(path, title, description), breadcrumbs([{ name: "Privacy", path }])],
    text,
  };
}

// IRS business standard mileage rates, copied from apps/seller-books src/shared/reference/mileage-rates.ts
// (read from the IRS table on 2026-11-26). test/site.test.mjs checks the two agree, so the page and the
// worksheet never price a mile differently.
export const MILEAGE_RATES = [
  { from: "2023-01-01", to: "2023-12-31", cents: 65.5, source: "IR-2022-234" },
  { from: "2024-01-01", to: "2024-12-31", cents: 67, source: "IR-2023-239" },
  { from: "2025-01-01", to: "2025-12-31", cents: 70, source: "IR-2024-312" },
  { from: "2026-01-01", to: "2026-06-30", cents: 72.5, source: "IR-2025-128" },
  { from: "2026-07-01", to: "2026-12-31", cents: 76, source: "IR-2026-29" },
];
const MILEAGE_RATES_CHECKED_ON = "2026-11-26";
const IRS_PUB_463 = "https://www.irs.gov/publications/p463";

/** An invented 2026: business miles before and after the July 1 change. */
export const MILEAGE_EXAMPLE = { firstHalfMiles: 1200, secondHalfMiles: 1500 };

/** Line 9 for the example at each trip's rate, and at one rate for the whole year, in cents. */
export function mileageLines(ex = MILEAGE_EXAMPLE) {
  const [h1, h2] = MILEAGE_RATES.filter((r) => r.from.startsWith("2026"));
  const miles = ex.firstHalfMiles + ex.secondHalfMiles;
  const firstHalf = Math.round(ex.firstHalfMiles * h1.cents);
  const secondHalf = Math.round(ex.secondHalfMiles * h2.cents);
  return {
    miles,
    firstHalfRate: h1.cents,
    secondHalfRate: h2.cents,
    firstHalf,
    secondHalf,
    byTripDate: firstHalf + secondHalf,
    allAtJanuaryRate: Math.round(miles * h1.cents),
    allAtJulyRate: Math.round(miles * h2.cents),
  };
}

const dollars = (cents) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rateDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

function mileageDeduction() {
  const path = "/mileage-deduction";
  const title = "Mileage deduction for resellers";
  const description =
    "Sourcing trips and post office runs on Schedule C line 9: the IRS mileage rates, why 2026 has two (72.5¢, then 76¢ from July 1), and the log to keep.";
  const m = mileageLines();
  const rows = MILEAGE_RATES.slice()
    .reverse()
    .map(
      (r) =>
        `      <tr><th scope="row">${esc(rateDate(r.from))} to ${esc(rateDate(r.to))}</th><td>${r.cents}¢</td><td>${esc(r.source)}</td></tr>`,
    )
    .join("\n");
  const trips = [
    "Thrift stores, garage sales, estate sales, auctions and liquidation stores you drive to for stock",
    "The post office or a carrier drop-off with orders",
    "Buying shipping supplies",
    "Meeting a buyer for a local pickup, or setting up at a market or flea market",
  ];
  const mistakes = [
    [
      "Pricing all of 2026 at one rate",
      `The rate rose on July 1, 2026. In the example below one rate for the year is off by ${dollars(m.byTripDate - m.allAtJanuaryRate)} one way or ${dollars(m.allAtJulyRate - m.byTripDate)} the other; with more miles the gap grows.`,
    ],
    [
      "Rebuilding the log from memory in April",
      "The deduction rests on the record behind it: each trip's date, where you went, why, and the miles. A log kept as you go (or a tracker app's export) is easier to stand behind than a total estimated later.",
    ],
    [
      "Counting personal stops",
      "A trip that is partly personal is not all business miles. Log the business part, and leave personal drives out.",
    ],
    [
      "Deducting gas on top of the standard rate",
      "The standard rate stands in for the car's running costs, gas included. Choosing between it and your actual car expenses, and when you can switch, follows the IRS rules in Publication 463.",
    ],
    [
      "Putting mileage in cost of goods",
      "Mileage is an expense on its own line (line 9, car and truck expenses), not part of what an item cost you on Part III.",
    ],
  ];
  const faqs = [
    {
      q: "What is the 2026 IRS mileage rate for business?",
      a: `Two rates: ${m.firstHalfRate} cents a mile for business miles driven January 1 to June 30, 2026, and ${m.secondHalfRate} cents from July 1 to December 31, 2026, per the IRS standard mileage rates table (read ${MILEAGE_RATES_CHECKED_ON}). Each trip takes the rate in force on the day it was driven.`,
    },
    {
      q: "Can a reseller deduct mileage to thrift stores?",
      a: "Driving to buy stock for your reselling business can be business mileage, as can trips to ship orders or buy supplies. Whether a particular drive counts, for example the first trip of the day from home, depends on the IRS rules for local transportation in Publication 463; your tax preparer can say how they apply to you.",
    },
    {
      q: "Standard mileage rate or actual car expenses?",
      a: `Either, under the IRS rules for choosing between them (Publication 463). ${SITE_NAME} prices line 9 at the standard rate, or at a rate you type in; if you deduct actual expenses, the trip log is still your record of business use.`,
    },
    {
      q: "Can I import trips from a mileage tracker app?",
      a: `Yes. Export your drives as CSV and ${SITE_NAME} reads the business trips, asks for a purpose where one is missing, and leaves personal drives out with the reason. Reading the same file again adds nothing twice.`,
    },
  ];
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Resellers drive a lot: to thrift stores and estate sales for stock, to the post office with orders. Those business miles go on Schedule C line 9, car and truck expenses, and at the IRS standard rate they add up. In 2026 the rate changed halfway through the year, so every trip needs its date.</p>
  <h2>The IRS business mileage rates</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Miles driven</th><th scope="col">Business rate</th><th scope="col">IRS release</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table></div>
  <p class="muted">From the table on <a href="${IRS_MILEAGE}">the IRS standard mileage rates page</a>, read ${esc(MILEAGE_RATES_CHECKED_ON)}. The IRS usually announces the next year's rate late in the year; check the page before you file.</p>
  <h2>Two rates in one year</h2>
  <p>A mile is priced at the rate in force on the day you drove it. For 2026 that means splitting the year at July 1, the way the IRS did in 2022. A single annual rate under- or overstates line 9.</p>
  <div class="worked">
    <p class="muted">An invented example, to show the arithmetic:</p>
    <table>
      <tbody>
        <tr><th scope="row">${num(MILEAGE_EXAMPLE.firstHalfMiles)} business miles, January to June, at ${m.firstHalfRate}¢</th><td>${dollars(m.firstHalf)}</td></tr>
        <tr><th scope="row">${num(MILEAGE_EXAMPLE.secondHalfMiles)} business miles, July to December, at ${m.secondHalfRate}¢</th><td>${dollars(m.secondHalf)}</td></tr>
        <tr class="total"><th scope="row">Line 9 at each trip's rate</th><td>${dollars(m.byTripDate)}</td></tr>
        <tr><th scope="row">All ${num(m.miles)} miles at ${m.firstHalfRate}¢</th><td>${dollars(m.allAtJanuaryRate)}</td></tr>
        <tr><th scope="row">All ${num(m.miles)} miles at ${m.secondHalfRate}¢</th><td>${dollars(m.allAtJulyRate)}</td></tr>
      </tbody>
    </table>
  </div>
  <h2>Trips a reseller logs</h2>
  ${list(trips)}
  <p>For each one, the log needs the date, where you went, the business reason and the miles (a round trip counts both ways). Parking and tolls for a business trip are a separate cost from the mileage rate; see <a href="${IRS_PUB_463}">IRS Publication 463</a> for how car expenses are deducted and what records it expects.</p>
  <h2>Mistakes that move line 9</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Mistake</th><th scope="col">Why it matters</th></tr></thead>
    <tbody>
${mistakes.map(([a, b]) => `      <tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td></tr>`).join("\n")}
    </tbody>
  </table></div>
  <h2>Mileage in ${esc(SITE_NAME)}</h2>
  <p>Type trips in as you go, or import a mileage tracker app's CSV export: business drives come in, personal ones are left out with the reason, and a trip without a purpose waits for one. The <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a> prices each trip at the IRS rate for its date, so 2026's two rates are handled without a spreadsheet, and says which rate covered how many miles. If you'd rather use one rate, type it in and every trip uses it. At year end the mileage log downloads as a CSV, one row per trip with its date, purpose, miles, rate and amount, totalling exactly to line 9. A date the IRS table has no rate for yet is left out of line 9 and named, never guessed.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "mileage" })}</div>`;
  const text = `# ${title}

Business miles go on Schedule C line 9, car and truck expenses. Each mile is priced at the IRS standard rate in force on the day it was driven.

## IRS business mileage rates

${mdList(
  MILEAGE_RATES.slice()
    .reverse()
    .map((r) => `${r.from} to ${r.to}: ${r.cents} cents a mile (${r.source})`),
)}

Source: ${IRS_MILEAGE}, read ${MILEAGE_RATES_CHECKED_ON}.

## Two rates in 2026

An invented example: ${MILEAGE_EXAMPLE.firstHalfMiles} miles January to June at ${m.firstHalfRate} cents is ${dollars(m.firstHalf)}; ${MILEAGE_EXAMPLE.secondHalfMiles} miles July to December at ${m.secondHalfRate} cents is ${dollars(m.secondHalf)}; line 9 is ${dollars(m.byTripDate)}. All ${m.miles} miles at ${m.firstHalfRate} cents would be ${dollars(m.allAtJanuaryRate)}; at ${m.secondHalfRate} cents, ${dollars(m.allAtJulyRate)}.

## Trips a reseller logs

${mdList(trips)}

Each needs its date, destination, business reason and miles. Car expense rules and records: IRS Publication 463, ${IRS_PUB_463}.

## Mistakes that move line 9

${mdList(mistakes.map(([a, b]) => `${a}: ${b}`))}

## Mileage in ${SITE_NAME}

Trips typed in or imported from a mileage tracker's CSV (business drives only, a purpose required). The worksheet prices each trip at the IRS rate for its date, or at one rate you type in; the year-end mileage log CSV totals to line 9.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Mileage deduction", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// Quarterly estimated tax. The due dates and the invented example's figures are the app's own: copied from
// apps/seller-books src/shared/estimated-tax.ts (estimatedDueDates, estimate), and test/site.test.mjs runs
// that engine on ESTIMATE_EXAMPLE and checks it gives these numbers, so the page and the app's quarterly
// estimates page never disagree.
export const ESTIMATE_DUE_DATES_2026 = ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"];
const ESTIMATE_PERIODS = [
  "January 1 to March 31",
  "April 1 to May 31",
  "June 1 to August 31",
  "September 1 to December 31",
];
/** Schedule AI's cumulative periods (Form 2210), each ending where a payment period above ends. */
const ESTIMATE_AI_PERIODS = [
  "Jan 1 to Mar 31",
  "Jan 1 to May 31",
  "Jan 1 to Aug 31",
  "Jan 1 to Dec 31",
];
/** An invented 2026 reseller: single, no wages, most of the year's profit in the fourth quarter. Cents. */
export const ESTIMATE_EXAMPLE = {
  year: 2026,
  filing: "single",
  profitToDate: [300000, 600000, 1000000, 3000000],
  priorYearTax: 350000,
};
/** What the app's engine gives for ESTIMATE_EXAMPLE, in cents (checked by the test). */
export const ESTIMATE_RESULT = {
  seTax: 423887,
  incomeTax: 94245,
  total: 518132,
  current90: 466319,
  prior: 350000,
  required: 350000,
  regular: [87500, 87500, 87500, 87500],
  annualized: [38150, 53409, 51503, 206938],
};
const IRS_1040ES = "https://www.irs.gov/forms-pubs/about-form-1040-es";
const IRS_2210 = "https://www.irs.gov/forms-pubs/about-form-2210";
const IRS_SCHEDULE_SE = "https://www.irs.gov/forms-pubs/about-schedule-se-form-1040";
const IRS_PUB_505 = "https://www.irs.gov/publications/p505";
const SS_WAGE_BASE_2026 = 184500;
const dueDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// Line 30 (simplified method) and the equipment split, copied from apps/seller-books
// src/worker/services/books/schedule-c.ts. test/site.test.mjs reads that file and checks these agree, so the
// page never states a rate or limit the worksheet does not use.
export const HOME_OFFICE_RATE_CENTS = 500;
export const HOME_OFFICE_MAX_SQFT = 300;
export const DE_MINIMIS_LIMIT_CENTS = 250_000;
export const DE_MINIMIS_ELECTION_TITLE = "Section 1.263(a)-1(f) de minimis safe harbor election";
// Read through search-engine excerpts of the official pages on 2026-11-27 (irs.gov is not reachable from
// the build environment): the IRS simplified-option page and its FAQ (rate, 300 square feet, the average
// over 12 months, no carryover past the gross income limit), Publication 587 (the inventory storage
// exception), and the IRS "Tangible property final regulations" page and Notice 2015-82 (the $2,500 limit
// without an applicable financial statement, the annual election statement on the timely filed original return).
const HOME_OFFICE_CHECKED_ON = "2026-11-27";
const IRS_SIMPLIFIED_HOME_OFFICE =
  "https://www.irs.gov/businesses/small-businesses-self-employed/simplified-option-for-home-office-deduction";
const IRS_SIMPLIFIED_FAQ =
  "https://www.irs.gov/businesses/small-businesses-self-employed/faqs-simplified-method-for-home-office-deduction";
const IRS_PUB_587 = "https://www.irs.gov/publications/p587";
const IRS_TANGIBLE_PROPERTY =
  "https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations";
const IRS_FORM_4562 = "https://www.irs.gov/forms-pubs/about-form-4562";

/** An invented reseller: a spare room of stock from April, and the same year with a thin profit. */
export const HOME_OFFICE_EXAMPLE = { sqft: 150, months: 9, thinProfitCents: 40_000 };

/**
 * Line 30 the way the worksheet works it out (homeOfficeLine30 in the app): the business area, at most 300
 * square feet, times the months counted, over 12, at $5 a square foot; then never more than line 29.
 */
export function homeOfficeLines(ex = HOME_OFFICE_EXAMPLE) {
  const allowed = Math.min(ex.sqft, HOME_OFFICE_MAX_SQFT);
  const full = Math.round((allowed * ex.months * HOME_OFFICE_RATE_CENTS) / 12);
  const limited = Math.min(full, Math.max(0, ex.thinProfitCents));
  return {
    averageSqft: (allowed * ex.months) / 12,
    full,
    limited,
    lost: full - limited,
    yearCap: HOME_OFFICE_MAX_SQFT * HOME_OFFICE_RATE_CENTS,
  };
}

/** Invented equipment purchases and where the worksheet puts each. */
export const EQUIPMENT_EXAMPLE = [
  { what: "Camera for listing photos", cents: 89_900 },
  { what: "Thermal label printer", cents: 18_999 },
  { what: "Laptop", cents: 279_900 },
];

export function equipmentLine(cents) {
  return cents > DE_MINIMIS_LIMIT_CENTS ? "Form 4562, then line 13" : "Line 27a, its own row";
}

function homeOfficeAndEquipment() {
  const path = "/home-office-and-equipment";
  const title = "Home office and equipment deductions for resellers";
  const description =
    "Stock stored at home on Schedule C line 30 ($5 a square foot, up to 300), and a camera, label printer or shelving under the de minimis safe harbor.";
  const h = homeOfficeLines();
  const limit = usd(DE_MINIMIS_LIMIT_CENTS / 100);
  const storage = [
    "You sell products at wholesale or retail as your trade or business.",
    "You keep the inventory or product samples in your home for use in that business.",
    "Your home is the only fixed location of the business.",
    "You use the storage space on a regular basis.",
    "The space is a separately identifiable space suitable for storage.",
  ];
  const mistakes = [
    [
      "Counting the whole year for a room set up in spring",
      "The simplified method averages the space over all 12 months. A room used from April counts nine of the twelve, not all of them.",
    ],
    [
      "Claiming more than 300 square feet",
      `Only 300 square feet count in any month, so the simplified method tops out at ${dollars(h.yearCap)} for a full year however big the garage is.`,
    ],
    [
      "Expecting a loss year to carry the deduction forward",
      "Line 30 cannot be more than the business's profit before it (line 29). Under the simplified method the part that does not fit is lost, not carried to next year; the regular method on Form 8829 can carry it.",
    ],
    [
      "Deducting a laptop as supplies",
      `Equipment you keep and use is not a supply. At ${limit} or less an item it can be deducted at once under the de minimis safe harbor, with an election statement; over that it goes through Form 4562.`,
    ],
    [
      "Forgetting the election statement",
      `The de minimis safe harbor is elected each year with a statement titled "${DE_MINIMIS_ELECTION_TITLE}" attached to the timely filed original return. Without it, the safe harbor does not apply.`,
    ],
    [
      "Putting stock bought to resell on the equipment line",
      "Items you buy to sell are inventory and go through cost of goods sold, never the de minimis safe harbor.",
    ],
  ];
  const faqs = [
    {
      q: "Can a reseller take the home office deduction for storing inventory?",
      a: "Often, yes. Publication 587 lets a seller deduct a storage space without using it only for the business, when it is used regularly, is a separately identifiable space suitable for storage, and home is the business's only fixed location. Whether your space qualifies is for you or your tax preparer to decide.",
    },
    {
      q: "How much is the simplified home office deduction?",
      a: `$5 a square foot of the space used for the business, up to 300 square feet, so at most ${dollars(h.yearCap)} for a full year. A space used for part of the year is averaged over 12 months, and the deduction is never more than the business's profit before it.`,
    },
    {
      q: "Can I deduct a camera or label printer I bought for my reselling business?",
      a: `Equipment you keep and use in the business is deductible, but not always all at once. At ${limit} or less an item (or invoice), a seller without an applicable (for example, audited) financial statement can deduct it in the year bought under the de minimis safe harbor, by attaching the election statement to the return. More expensive equipment is depreciated or expensed by election on Form 4562.`,
    },
    {
      q: `Does ${SITE_NAME} do the regular method or Form 4562?`,
      a: `Form 4562, yes; the regular home office method, no. For each piece of equipment over ${limit}, ${SITE_NAME} works out line 13: bonus depreciation by default (100% for equipment bought after January 19, 2025), or section 179 or no bonus if you choose, over 5 or 7 years by the IRS MACRS tables, at the business-use share you enter, carried into the later years. Section 179 is held to the shop's profit. Line 30 is the simplified method only; your tax preparer handles Form 8829, and checks the Form 4562 figures, which are a worksheet, not a filing.`,
    },
  ];
  const equipmentRows = EQUIPMENT_EXAMPLE.map(
    (e) =>
      `        <tr><th scope="row">${esc(e.what)}, ${dollars(e.cents)}</th><td>${esc(equipmentLine(e.cents))}</td></tr>`,
  ).join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Most resellers run the business from home: a spare room of bins, a closet of stock, shelving in the garage, a camera and a label printer on the desk. Two parts of Schedule C are about exactly that. Line 30 is the business use of your home, and the equipment you buy to keep has its own rules for when it can be deducted.</p>
  <h2>Line 30: storing stock at home</h2>
  <p>Normally a home office has to be used only for the business. Storage of inventory is an exception in <a href="${IRS_PUB_587}">IRS Publication 587</a>: the space does not have to be used exclusively for the business when all of these hold.</p>
  ${list(storage)}
  <p>That is the usual reseller's case: the basement corner of bins can count even if the family walks through it.</p>
  <h2>The simplified method</h2>
  <p>The <a href="${IRS_SIMPLIFIED_HOME_OFFICE}">simplified option</a> skips the utility bills and depreciation of the regular method (Form 8829). It is $5 a square foot of the space you use, at most 300 square feet in any month. A space used for part of the year is averaged over all 12 months, and a month counts when the space was used for the business on 15 or more days. The result is never more than the profit on line 29, and under this method what does not fit is not carried forward (the <a href="${IRS_SIMPLIFIED_FAQ}">IRS FAQ on the simplified method</a>).</p>
  <div class="worked">
    <p class="muted">An invented example, to show the arithmetic:</p>
    <table>
      <tbody>
        <tr><th scope="row">A ${num(HOME_OFFICE_EXAMPLE.sqft)} square foot storage room, used from April (${HOME_OFFICE_EXAMPLE.months} months)</th><td>${num(h.averageSqft)} sq ft average</td></tr>
        <tr class="total"><th scope="row">Line 30 at $5 a square foot</th><td>${dollars(h.full)}</td></tr>
        <tr><th scope="row">The same year with ${dollars(HOME_OFFICE_EXAMPLE.thinProfitCents)} of profit on line 29</th><td>${dollars(h.limited)}</td></tr>
        <tr><th scope="row">Lost under the simplified method, not carried forward</th><td>${dollars(h.lost)}</td></tr>
      </tbody>
    </table>
  </div>
  <p class="muted">Rates and rules from the IRS pages linked here, read through search excerpts ${esc(HOME_OFFICE_CHECKED_ON)}. You choose the simplified or the regular method each year; check the current instructions before you file.</p>
  <h2>Equipment: a camera, a label printer, shelving</h2>
  <p>What you buy to keep and use is not a supply and not inventory. Under the de minimis safe harbor in the <a href="${IRS_TANGIBLE_PROPERTY}">tangible property regulations</a>, a business without an applicable financial statement (an audited one, for example; most small sellers have none) can deduct an item costing ${limit} or less per item or invoice in the year it is bought. It is elected every year with a statement titled "${esc(DE_MINIMIS_ELECTION_TITLE)}" attached to the timely filed original return, and the business should already treat such purchases as expenses in its own books. Anything over the limit is depreciated, or expensed by election, on <a href="${IRS_FORM_4562}">Form 4562</a>, which feeds line 13.</p>
  <div class="worked">
    <p class="muted">Invented purchases, and where the worksheet puts each:</p>
    <table>
      <tbody>
${equipmentRows}
      </tbody>
    </table>
  </div>
  <h2>Mistakes that move these lines</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Mistake</th><th scope="col">Why it matters</th></tr></thead>
    <tbody>
${mistakes.map(([a, b]) => `      <tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td></tr>`).join("\n")}
    </tbody>
  </table></div>
  <h2>Home office and equipment in ${esc(SITE_NAME)}</h2>
  <p>Save the space once for the year: its square feet, the whole home's, and the months you used it. The <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a> works out line 30 by the simplified method, holds it to line 29 and says so when it does, and the <a href="${href("/quarterly-estimated-tax")}">quarterly estimates</a> take it by the months to each period's end. Equipment has its own expense category: ${limit} or less an item lands on line 27a with a reminder of the election statement, anything over it is named for Form 4562 and left out of the totals with a warning, and a large office or supplies expense that may really be equipment is flagged. The regular method (Form 8829) and the depreciation itself are not built; your tax preparer does those.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "home-office" })}</div>`;
  const text = `# ${title}

## Line 30: storing stock at home

Publication 587 (${IRS_PUB_587}) lets a seller deduct a storage space at home without using it only for the business when:

${mdList(storage)}

## The simplified method

$5 a square foot, at most 300 square feet in any month (${dollars(h.yearCap)} for a full year). A space used for part of the year is averaged over 12 months; a month counts with 15 or more days of business use. Never more than line 29; the excess is not carried forward under this method. Sources: ${IRS_SIMPLIFIED_HOME_OFFICE} and ${IRS_SIMPLIFIED_FAQ}, read through search excerpts ${HOME_OFFICE_CHECKED_ON}.

An invented example: ${HOME_OFFICE_EXAMPLE.sqft} square feet from April (${HOME_OFFICE_EXAMPLE.months} months) averages ${h.averageSqft} square feet, so line 30 is ${dollars(h.full)}. With ${dollars(HOME_OFFICE_EXAMPLE.thinProfitCents)} of profit on line 29 it is ${dollars(h.limited)}, and ${dollars(h.lost)} is lost.

## Equipment

Under the de minimis safe harbor (${IRS_TANGIBLE_PROPERTY}), a business without an applicable financial statement can deduct equipment costing ${limit} or less per item or invoice in the year bought, elected each year with the statement "${DE_MINIMIS_ELECTION_TITLE}". Over that: Form 4562 (${IRS_FORM_4562}), line 13.

${mdList(EQUIPMENT_EXAMPLE.map((e) => `${e.what}, ${dollars(e.cents)} (invented): ${equipmentLine(e.cents)}`))}

## Mistakes that move these lines

${mdList(mistakes.map(([a, b]) => `${a}: ${b}`))}

## Home office and equipment in ${SITE_NAME}

Line 30 by the simplified method from the space saved for the year, held to line 29; quarterly estimates take it by months. Equipment at or under ${limit} on line 27a with the election reminder; over it, line 13 worked out for Form 4562 (bonus by default, section 179 or no bonus by choice, 5- or 7-year MACRS, business-use share), carried into later years. The regular home office method (Form 8829) is not built.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Home office and equipment", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

function estimatedTax() {
  const path = "/quarterly-estimated-tax";
  const title = "Quarterly estimated taxes for resellers";
  const description =
    "The 2026 Form 1040-ES due dates, what a reseller pays by each (the 90/100/110% safe harbours), self-employment tax, and the annualized method.";
  const ex = ESTIMATE_EXAMPLE;
  const r = ESTIMATE_RESULT;
  const cum = (xs, i) => xs.slice(0, i + 1).reduce((a, b) => a + b, 0);
  const dueRows = ESTIMATE_DUE_DATES_2026.map(
    (d, i) =>
      `      <tr><th scope="row">${esc(ESTIMATE_PERIODS[i])}</th><td>${esc(dueDate(d))}</td></tr>`,
  ).join("\n");
  const exRows = ESTIMATE_DUE_DATES_2026.map(
    (d, i) =>
      `        <tr><th scope="row">${esc(rateDate(d))}</th><td>${dollars(ex.profitToDate[i])}</td><td>${dollars(r.regular[i])}</td><td>${dollars(r.annualized[i])}</td><td>${dollars(cum(r.annualized, i))}</td></tr>`,
  ).join("\n");
  const mistakes = [
    [
      "Setting money aside from payouts, not profit",
      "Tax is figured on profit: sales less fees, cost of goods, mileage and other expenses. A percentage of every payout overstates it in a month you restocked and understates it in a month you sold old stock.",
    ],
    [
      "Forgetting self-employment tax",
      "Social security and Medicare on reselling profit come on top of income tax. For many small sellers they are the larger part of the bill (in the example below, about four fifths of it).",
    ],
    [
      "Treating the quarters as equal",
      "The second payment covers only April and May, and the last covers four months. A seller who pays a quarter of a guess on each date, without the annualized method, can be early on some and short on others.",
    ],
    [
      "Starting from the Form 1099-K",
      "The 1099-K reports gross payments before fees and refunds, so it is larger than profit. Your own books are the starting point.",
    ],
    [
      "Missing the January payment",
      "The fourth payment for a tax year is due the following January. It belongs to the year just ended, not the new one.",
    ],
    [
      "Forgetting your state",
      "Many states with an income tax have their own estimated payments and dates. These figures are federal only.",
    ],
  ];
  const faqs = [
    {
      q: "When are 2026 quarterly estimated taxes due?",
      a: `${ESTIMATE_DUE_DATES_2026.map(dueDate).join("; ")}. A due date that falls on a weekend or a Washington, DC legal holiday moves to the next business day; none of 2026's do. Check the dates on Form 1040-ES before you pay.`,
    },
    {
      q: "Do I have to pay estimated tax if I sell part time?",
      a: "The IRS generally expects estimated payments when you expect to owe $1,000 or more for the year after withholding and refundable credits. If you also have a job, raising your W-4 withholding can cover the reselling profit instead; withholding counts as paid evenly through the year.",
    },
    {
      q: "How much should a reseller pay each quarter?",
      a: "Enough that, by each date, you have paid a quarter of the smaller of 90% of this year's tax and 100% of last year's (110% if last year's AGI was over $150,000). Last year's figure is known in April, so it is the more certain target; the annualized method can ask less early in a year whose sales come late.",
    },
    {
      q: "What is the self-employment tax rate?",
      a: `15.3% of 92.35% of your profit: 12.4% for social security, up to the year's wage base ($${num(SS_WAGE_BASE_2026)} for 2026, less any W-2 wages), and 2.9% for Medicare on all of it. There is none when that 92.35% is under $400. Half of it is deducted when figuring income tax. See Schedule SE.`,
    },
    {
      q: "Is the underpayment penalty worth worrying about?",
      a: "It is interest-like, figured on Form 2210 for each date you were short and for how long, not a flat fine: the IRS underpayment rate (7% a year for most of 2026, 6% from April to June) on each shortfall, day by day, until it is paid or until April 15 of the next year. Three missed $2,000 payments in 2026 come to about $174 by late November, and about $35 more each month after. Paying the safe-harbour amounts by each date generally avoids it, and Seller Books shows the penalty so far once a date has passed short. Your tax preparer can say how it applies to you.",
    },
  ];
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">No one withholds tax from a marketplace payout. A reseller who makes a profit pays income tax and self-employment tax on it, and the IRS expects that tax during the year, on four dates, not all in April. The amount can come from your own books instead of a guess.</p>
  <h2>The 2026 due dates</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Profit earned</th><th scope="col">Payment due</th></tr></thead>
    <tbody>
${dueRows}
    </tbody>
  </table></div>
  <p class="muted">From the due dates on <a href="${IRS_1040ES}">Form 1040-ES</a>: April 15, June 15, September 15 and January 15, moved to the next business day when one falls on a weekend or a Washington, DC legal holiday. The periods are uneven: the second is two months, the last is four.</p>
  <h2>Who pays</h2>
  <p>Generally, anyone who expects to owe $1,000 or more for the year after withholding and refundable credits. That includes most people who buy to resell and make a profit, part time or full time. If you also have a job, more withholding on your W-4 can stand in for the payments. Full rules and exceptions: <a href="${IRS_PUB_505}">IRS Publication 505</a>.</p>
  <h2>How much: the safe harbours</h2>
  <p>To avoid the underpayment penalty, by each date you generally need to have paid a quarter of the smaller of:</p>
  <ul>
    <li>90% of this year's tax, or</li>
    <li>100% of last year's total tax (110% if last year's adjusted gross income was over $150,000).</li>
  </ul>
  <p>Last year's tax is on last year's return, so it is a number you know in April. This year's depends on sales you have not made yet. The rules are in section 6654 of the tax code and on <a href="${IRS_2210}">Form 2210</a>.</p>
  <h2>Self-employment tax is most of it for many sellers</h2>
  <p>On top of income tax, reselling profit carries social security and Medicare: 15.3% of 92.35% of the profit (12.4% up to the year's social security wage base, $${num(SS_WAGE_BASE_2026)} in 2026, and 2.9% on all of it), and none when that 92.35% is under $400. Half of it is deducted before income tax is figured. See <a href="${IRS_SCHEDULE_SE}">Schedule SE</a>. Because the standard deduction can cover much of a small seller's income tax but not this, self-employment tax is often the larger part.</p>
  <h2>Sellers whose profit comes late: the annualized method</h2>
  <p>Many resellers sell most in November and December. Paying equal amounts from April means paying for profit not yet made. Form 2210's Schedule AI lets each payment follow the profit earned so far, annualized, so the early payments are smaller and the January one larger. You file Schedule AI with your return to use it, and use it for all four dates.</p>
  <div class="worked">
    <p class="muted">An invented example, to show the arithmetic: a single filer, no other job, ${dollars(ex.profitToDate[3])} of 2026 profit, ${dollars(ex.profitToDate[3] - ex.profitToDate[2])} of it from September to December, and ${dollars(ex.priorYearTax)} of total tax last year. This year's tax is ${dollars(r.total)} (${dollars(r.seTax)} self-employment tax, ${dollars(r.incomeTax)} income tax), so 90% is ${dollars(r.current90)}; last year's ${dollars(r.prior)} is smaller and sets the required payment.</p>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Due</th><th scope="col">Profit, Jan 1 to period end</th><th scope="col">Equal</th><th scope="col">Annualized</th><th scope="col">Annualized, paid so far</th></tr></thead>
      <tbody>
${exRows}
      </tbody>
    </table></div>
    <p class="muted">Both reach ${dollars(r.required)} by January. By September 15 the annualized method has asked for ${dollars(cum(r.annualized, 2))} instead of ${dollars(cum(r.regular, 2))}. Figured with the standard deduction and the qualified business income deduction; credits, itemized deductions and state tax are left out.</p>
  </div>
  <h2>Mistakes that make the payments wrong</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Mistake</th><th scope="col">Why it matters</th></tr></thead>
    <tbody>
${mistakes.map(([a, b]) => `      <tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td></tr>`).join("\n")}
    </tbody>
  </table></div>
  <h2>Quarterly estimates in ${esc(SITE_NAME)}</h2>
  <p>The quarterly estimates page reads the Schedule C profit in your books to each period's end: sales from your imported marketplace reports less their fees, <a href="${href("/cost-of-goods-sold")}">cost of goods</a>, <a href="${href("/mileage-deduction")}">mileage</a>, expenses and the home office you saved. Type in last year's total tax, any W-2 wages and withholding, and the payments you have made, and it shows what to have paid by each date both ways, equal and annualized, and what is still to pay by the next one. A year still in progress is projected from the days so far, and the page says so. It is federal only and leaves out credits and itemized deductions, and it names each thing it leaves out. The same profit feeds the <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a>.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "estimates" })}</div>`;
  const text = `# ${title}

No tax is withheld from marketplace payouts. A profitable reseller generally pays income tax and self-employment tax during the year on four dates (Form 1040-ES), when the year's tax after withholding and refundable credits is expected to be $1,000 or more.

## 2026 due dates

${mdList(ESTIMATE_DUE_DATES_2026.map((d, i) => `${ESTIMATE_PERIODS[i]}: due ${d}`))}

Source: ${IRS_1040ES}. A date on a weekend or a Washington, DC legal holiday moves to the next business day.

## How much

By each date, a quarter of the smaller of 90% of this year's tax and 100% of last year's total tax (110% if last year's AGI was over $150,000): IRC 6654(d)(1), Form 2210 (${IRS_2210}). Publication 505: ${IRS_PUB_505}.

## Self-employment tax

15.3% of 92.35% of profit (12.4% social security up to the wage base, $${num(SS_WAGE_BASE_2026)} for 2026; 2.9% Medicare on all); none under $400 of net earnings; half deducted for income tax. Schedule SE: ${IRS_SCHEDULE_SE}.

## The annualized method (Form 2210 Schedule AI)

Each payment follows the profit earned to the period's end, annualized, so a seller whose sales come late pays less early. An invented example: single, no wages, ${dollars(ex.profitToDate[3])} of 2026 profit (${ESTIMATE_AI_PERIODS.map((p, i) => `${p}: ${dollars(ex.profitToDate[i])}`).join("; ")}), last year's tax ${dollars(ex.priorYearTax)}. This year's tax ${dollars(r.total)} (self-employment ${dollars(r.seTax)}, income ${dollars(r.incomeTax)}); required payment ${dollars(r.required)} (last year's tax, below 90% of this year's ${dollars(r.current90)}). Equal payments: ${r.regular.map(dollars).join(", ")}. Annualized: ${r.annualized.map(dollars).join(", ")}.

## Mistakes

${mdList(mistakes.map(([a, b]) => `${a}: ${b}`))}

## Quarterly estimates in ${SITE_NAME}

Profit to each period's end from the seller's own books (imported sales less fees, cost of goods, mileage, expenses, home office); last year's tax, wages, withholding and payments typed in; what to have paid by each date, equal and annualized, and what is still due by the next. Federal only; credits and itemized deductions left out and named.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Quarterly estimated tax", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

/**
 * Every expense category the app offers, in its order, with the Schedule C line it lands on (the app's
 * `EXPENSE_LINE` in schedule-c.ts, line number only; test/site.test.mjs holds the two equal) and what a
 * reseller usually files there. The examples are ordinary reseller costs, not a list of what is allowed.
 */
export const DEDUCTION_LINES = [
  {
    category: "advertising",
    line: "8",
    name: "Advertising",
    examples:
      "Promoted or boosted listings, Etsy Ads and offsite ads, paid social posts. Advertising fees read from a marketplace report land here too.",
  },
  {
    category: "commissions_fees",
    line: "10",
    name: "Commissions and fees",
    examples:
      "Marketplace selling fees, commissions, final value and per-order fees, payment processing. The fees in your imported reports land here on their own.",
  },
  {
    category: "insurance",
    line: "15",
    name: "Insurance (other than health)",
    examples: "Business insurance, or coverage for stock in storage.",
  },
  {
    category: "legal_professional",
    line: "17",
    name: "Legal and professional services",
    examples: "A tax preparer's fee for the business part of the return, a bookkeeper.",
  },
  {
    category: "office",
    line: "18",
    name: "Office expense",
    examples: "Printer ink, paper, small office items used up in the year.",
  },
  {
    category: "rent",
    line: "20b",
    name: "Rent or lease: other business property",
    examples: "A storage unit for stock, a booth or table fee at a flea market.",
  },
  {
    category: "repairs",
    line: "21",
    name: "Repairs and maintenance",
    examples: "Fixing a label printer or a clothes steamer you use for the business.",
  },
  {
    category: "supplies",
    line: "22",
    name: "Supplies",
    examples: "Poly mailers, boxes, tape, bubble wrap, hangers, cleaning supplies for stock.",
  },
  {
    category: "taxes_licenses",
    line: "23",
    name: "Taxes and licenses",
    examples:
      "A business licence or a seller's permit fee. Not income tax, and not the sales tax a marketplace collected for you.",
  },
  {
    category: "travel",
    line: "24a",
    name: "Travel",
    examples: "An overnight sourcing trip: the hotel and fares, not the miles (those are line 9).",
  },
  {
    category: "meals",
    line: "24b",
    name: "Deductible meals",
    examples:
      "Business meals, generally 50% deductible. The worksheet takes half of what you enter.",
  },
  {
    category: "utilities",
    line: "25",
    name: "Utilities",
    examples: "A separate business phone line or internet service, where it is a business cost.",
  },
  {
    category: "shipping_postage",
    line: "27a",
    name: "Other expenses: postage and labels",
    examples:
      "Shipping labels you paid for and postage. Labels bought through a marketplace and shown in its report land here on their own.",
  },
  {
    category: "software_subscriptions",
    line: "27a",
    name: "Other expenses: software and subscriptions",
    examples:
      "Crosslisting and inventory tools, a store or seller subscription on a platform, bookkeeping software.",
  },
  {
    category: "equipment",
    line: "27a",
    name: "Other expenses: equipment under the de minimis limit",
    examples:
      "A camera, label printer, scale or shelving at $2,500 or less an item, with the election statement. Over that: Form 4562 and line 13.",
  },
  {
    category: "other",
    line: "27a",
    name: "Other expenses: other",
    examples: "A business cost that fits none of the lines above.",
  },
];

function taxDeductions() {
  const path = "/reseller-tax-deductions";
  const title = "Reseller tax deductions by Schedule C line";
  const description =
    "Where resellers deduct each cost on Schedule C: fees on line 10, promoted listings on 8, mileage on 9, mailers on 22, labels on 27a, stock via cost of goods.";
  const outside = [
    [
      "Stock you buy to resell",
      `Not an expense line. Inventory goes through cost of goods sold (Part III, line 42, then line 4): its cost counts when the item sells, and what is left on December 31 waits for next year. See <a href="${href("/cost-of-goods-sold")}">cost of goods sold for resellers</a>.`,
      "Inventory goes through cost of goods sold (Part III, line 42, then line 4): its cost counts when the item sells.",
    ],
    [
      "Miles driven to source and ship",
      `Line 9, at the IRS standard mileage rate for the day each trip was driven, from a log of date, purpose and miles. See <a href="${href("/mileage-deduction")}">the mileage deduction for resellers</a>.`,
      "Line 9, at the IRS standard mileage rate, from a log of date, purpose and miles.",
    ],
    [
      "Stock stored at home",
      `Line 30, the business use of your home (the simplified method is $5 a square foot, up to 300). See <a href="${href("/home-office-and-equipment")}">home office and equipment deductions</a>.`,
      "Line 30, the business use of your home (simplified method: $5 a square foot, up to 300).",
    ],
    [
      "Equipment over $2,500 an item",
      "Depreciated, or expensed by election, on Form 4562; the result is line 13.",
      "Form 4562, then line 13.",
    ],
  ];
  const mistakes = [
    [
      "Reporting net payouts and deducting the fees too",
      "If the income you report is what landed in the bank, the fees are already out of it; deducting them again counts them twice. If you report gross sales (what the 1099-K shows), the fees are a deduction on line 10 and leaving them out overpays. Pick one; line 1 asks for gross receipts, so gross sales with the fees deducted is the usual way.",
    ],
    [
      "Deducting stock as supplies",
      "A haul from the bins is inventory, not supplies. It reaches the return through cost of goods sold as items sell, not all in the month you bought it.",
    ],
    [
      "Deducting fuel and the standard mileage rate",
      "The standard mileage rate stands in for fuel, repairs and the other running costs of the car. A seller who takes it does not also deduct the gas receipts.",
    ],
    [
      "Counting marketplace-collected sales tax as income",
      "Most states with a sales tax make the marketplace collect and pay it on your sales there. It is not your income and not your deduction; it should be out of gross receipts on both sides.",
    ],
    [
      "Putting promoted listing fees in with selling fees",
      "Both are deductible, but on different lines: promoted and boosted listings are advertising (line 8), commissions and processing are line 10. The total is the same; the return reads truer.",
    ],
    [
      "Deducting a laptop as office expense",
      "Equipment you keep is not a supply. At $2,500 or less an item it can go on line 27a under the de minimis safe harbor, with its election statement; over that it is Form 4562.",
    ],
  ];
  const faqs = [
    {
      q: "What can resellers write off on their taxes?",
      a: "The ordinary and necessary costs of the business: marketplace fees, promoted listings, shipping labels and mailers, sourcing miles, a storage unit, the space at home where stock is kept, software, equipment, and the cost of the items that sold. Each has a Schedule C line; the cost of stock is not an expense but goes through cost of goods sold as items sell. Whether a particular cost qualifies is for you or your tax preparer to decide.",
    },
    {
      q: "Are eBay, Poshmark and Mercari fees tax deductible?",
      a: "Selling fees, commissions and payment processing are a cost of selling and go on Schedule C line 10 (commissions and fees) when you report gross sales; promoted listing fees are advertising on line 8. If you report only the net payout, the fees are already out of it and are not deducted again.",
    },
    {
      q: "Can I deduct the clothes or items I buy to resell?",
      a: "Not as an expense when you buy them. Items bought to resell are inventory: their cost is deducted through cost of goods sold in the year each one sells, and what is still unsold at year end is closing inventory, carried to next year.",
    },
    {
      q: "Can I deduct shipping supplies and labels?",
      a: "Mailers, boxes and tape are supplies (line 22). Postage and shipping labels you pay for are usually listed under other expenses (line 27a). A label the buyer paid for still counts: the shipping they paid is in your gross receipts, and the label you bought is the expense.",
    },
    {
      q: `How does ${SITE_NAME} decide the line?`,
      a: `Each expense you type in, or read from a bank or card statement, has a category, and each category has one Schedule C line (equipment over $2,500 goes to Form 4562 instead). Fees from your imported marketplace reports go to line 10, or line 8 for advertising, without being typed in. Purchases that look like inventory, marketplace fees or fuel are left unticked on a statement, with the reason, so nothing is deducted twice. You can change any category.`,
    },
  ];
  const lineRows = DEDUCTION_LINES.map(
    (d) =>
      `      <tr><th scope="row">${esc(d.line)}</th><td>${esc(d.name)}</td><td>${esc(d.examples)}</td></tr>`,
  ).join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">A reseller's deductions are mostly small and many: a fee on every sale, a label on every parcel, a box of mailers a month, the drive to the bins. Each one belongs on a particular line of <a href="${IRS_SCHEDULE_C}">Schedule C</a>, and the biggest cost of all, the stock itself, is not an expense line in the first place.</p>
  <h2>Expense lines, and what resellers file on each</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Line</th><th scope="col">Schedule C line</th><th scope="col">Usual reseller costs</th></tr></thead>
    <tbody>
${lineRows}
    </tbody>
  </table></div>
  <p class="muted">Line names from Schedule C (Form 1040); where a cost goes is the usual placement in the <a href="${IRS_SC_INSTRUCTIONS}">Schedule C instructions</a> and <a href="${IRS_PUB_334}">Publication 334</a>, not a ruling on your return. Lines 11 to 14, 16, 19, 20a and 26 (contract labour, depletion, interest, pensions, a vehicle lease, wages and so on) are rare for a one-person resale business and not shown.</p>
  <h2>What is not on an expense line</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Cost</th><th scope="col">Where it goes</th></tr></thead>
    <tbody>
${outside.map(([a, b]) => `      <tr><th scope="row">${esc(a)}</th><td>${b}</td></tr>`).join("\n")}
    </tbody>
  </table></div>
  <h2>Mistakes that cost resellers money, or count it twice</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Mistake</th><th scope="col">Why it matters</th></tr></thead>
    <tbody>
${mistakes.map(([a, b]) => `      <tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td></tr>`).join("\n")}
    </tbody>
  </table></div>
  <p>Which sales tax is yours to file at all, and which the marketplace already sent, is on <a href="${href("/reseller-sales-tax")}">sales tax for resellers</a>.</p>
  <h2>Deductions in ${esc(SITE_NAME)}</h2>
  <p>The fees come from the reports you import, not from a typed-in total: each marketplace's own fee columns are read and filed on line 10, with promoted listings on line 8 and the labels bought through the platform on line 27a. Everything else is an expense with a category, typed in or read from a bank or card statement CSV, and each category above lands on its line on the <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a>, with meals halved and equipment split at the de minimis limit. On a statement, purchases that look like inventory, marketplace fees or fuel are left unticked with the reason, so a cost already counted elsewhere is not deducted twice. A year-end expense list gives every expense with the line it landed on, for you or your preparer.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "deductions" })}</div>`;
  const text = `# ${title}

## Expense lines

${mdList(DEDUCTION_LINES.map((d) => `Line ${d.line}, ${d.name}: ${d.examples}`))}

Line names from Schedule C; placement as usual in the Schedule C instructions (${IRS_SC_INSTRUCTIONS}) and Publication 334 (${IRS_PUB_334}).

## Not on an expense line

${mdList(outside.map(([a, , c]) => `${a}: ${c}`))}

## Mistakes

${mdList(mistakes.map(([a, b]) => `${a}: ${b}`))}

## Deductions in ${SITE_NAME}

Fees read from imported marketplace reports go to line 10 (advertising to line 8, platform labels to 27a). Other expenses have a category, typed in or read from a bank or card statement; each category lands on its line; meals halved; equipment split at the de minimis limit. Statement lines that look like inventory, fees or fuel are left unticked with the reason. A year-end expense list names each expense's line.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Reseller tax deductions", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// ---------------------------------------------------------------------------------------------
// /reseller-sales-tax: who collects the sales tax on a reseller's sales, from the Streamlined Sales
// Tax Governing Board's (SSTGB) state charts and one state page. Each row below is a summary of that
// state's own answer on the SSTGB marketplace seller chart, not our reading of its law.
export const SALES_TAX_CHECKED_ON = "2026-11-28";
const SST_MARKETPLACE_SELLERS =
  "https://www.streamlinedsalestax.org/for-businesses/marketplace-sellers";
const SST_REMOTE_SELLERS =
  "https://www.streamlinedsalestax.org/for-businesses/remote-seller-faqs/remote-seller-state-guidance";
const SST_EXEMPTIONS = "https://www.streamlinedsalestax.org/for-businesses/exemptions";
const SST_STATE_CONTACTS = "https://www.streamlinedsalestax.org/contacts/state-contact-information";
const TX_MARKETPLACE = "https://comptroller.texas.gov/taxes/sales/marketplace-providers.php";
const TX_MARKETPLACE_QUOTE =
  "Marketplace providers must collect and remit state and local sales and use tax on all third-party sales.";
const SST_PHYSICAL_QUOTE =
  "If you have a physical presence in a state, you are not a Remote Seller and are generally required to register in that state regardless of the amount of sales.";
const SST_DIRECT_QUOTE =
  "A remote seller that sells through a Marketplace Facilitator and also sells products direct to its customers, is required to register to collect and remit sales tax in the state if its sales in that state meet that state's Remote Seller Threshold.";

/**
 * The SSTGB marketplace seller chart, one row per state that answers it (Illinois' row is blank).
 * `register`: does a seller who sells only through a marketplace that collects the tax have to
 * register and file? `threshold`: do marketplace sales count toward the state's remote seller threshold?
 */
export const MARKETPLACE_SELLER_STATES = [
  { state: "Alaska", register: "No", threshold: "Yes" },
  {
    state: "Arkansas",
    register:
      "No; a seller with a physical presence may want to, to buy stock for resale without paying tax",
    threshold: "No",
  },
  { state: "Georgia", register: "No", threshold: "No" },
  {
    state: "Indiana",
    register: "No, unless the seller has a physical presence in Indiana",
    threshold: "No",
  },
  { state: "Iowa", register: "No", threshold: "Yes" },
  { state: "Kansas", register: "No", threshold: "Yes" },
  {
    state: "Kentucky",
    register: "No, if the marketplace is registered and filing in Kentucky",
    threshold: "Yes",
  },
  { state: "Michigan", register: "No", threshold: "Yes" },
  {
    state: "Minnesota",
    register: "No without a physical presence in Minnesota; yes with one",
    threshold: "Yes",
  },
  {
    state: "Nebraska",
    register:
      "Yes, a remote seller over the filing threshold files, with a credit for the tax the marketplace sent",
    threshold: "Yes",
  },
  { state: "Nevada", register: "No", threshold: "Yes" },
  {
    state: "New Jersey",
    register:
      "Yes if over the economic threshold or with a physical presence, and may ask to be non-reporting (Form C-6205-ST)",
    threshold: "Yes",
  },
  { state: "North Carolina", register: "No", threshold: "Yes" },
  {
    state: "North Dakota",
    register: "No without a physical presence; yes with one",
    threshold: "No",
  },
  {
    state: "Ohio",
    register: "No, as long as the marketplace reports and collects on all of the seller's sales",
    threshold: "Yes",
  },
  {
    state: "Oklahoma",
    register: "No, even with a physical presence",
    threshold: "No, while the marketplace collects",
  },
  { state: "Pennsylvania", register: "No", threshold: "Yes" },
  { state: "Rhode Island", register: "Yes with a physical presence", threshold: "Yes" },
  { state: "South Dakota", register: "Yes", threshold: "Yes" },
  {
    state: "Tennessee",
    register: "No without a physical presence; yes with a location or physical presence",
    threshold: "No",
  },
  {
    state: "Texas",
    register:
      "No without a physical presence (with the marketplace's certification that it collects); yes with one, though stock held only in a marketplace's fulfillment center does not count",
    threshold: "No",
  },
  { state: "Utah", register: "No without a physical presence; yes with one", threshold: "No" },
  {
    state: "Vermont",
    register: "No, though Vermont use tax may be owed for physical-presence activities",
    threshold: "Yes",
  },
  { state: "Washington", register: "Yes, if the seller has nexus for B&O tax", threshold: "Yes" },
  {
    state: "West Virginia",
    register: "No without a physical presence; yes with one",
    threshold: "Yes",
  },
  { state: "Wisconsin", register: "No", threshold: "Yes" },
  { state: "Wyoming", register: "No", threshold: "No" },
];

/** Where each kind of reseller sale stands; `channels` are the app's seller-collected channels (src/shared/sales-tax.ts). */
export const SELLER_COLLECTED_SALES = [
  {
    channel: "square",
    name: "Square",
    what: "a card reader or the Square app at a market booth or flea market",
  },
  {
    channel: "paypal",
    name: "PayPal",
    what: "a buyer who paid you by PayPal off the marketplaces",
  },
  { channel: "venmo", name: "Venmo", what: "a local or Facebook Marketplace sale paid by Venmo" },
  {
    channel: "cashapp",
    name: "Cash App",
    what: "a local or Facebook Marketplace sale paid by Cash App",
  },
  {
    channel: "shopify",
    name: "Your own Shopify store",
    what: "orders on your own store (Shop channel orders aside, which Shopify collects on as a marketplace)",
  },
  {
    channel: "other",
    name: "Another marketplace matched by hand",
    what: "counted as yours until you take it out, since the file does not say who collected",
  },
  {
    channel: "direct",
    name: "Sales you type in",
    what: "cash, Cash App or Zelle at a pickup or a market, with the tax you charged",
  },
];

function salesTax() {
  const path = "/reseller-sales-tax";
  const title = "Sales tax for resellers: who collects it";
  const description =
    "Marketplaces collect the sales tax on your eBay, Poshmark or Etsy sales; booth, Venmo and own-store sales are yours. A state chart, with sources.";
  const faqs = [
    {
      q: "Do I have to collect sales tax on eBay, Poshmark or Mercari sales?",
      a: "In the states with marketplace facilitator laws, the marketplace collects and sends the sales tax on the sales made through it. Texas, for one, says marketplace providers must collect and remit state and local sales and use tax on all third-party sales. Whether you still have to register and file in a state is a separate question, and the states answer it differently: see the chart on this page.",
    },
    {
      q: "Do I need a seller's permit if I only sell on marketplaces?",
      a: "It depends on the state, and usually on whether you have a physical presence there; living and storing stock in a state is the common reseller case. On the Streamlined Sales Tax Governing Board's chart, Georgia, Pennsylvania and Wisconsin say no, while Indiana, Minnesota, Texas, Utah and others say yes once the seller has a physical presence, and South Dakota and Nebraska say yes in more cases. Your own state's revenue department has the answer that counts.",
    },
    {
      q: "Do I charge sales tax at a flea market or on a Venmo sale?",
      a: "No marketplace is in the middle of those sales, so no marketplace collects. A seller with a physical presence in a state is generally required to register there whatever the amount of sales, in the SSTGB's words. Which items are taxable, and whether a one-off or occasional sale is exempt, is set by the state.",
    },
    {
      q: "Is the sales tax a marketplace collected part of my income?",
      a: `The marketplace collected it from the buyer and sent it to the state; it never was yours to keep. ${SITE_NAME} keeps it out of your sales, your profit and your Schedule C worksheet.`,
    },
    {
      q: "Can I buy inventory tax-free with a resale certificate?",
      a: "Generally a business that buys goods to resell gives its supplier an exemption (resale) certificate and keeps a copy, and the supplier does not charge sales tax. The Streamlined Sales Tax Exemption Certificate is accepted by all 24 Streamlined member states, with the state's ID number for the purchase where you are registered. Not every seller has to accept one, and not every state allows every exemption on it: check the state.",
    },
  ];
  const stateRows = MARKETPLACE_SELLER_STATES.map(
    (s) =>
      `      <tr><th scope="row">${esc(s.state)}</th><td>${esc(s.register)}</td><td>${esc(s.threshold)}</td></tr>`,
  ).join("\n");
  const sellerRows = SELLER_COLLECTED_SALES.map(
    (s) => `      <tr><th scope="row">${esc(s.name)}</th><td>${esc(s.what)}</td></tr>`,
  ).join("\n");
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Most of a reseller's sales tax is not theirs to handle: the marketplace collects it on every eBay, Poshmark, Mercari, Etsy or Depop sale and sends it to the state. The sales you ring up yourself are different. A Square reader at a flea market, a Venmo payment at a pickup or your own Shopify store has no marketplace in the middle, so the tax on those, and the permit, are yours.</p>
  <h2>Sales on a marketplace: the marketplace collects</h2>
  <p>Most states with a sales tax have a marketplace facilitator law (some call it a marketplace provider law), which makes the marketplace collect and send the tax on the sales it facilitates for third-party sellers. Texas puts it plainly: &ldquo;${esc(TX_MARKETPLACE_QUOTE)}&rdquo; (<a href="${TX_MARKETPLACE}">Texas Comptroller</a>). The tax a buyer paid on your eBay order was charged and sent by eBay, not by you.</p>
  <p>That leaves two questions a marketplace does not answer for you: whether you still have to register and file in your state when every sale is on a marketplace, and whether your marketplace sales count toward another state's threshold for remote sellers once you also sell direct. The <a href="${SST_MARKETPLACE_SELLERS}">Streamlined Sales Tax Governing Board</a> (SSTGB) keeps a chart of each member state's answers, and they differ:</p>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">State</th><th scope="col">Sell only on a marketplace that collects: register and file?</th><th scope="col">Marketplace sales count toward the remote seller threshold?</th></tr></thead>
    <tbody>
${stateRows}
    </tbody>
  </table></div>
  <p class="muted">Summarised from the SSTGB marketplace seller chart, read ${esc(SALES_TAX_CHECKED_ON)}; its rows were last updated by the states between June 2020 and November 2021, and Illinois' row is blank. The chart covers the Streamlined member states and a few others, so California, Florida, New York and other large states are not on it. It is general guidance, and the SSTGB says nothing in it overrides a state's own law: <a href="${SST_STATE_CONTACTS}">ask the state</a> before you rely on a row.</p>
  <p>&ldquo;Physical presence&rdquo; matters in most rows, and a reseller who lives and keeps stock in a state usually has it there. In the SSTGB's words: &ldquo;${esc(SST_PHYSICAL_QUOTE)}&rdquo; Texas is the state on the chart that says stock kept only in a marketplace's fulfillment center does not, on its own, require a remote seller to register.</p>
  <h2>Sales you ring up yourself: you collect</h2>
  <p>When a buyer pays you directly, no marketplace collects the tax. These are the reseller sales where the tax, if the state taxes the item, is yours to charge and send:</p>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Sale</th><th scope="col">Typical case</th></tr></thead>
    <tbody>
${sellerRows}
    </tbody>
  </table></div>
  <p>Selling direct into other states adds the remote seller thresholds: each state sets a level of sales (and in some, a number of transactions) above which a seller with no physical presence there must register. &ldquo;${esc(SST_DIRECT_QUOTE)}&rdquo; The SSTGB's <a href="${SST_REMOTE_SELLERS}">remote seller chart</a> lists each state's threshold; California's, for example, is total combined sales over $500,000 in the preceding or current calendar year, and Arkansas' is sales over $100,000 or 200 transactions. Whether marketplace sales count toward a threshold is the third column above.</p>
  <h2>Buying stock: resale certificates</h2>
  <p>A business that buys goods to resell can usually give its supplier an exemption certificate for resale, keep a copy, and not be charged sales tax; the tax is then collected when the item is sold to the end buyer. The <a href="${SST_EXEMPTIONS}">Streamlined Sales Tax Exemption Certificate</a> is accepted by all 24 Streamlined member states. You give the ID number of the state you are claiming the exemption in where you are registered there, a number issued by another state where you are not, and the SSTGB notes that not all states allow every exemption on the form. Do not send the certificate to the state; the supplier keeps it. This is also why the SSTGB chart's Arkansas row says a seller who only sells on marketplaces may want to register anyway.</p>
  <h2>Sales tax in ${esc(SITE_NAME)}</h2>
  <p>${esc(SITE_NAME)} reads who collected each sale's tax from where the sale came from. Tax on the marketplaces' sales (eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Amazon, TikTok Shop, and Grailed, StockX, Vinted and Reverb) is kept out of your sales, your profit and your <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a>. Tax on the sales in the second table is listed on its own as &ldquo;Sales tax you collected&rdquo;, by month and channel with quarter totals and the tax handed back on refunds, and downloads as a CSV to fill your state return from. When a <a href="${href("/1099-k")}">Form 1099-K</a> looks higher than your books, the 1099-K check adds the tax the platform collected so you can see whether that is the difference. Which items your state taxes, and whether you need a permit, it does not decide.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "salestax" })}</div>`;
  const text = `# ${title}

Marketplaces collect and send the sales tax on the sales made through them in states with marketplace facilitator laws. Texas: "${TX_MARKETPLACE_QUOTE}" (${TX_MARKETPLACE}). Sales you ring up yourself (a market booth, PayPal, Venmo, your own store) have no marketplace in the middle, so the tax and the permit are yours.

## Sell only on a marketplace that collects: register and file? Do marketplace sales count toward the remote seller threshold?

From the SSTGB marketplace seller chart (${SST_MARKETPLACE_SELLERS}), read ${SALES_TAX_CHECKED_ON}; rows last updated June 2020 to November 2021; general guidance that does not override a state's law.

${mdList(MARKETPLACE_SELLER_STATES.map((s) => `${s.state}: register: ${s.register}; counts toward threshold: ${s.threshold}`))}

"${SST_PHYSICAL_QUOTE}"

## Sales you collect on

${mdList(SELLER_COLLECTED_SALES.map((s) => `${s.name}: ${s.what}`))}

"${SST_DIRECT_QUOTE}" Thresholds by state: ${SST_REMOTE_SELLERS}.

## Resale certificates

The Streamlined Sales Tax Exemption Certificate is accepted by all 24 Streamlined member states (${SST_EXEMPTIONS}); not all states allow every exemption on it; the supplier keeps it.

## Sales tax in ${SITE_NAME}

Marketplace-collected tax is kept out of sales, profit and the Schedule C worksheet. Tax on sales you rang up yourself is listed on its own by month and channel, with quarter totals and refunds, and downloads as a CSV. It does not decide what a state taxes or whether you need a permit.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Sales tax for resellers", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

/**
 * The sell-through page's worked example: one invented reseller's quarter, in the shape the app's stock
 * report takes (apps/seller-books/src/worker/services/books/stock.ts, buildStockReport). Cents, dates
 * YYYY-MM-DD. test/site.test.mjs runs the app's own report over it and checks every figure the page shows.
 */
export const STOCK_EXAMPLE = {
  from: "2026-07-01",
  to: "2026-09-30",
  asOf: "2026-09-30",
  lots: [
    {
      id: "elm",
      name: "Estate sale lot",
      acquiredDate: "2026-08-08",
      totalCostCents: 4000,
      vendor: "Estate sale",
    },
  ],
  items: [
    {
      id: "jeans",
      title: "Denim jeans",
      lotId: null,
      source: "Thrift store",
      acquiredDate: "2026-05-10",
      costCents: 400,
      status: "sold",
      disposedDate: "2026-07-12",
    },
    {
      id: "bowl",
      title: "Glass mixing bowl",
      lotId: null,
      source: "Thrift store",
      acquiredDate: "2026-03-02",
      costCents: 300,
      status: "in_stock",
      disposedDate: null,
    },
    {
      id: "bag",
      title: "Leather handbag",
      lotId: null,
      source: "Garage sale",
      acquiredDate: "2026-06-20",
      costCents: 1200,
      status: "sold",
      disposedDate: "2026-08-01",
    },
    {
      id: "tee",
      title: "Band T-shirt",
      lotId: null,
      source: "Thrift store",
      acquiredDate: "2025-11-15",
      costCents: 200,
      status: "in_stock",
      disposedDate: null,
    },
    {
      id: "shoes",
      title: "Running shoes",
      lotId: null,
      source: "Outlet store",
      acquiredDate: "2026-07-05",
      costCents: 1500,
      status: "in_stock",
      disposedDate: null,
    },
    {
      id: "skillet",
      title: "Cast iron skillet",
      lotId: "elm",
      source: null,
      acquiredDate: "2026-08-08",
      costCents: 1000,
      status: "sold",
      disposedDate: "2026-08-20",
    },
    {
      id: "blanket",
      title: "Wool blanket",
      lotId: "elm",
      source: null,
      acquiredDate: "2026-08-08",
      costCents: 1000,
      status: "sold",
      disposedDate: "2026-09-14",
    },
    {
      id: "candles",
      title: "Brass candlesticks",
      lotId: "elm",
      source: null,
      acquiredDate: "2026-08-08",
      costCents: 1000,
      status: "in_stock",
      disposedDate: null,
    },
    {
      id: "dishes",
      title: "Stoneware dishes",
      lotId: "elm",
      source: null,
      acquiredDate: "2026-08-08",
      costCents: 1000,
      status: "in_stock",
      disposedDate: null,
    },
  ],
  // One order row per sold item, as its platform's report gave it: fees and postage as charged.
  sales: [
    {
      itemId: "jeans",
      platform: "ebay",
      kind: "order",
      date: "2026-07-12",
      itemCents: 3800,
      shippingChargedCents: 0,
      refundCents: 0,
      feesCents: 540,
      shippingLabelCents: 510,
    },
    {
      itemId: "bag",
      platform: "poshmark",
      kind: "order",
      date: "2026-08-01",
      itemCents: 6500,
      shippingChargedCents: 0,
      refundCents: 0,
      feesCents: 1300,
      shippingLabelCents: 0,
    },
    {
      itemId: "skillet",
      platform: "ebay",
      kind: "order",
      date: "2026-08-20",
      itemCents: 4500,
      shippingChargedCents: 0,
      refundCents: 0,
      feesCents: 630,
      shippingLabelCents: 920,
    },
    {
      itemId: "blanket",
      platform: "mercari",
      kind: "order",
      date: "2026-09-14",
      itemCents: 3000,
      shippingChargedCents: 0,
      refundCents: 0,
      feesCents: 300,
      shippingLabelCents: 700,
    },
  ],
};

const DAY_MS = 86_400_000;
const daysBetween = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const dayBefore = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
const medianOf = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The example's figures, by the stock report's definitions (stock.ts's header comment). */
export function stockExampleFigures(ex = STOCK_EXAMPLE) {
  const inStockOn = (i, day) =>
    i.acquiredDate <= day && (i.status === "in_stock" || i.disposedDate > day);
  const proceeds = (id) =>
    ex.sales
      .filter((s) => s.itemId === id)
      .reduce(
        (t, s) =>
          t +
          s.itemCents +
          s.shippingChargedCents -
          s.refundCents -
          s.feesCents -
          s.shippingLabelCents,
        0,
      );
  const startItems = ex.items.filter((i) => inStockOn(i, dayBefore(ex.from))).length;
  const acquiredItems = ex.items.filter(
    (i) => i.acquiredDate >= ex.from && i.acquiredDate <= ex.to,
  ).length;
  const sold = ex.items.filter(
    (i) => i.status === "sold" && i.disposedDate >= ex.from && i.disposedDate <= ex.to,
  );
  const days = sold.map((i) => daysBetween(i.acquiredDate, i.disposedDate));
  const held = ex.items.filter((i) => inStockOn(i, ex.asOf));
  const lots = ex.lots.map((l) => {
    const mine = ex.items.filter((i) => i.lotId === l.id);
    const p = mine.reduce((t, i) => t + proceeds(i.id), 0);
    const soldMine = mine.filter((i) => i.status === "sold");
    return {
      name: l.name,
      costCents: l.totalCostCents,
      items: mine.length,
      sold: soldMine.length,
      proceedsCents: p,
      paybackCents: p - l.totalCostCents,
      recoveredPercent: Math.round((p / l.totalCostCents) * 100),
      soldCostCents: soldMine.reduce((t, i) => t + i.costCents, 0),
      inStockCostCents: mine
        .filter((i) => inStockOn(i, ex.asOf))
        .reduce((t, i) => t + i.costCents, 0),
    };
  });
  return {
    startItems,
    acquiredItems,
    soldItems: sold.length,
    sellThroughPercent: Math.round((sold.length / (startItems + acquiredItems)) * 100),
    daysToSell: Object.fromEntries(sold.map((i, k) => [i.id, days[k]])),
    medianDays: medianOf(days),
    proceeds: Object.fromEntries(sold.map((i) => [i.id, proceeds(i.id)])),
    inStock: { items: held.length, costCents: held.reduce((t, i) => t + i.costCents, 0) },
    daysHeld: Object.fromEntries(held.map((i) => [i.id, daysBetween(i.acquiredDate, ex.asOf)])),
    lots,
  };
}

const cents = (c) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;
const PLATFORM_NAME = new Map([
  ["ebay", "eBay"],
  ["poshmark", "Poshmark"],
  ["mercari", "Mercari"],
]);
/** "2026-07-12" → "Jul 12" (the example's year), "2025-11-15" → "Nov 15, 2025". */
const shortDate = (d) => {
  const t = new Date(`${d}T00:00:00Z`);
  const md = t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return d.startsWith("2026") ? md : `${md}, ${d.slice(0, 4)}`;
};

function sellThrough() {
  const path = "/reseller-sell-through-rate";
  const title = "Sell-through rate for resellers: formula and example";
  const description =
    "How to work out a reseller's sell-through rate and days to sell, whether a bulk lot has paid for itself, and how old your unsold stock is: a worked example.";
  const ex = STOCK_EXAMPLE;
  const f = stockExampleFigures();
  const lot = f.lots[0];
  const lotName = (i) => (i.lotId ? ex.lots.find((l) => l.id === i.lotId).name : i.source);
  const saleOf = (id) => ex.sales.find((s) => s.itemId === id);
  const itemRows = ex.items
    .map((i) => {
      const s = saleOf(i.id);
      const sold = s
        ? `${esc(shortDate(i.disposedDate))}, ${esc(PLATFORM_NAME.get(s.platform) ?? s.platform)}`
        : `<span class="muted">unsold</span>`;
      return `      <tr><th scope="row">${esc(i.title)}</th><td>${esc(lotName(i))}</td><td class="nowrap">${esc(shortDate(i.acquiredDate))}</td><td>${cents(i.costCents)}</td><td>${sold}</td><td>${s ? cents(f.proceeds[i.id]) : ""}</td><td>${s ? f.daysToSell[i.id] : ""}</td></tr>`;
    })
    .join("\n");
  const days = Object.values(f.daysToSell).sort((a, b) => a - b);
  const faqs = [
    {
      q: "How do you calculate sell-through rate for a reseller?",
      a: `Items sold in a period divided by the items you had to sell in it: those on the shelf the day before it began plus those you bought during it. In the example on this page that is ${f.soldItems} ÷ (${f.startItems} + ${f.acquiredItems}) = ${f.sellThroughPercent}%. Items you wrote off or kept for yourself left the shelf but were not sold, so they count in the bottom of the fraction and not the top.`,
    },
    {
      q: "What is a good sell-through rate for a reseller?",
      a: "There is no one standard: it moves with the length of the period, the category and how much you bought in it, and other tools divide by different things (some count only the items bought in the period, some only listed items). The useful comparison is your own rate, figured the same way, from one quarter to the next and from one source to another.",
    },
    {
      q: "How do I know if a bulk lot was worth it?",
      a: `Add up what its items have brought in after fees and postage and set that against what the lot cost. The example's ${lot.name.toLowerCase()} cost ${cents(lot.costCents)}; two of its ${lot.items} items have brought in ${cents(lot.proceedsCents)}, so it has paid back ${lot.recoveredPercent}% of its cost with ${cents(lot.inStockCostCents)} of it still on the shelf. Expenses not tied to a sale, such as supplies and subscriptions, are not in that figure.`,
    },
    {
      q: "What happens to unsold inventory at the end of the year?",
      a: `It stays in inventory at what you paid for it: the cost of what is on the shelf on December 31 is your closing inventory on Schedule C line 41, and next year's opening inventory. It becomes a cost only when it sells, or when you write it off. See cost of goods sold for resellers. Whether and when to write an item off is a question for your tax preparer.`,
    },
  ];
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead"><strong>Sell-through rate = items sold in a period ÷ (items in stock the day before it began + items bought during it).</strong> If you started the quarter with ${f.startItems} items, bought ${f.acquiredItems} more and sold ${f.soldItems}, your sell-through for the quarter is ${f.soldItems} ÷ ${f.startItems + f.acquiredItems} = ${f.sellThroughPercent}%. It tells you how much of what you could have sold, you did sell. Days to sell, how old your unsold stock is, and whether a bulk lot has paid for itself answer the rest of &ldquo;is my inventory working?&rdquo;.</p>
  <h2>A worked example: one quarter</h2>
  <p>An invented reseller's third quarter of 2026, July 1 to September 30. On June 30 they had ${f.startItems} items on the shelf; they bought running shoes in July and a ${cents(lot.costCents)} estate sale lot of ${lot.items} items in August, its cost split evenly. What each sale brought in is the item price less the fees and postage on that platform's own report, before the item's cost.</p>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Item</th><th scope="col">Bought at</th><th scope="col">Bought</th><th scope="col">Cost</th><th scope="col">Sold</th><th scope="col">Brought in</th><th scope="col">Days to sell</th></tr></thead>
    <tbody>
${itemRows}
    </tbody>
  </table></div>
  <p class="muted">Items, dates and amounts are invented to show the arithmetic; the fees are only this example's, not any platform's rates. The test behind this page runs ${esc(SITE_NAME)}' own stock report over these rows and checks every figure below against it.</p>
  <h2>Sell-through rate</h2>
  <div class="worked">
    <table>
      <tbody>
        <tr><th scope="row">In stock on June 30</th><td>${f.startItems}</td></tr>
        <tr><th scope="row">Bought July to September</th><td>+${f.acquiredItems}</td></tr>
        <tr><th scope="row">Available to sell</th><td>${f.startItems + f.acquiredItems}</td></tr>
        <tr><th scope="row">Sold July to September</th><td>${f.soldItems}</td></tr>
        <tr class="total"><th scope="row">Sell-through</th><td>${f.sellThroughPercent}%</td></tr>
      </tbody>
    </table>
  </div>
  <p>Count items that left as sales only. A write-off, a donation or something you kept for yourself also left the shelf, but counting it as sold would flatter the rate. A long window always shows a higher rate than a short one, so compare a quarter with a quarter.</p>
  <h2>Days to sell</h2>
  <p>For each item sold, the sale date less the date you bought it. The example's four sales took ${days.join(", ")} days, so the median is ${f.medianDays} days. The median is the better summary for a reseller: one item that sat for a year would drag an average a long way, and the middle of the list barely moves. Splitting it by platform shows where things move fastest; splitting it by where you bought shows which sources turn over.</p>
  <h2>Has a bulk lot paid for itself?</h2>
  <p>A bin, a pallet or an estate sale haul is bought for one price, so the question is whether its sales have earned that price back yet:</p>
  <div class="worked">
    <table>
      <tbody>
        <tr><th scope="row">${esc(lot.name)}, ${lot.items} items</th><td>${cents(lot.costCents)}</td></tr>
        <tr><th scope="row">Brought in by the ${lot.sold} sold so far</th><td>${cents(lot.proceedsCents)}</td></tr>
        <tr class="total"><th scope="row">Paid back</th><td>${lot.paybackCents >= 0 ? "+" : ""}${cents(lot.paybackCents)} (${lot.recoveredPercent}% of its cost)</td></tr>
        <tr><th scope="row">Cost still on the shelf, ${lot.items - lot.sold} items</th><td>${cents(lot.inStockCostCents)}</td></tr>
      </tbody>
    </table>
  </div>
  <p>Its sales have already covered what it cost, with half its items unsold. On the books it is a little different: the ${lot.sold} sold items carry ${cents(lot.soldCostCents)} of the lot's cost as <a href="${href("/cost-of-goods-sold")}">cost of goods sold</a>, so their profit so far is ${cents(lot.proceedsCents - lot.soldCostCents)}, and the other ${cents(lot.inStockCostCents)} waits in inventory until those items sell. Both are before expenses not tied to a sale: supplies, subscriptions, ads bought separately, mileage to the sale.</p>
  <h2>How old is your unsold stock?</h2>
  <p>On September 30 the example has ${f.inStock.items} items on the shelf at a cost of ${cents(f.inStock.costCents)}. Two have sat more than six months: the band T-shirt (${f.daysHeld.tee} days) and the glass bowl (${f.daysHeld.bowl} days). Bucketing stock by days held (0 to 30, 31 to 90, 91 to 180, 181 to 365, over a year) with the cost in each bucket shows how much money is sitting still, and the oldest items are the ones to reprice, cross-list or bundle. Which to do is your call.</p>
  <p>Unsold stock is not an expense. Whatever is still on the shelf at the end of the year is your closing inventory at cost on Schedule C line 41, and next year's opening inventory; see <a href="${href("/cost-of-goods-sold")}">cost of goods sold for resellers</a>.</p>
  <h2>The stock report in ${esc(SITE_NAME)}</h2>
  <p>The stock report in ${esc(SITE_NAME)} works all of this out from your own records: the items and lots you entered or imported (from your <a href="${href("/reseller-inventory-spreadsheet")}">inventory spreadsheet</a>, for one) and the sales reports you imported from each <a href="${href("/platforms")}">platform</a>, linked to the items they sold. Pick the dates and it shows sell-through, days to sell by platform (median and mean), stock by age with the 25 items held longest, each lot's payback and the cost still in it, and profit and return on cost by where you bought. Sales tax is left out of what a sale brought in. Nothing is estimated: an item marked sold with no linked order, or with a sale date before its bought date, is named for you to fix rather than guessed at.</p>
  <h2>Questions</h2>
${faqs.map((q) => `  <h3>${esc(q.q)}</h3>\n  <p>${esc(q.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "stock" })}</div>`;
  const text = `# ${title}

Sell-through rate = items sold in a period ÷ (items in stock the day before it began + items bought during it). Only items that left as sales count as sold; write-offs and personal use do not.

## Worked example (invented)

${ex.from} to ${ex.to}: ${f.startItems} items in stock on June 30, ${f.acquiredItems} bought, ${f.soldItems} sold: sell-through ${f.sellThroughPercent}%. Days to sell ${days.join(", ")}; median ${f.medianDays}. ${lot.name} cost ${cents(lot.costCents)}; ${lot.sold} of ${lot.items} items sold brought in ${cents(lot.proceedsCents)} after fees and postage: paid back ${cents(lot.paybackCents)} (${lot.recoveredPercent}%), ${cents(lot.inStockCostCents)} of cost still on the shelf; profit on the sold items after their ${cents(lot.soldCostCents)} cost: ${cents(lot.proceedsCents - lot.soldCostCents)}. On ${ex.asOf}: ${f.inStock.items} items in stock costing ${cents(f.inStock.costCents)}.

## Definitions the stock report in ${SITE_NAME} uses

${mdList([
  "In stock on a day: bought on or before it and not yet sold, written off or taken for personal use.",
  "Days to sell: sale date minus bought date, median and mean, by platform and by source.",
  "Brought in by a sale: item price + shipping charged − refunds − fees − postage, from the platform's own report; sales tax left out.",
  "Lot payback: what the lot's sold items brought in minus the lot's cost; before expenses not tied to a sale.",
  "Stock age buckets: 0–30, 31–90, 91–180, 181–365 days, over a year, with the cost in each.",
])}

Unsold stock at year end is closing inventory at cost (Schedule C line 41), not an expense.

## Questions

${faqs.map((q) => `### ${q.q}\n\n${q.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Sell-through rate for resellers", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((q) => ({
          "@type": "Question",
          name: q.q,
          acceptedAnswer: { "@type": "Answer", text: q.a },
        })),
      },
    ],
    text,
  };
}

const money = (n) => `$${n.toFixed(2)}`;

function inventorySpreadsheet() {
  const path = "/reseller-inventory-spreadsheet";
  const title = "Free reseller inventory spreadsheet (Excel)";
  const description =
    "A free Excel inventory spreadsheet for resellers: cost per item and per lot, profit per sale, days to sell, and the year's Schedule C Part III figures at cost.";
  const ex = EXAMPLE_SUMMARY;
  const imported = COLUMNS.filter((c) => c.imported).map((c) => c.header);
  const colRows = COLUMNS.map(
    (c) =>
      `      <tr><th scope="row">${esc(c.header)}</th><td>${c.kind === "formula" ? "Worked out" : "You"}</td><td>${c.imported ? "Yes" : "No"}</td><td>${esc(c.about)}</td></tr>`,
  ).join("\n");
  const summaryRows = summaryLines()
    .map(
      (l) =>
        `      <tr><th scope="row">${esc(l.label)}</th><td>${l.line ? `Line ${esc(l.line)}` : ""}</td><td>${esc(l.note)}</td></tr>`,
    )
    .join("\n");
  const exRows = [
    ["On hand January 1, at cost (line 35)", ex.onHandJan1],
    ["Bought during the year, at cost", ex.bought],
    ["Kept for yourself, at cost", -ex.kept],
    ["Purchases less items kept (line 36)", ex.line36],
    ["Sold during the year, at cost", ex.soldAtCost],
    ["Donated, at cost", ex.writtenOff],
    ["Still in stock December 31, at cost (line 41)", ex.onHandDec31],
  ];
  const faqs = [
    {
      q: "What should a reseller inventory spreadsheet track?",
      a: "For each purchase: what it is, a SKU, how many, what you paid (each, or for the whole lot), the date you bought it, and where it went: sold on a date, or kept, donated or lost on a date. Those are the facts Schedule C Part III needs at year end. Where you bought it, the platform, the sale price, fees and shipping are useful for profit per sale and are in the sheet too.",
    },
    {
      q: "How do I record a bulk lot or a bin haul?",
      a: "Put the number of items in Qty and the price you paid for the whole lot in Total Cost. The sheet counts the row at that price; Seller Books splits it evenly over the items when you import, leftover cents to the first items, so the shares add back up to what you paid. If one piece is clearly worth more, give it its own row and cost.",
    },
    {
      q: "Does the spreadsheet work in Google Sheets or Numbers?",
      a: "It is an .xlsx file built for Excel and checked by recalculating it in LibreOffice Calc. Google Sheets and Numbers open .xlsx files; check the Year summary figures against a few rows by hand after opening it there.",
    },
    {
      q: "Can I import this spreadsheet into Seller Books?",
      a: `Yes. Save the Inventory sheet as CSV and import it on the Inventory page, under "Import your sourcing sheet". It reads ${imported.join(", ")}; it shows what it found before anything is saved, and importing the same sheet again later adds only the new rows. The import is on the Free plan.`,
    },
    {
      q: "When is a spreadsheet enough?",
      a: "When you sell on one platform, a few dozen items a month, and are happy to copy each sale's price and fees in by hand. It stops being enough when sales come from several platforms, when refunds and returns need matching to items, or when you want the payouts checked against the bank and a 1099-K checked against your sales.",
    },
  ];
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">One row per purchase: what you paid, when, and where each item went. The sheet works out profit per sale and how long things sit, and its Year summary gives the cost figures <a href="${href("/cost-of-goods-sold")}">Schedule C Part III</a> asks for. Free, no sign-up, no email.</p>
  <p><a class="button" href="${href(`/${TEMPLATE_FILE}`)}" download>Download the spreadsheet (.xlsx)</a> <a class="button ghost" href="${href(`/${EXAMPLE_FILE}`)}" download>Download the filled-in example</a></p>
  <p class="muted">Three sheets: Inventory (500 rows), Year summary and Read me. Built for Excel and checked by recalculating it in LibreOffice Calc. The example's ${EXAMPLE_ITEMS.length} rows are invented.</p>
  <h2>The columns</h2>
  <p>Shaded cells are for you; the last four columns are worked out. The "Imported" column says which ones Seller Books reads if you move the sheet into it later.</p>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Column</th><th scope="col">Filled by</th><th scope="col">Imported</th><th scope="col">What goes in it</th></tr></thead>
    <tbody>
${colRows}
    </tbody>
  </table></div>
  <h2>Lots, and items that leave without a sale</h2>
  <p>A bin haul, pallet or mystery box bought for one price goes on one row: the number of items in Qty and the price in Total Cost. An item you keep for yourself, give away, lose or throw out still left your stock, and Part III needs the year it left: set Status to ${esc(STATUSES.slice(3).join(", "))} and fill in Date Removed. Kept items come off purchases on line 36; donated and lost ones stop counting as stock on hand. The Status column offers ${esc(STATUSES.join(", "))}.</p>
  <h2>The Year summary</h2>
  <p>Type a tax year and the sheet adds up the Inventory rows for it, at cost. The line numbers are Schedule C Part III's (<a href="${IRS_PUB_334}">Publication 334</a>, chapter 6). The last row is a check that should read zero: it catches a row with both a date sold and a date removed, or a date removed with no status.</p>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Figure</th><th scope="col">Part III</th><th scope="col">What it counts</th></tr></thead>
    <tbody>
${summaryRows}
    </tbody>
  </table></div>
  <div class="worked">
    <p class="muted">The example file, for 2026 (invented rows, figures as the sheet works them out):</p>
    <table>
      <tbody>
${exRows.map(([label, v]) => `        <tr><th scope="row">${esc(label)}</th><td>${v < 0 ? "&minus;" : ""}${money(Math.abs(v))}</td></tr>`).join("\n")}
        <tr class="total"><th scope="row">Profit on the ${ex.itemsSold} items sold in 2026</th><td>${money(ex.profit)}</td></tr>
      </tbody>
    </table>
    <p class="muted">${money(ex.onHandJan1)} + ${money(ex.bought)} &minus; ${money(ex.kept)} &minus; ${money(ex.soldAtCost)} &minus; ${money(ex.writtenOff)} = ${money(ex.onHandDec31)}, so the check reads zero. The ski jacket bought in December and sold in January is in the December 31 stock, and its cost counts in 2027, the year it sold. Profit is ${money(ex.soldFor)} sold for, less ${money(ex.fees)} fees, ${money(ex.shipping)} shipping and ${money(ex.soldAtCost)} cost.</p>
  </div>
  <p>The Year summary covers stock only. Fees, supplies, miles and a storage unit are expenses on their own Schedule C lines (see <a href="${href("/reseller-tax-deductions")}">reseller tax deductions</a>), and the cost of goods sold on line 42 comes from your full records, not from a template. Check the figures with your tax preparer.</p>
  <h2>Moving the sheet into ${esc(SITE_NAME)}</h2>
  <p>With the Inventory sheet open, save it as CSV, then in ${esc(SITE_NAME)} open Inventory and use "Import your sourcing sheet". It reads ${esc(imported.join(", "))}, by column name, so the sheet can also be one you made yourself with those headings. It shows what it found and which rows it would skip, and why, before anything is saved, and importing the same sheet again adds only the new rows. Sales then come from each platform's own report and are matched to these items by SKU, which is why the SKU column is worth filling in.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "sheet", openHeading: "When the spreadsheet gets too long" })}</div>`;
  const text = `# ${title}

One row per purchase. The sheet works out profit per sale and days to sell, and a Year summary gives the Schedule C Part III cost figures (lines 35, 36 and 41). Free download, no sign-up: ${SITE_URL}/${TEMPLATE_FILE} (example: ${SITE_URL}/${EXAMPLE_FILE}).

## Columns

${mdList(COLUMNS.map((c) => `${c.header} (${c.kind === "formula" ? "worked out" : "you"}${c.imported ? ", imported by Seller Books" : ""}): ${c.about}`))}

## Year summary

${mdList(summaryLines().map((l) => `${l.label}${l.line ? ` (line ${l.line})` : ""}: ${l.note}`))}

Invented example for 2026: ${exRows.map(([l, v]) => `${l} ${money(v)}`).join("; ")}; profit on ${ex.itemsSold} sales ${money(ex.profit)}.

## Moving the sheet into ${SITE_NAME}

Save the Inventory sheet as CSV and import it on the Inventory page ("Import your sourcing sheet"). It reads ${imported.join(", ")}, shows a preview first, and a re-import adds only new rows. Sales come from marketplace reports, matched by SKU.

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Reseller inventory spreadsheet", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    text,
  };
}

// The alternatives a reseller weighs, with each price from a page this repository already cites
// (portfolio/monetization/bets.md, bet #5, read 2026-11-24) or a search excerpt read on COMPARE_CHECKED_ON.
// Vendor pages did not answer from the session that wrote this, so every price says where it came from
// and the page tells the reader to check the vendor's own page. Nothing here rates or ranks a rival.
export const COMPARE_CHECKED_ON = "2026-11-27";
export const ALTERNATIVES = [
  {
    name: "A spreadsheet",
    kind: "Free; you type every sale, fee and cost",
    price: "Free",
    source: null,
    fits: "A few sales a month on one platform, and you like spreadsheets.",
    watch:
      "Every fee and refund is typed or pasted by hand, and the Schedule C totals are only as right as the formulas.",
  },
  {
    name: "Seller Ledger",
    kind: "Bookkeeping app for online sellers",
    price: "$10, $20 or $50 a month (250, 1,000 or 5,000 transactions a month)",
    source: {
      label: "its Shopify App Store listing",
      url: "https://apps.shopify.com/seller-ledger",
    },
    fits: "Online sellers who want a bookkeeping app of their own rather than QuickBooks.",
    watch:
      "Check on its own pages which platforms it reads and how it handles cost per item and per lot.",
  },
  {
    name: "A2X",
    kind: "Connector that posts marketplace payouts into an accounting ledger",
    price: "From $29 a month per sales channel",
    source: { label: "G2's pricing page", url: "https://www.g2.com/products/a2x/pricing" },
    fits: "Amazon, Shopify, eBay, Etsy or Walmart sellers who already keep books in QuickBooks Online, Xero or NetSuite.",
    watch:
      "It needs that ledger as well (a second subscription), and the price is per channel, so crosslisting to several platforms adds up.",
  },
  {
    name: "Link My Books",
    kind: "Connector that posts marketplace payouts into an accounting ledger",
    price: "About $21 to $136 a month",
    source: {
      label: "Capterra's pricing page",
      url: "https://www.capterra.com/p/184768/Link-My-Books/pricing/",
    },
    fits: "Sellers who already keep books in Xero or QuickBooks and want the payouts posted for them.",
    watch: "Like A2X, it is a layer on top of an accounting ledger, not the ledger itself.",
  },
  {
    name: "QuickBooks Solopreneur",
    kind: "General bookkeeping for one-person businesses, from a bank feed",
    price: "Not quoted here: see Intuit's own pricing",
    source: {
      label: "Intuit's QuickBooks Self-Employed to Solopreneur page",
      url: "https://quickbooks.intuit.com/r/product-update/quickbooks-self-employed-vs-quickbooks-solopreneur",
    },
    fits: "Someone whose income is mostly services, or who wants one app for every kind of self-employment.",
    watch:
      "Intuit's replacement for QuickBooks Self-Employed. A bank feed sees net payouts, not the fees inside them or what each item cost; check how it handles inventory before you rely on it for reselling.",
  },
];

function compare() {
  const path = "/compare";
  const title = "Bookkeeping software for resellers, compared";
  const description =
    "Seller Ledger, A2X, Link My Books, QuickBooks Solopreneur and a spreadsheet next to Seller Books: what each is built for, its price, and who it fits.";
  const paid = TIERS.map((t) => `${t.name} $${t.monthly}`).join(", ");
  const ours = {
    price: `Free for 1 platform and ${FREE_INCLUDES.find((s) => /orders/.test(s)).replace(/^Up to /, "up to ")}; paid plans ${paid} a month${launch().paidOn ? "" : " (not on sale yet)"}`,
    fits: "Resellers who source stock and sell it on one or more marketplaces, and want profit per item and a Schedule C worksheet without running QuickBooks or Xero.",
    watch:
      "It is not a general ledger: no bank feed, no invoicing, no payroll. If your accountant wants the books in QuickBooks Online, it hands them monthly journal entries to import.",
  };
  const sourceHtml = (s) => (s ? `<a href="${esc(s.url)}">${esc(s.label)}</a>` : "");
  const rows = ALTERNATIVES.map(
    (a) =>
      `      <tr><th scope="row">${esc(a.name)}</th><td>${esc(a.kind)}</td><td>${esc(a.price)}${a.source ? `<br><span class="muted">per ${sourceHtml(a.source)}</span>` : ""}</td><td>${esc(a.fits)}</td><td>${esc(a.watch)}</td></tr>`,
  ).join("\n");
  const differences = [
    [
      "It reads each platform's own report",
      `The sales, fees, shipping, refunds and the sales tax the platform collected come from the marketplace's export, not from a bank deposit, so the fees inside a payout are not lost. See <a href="${href("/platforms")}">the platforms it reads</a>.`,
      "Sales, fees, shipping, refunds and collected sales tax come from the marketplace's export, not from a bank deposit.",
    ],
    [
      "It keeps what each item cost",
      `Cost per item, a bulk lot split across its items, and stock on hand at December 31 for <a href="${href("/cost-of-goods-sold")}">cost of goods sold</a>, so profit is per sale and closing inventory is at cost.`,
      "Cost per item and per lot, and closing inventory at cost, for cost of goods sold.",
    ],
    [
      "It ends in a Schedule C worksheet",
      `Every figure lands on its line of the <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a>, with the sourcing miles priced on line 9 and the lists behind each total, for you or your preparer. It is a worksheet, not a filing.`,
      "Every figure lands on its Schedule C line, with the lists behind each total. A worksheet, not a filing.",
    ],
    [
      "It needs no second subscription",
      "No QuickBooks or Xero account is needed, and the price is by orders a month, not per channel, so crosslisting does not multiply it.",
      "No QuickBooks or Xero account needed; priced by orders a month, not per channel.",
    ],
  ];
  const faqs = [
    {
      q: "What is the best bookkeeping software for resellers?",
      a: `It depends on where your books already live. If you or your accountant keep them in QuickBooks Online or Xero, a connector such as A2X or Link My Books posts the marketplace payouts into it. If you do not, and you sell secondhand stock on several marketplaces, an app built for resellers (Seller Ledger, or ${SITE_NAME}) does the fees, cost of goods and Schedule C without a ledger behind it. With only a few sales a month, a spreadsheet is enough.`,
    },
    {
      q: "Is there an alternative to QuickBooks Self-Employed for resellers?",
      a: `Intuit replaced QuickBooks Self-Employed with QuickBooks Solopreneur. For reselling, the question to ask of any replacement is whether it sees the fees inside each payout and what each item cost; a bank feed sees neither. ${SITE_NAME} reads the platforms' own reports and keeps cost per item, and it can hand QuickBooks Online monthly journal entries if you move to it later.`,
    },
    {
      q: "Do I need A2X or Link My Books if I am not using QuickBooks or Xero?",
      a: "They are built to post payouts into an accounting ledger, so on their own they do not give you a Schedule C. Without a ledger, you would need one as well, or an app that keeps the books itself.",
    },
    {
      q: `How much does ${SITE_NAME} cost?`,
      a: `Free for one platform and up to 25 orders a month, with every report. Paid plans are ${paid} a month (two months off when paid yearly)${launch().paidOn ? "" : "; they are not on sale yet"}. See the pricing page.`,
    },
  ];
  const body = `<section class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Resellers end up choosing between four kinds of tool: a spreadsheet, a bookkeeping app for online sellers, a connector that posts payouts into QuickBooks or Xero, and general self-employed bookkeeping. Each is right for someone. Here is what each is built for, what it costs as listed, and where ${esc(SITE_NAME)} fits.</p>
  <h2>The options</h2>
  <div class="table-scroll"><table>
    <thead><tr><th scope="col">Tool</th><th scope="col">What it is</th><th scope="col">Price as listed</th><th scope="col">Fits</th><th scope="col">Worth checking</th></tr></thead>
    <tbody>
      <tr><th scope="row">${esc(SITE_NAME)}</th><td>Books for resellers, from the marketplaces' own reports</td><td>${esc(ours.price)}<br><span class="muted">per <a href="${href("/pricing")}">our pricing page</a></span></td><td>${esc(ours.fits)}</td><td>${esc(ours.watch)}</td></tr>
${rows}
    </tbody>
  </table></div>
  <p class="muted">Other tools' prices are as the linked pages showed them, read through search excerpts ${esc(COMPARE_CHECKED_ON)} or in our research of 2026-11-24 (the vendors' own pages did not load for us). Prices and plans change: check each vendor's own page before you choose. Names are their owners' trademarks; no tool here endorses ${esc(SITE_NAME)}.</p>
  <h2>What ${esc(SITE_NAME)} does differently</h2>
  <div class="table-scroll"><table>
    <tbody>
${differences.map(([a, b]) => `      <tr><th scope="row">${esc(a)}</th><td>${b}</td></tr>`).join("\n")}
    </tbody>
  </table></div>
  <p>If you only sell a few things a month, start with the free <a href="${href("/reseller-inventory-spreadsheet")}">reseller inventory spreadsheet</a>: its columns are the ones ${esc(SITE_NAME)} imports, so nothing is retyped if you move over.</p>
  <h2>Questions</h2>
${faqs.map((f) => `  <h3>${esc(f.q)}</h3>\n  <p>${esc(f.a)}</p>`).join("\n")}
  ${notTaxAdvice}
</section>
<div class="wrap">${callToAction(path, { idPrefix: "compare" })}</div>`;
  const text = `# ${title}

## The options

- ${SITE_NAME}: books for resellers from the marketplaces' own reports. ${ours.price}. Fits: ${ours.fits} Worth checking: ${ours.watch}
${mdList(ALTERNATIVES.map((a) => `${a.name}: ${a.kind}. ${a.price}${a.source ? ` (per ${a.source.label}, ${a.source.url})` : ""}. Fits: ${a.fits} Worth checking: ${a.watch}`))}

Other tools' prices read through search excerpts ${COMPARE_CHECKED_ON}; check each vendor's own page. No tool here endorses ${SITE_NAME}.

## What ${SITE_NAME} does differently

${mdList(differences.map(([a, , c]) => `${a}: ${c}`))}

## Questions

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

${NOT_TAX_ADVICE}`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      webPage(path, title, description),
      breadcrumbs([{ name: "Compare", path }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
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

/** The pages a feature card can link to (the home page's cards name them by path). */
function guidePages() {
  return [
    platformsIndex(),
    scheduleC(),
    form1099k(),
    costOfGoodsSold(),
    inventorySpreadsheet(),
    sellThrough(),
    mileageDeduction(),
    homeOfficeAndEquipment(),
    taxDeductions(),
    salesTax(),
    estimatedTax(),
    compare(),
  ];
}

/** Every page, in sitemap order. */
export function allPages() {
  return [
    home(),
    platformsIndex(),
    ...PLATFORMS.map(platformPage),
    scheduleC(),
    form1099k(),
    personalItems(),
    facebookMarketplace(),
    poshmarkTaxes(),
    ebayTaxes(),
    whatnotTaxes(),
    mercariTaxes(),
    amazonTaxes(),
    costOfGoodsSold(),
    inventorySpreadsheet(),
    sellThrough(),
    mileageDeduction(),
    homeOfficeAndEquipment(),
    taxDeductions(),
    salesTax(),
    estimatedTax(),
    compare(),
    pricing(),
    faq(),
    earlyAccess(),
    privacy(),
    thanks(),
    notFound(),
  ];
}
