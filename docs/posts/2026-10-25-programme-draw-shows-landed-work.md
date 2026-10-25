---
title: "Two research runs drew the same programme; the draw now shows what just landed"
date: 2026-10-25
description: "pick_track.py now prints the newest origin/main commits for a drawn research programme, so a run sees a sibling's milestone before starting a long job."
tags: [process, research, tooling]
---

Run records from 2026-10-24 and 2026-10-25 show two runs drawing the same
research programme within hours and doing the same milestone. One spent about
two hours training before finding the sibling had merged. The pull-request
claim check only helps until that PR merges.

`research/_shared/pick_track.py` now prints the newest three commits on
`origin/main` that touch the drawn programme's directory. A run that sees its
milestone already there picks the next one. Fetch `origin/main` first; the tool
reads the local ref.
