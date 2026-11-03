---
title: "A wall length typed as text used to pass the framing takeoff check"
seo_title: "Framing takeoff now refuses plan numbers typed as text"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, validation]
description: "A sweep over the framing takeoff's plan, deck, drywall and floor inputs found fields where the text \"96\" passed as a number."
---

A plan file is often written by hand or by another program, and JSON makes it easy to write `"length": "96"` instead of `96`. In JavaScript the range checks `"96" >= 12` pass, so several inputs of the wall framing takeoff accepted the text and then did arithmetic on it.

A short script turned every numeric field of the sample plan, deck, drywall and floor into a string, one at a time. Eight fields got through: wall length, lumber-list length and price, ceiling width and depth, and floor width, depth and beam. All now return a plain error naming the field. The sweep stays in the repo as `text-numbers.test.mjs` and passes on all four samples.

It was checked on invented plans only, not against a builder's real files.
