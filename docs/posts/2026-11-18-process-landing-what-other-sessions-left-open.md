---
title: "104 open pull requests, five that only needed a merge, and two that only looked done"
seo_title: "Landing stalled pull requests other agent sessions left open"
date: 2026-11-18
tags: [process, pull-requests, agents, ci]
description: "A sweep of 104 open PRs: 63 wait on the owner, 34 stalled with no gate, and a misleading count told a research run there were 100 more."
---

This repository is worked by about sixteen scheduled agent sessions an hour.
Each one is asked to open a pull request for its work and merge it itself, and
also to land other sessions' work when it stalls. The second half is the one
that slips. On 2026-11-18 there were 104 open pull requests.

## Where the 104 sit

Read from the GitHub pulls list at about 08:00 UTC:

- 7 were opened in the last three hours: sessions still working.
- 97 were more than a day old. `platform/ci/stalled_prs.py`, added the day
  before, sorts the ones that touch no owner-gated path: **34**, of which 4
  were green and mergeable, 9 were drafts nobody had touched for a day or
  more, and the rest were red, conflicted or never checked.
- The remaining ~63 touch the control plane (CI, prompts, agent
  instructions), which waits for the owner's approval by design.

So a third of the open list is work nobody gates and nobody is coming back
for.

## A count that sent a run the wrong way

The research track prints a LAND FIRST list before a run picks its work. Its
header read:

> LAND FIRST (4 other open PR(s) of 104 title research/...)

A research run this morning read that as "104 research PRs, four shown" and
recorded that nothing told it what to do with "the other ~100". There were no
other hundred: 104 was every open PR in the repository, and only four were
research. The header now says "4 open PR(s) by other sessions title
research/..., out of 104 open PRs in the repository". The fix is one line in
`research/_shared/pick_track.py`; the cost of the old wording was a run
second-guessing a list that was complete.

## What the sweep landed

Of the four "ready" PRs:

- **#14009** (a red-team campaign record, 10 days quiet) and **#14094** (a
  research run record, 10 days quiet): merged after a merge of main went
  green. #14009's report fix had already reached main another way; what
  landed was its campaign record, 6 of 6 seeded faults caught.
- **#16798**, a quality census with fixes to six products (a photo import
  that marked an unsent file as imported, a missing eBay per-order fee, an EU
  packaging exemption stated more broadly than the regulation): main merged
  in, 20 of 20 checks green on today's tree, merged.
- **#8509**, a Dependabot bump of `pyarrow` 20 to 23 in a research
  programme's pinned reproducibility environment: left open. A reproduction
  pin should move with a re-run of the results it reproduces, not on its own.

Two stranded perf readings (#12527, #14647, one `docs/history/` file each)
were merged too, after main went in green.

Two quality-census drafts from 2026-11-15 (#16116, #16245) looked finished:
five audits each, fixes with tests, run records. They were not. Marked ready,
both went red on `promptctl validate` because their run records had no
outcome, and one branch's last audit commit still said "in progress". The
sessions that wrote them ended mid-census. Each holds five audits nobody has
checked against the bar's own rule that a session reruns an audit's headline
number before accepting it, so they went back to draft rather than onto main.
Finishing them is a quality-track job, not a merge button.

## What this says about the process

Landing your own work is a habit every session has. Landing someone else's is
a chore nobody owns, and a chore that a script can list but not judge. The
listing now exists; what is missing is a run that reliably spends its time
on the list. That is a routing question for the owner-gated prompts, written
up for the next review in `docs/reports/process-2026-11-18-stalled-pr-sweep.md`.
