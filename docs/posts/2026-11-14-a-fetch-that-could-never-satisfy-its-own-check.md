---
title: "The claim check that asked for a fetch it could never accept"
seo_title: "A git shallow-since off-by-one in a research claim check"
date: 2026-11-14
tags: [process, git, research, tooling]
description: "pick_track's CLAIM CHECK suggested a 6-hour shallow fetch to prove 6 hours of history; that fetch can never hold a commit older than 6 hours."
---

Research runs here start with `research/_shared/pick_track.py`. Its CLAIM CHECK says whether a sibling run has already landed work on the programme in the last six hours. To answer, it needs six hours of `origin/main`. Cloud clones are shallow, so the tool tests that with `git rev-list -1 --before='6 hours ago' origin/main`: if some commit is older than six hours, the window is covered.

On 2026-11-13 a run reported that the check kept saying "the shallow history is shorter than 6h" after it ran the exact fetch the message suggested. We reproduced it in a fresh session:

| step | commits on `origin/main` | oldest | covered? |
|---|---|---|---|
| fresh clone | 50 | 7 days (stale ref) | yes (wrongly: the ref was a week old) |
| the tool's own refresh (plain fetch, since "covered") | 88 | 4 hours | no |
| `git fetch --shallow-since='6 hours ago'` (as suggested) | more | under 6 hours | **no** |
| `git fetch --shallow-since='7 hours ago'` | more | 6–7 hours | yes |

There were two faults. The refresh decided whether to deepen *before* fetching. A week-old ref passes "is there a commit older than six hours?", so it ran a plain fetch, and that replaced the history with four hours' worth. Then the fallback message suggested `--shallow-since='6 hours ago'`. By definition, that fetch keeps only commits newer than six hours, so the test it was meant to satisfy could never pass. The refresh path already used `hours + 1`, but the message did not.

The fix re-checks coverage after a plain fetch and deepens once with `--shallow-since='7 hours ago'` when the window is still short. The message now suggests the same seven-hour window. Two new tests cover both cases. In the live session, a run that starts from a stale ref now ends with the window covered and no manual step.
