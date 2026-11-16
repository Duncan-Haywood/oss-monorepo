---
title: "Two research PRs out of 106: the land-first step now prints its own list"
date: 2026-11-16
tags: [process, research, tooling, pull-requests, agents]
seo_title: "The land-first step now prints the open research PRs"
description: "Research runs read 106 open PR titles by hand to find the two they must land first; pick_track.py now prints that list, split by age, in one line each."
---

Every research run in this repository starts with the same instruction: before you build anything new, land the open pull requests that touch `research/`. Merge what is ready, finish what is close, close what a later PR replaced. The rule exists because the research portfolio once lost dozens of branches that nobody landed.

The rule was sound, but following it was slow. GitHub's list call has no path filter, and this morning the repository had **106 open pull requests**. Three research runs in the last three days wrote in their run records that they had to read every title by hand to find the research ones. One gave up and relied on a different check.

We counted. Of the 106, **two** were research PRs, and both had been opened within the last hour by sessions still working on them. So the honest answer to "what should I land first?" was "nothing; those two are someone's live work". Each run had been spending minutes to learn that.

**What changed.** `research/_shared/pick_track.py`, which every research run already calls to draw its programme, now starts its output with a `LAND FIRST` block. It reuses the open-PR list the script already fetches for its claim check, so it costs no extra API calls. It keeps the PRs whose titles name `research/<slug>`, which the research prompt already asks every run to put in its title. It then splits them by age:

- **older than three hours**, oldest first: these are the ones to land, finish or close;
- **opened in the last three hours**: a sibling's live claim, to leave alone (the same three-hour window the prompt's claim step uses).

This morning it printed:

```
LAND FIRST (2 other open PR(s) of 106 title research/...; research prompt, 'Landing work' step 2):
  2 opened in the last 3h: a sibling's live claim, leave it:
  #16472 (0.8h, draft) research/sensing-selfcal: milestone 3b, ...
  #16470 (1.0h, draft) research/sensing-selfcal: milestone 4s, ...
```

`pick_track.py --land` prints only that list, uncapped. A run's own PR is labelled as its own rather than counted. When the API can't be reached, the output says so instead of printing nothing, because a blank reads as "nothing to land".

**The limit.** The block matches titles, not files. A PR that edits `research/` under a title like "process: ..." won't appear in it. The convention makes that rare, and checking files would take one API call per PR, which the unauthenticated rate limit (60 an hour) can't cover for 106 PRs.

**A smaller fix in the same PR.** `platform/ci/wait_for.py` lets a run wait on a background job's log until a marker line appears. One run waited the full timeout on a log ending in `BUILD_EXIT=0` because it had passed `--marker BUILD_EXIT`. The checker accepted `BUILD_EXIT 0` and `BUILD_EXIT: 0`, and accepted `=` only when the marker itself ended in it (`--marker BUILD_EXIT=`). A bare name followed by `=` now counts too, and `BUILD_EXIT_CODE=0` still does not.
