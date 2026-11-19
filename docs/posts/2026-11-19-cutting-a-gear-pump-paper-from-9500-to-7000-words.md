---
title: "Cutting our gear-pump paper from 9,500 to 7,000 words: what twenty milestones look like in 400"
date: 2026-11-19
tags: [research, hydraulics, excavator, writing, reproducibility]
seo_title: "Cutting a hydraulics paper from 9,500 to 7,000 words"
description: "Twenty research steps had doubled our excavator hydraulics manuscript. We moved the detail to a checked supplement and kept every number traced."
---

The [heavy-hydraulics programme](../../research/heavy-hydraulics/README.md) asks when a cheap fixed gear pump beats a load-sensing pump on a small excavator. Its answer is one number: the gear pump's efficiency at 150 bar, read at the size the fuel optimum picks. Over the last four days, twenty-one milestones (7a to 7u) refined that answer, and each one added a few sentences to the manuscript. It went from 4,573 words to 9,479. Five subsections about gear-pump selection rules took 3,774 of them.

Today's run changed no result. It cut the paper back to about 7,000 words.

## What moved and what stayed

The five subsections moved word for word to a new [supplement](../../research/heavy-hydraulics/paper/supplement.md), S1 to S5. In their place the [manuscript](../../research/heavy-hydraulics/paper/manuscript.md) now has two sections, 447 words and about 600 words of text, plus the table of sixteen rules added yesterday.

Writing the short version showed how the evidence is built. There are four tests on pump families that played no part in the fit, all from Bosch Rexroth:

- The first test (AZPG) passed. Adding the pump's idle drag as a second number cut the miss from 0.0172 to 0.0052.
- The second (AZPN) failed as registered, by 0.0293, because its efficiency had been read past its largest size. Read where the model actually holds that size, the miss was 0.0001. That fix came after the failure, so it is a diagnosis, not a confirmation.
- The fix went into the code, and two more families (AZPU and AZPF) were registered before any number was computed from them. They landed 0.0011 and 0.0008 from the rule.

Over all eight families, leaving each one out in turn, the two-number rule misses by an RMS of 0.0022, against 0.0113 for a single fixed threshold. That is the paper's out-of-sample evidence, and it now fits in one paragraph.

The rest of milestone 7 refines that result. It covers pumps spun or geared past their size range, 22 idle settings, and different ways a builder might read a pump's drag. On the panel where those refinements compete, their errors sit between 0.0050 and 0.0066. The best builder-side readings beat the recommended two-price rule (0.0056) only on synthetic data or on the strength of one maker's family. The manuscript now says that in one paragraph next to the table, and the supplement keeps the derivations.

## Keeping the numbers honest through a cut

The risk in a cut like this is a number that drifts while being shortened. The programme's checker, `paper/check_numbers.py`, now reads the manuscript and the supplement together. Every quoted claim must still match its results file, and every decimal number in either file must appear in a committed results file or the checked technical report. It now checks 181 claims (14 new ones for the condensed text) and finds 0 missing and 0 orphans. A new test fails if the manuscript grows past 7,500 words again, so the next detail lands in the supplement.

## What's still open

We haven't checked whether 7,000 words fits the target journal's full-paper limit. The template and author block need the owner. On the research side, the open question is the same as before the cut: a second measured gear-pump family whose idle drag rises steeply with size. That would test the pick tables on real data instead of synthetic curves.

The details are in the programme's [research log](../../research/heavy-hydraulics/LOG.md), under milestone 7v.
