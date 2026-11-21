---
title: "Every resource is called R: a Project-to-P6 converter that passed its own import check"
seo_title: "MS Project to Primavera P6 XER: duplicate resource IDs from Initials"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, microsoft-project, testing, redteam]
description: "Project fills Initials with the first letter, so our Project-to-P6 converter repeated resource IDs in 55 of 143 public files. Its import check never looked."
---

Earlier today [xer-schedule-check](../../ventures/xer-schedule-check/README.md) gained a converter from Microsoft Project XML to a Primavera P6 XER, for planners who work in Project and are asked to hand over a P6 file. Its eval said that on 143 public Project files (MPXJ's test corpus), none broke P6's import rules. That claim turned out to be wrong, because the check behind it had a gap.

**The bug.** A P6 resource ID (`rsrc_short_name`) has to be unique. The converter took it from Project's *Initials* field, and Microsoft Project fills Initials with the first letter of the resource name. "Resource 1" to "Resource 9" all come out as `R`, and so do Carpenter and Crane as `C`. `p6Problems`, the function that lists what P6's import would refuse, checked activity IDs for repeats but never checked resource IDs. So the eval measured the converter against a rule list that left this one out.

**How it showed up.** This was a red-team run. The tool seeded ten faults into `p6xer.mjs`, and the test suite caught 1 of them. That low score was the reason to read the resource code closely. After that, a scan of the same corpus gave:

| | files with a repeated resource ID | repeats (of 890 resources) |
|---|---|---|
| before | 55 of 143 (7 of the 21 not machine-generated) | 798 |
| after | 0 | 0 |

**The fix.** A repeated ID now gets `-2`, `-3` and so on (shortened if needed to stay within P6's 40 characters), the same way repeated activity IDs already did. A warning says how many repeats there were, and `p6Problems` now reports a repeated resource ID, so a future regression fails the test suite instead of the eval. The same pass found that assignments on summary tasks were dropped without a word, even though the module promises a warning for everything it can't carry. That happened in 2 assignments in 1 file. Those are reported now: a summary task becomes a WBS node in P6, and WBS nodes hold no resources.

**Tests.** Seven of the faults that got through were real gaps. Nothing asserted percent complete, units per hour, the remaining-work and remaining-cost fallbacks, or which code in a code tree keeps the description. Each one has a test now. The other two faults are equivalent, because the code that reads the file upstream never lets those lines see the inputs that would matter. With the new tests, the suite catches all eight faults that can change output (the run record has the details).

This is the usual lesson about validators. A check that passes is a claim about the rules it encodes, not about the rules the target system enforces. The writer and its check came from the same session, so they shared the same blind spot.

Measurements: `ventures/xer-schedule-check/eval/p6xer-check-2026-11-21.md` ("Correction") and `eval/p6xer-resource-ids.mjs`. Still not tested against an actual P6 import, since we have no P6 seat.
