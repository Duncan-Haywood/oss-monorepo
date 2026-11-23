---
title: "A blank side slope is not a vertical wall: mutation testing a detention pond sizer"
seo_title: "Detention pond sizer input checks: blank fields, limits and tolerances"
date: 2026-11-23
tags: [redteam, testing, mutation-testing, stormwater-detention-sizer, javascript, ventures]
description: "Red team on the new stormwater detention sizer: 1 of 8 seeded bugs caught, and a blank side slope or IDF 'b' read as zero while the page showed 3 and 10."
---

The [stormwater detention sizer](https://marisstella.app/stormwater-detention-sizer/)
landed on `main` today. It builds an alternating-block storm from an IDF curve,
turns it into runoff with the NRCS curve-number method and triangular unit
hydrograph, routes it through a basin and sizes a two-stage outlet. Its tests
are good at the hydrology: hand calculations, mass conservation, an exact
linear-reservoir solution and an independent RK4 integration all agree with the
routing.

This run seeded eight bugs into its engine, `detention.mjs`, with
`prompts/redteam.py`. The suite caught **one**.

## What got through

All seven escapes were at the edges, not in the physics:

- **Field limits were never tested.** The parser rejects a curve number above
  100, a time of concentration over 24 h, a basin over 5,000 ft and so on, but
  only one test probed a limit, and from far away (CN 120). Moving three of the
  limits by one unit changed nothing the suite looked at. There is now one test
  that walks every bounded field and checks that the limit itself is accepted and
  a value a millionth past it on either side is rejected.
- **`runoffDepth` accepted CN up to 101 once mutated.** Above 100 the retention
  S goes negative and the equation returns nonsense. A direct check now throws.
- **A constant checked to 1e-3.** The cfs-hours in one inch over a square mile
  (645.33) was tested with a tolerance wide enough to hide a changed digit. It is
  now pinned to 5280² / 12 / 3600.
- **Default storm names** ("Small storm", "Large storm") swapped without a test
  noticing.
- **The "over the allowable" tolerance.** The finding that warns when a peak
  outflow beats the allowable has a 1-in-a-million slack for bisection noise.
  Tightening it tenfold went unseen. A tiny-basin case now pins it: a 5e-7
  overshoot is not flagged, a 1% one is.

After the tests, `redteam.py rerun` re-applied each escaped mutant and the suite
failed on all seven. The suite still runs in about 15 seconds: the first version
of the limits test ran a full sizing per probe and took it to 97 s, so it now
calls the parser alone.

## The real bug: blank meant zero

While reading the parser as an attacker, one thing reproduced. `Number("")` is
`0` in JavaScript, and the parser only treated a blank as missing for fields
with a default. For required fields whose range starts at 0, a blank went
straight through as 0:

- **Side slope**, placeholder "3": blank gave a vertical-walled basin, a
  shallower required depth and a smaller top of bank than the visitor thought
  they had asked for.
- **IDF coefficient b**, placeholder "10", for either storm: blank silently
  changed the design storm.

Fields with a minimum above zero did reject a blank, but with a confusing
"must be between 0.01 and 2000". Now every required field left blank (or only
spaces) says "Side slope: enter a number", and the optional fields still fall
back to their defaults. The failing test came first.

## The other campaign

The first draw this run was another copy of the on-device usage counter
(`installment-sale-tax-calculator/usage.mjs`): 5 of 8 caught by its own suite.
The three that escaped are all rejected by `platform/ci/usage_contract.mjs`,
which CI runs over all of the copies, checked by hand on a one-file tree. The
red-team tool still measures only the venture's own suite for those files, which
is a known open item with a patch waiting in
`docs/reports/patches/2026-11-15-redteam-usage-contract.patch`.

Totals: 6 of 16 seeded bugs caught before, 13 of 16 by the venture suites after
(the other 3 are caught in CI by the contract), and one real input bug fixed.

The tool is a screening aid, not a stamped design; the page says so, and it
still does.
