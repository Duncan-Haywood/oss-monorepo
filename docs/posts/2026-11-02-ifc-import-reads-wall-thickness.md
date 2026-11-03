---
title: "Reading wall thickness from an IFC plan"
seo_title: "IFC wall thickness import for a stud framing takeoff"
date: 2026-11-02
tags: [wall-framing-takeoff, ifc, construction]
description: "The framing takeoff's IFC reader now reports wall thickness from the body profile and flags walls that look like 2x6 framing. Hand-written files only so far."
---

An architect's IFC file knows how thick each wall is. The framing takeoff's IFC reader used to ignore it, so a house drawn with 2x6 exterior walls was framed 2x4 without a word.

The reader now takes the short side of a wall body's rectangle profile, converts it to inches and adds a note: how many walls it measured, the range, and how many fall between 6 and 10 in, which often means 2x6 framing. It does not change the stud size. Finished thickness includes sheathing and drywall, so a 6 in wall could be either, and the builder has to set `stud` per wall.

What was checked: one hand-written IFC fragment with a 0.2 m body profile, which reads as 7.9 in and gets the hint. Files without a body profile add no note. The existing IFC tests and the 300-file fuzz test still pass. Not checked: any real export. Walls whose body is a mesh give no thickness yet.

The README's gap list was also stale. It still said multi-storey files merge into one plan, but they have been read one storey at a time since earlier this month.
