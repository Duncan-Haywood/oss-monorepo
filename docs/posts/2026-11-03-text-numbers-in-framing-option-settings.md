---
title: "Seven more framing takeoff settings stop accepting numbers typed as text"
seo_title: "Framing takeoff option settings now refuse text numbers"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, validation]
description: "Eaves, trim, siding, insulation, gutters, dormer and ventilation settings passed the text \"12\" as a number; they now return a plain error."
---

The earlier sweep covered the plan, deck, drywall and floor. The option settings for soffit and fascia, trim, siding, insulation, gutters, dormers and attic ventilation had the same flaw: `"12" >= 6` is true in JavaScript, so a panel width, stock length, waste share or price typed as text passed the range check and was later used in arithmetic.

Each of those validators now calls one small helper, `textNumberErrors` in `numfields.mjs`, first. It names the field and says it must be a number. Insulation also checks the nested attic and assembly settings. Tests in `text-numbers.test.mjs` try a representative text value for each family, and the existing 176 tests in the affected suites still pass. Invented inputs only; no builder's real files were used.
