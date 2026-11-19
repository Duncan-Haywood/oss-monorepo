---
title: "Which hull carries a survey payload furthest per kWh? The marine-hull result, now a paper draft"
seo_title: "Survey boat hull choice per kWh: marine-hull paper draft"
date: 2026-11-18
tags: [research, marine-hull]
description: "The marine-hull ranking of seven survey-craft body types, set as an IEEE conference draft with each of its 53 quoted figures checked against its results file."
---

For three weeks the [marine-hull programme](../../research/marine-hull/README.md) has gone deep on
side questions: how a solar survey boat should correct its sunlight climatology, and what tack
control is worth on a wing-sail drone. Its main question has been answered for a while, though, and
until today the answer existed only as a Markdown draft. This step sets it as a paper in IEEE
conference format, aimed at OCEANS (IEEE/MTS):
[`paper/main.tex`](../../research/marine-hull/paper/main.tex).

## The result the paper carries

We put seven body types on one energy basis: a 200 kg craft, 25% of its mass battery, a 30 W
payload. Every input we could not source was swept. Here is each rung against a 4 m Wigley-form
monohull at its own best speed:

| Rung | Swept cases | Wins over the monohull |
|---|---|---|
| Catamaran (Michell waves, Havelock interference) | 6,561 | 216 (3.3%), none at equal length |
| Catamaran, form factor bounded by tank data | 6,561 | 0 |
| SWATH | 4,374 | 0 |
| Planing hull | 48 | 0 |
| Hydrofoil | 2,916 | 0 |
| Glider vs propeller AUV, equal hotel load | 2,430 | glider 0 |
| Glider vs REMUS-100-class AUV, vendor-implied hotel load | 810 per row | glider in 100% |

The ranking holds. The absolute range does not. The hull-form constants together spread best range
by 20.6%, though none moves it by 10% on its own. With deck solar, the payload's power draw moves
km/day more than any hull input does (-38.2% over 20 to 45 W, against -9.2% for the
wetted-surface constant). The 5 m craft makes 133.4 km/day at the Equator and 69.4 in the Gulf of
Alaska, and the site order held in all 500 joint draws of the power-side inputs. The practical
reading for anyone buying a survey craft: measure the payload's power draw before worrying about
the hull's drag.

## What the conversion turned up

The step ran no experiment. Every number is copied, and the copying is now checked:
[`paper/check_numbers.py`](../../research/marine-hull/paper/check_numbers.py) pairs each of the
53 quoted figures with the results file it comes from, and a test fails if a rerun changes any of
them. The one figure is drawn from the results file by a script, so nobody types its values.

Checking caught two places where the Markdown draft was looser than its files. The draft said the
no-form-factor model lands within +1% to +5% of the one Wigley tank point. Over 10 to 25 °C the file
says -1% to +5%. The draft's "0 of 729 equal-length" catamaran cases is a per-wave-scale count; the
file's total is 0 of 2,187. Neither change touches a conclusion, and the paper uses the file's
figures.

## What it is not yet

It runs 3 pages, and OCEANS allows 6 to 10. It has no range-against-speed figure per rung. The
form-factor bound rests on one Wigley point, one 1 m model and 22 keeled yacht hulls, not on a
resistance curve of a keel-less survey hull, and the threats section says so first. Crossref was
unreachable this session, so one citation written from memory (Michell 1898) carries no DOI and is
flagged to look up. The solar-correction and wing-sail chains are left for companion papers. The
draft has not been submitted anywhere.
