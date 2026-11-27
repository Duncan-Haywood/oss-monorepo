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

const notTaxAdvice = `<p class="note">${esc(NOT_TAX_ADVICE)}</p>`;

function home() {
  const path = "/";
  const open = launch().open;
  const SUMMARY = summary();
  const title = `${SITE_NAME}: ${TAGLINE}`;
  const description =
    "Bookkeeping for resellers on eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify, Amazon, TikTok Shop and Square: true profit after fees and cost of goods, and a Schedule C worksheet.";
  const features = FEATURES.map(
    (f) => `<div class="card"><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></div>`,
  ).join("\n");
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
    "How fees, payouts and cost of goods work on eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify, Amazon, TikTok Shop and Square, and how Seller Books puts them in one ledger.";
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
  const description = `Track true profit on ${p.name} sales: the fees ${p.name} actually charged, what each item cost you, shipping and miles, in one ledger with your other platforms. ${launch().open ? "Free on one platform." : "Early access."}`;
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
<div class="wrap">${callToAction(path, { heading: `Get early access for your ${p.name} books`, openHeading: `Try it on your ${p.name} report`, idPrefix: p.slug })}</div>`;
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
  <p>Cost of goods sold is not what you spent on inventory this year. It is what you had at the start of the year, plus what you bought, minus what was still unsold at the end. Items bought in December and sold in March count in the year they sell. ${esc(SITE_NAME)} tracks each item's cost from purchase to sale, so the year-end inventory figure is a list of real items, not a guess. The start of the year should match the end-of-year inventory on last year's return: enter that figure and the worksheet uses it, and tells you if your item records disagree. Line by line, with the IRS wording: <a href="${href("/cost-of-goods-sold")}">cost of goods sold for resellers</a>.</p>
  <h2>Mileage</h2>
  <p>Driving to source inventory or to drop off packages can be business mileage. You can deduct either the IRS standard mileage rate for business miles or your actual car expenses, under the IRS rules for choosing between them. The IRS sets the rate and can change it during a year (it did in 2026), so the worksheet uses the rate in effect on each trip's date. The rates, a worked 2026 example and the log to keep: <a href="${href("/mileage-deduction")}">mileage deduction for resellers</a>; and <a href="${IRS_MILEAGE}">the IRS standard mileage rates</a>.</p>
  <h2>Home office and equipment</h2>
  <p>Stock kept at home can put line 30 on the worksheet by the simplified method, and equipment you keep (a camera, a label printer, shelving) is split at the de minimis safe harbor: line 27a, or Form 4562 for larger purchases. The rules and a worked example: <a href="${href("/home-office-and-equipment")}">home office and equipment deductions for resellers</a>.</p>
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
    "A reseller's Form 1099-K counts gross payments before refunds and fees. What box 1a includes, why it rarely matches your sales, and how to check it month by month.";
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

// The cost of goods sold page: Schedule C Part III for a reseller, line by line. The IRS wording quoted
// here is from the Instructions for Schedule C (2025) and Publication 334 (2025), read on irs.gov
// 2026-11-26. Every figure in the worked example is invented and labelled so; test/site.test.mjs holds
// its sums.
const IRS_SC_INSTRUCTIONS = "https://www.irs.gov/instructions/i1040sc";
const IRS_PUB_334 = "https://www.irs.gov/publications/p334";
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
    "How a reseller fills in Schedule C Part III, lines 35 to 42: opening inventory, purchases, closing inventory and cost of goods sold, with the IRS wording and a worked example.";
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
  <p>Part III needs a cost for each item that sold and each item still unsold, but a lot is bought for one price. ${esc(SITE_NAME)} spreads a lot's cost evenly over the items in it unless you type a cost for an item yourself; leftover cents go to the first items, so the shares always add back up to exactly what you paid. Whether an even split suits a particular lot is your call: give the one valuable piece in a box its own cost and the rest is shared by the others. The stock report then shows whether each lot has paid for itself.</p>
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
  <p>To email you about early access to ${esc(SITE_NAME)}, and to count (not profile) which platforms and order volumes people want, so we can decide what to build and how to price it. We don't sell or share the list. No analytics or advertising scripts run on this site.</p>
  <h2>Who can see it</h2>
  <p>Only the people who run ${esc(SITE_NAME)} can see the list: your email address, the page you signed up on, whether you confirmed, and the date. Each time they view it, that view is logged.</p>
  <h2>How long</h2>
  <p>Signups that aren't confirmed are deleted after 30 days, or once the last confirmation link has expired if that is later (a link works for 7 days). If you unsubscribe, we keep your address only so we never email it again, and delete the rest.</p>
  <h2>Leaving</h2>
  <p>Every email has an unsubscribe link. To have your address deleted entirely, email <a href="mailto:hello@marisstella.app">hello@marisstella.app</a>.</p>
</section>`;
  const text = `# Privacy (early-access list)\n\nStores: email, optional platforms and order range, signup page, consent wording version, timestamps, salted hash of IP. Used only for early-access emails and aggregate counts. Only the people who run the site can see the list (email, signup page, confirmed or not, date); each view is logged. Unconfirmed signups deleted after 30 days, or when the last 7-day confirmation link expires if later. Unsubscribe link in every email; deletion on request at hello@marisstella.app.`;
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
    "Sourcing trips, estate sales and post office runs on Schedule C line 9: the IRS standard mileage rates, why 2026 has two (72.5¢, then 76¢ from July 1), and the log a reseller keeps.";
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
    "Stock stored at home on Schedule C line 30 by the simplified method ($5 a square foot, up to 300), and a camera, label printer or shelving under the de minimis safe harbor.";
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
      a: `No. ${SITE_NAME} works out line 30 by the simplified method only, and names equipment over ${limit} for Form 4562 (line 13) without working out the depreciation; those purchases stay out of the totals, with a warning, so nothing is deducted twice. Your tax preparer handles Form 8829 or Form 4562 if you need them.`,
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

Line 30 by the simplified method from the space saved for the year, held to line 29; quarterly estimates take it by months. Equipment at or under ${limit} on line 27a with the election reminder; over it named for Form 4562 and left out of the totals. The regular method and depreciation are not built.

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
    "The 2026 Form 1040-ES due dates, how much a reseller pays by each (the 90/100/110% safe harbours), self-employment tax, and the annualized method for a Q4-heavy year.";
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
      a: "It is interest-like, figured on Form 2210 for each date you were short and for how long, not a flat fine. Paying the safe-harbour amounts by each date generally avoids it. Your tax preparer can say how it applies to you.",
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
    form1099k(),
    costOfGoodsSold(),
    mileageDeduction(),
    homeOfficeAndEquipment(),
    estimatedTax(),
    pricing(),
    faq(),
    earlyAccess(),
    privacy(),
    thanks(),
    notFound(),
  ];
}
