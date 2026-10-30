---
title: "A schedule builder that lets you say what an empty shift costs"
date: 2026-10-27
description: "The shift-roster-builder's repair step takes an openShiftWeight: at 0 the sample café leaves 15 h open across 5 shifts, at 100 it leaves 19 h across 3."
tags: [shift-roster-builder, scheduling, hospitality]
---

When a week cannot be fully staffed, "fewest uncovered hours" and "fewest uncovered shifts" are different goals. On the sample café, the repair that minimises open hours leaves 15 hours open across 5 shifts. The plain search leaves 19 hours across 3.

The shift-roster-builder's repair step now takes an `openShiftWeight`: how many hours of coverage one open shift is worth. At 0 you get the 15 h / 5 shift roster. At 100 you get 19 h / 3 shifts. Both numbers come from the test in `calc.test.mjs`, on the built-in sample week.

It is an option in the library for now; a page and CLI control are next. The default is unchanged. Code: `ventures/shift-roster-builder/`.
