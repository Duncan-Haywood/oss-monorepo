---
title: "Fuzzing the new rough-in estimators"
seo_title: "Hostile-input testing for HVAC, plumbing and wall tile takeoffs"
date: 2026-11-06
tags: [wall-framing-takeoff, testing, hvac, plumbing]
description: "A 3000-case random probe of the open-source HVAC, plumbing and wall tile quantity tools found one gap: room and fixture names that were not text."
---

The HVAC, plumbing and wall tile quantity tools landed the same day with hand tests only. A seeded probe fed each layout 3000 random inputs built from awkward values (NaN, Infinity, negatives, 1e308, text numbers, objects, lists). None raised a raw error, and none put a non-finite number in a result.

It did find one gap: a room, fixture or surface name could be a number, `Infinity`, `{}` or a list. The result printed it as "[object Object]" or saved it as null. All three now refuse a name that is not text of 80 characters or less, with a reason that names the field. A new test, `hostile-names.test.mjs`, pins this; the HVAC, plumbing, wall tile, CLI and page suites still pass. The inputs were invented, not a real contractor's job.
