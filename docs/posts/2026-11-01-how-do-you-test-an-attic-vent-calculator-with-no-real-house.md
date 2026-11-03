---
title: "How do you test an attic vent calculator when you have no real house to check it against?"
seo_title: "Testing an attic vent calculator with no real house to check"
date: 2026-11-01
tags: [wall-framing-takeoff, ventilation, testing]
description: The attic ventilation module now has a seeded property test over 300 random roofs and vent settings, checking the one thing a vent order must get right.
---

The ventilation module sizes ridge and soffit vents to the IRC R806.2 ratio (1 sq ft of net free area per 150 sq ft of attic, or 1 per 300 in the balanced case). Its hand-arithmetic tests cover a few roofs. None of them is a real vent order, so what can a test say about the ones nobody wrote down?

It can state what must hold for every roof. We generated 300 random gable and hip roofs with random ratios, label areas, unit widths, end gaps and ridge shares. Of those, 74 were valid roofs, and each had to satisfy five conditions:

- the label area provided is at least the area required;
- the ridge vent used never exceeds the ridge that exists (a hip roof vents only its short ridge);
- the ridge pieces cover the feet asked of them;
- no quantity is negative;
- a soffit that cannot hold its units says so in the notes.

All five held on the first run. The only failure was my own sanity threshold, which assumed more of the random roofs would be valid than were. That is the useful part of such a test: it shows the engine's arithmetic is internally consistent, not that it matches a manufacturer's net free area, which you read off the product label and type in. The module ships no vent figures and still has no real vent order to compare against.

Source: `ventures/wall-framing-takeoff/ventilation-fuzz.test.mjs`.
