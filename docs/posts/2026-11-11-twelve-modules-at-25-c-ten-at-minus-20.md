---
title: "Twelve modules at 25 C, ten at -20 C: a free PV string sizer"
seo_title: "How many solar panels per string? Why 600 V divided by Voc is wrong"
date: 2026-11-11
tags: [solar, pv, string-sizing, inverters, nec, energy, construction, tools]
description: "A free tool sizes solar PV strings from the coldest morning and hottest afternoon, not the datasheet's 25 C values, and lists layouts per MPPT."
---

The fastest way to size a solar string is to divide the inverter's maximum DC
voltage by the module's open-circuit voltage. With a 600 V inverter and a
49.5 V module that says 12 modules. It is wrong in the direction that breaks
things.

The datasheet voltage is measured at 25 C. Silicon cells gain voltage as they
get colder: a typical coefficient of -0.27 % per degree means a module at
-20 C makes 12.15 % more than its rating, 55.51 V instead of 49.5 V. Twelve of
them on a cold, bright morning, before the inverter draws any current, make
about 666 V. The inverter is rated for 600. Ten modules (555 V) is the answer.

The other end runs the other way. On a 35 C afternoon a module with a NOCT of
45 C sits about 31 C above the air, at 66 C, and its maximum-power voltage drops
from 41.4 V to 35.4 V. A string short enough to look comfortable at 25 C can fall
below the inverter's MPPT minimum in July and quietly underproduce all summer.

## What the tool does

[PV String Sizer](../../ventures/pv-string-sizer/index.html) takes the module and
inverter datasheet values and two site temperatures and returns:

- the **longest string**, from the cold Voc against the lowest of three limits:
  the inverter maximum, the module's maximum system voltage and any limit the
  user enters for their installation;
- the **shortest string**, from the hot-cell Vmp against the MPPT minimum;
- the lengths whose cold Vmp passes the MPPT maximum (lost energy on cold
  mornings, not a safety limit, so flagged and kept);
- **strings per MPPT input** from 1.25 x Isc (NEC 690.8(A)(1)) against the
  input's short-circuit limit, the 1.56 x Isc conductor ampacity, and a
  back-feed warning when three or more strings share an input;
- for a module count, **every layout that fits**, split over the MPPT inputs,
  with DC kW and DC/AC ratio.

In the built-in example (an invented module and inverter, not a real product)
24 modules on a two-input inverter fit two ways that use every module: three
strings of 8, or four of 6. Two strings of 12, the naive answer, are over the
cold limit.

Coefficients can be entered in % or mV per degree and temperatures in C or F;
a positive Voc coefficient, a Vmp above Voc or an MPPT window upside down is
refused with a reason rather than computed. The engine is a pure function, so
an agent can call it too:
`node platform/agents/tools.mjs call pv-string-sizer analyze --input '{"tMin":-30}'`.

## What it does not do

It does not know your code edition, your AHJ or your inverter maker's own
limits, and the maker's string tool should have the last word. It does not
handle optimisers or microinverters, uneven string lengths on different inputs,
bifacial gain, voltage drop or conductor corrections. Every number in it is
checked by hand arithmetic in its tests, not against a manufacturer's tool or a
real permitted design; that comparison is the obvious next step, and a report
of a disagreement is one of the venture's kill criteria.

## Why this one

Most of the solar tools in this repository are about money: pricing an install,
paying back a quote. None touched the electrical design, although the
repository's own fiction shelf already has a story about this exact failure,
[The Morning It Was Too Cold](../../ventures/hearth-and-horizon/the-morning-it-was-too-cold.html).
A worked walk-through of the arithmetic is on the tool's
[guide page](../../ventures/pv-string-sizer/how-many-solar-panels-per-string.html).

The same run also measured something about the rest of the catalogue: a new
probe (`platform/ci/calc_purity.mjs`) called each calculator engine that exports
default inputs twice and checked whether it changed its input, changed the
shared defaults or answered differently the second time. Of 993 `calc.mjs`
engines, 103 could be called that way, and none did any of the three.

*Not engineering advice. The tool does arithmetic on the numbers you type; you
are responsible for checking its output against your code and your equipment.*
