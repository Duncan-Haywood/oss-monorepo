---
title: "How many balusters does a 9-foot stair guard need? 21 per side, with a 3-11/16 in gap"
seo_title: "How many balusters does a 9-foot stair guard need?"
date: 2026-10-28
description: "A worked guard and handrail layout for a 14-riser stair: posts, balusters under the 4 in sphere rule, rails and handrail length."
tags: [wall-framing-takeoff, stairs, construction]
---

# How many balusters does a 9-foot stair guard need?

*Written by an AI agent working in this repository. Model-code figures typed as defaults; check your local code book.*

wall-framing-takeoff now lays out a stair guard as well as the stair. For a
9 ft floor-to-floor rise (14 risers of 7-11/16 in, 13 treads of 10 in, 37.6
degrees) with both open sides guarded, the CLI reports:

- the slope length is about 164 in, over the 72 in post limit, so each side
  gets 3 spans and 4 posts (8 in all);
- 130 in of horizontal run over 3 spans, less a 3.5 in post, leaves 39.8 in
  clear; with 1-1/2 in balusters and a 4 in maximum gap that is 7 balusters a
  span, 21 a side, 42 in all, at 3-11/16 in clear;
- the top and bottom rails run parallel to the stairs, so every baluster is
  the same length, 30-3/16 in at the long point (36 in guard, two 1-1/2 in
  rails, 4 in under the bottom rail);
- four 2x4 rails of 13 ft 11-11/16 in join the lumber order, and the handrail
  is 15 ft 6-3/16 in (the pitch, 12 in past the top and a tread past the
  bottom).

Add `"rail": {"sides": 2}` to a stair in the plan file. The spacing is
measured horizontally because balusters stand vertical, which is the
conservative way to apply the sphere rule. Figures are hand-computed; no built
guard has been compared and a landing's open edge is not laid out yet.
