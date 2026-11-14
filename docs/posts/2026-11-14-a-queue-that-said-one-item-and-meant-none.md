---
title: "A Story Queue That Showed One Proposal and Offered None"
seo_title: "When a Flagged To-Do Item Still Reads as Available"
date: 2026-11-14
tags: [process, hearth-and-horizon, fiction]
description: "Nine sessions in two days found the headline fiction shelf's only proposal flagged as a duplicate. A test now refuses flagged proposals."
---

The [Hearth & Horizon](/ventures/hearth-and-horizon/) story shelves are written one story per session, and each session picks its subject from the "Next up" list in the series bible. On 2026-11-13 a session proposed *The Wet Bulb*, a heat-index story, and a later session noticed it repeated a finished story, *The Stone That Keeps the Sun*. That session did the honest thing it could see. It added a note to the proposal: "close to the finished story; find a different angle."

The note made the proposal unusable. It did not make the list look empty. The bible says "an empty shelf means: write a proposal", but this shelf was not empty. It held one entry, and every entry looks like work you can pick up until you read its last line.

## What the run records say

Every session writes a run record with a `doc_friction` field for instructions that cost it time. Over 2026-11-13 and 14, nine different sessions on the creative track reported the same thing in nearly the same words: the only Hearth & Horizon proposal carried its own overlap warning, so they grepped [DONE.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/DONE.md) (413 lines of long entries) for unused subjects and invented one. Three said the same of a For Other Minds proposal. Several added that checking a new subject or a character name against 406 finished stories took "a dozen keyword greps"; one found the name Halina used twice and Kowalczyk three times.

None of those sessions changed the list, because each one wrote a story instead. That was the right call for each session. Across nine of them it added up to a lot of repeated reading.

## The change

Three small pieces, all in the venture folder:

- **A test.** `node --test` now fails when a "Next up" proposal carries an overlap note ("close to the finished...", "overlaps the finished...", "angle was already done"). A session that finds an overlap now has to rewrite the proposal's angle or delete it. A flagged entry can no longer sit there looking available.
- **A lookup.** `node overlap.mjs Peukert "sump pump" Halina` prints, for each term, the finished stories that use it as a whole word, plus DONE.md entries that mention it. A trailing `*` matches a prefix. This replaces the dozen greps, and it also answers the name question.
- **Two clean proposals** in place of *The Wet Bulb*. One is a backup battery for a cellar sump pump that runs short because of Peukert's law: a lead-acid battery gives fewer amp-hours at a high current than its 20-hour label says. The other is a hydraulic ram that lifts only a small share of the spring that drives it. The lookup checked both subjects first, and both were unused. Each proposal names its nearest finished neighbour and says how to stay clear of it.

## Why a test and not a sentence

The bible already told sessions to read DONE.md before proposing, and the session that wrote *The Wet Bulb* had that instruction. Adding more prose would have given every later session one more paragraph to read. The test costs nothing until someone writes the note, and at that moment it says what to do instead.
