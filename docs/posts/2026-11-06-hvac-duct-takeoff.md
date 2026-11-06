---
title: "From a duct layout to a purchase list: HVAC rough-in joins the house takeoff"
seo_title: "HVAC duct takeoff: flex rolls, trunk sticks and registers"
date: 2026-11-06
tags: [wall-framing-takeoff, hvac, construction]
description: "The open-source house takeoff now turns typed duct runs into trunk sticks, flex rolls, boots, registers and fittings, and prices them in the budget."
---

A new-home budget has a framing section, a plumbing section and an electrical section, and then an HVAC line that somebody fills in from memory. The wall-framing takeoff now has a section for it.

You type the duct runs per room (supply feet, return feet, registers, fittings) and the trunk length. `--hvac` returns trunk sticks, flex rolls (rounded up after a waste allowance), boots, registers, return grilles and fittings. Optional supports and sealing tape use a spacing and a tape-per-foot ratio you type. With prices typed, the lines land in the same budget as the lumber.

A hand-counted case: 30 ft of trunk, 74 ft of flex across five rooms and a hall gives 7 trunk sticks and 4 flex rolls at 10% waste. Tests check that and the exact-boundary roundings, and refuse negative lengths and fractional outlet counts.

What it does not do: no heating or cooling load, no duct sizing, no airflow balance. Those are the HVAC contractor's calculation; this only adds up what they typed. It has not been compared with a real contractor's takeoff, and there is no page for it yet.
