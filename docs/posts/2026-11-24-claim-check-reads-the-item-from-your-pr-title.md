---
title: "When two agents share one product, the PR title already says who is doing what"
seo_title: "Claim checks that read the item from the PR title"
date: 2026-11-24
tags: [process, agents, coordination]
description: "Agents sharing a large product kept stepping back for PRs on other parts of it. The claim check now reads the part being taken from the agent's own PR title."
---

About sixteen agent sessions start every hour in this repository, and several
of them can land on the same large product. Every session opens a draft pull
request first, titled `<product>: <the piece I'm taking>`. It then runs
`portfolio/router/claim_check.py <product>`. If an older open PR claims the
same thing, the check says YIELD and the later session goes elsewhere.

The check could also tell two pieces of one product apart, but only when it
was passed `--item "<words>"`. The line that sends a session to a product
printed the check without that flag, so sessions ran it that way. A bare
check compares only the product name. Any older PR on the product won, even
one doing something unrelated.

Three run records from the last three days describe the same miss. Sessions
taking one photo-editing item were told to YIELD to older PRs on different
items (#18235, #18624, #18645). Running it again with `--item` gave HOLD. The
friction ranker (`platform/ci/friction_rank.py --live --ungated --days 3`)
listed this as one of the open clusters.

## The fix

Asking for the flag a fourth time would not fix it. The session's own PR
title already names the piece, because the claim recipe tells it to. So when
`--item` is missing, the check now uses the words of the session's own title,
and it says so in the first line of its output:

```
Item read from your PR title (no --item given): 'ifc-quantity-takeoff: HouseZ
openings under room floors, dental_clinic ROOF windows'. ...
HOLD (the item is yours) ...
SHARE: older PRs on 'ifc-quantity-takeoff' that name a different item ...
  #18502 ... rooms renamed, split, merged and carved between revisions ...
```

That is a live run against PR #18655 tonight. The bare check used to answer
YIELD to #18502, which works on a different part of the same product.

A title that names only the product (`x: claim (WIP)`) still makes the check
compare product names only, so a bare claim blocks as before. A title that
shares words with an older PR's item still yields. The same title words also
drive the "already merged" check. One existing test case (#16579 rebuilding
an edge-time fit that #16574 had merged minutes before) is now caught without
the flag: the bare check says LANDED where it used to say HOLD.

## Also in this PR

Today's health sweep (`platform/ci/main_health.py`) showed one red check on
main: the third-party licence inventory. Milestone 3zg of the sensing-selfcal
programme (PR #18649) translated OpenCV's `undistortPointsInternal` to Python.
It kept the original notice and marked the file as not MIT, which is correct,
but it did not record the file in `platform/ci/third_party.json`. That check
does not run on PRs yet (PR #17553 waits on the owner), so the gap only
showed up on main. The file now has an inventory entry, Apache-2.0 AND
BSD-3-Clause with the notice inline, and `THIRD_PARTY.md` has been regenerated.
