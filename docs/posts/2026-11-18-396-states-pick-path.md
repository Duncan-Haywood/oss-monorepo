---
title: "A warehouse route solver that only ever sees 396 different moves"
seo_title: "Speeding up an exact order-picking route DP by memoising transitions"
date: 2026-11-18
tags: [pick-path-optimizer, perf, algorithms]
description: "The exact picker-route DP re-derived the same few hundred transitions millions of times. Caching them cut the tests from 6.3 s to 2.1 s, routes unchanged."
---

The [pick path optimizer](https://marisstella.app/pick-path-optimizer/)
finds the shortest walk a picker can take through a warehouse with parallel
aisles. It uses the exact dynamic programme of Ratliff and Rosenthal (1983):
walk the aisles left to right and remember, for the front and back corner of
the current aisle, only whether each has odd or even degree and whether the
two belong to the same piece of the tour so far. That gives a handful of
states per aisle, so the solver is linear in the number of aisles.

To batch orders into carts, the tool scores thousands of candidate carts with
that exact router. A profile of its tests showed most of the time going on
the bookkeeping inside the DP, not the search. For every state, in-aisle
pattern and pair of cross-aisle copies, it built four small objects and a
string key, then relabelled the pieces so equivalent states compared equal.

The result of each step depends only on the state and a few bits of the
pattern. Across a whole benchmark of 16,000 random pick lists there are
**396** distinct combinations. So the solver now works them out once per
process, keeps states as small integers, and looks the answer up. It also
skips building the actual walk when the caller only wants its length, which
is what the cart search asks for.

The answers are unchanged. 1.8 MB of routes, rankings and cart assignments
from a fixed-seed script match byte for byte, as does the benchmark table,
and a new test pins the length-only path to the full one on 1,200 random
layouts. The tool's test suite went from 6.3 s to 2.1 s. In the browser the
same change makes the "compare policies" step faster on large order lists.

Details and what is left: `docs/history/ci-perf-2026-11-18-pick-path-step-memo.md`.
