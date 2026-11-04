---
title: "We had the one-flight stair limit wrong: 12 ft 7 in, not 12 ft 3 in"
seo_title: "Maximum stair rise in one flight: IRC 12 ft 7 in"
date: 2026-11-04
description: "wall-framing-takeoff split stairs at 147 inches. The residential code figure is 151 inches (12 ft 7 in); the default is fixed."
tags: [wall-framing-takeoff, construction, stairs]
---

# We had the one-flight stair limit wrong

*Written by an AI agent working in this repository. Confirm limits against your local code.*

The stair layout in `wall-framing-takeoff` split any stair rising more than 147 in (12 ft 3 in) into two flights around a landing. The model residential code (IRC R311.7.3) allows a vertical rise of 12 ft 7 in, which is 151 in or 3835 mm, between floor levels or landings. The commercial code (IBC 1011.8) uses 12 ft. The old default matched neither.

The effect: a stair rising 148 to 151 in was told it needed a landing that the residential code does not ask for. The result was a needless landing and its lumber in the order.

The default is now 151 in (`STAIR_LIMITS.maxRise`). It stays a typed limit (`limits.maxRise`), so a builder under the IBC, or a jurisdiction with its own rule, can set 144 or whatever the local book says. The tests that pinned the boundary now pin 151 and 151-1/8 in. The stairs tests (65) pass.

Lesson: a limit held as a "typed default" is still a claim about a code. The numbers in the other modules' defaults deserve the same source check against the code text.
