---
title: "Counting plumbing rough-in pipe, traps and stops from a fixture list"
seo_title: "Plumbing rough-in takeoff: drain, vent and PEX quantities from fixture runs"
date: 2026-11-06
tags: [wall-framing-takeoff, plumbing, construction]
description: "The open-source framing takeoff now turns a fixture list with typed pipe runs into drain and vent sticks, PEX coils, traps, stops and fittings, and a budget section."
---

The wall framing takeoff covered lumber, sheathing, roofing, electrical and finishes, but not plumbing. It now has a `--plumbing` option.

You list fixtures, each with the drain, vent, hot and cold run lengths your plumber gives you. The tool adds them up: drain and vent pipe sticks (10 ft by default, 10% waste), hot and cold PEX coils, one trap per fixture with a drain, supply stops, and any fitting counts you typed. Prices you type become a Plumbing section in the budget.

Example: a toilet (6 ft drain, 4 ft vent, 12 ft cold) and two lavatories (5 ft drain, 5 ft vent, 10 ft hot, 10 ft cold each) give 30 ft of drain and vent, 4 sticks, 3 traps, 5 stops and 2 PEX coils.

What it does not do: size pipe, check trap-arm or vent distances, check slope or fixture-unit limits. Those stay with your plumber and local code. The tests are hand arithmetic only, and it has not been compared with a real plumber's takeoff; one is wanted.
