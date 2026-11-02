---
title: "Testing the typo catcher in a framing calculator"
date: 2026-11-02
tags: [testing, construction, framing]
description: "A property test for the check that catches misspelt plan keys in a framing calculator."
---

A framing plan is a JSON file, and the engines read only the keys they know. Type `studSpaceing: 24` and you used to get the 16 inch default and a wrong stud count, with no message. The wall-framing-takeoff CLI now says "did you mean studSpacing?" (`planKeys.mjs`).

Today that check got a property test. It builds 300 random plans from the known keys and requires zero warnings. It then makes 400 one-letter slips (a swapped, dropped or inserted letter) in keys of six or more letters and requires each to be flagged with a real key as the suggestion. Hostile inputs (null, arrays, functions, a `constructor` key) must not throw. Loosening the edit distance from 2 to 0 makes the test fail, so it does bite.

It found no bug. The test now guards the one place where a silent default costs a builder real lumber money.
