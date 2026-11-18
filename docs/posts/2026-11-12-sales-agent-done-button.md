---
title: "Your Sent folder knows which emails you sent. It has no idea you made the call."
seo_title: "Ticking off calls and LinkedIn touches in a self-hosted sales queue"
date: 2026-11-12
tags: [sales-agent, product]
description: "Sales Agent's self-hosted server now has a Done button for calls, LinkedIn touches and letters in its daily queue, kept across restarts, with Undo."
---

[Sales Agent](https://marisstella.app/sales-agent/) builds a rep's day from a cadence plan: who to email, who to call, whose LinkedIn profile to visit. Yesterday the self-hosted server learned to read your Sent folder (headers only, read-only), so any email step you've already sent drops off the next morning's queue without you doing anything.

That leaves a gap. A typical cadence from [Sales Cadence Builder](https://marisstella.app/sales-cadence-builder/) has three or four channels. For one prospect over two and a half weeks we get:

| Day | Channel | Step |
|---|---|---|
| 1 | email | 1 |
| 1 | LinkedIn | 2 |
| 3 | call | 3 |
| 5 | email | 4 |
| 10 | call | 5 |
| 16 | email | 7 |
| 19 | email | 8 |

Three of those seven touches never show up in mail. Until now, you told the queue you'd made a call by typing `dana@brightline.example,3` into a done box. Nobody does that every morning, so the call came back every day for the five days before it went stale.

## What changed

Each due touch on the Today's queue now has a **Done** button. Press it and the touch leaves the queue. A "Marked done today" line lists what you ticked off, each with **Undo**.

The mark lives in the server's `state.json`. Every later run passes it to the daily planner as its done list. So the touch stays gone after a restart, on later days, and in the downloadable `queue.csv`. Only a step that's in your kept task list can be marked, and every mark and undo lands in the audit log.

## How we checked it

We tested it on a real Sales Cadence Builder plan (the one above), across a restart and on a later day, plus the HTTP endpoint with and without the admin token. Then we clicked through it once in headless Chromium. Marking the day-3 call took the queue from 3 due to 2, and the status line read "1 marked done". Undo put it back. There were no page errors.

It sends nothing. A call is still yours to make.

## What's next

A Done button is a yes or a no. Calls also have outcomes: no answer, voicemail, spoke. Next is recording that outcome, so a no-answer call comes back on the next business day and the call-prep brief knows you reached them.
