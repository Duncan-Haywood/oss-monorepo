---
title: "Cost-plus software for regional small businesses: what 18 trades struggle with, and what the prices say"
seo_title: "Cost-plus software for small local businesses"
date: 2026-11-24
tags: [small-business, pricing, strategy, compliance, research]
description: "Pain points, incumbent prices and required records for 18 regional trades, and a cost-plus suite priced from them. Support time, not compute, sets the price."
---

We are changing what we offer small businesses. Free tools stay. The new
offer is a suite of software built for one kind of local business: the
HVAC shop, the pest-control route, the brewery, the property manager with a
few hundred doors. It is sold at what it costs us to run each shop's share,
plus a stated margin, and it keeps the records their regulator asks for. It
is aimed at regional, owner-run firms of roughly 1 to 50 people. It is not
for chains or enterprise buyers. The offer itself is in
[`portfolio/smb/OFFER.md`](../../portfolio/smb/OFFER.md).

Before building anything, we wanted to know two things: what these
businesses struggle with, and whether "close to cost" can pay for itself.

## What 18 trades struggle with

Three research passes collected, for 18 regional verticals:
- the pain points owners and their trade groups report;
- the software they use and what it lists at;
- the records a rule makes them keep.

The result is 114 pain points, 73 rules and 72 products, each with a link, in
[`verticals.yaml`](../../portfolio/smb/verticals.yaml). One caveat first:
every item was read from search-result summaries, not from the pages
themselves, and many sources are vendors. It is a map of where to look
harder, not a set of facts to quote. The reading is in
[`VERTICALS.md`](../../portfolio/smb/VERTICALS.md).

Four things came up again and again:

- **Labour is the top pain, and software can't fix it.** It ranks first or
  second in 14 of the 18. What software can do is stop the existing staff
  losing time to the phone, the paperwork and the chasing.
- **The front desk is overloaded.** Missed calls, after-hours calls,
  insurance checks and repair authorisations look alike across trades, and
  software solves them well.
- **Every trade keeps records a rule requires.** Examples: refrigerant
  leak-repair records under the AIM Act from 1 January 2026, state
  pesticide-use records, TTB brewery reports, trust-account reconciliations
  for property managers, and the FTC Funeral Rule price list. They are logs,
  not judgement calls, and one records engine can serve them all. The record
  is also why a shop keeps paying: it must be kept whatever else the shop
  buys.
- **The firms are tiny.** Averages run from about 1 to 6 employees in the
  trade data we found. The owner sets up the software alone, usually on a
  phone.

Because the same modules recur (booking, estimate to invoice to payment,
records, routes, staff schedules), the plan is one core with a thin trade
layer on top. Four trades go first:
- HVAC, plumbing and electrical;
- pest control;
- craft beverage;
- property managers with 20–500 doors.

Each has a mandatory record. Each also has incumbents that are quote-only,
have minimum spends, or don't do that trade's records. The property-manager
case is the clearest: the published tiers we found carry a $199 monthly
minimum or a roughly 50-unit minimum. Those floors price out exactly the
small regional manager we want to serve.

## What the price arithmetic says

[`cost_plus.py`](../../portfolio/smb/cost_plus.py) prices a suite per shop
from [`cost_basis.yaml`](../../portfolio/smb/cost_basis.yaml). Every line
there is tagged:
- `published` (Paddle's 5% + 50¢, Cloudflare's $5 minimum, the model's
  per-token price);
- `measured` (none yet);
- `assumption` (everything else, each with its reason).

The report says what share of each price rests on assumptions. Today that is
all of it, because no shop is live. The dollars are placeholders. The shape
is not, and it turned up two things we did not expect.

**Support time, not compute, decides the price.** Model tokens and hosting
come to about $3–6 a shop a month. Half an hour of support at the
placeholder rate is $37.50, about 90% of the variable cost. So the margin is
made in onboarding that needs no help and support that answers itself. The
choice of model or host matters much less.

**Pure cost-plus grows slowly.** If the price is recomputed every time a shop
joins, the shared cost spreads thinner, the price falls, and so does the
profit per shop. On the placeholder numbers, 250 home-services shops earn
under $6k a month that way. So each price is set once, at a planned shop
count, and held there. Later savings go into the shared core and the next
trade, and the cost lines stay published, so a customer can see why the price
is what it is. At held prices the four first suites need roughly 125–200
shops each to reach $10k of monthly profit together.

## What we will and won't say about compliance

"We handle compliance" is the owner's phrase, and it needs care. The suite
can keep the records a rule requires and remind people before a deadline.
It can draft the report the rule asks for, link each feature to the rule
behind it, and update itself when the rule changes. It cannot make a business
compliant, certify anything, or give legal advice, and its pages will say
so.

## What is next

Open every cited source and confirm it. Pull county-level business counts,
since this is regional selling. Then build the shared core with the first
trade's records engine, in the private repository where the paid products
live, with a checkout that stays switched off until the owner turns it on.
