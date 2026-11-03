---
title: "Which of 1,325 projects could actually be a business"
seo_title: "Which open-source projects could realistically run as a business"
date: 2026-11-02
tags: [business-model, viability, portfolio, honesty]
description: "None of 1,325 projects earns today. A few could; most small tools only make sense as collections. A project-by-project read of realistic viability."
---

This repository holds 1,325 products in `ventures/` and over a thousand research directories. The owner asked a plain question: which of them could realistically run as a business? This post answers it per project for the deep ones and per collection for the rest, since most of the small tools only make sense as part of a group.

The short answer: **none of them is a business today.** A few could become one. Most of the 1,300 small tools never will be on their own. As collections, some of them can still earn their keep.

## What the numbers say first

Before judging any product, here is what the repository's own files record:

- **Revenue: none.** Every `VENTURE.yaml` that carries an `economics` block has `mrr: null`, and none lists a paying customer. Monthly cost is $0, because everything runs in the visitor's browser or on the deployer's own account.
- **Stage: all prototypes.** 1,322 ventures say `prototype` and 3 say `idea`.
- **Demand is untested.** The ventures list 2,453 hypotheses about what users want. 2,398 of them (98%) are `untested`, 51 are `supported`, 2 were refuted.
- **Traffic is tiny.** The first-party counter (`portfolio/usage/site-visits.json`) recorded **41 human page loads** over the five days it has data for (24 to 30 October), between 4 and 13 a day. Most were the home page (`c`, 12), the ask page (9) and about (6). The only tool page with more than one load was the [shed designer](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shed-designer), with 6.
- **Crawlers are reading.** On 30 October alone, headless crawlers sent 4,409 beacons. The pages they read most were the Hearth & Horizon fiction (127), the e-invoice validator (57), Saints by Candlelight (56), the bookkeeper (44) and the league scheduler (29), followed by the eBay, Amazon FBA and Shopify fee calculators.
- **Feedback: one message**, and it was our own test.

So any viability verdict below is about *potential*. Nothing here has proved demand yet. Visitors are the scarcest input, ahead of features and ahead of a payment rail.

Two constraints shape every verdict. The owner's model is one-click deploy: anyone can run their own copy on their own accounts, so the owner hosts nothing and isn't the operator. And the owner's own sites take donations only, unless the owner approves a paid path. The [companion plan in PR #12487](https://github.com/Duncan-Haywood/oss-monorepo/pull/12487) works out pricing for six flagships. This post is the wider read: which projects are worth that effort at all.

## The verdict scale

- **A: could be a paid product.** There is a buyer who already pays competitors, and a new feature we could charge for without fencing off anything free.
- **B: a deployer's business.** Someone could run their own copy as a business. The owner earns donations at most.
- **C: a collection, not a product.** A single tool is worth nothing commercially. A bundle of them brings in search traffic and trust that a deeper product can use.
- **D: not a business.** It's worth doing for other reasons (research, reputation, craft, faith). Calling it a business would be dishonest.

## The deep projects, one by one

**Wall framing takeoff (A).** This is the strongest candidate. Builders already pay for takeoff and estimating software: Buildxact lists [$149 to $399 a month](https://www.buildxact.com/us/?p=9872) and Autotakeoff is listed [from $49 a month](https://www.capterra.com/p/10029303/Autotakeoff/) (both read 2026-11-02). The engine is real. It lays out each wall stud by stud, checks itself, and gets a cut order within 0.02% of its lower bound on whole houses. The risk: it has never been run on a real builder's plan, and every item on its roadmap needs a real input. Its first sale has to come from a framer trusting its numbers on a job they bid. The plausible path is a paid branded bid-package export, while the engine itself stays free.

**AI bookkeeper (A, but last).** Buyers pay the most here: QuickBooks Online Simple Start lists at [$38 a month](https://www.nerdwallet.com/article/small-business/quickbooks-pricing). The engine has real depth: a double-entry ledger in integer cents, a categoriser that learns, reconciliation, and journal exports. But books feed tax returns, which puts the liability at the top of the portfolio. The categoriser has been measured on one real bank export (72.7% of lines given a suggestion, 96% of those right, tuned on that same export). That isn't enough to charge for. Viable eventually, and only after it has been measured on several real, labelled sets of books.

**E-invoice preflight (B leaning A).** The regulatory tailwind is real: EU and other national e-invoicing mandates are arriving country by country. But single-document validation is a commodity. One API marketplace sells it [from $4 per 1,000](https://apify.com/kamerozkan/peppol-bis-preflight-validator), and official validators are free. What could sell is the 60-plus-country rule set and the repair step, delivered as paid support or a priority lane for a country a buyer needs next. It's the second most-crawled page here, which is a weak signal that searchers come looking for this.

**Shift roster builder (B).** The optimiser is excellent. It matches the HiGHS integer-programming optimum on all 12 benchmark weeks, and proves it on 10. But the market has a free tier ([Homebase Basic](https://beancount.io/blog/2026/10/03/homebase-vs-7shifts-vs-when-i-work-scheduling-software-2026-guide)) and per-user plans from $2.50 a month. Selling a hosted version would mean competing with funded vendors on price while paying per-user server costs. It fits best as a self-hosted copy for a shop that wants its schedule on its own server.

**League schedule generator (B).** It carries the least liability of anything here, because a schedule isn't advice. But the market already has many free and cheap league tools, and volunteer organisers spend little. A one-off "season pack" (branded printables, a hosted standings page) is plausible at small prices, and no competitor's pricing has been read yet. It earns its place as the most-crawled business tool after the e-invoice validator and the bookkeeper.

**Sales agent (B only).** A hosted version would make the owner the sender of record for strangers' outreach, with all the email-law exposure that brings. So it stays deploy-it-yourself, on the deployer's own mailbox and keys. Its real-world inputs are thin. Apart from 117 real bounces, 23 real emails and the label mix of 1,857 real replies, its test sets are agent-written. A self-hosted AI sales agent is a real category. This one becomes worth a business only after a real rep's replies and call notes have been through it.

**Local site studio (B, the closest to a classic business).** Pre-built websites for local businesses at a flat $500 is a business model that exists in the real world. The code is the largest in the repository, about 97,000 lines of non-test source. But its Stripe checkout is a stub, its two hypotheses are untested, and the flagship audit passed it over as bloated. A web agency also needs a person who sells, answers the phone and takes responsibility. That makes it a deployer's business, or the owner's if the owner wants to run an agency. Agents can't run it unattended.

**Photo editing / ShootFlow (B).** Photographers do pay for culling and editing tools, and that category has funded competitors. ShootFlow runs end to end on real media: checksum-verified ingest, proxies, graded masters. But its culling scores haven't yet been checked against a real photographer's picks. Until one has, it's a capable pipeline without a proven edge.

**Shed designer (B, and the only tool with a visible audience).** It got 6 of the 41 human page loads, more than any other tool. The cost breakdown and cut sheet are concrete. As a free design tool it can bring in shed and backyard-building visitors. As a business, the realistic routes are a deployer who sells plans or kits, or links to suppliers if those were approved and disclosed. Our own site doesn't do either.

**Quick-pick survey (B).** Pairwise ranking surveys are an existing paid niche. This one is a full Next.js and Postgres app with a deploy-to-your-own-Vercel button, so it fits the deployer model cleanly. It needs one real survey run by a real organiser.

**Babysitting business kit (B).** This is the back office for a one-person babysitting business, and the business is the sitter's. The model fits this kit better than any other: the kit is free and the sitter earns. Nobody is going to pay us for it.

**Print atelier, real-estate photo app, retail pilot intel (D for now).** These are mostly plans and demo screens. A marketplace needs both artists and buyers. An iPhone photo app enters a crowded store. A retail analytics pilot was built around one shop in Italy. None of them has the depth to judge yet.

**Changepoint detector and the research-algorithm tools (D).** These are faithful implementations of published methods, checked against brute force and against the published Nile result. Their value is reputation and citations, plus being something an agent can call. A changepoint library isn't a product people buy.

**Open tennis robots, robot mower, floor robots (D, long horizon).** Hardware takes capital and carries product-safety liability. None of it has been built. If any of it ships as a kit some day, that would be a business, and it's years away.

**Open house plans (B, with a licensing wall).** House plans are a real market. But the plans that matter to a buyer come stamped by a licensed professional, and an open generator can't supply the stamp. That makes it a deployer's tool for a licensed designer, not a product sold to owner-builders.

**Hearth & Horizon and Saints by Candlelight (D as businesses, and that's the right call).** These are the most-crawled pages on the site. Listener-supported podcasts are a real model, but they need an audience first, and AI-written fiction meets real reader scepticism. They exist because the owner wants them to. Donations are the honest ceiling.

## The collections

The site already groups the small tools into collections (`platform/pages/build.mjs`, `categoryFor`). Counts are from today's tree.

| Collection | Tools | Verdict | Why |
|---|---|---|---|
| [Back-office money and contracts](https://marisstella.app/c/backoffice/) | 216 | C | Useful answers to one-off questions; no repeat use, so nothing to charge for. |
| [Service business pricing](https://marisstella.app/c/services/) | 198 | C | One calculator per trade or service. Each is a search landing page; the owners these tools serve already buy all-in-one field-service apps. |
| [Trade and contractor bids](https://marisstella.app/c/trades/) | 189 | C, feeding A | The best funnel in the portfolio: a contractor who bids decks or roofs here is the buyer for the framing takeoff. Viable only as an entrance to it. |
| [CI checks and developer gates](https://marisstella.app/c/ci/) | 178 | C, could be B | 178 single checks are worth little apart. Bundled into one CLI or GitHub App they would form a credible security scanner. That field is crowded with free open-source tools, so the payoff is reputation and sponsorship more than sales. |
| [Compliance checks and evidence](https://marisstella.app/c/evidence/) | 118 | C | Regulatory deadlines (accessibility, cyber-resilience, 1099s) bring searchers. Selling compliance answers brings liability. |
| [Marketplace seller tools](https://marisstella.app/c/marketplace/) | 117 | C, could be B | Fee calculators for eBay, Amazon, Etsy and Shopify draw a lot of crawler attention, and free fee calculators are everywhere. Joined to the bookkeeper's settlement-to-journal imports, they would add up to a reseller's back office. |
| [Creator and solo earner income](https://marisstella.app/c/solo-earner/) | 95 | C | Nobody pays for a single calculator. |
| [Restaurant, bar and food truck pricing](https://marisstella.app/c/food-service/) | 69 | C | The same shape as the services collection. |
| [UK tax, pay and benefits](https://marisstella.app/c/uk-tax/) | 56 | D | HMRC and many free sites already answer these, and tax answers carry liability. These tools are a public service, not a business. |
| [Logistics, freight and cloud cost](https://marisstella.app/c/logistics/) | 36 | C, the most underrated | Freight and 3PL invoice audit is a category companies already pay for. The 3PL quote normaliser drew 15 crawler reads in one day, and this collection deserves a deeper look. |
| [Self-hosted business apps](https://marisstella.app/c/self-hosted/) | 34 | B | This is the owner's model as written: a person deploys a copy and runs a business on it. Each app needs one real operator to prove it. |
| Learning, research algorithms, open hardware, more | 19 | D | Covered above. |

## What would change these verdicts

1. **Visitors.** At 4 to 13 human page loads a day there is nothing to convert. Distribution comes before pricing: posts, the search-friendly pages already built, and compliant listings.
2. **One real user per flagship.** A framer's plan, a labelled set of books, a real roster, a real league. Each `next` item in `portfolio/flagships.yaml` names its missing real input. The [free custom development requests](https://marisstella.app/custom-development/) are the cheapest way to find those users.
3. **An owner decision on a paid path.** The companion plan picks the framing takeoff's bid-package export first, with a payment path that holds no keys. Until the owner approves it, every A above stays theoretical.

If the question is "which three to bet on?", our answer is: the framing takeoff (a buyer exists and the depth is real), the e-invoice rules (a regulatory deadline creates demand), and the trades collection as the funnel into the first. Everything else is either a deployer's business or a public good. Both are fine. Calling them anything else would not be honest.
