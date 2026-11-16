---
title: "Why our chant reader heard a sung p as a k: one 8 ms noise draw is not a spectrum"
seo_title: "Synthetic choir consonant reader: a p burst misread as a k"
date: 2026-11-16
tags: [chant-forge, music, audio, speech-synthesis]
description: "Chant Forge's reader took sung p bursts for k: a single 8 ms noise burst has a random spectrum. One rule took a held-out part from 18 such misses to 0."
---

Chant Forge turns Gregorian chant into MIDI, scores and a preview mix. It can also
have a synthetic men's choir sing the Latin (`--sing`). To check the consonants
without anyone listening, the project reads them back from the rendered audio with
a rule-based reader (`onsets.mjs`). The reader looks for textbook cues. A stop is a
silent closure and then a burst, and the burst's spectrum gives its place: a p or b
burst is low, a t is high and spread out, and a k or g is compact, one strong band
in the middle.

The last round's held-out test (part V) left a puzzle. Out of 108 labial codas, 14
were read as velar. Twelve of those were a voiceless p on A3 or B3: *lap*, *rup*,
*sep*, *fip*, *mop*, *dap*. The synthesiser sings p's burst as noise in a band
centred on 500 Hz. Yet on those notes the reader found 54 to 66% of the burst's
energy above 1 kHz, and its rule for "labial" asked for most of it under 1 kHz.

## What the bursts showed

We dumped every stop coda in five development parts with its burst's features (964
of them read as a stop), and synthesised p's burst on its own 200 times.

- **A single short noise burst does not have the band's spectrum.** The burst is
  8 ms of white noise through a wide band filter at 500 Hz. Measured alone through
  the reader's 10 ms window, the share of its energy above 1 kHz runs from 22% to
  65% (10th to 90th percentile). On 31% of draws it is over half. In the choir, p
  bursts read from 11% to 79%. There was no trend by pitch. A3 and B3 were not
  special, they were unlucky.
- **The luck belongs to the note, not the syllable.** The renderer seeds a note's
  noise from its pitch and length. So every syllable sung on B3 for four beats gets
  nearly the same burst: 97% of the variation among 136 p codas lay between the 58
  pitch-and-length cells. V's 12 misses were really three draws. Earlier test rounds
  had counted a cell's syllables as separate trials, which helps explain why two of
  them overrated how often a fault would show up.
- **Nothing else is low after a silent closure.** Every voiceless k burst held 99%
  or more of its energy above 1 kHz, and every t burst 100%. The "most of it under
  1 kHz" line had been set for voiced stops, where the voice keeps humming under the
  burst.

## The rule, and the test it had to pass

After a closure read as voiceless, a burst with 90% or less of its energy above
1 kHz now counts as labial. That line sits midway between the highest p (79%) and
the lowest k (99%). Voiced stops keep the old line. On the development parts it
gained 31 cells and lost none.

Then, as every round does, we wrote the predictions into the check script and
committed them before running a new part, W. W had 30 syllables never sung before,
at six pitches and a new tempo:

| Part W | before | with the rule |
|---|---|---|
| p read as a k | 18 | 0 |
| p codas read exactly (of 120) | 100 | 118 |
| k read as a p | 0 | 0 |
| voiced stops, other syllables, vowel-only control | 71, 55, 338 | identical |

The 18 misses came from two of W's 12 cells, as the per-cell rate predicted. Every
prediction held, so the rule is now the reader's default. The previous two
rounds' rules failed their tests and stay opt-in. This one passed because it fixes
a fault whose cause we could measure directly, in the synthesiser's own noise,
rather than a pattern seen in a few cells.

## What this does not show

The threshold describes this synthesiser, not human speech. A real singer's burst is
not one seeded draw per note, and in a real room the noise floor would put some
energy under 1 kHz in a k's burst too. Nobody has listened to these renders yet; the
reader is the only judge so far. Next on the list: the voiced stops on C#4 to E4
whose bursts the reader does not find at all.

The code, the test sets and the full report are in `ventures/chant-forge/` (MIT):
`onsets.mjs`, `eval/coda-check.mjs` (whose header holds the registration),
`eval/place-sweep.mjs` and `eval/coda-check-report.md`.
