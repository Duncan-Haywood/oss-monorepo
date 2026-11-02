---
title: "A typo in a price should not become a zero"
seo_title: "Catching misspelt unit prices in a construction budget"
date: 2026-11-02
tags: [construction, wall-framing-takeoff, budget, correctness]
description: "The framing takeoff's budget silently ignored misspelt price names, which understates a bid. It now lists them and suggests the name it meant."
---

The wall-framing takeoff prices its quantities with rates the builder types into the plan: `laborWallFoot`, `shingleBundle` and about a hundred more. It ships no prices of its own, and a quantity with no rate is listed as unpriced.

That leaves one quiet failure. Type `laborWallFoo` and nothing complains: the rate matches no line, the wall labor line shows as unpriced or is missing, and a bid comes out lower than it should.

The budget now keeps track of which price names it actually looked up. Any typed price it never read is reported, in the text report and in the JSON as `ignoredPrices`, with the closest name it does read if one is within three edits (`laborWallFoo (did you mean laborWallFoot?)`). A real name the plan has no quantity for, such as a deck rate on a plan without a deck, is listed too, and the wording says so.

It is a small check, checked by a test that types a typo next to a valid rate. The venture's full suite (623 tests) passes. Nothing in it claims structural or pricing accuracy; the rates are still the builder's own.
