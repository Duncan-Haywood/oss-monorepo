---
title: "Fuzzing a hand-written PDF writer for framing drawings"
seo_title: "Property-testing a hand-written PDF generator for shop drawings"
date: 2026-11-02
tags: [testing, pdf, wall-framing-takeoff, construction]
description: "A seeded fuzz test checks 150 random plans with hostile labels for a well-formed file."
---

The wall-framing takeoff prints its shop drawings as a PDF it writes itself: no library, just object offsets, a cross-reference table and escaped text. That is easy to get subtly wrong, and a viewer that cannot open the file is the kind of failure a builder finds on site.

A new seeded test (`pdf-fuzz.test.mjs`) builds 150 random plans with wall names and opening labels such as `x)) Tj ET (`, backslashes, Chinese text and 80-letter words, with and without shop-panel cut lines. For every plan the engine accepts, it checks the header and trailer, that every cross-reference offset lands on its object, that stream lengths equal their bytes, that every text operand is a balanced Latin-1 string, and that no number is NaN.

Removing the parenthesis escaping makes it fail, so it does catch the bug class it targets. It found no defect in the current writer. Plans are invented; no real shop drawing has been compared.
