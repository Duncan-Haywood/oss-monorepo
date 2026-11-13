---
title: "Does a chant need four men's sections?"
seo_title: "TTBB for Gregorian chant: four men's sections measured on 67 chants"
date: 2026-11-13
tags: [music, gregorian-chant, choir, algorithms, open-source, chant-forge]
description: "Chant Forge now splits a chant across TTBB sections. On 67 chants a fourth section helps narrow choirs in the middle of the range, and adds nothing on top."
---

Chant Forge arranges public-domain Gregorian chant for a men's choir, with an optional dance or metal backing. A chant is one melodic line, and some lines are wider than every man in the choir can sing. So the tool decides, phrase by phrase (or word by word when it has to), which sections sing which part. Today it can do that for the usual four-part men's choir, TTBB: first tenors, second tenors, baritones and basses.

```
node cli.mjs corpus/dies-irae.gabc --split-voices --baritones --second-tenors
```

## How the split is chosen

The same exact dynamic programme as for two and three sections. With four sections, any of 15 non-empty sets of sections can take a phrase if the phrase fits inside the range they share. The programme picks one transposition for the whole chant and one set per phrase. First it minimises the section-notes left out: a note sung by two of four sections leaves out two. Then it minimises the changes of singer. A test checks it against brute force on 120 random chants.

The MIDI gets a track per section. The cue sheet's who-sings column now reads `T1`, `T2`, `T1+T2+Bar` and so on, and the studio page has a TTBB choice whose downloads are byte-equal to the command line's.

## What it buys, measured

Section ranges are assumptions, not measurements of real singers. So `eval/four-sections.mjs` ran the 67-file corpus under three range sets (textbook, amateur and octave-wide) and two ways of adding the fourth section. In the first, the existing tenors are **split**, and the second tenors stop two semitones lower at the top. In the second, a **higher** first-tenor section goes a minor third above the old tenors.

A full choir of four is harder to reach than a full choir of three, so the fair figure is the share of the choir singing an average note.

| octave-wide sections | files that fit | one section alone | three or more sections | share of the choir | changes of singer |
|---|---|---|---|---|---|
| tenors, baritones, basses | 64 | 29.9% | 10.2% | 59.9% | 484 |
| TTBB, tenors split | 65 | 13.7% | 49.8% | 61.4% | 569 |
| TTBB, extra section on top | 64 | 23.3% | 13.7% | 47.3% | 505 |

- **A fourth section helps in the middle, not on top.** With narrow sections, splitting the tenors cuts the notes one section carries alone by more than half. It also makes one more chant singable. A section added above the tenors reaches few of the chant's notes once the line sits for the other three, so the share of the choir per note falls.
- **With wide ranges there is nothing to buy.** At textbook ranges, three sections already sing every chant in the corpus with 99.8% of the choir on an average note. TTBB gets 99.7%, with three more changes of singer.
- **It costs changes of singer.** Octave-wide, changes go from 484 to 569 and section entrances from 319 to 487.

So for a chant, four sections are a choice of texture, not a fix for range. They suit an amateur choir whose sections each manage about an octave. Whether all those entrances sound like a choir or a relay race is for singers to decide. Nobody has sung these arrangements yet.

The code, the report and the tests are in [`ventures/chant-forge`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge) (MIT): README section "Four sections", `eval/four-sections-report.md`.
