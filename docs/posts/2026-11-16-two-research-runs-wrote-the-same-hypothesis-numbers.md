---
title: "Two research runs pre-registered the same hypothesis numbers, so the later one had to renumber"
seo_title: "Stop parallel research runs reusing hypothesis numbers"
date: 2026-11-16
tags: [process, research, pre-registration, tooling]
description: "Parallel runs of one research programme both claimed H104-H107. research_log.py now reads open PRs too, so the next free hypothesis number accounts for them."
---

Each research programme in this repository writes its hypotheses down before
it runs the experiment, numbered H1, H2 and onward across its whole log.
Several sessions can work on one programme at the same time, and nothing
handed out those numbers.

On 2026-11-16 two sessions of the camera self-calibration programme
(`research/sensing-selfcal`) planned milestones 3b and 4s in parallel. Both
pre-registered H104 to H107. 3b merged first, so 4s renumbered its own to
H108 to H112 at merge time, and its log entry says so. The content didn't
change, but a pre-registration that gets renumbered after the run is harder
to audit. A run on 2026-11-13 had to do the same thing with H51 to H55.

Checking `main` doesn't help here, because the sibling run hasn't merged
yet. Its numbers only exist on its open pull request.

**What changed.** `research/_shared/research_log.py labels` already gave the
next free milestone label. Now it also:

- prints the highest hypothesis number in the log and the next free one;
- with `--prs`, reads the `LOG.md` on every open same-repo PR titled
  `research/<slug>` (fork PRs are skipped) and counts their labels and
  hypotheses as taken.

When I ran it on sensing-selfcal it found an open PR that already claimed the
next ones:

```
$ python3 research/_shared/research_log.py labels sensing-selfcal --ref origin/main --prs
newest label: Milestone 3d (2026-11-16)
next free:    Milestone 3f
hypotheses:   highest H139 (- **H139 (the solver sees what motion capture sees).** ...)
next free:    H140 (when this LOG numbers hypotheses across milestones)
open PR #16703: labels 3e, H135-H139
```

Without `--prs`, a session planning its next step would have started at
H135, the same numbers as #16703.

**Limits.** It only sees siblings that have pushed. Research runs open their
draft PR early, so that covers most of them, but two sessions that plan in
the same minute can still collide. An id only counts when it sits on a line
that reads like a hypothesis: a list item that opens with it, or words such
as *held*, *refuted* or *bar*. That rule keeps out "an NVIDIA H100 GPU" and
milestone-scoped ids like H5d-i. Some logs restart their numbering at each
milestone, and for those the "next free" line doesn't apply, which is why it
says so.

[`research/PROGRAMMES.md`](../../research/PROGRAMMES.md) step 1 now points at
the `--prs` form.
