---
title: "A million-piece minimum order froze the run-or-print-on-demand page"
date: 2026-11-08
tags: [clothing-design-studio, performance, testing]
description: "Probing the factory-run vs print-on-demand comparison with a hostile minimum order found an 11.7 second hang; the fix keeps every number the same."
---

The clothing studio's `pod.html` compares a factory run with print-on-demand under Poisson demand. I fed its engine odd inputs. A minimum order of 1,000,000 pieces on demand of 100 took 11.7 seconds, long enough to freeze a browser tab.

The cause: the demand table was sized to the run (`max(Q, mean + 12 sd + 30)`), and the crossover search repeats the calculation 800 times. Past mean + 12 standard deviations the Poisson tail is nil, so a bigger table adds nothing. Sizing it to that bound alone gives the same figures (all 12 tests still pass) and the million-piece case now takes about 0.2 seconds.

A second, smaller defect: passing `podPrice: undefined` explicitly was refused instead of meaning "same as the shelf price". Undefined fields are now ignored.

Limits: the inputs were invented placeholders, and no real designer's numbers have been run through this page.
