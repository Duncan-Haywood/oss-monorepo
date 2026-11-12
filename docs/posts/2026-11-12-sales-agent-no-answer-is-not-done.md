---
title: "A call that rang out is not a call you made"
seo_title: "No answer, voicemail, spoke: call outcomes in a self-hosted sales queue"
date: 2026-11-12
tags: [sales-agent, product]
description: "Sales Agent's Today's queue now takes an outcome for each call. No answer brings the call back the next business day for up to three tries, and call prep lists every try."
---

This morning [Sales Agent](https://marisstella.app/sales-agent/)'s self-hosted server got a **Done** button for the touches a Sent folder can't see: calls, LinkedIn visits, letters. That fixed one problem and left another. On a cold call, "done" usually means "nobody picked up". If one button covers both, a rep either taps Done on a call that rang out, and the call drops out of the cadence, or leaves it open, and it sits there overdue every day until it goes stale.

So a call on the queue now has three buttons in place of Done:

- **Spoke** ends the step.
- **Voicemail** ends the step too. You left a message, so the cadence carries on from there.
- **No answer** keeps the step open. The call comes back the **next business day**. A Friday miss comes back on Monday, not Saturday. It's due that day, not shown as overdue against the plan, and it's labelled "try 2: no answer once". After three tries with no answer, the cadence moves on.

A few small rules came out of the tests. A second No answer on the same day counts once: that's a double tap, not another try. Undo takes back only the latest mark, so undoing a voicemail leaves Friday's no-answer in place. LinkedIn touches and letters still get a plain Done, and the server rejects a call outcome on any step that isn't a call.

## Call prep reads the tries

The tries also feed call prep. The brief for a person now has a "Calls so far" section, and its agenda starts from the last outcome. After a voicemail it says "if they are calling back, say so and refer to it". After misses it says "try a different time from their call window, and leave a short voicemail this time". That's the context a rep loses between Tuesday's attempt and Thursday's.

## How it was checked

The tests (6, in `self-host/call-outcome.test.mjs`) run on a real plan from [Sales Cadence Builder](https://marisstella.app/sales-cadence-builder/): two prospects, with calls on Wednesday 28 October and Wednesday 4 November. They walk one call from Wednesday to Thursday to Friday and then off the queue, check that a Friday miss skips the weekend, and check that a stale retry is still dropped as too old. The buttons were also clicked once in headless Chromium. The queue went from 6 due to 5, the "Marked done today" line read "dana@brightline.example (3, no answer)" with an Undo, and the page threw no errors.

## What it doesn't know yet

The three-try limit and the next-business-day gap are common outreach practice. Neither has been measured against real connect rates. Holidays aren't skipped. A retried call also doesn't push back the steps after it, so a third try at a Wednesday call lands on the same Friday as the next email. Both are next on the list. As before, nothing on this queue sends anything.
