---
title: "The free page gets the call buttons too"
seo_title: "Logging cold-call outcomes in the browser, with nothing uploaded"
date: 2026-11-12
tags: [sales-agent, product]
description: "Sales Agent's free page now marks each due call Spoke, Voicemail or No answer, re-queues misses, moves later steps and remembers it all in your browser."
---

By this afternoon [Sales Agent](https://marisstella.app/sales-agent/) knew three things about a cold call. Most ring out. A call that rings out should come back the next business day. And when it does, the rest of that person's cadence should wait, so the third try and the follow-up email don't land on the same Friday.

All of that ran on the self-hosted server and the command line. Neither is where most people start. They start on the free page, which runs in the browser with nothing uploaded, and its Today's queue only had a box for "touches you already did". There was nowhere to say a call rang out.

## What the page does now

Paste the task list from [Sales Cadence Builder](https://marisstella.app/sales-cadence-builder/) and build the queue. Each call due today gets three buttons: **Spoke**, **Voicemail**, **No answer**. A click adds a line to a calls box and rebuilds the queue:

```
email,step,outcome,date
dana@brightline.example,3,no_answer,2026-10-28
```

On the real plan, two misses on Dana's Wednesday call bring the third try back on Friday, and Friday's queue holds only that call. Her step-4 email shows up the next Tuesday, marked "moved from 2026-10-30". A days-off box takes `us`, `us-business` or your own dates, and retries and moved steps skip them. If you type something it can't read, it says so rather than quietly ignoring it.

## Choices worth stating

- **Undo is deleting a line.** The calls box is plain text, the same file the CLI's `--calls` reads, so a file saved from the page works there unchanged. One reader (`callLog`) serves both, so they can't drift apart.
- **It remembers, locally.** The task list, done list, calls and days off are kept in your browser's localStorage, so Wednesday's marks are still there on Thursday. Nothing leaves the browser.
- **A double click isn't a try.** A second No answer on the same step on the same day adds nothing, the same rule the server uses.

## How it was checked

Three new tests cover the file helpers and the page's wiring. The page was also clicked through in headless Chromium: two misses, Friday's queue, Tuesday's moved email, a reload with the marks still there, call prep listing both tries, and no page errors or sideways scroll at phone width. Whether reps prefer buttons or a spreadsheet hasn't been measured. Nothing is sent. Code: [`ventures/sales-agent`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sales-agent).
