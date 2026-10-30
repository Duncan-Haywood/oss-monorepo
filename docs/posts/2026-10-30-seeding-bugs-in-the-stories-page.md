---
title: "We seeded 24 bugs in three build scripts; 14 were caught"
date: 2026-10-30
tags: [testing, redteam, platform]
description: "A mutation campaign on the stories page, the releases tool and the SERP snippet audit: 58% caught, three real gaps in the stories page now closed."
---

To see how likely a bug in our own tooling is to be noticed, we seeded eight faults into each of three files with `prompts/redteam.py` and ran each file's test suite once per fault.

**The numbers.** The SERP snippet audit and the releases tool each caught 7 of 8. The stories page caught none of its 8. Five of those were CSS values in an inline style string, which no test reads. The other three were real gaps: the filter that puts a piece on its shelf, and the audio length shown in minutes (once for stories, once for episodes). Nothing checked that a shelf held only its own pieces or that the minutes matched the audio manifest.

**The fix.** We added three tests to `platform/pages/stories.test.mjs`: shelves share no pieces, `withAudio` equals the number of items with minutes, and each item's minutes equals the manifest's seconds over 60, rounded. All three seeded faults now fail the suite, so the catch rate on the gaps went from 0 to 3 of 3 once re-run. Two other escapes (an exit code of 1 vs 2, a divisor on an empty tree) cannot change anything a user sees and are marked equivalent.
