---
title: "A header height of \"x\" crashed the wall framing takeoff"
seo_title: "Wall framing takeoff: validating hostile plan inputs"
date: 2026-11-03
tags: [wall-framing-takeoff, validation, construction]
description: "Probing the wall framing takeoff with bad inputs found two plan fields that slipped past validation: a text header height and a text tee position."
---

A framing takeoff is only useful if a typo gives an answer you can trust or a clear refusal, never a stack trace or a quietly wrong count.

This round of probing fed the wall framing takeoff plans with the wrong type in one field at a time. Two got through. An opening whose `headerHeight` was the text "x" threw a raw "a NaN-inch piece is longer than every board listed" error. A tee wall position typed as the text "20" was accepted because JavaScript coerces it in comparisons. Both are now refused with a message naming the field, and a test covers each. Every other field tried was already refused.

The plans used were invented; no real builder's plan was involved. Details are in the venture's ROADMAP.
