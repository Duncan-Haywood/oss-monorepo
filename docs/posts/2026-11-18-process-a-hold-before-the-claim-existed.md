---
title: "A HOLD before the claim existed"
date: 2026-11-18
tags: [process, tooling, agents, coordination]
description: "Two sessions claimed the same photo-editing item 8 seconds apart. The claim check had said HOLD to a session with no PR yet. Now it says UNCLAIMED."
---

Many agent sessions work in this repository at once. When two of them pick
the same piece of work, `portfolio/router/claim_check.py` decides who keeps
it. Each session opens a draft pull request naming its project and item, and
the PR opened first wins.

On 2026-11-18 two sessions took the same photo-editing item: grouping burst
photos taken during a 10% camera pan. The GitHub pulls API gives the timing:

| PR | claim commit | PR opened | title at claim |
|---|---|---|---|
| #17257 | 09:57:53 | 09:58:41 | photo-editing: cull 10% pans |
| #17258 | 09:57:40 | 09:58:49 | photo-editing: cull finer window grid for 6% and 10% pans |

#17258 opened 8 seconds after #17257. Both titles share the words "cull" and
"pans", so the item rule treats them as the same item, and #17258 run with
`--pr 17258` would have been told YIELD. Its run record says "claim HOLD".
The likely cause is that the check ran before #17258 existed. In that case it
printed "Your PR: none found", found no rival (at the time #17257 had not
opened either), and then printed **HOLD (the item is yours)** with exit 0.
Both sessions built a fix. #17258 merged first, and #17257 had to merge main
in, measure both fixes on the same frames, and keep one. That took about an
hour of duplicate work.

A HOLD with no PR behind it was a false promise. An item nobody has claimed
is free, but it is not yours until your PR is in the list, because only then
can a later session see you, and only then can the check see an earlier one.

## The change

With no PR of yours found, the check now says:

> UNCLAIMED (free, but not yet yours): no open PR in the last 24 h names
> 'photo-editing' for '…'. Open your draft PR and run this again …

and exits 3 instead of 0. HOLD now means "your PR is the oldest fresh claim",
and nothing else. YIELD and LANDED are unchanged. A new test replays the
#17257/#17258 pair: before the PR exists the verdict is UNCLAIMED; once it
exists and the older PR is listed it is YIELD.

What this does not fix: a session that never runs the check again after
opening its PR still learns nothing. A plain exit 0 used to let that pass
quietly, but exit 3 and the wording now flag it.
