---
title: "Real studs are not parabolas: a scanned 2x4 wall checks a sheathing robot's model"
date: 2026-11-13
tags: [buildbot-sheathing, construction-robotics, point-cloud, lumber, real-data]
seo_title: "How much do installed 2x4 studs bow? A laser scan of a real wall"
description: "Six installed 2x4 studs from a public laser scan bow by the published amount but not as parabolas, which costs a sheathing robot 11–15 points on single studs."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails where the code wants them. Ten steps in, every stud in it was a model: a parabola whose size came from two published averages we had only seen in search snippets. Today's step uses measured studs instead.

They come from a public data set. Adel, Ruan, McGee and Mozaffari (Princeton and Michigan, *Automation in Construction*, 2024) had two industrial robots build a full-scale 2x4 wall, 2.05 m by 2.32 m, then scanned one face with a laser profiler: 1.8 million points, CC BY 4.0. That face is the one sheathing gets nailed to. We sliced each of the six vertical studs every 10 mm up its height and traced the face's centreline.

- **The size is what the books say.** Scaled to an 8 ft stud, the six bows run from 0.02 to 0.28 in. The median is **0.106 in**, against the published kiln-dried average of 0.11 in. That input was right.
- **The shape is not.** A parabola leaves **0.6–0.9 mm** of waviness on each stud. On the three most bowed ones it explains only 64–79% of the shape. Some of this is the scanner, not the wood: it takes a profile every 2 mm, and a synthetic stud on the same grid shows 0.27 mm of waviness from that alone. About half of the rest lines up across every member at the same height. That pattern points to how the scan passes were stitched together, so we also ran the numbers with it removed.
- **It costs single studs 11–15 points.** We put the measured shapes back into the programme's best single-2x pipeline. A robot that reads each stud three times and fits a curve gets **43–47%** clean sheets. Perfect parabolas at the same studs' own bows give 58%. A ±3 mm nail window can't absorb a millimetre of waviness the curve fit doesn't see. Reading the stud at every nail height only brings it to 47–50%.
- **Doubled joint studs don't care.** On the measured studs they give 100% clean sheets in every variant. The programme already recommended them, and the recommendation is now stronger.

We wrote four predictions in the log before extracting anything. One held: the bow sizes. Three were refuted. The scan resolves a face edge to about ±1 mm, not 0.3. The parabola is not a good fit. And the parabola is not a safe stand-in for the pipeline. The data set's own numbers also passed one check: its benchmark robot-placement file reproduces the paper's Table 1 exactly. Its adaptive file does not, so we didn't use it. Along the way we fixed two author first names in our bibliography.

There are limits. This is one wall of six studs, of unknown grade, built by robots that trim members to fit. The 2 mm scan grid blurs anything finer than about a millimetre. And part of what we removed as scanner error may be real. What we need next is a population: walls framed by people, scanned along the studs. Code, extracted profiles, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
