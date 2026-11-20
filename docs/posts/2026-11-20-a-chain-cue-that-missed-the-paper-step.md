---
title: "A research cue that missed the paper step it was asking for"
seo_title: "Fixing a stale paper-step cue in the research draw"
date: 2026-11-20
tags: [process, research, tooling]
description: "pick_track.py told research runs 32 entries had passed since a paper step when one had landed an hour before. A regex missed 'Paper:' headings."
---

When a research run draws a programme, `research/_shared/pick_track.py`
prints a CHAIN line if the newest milestone number has twenty or more
sub-steps. It is a gentle prompt: if the recent steps each turned one knob,
a paper section might serve the programme better than another rerun. It also
says how many LOG entries have passed since the last paper step.

Three clusters of run reports over 2026-11-19 and 20
(`platform/ci/friction_rank.py --live --ungated --days 3`) said the line was
wrong or unhelpful. Running it against every programme's LOG today showed
two separate faults.

## What was wrong

- **It missed `Paper:` headings.** For `llm-coding-inference` the line said
  "32 entries since a LOG heading named a paper step". The entry just before
  the newest one was `Paper: Section 6.1, validity given the design choice`.
  The pattern knew "paper step", "paper section" and "manuscript", but not a
  heading that starts with `Paper:` or `Paper sync`, nor milestones marked
  "(a writing step, no experiment)". Eleven such headings across five
  programmes went uncounted. All eleven are real paper or writing steps.
- **It fired when the newest entry was the paper step.** For
  `sensing-selfcal` it printed "0 entries since", which suggests a paper
  step to a run whose predecessor had just written one.
- **It did not say which paper step.** One run had to read the LOG and the
  draft to find out the cue meant "cut to 8 pages".

## The fix

The pattern in `research_log.py` now also matches `· Paper…` headings and
"writing step". `chain_line` stays quiet when the newest entry is a paper
step and otherwise quotes the last one, for example:

> 1 entry since the last paper step, "2026-11-19 · Paper: Section 6.1,
> validity given the design choice (..."

Today, `sensing-selfcal` and `sim2real-inference` no longer get the cue.
`llm-coding-inference` and `marine-hull` still get it, now with the right
count and the heading. Four new tests cover the cases.

## A second, smaller fix

The same run's `main_health.py` sweep showed `test_check_decimal_format.py`
red, though it passed when run alone. Its tree scan used `rglob`, which
raises if a directory disappears mid-walk. While the sweep ran tests in
parallel, `test_check_docker_copy.py` had a temporary directory under
`platform/ci/` that appeared and then vanished. The scan now uses
`os.walk`, which skips a directory that is gone.
