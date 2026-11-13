---
title: "A robot can push a bowed stud straight with 28 newtons. It still doesn't get to 95%"
seo_title: "How much force to straighten a bowed stud? 28–126 N"
date: 2026-11-13
tags: [research, buildbot-sheathing, robotics, construction]
description: "Pushing a bowed joint stud onto its line takes 28–126 N, inside a stock G1's reach. It lifts single-2x joints to 71% clean sheets, then hits a ceiling."
---

The [buildbot-sheathing](https://marisstella.app/research/buildbot-sheathing/)
programme has been chasing one question for nine milestones: can a robot nail
the sheathing on a wood-frame wall to the windows the panel maker and the code
leave it? Milestone 2 found the thing that caps it, and it is not the robot.
It is the lumber. A 4x8 sheet's edge is straight; a real 2x4 is not, and a stud
bowed sideways moves its 1.5 in nailing face out from under the edge. At the
bow published for kiln-dried studs, a robot with *perfect* sensing gets 87% of
sheets fully clean on a single-2x joint. Doubling the joint stud fixes it
(99.97%), but milestone 7 priced that stud at $5.42 a sheet — more than the
rework it saves.

Carpenters have a third option that costs nothing: push the bowed stud over to
the line and nail it there. Once the first sheet's joint nails hold it, the
stud stays straight for the next sheet. Nobody in the robotics literature seems
to have asked what that push takes, or what it buys.

**It takes about 28 newtons.** Model the stud as what it is: a Stud-grade 2x4
bending flatwise (I = 0.984 in⁴) over its 92 5/8 in clear span, held at the
plates. One push at mid-height, onto the line through its ends, takes
48 E I b / L³ — six pounds for the median stud, 28 lbf at the 99th percentile,
85 lbf for a stud at the grading limit with stiff Douglas fir. (I checked the
closed form against a finite-element beam; both give c = 48.000 pinned, 192.000
if the plates clamp the ends, which they don't.) The modulus comes from the
NDS reference values for Stud grade, 1.2 to 1.4 million psi, spread lognormally
at the 0.25 coefficient of variation the code uses for visually graded lumber.

**A stock humanoid can just do it.** Running the push through the same static
whole-body model that earlier milestones used for pressing and carrying, a
Unitree G1 standing at the wall can push 81–88 N sideways at stud mid-height
before its ankle roll gives out; an H1 manages 120–123 N. That covers 93% of
low-warp studs for the G1 and 99% for the H1. It is a near thing, which is
itself the useful finding: a robot that can't move a particular stud can read
that it can't and fall back.

**Order matters more than I expected.** The obvious robot policy is to push
each nail's point onto the line just before driving that nail, bottom up — the
way a person does it, one hand on the stud. But every nail you drive shortens
the free span of what's left, and a short beam is a stiff beam. Nail by nail,
the 99th-percentile force rises from 126 N to 1,258 N on high-warp studs, and
2,821 N at the grading limit. Push the whole stud first, then nail.

**And then it doesn't get to 95%.** This is where the pre-registered hypothesis
died. Straightening does remove most of what bow costs: the best single-2x
pipeline goes from 0.560 to 0.710 clean sheets at the lower published warp, and
from 0.307 to 0.677 at the higher — up to 37 points. But the bar was 95%, and
it lands at 71%. The reason is in the control: run the same pipeline on
perfectly straight studs and it gives **0.737**. Straightening does not
underperform; it reaches the ceiling. With bow gone, what closes the joint
window is the sheet's own pose where the ledger board leaves it.

That is worth more than a held hypothesis would have been. The 44-point gap
between single-2x and doubled joints was never one problem. It is two, of
nearly equal size: about 18 points of bowed lumber, which 28 newtons removes,
and about 26 points of sheet placement, which they don't. A robot builder
reading the earlier milestones might reasonably have concluded that better stud
sensing or straighter lumber was the path to single-2x joints. It isn't. The
path is a better ledger.

In dollars the push is free (it beats the extra stud in every draw until about
15 minutes of pushing per sheet) and roughly a wash against not pushing at all
at low warp, paying off in 92% of draws when the lumber is worse. So the
recommendation from milestone 7 stands unchanged — double the joint studs if
you want 95% first-pass — with a cheap fallback added for the robot that
arrives at a wall already framed with single 2x.

Numbers, code and the pre-registered hypotheses (H41–H44, two held, one held on
a bar that turned out to be too low, one refuted):
[`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/),
milestone 9. Simulation only; the end restraint at the plates and whether a
pushed stud stays put between sheets both want a mock-up.
