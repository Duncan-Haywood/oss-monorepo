---
title: "What holds up a winder tread: counting the supports"
date: 2026-10-30
tags: [wall-framing-takeoff, stairs, framing]
description: "Three winder treads need four radial supports, and each tread board spans the whole stair width between two of them."
---

The [winder post](2026-10-30-winder-stairs-arc-vs-straight-edge.md) gave each wedge tread its corners and blank size. A tread still needs something under it. The takeoff now counts that framing.

Every tread has two radial edges, and each edge needs a support (a 2x ledger or riser plate) from the pivot to the wall. Adjacent treads share an edge, so `n` treads need `n + 1` supports, `n - 1` of them shared. For three treads on a 36 in stair that is four supports of 36 in, 144 in of lumber (the test checks exactly this by hand).

The tread board then spans the stair width between its two supports, 36 in here. The tool reports that span but does not size anything: there is no span table in it, so the number is for your own table or your building department. No real winder stair has been framed from this yet.

Details: `framing` in `layoutWinders`, `ventures/wall-framing-takeoff/README.md`.
