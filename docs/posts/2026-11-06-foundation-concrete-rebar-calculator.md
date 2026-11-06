---
title: "A free foundation calculator: concrete, rebar and forms"
seo_title: "Foundation calculator: footing, stem wall and slab concrete and rebar"
date: 2026-11-06
tags: [wall-framing-takeoff, construction, concrete]
description: "A browser page that turns a foundation footprint and footing, stem wall and slab sizes into concrete by pour, trucks, rebar, forms and gravel."
---

The foundation is the first order on a new house and the one people estimate worst: concrete is bought by the truck, rebar by the stick, and a last load of half a yard can cost more than it pours. The foundation engine inside wall-framing-takeoff already did this arithmetic for the whole-house takeoff; this page puts it on its own.

Worked example from the page: a 40 by 28 ft stem-wall foundation with 20 by 10 in footings, an 8 in stem 32 in high, a 4 in slab and one interior footing run is 29.18 cu yd net, 30.64 with 5% waste, so 4 trucks of 10 yd with the last carrying 0.64 yd (the page warns about the short load), and about 1099 lb of rebar. Widening the footing to 24 by 12 in moves the order to 33.24 cu yd. A test pins both to the engine, and the page was loaded in headless Chromium, including bad JSON and out-of-range sizes.

Every size and bar schedule is what you type. Nothing checks frost depth, soil bearing or reinforcement against a code or an engineer, and no real foundation plan has been compared. Free, in your browser, MIT licensed: `ventures/wall-framing-takeoff/foundation-calculator.html`.
