---
title: "A flooring calculator that counts boxes, tiles and carpet seams"
seo_title: "Free flooring calculator: boxes, tile, grout and carpet"
date: 2026-11-05
tags: [wall-framing-takeoff, calculators, construction]
description: "The framing takeoff's flooring engine now has its own free page: plank boxes with waste, tiles with thinset and grout, carpet from the roll."
---

Yesterday the framing takeoff gained a flooring engine with no page. Today it has one: `flooring-calculator.html`, free, running in the browser, nothing sent anywhere.

Type a room and pick plank, tile or carpet. A 15 x 12 ft plank room is 180 sq ft, 192.6 with 7% waste, so 10 boxes of 20 sq ft. An 8 x 5 ft bath in 12 in tile with 1/8 in joints is 44 tiles, 1 bag of thinset and about 2.6 lb of grout. A 12 x 12 ft carpet room is 12.5 linear feet off a 12 ft roll, with pad and tack strip.

Those three sums are checked by hand in `page.test.mjs`, and the page was run in Chromium. The waste and coverage figures are typed defaults, not any maker's; there is no real flooring order behind them, and the page says so. Every other calculator now links to it.
