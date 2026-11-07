---
title: "A free soffit and fascia calculator that shows its packing"
seo_title: "Soffit and fascia calculator: panels, fascia boards, J-channel"
date: 2026-11-07
tags: [wall-framing-takeoff, construction, calculator]
description: "Type a house size and overhangs; get soffit panels, fascia boards and J-channel packed into stock lengths with waste. Runs in your browser."
---

The framing takeoff already counted soffit, fascia and J-channel from the roof it had laid out. It had no page of its own, so anyone searching for "how much soffit do I need" never reached it. It does now: `soffit-fascia-calculator.html`.

A 24 x 40 ft gable with 12 in overhangs and open rakes has 84 ft of eave, so 84 sq ft of soffit: 8 panels of 12 ft after 10% waste. Fascia runs along the eaves and up the four rakes (142 ft), which packs into 11 boards of 16 ft. A hip roof with 18 in overhangs has 140 ft of eave, two courses of panels, and 27 panels. Each figure is recounted by hand in the test suite, and the page was run in Chromium. Waste, panel width and stock lengths are typed, not assumed; no real supplier's catalogue has been checked.

Everything runs in the browser and nothing is sent. Code and tests: `ventures/wall-framing-takeoff/`.
