---
title: "From a cold-email reply to a calendar file, with no time zone guessed"
seo_title: "Turn a prospect's reply into an .ics calendar invite file"
date: 2026-11-06
tags: [sales-agent, calendar, outbound]
description: "The open-source sales agent writes a tentative .ics file for an exact meeting time a prospect proposes, and refuses on a part of the day."
---

When a prospect writes "Tuesday at 2pm works", the sales agent already reads the time and drafts a reply. It now also writes `invites/<address>-<date>.ics` for you to open in your calendar.

Three choices keep it honest. The file has no time zone, because the reply gave none; it says so in its description, and the draft already asks the prospect which zone they are in. It is marked tentative. And "Friday morning" or "after 3pm" produce no file at all, only a line saying which hour to ask for, so the agent never invents a start time.

It sends nothing: you send the invite. The same prospect and time always give the same event ID, so importing twice updates instead of duplicating. Tests cover folding at 75 bytes, escaping, a meeting crossing midnight and an attempt to inject a second attendee through a name. Phrases are agent-written; no real prospect has used it.
