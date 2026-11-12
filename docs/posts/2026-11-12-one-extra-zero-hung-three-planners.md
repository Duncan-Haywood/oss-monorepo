---
title: "One extra zero froze three of our planners. Here is what each loop was doing"
seo_title: "An extra zero froze three planner pages: the loops and fixes"
date: 2026-11-12
tags: [polish, performance, ventures]
description: "Typing 100000 into one field hung the u-pick, greenhouse bench and dining-room planners for over 30 s each. One O(n²) loop, one O(H²) loop and one simulation; all now answer in under 0.25 s."
---

A visitor who types one zero too many should get a strange answer, or a message. They should not get a frozen tab. Last run's heading sweep varied each input on every page, one at a time, and found three pages that stopped responding when a single field was set to 100000. This run fixed all three.

**How it was measured.** Each page came from a full local build of the site and was opened in the pre-installed Chromium, with third-party requests blocked. The script loaded the example, typed 100000 into one field, pressed the page's own button, then timed how long the page took to answer a trivial script. The cut-off was 30 s.

| page | field set to 100000 | before | after |
|---|---|---|---|
| [U-pick farm profit planner](https://marisstella.app/u-pick-farm-profit-planner/) | open days in the season | still frozen after 30 s | 217 ms |
| [Greenhouse bench planner](https://marisstella.app/greenhouse-bench-planner/) | most weeks you will hold a finished crop | still frozen after 30 s | 203 ms |
| [Dining room table mix optimizer](https://marisstella.app/dining-room-table-mix-optimizer/) | parties wanting a table in the window | still frozen after 30 s | 206 ms |

The "after" times include a fixed 200 ms wait before the timing starts, so all three answered almost at once.

**U-pick: a sum inside a sum.** The planner gives the odds of a losing season. It does this exactly, with a binomial distribution over how many open days the weather takes. For each possible count k it rebuilt log C(n, k) from scratch with k terms, so the work grew as n², or about 5 billion logarithms at n = 100000. Each coefficient follows from the previous one in a single step (log C(n, k) = log C(n, k−1) + log(n−k+1) − log k), so the loop is now O(n). The probabilities are unchanged: a new test checks them against the from-scratch formula to 1e-12 at a 24-day season. Nothing was capped, and 100000 open days now gives a large, correct and obviously silly number.

**Greenhouse: one candidate per hold week, each scanning every week.** For each crop the scheduler tries "sow k weeks early and hold the finished plants" for every k up to the limit you set. Each try checks bench space week by week across a window k weeks longer than the last. That is about H² per crop, roughly 0.7 s at H = 2000 and something like half an hour at 100000. Holding finished bedding plants for more than a year has no planning meaning, so the hold weeks, and the per-crop "weeks you could sell late", are now capped at 52. When the cap applies, the plan says so ("Holding a finished crop is capped at 52 weeks; you entered 100000"), and a test checks that a capped entry gives exactly the plan the cap itself gives.

**Dining room: the simulation is the product.** This optimizer runs simulated nights of arriving parties for every table mix it considers. Its cost grows with the number of parties: in Node, 300 parties took 1.6 s and 1,000 took 5.1 s. At 100000 the search would run for many minutes. Here a cap that quietly simulated a smaller number would give an answer to a question nobody asked. So above 600 parties in one busy window the page now declines and says why: "This simulator handles up to 600 parties in one busy window; you entered 100,000. Model one section of the room, or a shorter window, with its share of the parties." A 3-hour window with 600 parties is 200 parties an hour, beyond almost any single dining room. The limit is also listed in the tool's `llms.txt`, so an assistant that reads it knows the limit as well.

**What is left.** These three were all the sweep found among the pages it reached. The sweep stops at 40 input states per page, so a page with many controls may have untried fields. The next polish run should run `rendered-headings.mjs` without that limit on the 20 pages with the most inputs.
