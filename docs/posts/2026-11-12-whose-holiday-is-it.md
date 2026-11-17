---
title: "Whose holiday is it? Canada's thirteen calendars and the prospect on the other end of the call"
seo_title: "Canada provincial holidays as rules, and a prospect's day off"
date: 2026-11-12
tags: [sales-agent, ventures]
description: "Call retries skipped the rep's holidays, not the prospect's. Canada's 13 provincial calendars as rules matched 855 of 855 published dates."
---

The [sales agent](https://marisstella.app/sales-agent/) builds a rep's day: the calls, emails and LinkedIn touches due, minus anyone who asked to stop. Earlier today it learned to skip days off. A call that rang out on the Wednesday before Thanksgiving comes back on Friday, not Thursday. The presets covered US federal holidays, UK bank holidays (checked against GOV.UK's own file, 280 dates) and Canada's federal list.

That still left two holes. Both are about *whose* day off it is.

## Canada has fourteen calendars, not one

The federal list is what banks, airlines and telecoms follow. Most offices follow their province's employment law instead. Call a Montreal firm on 24 June and you get Saint-Jean-Baptiste, a holiday the federal list doesn't have. Call Toronto on the third Monday of February and you get Family Day. Manitoba keeps the same Monday as Louis Riel Day, Nova Scotia as Heritage Day, Prince Edward Island as Islander Day. The four Atlantic provinces skip Victoria Day. Ontario, Quebec, Manitoba and Nova Scotia don't treat Remembrance Day as a general holiday.

So the agent now has thirteen more presets, `ca-ab` to `ca-yt`, written as rules rather than pasted tables, so there's no final year. We checked them against the dates canada-holidays.ca publishes for every province and territory from 2022 to 2028: 855 dates across 91 province-years. All 855 matched on the first run. That site is an open-source project, not a government. canada.ca refused our connection again, so the government check is still open, and the README says so.

Two of the 855 can't come from a rule, and they're worth naming:

- **Newfoundland and Labrador** moves its own holidays (St Patrick's, St George's, Discovery Day, Orangemen's Day) to the *nearest* Monday. That works until a Friday. St George's Day on Friday 23 April 2027 goes forward to the 26th. But St Patrick's Day on Friday 17 March 2023 went *back* to Monday the 13th, four days off rather than three. The published list repeats that for 2028. We wrote the exception in as an exception and flagged 2028 as the next test of it.
- **Regatta Day** in St. John's is the first Wednesday of August, unless the regatta committee picks another day (30 July in 2025) or the weather moves it on the morning. No calendar can promise that one.

## The other end of the line

The bigger hole: the days off were only the rep's. A rep in Denver with a Quebec prospect would happily call on Saint-Jean-Baptiste.

Now a prospect row can say where they are. You can use a `holidays` column in the same form the rep's setting takes (`ca-qc`, `gb-sct`), a `country` (`CA`, `GB`, `US`) or a two-part `region` (`CA-QC`). When a call falls on one of their days off, it moves to their next working day that is also the rep's. It keeps its original date as `planned`, and the brief says why: *"not 2026-06-24: their day off, Saint-Jean-Baptiste Day"*. Only calls move. An email arriving on a holiday waits in the inbox, but a call to a closed office uses up one of the three tries.

Three choices here came from real export formats, not from tidy test data:

1. **A bare `region` is ignored.** In a US prospect list, `region: CA` means California. Reading it as Canada would move a Los Angeles call off Canadian Thanksgiving. Only the two-part form (`CA-QC`) counts.
2. **`country: US` means the six days most businesses close, not the eleven federal ones.** Columbus Day and Veterans Day are working days at most firms. If you want the federal list, write `holidays: us`.
3. **A country with no calendar here changes nothing.** `FR` doesn't stop the run. The call stays on its day. Prospect lists carry every country, and an error on row 400 helps nobody.

## What isn't checked

The UK rules match the government's file. The Canadian rules match a well-kept second source. The US rules come from the statute's list as commonly published, and OPM's own calendar refused this host. The new prospect-side logic is tested on hand-written plans, not on a real rep's list. The [README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sales-agent) has each of these caveats next to the feature it applies to. As always, the agent sends nothing itself. It decides what goes in the queue, and a person makes the call.
