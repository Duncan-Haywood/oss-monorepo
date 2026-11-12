---
title: "1:75 is not a duration, and 1,5 is not fifteen hours"
seo_title: "Time-tracker CSV parsing bugs: minutes past 59 and decimal commas"
date: 2026-11-12
description: "A red-team run found two duration bugs in the client profitability analyzer, then the same H:MM bug in six more tools. All fixed, each with a test."
tags: [redteam, testing, client-profitability-time-analyzer, csv, parsing]
---

Once in a while a run here plants small bugs in code on purpose. It changes a `>` to a `>=` or flips a `true`, then checks whether the tests notice. This run picked the [client profitability analyzer](/ventures/client-profitability-time-analyzer/), which reads a Toggl, Clockify or Harvest export and works out what each client really pays you per hour. Of eight planted bugs, the tests caught four. The four that got through all sat in code nobody had tested. One was 12-hour times with a one-digit hour ("9:30 pm"). Another was day-first dates with a one-digit month ("13/5/2026"). The third was the count of billable hours that have no amount or rate. The last was a flag the date parser returns but no test ever checked. Each now has a test that fails when its bug comes back.

Reading the parser like a stranger's export found two real bugs.

**A decimal comma read as a thousands separator.** The tool only read "1,5" as one and a half hours when the file used semicolons. A tab-separated European export, or a comma file with the value in quotes, gave **15 hours**. That is ten times too many, and the client's effective rate came out ten times too low, with no warning. The fix is that a comma followed by one or two digits is always a decimal comma, because a thousands group always has three digits. "1,500" still reads as 1,500.

**Minutes past 59.** "1:75" read as 2.25 hours. No tracker writes that, so it is a typo, and silently stretching it is worse than saying so. Now the row is listed as unreadable with a line number, like any other bad row.

Then we checked whether any other tool had the same habit. A short script called every exported time and duration parser under `ventures/` with "1:30" and "1:75". Six more read "1:75" as 135 minutes (or seconds): the [Turo](/ventures/turo-earnings-report-analyzer/), [gig driver](/ventures/gig-driver-earnings-report-analyzer/) and [YouTube revenue](/ventures/youtube-revenue-rpm-analyzer/) analyzers, the [lead response time analyzer](/ventures/lead-response-time-analyzer/), the [service hourly yield analyzer](/ventures/service-hourly-yield-analyzer/) and the [crew dispatch optimizer](/ventures/crew-dispatch-optimizer/). Every other parser it reached already refused it. All six are fixed, each with a test that fails on the old code.

The rate at which tests caught planted bugs in this file went from 50% to 100%. The sweep script is not yet a CI check. Adding one means a workflow edit, which waits for the owner's approval, so for now the guard is a test in each tool.
