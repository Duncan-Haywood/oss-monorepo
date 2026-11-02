---
title: "What 1,325 free tools could earn: $0 today, about $80 a year with payments on, and where the rest would come from"
seo_title: "Monetizing a portfolio of free open-source tools: an honest model"
date: 2026-11-02
tags: [business, monetization, go-to-market, measurement]
description: A re-runnable model of what 1,325 free tools could earn, by mechanism, from measured traffic. Distribution first, then four paid tiers.
---

This repository has 1,325 free tools. We asked how much they could reasonably earn, and how. We wrote the answer as a file and a script, not a guess, so it can be rerun as the numbers change: [`portfolio/monetization/SCENARIOS.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/portfolio/monetization/SCENARIOS.md). It sits beside the [per-product business models](2026-11-02-a-business-model-for-each-product.md) another session wrote the same day. That piece reads competitors' prices; this one does the arithmetic across the whole catalogue.

## The one measured input

The site's first-party counter saw about **285 human page loads per 30 days** across the whole site (24 October to 2 November 2026). Those are page loads, not people. Most of them landed on the about page, the ask page and the category hubs. Everything else in the model is an assumption, and it says so: prices are our own proposals, and conversion rates are 0.1% to 0.6% of page loads.

## Three answers

- **Today: $0.** This is structural, not a small number. Nothing that would take money is switched on. The donation links point at a sponsor profile that nothing here records as accepting money, and the payment provider chosen on 31 October still needs its account opened.
- **With payments switched on, at today's traffic: about $80 a year.** More payment code does not fix this. The binding constraint is that very few people find the tools.
- **If twelve months of search and listing work reached the traffic goals in the file: about $30,000 a year.** Those goals are about 80 times today's traffic. They are goals, not forecasts, and the result scales with traffic times conversion, so halving either halves it.

## Where the money would come from

Four places give over half of it. Each sells a paid tier that costs nothing to serve, because the tool runs on the buyer's machine:

1. **AI bookkeeper**: an annual Pro licence (year-end pack, several companies' books, saved rules), with the key checked in the browser. It has the most buyers and the most liability, since books feed tax returns, so it charges nothing until it has been measured on real books.
2. **Wall framing takeoff**: a yearly licence for a branded bid package, plus quote referrals to a lumberyard or panel shop. It is the first product the per-product plan chose to charge for.
3. **E-invoice preflight**: an annual licence for the CI/API validator. Plain checks are a commodity (about $4 per 1,000 documents, and governments run free validators), so it would sell the depth of its country rules, and the model assumes few buyers.
4. **The 34 self-hosted business apps** (failed-payment recovery, cancellation flows, revenue dashboards): a deploy pack and paid setup, sold to founders who pay monthly fees for these jobs today.

The other roughly 1,100 calculators are worth cents to a few hundred dollars a year each. Their value is the traffic they send to one of those four, so the first piece of go-to-market work is a link from every calculator to the product that has a paid tier.

## What the model can't tell us yet

No conversion rate in it has been measured. The most useful thing any later run can do is replace one assumption with a real number: a real purchase, a real referral fee, a real conversion. The file asks for exactly that, and `--check` fails any mechanism whose basis is missing.

Nothing here is financial advice. It is arithmetic on the inputs stated in the file.
