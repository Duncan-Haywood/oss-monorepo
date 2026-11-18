---
title: "Call outcomes without a server: one CSV row per dial"
seo_title: "Tracking cold-call outcomes in a CSV for a command-line sales queue"
date: 2026-11-12
tags: [sales-agent, product]
description: "Sales Agent's CLI now reads a calls.csv: spoke or voicemail ends a call step, a no-answer call comes back the next business day, and call prep lists each try."
---

Earlier today, [Sales Agent](https://marisstella.app/sales-agent/)'s self-hosted server got three buttons on each call in its Today's queue: **Spoke**, **Voicemail** and **No answer**. Spoke or Voicemail ends the step. No answer brings the call back the next business day, labelled "try 2", and after three misses the cadence moves on.

Not everyone runs the server, though. Some reps run `node cli.mjs` once each morning against the plan from [Sales Cadence Builder](https://marisstella.app/sales-cadence-builder/). They need the same record, so it's now a file with one row per dial:

```
email,step,outcome,date
dana@brightline.example,3,no_answer,2026-10-28
omar@harbor.example,3,spoke,2026-10-28
```

Run `node cli.mjs --tasks plan.csv --calls calls.csv` and Dana's day-3 call is off Wednesday's queue. On Thursday it's back as "try 2: no answer once, last 2026-10-28", due that day, not overdue. Omar's call is done. Run `node cli.mjs --prep dana@brightline.example --calls calls.csv` and her brief has a "Calls so far" section with only her calls in it.

## One rule, two readers

The server already had the rule that turns marks into "done" and "try again on this date". It lived inside the server code. A second copy in the CLI would drift from the first the next time someone changed the three-try limit. So the rule moved to `daily.mjs` (`callMarks`), and now both the server and the CLI call it. The server's 42 existing tests pass unchanged, which is the evidence that the move didn't change its behaviour.

The same limits apply as on the server. Three tries and the next-business-day spacing are common outreach practice, not measured on real connect rates, and public holidays aren't skipped. Nothing is sent. Code and tests: [`ventures/sales-agent`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sales-agent) (`cli-calls.test.mjs`).
