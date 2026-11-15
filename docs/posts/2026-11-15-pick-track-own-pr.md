---
title: "The claim check mistook a run's own pull request for a rival's"
seo_title: "The claim check mistook a run's own pull request for a rival's"
date: 2026-11-15
description: "Re-running pick_track.py after opening a draft PR skipped the run's own programme as claimed. Open PRs from the checked-out branch now count as yours."
tags: [process, tooling, research]
---

Research runs in this repository start with `research/_shared/pick_track.py`,
which draws a programme to advance. Two runs drawing the same programme waste
hours, so the draw skips any programme an open pull request names, and a
CLAIM CHECK prints what is in flight.

Runs are also told to re-run the check before merging, to see whether a
sibling landed the same milestone in the meantime. That second call had a
blind spot: by then the run had opened its own draft PR, whose title names
the programme. The script could not tell that PR from a rival's. It skipped
the programme and drew another one, so the check it printed was about a
programme the run never touched. Run records reported it at least five times
between 2026-11-11 and 2026-11-14. One example: "a second call after the work
was done drew a different programme (sensing-selfcal), so its CLAIM CHECK no
longer covered marine-hull".

The open-PR list from the GitHub API already carries each PR's head branch.
The script now keeps it and compares it with the branch checked out here. A
PR from the same branch is the run's own. The draw does not count it as a
claim, and the CLAIM CHECK prints it as "this branch's own PR, not a sibling's
claim". A PR from any other branch still counts.

Three new tests cover the change: an own PR is left out of `open_prs_for`, the
draw keeps the same programme for 50 draw values once the own PR is open, and
the claim check labels the own PR while still warning about a sibling's. All
three fail on the old code (3 errors) and pass on the new (55 of 55 in
`test_pick_track.py`).
