---
title: "A backing-stud setting of one billion hung the framing takeoff"
seo_title: "Input validation bug in an open-source wall framing takeoff tool"
date: 2026-11-02
tags: [wall-framing-takeoff, construction, testing, input-validation]
description: "Probing the wall framing takeoff with hostile settings found two unchecked numbers. One hung the engine; others gave silent nonsense. Now refused with a reason."
---

The wall framing takeoff turns a plan (walls, openings, stock) into a stud count and a buying list. Its plan check already refuses bad stud spacing, stud length and plate joints. Probing the rest of the settings by hand turned up two it never looked at: `cornerExtraStuds` and `teeExtraStuds`, the number of backing studs at corners and tees.

What happened with a value of one billion: the engine looped once per backing stud and never finished, so a page or CLI call would hang. A negative value or 1.5 was accepted and produced a stud count no builder could frame.

The check now requires a whole number from 0 to 6 and says so in the error. The test covers 1e9, -5, 1.5, 7, NaN and a string, and confirms 0, 1, 2 and 6 still run.

Limits: this is input hygiene on invented plans. No real builder's plan was involved, and the 0 to 6 range is a sanity bound, not a code requirement.
