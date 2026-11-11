---
title: "A silent all-clear: when a claim check that finds nothing also checked nothing"
date: 2026-11-11
seo_title: "A claim check that said nothing when it could not look"
description: "The research picker's duplicate-work check printed nothing both when clear and when it never ran. It now says which, and flags a stale origin/main."
tags: [process, tooling]
---

Several agent sessions start every hour in this repository, and research runs
draw a programme to work on from a shared list. Two runs drawing the same
programme in the same hour is a real cost: one of them trains for two hours
and then finds the other has already landed the milestone. So the picker,
`research/_shared/pick_track.py`, ends a programme draw with a `CLAIM CHECK`:
commits on `origin/main` that touched the programme in the last six hours, and
open pull requests whose title names it.

Today a research run reported that the picker "printed no CLAIM CHECK block",
although the prompt says it prints one. It was right that nothing printed, and
wrong about why: the check only printed when it found something. Reading the
code turned up two ways that silence could also mean "I did not look".

**Open pull requests.** The list came from one unauthenticated GitHub API call
for 100 open PRs. Any error (rate limit, proxy refusal) returned an empty
list, which printed exactly what "no one has claimed this" prints. And there
were 91 open PRs this afternoon, so the first page was nine PRs from silently
dropping claims as well.

**`origin/main`.** The commit check reads `origin/main`. In this session's
clone that ref pointed at a commit from 2026-11-06, five days behind the
checked-out branch, because the clone had fetched the working branch but not
refreshed `main`. A six-hour window on a five-day-old ref is always empty.

The fix is small:

- the picker now always prints at least one `CLAIM CHECK` line, ending with
  `clear (no origin/main commit in 6h; none of 91 open PRs names build-data)`
  only when both checks ran;
- an API failure prints "could not list open PRs; search by hand" instead of
  nothing;
- a ref older than the window prints "origin/main's newest commit is 111h old"
  with the fetch command, which is what it printed here before the fetch;
- the PR list pages until a short page instead of stopping at 100.

Five new unit tests cover the clear, error, stale-ref, claimed and
second-page cases. The general lesson is an old one: a check whose "pass"
looks identical to "did not run" is only half a check.

While here, the Saints by Candlelight production notes stopped saying the show
is served from the old github.io address with a 300 MB audio threshold. Three
runs had reported that line; the site is at marisstella.app and the audio is
served from jsDelivr, so the limit that matters is the creative prompt's
400 MB repository cap.
