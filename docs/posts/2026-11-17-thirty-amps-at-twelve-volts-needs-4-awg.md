---
title: "Thirty amps at 12 volts needs 4 AWG over 15 feet: a free voltage drop calculator"
seo_title: "What size wire for 12V at 30 amps? Voltage drop, worked"
date: 2026-11-17
tags: [electrical, wire-size, voltage-drop, 12v, rv, marine, solar, tools]
description: "A free voltage drop calculator: every wire size at once, the smallest within your target, the longest run and the watts lost, with computed resistance."
---

A 30 A load 15 feet from a 12 V battery is ordinary: a compressor fridge, a
small inverter, a winch. The wire that would be generous on a household circuit
is badly undersized here. With stranded copper at 75 C, 10 AWG loses 1.12 V on
that run, 9.29 % of the supply, and turns 33.5 W into heat. The smallest size
that keeps the drop under 3 % is 4 AWG (0.28 V, 2.31 %).

The same 360 W at 120 V draws 3 A, and over the same 15 ft even 18 AWG drops
only 0.59 %. At 24 V, 10 AWG passes; at 48 V, 16 AWG. Doubling the voltage
halves the current, and a quarter of the copper gives the same percentage drop.

## What the tool does

[Voltage Drop Calculator](../../ventures/voltage-drop-calculator/index.html)
takes the source voltage, the load in amps or watts and the one-way run, and
returns, for every AWG and kcmil size (or every metric size from 0.75 to
300 mm²):

- the **drop** in volts and percent and the voltage left at the load;
- the **smallest size within your target**, never below a minimum you enter
  from your ampacity table;
- the **longest run** each size allows at this current, and the **most
  current** it allows over this run;
- the **watts lost** in the wire and, given hours per year and a price, what
  those losses cost.

It handles DC, single-phase and three-phase (1.732 instead of 2, line to line),
copper or aluminium, solid or stranded, any conductor temperature, parallel
sets, and a power factor with an optional reactance.

## Computed, not copied

The resistance comes from first principles: the conductor area from the AWG
geometric series (or kcmil, or the metric nominal area), the resistivity of
annealed copper (100 % IACS) or aluminium conductor grade (61 % IACS) at 20 C,
the temperature coefficient for the conductor temperature you choose, and 2 %
for stranding. That means no code table is reproduced, and the method is on the
page for anyone to check. The cost is honesty about precision: published
resistance tables run a few percent higher for some sizes, and the maximum
resistances in the metric conductor standard are higher than the nominal area
implies. So the page takes a resistance from your own table for the size you
check, and uses it instead.

## What it does not do

It does not check **ampacity**, which is the other half of choosing a wire:
the conductor must carry the current without overheating, and that comes from
the table your code uses with its corrections. The size you install is the
larger of the two answers. It also leaves out skin effect in large AC
conductors, reactance unless you enter it, motor starting dips, and the drop
across fuses, breakers and crimped lugs, which on a 12 V system can be a real
share of the total. Every number is checked by hand arithmetic in its tests,
not against a manufacturer's tool.

## Why this one

The repository has a service load check and a PV string sizer, and both stop
short of the conductor: the string sizer lists voltage drop as "not modelled".
Wire sizing is the next question an electrician, a solar installer or a van
builder asks, and the answer they usually get is a chart that assumed someone
else's run length and acceptable drop. A walk-through of the 12 V example is on
the tool's [guide page](../../ventures/voltage-drop-calculator/what-size-wire-for-12-volts.html).
The engine is a pure function an agent can call:
`node platform/agents/tools.mjs call voltage-drop-calculator analyze --input '{"volts":24,"load":40}'`.

*Not electrical advice. The tool does arithmetic on the numbers you type; you
are responsible for checking its output against your code and your equipment.*
