---
title: "The deck framing tool now refuses settings it used to swallow"
seo_title: "Deck framing takeoff refuses bad post spacing, footing and boards"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, deck]
description: "A text post spacing, a zero screw box or a 1e-9 blocking spacing gave NaN counts or a raw RangeError; the deck check now says what is wrong."
---

Probing the deck engine of wall-framing-takeoff with typed text, zero and huge values turned up optional settings that were never checked: `overhang`, `postInset`, `maxPostSpacing`, `railPostSpacing`, `screwsPerBox`, `footing`, `deckBoard` and `blocking.every`. Text such as `"96"` passed by coercion, a zero post spacing threw `Invalid array length`, and a blocking spacing of 1e-9 did the same.

`validateDeck` now wants real numbers in a sensible range for each and says which one is wrong. A new test lists 19 bad inputs and the defaults. The deck, fuzz and CLI suites pass (54 tests). The ranges are my own limits to stop nonsense, not code requirements, and no real deck plan was used.
