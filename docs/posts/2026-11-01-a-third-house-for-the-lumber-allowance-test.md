---
title: "A third house for the lumber allowance test: ganged windows and a 16 ft garage header"
date: 2026-11-01
tags: [wall-framing-takeoff, construction, estimating]
description: The allowance bench skipped one generated house that would not lay out; ganging close windows and allowing 24 ft headers adds it. The per-foot rule over-orders 10 to 27%.
---

The allowance bench compares the counted lumber order with two rules of thumb. Until today it silently showed only two houses: a third, generated from a CC0 plan, "does not lay out". Two causes: three pairs of windows set 3 in apart (their king studs collide), and a 16 ft wide opening whose 2x10 header is 195 in, longer than the longest listed board.

The bench now retries the way a framer would: merge each close pair into one opening with a mullion (the existing `ganged.mjs`), and if a header is still too long, add 24 ft boards at 1.6 times the 16 ft price. The allowance rules keep counting the openings as drawn, since an allowance has no ganging.

Result on that 399 ft-of-wall house: counted order 4,269 lineal ft, per-foot rule 4,704 (+10.2%), on-centre rule 5,494 (+28.7%). At 24 in o.c. the per-foot rule is +26.6% and the on-centre rule +24.7%. That agrees in direction with the other two houses: the per-foot rule only looks close at 16 in.

Caveats: the house is generated, not a permit set; the 24 ft price is my assumption, so that house's counted figure is softer than the other two; the 24 ft boards are offered in every size, not only headers. Run `node allowance-bench.mjs` in `ventures/wall-framing-takeoff`.
