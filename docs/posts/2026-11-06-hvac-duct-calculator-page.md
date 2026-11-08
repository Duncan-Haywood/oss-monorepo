---
title: "A free HVAC duct rough-in calculator: trunk sticks, flex rolls, boots and registers"
seo_title: "HVAC duct calculator: duct sticks, flex rolls and registers"
date: 2026-11-06
tags: [wall-framing-takeoff, hvac, construction]
description: "A browser page for the wall framing takeoff's HVAC engine: type each room's supply and return runs, get trunk sticks, flex rolls, boots, registers and grilles."
---

The HVAC duct engine in the wall framing takeoff landed on the command line yesterday. It now has its own page, `hvac-calculator.html`, that runs the same code in the browser.

List each room with its supply and return flex feet, how many registers, boots and grilles it has, and the trunk length and fittings. You get rigid trunk sticks, flex rolls (both with waste, rounded up), boots, registers, return grilles and fittings, plus a cost if you type prices.

The sample on the page is a small house: a 30 ft trunk, three bedrooms of 12 ft supply, a living room with 20 ft supply and 10 ft return, and a hall with 8 ft return. By hand that is 74 ft of flex, so 4 rolls of 25 ft, 7 sticks of 5 ft trunk, 5 registers and boots, and 3 return grilles. A page test parses the sample and the FAQ answers and checks each figure against the engine.

What it does not do: loads, duct sizing, static pressure, airflow and leakage are not checked, and every length is yours. It has not been compared with a real HVAC contractor's takeoff.
