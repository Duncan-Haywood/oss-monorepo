---
title: "Most of the fleet now builds for small businesses, nonprofits and parishes"
seo_title: "Small business and nonprofit software suites: the new main theme"
date: 2026-11-21
tags: [smb, nonprofits, parish-office, direction, routing]
description: "About 60% of agent runs now go to suites for small businesses, nonprofits, parishes and Catholic charities, revenue work first."
---

Until today, about a quarter of the scheduled agent runs in this repository
went to products, a quarter to research, and the rest to process, red team,
creative work, polish, performance and quality audits. Today the owner moved
the centre of gravity:

> "I want to move a lot of the dev work towards for-profit tools for small and
> medium businesses ... full suites of tools for all of the most common
> problems ... Also for nonprofits like parishes, especially Catholic
> charities ... I want to move like probably 60 to 70% of the effort there."

## What changed

A new routing track, `smb`, draws about half of runs: 58% as first set, then
52% later the same day, when the owner widened the change into a pivot to paid
products and gave construction and deep tech 20% beside it. Making room meant
cutting the others: research from 27% to 8%, creative work from 10% to 2%,
and the process, free-choice, red-team, performance, polish and quality
shares to between 2% and 5% each. A message that names
small businesses, nonprofits, parishes or Catholic charities now routes to the
track, ahead of the older "revenue means ventures" rule.

## What gets built, in what order

The ordering rule comes straight from the owner's message: work that brings
money in comes first, then work that cuts costs. For a business that means
leads answered, quotes won, invoices paid, past customers brought back. For a
charity it means donors kept, grants found and won, and the reports funders
pay on. Then come the books, payroll prep, scheduling and vendor bills.

The unit of work is a **suite**, meaning one product a firm could run part of
its operation on. Each suite has a shared data model, imports from whatever
spreadsheet the firm uses now, and comes in hyper-niche editions for one trade
or kind of organisation. The first queue, in
[`portfolio/smb/suites.yaml`](../../portfolio/smb/suites.yaml):

1. **A research baseline.** The problem ranking in the programme is a first
   cut reasoned from how an ordinary firm runs. It has not yet been checked
   against survey data. The first slice fetches the Census, NFIB, Federal
   Reserve and IRS 990 numbers and reorders the queue by what they say.
2. **The parish office**, next with the two-counter Sunday collection sheet
   and then contribution statements.
3. **Lead to booked job** for home-services trades.
4. **Get paid**: invoices, deposits, ageing and a collections ladder.
5. **Donor CRM**, **grants**, and a local-first **Catholic Charities agency**
   suite for intake, service logs and funder reports.

The portfolio already holds about 1,400 small tools, and many of them are a
module waiting for a suite. By folder name there are 28 invoice and
collections tools, 27 for booking and scheduling, 24 for sales, leads or
email, and 12 with nonprofit, giving or religious names. Composing those comes
before writing anything new.

## Cost plus, and who sends the email

The owner asked for SaaS at cost plus, and later the same day settled how:
the company hosts the suites and prices them at about twice the measured cost
of serving one customer. Free trials and lead magnets stay. The companion
post, on the wider pivot to paid products, has the rest.

Outreach to find real problems is welcome where the law allows it. Agents
build lists from public sources and draft one-to-one emails and call scripts
that follow CAN-SPAM and the TCPA, plus stricter rules abroad. A person sends
them. The free website-request form remains the best discovery channel,
because there a firm tells us its problem without being asked.

The programme in full: [`portfolio/smb/README.md`](../../portfolio/smb/README.md).
