---
title: "Pay applications: the monthly paperwork subcontractors pay to escape"
date: 2026-11-24
tags: [construction, subcontractors, billing, retainage, lien-waivers]
description: "What a monthly pay application involves for a trade sub, what billing tools charge today (sourced), and the product we are building. In development."
---

Specialty subcontractors on commercial jobs (electrical, mechanical, drywall,
concrete) get paid through a monthly document most people outside
construction have never seen. This post is about that paperwork, what people already pay to make it easier, and the
product this portfolio is building for it. That product is **in development**.
It is not for sale and has no customers yet.

## The problem

On a commercial job, a subcontractor does not send an invoice for the work.
They send a **pay application** to the general contractor (GC), usually on an
AIA G702/G703-style form or the GC's own version of it, by a fixed date each
month. It has two parts:

- **A schedule of values:** every line of the contract (say "rough-in, level
  2" or "taping and finishing"), its value, what was billed in earlier
  periods, what was completed this period, materials stored on site, the
  percent complete and the balance to finish.
- **A summary page:** the contract sum plus approved change orders, total
  completed to date, the **retainage** held back (often 5% or 10% of what is
  billed, released at the end of the job), what earlier certificates already
  paid, and the payment due now.

Around it sit the jobs that make it slow:

- **Change orders.** Approved ones go on the schedule; pending ones must not,
  but have to be tracked so they get billed when approved.
- **Lien waivers.** GCs often want a waiver with each pay app: A
  conditional waiver for this month, unconditional for last month's money
  once it clears, and the wording matters, because signing the wrong one
  can give away rights to money not yet received.
- **Retainage.** Five or ten percent of every bill sits with the GC until
  closeout, often months later. Someone has to track how much is held on
  each job and ask for it back.
- **Accounting sync.** The bill then goes into the books, and QuickBooks
  has [no native retainage](https://getholdings.com/resources/guides/best-invoicing-software-contractors)
  (per a vendor guide), so many subs keep a spreadsheet beside it.
- **Every GC wants it differently.** Some use a portal from Procore or
  Trimble, some a PDF, some their own spreadsheet.

Mistakes cost time and cash: a pay app with a line billed over its value
can be sent back for correction, and one that misses the GC's cut-off can
wait for the next cycle.

## What people pay today

Prices are as listed by the sources linked, several of them aggregator sites.
Check the vendor's own page before comparing.

| Tool | What it is | Price |
|---|---|---|
| PayAppHub | pay apps for subs | [$39.99 / $79.99 / $129.99 a month](https://toolradar.com/tools/payapphub) |
| Trimble Pay (formerly Flashtract) | billing and waivers | [sub plan $99 a month](https://www.g2.com/products/flashtract/pricing) |
| SubLien | lien and waiver management | [from $199 a month](https://www.saasworthy.com/product/sublien/pricing) |
| Siteline | pay apps for subs | quote only, priced by pay-app volume ([Siteline](https://www.siteline.com/compare/procore)) |
| Knowify | contractor management | [from $99 a month](https://www.capterra.com/p/135791/Knowify/pricing/) |
| Contractor Foreman | contractor suite | [$49–$332 a month](https://www.capterra.com/p/166113/Contractor-Foreman/pricing/) |
| JobTread | contractor suite | [$199 a month + $20 a user](https://jobtread.com/blog/jobtread-vs-buildertrend-construction-management-software-comparison) |

Investors think the problem is worth solving: Siteline raised
[$18.4M](https://www.businesswire.com/news/home/20220224005099/en/Siteline-Raises-$18.4M-to-Reimagine-Construction-Finance)
to sell this to subcontractors. And the market is large and small-business
heavy: NAHB counts
[1.9M+ specialty-trade independent contractors, 79% of specialty-trade establishments](https://eyeonhousing.org/2025/08/most-home-builders-are-small-businesses/).

There is also some churn coming among residential tools: CoConstruct is being
folded into Buildertrend, with
[no new CoConstruct projects after 31 March 2027](https://coconstruct.com/migration).

## What we are building

Ranked first of the paid bets in the
[market research](2026-11-24-what-small-businesses-already-pay-for.md), the
plan is a billing product for specialty subcontractors and small GCs that
does four jobs together:

1. **Pay applications** from a saved schedule of values, carried forward
   month to month, with checks for over-billing and front-loading, and
   output in the formats GCs ask for.
2. **Retainage** tracked per job and per line, with what is held, what is
   due for release and when to ask.
3. **Lien waivers** generated with each pay app and checked for wording that
   releases more than the payment covers.
4. **Change orders** tracked from pending to approved, so approved ones land
   on the next pay app.

QuickBooks sync is needed from the first version, because that is where the
money ends up. Later modules are meant to grow it into a contractor suite:
job costing, RFIs, estimating.

The working price range in our notes is about $99 to $249 a month. That is
an estimate from the competitor prices above, not a decided price. The paid
product is built in a private repository; the free tools stay open source.

## What exists now, free

Three parts of the job already have free browser tools on this site. They
are the starting point, not the product:

- [Pay Application Generator](https://marisstella.app/pay-application-generator/):
  paste a schedule of values and get the summary, retainage, payment due and
  flags for over-billed or front-loaded lines.
  ([source](../../ventures/pay-application-generator/README.md))
- [Lien Waiver Checker](https://marisstella.app/lien-waiver-checker/): paste
  a waiver and see common wording that costs the signer money.
  ([source](../../ventures/lien-waiver-checker/README.md))
- [Construction Retainage Calculator](https://marisstella.app/retainage-cashflow-calculator/):
  the cash tied up in retainage and what waiting costs.
  ([source](../../ventures/retainage-cashflow-calculator/README.md))

None of these is the AIA's form, none is affiliated with the AIA, and none is
legal or accounting advice. Retainage, waiver and payment terms come from
your contract and your state's law.

## Early access

If you run a subcontracting or small GC business and bill on pay
applications, we would like to hear how you do it now: which GCs, which
formats, what goes wrong. Email **hello@marisstella.app** with "pay apps" in
the subject. Be aware that the inbox is read by AI agents working on this
project, with the owner responsible for it. There is no list to join yet and
nothing to buy; when there is something to try, the people who wrote in will
hear first.

*Written by an AI agent working in this repository, with the owner steering.
Prices and counts are as reported by the linked sources on or before
2026-11-24.*
