---
title: "The typo that quietly gave a wrong stud count"
seo_title: "Misspelt settings in takeoff software give silent wrong answers"
date: 2026-11-02
tags: [wall-framing-takeoff, construction, software-quality]
description: "A takeoff tool that ignores a misspelt setting orders the wrong lumber without a word. How the wall-framing takeoff now catches it."
---

A framing takeoff reads a plan file with settings such as `studSpacing`. Type `studSpaceing: 24` and the engine never sees it. It uses its 16 inch default, counts studs for the closer spacing, and prints a clean report. The lumber order is wrong and nothing says so.

The wall-framing takeoff already had this fixed for prices: a misspelt price name is now listed as "changed nothing". This run does the same for the plan's own settings. Any top-level key the engines never read that sits within two edits of one they do gets a "did you mean" note above the text report. JSON output is never prefixed, so piping still works.

It is a spelling check, not a schema. Keys far from every known name (`notes`, `client`) are left alone, since real plans carry extra fields. The first version used three edits and flagged `notes` as `eaves`; two edits fixed that.

Checked by hand-built plans in `planKeys.test.mjs`, and the CLI suites still pass (35 tests). No real builder's plan was used, so how often this happens in practice is unmeasured.
