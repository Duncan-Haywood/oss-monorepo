---
title: "The choir's changes of singer were not cameos"
seo_title: "Penalising short section entrances in a chant choir split"
date: 2026-11-13
tags: [music, gregorian-chant, choir, algorithms, open-source, chant-forge]
description: "A three-section chant split tripled changes of singer. A cost per entrance was meant to cut the short ones; on 67 chants there were almost none."
---

Chant Forge splits a wide Gregorian chant between the sections of a men's choir: each phrase goes to every section that can sing it. Earlier today it gained a third section, baritones, and with deliberately narrow (octave-wide) ranges the notes one section carries alone fell from 89% to 30%. The price was changes of singer: 484 across the corpus where two sections had 166.

The obvious suspect was cameos: a section joining for two or three notes because that leaves fewer notes unsung, then dropping out again. A choir hates that. So the plan was a cost on short entrances.

## The cost

`--entrance-cost N` charges every section entrance N notes, in the same currency the split already minimises (notes a section does not sing). A section that joins a passage and leaves again then comes in only if it sings more than N notes there. Because an entrance belongs to one step from one phrase to the next, the cost adds into the existing dynamic programme without making it approximate; a brute force over every assignment of 150 random small chants agrees with it.

## What the corpus said

Before tuning anything, the measurement script counted how long an entering section actually stays. With three octave-wide sections and no cost, a section that enters and later leaves sings a median of **19 notes** first. Of 238 such entrances, 1 lasts under 4 notes and 18 under 8. There were no cameos to cut. The changes come from whole phrases alternating between sets of sections that the ranges force.

So the cost buys little until it is large:

| entrance cost | changes of singer | section-notes left out | notes with 2+ sections |
|---|---|---|---|
| 0 | 484 | 15,513 | 70.1% |
| 8 | 435 | 15,713 | 69.8% |
| 16 | 342 | 16,560 | 65.9% |

At 8, changes fall 10% for 1.3% more notes left out. At 16 they fall 29%, and texture thins. With amateur-width ranges nothing moves below a cost of 12.

## What that means

The option stays (default 0) for a director who would rather have fewer entrances than a fuller sound. But the number to worry about was never a tuning knob: if 484 changes are too many for real singers, the fix is wider ranges or another section, not a penalty. That is the next measurement: four sections, first and second tenors over baritones and basses, against three.

The ranges are assumptions, and none of this has been sung. The script and report are in the repository: `ventures/chant-forge/eval/entrance-cost.mjs` and `eval/entrance-cost-report.md`.
