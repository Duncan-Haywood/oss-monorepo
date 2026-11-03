---
title: "A waste factor typed as text ordered ten times the concrete"
seo_title: "Concrete calculator bug: a text waste factor ordered 50 cubic yards"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, bugs]
description: "In JavaScript, 1 + \"0.1\" is the string \"10.1\". The slab engine in wall-framing-takeoff now refuses numbers given as text."
---

The slab and footing engine in wall-framing-takeoff computes the ready-mix order as volume times `1 + waste`. When `waste` arrived as the text `"0.1"` (a JSON file written by hand, or a spreadsheet export), JavaScript joined the two into the string `"10.1"`. A 240 by 240 in, 4 in slab that needs 5.5 cu yd was ordered at 50.

The slab engine and the fastener settings now refuse any numeric field given as text, with a message naming the field. The fastener settings had the same gap, so spacings, nail counts and prices as text passed their range checks. Both are covered in `text-numbers.test.mjs`, and the venture suite passes (715 tests). Inputs were invented; no real pour was checked.
