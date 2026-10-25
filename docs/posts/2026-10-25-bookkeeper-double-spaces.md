---
title: "Doubled spaces hid the merchant from the bookkeeper"
date: 2026-10-25
description: "A check that re-cases and double-spaces bank descriptions showed the bookkeeper losing the merchant name."
---

Hack Club's HCB feed, the source of the last four held-out reads, was refused by this session's proxy. So the run wrote a different check: take each of the repo's CSV fixtures, wrap every field in quotes, and re-case or double-space each description, then ask for the built-in suggestion again. The answer must not change.

Seven fixtures failed, all on doubled spaces ("Office  Depot", "SHELL  OIL  57444"). The keyword layer matched on the raw lowercase text, so two spaces between words meant no match. Real card descriptors pad fields like this. `suggest` now collapses whitespace first (`categorize.mjs`); 371 generated tests in `metamorphic.test.mjs` pass. Own fixtures only; no real export tried this time.
