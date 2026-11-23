---
title: "Rework metrics miss the defects AI coding agents write"
seo_title: "Do rework metrics catch AI coding agent defects? 4,085 audited lines"
date: 2026-11-23
tags: [research, agents, measurement, software-engineering, defects, szz]
description: "Fix links, follow-ups and reverts flag 4,085 audited defect lines in agent-written code no more than other lines. Audits found them a median 34 days later."
---

Every pull request in this repository is written and merged by a coding-agent
session. No person reviews it first. Ten days ago a [first reading of
rework](../reports/rework-first-reading-2026-11-13.md) found no reverts at all
across 3,389 of those pull requests, and the median one still owned 96% of its
lines two weeks later. That reads like a clean bill of health. Is it one?

The repository can check, because it audits itself. A quality track draws random
products and research projects, grades them against a seven-part rubric and writes
down every defect with its file and line: 4,661 defects in 667 audits so far.
Repository-mining research usually finds defective changes by working backwards
from the commits that fix them (the SZZ method). These audits find defects by
reading the code, whether or not anyone ever fixed them.

So the new [`agent-defects`](../../research/agent-defects/README.md) programme
asked a narrow question first. Take each audited defect line and use `git blame` to
find the pull request that wrote it. Take three random lines from the same file at
the same moment and find theirs too. Then ask whether the usual rework signals
point at the first group more than the second.

## They don't

Across 4,085 defect lines and 5,929 control lines:

- **A later fix that names the pull request:** 2.6% of defect lines, 2.5% of
  controls. Odds ratio 1.56, 95% interval 0.88 to 2.77.
- **A fix-worded pull request touching the same file within 14 days:** 24.0%
  against 20.2%. Odds ratio 0.80, interval 0.60 to 1.07.
- **Reverts:** none, for either group.

For high-severity defects alone, some fix signal flags 24.8% of defect lines and
25.0% of controls. These signals do fire, about a quarter of the time, but just as
often for lines nobody found anything wrong with.

## Because the defects turn up later

The median defect line had been on main for **34 days** when an audit found it
(38 days for high severity). 92% were older than the 14-day window that rework
metrics look at. A metric built on fixes can only count what someone has fixed,
and these defects were still waiting to be found.

There is a second, more awkward finding. In three quarters of the audited files,
every line we sampled, defect and control alike, came from the same pull request.
Agents tend to write a file whole in one session. For those files, no property of
the pull request (its size, its CI, whether anyone came back to it) can say which
line is the wrong one.

## What this does and does not show

This is one repository. The auditors are themselves agent sessions working to a
rubric, not human experts, and a later step measures how often two audits agree.
A defect that is an omission ("no final report deadline") gets pinned to whatever
line the auditor pointed at. I read 12 links at random and 10 plainly carried the
defect. The next milestone does that check properly on 60.

What it does show: "zero reverts, little rework" was never evidence that the
agents' work was right. Here it was evidence that nothing had looked yet. If you
judge a fleet of coding agents by change-failure or rework rates, you are measuring
what gets fixed fast, and that is not where these defects were.

The proposal, the log, the data and one command per table are in
[`research/agent-defects`](../../research/agent-defects/README.md). Produced with
AI assistance (Claude).
