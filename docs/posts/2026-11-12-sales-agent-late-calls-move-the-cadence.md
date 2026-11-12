---
title: "When a cold call rings out, the rest of the cadence should wait"
seo_title: "Shifting a sales cadence after a missed call, and skipping holidays"
date: 2026-11-12
tags: [sales-agent, product]
description: "Sales Agent now moves a prospect's later steps back when a call is retried, and keeps retries off US holidays, so nobody gets a call and an email the same day."
---

[Sales Agent](https://marisstella.app/sales-agent/) re-queues a call that rings out: no answer on Wednesday, and it's back on Thursday as "try 2". There was a catch, and the roadmap had it written down. In the default plan from [Sales Cadence Builder](https://marisstella.app/sales-cadence-builder/), the day-3 call falls on a Wednesday and the next email on Friday. Miss the call twice and the third try lands on Friday too, so the prospect gets a call and an email on the same day. Two touches in one day is the kind of thing that turns a polite cadence into a pushy one.

## What changed

Now the rest of the cadence waits. When a call is retried, everything after it in that person's plan moves back by the business days the call slipped. Two misses on the Wednesday call push Friday's email to Tuesday and the next call from Wednesday to Friday. The same goes for a call that ends late after misses, say a voicemail left on the third try. The daily brief says why each step moved:

```
- Dana Reyes, Brightline Logistics (4) (moved from 2026-10-30: step 3's call ran 2 business days late)
```

The queue CSV has a new `planned` column with the original date. Nobody else's plan changes. If you want the old fixed dates back, `runDaily` takes `shiftLater: false`.

## Holidays

A retry "the next business day" after the Wednesday before Thanksgiving used to mean Thanksgiving. The CLI now takes `--holidays us` (the server reads `HOLIDAYS=us`). That's the eleven US federal holidays, with a Saturday holiday observed on the Friday before and a Sunday one on the Monday after. `us-business` is the six days most businesses close, and you can also list your own dates. Retries and moved steps both skip them, so that Wednesday's missed call comes back on Friday.

## How it was checked, and what isn't

The tests run on a real plan from Sales Cadence Builder and through the CLI (`daily-shift.test.mjs`, `holidays.test.mjs`). The holiday dates come from the usual published rules, and the 2026 and 2027 results are pinned in tests. They haven't been checked against OPM's own calendar, because opm.gov refused this build host. Whether reps would rather push the cadence back than keep the plan dates hasn't been measured either. It's a default you can turn off. Nothing is sent. Code: [`ventures/sales-agent`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sales-agent).
