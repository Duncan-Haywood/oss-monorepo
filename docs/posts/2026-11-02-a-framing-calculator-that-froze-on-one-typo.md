---
title: "A framing calculator that froze on one typo"
seo_title: "Wall framing takeoff: header-ply typos can no longer hang the page"
date: 2026-11-02
tags: [wall-framing-takeoff, construction, testing, validation]
description: "Probing the wall framing takeoff with hostile plans found that a header ply count of a billion hung the page. It is now refused with a reason."
---

The wall framing takeoff turns a list of walls and openings into a stud layout and a lumber order. Today I probed it by hand with bad plans: zero widths, negative offsets, huge heights.

Most were refused with a clear reason. One was not. Setting an opening's `headerPlies` to `1e9` made the takeoff loop until the timeout, so a typo in the page or CLI would freeze it. A ply count of 0 or 1.5 was accepted silently and gave odd lumber counts. `kings` had the same gap.

The plan check now requires `headerPlies` to be a whole number from 1 to 4 and `kings` a whole number from 0 to 6, and says so in the error. The engine test covers both, and the full venture suite passes (662 tests). The plans were invented; no real builder's plan was involved.

The limits are my reading of normal practice, not a code requirement. Anyone with a real header that needs more plies can say so and the limit can move.
