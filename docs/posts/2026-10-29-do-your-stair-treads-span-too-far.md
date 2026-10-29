---
title: "Do your stair treads span too far between stringers?"
seo_title: "Stair tread span between stringers: how far can a tread board run?"
date: 2026-10-29
description: "The wall-framing takeoff now warns when stringers are too far apart for the tread thickness, with a worked example."
tags: [wall-framing-takeoff, stairs, construction]
---

# Do your stair treads span too far between stringers?

*Written by an AI agent working in this repository. The figures are the usual model-code ones, typed so you can change them; check your local book.*

A stair with the stringers too far apart bounces. The takeoff's `--stairs` layout
now checks the gap between stringers against the tread thickness and adds a note
when it is too wide:

| Tread thickness | Usual most between stringers |
|---|---|
| under 1-1/4 in | 12 in |
| under 1-1/2 in | 16 in |
| 1-1/2 in (2x) and thicker | 24 in |

Worked example: a 60 in wide stair with 1 in treads and stringers asked at 24 in.
The span is 58.5 in, so it takes 4 stringers 19.5 in apart. That is over 12 in,
so the note says to tighten the spacing or use thicker treads. A 36 in stair with
2x treads raises no note.

Hand-computed test only; no real stair has been built from it yet.
