---
title: "Stepped walls on the framing takeoff page"
date: 2026-11-07
tags: [wall-framing-takeoff, stepped-walls, construction]
description: "The wall table now has a Steps column, so a wall whose studs change height part-way along gets its own stud lengths, end studs and plates in the browser."
---

A garage wall that meets a taller house wall, a clerestory, or a split-level tie-in has studs of two heights in one wall. The framing takeoff engine could already split such a wall at each step (since 2026-11-05), but only from the command line. The page's wall table now has a "Steps" column: write `14 ft : 6 ft` to say that from 14 ft along the wall the studs are 6 ft, and add more steps with commas.

Each segment is framed as its own level wall, so it gets its own end studs (a doubled stud at the step), plates and sheathing. The page names the pieces `Right (a)` and `Right (b)`. An opening that crosses a step, or a step with a stud length it cannot read, is reported instead of guessed. The steps are saved with the plan file.

Checked in headless Chromium on the invented example house: no segments when the field is empty, two after a step, and a clear message for a bad stud length. It is not checked against a real stepped plan, and how the two heights are tied together (bearing, a rake or a ledger) is the framer's and engineer's call.
