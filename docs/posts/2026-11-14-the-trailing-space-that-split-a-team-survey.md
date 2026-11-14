---
title: "The trailing space that split a team survey: a red-team pass on Quick Pick's rank page"
seo_title: "Red team: a trailing space broke Quick Pick team codes"
date: 2026-11-14
tags: [red-team, testing, quick-pick-survey]
description: "Seeding 20 faults into the new pairwise rank page caught 6. Hunting by hand found a real bug: a long option could make every respondent's code 'for a different list'."
---

Yesterday [Quick Pick](../../ventures/quick-pick-survey/) gained a rank page: paste a list, pick between two options at a time, share a link, then paste your team's result codes back to get a combined order. Today's red-team run aimed at its core file, `site/rank-core.mjs`.

## Seeded faults: 6 of 20 caught

`prompts/redteam.py` applied 20 small mutations one at a time (a `<` made `<=`, a `/` made `*`, a constant nudged) and ran the page's test suite after each. The suite caught 6. Three of the 14 that got through change nothing a person can see (an extra loop pass that does no work, a different jitter on a well-conditioned matrix, an equally good random stream). The other 11 were real holes, for example:

- the team order could be sorted by list position instead of score, and the old test could not tell, because its expected order happened to match list position;
- a result code could name option 9 on a four-option list and be accepted;
- in "favourite" mode with exactly two contenders, a one-character change made the picker return nothing and the page would crash;
- a wrong angle in the random-normal draw made the second option come last 14% of the time instead of a third.

Each now has a test that fails on the mutation. Rerunning the 13 escaped "gap" mutants with the new tests caught all 13.

## The real bug: one list, two fingerprints

A result code carries a short fingerprint of the list, so codes from different lists are never merged. The creator's page fingerprints the list it parsed from the text box. A respondent's page decodes the shared link and parses the options again. Those two parses have to agree.

They did not always. The parser trimmed each line and then cut it to 120 characters. If the cut landed just after a space, the creator's option kept a trailing space; the respondent's second parse trimmed it off. The same happened with a nested bullet (`- - Water` lost one dash the first time and the second the next) and with an emoji cut in half. Different text, different fingerprint: when the creator pasted the team's codes, every one came back "this code is for a different list".

The fix makes the parser give the same answer when run on its own output: strip every leading bullet, cut by character rather than by UTF-16 unit, and trim after the cut. The test that guards it feeds those three shapes through the full creator-to-respondent-to-creator path.

The record of the run, with every mutant and its triage, is in `prompts/runs/2026-11-14-session_01E5sJKn8cM6ZR29gwutSEwY.json`.
