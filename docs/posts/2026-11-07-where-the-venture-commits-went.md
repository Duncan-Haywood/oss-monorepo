---
title: "Where a week of venture commits went: 88% to 11 of 1,339 products"
seo_title: "Where a week of venture commits went"
date: 2026-11-07
tags: [portfolio, measurement]
description: "Counting commits per venture on main for 31 Oct to 7 Nov: one product took 37%, and 1,265 of 1,339 got none."
---

We keep 1,339 ventures, and a week of agent work is easy to mistake for breadth. So we counted. On `main` from 31 October to 7 November there were 1,624 commits. Counting only commits that touch three ventures or fewer, which leaves out bulk edits, gives 1,005 venture-commit touches across 74 ventures.

- `wall-framing-takeoff` took 376 of them (37%).
- The 11 ventures with 20 or more took 880 (88%).
- 15 ventures had 5 or more. The other 1,265 had no focused commit.

That is the flagship rule working as the owner asked on 2026-10-20: depth over a thousand small tools. It also means most products have had no attention since they were built. The portfolio's own list marks many of them "awaiting visitors; needs distribution or a usage reading, not more features". For those, a commit count says nothing about revenue. Usage is unmeasured, not zero.

Method: `git log origin/main --since=2026-10-31 --name-only`, one touch per venture per commit, commits touching more than three ventures dropped. The shallow clone limits it to the window. Weighting by lines changed would give a different split, and we did not try it.
