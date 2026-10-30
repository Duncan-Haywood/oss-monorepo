---
title: "A sit plan that knows about the peanut allergy: 108 activities for babysitters"
seo_title: "108 babysitting activities that respect the peanut allergy"
date: 2026-10-30
description: "The Babysitting Business Kit now plans each sit from 108 activities by age, weather and bedtime, and leaves out anything that clashes with a child's allergy."
tags: [babysitting-business-kit, small-business]
---

Parents notice when a babysitter turns up with a plan. "We made binoculars and went on a safari in the living room" is a better end to a date night than "they watched TV". Making that plan for each sit takes time, though, and when a family has a four-year-old with a peanut allergy and a toddler who puts everything in her mouth, it's easy to get it wrong.

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now has an **Activities** tab. Here is what it does, with the numbers from the code:

- **A library of 108 activities written for the kit** (`activities.mjs`). Each one is tagged by age band (15 suit infants, 35 toddlers, 81 preschoolers, 89 school-age kids, 70 tweens), by place (76 indoors, 22 outdoors, 10 either), by energy, mess, minutes and supplies, and by whether it suits quiet time (19) or bedtime (9). 106 of them need no screen. The two that do, a movie and a dance video, only show up if the parents said screens are fine.
- **A plan for each sit.** Pick a booked sit and the weather. The plan runs from the sit's start time through active, creative, snack, calm and wind-down blocks, adding more for long sits and dropping some for short ones. In the evening it stops at bedtime (the family's own, or a starting guess by age that it asks you to change) and keeps outdoor play before 7pm. If one child is a baby and the other is seven, each block gets a second activity for the child the first one doesn't suit. It also keeps a list of supplies to have ready.
- **Allergies come first.** The plan reads the allergy text on the family record ("peanuts", "milk, eggs", "latex") and leaves out anything that clashes: 4 activities contain peanut butter, 7 contain wheat (play dough and salt dough as well as snacks), 7 dairy, 2 corn and 1 latex (balloons). It also leaves out the 9 activities with small parts when any child is under 3, and it tells the parents what it skipped and why. The tests build 300 plans (5 kinds of weather, 3 times of day, 20 shuffles) for a family with a peanut allergy, and none of them includes peanut butter. Allergy text the kit doesn't recognise ("kiwi allergy") gets a warning to check every food with the parents. Every snack carries that warning anyway.
- **A printable plan for the parents** and a **bag-of-tricks packing list** for the family. The packing list ranks portable supplies by how many safe activities each one makes possible (for the example family, plain paper is used in 10 and tape in 5), lists the things to borrow at the house, and leaves food to the parents.
- **Saved plans.** Save the plan to a sit, tick what you actually did, and the next plan for that family steers away from repeats. `activitiesForReport(plan)` returns what was done, ready for a sit report.

The optional faith set (twelve items: Bible stories retold in plain words with the passage named, a bedtime prayer of thanks, worship songs, kindness projects) appears only when the sitter offers faith-based activities in Settings **and** the parents asked for them. The default is off, and a test checks every combination. A family's beliefs never score or filter anything else.

This run also fixed a small bug: the reply to a new inquiry used to lowercase the sitter's own wording, so "Bible stories" came out as "bible stories". It now keeps the sitter's capitals.

None of this is child-safety or medical advice. The parents' instructions come first, and the printed plan says so.
