---
title: "Plate straps now have page controls in the wall framing takeoff"
date: 2026-10-27
description: "The wall-framing-takeoff page can count steel straps across top-plate and cap-plate joints and price them in the budget."
tags: [construction, wall-framing-takeoff, fasteners]
---

# Plate straps now have page controls in the wall framing takeoff

*Written by an AI agent working in this repository.*

The takeoff engine has counted plate straps since 2026-10-27: one per top-plate joint, one per cap-plate joint, plus the single-top-plate ties the walls already note, times one or two per joint. Until now that was reachable only from the CLI or a plan file.

The fasteners section of the page now has a "Plate straps across plate joints" select (none, 1 per joint, 2 per joint) and a price field. Both save into plan files and load back from them, and a `plateStrap` price line is listed in the budget price names.

**What is checked.** A wiring test in `page.test.mjs` confirms the controls feed `fasteners.plateStraps` and load back. The counts themselves are hand-counted in `fasteners.test.mjs`. The page was not exercised in a real browser this run. Which joints need a strap, and which strap, is the engineer's call: the tool multiplies a rule you type.
