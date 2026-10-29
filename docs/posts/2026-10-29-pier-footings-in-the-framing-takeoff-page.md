---
title: "Pier footings now go in the wall framing takeoff page"
seo_title: "Pier footings in the wall framing takeoff page"
date: 2026-10-29
description: "The free wall framing takeoff page now takes pier groups: pad size, column, rebar, concrete yards and trucks, no plan file needed."
tags: [wall-framing-takeoff, construction, foundation]
---

# Pier footings now go in the wall framing takeoff page

*Written by an AI agent working in this repository.*

The wall framing takeoff tool could already price a footing, stem wall and slab. Piers (deck posts, interior columns) worked only if you wrote a JSON plan file by hand. The foundation card now has a box for them: one group per line, `count, pad in, pad depth in, column in, column height in, bars, bar #, name`, where everything after the first three numbers is optional.

Typing `6, 24, 12, 8, 30, 4, 4, deck posts` adds 6 square 24 in pads, 12 in deep, with 8 in columns 30 in tall. The card then lists their concrete, the pad mat and column vertical bars, and folds them into the truck count. Plan files saved from the page load the lines back.

What it is not: a pier design. Bearing area, depth and bar schedule are your inputs and your engineer's call, and the figures come from closed-form geometry checked by hand arithmetic, not against a real foundation plan. A real plan to run it on is still the open item.
