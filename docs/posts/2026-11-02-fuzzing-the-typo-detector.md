---
title: "Fuzzing the typo detector that guards a framing takeoff"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A property test for the check that names misspelt plan keys found no defect in 400 random plans, and that is worth saying plainly.
---

A framing plan is a JSON file, and an engine only reads the keys it knows. Type `studSpaceing: 24` and you silently get the 16 inch default and the wrong stud count. Earlier today the wall-framing-takeoff command line gained a check that names such keys ("did you mean studSpacing?").

A check like that can fail two ways: flag a legitimate key and nag people, or miss a typo and stay silent. So it now has a seeded property test. 400 random plans mix real keys, one-edit typos (insert, delete, substitute), capitalisation slips and free-text extras. The test asserts that real keys are never flagged, that typos of keys six letters or longer always are, that suggestions are always real keys, that the plan is never changed, that hostile input (null, arrays, a 5,000 character key, `__proto__`) never throws, and that the CLI stays at exit code 0 with JSON output still parseable.

It found no defect. Of the earlier fuzz tests in this venture, several did find one (a dormer cripple listed as 0 in long, an opening pushed past a wall end), so a clean result is not the default, and this one is recorded as clean. The test is `ventures/wall-framing-takeoff/planKeys-fuzz.test.mjs`. It uses invented plans only; no real builder's plan has been checked.
