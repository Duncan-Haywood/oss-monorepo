---
title: "A decibel is two measures in IFC: reading which one from the property's name"
seo_title: "Decibel properties in IDS: sound pressure or sound power level"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "IDS files made from bSDD typed every dB property as a plain real, so walls that store acoustic levels correctly failed. Now the property name says which level."
---

The free [IDS checker](https://marisstella.app/ids-model-check/) can write an
IDS file straight from a class in the buildingSMART Data Dictionary (bSDD).
Earlier today it learned to turn a property's unit into the IFC measure type,
so a thickness in mm is written as an `IfcLengthMeasure` in metres rather than
a bare `IfcReal`. That matters because IDS compares types exactly: a wall that
stores its thickness the way IFC intends fails a facet that asks for a real.

Decibels were left out. In the QUDT unit vocabulary that bSDD links to,
`dB` is both a sound pressure level and a sound power level. IFC has a
separate measure for each, and picking the wrong one fails the model just as
surely as picking `IfcReal`. So every acoustic property stayed `IfcReal`. On
the last bSDD sample that was 265 properties, most of them from CEN/TC 126's
building-acoustics dictionary.

## The name already says which

Acoustic quantities have standard symbols, and dictionaries use them as
property codes. In the ISO 3740 series, `L_W` is a sound power level. Almost
every other `L` in building acoustics is a sound pressure level: `LA_Fmax_nT`
(the maximum A-weighted level from service equipment, ISO 16032), `L'nT,w`
(impact sound, ISO 717-2) and `LAeq`. The trap is the lower-case `w` in
`L'n,w`. It means "weighted", not power.

The checker now reads the property's `physicalQuantity` and name first, in
English, German, Dutch, French, Spanish and Italian. If those say nothing it
falls back to the symbol at the start of the code. Some properties are in dB
but are not levels at all: the sound reduction index `R_w`, level differences
like `DnT,w`, and the spectrum terms `C` and `C_tr`. These differences have no
IFC measure, so they stay `IfcReal`, and the reason is printed.

## Checked against a second tool

I built a wall class with three dB requirements: `LA_Fmax_nT` at most 30,
`LWA` at most 45 and `R_w` at least 50. I wrote it as an IDS before and after
the change and checked three walls:

| IDS | walls failing (this checker) | walls failing (IfcTester 0.9.0) |
| --- | --- | --- |
| before: every dB as IFCREAL | W-01 (type only), W-02 | W-01, W-02 |
| after: pressure level, power level, real | W-02 (too loud), P-01 (plain reals) | W-02, P-01 |

The wall that stores its levels as IFC means and meets every limit failed only
on type before, and now it passes. IfcTester gives the same verdict on all six
wall checks.

## What is not known yet

The bSDD API did not answer from this session, so the rule has not been run
over the dictionary's real dB properties. The next run with access counts
them and reads every name the rule picks. The ten CEN/TC 126 names already on
file still stay `IfcReal`, because their stated dimension holds a counter in
the length slot. That is a fault in the dictionary, not a level. Details and
reproduction steps are in `ventures/ids-model-check/eval/bsdd-db-2026-11-19.md`.
