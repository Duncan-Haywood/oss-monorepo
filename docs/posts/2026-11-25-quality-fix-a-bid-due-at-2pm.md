---
title: "Quality fix: a bid due at 2:00 PM is late at 2:01, not at midnight"
seo_title: "Bid deadline countdown with due time and office time zone, free"
date: 2026-11-25
tags: [quality-audit, for-customers, contractor-bid-readiness, construction, bidding, rfp]
description: "The bid readiness checklist now takes the solicitation's due time and the time zone it is read in, and reads past-due from that minute on the office's clock."
---

A solicitation does not say "due Tuesday". It says something like "sealed
bids will be received until 2:00 PM local time on June 15 at the County
Purchasing Office". A bid that arrives at 2:01 is late. For US federal sealed
bids that is FAR 14.304, and most public owners follow the same rule.

Until today the [Contractor Bid Readiness checklist](../../ventures/contractor-bid-readiness/)
only took the date. It counted whole calendar days in your browser's time zone.
So a bid due at 2:00 PM still read **urgent** and "The deadline is today." at
3:00 PM, an hour after it could no longer be filed. The
[quality audit of 2026-11-19](../../portfolio/quality/audits/2026-11-19-contractor-bid-readiness.json)
listed this as its one high-severity defect. The same audit found a second
problem: the page worked out the urgency label but never showed it.

## What changed

The Opportunity panel has two new fields: **Due time** and **Time zone the
deadline is read in**. The zone is usually the issuing office's. The list
covers the US and Canadian zones, Arizona (no daylight saving), Hawaii,
Alaska, Puerto Rico, the UK, Ireland, Sydney and UTC.

- **Past-due from the stated minute.** With a due time, the bid reads past-due
  from that minute on that clock, wherever you open the page. A Chicago bid due
  at 14:00, checked from a laptop set to any zone:

  | checked at (Chicago) | label | sentence |
  |---|---|---|
  | 1:40 PM | urgent | The deadline is today at 14:00 America/Chicago time, 20 min from now. |
  | 3:00 PM | past-due | The deadline passed today at 14:00 America/Chicago time, 1 h 0 min ago. |

  These two rows are fixtures in `model.test.mjs`. They were also checked in
  Chromium with the clock pinned and the browser set to Asia/Tokyo, so the
  viewer's zone and the office's zone differed.
- **The office's calendar decides the day count.** At 10 PM in Chicago it is
  already the next day in UTC. A bid due the next day is still 1 day out on the
  office's calendar, and that is the count the checklist now shows.
- **The urgency label is on the page.** It shows as a badge next to the
  summary: normal, urgent at two days or fewer, or past-due. Before, it only
  appeared in the downloaded Markdown report.
- **Share links and the report carry the time and zone.** A subcontractor who
  opens your link sees the same deadline you see. The Markdown report's "Due
  date" line shows the time and zone too.

Without a due time the checklist works as before: whole calendar days in your
browser's zone. The [days-remaining page](../../ventures/contractor-bid-readiness/does-a-bid-due-today-count-as-a-day-remaining.html)
now says how to switch to the exact minute.

## How the time is converted

`dueInstant` in `model.mjs` turns "14:00 on 2099-06-15 in America/Chicago"
into a single moment, using the browser's own time zone database
(`Intl.DateTimeFormat`). It makes two passes, so a deadline on a
daylight-saving changeover day still lands on the right hour. The tests check
New York in winter and in summer, Arizona and London against UTC times worked
out by hand. They pass under `TZ=UTC`, `TZ=America/New_York` and
`TZ=Asia/Tokyo`. An unknown zone in a crafted link falls back to the browser's
own clock and does not throw.

## Still open from the audit

- Checklist rows are not saved between visits unless you copy a share link.
- Share links cut notes at 120 characters and drop rows past 100, and neither
  the sender nor the recipient is told.
- The day-count DST regression test only bites when the test runner's zone
  observes daylight saving. The new timing tests pin UTC instants and do not
  depend on the runner.

A later audit round re-checks this fix. This round does not change the
audit's scores.

The checklist is an evidence aid, not a compliance or award determination.
Always read the solicitation's own deadline wording and confirm it with the
issuing authority.
