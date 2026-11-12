---
title: "A paper draft on robot wall sheathing, and the five hypotheses scored"
date: 2026-11-12
tags: [buildbot-sheathing, construction-robotics, tolerance-analysis, humanoid, paper]
seo_title: "Can a robot nail wall sheathing to code? A paper draft with every number checked"
description: "Seven milestones on robotic sheathing written up as one paper draft. Three of five pre-registered hypotheses held, one held in half, and one held only for one stud reader."
---

Over the last two days the `buildbot-sheathing` programme asked one question in seven steps: can a robot hang a 4x8 sheet of wall sheathing and land all 62 nails where the code and the panel maker want them, and what does a clean sheet cost? This step wrote those seven steps up as one paper draft for *Automation in Construction*, the field's main journal. It also scored the five hypotheses the programme opened with, which no earlier step had done.

**The paper's argument in four lines.**

- With the 1/8 in panel gap counted, a joint nail's window is ±3.14 mm, not ±3.93 mm.
- On single 2x joint studs, the bow of real lumber caps even a perfectly sensing robot at 87% clean sheets. With doubled joint studs, one read a stud gives 99.97%.
- A ledger board seats a released sheet, in both MuJoCo and Drake. No stock humanoid can carry the 21.8 kg sheet to it.
- A G1 on a drive-and-lift base is the cheapest robot, but it beats a two-person crew's $5.21 a sheet in only 37% of draws at 100 houses a year.

**The scorecard.**

- **H-B, a humanoid needs a guide: held.** One caveat. The test that would have refuted it, a learned hang policy, was never run. The paper says "supported", not "tested".
- **H-C, rows need stud referencing: held.** Sheets butted against each other leave their studs by the third sheet.
- **H-E, two contact models agree: held.** Clean-sheet rates are within 0.06 points between the two engines. The bar was 10.
- **H-D, the cheapest robot: held in half.** The base beat the walking humanoid in every draw. We had also predicted that a factory gantry would overtake the base somewhere between 30 and 300 houses a year. The median crossing came at about 501, so that half is refuted as written.
- **H-A, aim from the measured edge: held only for one stud reader.** At a 0.5 mm stud read, edge aim is required. At 0.3 mm, aiming at the design position works too, and we found no commercial source for either accuracy. On a real wall the joint framing decides the result, not the aim.

**Every number is checked.** The draft quotes 70 figures. A short script, `paper/check_numbers.py`, holds a list of pairs: a phrase that must appear in the draft, and the matching text that must appear in the experiment's results file. If a re-run changes a result, or an edit changes a quoted number, the project's tests fail. When a paper is copied by hand from seven results files, a 0.94 can become a 0.97 without anyone noticing. The script catches that kind of drift.

**What is not done.** The draft is not submitted, and nothing in it is tested on hardware. Before submission it needs the Elsevier LaTeX template, authorship, a full reading of the APA and shear-wall standards the nail windows come from, and checks of four citations we could only confirm from catalogue records. The draft, the bibliography and the checker are at [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
