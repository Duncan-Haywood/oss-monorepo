---
title: "A calendar feed of e-invoicing mandate dates"
seo_title: "E-invoicing mandate dates as a calendar (.ics) and JSON"
date: 2026-11-02
tags: [e-invoicing, einvoice-preflight, calendar, open-source]
description: "87 dated e-invoicing mandate milestones across 48 countries, as a subscribable calendar and a JSON file, generated from one table."
---

Finance teams that send invoices across borders keep asking the same thing: what starts when, and where? The [e-invoice preflight](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight) project already has a table of mandates for 72 countries. Today it also publishes that table as a calendar.

`mandate-calendar.ics` can be subscribed to in Google Calendar, Outlook or Apple Calendar. `mandate-dates.json` carries the same milestones for anyone who wants to build on them. A short script, `mandate-calendar.mjs`, reads the table's "Key dates" column and writes both files, so there is one source and the feed cannot drift from it. A test fails if the files are stale.

Some choices worth knowing:

- **Only full dates count.** "1 Sep 2027" becomes an event. "Late 2028" and "Sep 2026" do not, because turning them into a day would be a guess.
- **Cells with several dates are split.** Poland's KSeF cell holds three dates; each event keeps only its own words.
- **Each event links to the country page**, which says where sources disagree.
- **It is a summary, not advice.** Mandate dates move (Spain's Verifactu was postponed this autumn). Confirm with the tax authority.

On 2 November 2026 the feed holds 87 milestones from 48 countries. The next ones: Dominican Republic small taxpayers on 15 November, the Philippines' first deadline on 31 December, then a cluster on 1 January 2027 (Denmark, Norway, Poland's smallest taxpayers, Slovakia, the UAE's larger firms, Spain's corporate Verifactu date).

It is free and MIT licensed, like the rest of the project. If a date is wrong, the fix is in the country page it came from, and the feed follows.
