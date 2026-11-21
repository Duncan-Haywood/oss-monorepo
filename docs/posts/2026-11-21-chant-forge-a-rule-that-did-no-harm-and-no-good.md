---
title: "A loosened rule did no harm on held-out chant and fixed nothing either"
date: 2026-11-21
tags: [chant-forge, audio, measurement]
description: "Chant Forge's coda reader missed an n sung inside an E4 note. A looser hold took back 7 development cells, then gained nothing on a fresh held-out part."
---

[Chant Forge](../../ventures/chant-forge/README.md) turns Gregorian chant into
tracks sung by a synthesised choir. To check that the choir really sings the
consonant at the end of each syllable (the *m* of *dominum*, the *n* of *non*),
a reader in `onsets.mjs` listens to the rendered audio and says what it hears.
It never looks at the synthesiser's settings. Every change to that reader is
tried on development parts first, then registered with written predictions
and committed before it runs on a part it has never seen.

This run's change failed that test. Here is what it was and what the failure
showed.

## The missing n

On the last held-out part, sung *crun* and *frun* on E4 quarter notes came out
right by default, but for the wrong reason: the reader found a "murmur" 198 ms
after the note had ended. That was the vowel fading, not the n. Once a guard
threw out murmurs that start after the note, both read as nothing.

A new diagnostic, `eval/e4-quarter-diag.mjs`, prints every 5 ms frame of the
note's end. The n is plain to see in it. In the note's last 70 ms the band above
1 kHz drops 25-30 dB within 15 ms and stays at least 18 dB under the vowel. The
vowel-only take of the same note never gets that band 20 dB under.

Three nasal rules each missed it by a little:

- the level rule wants the murmur 5 dB quieter than the vowel, and this one is
  just as loud;
- the near rule measures against the vowel 25-45 ms earlier, which sits in the
  dip of the vowel closing into the n, and the murmur is 1 dB louder than that
  dip;
- the lip-closure rule wants the band above 1 kHz to hold within 6 dB for 30 ms.
  With five slightly detuned voices beating, it swings by 8.

## The try, and the held-out result

The smallest change that admits the cell is a hold of 8 dB, not 6. On every
development part it took back 7 cells and lost none. Every vowel-only control
stayed the same. Then came part g: 32 syllables never sung before, 13 pitches,
quarters and eighths, at a tempo no other part uses. The registration was
committed as b65b403b3 before g was run.

| part g | default | hold 8 dB |
|---|---|---|
| nasals after /u/ or /o/ (of 312) | 301 | 301 |
| n-clusters read as their nasal (of 104) | 102 | 103 |
| stops and others read as a nasal | 0 | 0 |
| vowel-only control read as none (of 832) | 832 | 832 |

The prediction that mattered was at least one more dark-vowel nasal, and it
failed. The rule did no harm, but g didn't contain the shape it was written for.
So the reader keeps its 6 dB hold.

## What the failure pointed at

Reading g's own misses at E4 gave two other shapes. Sung *flun* has a clean,
flat lip closure that the lip rule turns away for being 2-5 dB louder than the
vowel 25-45 ms earlier. That window falls in the closing dip again, the same
thing that beat the near rule on *crun*. So the shared fault is where the
reference is taken, not how much the murmur wobbles. The next rule to try takes
the level reference from before the transition into the consonant. In *sprun*
and *strun* the n is not dark at all, which traces back to the synthesiser's
timing after a cluster onset, a fault found two rounds ago.

All of this is synthesised audio read by a program. Nobody has listened to it
yet. The full tables are in the [README](../../ventures/chant-forge/README.md),
"The murmur inside an E4 quarter", and in `eval/hihold-sweep.md`.
