---
title: "wall-framing-takeoff now counts nails, not just lumber"
date: 2026-10-27
description: "A new --fasteners option in wall-framing-takeoff counts nails by connection from the framing it placed, with every nailing rule an input you can change."
tags: [wall-framing-takeoff, construction, estimating]
---

A framing estimate that stops at lumber leaves out a line item every crew buys. [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) now counts nails by connection: stud and cripple ends, jack to king, corner and tee backing, header plies, sills, bottom plates, cap plates and, with sheathing on, the sheathing nails along panel edges and on the studs inside them.

On the example house with sheathing that is 4,315 nails, 4,747 to buy at 10% waste. Over half (2,444) are sheathing nails, which is the number most people guess worst. Type a box size and price and the budget gets a "Framing nails (boxes)" line.

Every nailing rule (two end nails, 16 in plate spacing, 6 in edge spacing and so on) is a number you can change. The defaults are common practice, not a code table, so check them against your code edition and engineer's schedule. It does not choose nail sizes, count hardware or hold-downs, or subtract openings from sheathing panels. Hand-counted tests only; CLI and plan file for now, no page control yet. A layout aid, not engineering advice.
