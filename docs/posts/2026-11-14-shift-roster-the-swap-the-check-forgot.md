---
title: "The swap the call-out check forgot, and why fixing it made a café worse"
seo_title: "Covering a sick call: when the person who called out can take a later shift"
date: 2026-11-14
tags: [shift-roster-builder, product, measurement]
description: "A cheap check for 'could anyone cover this call-out?' never let the caller take a later shift. Fixing it sharpened the count, and on a short-staffed café it showed where one-at-a-time thinking breaks."
---

[Shift Roster Builder](https://marisstella.app/shift-roster-builder/) has an optional setting, "Pay for call-out slack". You give it a price per hour, and it will give up a little pay or fairness to make the week easier to patch when someone calls in sick. To do that inside the search it needs a quick way to ask, for every person and every day they work: if they called out, could someone else take the shift? The honest answer comes from rebuilding the week once per person-day, which takes about a second each. So the search uses a cheap stand-in check and keeps the slow one for measuring.

On the made-up sample café, the cheap check flagged 23 person-days as at risk, but the slow rebuild found only 11 that actually left a shift open. Earlier write-ups put that gap down to rebuilds that "move many shifts".

## What the rebuild was really doing

I rebuilt each of the 23 days and printed what moved. Most of the moves were noise: two copies of the same 6am shift swapping holders. With that netted out, a lot of the covered days came down to one move the cheap check had ruled out.

Dev calls out on Saturday. Gus could take Saturday, but he is at his weekly hours cap. So Gus takes Saturday and gives his Sunday shift **to Dev**. Dev is only off on Saturday, and Sunday is fine for him.

The rebuild had always been allowed to do that. The cheap check's hand-over chains never offered the caller a shift. Now they do: the caller's call-out day comes off their list, and a chain may hand them a shift on any later day.

## Sharper, and still never too optimistic

Over 202 person-days (five sample teams and three seeded 20-person weeks), against the slow rebuild:

| check | days flagged | really open | missed |
|---|---|---|---|
| before | 72 | 68% | 0 |
| caller may take a later shift | 66 | 74% | 0 |

On the retail and clinic samples the count now flags exactly the days that open. It still never calls a day safe that the rebuild couldn't cover. On 40- and 60-person weeks it made no difference to the result or the time.

## Then the café got worse

With the sharper count, the price now finds three hand-overs on the café that cost nothing (they tie at the same score). They cut the single-call-out exposure from 100 hours to 92. That looks like a free win.

Then I played 20 seeded whole weeks of call-outs at one real firm's rates, with each reissue keeping as much of the posted week as it could:

| café | open hours added | changes to others | premiums |
|---|---|---|---|
| 1% sick-only, default → priced | 8 → 16 | 24 → 8 | $425 → $149 |
| 8.4% all leave, default → priced | 155 → 188 | 77 → 63 | $1,392 → $1,116 |

Fewer people got moved and less premium was paid, but more hours ended up open. The café is already short-staffed, with 15 hours open before anyone calls out. Making each single call-out easier to cover spent the same slack the second call-out of the week needed. The exposure measure scores call-outs one at a time, and a real bad week brings several.

So the setting stays off by default, and the trade is the manager's to make. The next piece of work is to price the risk of a second call-out in the same week.

## What this does not show

Every team here is invented, and the call-out rates come from one firm's file. The slow rebuild is itself a model (5pm-the-day-before notice, keep the posted week where possible), not a real week. Full numbers, scripts and outputs are in the venture's README under "The caller can take a later shift".

*A planning aid, not legal or payroll advice.*
