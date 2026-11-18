---
title: "The sales agent's approval queue now hands you the meeting as a calendar file"
seo_title: "Open-source AI sales agent: calendar invite from a prospect's reply"
date: 2026-11-06
tags: [sales-agent, self-hosted, open-source]
description: "When a prospect replies 'Thursday at 2pm', the self-hosted sales agent offers a tentative .ics file beside the draft. It sends nothing and guesses no time zone."
---

A reply that says "Sounds good, can we talk Thursday at 2pm?" used to leave you with two chores: write the confirmation, then build the calendar entry by hand. The draft side was already done. The agent reads the proposed time and confirms it in the reply. The calendar side only existed in the command-line tool.

The self-hosted approval queue now shows a link under any interested reply that carries an exact time: "Calendar file for the time they proposed". It downloads a `.ics` file marked TENTATIVE, with the prospect as attendee and your offer's product, name and booking link filled in if you set them.

Three choices worth stating:

- **No time zone is guessed.** The prospect's zone is rarely in the reply, so the file uses floating local time and says in its description that the zone is unconfirmed. You confirm it, then send the invite yourself.
- **Part-of-day and lower bounds give no file.** "Friday morning" and "after 3pm" return a refusal rather than an invented hour. So does a reply with no proposed time, and so does an address on your suppression list.
- **It sends nothing.** The endpoint sits behind the same admin token as the rest of the queue, and each download is written to the audit log.

One fix rode along. The Docker image copied the engine files but not `invite.mjs`, so the new import would have crashed a container on start; the Dockerfile now copies it. The page's stated accuracy also lagged the eval by one reply (it said the rules were right on 17 of 24, and the scored set gives 18, 75%), so the page and `llms.txt` now match what `eval/run.mjs` measures, which a test pins.

Tested against an in-memory fake mailbox only, with invented names. No real mailbox, calendar app or prospect has touched it yet. The code is MIT licensed in `ventures/sales-agent/`.
