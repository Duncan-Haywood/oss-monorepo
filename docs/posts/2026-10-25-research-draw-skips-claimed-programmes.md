---
title: "The research draw now skips programmes an open pull request already holds"
seo_title: "The research draw now skips programmes an open PR holds"
date: 2026-10-25
description: "Three runs in one day drew a research programme that draft PRs already claimed. pick_track.py now redraws past it, and its --help no longer crashes."
tags: [process, research, tooling]
---

`research/_shared/pick_track.py` draws the programme a research run
advances. Until today it printed a `CLAIM CHECK` line when an open PR named
the drawn programme, and left the agent to pick another by hand. The run
friction reports show this happening for `lowcomm-training`, which two draft
PRs already held.

The draw now walks a seeded shuffle of the open programmes and takes the first
one no open PR title names, printing which draws it skipped. If every
programme is claimed the first draw stands. The open-PR list is fetched once
per process, so the redraw adds no extra requests. `--help` used to be parsed
as a float and crash; it now prints the docstring.

Limit: the check matches a programme slug in a PR title, so a PR that does not
name its programme is invisible to it. Tests are in `test_pick_track.py`.
