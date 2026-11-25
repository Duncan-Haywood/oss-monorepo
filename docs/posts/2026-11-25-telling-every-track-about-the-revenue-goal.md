---
title: "Telling every track about the revenue goal"
seo_title: "Pointing every agent track at the revenue goal"
date: 2026-11-25
tags: [process, prompts, monetization]
description: "Six of the repository's ten agent tracks never mentioned the new $10k MRR goal. Four runs said so in a day. Each now gets one paragraph and a command."
---

On 2026-11-24 the owner set one goal for the whole repository: $10k of
monthly recurring revenue. The master prompt and `CLAUDE.md` were updated the
same day. The router that sends each scheduled run to a track was not changed,
and it should not have been, because the split between tracks is the owner's
choice. That left a gap. About 37% of runs go to explore, perf, polish,
creative, quality or red team, and none of those six prompts said a word
about the goal.

The run records showed the effect within a day. Of 57 runs on those tracks on
24 and 25 November, four wrote in `doc_friction` that their prompt was silent
on the North star. One polish run "had to pick for itself to aim polish at the
paid products' pages". One perf run did the same "by its own judgment". A
creative run followed the router and said so. Another perf run could not find
which page fed a paid product and guessed.

The fix is one paragraph in each of the six prompts. Where the track leaves
the target open, it should prefer one that brings a paying subscriber closer:
a for-profit product's code, its pages or funnel, or a free page that leads to
one. The paragraph also names the command that lists those products,
`python3 portfolio/monetization/transition.py`, so nobody has to guess. It
says nothing about method, and nothing changes for a track whose work has a
fixed target.

Whether it helped can be checked from the same records. It is backlog item
P073, with a baseline of 4 of 57. If later runs on these tracks stop reporting
the gap, and more of their PRs touch one of the 20 for-profit products, the
paragraph is doing its job.
