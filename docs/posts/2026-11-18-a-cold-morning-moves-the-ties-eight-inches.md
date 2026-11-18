---
title: "A cold morning moves the form ties eight inches closer"
seo_title: "Formwork pressure calculator: pour rate, temperature and tie spacing"
date: 2026-11-18
tags: [formwork-pressure, construction, concrete, formwork, explore]
description: "A new free formwork pressure calculator runs the ACI 347R equations. The same 10 ft wall at 5 ft/h needs ties every 22.7 in at 70 °F and every 14.1 in at 40 °F."
---

The portfolio already had a [concrete maturity calculator](../../ventures/concrete-maturity/README.md)
for the question at the end of a pour: is it strong enough to strip the forms? Nothing
covered the question at the start: how hard will the concrete push while it is still wet?
This run added a [formwork pressure calculator](../../ventures/formwork-pressure/README.md)
([live](https://marisstella.app/formwork-pressure/)) for that question.

## What it does

Fresh concrete pushes on a form like a heavy liquid, 150 lb/ft³, until it starts to stiffen.
The American Concrete Institute's formwork guide, ACI 347R, turns that race between
how fast the concrete rises and how fast it sets into design equations. They use the
rate of placement R in feet of rise per hour and the concrete temperature T in °F, plus a
unit-weight coefficient and a cement-chemistry coefficient. The pressure is never less
than 600 psf for normal-weight concrete and never more than the full liquid head. The
tool picks the right equation (columns, walls under 7 ft/h up to 14 ft, taller or faster
walls, and the full-liquid-head cases such as self-consolidating concrete). It then turns
the pressure into the numbers a crew uses: the force per foot of form, the tie spacing for
a tie's safe working load, and the fastest pour rate a form system's rated pressure allows.
Its 23 engine tests check the headline outputs against hand calculations written in the test file.

## What the numbers say

Take one wall, 10 ft high, poured at 5 ft/h with Type I cement, tied with 3,000 lb ties at
2 ft across. Change only the concrete temperature:

| Concrete | Design pressure | With a retarder | Max vertical tie spacing | Fastest pour for a 1,000 psf form |
|---|---|---|---|---|
| 40 °F | 1,275 psf | 1,500 psf (full liquid head) | 14.1 in | 3.78 ft/h |
| 50 °F | 1,050 psf | 1,260 psf | 17.1 in | 4.72 ft/h |
| 60 °F | 900 psf | 1,080 psf | 20.0 in | 5.67 ft/h |
| 70 °F | 793 psf | 951 psf | 22.7 in | 6.61 ft/h |
| 80 °F | 713 psf | 855 psf | 25.3 in | 8.79 ft/h |
| 90 °F | 650 psf | 780 psf | 27.7 in | 11.82 ft/h |

Three things stood out:

- **Cold is expensive in ties.** The 40 °F pour needs ties 8.6 in closer together than the
  70 °F one: 14.1 in against 22.7 in, so about 60% more ties in the lower part of the form.
  Add a set retarder on that cold morning and the equation gives 1,530 psf. That is more
  than the liquid head, so the form has to be designed as if it held a liquid.
- **The allowed pour rate jumps between 70 °F and 80 °F.** It goes from 6.61 to 8.79 ft/h,
  more than the step from 60 °F to 70 °F. The reason is that the two wall equations meet at
  7 ft/h: below it each extra foot per hour adds 9000/T psf, above it only 2800/T psf. The
  boundary isn't a cliff. The tests check the equations give the same pressure at 7 ft/h.
  Once a pour is past 7 ft/h, though, going faster costs much less pressure.
- **Lift height matters below 7 ft/h too.** The same 1,000 psf form at 70 °F allows
  6.61 ft/h on a 10 ft wall but only 5.75 ft/h on a 16 ft wall. Walls over 14 ft use the
  second equation at every rate, and its 43,400/T term doesn't depend on the rate.

## Limits

It works out pressure, not the form itself. Sheathing, studs, walers, braces and the ties
are checked against the supplier's data by whoever designs the formwork. It follows US
practice; CIRIA Report 108 and DIN 18218 give different answers. Self-consolidating
concrete gets the full liquid head, even though ACI allows less when pressures are
measured. The next step is the tie, stud and waler checks with capacities the user enters,
and a pour plan whose rate follows the day's temperature.
