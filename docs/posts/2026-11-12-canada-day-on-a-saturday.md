---
title: "Canada Day on a Saturday is a Monday off"
seo_title: "Canadian federal holidays in a sales call queue, and how far checked"
date: 2026-11-12
tags: [sales-agent, product, holidays]
description: "Sales Agent's days off now include Canada's federal holidays. They match 85 of 85 dates on a second source; canada.ca itself still has to be checked."
---

Earlier today, [Sales Agent](https://marisstella.app/sales-agent/)'s Today's queue learned to skip US holidays and then UK bank holidays, checked against GOV.UK. The UK post ended on Canada, which was waiting on canada.ca. canada.ca still times out from our build machine. This post covers what we could do anyway, and how far it is checked.

## The preset

`ca` covers Canada's twelve federal holidays. Ten are the Canada Labour Code's general holidays: New Year's Day, Good Friday, Victoria Day, Canada Day, Labour Day, the National Day for Truth and Reconciliation, Thanksgiving, Remembrance Day, Christmas and Boxing Day. The other two, Easter Monday and the Civic Holiday, are days the federal public service also gets. Victoria Day is the Monday on or before 24 May. Easter comes from the same computus the UK rules use.

The weekend rule follows the UK, not the US. A Saturday holiday moves to the Monday after, not the Friday before. Canada Day 2028 falls on a Saturday, so the day off is Monday 3 July. The US rule would mark Friday 30 June as the day off instead. A call missed on Thursday the 29th would then skip Friday, when the office is open, and come back on Monday the 3rd, when it's closed. That's wrong both ways.

## How far it is checked

The UK presets match all 280 dates in the government's own file. We couldn't do that for Canada. Instead, `ca` is compared with the 85 observed dates that canada-holidays.ca lists for 2022 to 2028. It matches every one, including the one-off 2022 Day of Mourning for Queen Elizabeth II. canada-holidays.ca is a well-kept open-source site, but it isn't the Government of Canada. The code, the README and the fixture file all say so, and the government check stays on the to-do list. Provincial holidays aren't included yet, so Ontario's Family Day and Quebec's Saint-Jean-Baptiste are still missing.

## Seeing what a preset means

A code like `ca` or `gb-nir` doesn't tell you which days it covers. The self-hosted page now shows the next five days off by name, under the Days off field. The list appears when the page loads and updates after each build. With `ca, 2026-10-30` it reads:

> Next days off: 2026-10-30 day off; 2026-11-11 Remembrance Day; 2026-12-25 Christmas Day; 2026-12-28 Boxing Day (observed); 2027-01-01 New Year's Day.

`HOLIDAYS` is now in the Render, Fly and Docker Compose files too. A one-click deploy asks for it, so you don't have to add it afterwards.

Next is the prospect's side of the call. A rep in Toronto calling Leeds needs both countries' days off, so each prospect should get a country. As always, nothing is sent without a click. The code is MIT licensed in [`ventures/sales-agent`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sales-agent).
