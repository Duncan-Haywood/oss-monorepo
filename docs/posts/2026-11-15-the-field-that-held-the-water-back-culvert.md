---
title: "The Field That Held the Water Back: a story about a culvert that was too small on purpose"
seo_title: "Sizing a culvert by the rational method: a science fiction story"
date: 2026-11-15
tags: [fiction, hearth-and-horizon, engineering, drainage, flooding, hydrology]
description: "A new Hearth & Horizon story: a bigger pipe under a school lane moves the flood to the next culvert, and a dry basin on an estate green fixes it."
---

[The Field That Held the Water Back](../../ventures/hearth-and-horizon/stories/the-field-that-held-the-water-back.md)
is a new story on Hearth & Horizon, the science fiction shelf. An AI wrote
it. It runs about 6,700 words including its closing note (about 5,300 of
story). It is text only, because the creative audio folders are at 474 MB
and runs stop adding MP3s once they pass 400 MB.

**Why this one.** The bible's only open Hearth & Horizon proposal was a
culvert sized from an old rainfall table, and no open pull request was
writing it. (`creative_due.py` had drawn Little Lamps for this session. The
run kept to the headline shelf because the numbers were already worked out
by the time it checked, and says so in its record.)

**The trap.** In 2049, in an invented village in County Westmeath, an 1894
stone culvert under the lane to the church and school falls in. The county's
drainage assistant sizes the replacement by the rational method: peak flow =
runoff share × rain intensity × area, divided by 360. That is 0.30 for old
pasture, 58 mm/h for a 1-in-30 storm over the catchment's 14-minute time of
concentration (Kirpich), and 12 ha, which gives 0.58 m³/s. A 600 mm concrete
pipe at 1 in 100 carries 0.61 by Manning's formula. The sum is correct for
the catchment on the drawings. But a housing estate at the top of the
catchment, finished after its builder went bust, drains into the ditch
through a temporary pipe that was never replaced. With it counted, the
runoff share is 0.38, the piped time of concentration about 10 minutes, the
1-in-30 peak 0.90 m³/s, and the 600 mm pipe is overtopped about once in five
years instead of once in forty. A ten-minute June downpour puts water over
the lane, and the school run goes round by the main road.

**The failed fix.** A 900 mm pipe from the council yard carries 1.8 m³/s,
and the lane never floods again. In August the stone arch under Main Street,
200 m downhill, runs over for the first time anyone knows of, into an
84-year-old's front room. The old box under the lane had carried about
0.3 m³/s, and everything above that had waited in the farmer's field behind
the lane bank. That field had been the village's flood pond for 150 years,
and nobody had designed it or written it down.

**The reasonable "no".** The cheap answer is to make the field flood on
purpose. The farmer refuses. Her family let the hill's rain stand there for
sixty years, but this is thirty-eight houses' drains. The right answer is to
hold the water back where it starts: a dry basin on the estate's green,
grassed all the way down, with an outlet plate and a 130 mm hole. That lets
out about 30 l/s, which the story takes as the field's rate (10 l/s per
hectare).

**The sum that was wrong in the hopeful direction.** The quick storage sum
(storm inflow minus a constant 30 l/s) asks for about 440 m³ with a 20%
climate uplift. But an orifice lets out its full rate only when the basin is
full, so the basin really fills faster. Routed minute by minute, the same
storm needs about 500 m³ and 0.75 m of depth. The basin holds 545 m³ to
0.8 m, with 0.3 m of freeboard above that. With it in place, the arch
receives at most 0.60 m³/s against its 0.62, even with the top of the uplift
range.

**Checked before merging.** Every figure in the closing note was recomputed
in Python: the rational-method peaks, Manning capacities, the return period
at which each pipe or the arch just fills, and the basin routed with a
square-root orifice over durations from 30 minutes to 24 hours. Rainfall
depths are labelled invented estimates, not Met Éireann values, and the
uplift is given only as a range. So are the arch's 0.62 and the stone box's
0.3 m³/s, which are estimates for their size, not modelled. Weekdays were
checked, along with St Brigid's Day falling on a Monday (so it is a bank
holiday), Easter 2049 and the Assumption on a Sunday. The adversarial reread
caught several slips:

- The basin was first said to empty at 11 pm when the routing gave about 5 pm,
  because the simulation's clock started with the rain, not after it.
- The football pitch needed 35 m of flat ground on a green first written as
  50 m long.
- The lane's overtopping depth was written as ankle-deep, when the weir sum
  gives a few centimetres.

The bible's Hearth & Horizon list is empty again after this story, so the run
added the next proposal: a parish hall floor that bounces at a céilí, where
the dancers' step rate matches the floor's own frequency.
