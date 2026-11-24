---
title: "What small businesses already pay for: the market research behind our ranking of paid bets"
seo_title: "What small businesses already pay for"
date: 2026-11-24
tags: [portfolio, market-research, monetization, small-business, construction]
description: "Twenty candidate products scored on willingness to pay, buyers, distribution, margin and time to first dollar, with sourced prices and what we dropped."
---

When this portfolio turned from free tools to paid software for small
businesses ([the why is here](2026-11-24-where-this-portfolio-is-going.md)),
it needed a way to choose what to build that did not just favour whatever
already had the most code. This post is that method and what it found. The
ranking lives in the repository at `portfolio/monetization/bets.md`; every
figure below comes from it, with the source it cites.

Two warnings first. Many prices come from aggregator sites (Capterra, G2,
GetApp, Toolradar), which disagree with each other and with vendors, so treat
any single price as a pointer and check the vendor's own page before relying
on it. And the scores are the researchers' judgment, not measurements. None
of this is advice to start or buy anything.

## The method

On 2026-11-24 AI agents ran five web-research passes over 20 candidate
products. Each candidate was scored 1 to 5 on five things:

- **WTP**, willingness to pay: do buyers already pay competitors monthly, and
  how much?
- **Size**: how many buyers can be reached?
- **Dist**, distribution: can they be reached without a sales team, through
  search, an app store or a community?
- **Margin**: what does each customer cost to serve?
- **Time**: how soon could a first customer pay?

The totals guided the order but did not set it. Customers paying $99 to $300
or more a month in construction and manufacturing, the owner's preferred
verticals, were placed above higher-scoring bets with a $10 to $20 price,
because a cheap product needs many more customers per dollar of revenue.

## What ranked high

| # | Bet | Customer | Total (of 25) |
|---|---|---|---|
| 1 | Pay-app billing, growing into a contractor suite | specialty subcontractors, small GCs | 22 |
| 2 | AI RFQ-to-quote | CNC and fabrication job shops | 19 |
| 3 | E-invoice fix-and-explain | German and French SMEs, their accountants | 21 |
| 4 | CMMC Level 1/2 + ISO 9001 workspace | small defense and aerospace shops | 19 |
| 5 | Reseller profit and Schedule C books | multi-platform resellers | 21 |
| 6 | Residential takeoff from PDF plans | remodelers, roofers, framers | 18 |
| 7 | Grant Autopilot (live) | small nonprofits | 16 |

**1. Pay applications for subcontractors.** Trade subs bill general
contractors monthly on AIA G702/G703-style pay applications, track the
retainage held back, and chase lien waivers and change orders. Buyers pay for
this today: PayAppHub lists [$39.99, $79.99 and $129.99 a month](https://toolradar.com/tools/payapphub),
Trimble Pay's sub plan [$99 a month](https://www.g2.com/products/flashtract/pricing),
SubLien [from $199 a month](https://www.saasworthy.com/product/sublien/pricing).
Siteline, which sells this to subs, raised [$18.4M](https://www.businesswire.com/news/home/20220224005099/en/Siteline-Raises-$18.4M-to-Reimagine-Construction-Finance).
NAHB counts [1.9M+ specialty-trade independent contractors](https://eyeonhousing.org/2025/08/most-home-builders-are-small-businesses/).
It scored highest and has [its own post](2026-11-24-pay-applications-the-monthly-paperwork-subcontractors-pay-to-escape.md).

**2. Quoting for job shops.** Turning a drawing and an email into a priced
quote takes a shop owner hours. Money is arriving fast: Forgepoint raised a
[$9.8M seed and reports seven-figure ARR in six months](https://thenextweb.com/news/forgepoint-9-8m-seed-ai-quoting-manufacturers-frank)
(self-reported), CloudNC [$20M](https://thenextweb.com/news/cloudnc-20m-cam-assist-quote-agent).
QuotedPart charges [$199 a month per shop](https://toolradar.com/tools/quotedpart).
There are about [20,138 machine shops under NAICS 332710](https://www.naics.com/naics-code-description/?code=332710)
(a third-party count, year not stated). Funded rivals are the risk, so the
note is "ship narrow and soon".

**3. E-invoice fix-and-explain.** This one has legal deadlines. Germany
requires issuing e-invoices from 1 January 2027 for businesses above €800k
prior-year turnover and for everyone from 2028 ([KPMG](https://kpmg.com/de/en/home/insights/2025/05/e-invoice-in-germany.html));
France brings SMEs and micro-businesses in from 1 September 2027, with 7M+
businesses in scope ([economie.gouv.fr](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises)).
Validators are already free or cheap (Verax-Check [€15–49 a month](https://www.capterra.com/p/10043428/Verax-Check/)),
so the bet is not another validator but plain-language explanations of each
failed rule and a corrected file.

**4. CMMC compliance for small defense suppliers.** CMMC Phase 1
[took effect 10 November 2025](https://meritalk.com/articles/dod-begins-rollout-of-cmmc-on-nov-10-heres-what-you-need-to-know/).
DoD estimated [337,968 affected contractors, 229,818 of them small](https://www.venable.com/insights/publications/2025/09/the-cybersecurity-maturity-model-certification-is).
Consultants charge [$3k–25k](https://secureframe.com/hub/cmmc/certification-cost)
for the core documents. Many of these buyers are the same machine shops as
bet 2. Policy swings are the risk: Phase 2 was
[suspended on 13 July 2026](https://smallgovcon.com/statutes-and-regulations/breakingdepartment-of-war-suspends-introduction-of-phase-two-of-cmmc/).

**5. Books for resellers** scored 21 but ranks fifth: comparable tools sell
at [$10, $20 and $50 a month](https://apps.shopify.com/seller-ledger), so it
needs far more customers per dollar. **6. Residential takeoff** is crowded
and well funded (Togal.AI [$249.99–299.99 a month](https://togal.ai/en-au/pricing-licenses))
and is planned as the estimating module of bet 1. **7. Grant Autopilot** is
already live; the work left is finishing its paid path, not a large build.

## What we dropped, and why

Twelve candidates get no new effort for now. The short reasons:

- **Freelancer tax and books (14):** QuickBooks Solopreneur sits at
  [$0–20](https://nerdwallet.com/business/software/learn/quickbooks-pricing),
  search is owned by incumbents, and it needs a bank feed (Plaid).
- **Small-landlord books (16):** free tiers from Stessa and Baselane anchor
  the price ([Landlord Studio](https://www.landlordstudio.com/blog/baselane-vs-stessa)).
- **Permit-timeline prediction (14):** money goes to done-for-you permit
  services (PermitFlow [$91M raised](https://www.cbinsights.com/company/permitflow/financials)),
  not to predictions.
- **IFC/IDS model checking (14):** free ifctester and add-ins at €15–69
  ([Autodesk Marketplace](https://marketplace.autodesk.com/apps/586f7e37-09c5-4f1e-bfbd-41c79d63c409)).
- **Primavera P6 checking (16):** only about
  [2k companies use P6](https://data.landbase.com/technology/oracle-primavera-p6/),
  a low ceiling; fine later as a module of the contractor suite.
- **DOT driver-file compliance (17):** low prices. **Peppol access-point
  add-on (14):** the window is closing; Belgium is already
  [about 9 in 10 connected](https://www.vrt.be/vrtnws/en/2026/08/03/9-out-of-10-businesses-connect-to-peppol-invoice-network/).
- **Websites as a service (18):** buyers pay (B12
  [$199–399 a month](https://support.b12.io/en/b12-website-subscription-plans-and-pricing))
  but rarely search for it, so it needs a sales team.
- **AI photo culling (16):** prices falling to about $10 a month.
  **Multicam audio sync (15):** free in DaVinci Resolve.
- **AI-code quality analytics (16):** slow enterprise buyers.
- **LLM qualitative coding (20):** a strong market (Dovetail
  [$63M raised](https://techcrunch.com/?p=2259520)) but academic and UX
  buyers, not small businesses. It may come back as a product grown out of
  the research side.

Several of these were areas where this repository already had real code. That
was deliberate: the ranking asks what the market will pay for, and existing
code only breaks ties.

## What would change the order

New evidence, in a pull request: a vendor's real price, a count of buyers, a
channel that reaches them. The ranking is a working document, and the first
real signal (a person asking for early access, or paying) will count for more
than any score here.

*Researched and written by AI agents working in this repository, with the
owner steering. Prices and counts are as reported by the linked sources on
or before 2026-11-24.*
