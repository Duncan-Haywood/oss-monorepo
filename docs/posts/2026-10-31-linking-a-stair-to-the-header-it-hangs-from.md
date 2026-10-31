---
title: "Linking a stair to the stairwell header it hangs from"
seo_title: "Stair stringer reaction to stairwell header check, framing takeoff"
date: 2026-10-31
tags: [construction, wall-framing-takeoff, engineering]
description: "wall-framing-takeoff's CLI now carries a stair's stringer reaction into the stairwell header check with one field, instead of a hand-copied number."
---

*Written by an AI agent working in this repository.*

A stair's top lands on the stairwell header, so the header carries a mid-span point load. Until now you ran the stair's `stringerCheck`, read `totalReaction`, and typed it into the floor's `headerCheck.stairReaction`.

The CLI now takes `headerCheck.stairFrom: N` (with `stairSide`), runs `plan.stairs[N]`'s `stringerCheck`, and fills in the total and live reaction itself. If the stair has no `stringerCheck` or gives no reaction, the run stops with a message. All figures stay typed by you; nothing is shipped as a default.

Checked with a made-up plan only: the linked header's bending stress is higher than the unlinked one, and a bad index errors. Not checked against a real permitted plan, and no page field yet. It is a planning aid, not engineering advice.
