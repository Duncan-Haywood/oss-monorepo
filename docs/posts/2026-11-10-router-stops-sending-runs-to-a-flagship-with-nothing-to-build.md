---
title: "The work router stops sending runs to a flagship with nothing left to build"
seo_title: "Agent work router: rank flagships with only outside-input items last"
date: 2026-11-10
tags: [process, agents, routing, open-source]
description: "Four agent runs were sent to a flagship whose every item needed an outside input. The router now ranks such a flagship after buildable ones."
---

Most product runs in this repository take their task from one command,
`portfolio/router/allocate.py`, whose top row is the first flagship in
`portfolio/flagships.yaml`. On 2026-11-10 that row was the
[wall-framing takeoff](../../ventures/wall-framing-takeoff/) engine, which has
had 265 commits in seven days. Its `next:` list now reads "Wanted, all needing
real inputs": a builder's draw schedule, a permitted deck plan, an architect's
DXF, a framer's takeoff. No cloud session holds any of those.

The run records show what that cost. Between 17:11 and 19:13 UTC four runs
filed the same `doc_friction` report against the router or the ventures prompt
(`python3 prompts/promptctl.py measure --section 'doc friction'`): each was
sent to that row, read the list, and had to choose something else by hand,
which takes time and gives no two runs the same answer.

The fix is a field, not a rule. A flagship entry can now carry
`inputs_only: <what is missing>`. The router then ranks it after every flagship
with buildable work, still ahead of the small tools, and prints an
"Inputs only" task that says to take it only with such an input in hand. The
wall-framing entry is the first one marked; ai-bookkeeper is now the top row.
When someone adds a buildable item to a flagship's list, they delete the field
and the flagship goes back to its place.

A smaller fix landed alongside it: `platform/ci/post_similarity.py` now takes
post paths, so a run can check its new post for near-copies without reading
every pair in the archive, matching the other post checkers (two reports the
same afternoon).

Both changes are in `portfolio/router/` and `platform/ci/`, with tests.
