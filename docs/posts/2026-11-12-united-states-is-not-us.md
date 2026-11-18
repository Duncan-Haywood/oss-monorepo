---
title: "\"United States\" is not \"US\": how a holiday calendar got lost between a CRM export and the call queue"
seo_title: "Country names vs codes in a sales call queue"
date: 2026-11-12
tags: [sales-agent, ventures, redteam]
description: "A prospect whose CRM row said \"United States\" got no holiday calendar, so the call queue left a call on Thanksgiving. Found by a red-team run."
---

Earlier today the [sales agent](https://marisstella.app/sales-agent/) learned to skip the *prospect's* days off, not just the rep's. Put a `holidays`, `region` or `country` column on a prospect row and a call due on their holiday moves to their next working day. A Quebec prospect isn't called on Saint-Jean-Baptiste, and a US one isn't called on Thanksgiving. The [earlier post](2026-11-12-whose-holiday-is-it.md) covers the calendars.

A red-team run, which seeds faults into the code to see whether the tests notice and then reads it the way an attacker would, found a gap in the plumbing.

## The bug

The daily run read `country` as a two-letter code only. `US` worked. `United States` didn't, and neither did `USA`, `Canada`, `United Kingdom` or `Scotland`. They named no calendar, so the call stayed on the holiday.

Two-letter codes are what you type in a test. A CRM export usually has names. HubSpot's Country/Region field holds "United States". Apollo and LinkedIn exports write the name too. So a rep who did the sensible thing, exporting their list and adding nothing, got none of this morning's feature for their US and Canadian prospects.

The odd part: **call prep didn't have the bug.** The brief a rep reads before dialling takes the country from the CRM export through the research module's name map, so "United States" became `US` there. The brief could say "Thursday is Thanksgiving for them" while the queue put the call on Thursday anyway. Two parts of one product read the same column two different ways.

## The fix

Names now map to the same calendars as the codes:

- `United States`, `USA`, `U.S.`, `America` → the six days most US businesses close (`us-business`), same as a bare `US`
- `Canada` → the federal list (`ca`)
- `United Kingdom`, `Great Britain`, `England`, `Wales` → England and Wales bank holidays
- `Scotland` → Scotland's own list, which keeps 2 January and St Andrew's Day
- `Northern Ireland` → its own list, with St Patrick's Day and the Twelfth

That last pair goes beyond what call prep did. Its name map turns Scotland into plain `GB`, which is England's calendar. A country with no calendar here (`France`, say) still changes nothing rather than raising an error, because a prospect list carries every country there is.

The test went in first and failed on the old code. One assertion checks the behaviour a rep would see: a prospect in "United States" is off on 26 November 2026, and one in "Scotland" is off on 2 January while one in "England" isn't.

## What the seeded faults said

The run seeded 24 small faults into three files of the sales agent: the holiday calendars, the daily queue and call prep. These were one-character changes like `<` to `<=` or `0` to `1`, each run against the existing tests. 14 were caught. Four of the 10 that got through turned out to change nothing a user could see. One example is a sort comparator returning 2 instead of 1, since sort only reads the sign. Another is a regex alternative made redundant by an earlier one.

The other six were real holes, now each pinned by a test:

- **Tie between two slipped calls.** If two calls each run a day late, the later steps should say the *first* one moved them.
- **Same-date steps out of file order.** They are still walked in step order, so a step listed above the retried call still moves with it.
- **The `later` count** in the queue summary.
- **Call prep's quote** of what the prospect wrote starts at their first sentence, not their second.
- **A call logged with a time** (`2026-10-22T15:04:00Z`) shows as a date in the brief.
- **The "nothing on file" warning** stays off for a prospect we know about but haven't called yet.

With those tests in, all 20 behaviour-changing faults are caught.

The calendars carry the checks the earlier posts describe: UK dates against GOV.UK's own file, Canada's against a second source, US rules not yet against OPM. Every test here runs on hand-written rows, not a real rep's list. The tool sends nothing by itself.
