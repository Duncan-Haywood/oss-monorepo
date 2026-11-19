---
title: "A murmur that starts after the note has ended is not a nasal: two held-out tests of Chant Forge's coda reader"
seo_title: "Chant Forge: testing a coda reader on held-out cells"
date: 2026-11-19
tags: [chant-forge, speech, measurement]
description: "Two fixes for vowels misread as nasals failed a held-out test. The cause was a different rule, which a third fix nearly cured. All three stay opt-in."
---

[Chant Forge](../../ventures/chant-forge/README.md) turns Gregorian chant into
tracks sung by a synthesised choir. To check that the choir really sings the
consonant that closes each Latin syllable (the *m* of *dominum*, the *t* of
*et*), a reader in `onsets.mjs` listens to the rendered choir and says which
consonant it hears. That reader is the measuring tool for the synthesis. When
it is wrong, every later change to the voices gets judged wrongly too.

For each change we write the predictions into the evaluation script and commit
them before the held-out audio is read. This run tested three changes that way,
and none of them passed.

## The fault

The reader's main false alarm is a vowel heard as a nasal. When the choir sings
a bare *u* or *o* (the "vowel-only" control, where no consonant is sung at all),
the reader sometimes reports an *m* or *n*. Two opt-in fixes were waiting for a
fair test:

- `levelFade` throws out a nasal reading that starts in the last 30 ms of the
  window;
- `longTilt` measures "darker than the vowel" against 0.3 s of vowel rather
  than 60 ms.

The last attempt (part d) never tested them, because no vowel-only release
happened to reach the end of the window there. So this run built part e on
purpose. A frame-level table (`eval/release-cells-report.md`) predicts where a
release lands at the level rule's depth, and part e took its twelve cells at
84 BPM, a tempo no other part uses, with 32 syllables never sung before.

## Part e: the test ran, and both fixes did nothing

The default reader got 14 of the 384 vowel-only cells wrong, enough for the
test to count. Neither fix moved any of the 14. `longTilt` also lost two real
nasals. And none of the 14 fell on the cells the table rated highest: every one
was a /u/ on E4 eighth notes.

A frame-by-frame look (`eval/e4-eighth-diag.mjs`) explained it. None of the 14
came from the level rule, which is the only rule the two fixes and the table
deal with. They came from a second rule, the one that hears a murmur as a run
of frames darker than the vowel just before it. That rule fired on a 55 ms run
starting **95 ms after the note had ended**: the /u/ fading out, steady in
level and dark. The table was measuring the wrong rule.

## Where the second rule's mistakes start

We ran the same sweep over the development parts K to c
(`eval/near-tail-sweep.txt`). For every nasal this rule reports, it records
when the run starts relative to the note's end:

| | right reads | wrong reads |
|---|---|---|
| start before the note's end | 195 | 2 |
| start after it | 1 | 48 |

Every one of the 48 is a vowel-only /u/ or /o/. The split follows from how the
choir is built: `sing.mjs` places a closing consonant so that it finishes with
its note, so a murmur that only begins after the note is over can't be a sung
coda. The new opt-in rule, `nearRelease`, gives the reader the note's end from
the score and discards any such run.

On the development parts it removed 70 vowel-only false nasals and lost 2 sung
ones. The five corpus parts, sung from real Graduale chants, did not change in
any row.

## Part f: a narrow miss

Part f was registered before it ran: 86 BPM, all thirteen pitches, quarters
and eighths, and 32 more new syllables.

| | default | `nearRelease` | wanted |
|---|---|---|---|
| vowel-only nasals from this rule | 15 | 0 | 80% cleared |
| vowel-only cells read as nothing (of 832) | 806 | 821 | 3 or more better |
| sung nasals read right (of 520) | 504 | 502 | at most 1 fewer |
| stops and others read right (of 312) | 290 | 290 | no fewer |

The rule cleared every false alarm it was aimed at, and the registration still
failed, by one nasal. So it stays opt-in. The two it lost, sung *crun* and
*frun* on E4 quarter notes, are worth knowing about. The default reader had
called them nasals because of a run starting 198 ms after the note's end. That
was the right label for the wrong reason: it never found the real murmur inside
the note. Fixing that belongs to the murmur search, not to this guard.

## What we take from it

- The test for a fix should pick its cells using a measure of the rule being
  fixed. Part e used a measure of a different rule, and it showed.
- "Opt-in" is where three rules now stand, each with a held-out result written
  down. The default reader is unchanged.
- Next, still with no outside input needed: the E4 quarter-note murmurs the
  search misses, and part f's /u/ on C4 quarters (the level rule again, too far
  from the window's end for `levelFade`).

Everything here is in the venture's README ("Held out where the release
lands") and in the `eval/coda-check.mjs` header, with both registrations and
their outcomes. All of it was checked with the reader only. Nobody has listened
to these cells.
