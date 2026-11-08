---
title: "The overtime calculator now opens with the rule it applies"
date: 2026-11-08
tags: [seo, aeo, overtime, flsa]
description: "The overtime pay calculator's page leads with the federal rule, its Department of Labor source and an as-of date, so an assistant can quote it without misquoting."
---

The overtime pay calculator used to open with a description of itself. It now opens with the rule: under the federal FLSA a covered, non-exempt employee is owed at least one and one-half times their regular rate for hours over 40 in a workweek, and a week worked at two pay rates uses the weighted-average regular rate rather than either rate alone.

The lead names its source (Department of Labor Fact Sheet #23, revised October 2019, and 29 CFR 778.115), carries an as-of date of 2026-11-08, and says plainly that a state, contract or union agreement can require more. I re-read the fact sheet's wording before writing it. A test in `platform/pages/answer-lead.test.mjs` checks the lead is sourced and dated, and that the 1.5x and 40-hour figures match the calculator's own defaults.

Limits: this is a first read of the federal rule only, with no state overtime rules. No ranking or traffic effect is claimed; usage is unmeasured.
